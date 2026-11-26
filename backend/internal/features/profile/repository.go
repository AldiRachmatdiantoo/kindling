package profile

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
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

const dbQueryTimeout = 3 * time.Second

// HeatmapData holds the raw rows fetched from daily_logs within a single WithUserTx transaction.
type HeatmapData struct {
	Days       []sqlc.GetHeatmapDaysRow
	Milestones sqlc.GetProfileMilestonesRow
}

// Repository defines the persistence boundary for the profile feature.
type Repository interface {
	GetUserTimezone(ctx context.Context, userID uuid.UUID) (string, error)
	GetHeatmapAndMilestones(ctx context.Context, userID uuid.UUID, fromDate, toDate time.Time) (HeatmapData, error)
	GetInsightDays(ctx context.Context, userID uuid.UUID, fromDate, toDate time.Time) ([]InsightDay, error)
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

// GetHeatmapAndMilestones reads the 365-day heatmap (Index-Only Scan on idx_daily_logs_heatmap)
// and lifetime milestones inside a single database.WithUserTx transaction (PRD §5.3 & §7.5).
func (r *PostgresRepository) GetHeatmapAndMilestones(ctx context.Context, userID uuid.UUID, fromDate, toDate time.Time) (HeatmapData, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var data HeatmapData
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		days, err := q.GetHeatmapDays(dbCtx, sqlc.GetHeatmapDaysParams{
			UserID:    userID,
			LogDate:   pgtype.Date{Time: fromDate, Valid: true},
			LogDate_2: pgtype.Date{Time: toDate, Valid: true},
		})
		if err != nil {
			return fmt.Errorf("get heatmap days: %w", err)
		}

		milestones, err := q.GetProfileMilestones(dbCtx, userID)
		if err != nil {
			return fmt.Errorf("get profile milestones: %w", err)
		}

		data = HeatmapData{
			Days:       days,
			Milestones: milestones,
		}
		return nil
	})
	if err != nil {
		return HeatmapData{}, err
	}
	return data, nil
}

// GetInsightDays reads the check-ins Pattern Discovery works from, oldest first, under RLS.
func (r *PostgresRepository) GetInsightDays(ctx context.Context, userID uuid.UUID, fromDate, toDate time.Time) ([]InsightDay, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var out []InsightDay
	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		rows, err := q.GetInsightDays(dbCtx, sqlc.GetInsightDaysParams{
			UserID:    userID,
			LogDate:   pgtype.Date{Time: fromDate, Valid: true},
			LogDate_2: pgtype.Date{Time: toDate, Valid: true},
		})
		if err != nil {
			return fmt.Errorf("get insight days: %w", err)
		}
		out = make([]InsightDay, 0, len(rows))
		for _, row := range rows {
			var scores ai.Scores
			if err := json.Unmarshal(row.Scores, &scores); err != nil {
				continue // a malformed row is skipped rather than failing the whole profile
			}
			var wins struct {
				Work struct {
					Completed bool `json:"completed"`
				} `json:"work"`
			}
			_ = json.Unmarshal(row.WinsData, &wins)
			day := InsightDay{
				Date:      row.LogDate.Time,
				Scores:    scores,
				WinsCount: int(row.WinsCompletedCount),
				WorkDone:  wins.Work.Completed,
			}
			if row.PositiveCopeChosen.Valid {
				day.Cope = row.PositiveCopeChosen.String
			}
			out = append(out, day)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
