package profile_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/config"
	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/features/profile"
	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/server"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

type authSession struct {
	userID  uuid.UUID
	cookies []*http.Cookie
	csrf    string
}

func registerUser(t *testing.T, handler http.Handler, email, tz string) authSession {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"email":      email,
		"password":   "supersecurepass123",
		"full_name":  "Test User",
		"timezone":   tz,
		"ai_consent": true,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("register %s failed: status=%d body=%s", email, rec.Code, rec.Body.String())
	}
	var env struct {
		Data struct {
			User struct {
				ID string `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode register response: %v", err)
	}
	uid, err := uuid.Parse(env.Data.User.ID)
	if err != nil {
		t.Fatalf("parse user id: %v", err)
	}
	cookies := rec.Result().Cookies()
	csrf := ""
	for _, c := range cookies {
		if c.Name == middleware.CSRFCookieName {
			csrf = c.Value
		}
	}
	return authSession{userID: uid, cookies: cookies, csrf: csrf}
}

func seedDailyLog(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID, logDate string, winsCount int, copeChosen *string) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_user_id', $1, true)", userID.String()); err != nil {
		t.Fatalf("set rls user id: %v", err)
	}

	id, err := shared.NewUUIDv7()
	if err != nil {
		t.Fatalf("uuidv7: %v", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO daily_logs (
			id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
			scores, calibration_tier, diagnostic_summary, safety_flag,
			cope_options, positive_cope_chosen, wins_data, wins_completed_count
		) VALUES (
			$1, $2, $3::date, '{}'::jsonb, '', '',
			'{"physical_exhaustion":50,"work_exhaustion":50,"disengagement":50,"soul_wellbeing":50}'::jsonb,
			'balanced', 'summary', false,
			'[]'::jsonb, $4,
			'{"physical":{"title":"p","level":0,"completed":false},"work":{"title":"w","level":0,"completed":false},"soul":{"title":"s","level":0,"completed":false}}'::jsonb,
			$5
		)
	`, id, userID, logDate, copeChosen, winsCount)
	if err != nil {
		t.Fatalf("seed daily_log (%s): %v", logDate, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit seed tx: %v", err)
	}
}

// seedPillarLog inserts a log whose wins_data marks each pillar done or not, with
// wins_completed_count derived the same way the toggle endpoint does.
func seedPillarLog(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID, logDate string, physical, work, soul bool) {
	t.Helper()
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin seed tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_user_id', $1, true)", userID.String()); err != nil {
		t.Fatalf("set rls user id: %v", err)
	}
	id, err := shared.NewUUIDv7()
	if err != nil {
		t.Fatalf("uuidv7: %v", err)
	}
	wins, _ := json.Marshal(map[string]any{
		"physical": map[string]any{"title": "p", "level": 0, "completed": physical},
		"work":     map[string]any{"title": "w", "level": 0, "completed": work},
		"soul":     map[string]any{"title": "s", "level": 0, "completed": soul},
	})
	count := 0
	for _, done := range []bool{physical, work, soul} {
		if done {
			count++
		}
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO daily_logs (
			id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
			scores, calibration_tier, diagnostic_summary, safety_flag,
			cope_options, positive_cope_chosen, wins_data, wins_completed_count
		) VALUES (
			$1, $2, $3::date, '{}'::jsonb, '', '',
			'{"physical_exhaustion":50,"work_exhaustion":50,"disengagement":50,"soul_wellbeing":50}'::jsonb,
			'balanced', 'summary', false,
			'[]'::jsonb, NULL, $4::jsonb, $5
		)
	`, id, userID, logDate, string(wins), count)
	if err != nil {
		t.Fatalf("seed pillar log (%s): %v", logDate, err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit seed tx: %v", err)
	}
}

func getHeatmap(t *testing.T, handler http.Handler, s authSession) profile.HeatmapResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/profile/heatmap", nil)
	for _, c := range s.cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /profile/heatmap status=%d body=%s", rec.Code, rec.Body.String())
	}
	var env struct {
		Data profile.HeatmapResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode heatmap: %v", err)
	}
	return env.Data
}

func TestProfileHeatmap_IntegrationAndExplainIndex(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	initScript, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "deploy", "postgres", "init", "01-roles.sh"))
	if err != nil {
		t.Fatalf("resolve 01-roles.sh: %v", err)
	}
	migrationPath, err := filepath.Abs(filepath.Join("..", "..", "..", "migrations"))
	if err != nil {
		t.Fatalf("resolve migration: %v", err)
	}
	migrationSQL, err := database.ReadUpMigrations(migrationPath)
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
	defer func() { _ = pgContainer.Terminate(ctx) }()

	redisContainer, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis container: %v", err)
	}
	defer func() { _ = redisContainer.Terminate(ctx) }()

	pgHost, err := pgContainer.Host(ctx)
	if err != nil {
		t.Fatalf("postgres host: %v", err)
	}
	pgPort, err := pgContainer.MappedPort(ctx, "5432")
	if err != nil {
		t.Fatalf("postgres port: %v", err)
	}

	migratorURL := fmt.Sprintf("postgres://app_migrator:migrator_test@%s:%s/kindling?sslmode=disable", pgHost, pgPort.Port())
	migratorPool, err := pgxpool.New(ctx, migratorURL)
	if err != nil {
		t.Fatalf("connect migrator: %v", err)
	}
	defer migratorPool.Close()

	if _, err := migratorPool.Exec(ctx, string(migrationSQL)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}

	runtimeURL := fmt.Sprintf("postgres://app_runtime:runtime_test@%s:%s/kindling?sslmode=disable", pgHost, pgPort.Port())
	runtimePool, err := database.NewPool(ctx, runtimeURL)
	if err != nil {
		t.Fatalf("connect runtime pool: %v", err)
	}
	defer runtimePool.Close()

	redisURL, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}
	redisClient, err := cache.NewRedisClient(ctx, redisURL)
	if err != nil {
		t.Fatalf("connect redis: %v", err)
	}
	defer func() { _ = redisClient.Close() }()

	jakartaLoc, _ := time.LoadLocation("Asia/Jakarta")
	fixedNow := time.Date(2026, 11, 26, 10, 0, 0, 0, jakartaLoc)

	cfg := &config.Config{
		AppEnv:       "test",
		JWTSecret:    "0123456789abcdef0123456789abcdef",
		CookieSecure: false,
		AIProvider:   "mock",
		LLMTimeout:   8 * time.Second,
	}

	handler := server.NewHandler(server.Dependencies{
		Config:           cfg,
		Pool:             runtimePool,
		Redis:            redisClient,
		Limiter:          cache.NewRateLimiter(redisClient),
		IdempotencyStore: cache.NewIdempotencyStore(redisClient),
		AIProvider:       ai.NewMockAiProvider(),
		Clock:            func() time.Time { return fixedNow },
	})

	userA := registerUser(t, handler, "alice@example.com", "Asia/Jakarta")
	userB := registerUser(t, handler, "bob@example.com", "Asia/Jakarta")

	cope := "Pernapasan 4-7-8"
	// Within 365-day window (2025-11-27 .. 2026-11-26):
	seedDailyLog(t, runtimePool, userA.userID, "2026-11-26", 3, &cope) // complete
	seedDailyLog(t, runtimePool, userA.userID, "2026-11-25", 2, nil)   // steady
	seedDailyLog(t, runtimePool, userA.userID, "2026-11-24", 0, &cope) // recovery
	seedDailyLog(t, runtimePool, userA.userID, "2026-11-23", 0, nil)   // rest (log exists, 0 wins, no cope)
	// Outside 365-day window (more than 365 days ago -> excluded from `days`, INCLUDED in lifetime `milestones`!):
	seedDailyLog(t, runtimePool, userA.userID, "2025-10-01", 3, &cope) // complete (lifetime only)

	t.Run("GET /profile/heatmap returns 365-day levels, lifetime milestones, and enforces RLS", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/profile/heatmap", nil)
		for _, c := range userA.cookies {
			req.AddCookie(c)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("GET /profile/heatmap status=%d body=%s", rec.Code, rec.Body.String())
		}

		var env struct {
			Success bool                    `json:"success"`
			Data    profile.HeatmapResponse `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("decode heatmap: %v", err)
		}

		if env.Data.Range.From != "2025-11-27" || env.Data.Range.To != "2026-11-26" {
			t.Fatalf("unexpected range: %+v", env.Data.Range)
		}

		// Only 4 days within 365-day window (2025-10-01 excluded from days).
		if len(env.Data.Days) != 4 {
			t.Fatalf("expected 4 days in 365-day window, got %d: %+v", len(env.Data.Days), env.Data.Days)
		}

		expectedDays := []struct {
			date  string
			level profile.HeatmapLevel
			wins  int
		}{
			{"2026-11-26", profile.LevelComplete, 3},
			{"2026-11-25", profile.LevelSteady, 2},
			{"2026-11-24", profile.LevelRecovery, 0},
			{"2026-11-23", profile.LevelRest, 0},
		}
		for i, exp := range expectedDays {
			got := env.Data.Days[i]
			if got.Date != exp.date || got.Level != exp.level || got.WinsCount != exp.wins {
				t.Fatalf("day[%d] = %+v, want date=%s level=%s wins=%d", i, got, exp.date, exp.level, exp.wins)
			}
		}

		// Lifetime milestones include 2025-10-01 (3 wins, complete):
		// Active days: 2026-11-26, 2026-11-25, 2026-11-24, 2025-10-01 = 4 (rest day 2026-11-23 is NOT active).
		// Complete days: 2026-11-26, 2025-10-01 = 2.
		// Recovery days: 2026-11-24 = 1.
		// Total daily wins: 3 + 2 + 0 + 0 + 3 = 8.
		m := env.Data.Milestones
		if m.TotalActiveDays != 4 || m.TotalCompleteDays != 2 || m.TotalRecoveryDays != 1 || m.TotalDailyWins != 8 {
			t.Fatalf("unexpected lifetime milestones: %+v (want active=4 complete=2 recovery=1 wins=8)", m)
		}

		// RLS isolation: User B must see 0 days and 0 milestones.
		reqB := httptest.NewRequest(http.MethodGet, "/api/v1/profile/heatmap", nil)
		for _, c := range userB.cookies {
			reqB.AddCookie(c)
		}
		recB := httptest.NewRecorder()
		handler.ServeHTTP(recB, reqB)
		if recB.Code != http.StatusOK {
			t.Fatalf("User B heatmap status=%d", recB.Code)
		}
		var envB struct {
			Data profile.HeatmapResponse `json:"data"`
		}
		_ = json.Unmarshal(recB.Body.Bytes(), &envB)
		if len(envB.Data.Days) != 0 || envB.Data.Milestones.TotalActiveDays != 0 {
			t.Fatalf("RLS leak: User B saw %+v", envB.Data)
		}
	})

	t.Run("pillar_progress counts lifetime wins per pillar in date order and respects RLS", func(t *testing.T) {
		userD := registerUser(t, handler, "dana@example.com", "Asia/Jakarta")
		userE := registerUser(t, handler, "eve@example.com", "Asia/Jakarta")

		// Inserted out of date order on purpose: checkpoints must follow log_date, not insert order.
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-20", true, false, false)  // physical #4
		seedPillarLog(t, runtimePool, userD.userID, "2025-06-01", true, true, false)   // physical #1, work #1 (older than 365 days)
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-25", true, false, true)   // physical #5, soul #2
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-02", true, false, true)   // physical #2, soul #1
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-10", true, true, false)   // physical #3 -> checkpoint 1, work #2
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-12", false, false, false) // no wins: ignored
		seedPillarLog(t, runtimePool, userD.userID, "2026-11-26", true, true, false)   // physical #6 -> checkpoint 2, work #3 -> checkpoint 1
		// Another user's wins must never leak into D's path.
		seedPillarLog(t, runtimePool, userE.userID, "2026-11-26", true, true, true)

		got := getHeatmap(t, handler, userD).PillarProgress
		phys, work, soul := got.Physical, got.Work, got.Soul

		if phys.CompletedTotal != 6 || phys.NextCheckpointAt != 9 || len(phys.Checkpoints) != 2 ||
			phys.Checkpoints[0] != (profile.Checkpoint{Number: 1, ReachedOn: "2026-11-10"}) ||
			phys.Checkpoints[1] != (profile.Checkpoint{Number: 2, ReachedOn: "2026-11-26"}) ||
			phys.LastCompletedOn == nil || *phys.LastCompletedOn != "2026-11-26" {
			t.Fatalf("physical progress = %+v", phys)
		}
		if work.CompletedTotal != 3 || work.NextCheckpointAt != 6 || len(work.Checkpoints) != 1 ||
			work.Checkpoints[0] != (profile.Checkpoint{Number: 1, ReachedOn: "2026-11-26"}) {
			t.Fatalf("work progress = %+v", work)
		}
		if soul.CompletedTotal != 2 || soul.NextCheckpointAt != 3 || len(soul.Checkpoints) != 0 ||
			soul.LastCompletedOn == nil || *soul.LastCompletedOn != "2026-11-25" {
			t.Fatalf("soul progress = %+v", soul)
		}
		if m := getHeatmap(t, handler, userD).Milestones; m.TotalCheckpoints != 3 || m.TotalDailyWins != 11 {
			t.Fatalf("milestones = %+v, want total_checkpoints=3 total_daily_wins=11", m)
		}

		// E sees only E's single day.
		e := getHeatmap(t, handler, userE)
		if e.PillarProgress.Physical.CompletedTotal != 1 || e.PillarProgress.Work.CompletedTotal != 1 ||
			e.PillarProgress.Soul.CompletedTotal != 1 || e.Milestones.TotalCheckpoints != 0 {
			t.Fatalf("user E progress = %+v", e.PillarProgress)
		}

		// A user with no logs gets an empty path, not an error.
		b := getHeatmap(t, handler, userB).PillarProgress
		if b.Physical.CompletedTotal != 0 || b.Physical.LastCompletedOn != nil || len(b.Physical.Checkpoints) != 0 {
			t.Fatalf("user B progress = %+v", b)
		}
	})

	t.Run("EXPLAIN (ANALYZE, BUFFERS) verifies idx_daily_logs_heatmap is used (Index-Only Scan)", func(t *testing.T) {
		// Seed enough rows across multiple users so PostgreSQL planner naturally prefers idx_daily_logs_heatmap over Seq Scan.
		userC := registerUser(t, handler, "charlie@example.com", "Asia/Jakarta")
		base := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
		for i := 0; i < 150; i++ {
			d := base.AddDate(0, 0, -i).Format(shared.DateLayout)
			seedDailyLog(t, runtimePool, userB.userID, d, i%4, &cope)
			seedDailyLog(t, runtimePool, userC.userID, d, (i+1)%4, nil)
		}

		// VACUUM ANALYZE updates table stats and visibility map for Index-Only Scan.
		if _, err := migratorPool.Exec(ctx, "VACUUM ANALYZE daily_logs"); err != nil {
			t.Fatalf("vacuum analyze daily_logs: %v", err)
		}

		tx, err := runtimePool.Begin(ctx)
		if err != nil {
			t.Fatalf("begin explain tx: %v", err)
		}
		defer func() { _ = tx.Rollback(ctx) }()

		if _, err := tx.Exec(ctx, "SELECT set_config('app.current_user_id', $1, true)", userA.userID.String()); err != nil {
			t.Fatalf("set rls user id: %v", err)
		}

		rows, err := tx.Query(ctx, `
			EXPLAIN (ANALYZE, BUFFERS)
			SELECT log_date, wins_completed_count, positive_cope_chosen
			FROM daily_logs
			WHERE user_id = $1
			  AND log_date >= $2::date
			  AND log_date <= $3::date
			ORDER BY log_date DESC
		`, userA.userID, "2025-11-27", "2026-11-26")
		if err != nil {
			t.Fatalf("EXPLAIN query failed: %v", err)
		}
		defer rows.Close()

		var planLines []string
		for rows.Next() {
			var line string
			if err := rows.Scan(&line); err != nil {
				t.Fatalf("scan explain line: %v", err)
			}
			planLines = append(planLines, line)
		}
		plan := strings.Join(planLines, "\n")
		t.Logf("Heatmap EXPLAIN (ANALYZE, BUFFERS) plan:\n%s", plan)

		if !strings.Contains(plan, "idx_daily_logs_heatmap") {
			t.Fatalf("expected query plan to use idx_daily_logs_heatmap, got:\n%s", plan)
		}
		if !strings.Contains(plan, "Index Only Scan") {
			t.Fatalf("expected Index Only Scan on idx_daily_logs_heatmap, got:\n%s", plan)
		}
	})
}
