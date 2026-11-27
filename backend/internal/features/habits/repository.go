package habits

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
)

const dbQueryTimeout = 3 * time.Second

// Repository is the persistence boundary for habits.
type Repository interface {
	List(ctx context.Context, userID uuid.UUID) (HabitsData, error)
	Replace(ctx context.Context, userID uuid.UUID, data HabitsData) (HabitsData, error)
}

// PostgresRepository stores habits in user_habits, always inside WithUserTx so RLS applies.
type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func (r *PostgresRepository) List(ctx context.Context, userID uuid.UUID) (HabitsData, error) {
	return Load(ctx, r.pool, userID)
}

// Replace writes all three pillars in one transaction: set pillars are upserted, the rest deleted.
func (r *PostgresRepository) Replace(ctx context.Context, userID uuid.UUID, data HabitsData) (HabitsData, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	err := database.WithUserTx(dbCtx, r.pool, userID, func(q *sqlc.Queries) error {
		for _, p := range Pillars {
			h := data.Get(p)
			if h == nil {
				if err := q.DeleteUserHabit(dbCtx, sqlc.DeleteUserHabitParams{UserID: userID, Pillar: p}); err != nil {
					return fmt.Errorf("delete habit: %w", err)
				}
				continue
			}
			if err := q.UpsertUserHabit(dbCtx, sqlc.UpsertUserHabitParams{
				UserID:   userID,
				Pillar:   p,
				Activity: h.Activity,
				Struggle: h.Struggle,
			}); err != nil {
				return fmt.Errorf("upsert habit: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return HabitsData{}, err
	}
	return data, nil
}

// Load reads a user's habits. Check-in and wins use it to build each day's wins.
func Load(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (HabitsData, error) {
	dbCtx, cancel := context.WithTimeout(ctx, dbQueryTimeout)
	defer cancel()

	var out HabitsData
	err := database.WithUserTx(dbCtx, pool, userID, func(q *sqlc.Queries) error {
		rows, err := q.ListUserHabits(dbCtx, userID)
		if err != nil {
			return fmt.Errorf("list habits: %w", err)
		}
		for _, row := range rows {
			h := &Habit{Activity: row.Activity, Struggle: row.Struggle}
			switch row.Pillar {
			case "physical":
				out.Physical = h
			case "work":
				out.Work = h
			case "soul":
				out.Soul = h
			}
		}
		return nil
	})
	if err != nil {
		return HabitsData{}, err
	}
	return out, nil
}
