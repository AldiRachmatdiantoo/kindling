package wins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

// A physical or soul win is a roadmap: ordered steps toward the activity, where floor_step is
// the step that counts as showing up. completed is derived (steps_done >= floor_step), so a
// day with some steps done but not the floor reads as "started" in the history, never as a win.

const auditEndpointSplitStep = "POST /wins/{date}/steps/split"

// IsRoadmap reports whether the win is a roadmap with a floor step; older rows and recalibrated
// wins are not, and keep the plain done toggle.
func (w WinItem) IsRoadmap() bool {
	return w.FloorStep > 0 && w.FloorStep <= len(w.Steps)
}

// setStepsDone records progress and derives completed from the floor step.
func (w *WinItem) setStepsDone(n int) {
	w.StepsDone = n
	w.Completed = n >= w.FloorStep
}

// roadmapItem returns the pillar's win for a roadmap request (physical or soul only).
func (d *WinsData) roadmapItem(pillar string) (*WinItem, *shared.AppError) {
	var item *WinItem
	switch pillar {
	case PillarPhysical:
		item = &d.Physical
	case PillarSoul:
		item = &d.Soul
	default:
		return nil, invalidRoadmapPillar()
	}
	if !item.IsRoadmap() {
		return nil, shared.ErrValidation("This win has no steps to follow", map[string]any{
			"pillar": "has no roadmap",
		})
	}
	return item, nil
}

func invalidRoadmapPillar() *shared.AppError {
	return shared.ErrValidation("Invalid roadmap input", map[string]any{
		"pillar": "must be one of: physical, soul",
	})
}

func validRoadmapPillar(p string) (string, *shared.AppError) {
	p = strings.TrimSpace(p)
	if p != PillarPhysical && p != PillarSoul {
		return "", invalidRoadmapPillar()
	}
	return p, nil
}

// StepProgressRequest is the payload for PATCH /api/v1/wins/{date}/progress.
type StepProgressRequest struct {
	Pillar    string `json:"pillar"`
	StepsDone *int   `json:"steps_done"`
}

// Validate checks the pillar and that steps_done is present and not negative. The upper bound
// depends on the roadmap and is checked under the row lock.
func (r StepProgressRequest) Validate() (string, int, *shared.AppError) {
	pillar, err := validRoadmapPillar(r.Pillar)
	if err != nil {
		return "", 0, err
	}
	if r.StepsDone == nil || *r.StepsDone < 0 {
		return "", 0, shared.ErrValidation("Invalid roadmap input", map[string]any{
			"steps_done": "is required and must be 0 or more",
		})
	}
	return pillar, *r.StepsDone, nil
}

// StepProgressResponse returns the pillar's progress and the day's win count.
type StepProgressResponse struct {
	Pillar             string `json:"pillar"`
	StepsDone          int    `json:"steps_done"`
	Completed          bool   `json:"completed"`
	WinsCompletedCount int    `json:"wins_completed_count"`
}

// SplitStepRequest is the payload for POST /api/v1/wins/{date}/steps/split. step is the
// 0-based index of the step to split, which must be the current one (steps_done).
type SplitStepRequest struct {
	Pillar string `json:"pillar"`
	Step   *int   `json:"step"`
}

// Validate checks the pillar and that step is present.
func (r SplitStepRequest) Validate() (string, int, *shared.AppError) {
	pillar, err := validRoadmapPillar(r.Pillar)
	if err != nil {
		return "", 0, err
	}
	if r.Step == nil || *r.Step < 0 {
		return "", 0, shared.ErrValidation("Invalid roadmap input", map[string]any{
			"step": "is required and must be 0 or more",
		})
	}
	return pillar, *r.Step, nil
}

// SplitStepResponse returns the pillar's roadmap after the split.
type SplitStepResponse struct {
	Pillar    string   `json:"pillar"`
	Steps     []string `json:"steps"`
	FloorStep int      `json:"floor_step"`
	StepsDone int      `json:"steps_done"`
	AINote    string   `json:"ai_note,omitempty"`
}

