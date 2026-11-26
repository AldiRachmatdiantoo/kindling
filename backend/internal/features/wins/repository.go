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
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const dbQueryTimeout = 3 * time.Second

// DailyWinsSnapshot holds the unlocked snapshot of a day's wins read in Step 1 (PRD §8.3).
type DailyWinsSnapshot struct {
	CalibrationTier    ai.CalibrationTier
	WinsData           WinsData
	WinsCompletedCount int16
}

// Repository defines the persistence boundary for the wins feature.
type Repository interface {
	GetUserTimezone(ctx context.Context, userID uuid.UUID) (string, error)
	GetDailyWins(ctx context.Context, userID uuid.UUID, logDate time.Time) (DailyWinsSnapshot, error)
	SaveSlicedTask(ctx context.Context, userID uuid.UUID, logDate time.Time, mainTask, microStep string, durationSeconds, stepsDone int) error
	ApplyRecalibration(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, expectedLevel int, newTitle string, durationSeconds *int) (RecalibrateResponse, error)
	ToggleWin(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, completed bool) (ToggleWinResponse, error)
	InsertAiAuditLog(ctx context.Context, arg sqlc.InsertAiAuditLogParams) error
}

// PostgresRepository implements Repository using pgxpool + sqlc with mandatory RLS via WithUserTx.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) GetUserTimezone(ctx context.Context, userID uuid.UUID) (string, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	user, err := sqlc.New(r.pool).GetUserByID(dbCtx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", shared.ErrUnauthenticated("User session is no longer valid")
		}
		return "", fmt.Errorf("get user timezone: %w", err)
	}
	return user.Timezone, nil
}

// GetDailyWins reads calibration_tier and wins_data without locking inside database.WithUserTx (PRD §5.3 & §8.3 step 1).
func (r *PostgresRepository) GetDailyWins(ctx context.Context, userID uuid.UUID, logDate time.Time) (DailyWinsSnapshot, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var snap DailyWinsSnapshot
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyWinsByDate(dbCtx, sqlc.GetDailyWinsByDateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("get daily wins: %w", err)
		}

		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}

		snap = DailyWinsSnapshot{
			CalibrationTier:    ai.CalibrationTier(row.CalibrationTier),
			WinsData:           winsData,
			WinsCompletedCount: row.WinsCompletedCount,
		}
		return nil
	})
	if err != nil {
		return DailyWinsSnapshot{}, err
	}
	return snap, nil
}

// SaveSlicedTask writes main_task, micro_step, and duration_seconds into wins_data.work inside a FOR UPDATE transaction.
func (r *PostgresRepository) SaveSlicedTask(ctx context.Context, userID uuid.UUID, logDate time.Time, mainTask, microStep string, durationSeconds, stepsDone int) error {
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
			return fmt.Errorf("lock daily wins for slice-task: %w", err)
		}

		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}

		mt := mainTask
		ms := microStep
		dur := durationSeconds
		winsData.Work.MainTask = &mt
		winsData.Work.MicroStep = &ms
		winsData.Work.DurationSeconds = &dur
		winsData.Work.StepsDone = stepsDone

		updatedJSON, err := json.Marshal(winsData)
		if err != nil {
			return fmt.Errorf("marshal wins_data: %w", err)
		}

		_, err = q.UpdateDailyWins(dbCtx, sqlc.UpdateDailyWinsParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			WinsData:           updatedJSON,
			WinsCompletedCount: winsData.CountCompleted(),
		})
		if err != nil {
			return fmt.Errorf("update sliced task: %w", err)
		}
		return nil
	})
}

