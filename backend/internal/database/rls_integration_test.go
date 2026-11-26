package database_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
)

func TestDailyLogsRLS_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	initScript, err := filepath.Abs(filepath.Join("..", "..", "..", "deploy", "postgres", "init", "01-roles.sh"))
	if err != nil {
		t.Fatalf("resolve 01-roles.sh: %v", err)
	}
	migrationPath, err := filepath.Abs(filepath.Join("..", "..", "migrations", "000001_init_schema.up.sql"))
	if err != nil {
		t.Fatalf("resolve migration: %v", err)
	}
	migrationSQL, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}

	pgContainer, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("kindling"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("postgres_test"),
		postgres.WithInitScripts(initScript),
		testcontainers.WithEnv(map[string]string{
			"APP_MIGRATOR_PASSWORD": "migrator_test",
			"APP_RUNTIME_PASSWORD":  "runtime_test",
		}),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(30*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	defer func() {
		_ = pgContainer.Terminate(ctx)
	}()

	host, err := pgContainer.Host(ctx)
	if err != nil {
		t.Fatalf("postgres host: %v", err)
	}
	mappedPort, err := pgContainer.MappedPort(ctx, "5432")
	if err != nil {
		t.Fatalf("postgres port: %v", err)
	}

	// 1. Run migration 000001 as app_migrator (schema owner).
	migratorURL := fmt.Sprintf("postgres://app_migrator:migrator_test@%s:%s/kindling?sslmode=disable", host, mappedPort.Port())
	migratorPool, err := pgxpool.New(ctx, migratorURL)
	if err != nil {
		t.Fatalf("connect as app_migrator: %v", err)
	}
	if _, err := migratorPool.Exec(ctx, string(migrationSQL)); err != nil {
		migratorPool.Close()
		t.Fatalf("apply migration as app_migrator: %v", err)
	}
	migratorPool.Close()

	// 2. Connect application pool as least-privilege app_runtime.
	runtimeURL := fmt.Sprintf("postgres://app_runtime:runtime_test@%s:%s/kindling?sslmode=disable", host, mappedPort.Port())
	pool, err := database.NewPool(ctx, runtimeURL)
	if err != nil {
		t.Fatalf("connect as app_runtime: %v", err)
	}
	defer pool.Close()

	userA := shared.MustUUIDv7()
	userB := shared.MustUUIDv7()

	// Create both users.
	q := sqlc.New(pool)
	for _, u := range []struct {
		id    [16]byte
		email string
		name  string
	}{
		{userA, "alice@example.com", "Alice"},
		{userB, "bob@example.com", "Bob"},
	} {
		if _, err := q.CreateUser(ctx, sqlc.CreateUserParams{
			ID:           u.id,
			Email:        u.email,
			PasswordHash: "argon2id$placeholder",
			FullName:     u.name,
			Timezone:     "Asia/Jakarta",
		}); err != nil {
			t.Fatalf("create user %s: %v", u.email, err)
		}
	}

	logDate := pgtype.Date{Time: time.Date(2026, 11, 26, 0, 0, 0, 0, time.UTC), Valid: true}

	// Insert daily_log for User A via WithUserTx.
	if err := database.WithUserTx(ctx, pool, userA, func(txq *sqlc.Queries) error {
		_, err := txq.InsertDailyLog(ctx, sqlc.InsertDailyLogParams{
			ID:                 shared.MustUUIDv7(),
			UserID:             userA,
			LogDate:            logDate,
			RawAnswers:         []byte(`{"cbi_1":4}`),
			BrainDump:          "",
			FunCopeInput:       "",
			Scores:             []byte(`{"physical_exhaustion":100}`),
			CalibrationTier:    "gentle",
			DiagnosticSummary:  "Rest today.",
			SafetyFlag:         false,
			CopeOptions:        []byte(`[]`),
			WinsData:           []byte(`{}`),
			WinsCompletedCount: 0,
		})
		return err
	}); err != nil {
		t.Fatalf("insert daily_log for userA: %v", err)
	}

	// Insert daily_log for User B via WithUserTx.
	if err := database.WithUserTx(ctx, pool, userB, func(txq *sqlc.Queries) error {
		_, err := txq.InsertDailyLog(ctx, sqlc.InsertDailyLogParams{
			ID:                 shared.MustUUIDv7(),
			UserID:             userB,
			LogDate:            logDate,
			RawAnswers:         []byte(`{"cbi_1":1}`),
			BrainDump:          "",
			FunCopeInput:       "",
			Scores:             []byte(`{"physical_exhaustion":0}`),
			CalibrationTier:    "standard",
			DiagnosticSummary:  "Steady day.",
			SafetyFlag:         false,
			CopeOptions:        []byte(`[]`),
			WinsData:           []byte(`{}`),
			WinsCompletedCount: 0,
		})
		return err
	}); err != nil {
		t.Fatalf("insert daily_log for userB: %v", err)
	}

	// Check 1: Querying daily_logs WITHOUT WithUserTx MUST return 0 rows (no leak across pool).
	rowsNoCtx, err := q.ListAllVisibleDailyLogs(ctx)
	if err != nil {
		t.Fatalf("query without WithUserTx: %v", err)
	}
	if len(rowsNoCtx) != 0 {
		t.Fatalf("expected 0 rows without WithUserTx, got %d", len(rowsNoCtx))
	}

	// Check 2: User A sees ONLY User A's row.
	if err := database.WithUserTx(ctx, pool, userA, func(txq *sqlc.Queries) error {
		rows, err := txq.ListAllVisibleDailyLogs(ctx)
		if err != nil {
			return err
		}
		if len(rows) != 1 {
			t.Fatalf("expected 1 row for userA, got %d", len(rows))
		}
		if rows[0].UserID != userA {
			t.Fatalf("expected userA row (%s), got %s", userA, rows[0].UserID)
		}
		return nil
	}); err != nil {
		t.Fatalf("WithUserTx(userA): %v", err)
	}

	// Check 3: User B sees ONLY User B's row.
	if err := database.WithUserTx(ctx, pool, userB, func(txq *sqlc.Queries) error {
		rows, err := txq.ListAllVisibleDailyLogs(ctx)
		if err != nil {
			return err
		}
		if len(rows) != 1 {
			t.Fatalf("expected 1 row for userB, got %d", len(rows))
		}
		if rows[0].UserID != userB {
			t.Fatalf("expected userB row (%s), got %s", userB, rows[0].UserID)
		}
		return nil
	}); err != nil {
		t.Fatalf("WithUserTx(userB): %v", err)
	}

	// Check 4: User A CANNOT insert a row belonging to User B (WITH CHECK policy).
	err = database.WithUserTx(ctx, pool, userA, func(txq *sqlc.Queries) error {
		_, err := txq.InsertDailyLog(ctx, sqlc.InsertDailyLogParams{
			ID:                 shared.MustUUIDv7(),
			UserID:             userB,
			LogDate:            pgtype.Date{Time: time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC), Valid: true},
			RawAnswers:         []byte(`{"cbi_1":2}`),
			BrainDump:          "",
			FunCopeInput:       "",
			Scores:             []byte(`{"physical_exhaustion":33}`),
			CalibrationTier:    "balanced",
			DiagnosticSummary:  "Cross-tenant attempt",
			SafetyFlag:         false,
			CopeOptions:        []byte(`[]`),
			WinsData:           []byte(`{}`),
			WinsCompletedCount: 0,
		})
		return err
	})
	if err == nil {
		t.Fatal("expected RLS WITH CHECK error when userA inserts row for userB, got nil")
	}

	// Check 5: After WithUserTx transactions, plain pool query still returns 0 rows.
	rowsAfter, err := q.ListAllVisibleDailyLogs(ctx)
	if err != nil {
		t.Fatalf("post-tx query without WithUserTx: %v", err)
	}
	if len(rowsAfter) != 0 {
		t.Fatalf("expected 0 rows after WithUserTx (no session leak), got %d", len(rowsAfter))
	}
}
