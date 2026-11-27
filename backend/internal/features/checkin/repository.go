package checkin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/features/habits"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const dbQueryTimeout = 3 * time.Second

// Repository defines the persistence boundary for the checkin feature.
type Repository interface {
	GetUserTimezone(ctx context.Context, userID uuid.UUID) (string, error)
	UpsertDailyLog(ctx context.Context, userID uuid.UUID, arg sqlc.UpsertDailyLogParams) (sqlc.DailyLog, error)
	GetDailyLogByDate(ctx context.Context, userID uuid.UUID, logDate time.Time) (sqlc.DailyLog, error)
	ChooseCopeOption(ctx context.Context, userID uuid.UUID, logDate time.Time, copeOptionID string) (string, error)
	InsertAiAuditLog(ctx context.Context, arg sqlc.InsertAiAuditLogParams) error
	GetUserHabits(ctx context.Context, userID uuid.UUID) (habits.HabitsData, error)
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

// UpsertDailyLog performs the conditional UPSERT inside database.WithUserTx (PRD §5.3 & §7.3).
// When a log already exists with wins_completed_count > 0, no row is returned → ErrCheckinLocked.
func (r *PostgresRepository) UpsertDailyLog(ctx context.Context, userID uuid.UUID, arg sqlc.UpsertDailyLogParams) (sqlc.DailyLog, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var result sqlc.DailyLog
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.UpsertDailyLog(dbCtx, arg)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrCheckinLocked()
			}
			return fmt.Errorf("upsert daily log: %w", err)
		}
		result = row
		return nil
	})
	if err != nil {
		return sqlc.DailyLog{}, err
	}
	return result, nil
}

// GetDailyLogByDate fetches a user's daily_log for logDate inside database.WithUserTx (PRD §5.3).
func (r *PostgresRepository) GetDailyLogByDate(ctx context.Context, userID uuid.UUID, logDate time.Time) (sqlc.DailyLog, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var result sqlc.DailyLog
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyLogByDate(dbCtx, sqlc.GetDailyLogByDateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("get daily log by date: %w", err)
		}
		result = row
		return nil
	})
	if err != nil {
		return sqlc.DailyLog{}, err
	}
	return result, nil
}

// ChooseCopeOption validates copeOptionID against the day's cope_options and stores its title
// inside a single database.WithUserTx transaction (PRD §5.3 & §7.3).
func (r *PostgresRepository) ChooseCopeOption(ctx context.Context, userID uuid.UUID, logDate time.Time, copeOptionID string) (string, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var chosenTitle string
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		row, err := q.GetDailyLogByDate(dbCtx, sqlc.GetDailyLogByDateParams{
			UserID:  userID,
			LogDate: pgtype.Date{Time: logDate, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("get daily log for cope: %w", err)
		}

		var options []ai.CopeOption
		if err := json.Unmarshal(row.CopeOptions, &options); err != nil {
			return fmt.Errorf("unmarshal cope options: %w", err)
		}

		matched := ""
		for _, opt := range options {
			if opt.ID == copeOptionID {
				matched = opt.Title
				break
			}
		}
		if matched == "" {
			return shared.ErrValidation("Invalid cope_option_id", map[string]any{
				"cope_option_id": "does not match any available cope option for this date",
			})
		}

		updated, err := q.UpdatePositiveCopeChosen(dbCtx, sqlc.UpdatePositiveCopeChosenParams{
			UserID:             userID,
			LogDate:            pgtype.Date{Time: logDate, Valid: true},
			PositiveCopeChosen: pgtype.Text{String: matched, Valid: true},
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return shared.ErrNotFound("Check-in log not found for this date")
			}
			return fmt.Errorf("update positive_cope_chosen: %w", err)
		}
		chosenTitle = updated.String
		return nil
	})
	if err != nil {
		return "", err
	}
	return chosenTitle, nil
}

// GetUserHabits reads the user's standing habits, which today's wins are built from.
func (r *PostgresRepository) GetUserHabits(ctx context.Context, userID uuid.UUID) (habits.HabitsData, error) {
	return habits.Load(ctx, r.pool, userID)
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
