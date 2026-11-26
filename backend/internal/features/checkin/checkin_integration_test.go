package checkin_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
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
	"github.com/kindling/backend/internal/features/checkin"
	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/server"
	"github.com/kindling/backend/pkg/ai"
)

type spyAiProvider struct {
	inner     ai.AiProvider
	failNext  atomic.Bool
	callCount atomic.Int32
}

func (s *spyAiProvider) GenerateCheckin(ctx context.Context, in ai.CheckinInput) (ai.CheckinOutput, error) {
	s.callCount.Add(1)
	if s.failNext.Load() {
		return ai.CheckinOutput{}, errors.New("simulated upstream llm failure")
	}
	return s.inner.GenerateCheckin(ctx, in)
}

func (s *spyAiProvider) SliceTask(ctx context.Context, in ai.SliceTaskInput) (ai.SliceTaskOutput, error) {
	return s.inner.SliceTask(ctx, in)
}

func (s *spyAiProvider) Recalibrate(ctx context.Context, in ai.RecalibrateInput) (ai.RecalibrateOutput, error) {
	return s.inner.Recalibrate(ctx, in)
}

type authSession struct {
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
	cookies := rec.Result().Cookies()
	csrf := ""
	for _, c := range cookies {
		if c.Name == middleware.CSRFCookieName {
			csrf = c.Value
		}
	}
	if csrf == "" {
		t.Fatalf("missing csrf_token cookie on register")
	}
	return authSession{cookies: cookies, csrf: csrf}
}