// ApplyRecalibration executes Step 3 of PRD §8.3:
// locks the daily_logs row with SELECT ... FOR UPDATE inside WithUserTx, verifies the pillar's level
// matches expectedLevel (returning 409 CONCURRENT_MODIFICATION if changed), writes the new target,
// increments level, resets completed=false, and recomputes wins_completed_count in the same UPDATE.
func (r *PostgresRepository) ApplyRecalibration(
	ctx context.Context,
	userID uuid.UUID,
	logDate time.Time,
	pillar string,
	expectedLevel int,
	newTitle string,
	durationSeconds *int,
) (RecalibrateResponse, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var resp RecalibrateResponse
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyWinsForUpdate(dbCtx, sqlc.GetDailyWinsForUpdateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("lock daily wins for recalibrate: %w", err)
		}

		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}

		_, lockedLevel, isWorkMicroStep, err := winsData.PillarTarget(pillar)
		if err != nil {
			return err
		}

		if lockedLevel != expectedLevel {
			return shared.ErrConcurrentModification()
		}
		if lockedLevel >= MaxRecalibrateLevel {
			return shared.ErrMinLevelReached()
		}

		newLevel := lockedLevel + 1
		cleanTitle := strings.TrimSpace(newTitle)
		var respDuration *int

		switch pillar {
		case PillarPhysical:
			winsData.Physical.Title = cleanTitle
			winsData.Physical.Level = newLevel
			winsData.Physical.Completed = false
			winsData.Physical.WhyThis = RecalibratedWhyThis
			winsData.Physical.Steps = nil
			winsData.Physical.DurationSeconds = nil
		case PillarWork:
			winsData.Work.Level = newLevel
			winsData.Work.Completed = false
			if isWorkMicroStep {
				ms := cleanTitle
				winsData.Work.MicroStep = &ms
				if durationSeconds != nil {
					d := *durationSeconds
					winsData.Work.DurationSeconds = &d
					respDuration = &d
				} else if winsData.Work.DurationSeconds != nil {
					d := *winsData.Work.DurationSeconds
					respDuration = &d
				}
			} else {
				winsData.Work.Title = cleanTitle
				winsData.Work.WhyThis = RecalibratedWhyThis
				winsData.Work.Steps = nil
			}
		case PillarSoul:
			winsData.Soul.Title = cleanTitle
			winsData.Soul.Level = newLevel
			winsData.Soul.Completed = false
			winsData.Soul.WhyThis = RecalibratedWhyThis
			winsData.Soul.Steps = nil
			winsData.Soul.DurationSeconds = nil
		}

		updatedJSON, err := json.Marshal(winsData)
		if err != nil {
			return fmt.Errorf("marshal wins_data: %w", err)
		}

		_, err = q.UpdateDailyWins(dbCtx, sqlc.UpdateDailyWinsParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			WinsData:           updatedJSON,
			WinsCompletedCount: winsData.CountCompleted(),
		})
		if err != nil {
			return fmt.Errorf("update recalibrated win: %w", err)
		}

		resp = RecalibrateResponse{
			Pillar:          pillar,
			NewTitle:        cleanTitle,
			Level:           newLevel,
			DurationSeconds: respDuration,
		}
		return nil
	})
	if err != nil {
		return RecalibrateResponse{}, err
	}
	return resp, nil
}

// ToggleWin updates a pillar's completed flag inside a FOR UPDATE transaction and recomputes
// wins_completed_count directly from wins_data (PRD §5.1 & §7.4).
func (r *PostgresRepository) ToggleWin(ctx context.Context, userID uuid.UUID, logDate time.Time, pillar string, completed bool) (ToggleWinResponse, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var resp ToggleWinResponse
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyWinsForUpdate(dbCtx, sqlc.GetDailyWinsForUpdateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("lock daily wins for toggle: %w", err)
		}

		var winsData WinsData
		if err := json.Unmarshal(row.WinsData, &winsData); err != nil {
			return fmt.Errorf("unmarshal wins_data: %w", err)
		}

		switch pillar {
		case PillarPhysical:
			winsData.Physical.Completed = completed
		case PillarWork:
			winsData.Work.Completed = completed
		case PillarSoul:
			winsData.Soul.Completed = completed
		default:
			return shared.ErrValidation("Invalid pillar", map[string]any{
				"pillar": "must be one of: physical, work, soul",
			})
		}

		updatedJSON, err := json.Marshal(winsData)
		if err != nil {
			return fmt.Errorf("marshal wins_data: %w", err)
		}

		newCount := winsData.CountCompleted()
		updated, err := q.UpdateDailyWins(dbCtx, sqlc.UpdateDailyWinsParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			WinsData:           updatedJSON,
			WinsCompletedCount: newCount,
		})
		if err != nil {
			return fmt.Errorf("update toggled win: %w", err)
		}

		resp = ToggleWinResponse{
			Pillar:             pillar,
			Completed:          completed,
			WinsCompletedCount: int(updated.WinsCompletedCount),
		}
		return nil
	})
	if err != nil {
		return ToggleWinResponse{}, err
	}
	return resp, nil
}

// InsertAiAuditLog records metadata-only AI call telemetry (PRD NFR-06 & §5.2).
func (r *PostgresRepository) InsertAiAuditLog(ctx context.Context, arg sqlc.InsertAiAuditLogParams) error {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	if err := sqlc.New(r.pool).InsertAiAuditLog(dbCtx, arg); err != nil {
		return fmt.Errorf("insert ai audit log: %w", err)
	}
	return nil
}