func errStepMoved() *shared.AppError {
	return shared.ErrValidation("That step is no longer the current one", map[string]any{
		"step": "must be the current step",
	})
}

func errRoadmapFull() *shared.AppError {
	return shared.ErrValidation("These steps are already as small as they get", map[string]any{
		"step": fmt.Sprintf("a roadmap has at most %d steps", ai.MaxRoadmapSteps),
	})
}

// checkSplit reports whether step can be split in this roadmap right now.
func checkSplit(item *WinItem, step int) *shared.AppError {
	if step != item.StepsDone || step >= len(item.Steps) {
		return errStepMoved()
	}
	if len(item.Steps) >= ai.MaxRoadmapSteps {
		return errRoadmapFull()
	}
	return nil
}

// splitInto replaces step with first and second. When the split step is the floor or comes
// before it, the floor moves with it, so showing up still means reaching the same place (the
// second half finishes the original step): the habit stays the goal, only the way there shrinks.
func splitInto(item *WinItem, step int, first, second string) {
	steps := make([]string, 0, len(item.Steps)+1)
	steps = append(steps, item.Steps[:step]...)
	steps = append(steps, first, second)
	steps = append(steps, item.Steps[step+1:]...)
	item.Steps = steps
	if step+1 <= item.FloorStep {
		item.FloorStep++
	}
}

// SetStepProgress records how many roadmap steps are done; completed follows the floor step.
func (s *Service) SetStepProgress(ctx context.Context, userID uuid.UUID, dateStr string, req StepProgressRequest) (StepProgressResponse, error) {
	pillar, stepsDone, valErr := req.Validate()
	if valErr != nil {
		return StepProgressResponse{}, valErr
	}
	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return StepProgressResponse{}, err
	}
	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return StepProgressResponse{}, err
	}
	return s.repo.SetStepProgress(ctx, userID, parsedDate, pillar, stepsDone)
}

// SplitStep breaks the current roadmap step into 2 smaller ones. Same lock-free shape as
// Recalibrate: read, call the AI outside any transaction, then write under FOR UPDATE.
func (s *Service) SplitStep(ctx context.Context, userID uuid.UUID, dateStr string, req SplitStepRequest) (SplitStepResponse, error) {
	pillar, step, valErr := req.Validate()
	if valErr != nil {
		return SplitStepResponse{}, valErr
	}
	tz, err := s.repo.GetUserTimezone(ctx, userID)
	if err != nil {
		return SplitStepResponse{}, err
	}
	parsedDate, err := shared.ValidateMutationDate(strings.TrimSpace(dateStr), tz, s.now())
	if err != nil {
		return SplitStepResponse{}, err
	}

	snap, err := s.repo.GetDailyWins(ctx, userID, parsedDate)
	if err != nil {
		return SplitStepResponse{}, err
	}
	item, appErr := snap.WinsData.roadmapItem(pillar)
	if appErr != nil {
		return SplitStepResponse{}, appErr
	}
	if appErr := checkSplit(item, step); appErr != nil {
		return SplitStepResponse{}, appErr
	}
	current := item.Steps[step]

	start := time.Now()
	var (
		out   ai.SplitStepOutput
		aiErr error
	)
	allowed, aiNote := s.takeAI(ctx, userID, parsedDate)
	if !allowed {
		aiErr = errDailyAILimit
	} else {
		out, aiErr = s.aiProvider.SplitStep(ctx, ai.SplitStepInput{
			CalibrationTier: snap.CalibrationTier,
			Pillar:          pillar,
			WinTitle:        item.Title,
			Step:            current,
		})
		if aiErr == nil {
			aiErr = ai.ValidateSplitStepOutput(out)
		}
	}
	latencyMs := clampLatencyMs(time.Since(start))

	isFallback := false
	if aiErr != nil {
		isFallback = true
		if aiNote == "" {
			aiNote = shared.AINoteUnavailable
		}
		out = ai.SplitStepTemplate(current)
		if s.logger != nil {
			// NFR-06: never log user text or LLM output.
			s.logger.Warn("ai split step failed; using deterministic fallback",
				"request_id", shared.RequestIDFromContext(ctx),
				"pillar", pillar,
				"latency_ms", latencyMs,
				"err", aiErr,
			)
		}
	}
	s.recordAuditLog(ctx, userID, auditEndpointSplitStep, latencyMs, isFallback)

	resp, err := s.repo.ApplyStepSplit(ctx, userID, parsedDate, pillar, step, current,
		strings.TrimSpace(out.First), strings.TrimSpace(out.Second))
	if err != nil {
		return SplitStepResponse{}, err
	}
	resp.AINote = aiNote
	return resp, nil
}

