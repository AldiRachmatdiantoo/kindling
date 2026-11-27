package wins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const (
	auditEndpointSwap = "POST /wins/{date}/swap"

	// MaxSwapActivityRunes matches the habit activity limit.
	MaxSwapActivityRunes = 120
)

// SwapWinRequest is the payload for POST /api/v1/wins/{date}/swap: trade one pillar's win for
// another activity, for today only. Work keeps its task slicer, which already does this.
type SwapWinRequest struct {
	Pillar   string `json:"pillar"`
	Activity string `json:"activity"`
}

// Validate checks the pillar (physical or soul) and the activity (1..120 characters).
func (r SwapWinRequest) Validate() (string, string, *shared.AppError) {
	pillar := strings.TrimSpace(r.Pillar)
	if pillar != PillarPhysical && pillar != PillarSoul {
		return "", "", shared.ErrValidation("Invalid swap input", map[string]any{
			"pillar": "must be one of: physical, soul",
		})
	}
	activity := strings.TrimSpace(r.Activity)
	if activity == "" {
		return "", "", shared.ErrValidation("Invalid swap input", map[string]any{
			"activity": "is required",
		})
	}
	if utf8.RuneCountInString(activity) > MaxSwapActivityRunes {
		return "", "", shared.ErrValidation("Invalid swap input", map[string]any{
			"activity": fmt.Sprintf("must be at most %d characters", MaxSwapActivityRunes),
		})
	}
	return pillar, activity, nil
}

// SwapWinResponse returns the pillar's new win.
type SwapWinResponse struct {
	Pillar string  `json:"pillar"`
	Win    WinItem `json:"win"`
	AINote string  `json:"ai_note,omitempty"`
}

// errWinAlreadyDone stops a swap of a win that is already ticked off.
func errWinAlreadyDone() *shared.AppError {
	return shared.ErrValidation("This win is already done today", map[string]any{
		"pillar": "is already completed",
	})
}

// SwapWin follows the same lock-free shape as Recalibrate: read, call the AI outside any
// transaction, then write under FOR UPDATE.
func (s *Service) SwapWin(ctx context.Context, userID uuid.UUID, dateStr string, req SwapWinRequest) (SwapWinResponse, error) {
	pillar, activity, valErr := req.Validate()
	if valErr != nil {
		return SwapWinResponse{}, valErr
	}

	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return SwapWinResponse{}, err
	}
	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return SwapWinResponse{}, err
	}

	day, err := s.repo.GetDayForSwap(ctx, userID, parsedDate)
	if err != nil {
		return SwapWinResponse{}, err
	}
	if day.Completed(pillar) {
		return SwapWinResponse{}, errWinAlreadyDone()
	}

	in := ai.PlanWinInput{
		CalibrationTier: day.CalibrationTier,
		Scores:          day.Scores,
		Pillar:          pillar,
		Activity:        activity,
	}
	start := time.Now()
	var (
		plan  ai.WinPlan
		aiErr error
	)
	allowed, aiNote := s.takeAI(ctx, userID, parsedDate)
	if !allowed {
		aiErr = errDailyAILimit
	} else {
		plan, aiErr = s.aiProvider.PlanWin(ctx, in)
		if aiErr == nil {
			aiErr = ai.ValidateWinPlan(pillar, plan)
		}
	}
	latencyMs := clampLatencyMs(time.Since(start))

	isFallback := false
	if aiErr != nil {
		isFallback = true
		if aiNote == "" {
			aiNote = shared.AINoteUnavailable
		}
		plan = ai.HabitWin(in.CalibrationTier, in.Scores, pillar, activity, "")
		if s.logger != nil {
			// NFR-06: never log user text or LLM output.
			s.logger.Warn("ai plan win failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"pillar", pillar,
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}
	s.recordAuditLog(ctx, userID, auditEndpointSwap, latencyMs, isFallback)

	duration := plan.DurationSeconds
	item := WinItem{
		Title:           strings.TrimSpace(plan.Title),
		WhyThis:         strings.TrimSpace(plan.WhyThis),
		Steps:           cleanSteps(plan.Steps),
		DurationSeconds: &duration,
		Habit:           activity,
		Swapped:         true,
	}
	if err := s.repo.ApplySwap(ctx, userID, parsedDate, pillar, item); err != nil {
		return SwapWinResponse{}, err
	}
	return SwapWinResponse{Pillar: pillar, Win: item, AINote: aiNote}, nil
}

func cleanSteps(steps []string) []string {
	out := make([]string, 0, len(steps))
	for _, st := range steps {
		if t := strings.TrimSpace(st); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// DaySnapshot is what a swap needs from the day: its tier, scores and wins.
type DaySnapshot struct {
	CalibrationTier ai.CalibrationTier
	Scores          ai.Scores
	WinsData        WinsData
}

// Completed reports whether the pillar's win is already ticked off.
func (d DaySnapshot) Completed(pillar string) bool {
	switch pillar {
	case PillarPhysical:
		return d.WinsData.Physical.Completed
	case PillarSoul:
		return d.WinsData.Soul.Completed
	default:
		return d.WinsData.Work.Completed
	}
}

// GetDayForSwap reads the day's tier, scores and wins without locking.
func (r *PostgresRepository) GetDayForSwap(ctx context.Context, userID uuid.UUID, logDate time.Time) (DaySnapshot, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var snap DaySnapshot
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyLogByDate(dbCtx, sqlc.GetDailyLogByDateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("get daily log for swap: %w", err)
		}
		if err := json.Unmarshal(row.Scores, &snap.Scores); err != nil {
			return fmt.Errorf("unmarshal scores: %w", err)
		}
		if err := json.Unmarshal(row.WinsData, &snap.WinsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}
		snap.CalibrationTier = ai.CalibrationTier(row.CalibrationTier)
		return nil
	})
	if err != nil {
		return DaySnapshot{}, err
	}
	return snap, nil
}

// ApplySwap writes the new win under FOR UPDATE, refusing if the win was ticked off meanwhile.
func (r *PostgresRepository) ApplySwap(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, item WinItem) error {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	return database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyWinsForUpdate(dbCtx, sqlc.GetDailyWinsForUpdateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("lock daily wins for swap: %w", err)
		}

		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}
		switch pillar {
		case PillarPhysical:
			if winsData.Physical.Completed {
				return errWinAlreadyDone()
			}
			winsData.Physical = item
		case PillarSoul:
			if winsData.Soul.Completed {
				return errWinAlreadyDone()
			}
			winsData.Soul = item
		default:
			return shared.ErrValidation("Invalid swap input", map[string]any{
				"pillar": "must be one of: physical, soul",
			})
		}

		updatedJSON, err := json.Marshal(winsData)
		if err != nil {
			return fmt.Errorf("marshal wins_data: %w", err)
		}
		if _, err := q.UpdateDailyWins(dbCtx, sqlc.UpdateDailyWinsParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			WinsData:           updatedJSON,
			WinsCompletedCount: winsData.CountCompleted(),
		}); err != nil {
			return fmt.Errorf("update swapped win: %w", err)
		}
		return nil
	})
}