func doAuthRequest(handler http.Handler, sess authSession, method, path string, body []byte, idemKey string) *httptest.ResponseRecorder {
	var bodyReader *bytes.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	} else {
		bodyReader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, bodyReader)
	req.Header.Set("Content-Type", "application/json")
	for _, c := range sess.cookies {
		req.AddCookie(c)
	}
	if method != http.MethodGet {
		req.Header.Set(middleware.CSRFHeaderName, sess.csrf)
	}
	if idemKey != "" {
		req.Header.Set(middleware.IdempotencyKeyHeader, idemKey)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func makeCheckinPayload(dateStr, brainDump, funCope string) []byte {
	b, _ := json.Marshal(map[string]any{
		"log_date": dateStr,
		"answers": map[string]int{
			"cbi_1": 4, "cbi_2": 3, "cbi_3": 4,
			"olbi_ex_1": 4, "olbi_ex_2": 3,
			"olbi_dis_1": 2, "olbi_dis_2": 2,
			"who5_1": 2, "who5_2": 1,
		},
		"brain_dump":     brainDump,
		"fun_cope_input": funCope,
	})
	return b
}

func TestCheckinModule_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	initScript, err := filepath.Abs(filepath.Join("..", "..", "..", "..", "deploy", "postgres", "init", "01-roles.sh"))
	if err != nil {
		t.Fatalf("resolve 01-roles.sh: %v", err)
	}
	migrationPath, err := filepath.Abs(filepath.Join("..", "..", "..", "migrations", "000001_init_schema.up.sql"))
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

	// Fixed clock: 2026-11-26 10:00:00+07:00 (Asia/Jakarta).
	jakartaLoc, _ := time.LoadLocation("Asia/Jakarta")
	fixedNow := time.Date(2026, 11, 26, 10, 0, 0, 0, jakartaLoc)

	spyAI := &spyAiProvider{inner: ai.NewMockAiProvider()}

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
		AIProvider:       spyAI,
		Clock:            func() time.Time { return fixedNow },
	})

	userA := registerUser(t, handler, "alice@example.com", "Asia/Jakarta")
	userB := registerUser(t, handler, "bob@example.com", "Asia/Jakarta")

	t.Run("POST /checkin happy path + idempotency replay + key reuse mismatch", func(t *testing.T) {
		payload := makeCheckinPayload("2026-11-26", "Tugas numpuk dan badan rasanya remuk.", "Main gitar 10 menit")
		idemKey := uuid.NewString()

		rec1 := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin", payload, idemKey)
		if rec1.Code != http.StatusOK {
			t.Fatalf("POST /checkin #1 status=%d body=%s", rec1.Code, rec1.Body.String())
		}

		var env1 struct {
			Success bool                     `json:"success"`
			Data    checkin.DailyLogResponse `json:"data"`
		}
		if err := json.Unmarshal(rec1.Body.Bytes(), &env1); err != nil {
			t.Fatalf("decode response #1: %v", err)
		}
		if env1.Data.Scores.PhysicalExhaustion != 89 || env1.Data.Scores.WorkExhaustion != 83 ||
			env1.Data.Scores.Disengagement != 33 || env1.Data.Scores.SoulWellbeing != 17 {
			t.Fatalf("unexpected scores: %+v", env1.Data.Scores)
		}
		if env1.Data.CalibrationTier != ai.TierGentle {
			t.Fatalf("expected gentle tier, got %s", env1.Data.CalibrationTier)
		}
		if env1.Data.SafetyFlag {
			t.Fatal("expected safety_flag=false")
		}
		if len(env1.Data.CopeOptions) != 3 {
			t.Fatalf("expected 3 cope_options, got %d", len(env1.Data.CopeOptions))
		}
		if spyAI.callCount.Load() != 1 {
			t.Fatalf("expected 1 AI call, got %d", spyAI.callCount.Load())
		}

		// Replay with identical Idempotency-Key & body -> identical response, AI NOT called again.
		rec2 := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin", payload, idemKey)
		if rec2.Code != http.StatusOK {
			t.Fatalf("POST /checkin replay status=%d body=%s", rec2.Code, rec2.Body.String())
		}
		if rec2.Header().Get("Idempotency-Replayed") != "true" {
			t.Error("expected Idempotency-Replayed: true header")
		}
		if rec2.Body.String() != rec1.Body.String() {
			t.Fatalf("replayed body differs from original:\norig:   %s\nreplay: %s", rec1.Body.String(), rec2.Body.String())
		}
		if spyAI.callCount.Load() != 1 {
			t.Fatalf("AI should not be called on replay, got %d calls", spyAI.callCount.Load())
		}

		// Same Idempotency-Key with DIFFERENT body -> 422 IDEMPOTENCY_KEY_REUSED.
		diffPayload := makeCheckinPayload("2026-11-26", "Berbeda dari sebelumnya.", "Main gitar 10 menit")
		rec3 := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin", diffPayload, idemKey)
		if rec3.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 IDEMPOTENCY_KEY_REUSED, got status=%d body=%s", rec3.Code, rec3.Body.String())
		}
		var errEnv struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(rec3.Body.Bytes(), &errEnv)
		if errEnv.Error.Code != "IDEMPOTENCY_KEY_REUSED" {
			t.Fatalf("expected code IDEMPOTENCY_KEY_REUSED, got %q", errEnv.Error.Code)
		}
	})

	t.Run("GET /checkin/today, GET /checkin/{date}, RLS isolation, and PATCH /checkin/{date}/cope", func(t *testing.T) {
		recToday := doAuthRequest(handler, userA, http.MethodGet, "/api/v1/checkin/today", nil, "")
		if recToday.Code != http.StatusOK {
			t.Fatalf("GET /checkin/today status=%d body=%s", recToday.Code, recToday.Body.String())
		}

		recDate := doAuthRequest(handler, userA, http.MethodGet, "/api/v1/checkin/2026-11-26", nil, "")
		if recDate.Code != http.StatusOK {
			t.Fatalf("GET /checkin/2026-11-26 status=%d body=%s", recDate.Code, recDate.Body.String())
		}

		// RLS isolation: User B must NOT see User A's log for 2026-11-26.
		recOther := doAuthRequest(handler, userB, http.MethodGet, "/api/v1/checkin/2026-11-26", nil, "")
		if recOther.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for User B reading User A's date, got %d", recOther.Code)
		}

		// PATCH /checkin/2026-11-26/cope -> valid option stores title.
		copeBody, _ := json.Marshal(map[string]string{"cope_option_id": "cope_2"})
		recCope := doAuthRequest(handler, userA, http.MethodPatch, "/api/v1/checkin/2026-11-26/cope", copeBody, "")
		if recCope.Code != http.StatusOK {
			t.Fatalf("PATCH cope status=%d body=%s", recCope.Code, recCope.Body.String())
		}
		var copeEnv struct {
			Data checkin.CopeUpdateResponse `json:"data"`
		}
		_ = json.Unmarshal(recCope.Body.Bytes(), &copeEnv)
		if copeEnv.Data.PositiveCopeChosen != "Pernapasan 4-7-8" {
			t.Fatalf("expected positive_cope_chosen='Pernapasan 4-7-8', got %q", copeEnv.Data.PositiveCopeChosen)
		}

		// Invalid cope_option_id -> 400 VALIDATION_ERROR.
		badCopeBody, _ := json.Marshal(map[string]string{"cope_option_id": "cope_999"})
		recBadCope := doAuthRequest(handler, userA, http.MethodPatch, "/api/v1/checkin/2026-11-26/cope", badCopeBody, "")
		if recBadCope.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for invalid cope_option_id, got %d", recBadCope.Code)
		}
	})

	t.Run("Re-check-in resets cope when wins=0, returns 409 CHECKIN_LOCKED when wins>0", func(t *testing.T) {
		// Re-check-in while wins_completed_count == 0 succeeds and resets positive_cope_chosen to null.
		payload := makeCheckinPayload("2026-11-26", "Update check-in hari ini.", "Jalan santai")
		rec := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin", payload, uuid.NewString())
		if rec.Code != http.StatusOK {
			t.Fatalf("re-check-in failed: status=%d body=%s", rec.Code, rec.Body.String())
		}
		var env struct {
			Data checkin.DailyLogResponse `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		if env.Data.PositiveCopeChosen != nil {
			t.Fatalf("expected positive_cope_chosen to be reset to null on re-check-in, got %v", *env.Data.PositiveCopeChosen)
		}

		// Simulate 1 win completed using WithUserTx (FORCE ROW LEVEL SECURITY applies even to table owner!).
		var aliceID uuid.UUID
		if err := migratorPool.QueryRow(ctx, `SELECT id FROM users WHERE email = 'alice@example.com'`).Scan(&aliceID); err != nil {
			t.Fatalf("lookup alice id: %v", err)
		}
		tx, err := runtimePool.Begin(ctx)
		if err != nil {
			t.Fatalf("begin tx: %v", err)
		}
		if _, err := tx.Exec(ctx, `SELECT set_config('app.current_user_id', $1, true)`, aliceID.String()); err != nil {
			t.Fatalf("set rls context: %v", err)
		}
		tag, err := tx.Exec(ctx, `UPDATE daily_logs SET wins_completed_count = 1 WHERE id = $1`, env.Data.ID)
		if err != nil {
			t.Fatalf("set wins_completed_count=1: %v", err)
		}
		if tag.RowsAffected() != 1 {
			t.Fatalf("expected 1 row updated for wins_completed_count=1, got %d", tag.RowsAffected())
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatalf("commit tx: %v", err)
		}

		// Re-check-in now MUST return 409 CHECKIN_LOCKED.
		recLocked := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin", payload, uuid.NewString())
		if recLocked.Code != http.StatusConflict {
			t.Fatalf("expected 409 CHECKIN_LOCKED, got status=%d body=%s", recLocked.Code, recLocked.Body.String())
		}
		var errEnv struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(recLocked.Body.Bytes(), &errEnv)
		if errEnv.Error.Code != "CHECKIN_LOCKED" {
			t.Fatalf("expected code CHECKIN_LOCKED, got %q", errEnv.Error.Code)
		}
	})

	t.Run("Date validation (yesterday allowed, 2 days ago rejected)", func(t *testing.T) {
		// Yesterday (2026-11-25) is allowed.
		recYest := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin",
			makeCheckinPayload("2026-11-25", "Kemarin sibuk.", "Nonton film"), uuid.NewString())
		if recYest.Code != http.StatusOK {
			t.Fatalf("yesterday check-in expected 200, got %d body=%s", recYest.Code, recYest.Body.String())
		}

		// 2 days ago (2026-11-24) -> 422 DATE_OUT_OF_RANGE.
		recOld := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/checkin",
			makeCheckinPayload("2026-11-24", "Dua hari lalu.", "Tidur"), uuid.NewString())
		if recOld.Code != http.StatusUnprocessableEntity {
			t.Fatalf("2 days ago expected 422 DATE_OUT_OF_RANGE, got %d body=%s", recOld.Code, recOld.Body.String())
		}
	})

	t.Run("AI provider error triggers deterministic fallback (200) and records is_fallback=true in ai_audit_logs", func(t *testing.T) {
		spyAI.failNext.Store(true)
		defer spyAI.failNext.Store(false)

		rec := doAuthRequest(handler, userB, http.MethodPost, "/api/v1/checkin",
			makeCheckinPayload("2026-11-26", "Badan pegal semua.", "Rebahan"), uuid.NewString())
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 fallback response, got status=%d body=%s", rec.Code, rec.Body.String())
		}

		var env struct {
			Data checkin.DailyLogResponse `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		expectedFallback := checkin.BuildCheckinFallback(ai.TierGentle)
		if env.Data.DiagnosticSummary != expectedFallback.DiagnosticSummary {
			t.Fatalf("expected fallback diagnostic_summary, got %q", env.Data.DiagnosticSummary)
		}

		var fallbackCount int
		if err := migratorPool.QueryRow(ctx,
			`SELECT COUNT(*) FROM ai_audit_logs WHERE endpoint = 'POST /checkin' AND is_fallback = TRUE`,
		).Scan(&fallbackCount); err != nil {
			t.Fatalf("query ai_audit_logs: %v", err)
		}
		if fallbackCount < 1 {
			t.Fatalf("expected at least 1 ai_audit_logs row with is_fallback=true, got %d", fallbackCount)
		}
	})

	t.Run("Crisis phrase triggers safety_flag=true and replaces diagnostic_summary", func(t *testing.T) {
		rec := doAuthRequest(handler, userB, http.MethodPost, "/api/v1/checkin",
			makeCheckinPayload("2026-11-25", "Rasanya capek banget dan ingin mati aja.", "Dengerin musik"), uuid.NewString())
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 for crisis check-in, got status=%d body=%s", rec.Code, rec.Body.String())
		}

		var env struct {
			Data checkin.DailyLogResponse `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &env)
		if !env.Data.SafetyFlag {
			t.Fatal("expected safety_flag=true")
		}
		if env.Data.DiagnosticSummary != checkin.CrisisDiagnosticSummary {
			t.Fatalf("expected CrisisDiagnosticSummary, got %q", env.Data.DiagnosticSummary)
		}
	})

	t.Run("AI rate limit enforces 10 req/min/user", func(t *testing.T) {
		userC := registerUser(t, handler, "charlie@example.com", "Asia/Jakarta")
		payload := makeCheckinPayload("2026-11-26", "Testing AI rate limit.", "Jalan kaki")

		for i := 1; i <= 10; i++ {
			rec := doAuthRequest(handler, userC, http.MethodPost, "/api/v1/checkin", payload, uuid.NewString())
			if rec.Code != http.StatusOK {
				t.Fatalf("AI request #%d expected 200, got %d body=%s", i, rec.Code, rec.Body.String())
			}
		}

		rec11 := doAuthRequest(handler, userC, http.MethodPost, "/api/v1/checkin", payload, uuid.NewString())
		if rec11.Code != http.StatusTooManyRequests {
			t.Fatalf("AI request #11 expected 429 RATE_LIMITED, got %d body=%s", rec11.Code, rec11.Body.String())
		}
		if rec11.Header().Get("Retry-After") == "" {
			t.Error("expected Retry-After header on 429")
		}
	})
}