// mutateWins locks the day's row, lets fn change wins_data, then writes it back with the
// recomputed wins_completed_count, which it returns.
func (r *PostgresRepository) mutateWins(ctx context.Context, userID uuid.UUID, logDate time.Time, fn func(*WinsData) error) (int16, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var count int16
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyWinsForUpdate(dbCtx, sqlc.GetDailyWinsForUpdateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("lock daily wins: %w", err)
		}
		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}
		if err := fn(&winsData); err != nil {
			return err
		}
		updatedJSON, err := json.Marshal(winsData)
		if err != nil {
			return fmt.Errorf("marshal wins_data: %w", err)
		}
		updated, err := q.UpdateDailyWins(dbCtx, sqlc.UpdateDailyWinsParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			WinsData:           updatedJSON,
			WinsCompletedCount: winsData.CountCompleted(),
		})
		if err != nil {
			return fmt.Errorf("update daily wins: %w", err)
		}
		count = updated.WinsCompletedCount
		return nil
	})
	return count, err
}

// SetStepProgress writes steps_done (0..len(steps)) under FOR UPDATE.
func (r *PostgresRepository) SetStepProgress(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, stepsDone int) (StepProgressResponse, error) {
	var resp StepProgressResponse
	count, err := r.mutateWins(ctx, userID, logDate, func(d *WinsData) error {
		item, appErr := d.roadmapItem(pillar)
		if appErr != nil {
			return appErr
		}
		if stepsDone > len(item.Steps) {
			return shared.ErrValidation("Invalid roadmap input", map[string]any{
				"steps_done": fmt.Sprintf("must be at most %d", len(item.Steps)),
			})
		}
		item.setStepsDone(stepsDone)
		resp = StepProgressResponse{Pillar: pillar, StepsDone: stepsDone, Completed: item.Completed}
		return nil
	})
	if err != nil {
		return StepProgressResponse{}, err
	}
	resp.WinsCompletedCount = int(count)
	return resp, nil
}

// ApplyStepSplit writes the split under FOR UPDATE, refusing if the roadmap moved on meanwhile.
func (r *PostgresRepository) ApplyStepSplit(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, step int, expected, first, second string) (SplitStepResponse, error) {
	var resp SplitStepResponse
	_, err := r.mutateWins(ctx, userID, logDate, func(d *WinsData) error {
		item, appErr := d.roadmapItem(pillar)
		if appErr != nil {
			return appErr
		}
		if appErr := checkSplit(item, step); appErr != nil {
			return appErr
		}
		if item.Steps[step] != expected {
			return shared.ErrConcurrentModification()
		}
		splitInto(item, step, first, second)
		resp = SplitStepResponse{
			Pillar:    pillar,
			Steps:     append([]string(nil), item.Steps...),
			FloorStep: item.FloorStep,
			StepsDone: item.StepsDone,
		}
		return nil
	})
	if err != nil {
		return SplitStepResponse{}, err
	}
	return resp, nil
}
