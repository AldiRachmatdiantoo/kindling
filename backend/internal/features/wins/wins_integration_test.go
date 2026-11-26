package wins_test

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
	"strings"
	"sync"
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
	"github.com/kindling/backend/internal/features/wins"
	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/server"
	"github.com/kindling/backend/pkg/ai"
)

type controllableAiProvider struct {
	inner            ai.AiProvider
	failSlice        atomic.Bool
	failRecalibrate  atomic.Bool
	recalibrateDelay atomic.Int64 // milliseconds
	sliceCalls       atomic.Int32
	recalibrateCalls atomic.Int32

	// barrier, when set, holds each Recalibrate call until that many calls are in flight, so
	// every concurrent request has finished its unlocked read before any of them writes.
	barrierMu      sync.Mutex
	barrierSize    int
	barrierArrived int
	barrierOpen    chan struct{}
}

func (p *controllableAiProvider) setBarrier(n int) {
	p.barrierMu.Lock()
	defer p.barrierMu.Unlock()
	p.barrierSize, p.barrierArrived = n, 0
	p.barrierOpen = make(chan struct{})
}

func (p *controllableAiProvider) waitAtBarrier() {
	p.barrierMu.Lock()
	if p.barrierSize == 0 {
		p.barrierMu.Unlock()
		return
	}
	p.barrierArrived++
	open := p.barrierOpen
	if p.barrierArrived == p.barrierSize {
		close(open)
	}
	p.barrierMu.Unlock()
	select {
	case <-open:
	case <-time.After(5 * time.Second): // never hang the suite if fewer calls arrive
	}
}

func (p *controllableAiProvider) GenerateCheckin(ctx context.Context, in ai.CheckinInput) (ai.CheckinOutput, error) {
	return p.inner.GenerateCheckin(ctx, in)
}

func (p *controllableAiProvider) SliceTask(ctx context.Context, in ai.SliceTaskInput) (ai.SliceTaskOutput, error) {
	p.sliceCalls.Add(1)
	if p.failSlice.Load() {
		return ai.SliceTaskOutput{}, errors.New("simulated slice-task llm failure")
	}
	return p.inner.SliceTask(ctx, in)
}

func (p *controllableAiProvider) Recalibrate(ctx context.Context, in ai.RecalibrateInput) (ai.RecalibrateOutput, error) {
	p.recalibrateCalls.Add(1)
	p.waitAtBarrier()
	if ms := p.recalibrateDelay.Load(); ms > 0 {
		time.Sleep(time.Duration(ms) * time.Millisecond)
	}
	if p.failRecalibrate.Load() {
		return ai.RecalibrateOutput{}, errors.New("simulated recalibrate llm failure")
	}
	return p.inner.Recalibrate(ctx, in)
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
	return authSession{cookies: cookies, csrf: csrf}
}

func doAuthRequest(handler http.Handler, sess authSession, method, path string, body []byte, idemKey string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
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

func submitCheckin(t *testing.T, handler http.Handler, sess authSession, dateStr string) {
	t.Helper()
	body, _ := json.Marshal(map[string]any{
		"log_date": dateStr,
		"answers": map[string]int{
			"cbi_1": 4, "cbi_2": 3, "cbi_3": 4,
			"olbi_ex_1": 4, "olbi_ex_2": 3,
			"olbi_dis_1": 2, "olbi_dis_2": 2,
			"who5_1": 2, "who5_2": 1,
		},
		"brain_dump":     "Tugas menumpuk.",
		"fun_cope_input": "Main gitar 10 menit",
	})
	rec := doAuthRequest(handler, sess, http.MethodPost, "/api/v1/checkin", body, uuid.NewString())
	if rec.Code != http.StatusOK {
		t.Fatalf("submitCheckin(%s) failed: status=%d body=%s", dateStr, rec.Code, rec.Body.String())
	}
}

func getCheckinLog(t *testing.T, handler http.Handler, sess authSession, dateStr string) checkin.DailyLogResponse {
	t.Helper()
	rec := doAuthRequest(handler, sess, http.MethodGet, "/api/v1/checkin/"+dateStr, nil, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /checkin/%s failed: status=%d body=%s", dateStr, rec.Code, rec.Body.String())
	}
	var env struct {
		Data checkin.DailyLogResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode checkin log: %v", err)
	}
	return env.Data
}

func TestWinsModule_IntegrationAndConcurrency(t *testing.T) {
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

	jakartaLoc, _ := time.LoadLocation("Asia/Jakarta")
	fixedNow := time.Date(2026, 11, 26, 10, 0, 0, 0, jakartaLoc)

	ctrlAI := &controllableAiProvider{inner: ai.NewMockAiProvider()}

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
		AIProvider:       ctrlAI,
		Clock:            func() time.Time { return fixedNow },
	})

	userA := registerUser(t, handler, "alice@example.com", "Asia/Jakarta")
	userB := registerUser(t, handler, "bob@example.com", "Asia/Jakarta")

	submitCheckin(t, handler, userA, "2026-11-26")

	t.Run("POST /wins/{date}/slice-task happy path, idempotency replay, and fallback", func(t *testing.T) {
		idemKey := uuid.NewString()
		body, _ := json.Marshal(map[string]string{"main_task": "Menulis bab 3 laporan praktikum"})

		rec1 := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, idemKey)
		if rec1.Code != http.StatusOK {
			t.Fatalf("slice-task #1 status=%d body=%s", rec1.Code, rec1.Body.String())
		}
		var env1 struct {
			Data wins.SliceTaskResponse `json:"data"`
		}
		if err := json.Unmarshal(rec1.Body.Bytes(), &env1); err != nil {
			t.Fatalf("decode slice-task response: %v", err)
		}
		if env1.Data.MainTask != "Menulis bab 3 laporan praktikum" {
			t.Fatalf("unexpected main_task: %q", env1.Data.MainTask)
		}
		if env1.Data.DurationSeconds < 300 || env1.Data.DurationSeconds > 600 {
			t.Fatalf("duration_seconds out of [300,600]: %d", env1.Data.DurationSeconds)
		}
		if env1.Data.MicroStep == "" {
			t.Fatal("expected non-empty micro_step")
		}

		callsAfterFirst := ctrlAI.sliceCalls.Load()
		// Replay with same Idempotency-Key -> replayed without calling AI again.
		rec2 := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, idemKey)
		if rec2.Code != http.StatusOK || rec2.Header().Get("Idempotency-Replayed") != "true" {
			t.Fatalf("expected idempotent replay, status=%d header=%q", rec2.Code, rec2.Header().Get("Idempotency-Replayed"))
		}
		if ctrlAI.sliceCalls.Load() != callsAfterFirst {
			t.Fatalf("AI should not be called on idempotency replay")
		}

		// Verify persisted in wins_data.work.
		log := getCheckinLog(t, handler, userA, "2026-11-26")
		if log.WinsData.Work.MainTask == nil || *log.WinsData.Work.MainTask != "Menulis bab 3 laporan praktikum" {
			t.Fatalf("expected persisted work.main_task, got %+v", log.WinsData.Work)
		}
		if log.WinsData.Work.MicroStep == nil || *log.WinsData.Work.MicroStep != env1.Data.MicroStep {
			t.Fatalf("expected persisted work.micro_step, got %+v", log.WinsData.Work)
		}

		// Fallback when AI errors.
		ctrlAI.failSlice.Store(true)
		defer ctrlAI.failSlice.Store(false)
		recFB := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, uuid.NewString())
		if recFB.Code != http.StatusOK {
			t.Fatalf("expected 200 fallback on AI failure, got %d body=%s", recFB.Code, recFB.Body.String())
		}
		var envFB struct {
			Data wins.SliceTaskResponse `json:"data"`
		}
		_ = json.Unmarshal(recFB.Body.Bytes(), &envFB)
		if envFB.Data.AINote != "unavailable" {
			t.Fatalf("a failed AI call must tell the client why, got ai_note=%q", envFB.Data.AINote)
		}

		// RLS isolation: User B gets 404 on User A's date.
		recB := doAuthRequest(handler, userB, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, uuid.NewString())
		if recB.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for User B on User A's date, got %d", recB.Code)
		}
	})

	t.Run("daily AI budget: past the cap, the template answers and says why", func(t *testing.T) {
		capped := *cfg
		capped.AIDailyLimit = 2
		cappedHandler := server.NewHandler(server.Dependencies{
			Config:           &capped,
			Pool:             runtimePool,
			Redis:            redisClient,
			Limiter:          cache.NewRateLimiter(redisClient),
			IdempotencyStore: cache.NewIdempotencyStore(redisClient),
			AIProvider:       ctrlAI,
			Clock:            func() time.Time { return fixedNow },
		})
		userD := registerUser(t, cappedHandler, "dana@example.com", "Asia/Jakarta")
		submitCheckin(t, cappedHandler, userD, "2026-11-26") // AI call 1 of 2

		slice := func() wins.SliceTaskResponse {
			t.Helper()
			body, _ := json.Marshal(map[string]string{"main_task": "Balas email dosen"})
			rec := doAuthRequest(cappedHandler, userD, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, uuid.NewString())
			if rec.Code != http.StatusOK {
				t.Fatalf("slice status=%d body=%s", rec.Code, rec.Body.String())
			}
			var env struct {
				Data wins.SliceTaskResponse `json:"data"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &env)
			return env.Data
		}
		if first := slice(); first.AINote != "" { // AI call 2 of 2
			t.Fatalf("within the cap there must be no note, got %q", first.AINote)
		}
		before := ctrlAI.sliceCalls.Load()
		over := slice()
		if over.AINote != "daily_limit" || over.MicroStep == "" {
			t.Fatalf("past the cap expected a template step with ai_note=daily_limit, got %+v", over)
		}
		if ctrlAI.sliceCalls.Load() != before {
			t.Fatal("past the cap the AI provider must not be called")
		}

		recalBody, _ := json.Marshal(map[string]string{"pillar": "soul"})
		rec := doAuthRequest(cappedHandler, userD, http.MethodPost, "/api/v1/wins/2026-11-26/recalibrate", recalBody, uuid.NewString())
		var recal struct {
			Data wins.RecalibrateResponse `json:"data"`
		}
		_ = json.Unmarshal(rec.Body.Bytes(), &recal)
		if rec.Code != http.StatusOK || recal.Data.AINote != "daily_limit" || recal.Data.Level != 1 {
			t.Fatalf("recalibrate past the cap must still shrink the goal and say why, got %d %+v", rec.Code, recal.Data)
		}
	})

	t.Run("POST /wins/{date}/slice-task next_step continues the same task", func(t *testing.T) {
		// Its own user, so these AI calls don't eat into the other subtests' rate limit.
		userC := registerUser(t, handler, "carol@example.com", "Asia/Jakarta")
		submitCheckin(t, handler, userC, "2026-11-26")
		first, _ := json.Marshal(map[string]string{"main_task": "Menulis bab 3 laporan praktikum"})
		if rec := doAuthRequest(handler, userC, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", first, uuid.NewString()); rec.Code != http.StatusOK {
			t.Fatalf("first slice status=%d body=%s", rec.Code, rec.Body.String())
		}
		next := func() wins.SliceTaskResponse {
			t.Helper()
			// main_task in the body is ignored for next_step: the server uses the stored task.
			body, _ := json.Marshal(map[string]any{"main_task": "something else", "next_step": true})
			rec := doAuthRequest(handler, userC, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", body, uuid.NewString())
			if rec.Code != http.StatusOK {
				t.Fatalf("next_step status=%d body=%s", rec.Code, rec.Body.String())
			}
			var env struct {
				Data wins.SliceTaskResponse `json:"data"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
				t.Fatalf("decode next_step response: %v", err)
			}
			return env.Data
		}

		second := next()
		if second.StepsDone != 1 || !strings.Contains(second.MicroStep, "Step 2 of") {
			t.Fatalf("expected step 2 after one finished step, got %+v", second)
		}
		if second.MainTask != "Menulis bab 3 laporan praktikum" {
			t.Fatalf("next_step must keep the stored task, got %q", second.MainTask)
		}
		third := next()
		if third.StepsDone != 2 || !strings.Contains(third.MicroStep, "Step 3 of") {
			t.Fatalf("expected step 3, got %+v", third)
		}
		log := getCheckinLog(t, handler, userC, "2026-11-26")
		if log.WinsData.Work.StepsDone != 2 || log.WinsData.Work.MicroStep == nil || *log.WinsData.Work.MicroStep != third.MicroStep {
			t.Fatalf("expected persisted steps_done=2 and the latest step, got %+v", log.WinsData.Work)
		}

		// A brand-new task starts counting again.
		fresh, _ := json.Marshal(map[string]string{"main_task": "Balas email dosen"})
		rec := doAuthRequest(handler, userC, http.MethodPost, "/api/v1/wins/2026-11-26/slice-task", fresh, uuid.NewString())
		if rec.Code != http.StatusOK {
			t.Fatalf("fresh slice status=%d", rec.Code)
		}
		if log := getCheckinLog(t, handler, userC, "2026-11-26"); log.WinsData.Work.StepsDone != 0 {
			t.Fatalf("a new task must reset steps_done, got %d", log.WinsData.Work.StepsDone)
		}
	})

	t.Run("POST /wins/{date}/recalibrate levels 0->3, resets completed, shrinks work micro_step, 422 MIN_LEVEL_REACHED", func(t *testing.T) {
		// First mark physical as completed so we verify recalibrate resets completed=false and decrements count.
		toggleBody, _ := json.Marshal(map[string]any{"pillar": "physical", "completed": true})
		recT := doAuthRequest(handler, userA, http.MethodPatch, "/api/v1/wins/2026-11-26/toggle", toggleBody, "")
		if recT.Code != http.StatusOK {
			t.Fatalf("toggle physical true failed: %d %s", recT.Code, recT.Body.String())
		}

		recalPhys, _ := json.Marshal(map[string]string{"pillar": "physical"})
		for expectedLevel := 1; expectedLevel <= 3; expectedLevel++ {
			rec := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/recalibrate", recalPhys, uuid.NewString())
			if rec.Code != http.StatusOK {
				t.Fatalf("recalibrate physical to level %d failed: status=%d body=%s", expectedLevel, rec.Code, rec.Body.String())
			}
			var env struct {
				Data wins.RecalibrateResponse `json:"data"`
			}
			_ = json.Unmarshal(rec.Body.Bytes(), &env)
			if env.Data.Level != expectedLevel || env.Data.Pillar != "physical" || env.Data.NewTitle == "" {
				t.Fatalf("unexpected recalibrate response: %+v", env.Data)
			}
		}

		// Verify physical completed was reset to false and wins_completed_count == 0.
		log := getCheckinLog(t, handler, userA, "2026-11-26")
		if log.WinsData.Physical.Completed || log.WinsCompletedCount != 0 || log.WinsData.Physical.Level != 3 {
			t.Fatalf("expected physical level=3 completed=false count=0, got %+v count=%d", log.WinsData.Physical, log.WinsCompletedCount)
		}

		// Level 3 -> 422 MIN_LEVEL_REACHED.
		recMin := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/recalibrate", recalPhys, uuid.NewString())
		if recMin.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 MIN_LEVEL_REACHED at level 3, got %d body=%s", recMin.Code, recMin.Body.String())
		}
		var errEnv struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(recMin.Body.Bytes(), &errEnv)
		if errEnv.Error.Code != "MIN_LEVEL_REACHED" {
			t.Fatalf("expected MIN_LEVEL_REACHED, got %q", errEnv.Error.Code)
		}

		// Recalibrating work (which already has micro_step) updates micro_step & duration_seconds.
		recalWork, _ := json.Marshal(map[string]string{"pillar": "work"})
		recWork := doAuthRequest(handler, userA, http.MethodPost, "/api/v1/wins/2026-11-26/recalibrate", recalWork, uuid.NewString())
		if recWork.Code != http.StatusOK {
			t.Fatalf("recalibrate work failed: %d %s", recWork.Code, recWork.Body.String())
		}
		var workEnv struct {
			Data wins.RecalibrateResponse `json:"data"`
		}
		_ = json.Unmarshal(recWork.Body.Bytes(), &workEnv)
		logAfterWork := getCheckinLog(t, handler, userA, "2026-11-26")
		if logAfterWork.WinsData.Work.MicroStep == nil || *logAfterWork.WinsData.Work.MicroStep != workEnv.Data.NewTitle {
			t.Fatalf("expected work.micro_step updated to %q, got %+v", workEnv.Data.NewTitle, logAfterWork.WinsData.Work)
		}
	})

	t.Run("Concurrency (-race): 10 parallel recalibrate requests -> level rises by exactly 1, others get 409 CONCURRENT_MODIFICATION", func(t *testing.T) {
		// Use a dedicated user so AI rate limit (10 req/min/user) accommodates all 10 parallel calls cleanly.
		userRace := registerUser(t, handler, "race-recal@example.com", "Asia/Jakarta")
		submitCheckin(t, handler, userRace, "2026-11-26")

		// Use a fresh handler with higher/nil rate limiter OR test via service+repo?
		// Wait: submitCheckin used 1 of 10 AI quota for userRace, so let's test the 10 parallel recalibrates
		// using a fresh Redis-free-limiter handler or a second user where check-in is seeded, OR even better:
		// use a handler with Limiter: nil for the concurrency stress test so all 10 HTTP requests hit recalibrate simultaneously!
		concurrentHandler := server.NewHandler(server.Dependencies{
			Config:           cfg,
			Pool:             runtimePool,
			Redis:            redisClient,
			Limiter:          nil, // isolate DB concurrency without tripping 10/min AI quota after check-in
			IdempotencyStore: cache.NewIdempotencyStore(redisClient),
			AIProvider:       ctrlAI,
			Clock:            func() time.Time { return fixedNow },
		})

		// Hold every AI call until all 10 have arrived, so each goroutine has read level=0 in Step 1
		// before any Step 3 locks the row. A fixed sleep was flaky on a busy machine.
		ctrlAI.setBarrier(10) // the 10 workers below
		defer ctrlAI.setBarrier(0)

		const workers = 10
		startGate := make(chan struct{})
		var wg sync.WaitGroup
		statuses := make([]int, workers)
		codes := make([]string, workers)

		recalBody, _ := json.Marshal(map[string]string{"pillar": "soul"})

		for i := 0; i < workers; i++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				<-startGate
				rec := doAuthRequest(concurrentHandler, userRace, http.MethodPost, "/api/v1/wins/2026-11-26/recalibrate", recalBody, uuid.NewString())
				statuses[idx] = rec.Code
				if rec.Code != http.StatusOK {
					var errEnv struct {
						Error struct {
							Code string `json:"code"`
						} `json:"error"`
					}
					_ = json.Unmarshal(rec.Body.Bytes(), &errEnv)
					codes[idx] = errEnv.Error.Code
				}
			}(i)
		}

		close(startGate)
		wg.Wait()

		okCount := 0
		conflictCount := 0
		for i := 0; i < workers; i++ {
			switch statuses[i] {
			case http.StatusOK:
				okCount++
			case http.StatusConflict:
				if codes[i] != "CONCURRENT_MODIFICATION" {
					t.Errorf("worker %d got 409 with unexpected code %q", i, codes[i])
				}
				conflictCount++
			default:
				t.Errorf("worker %d got unexpected status %d (code=%q)", i, statuses[i], codes[i])
			}
		}

		if okCount != 1 || conflictCount != workers-1 {
			t.Fatalf("expected exactly 1 success and %d CONCURRENT_MODIFICATION, got ok=%d conflict=%d", workers-1, okCount, conflictCount)
		}

		// Verify DB level rose by exactly 1 (from 0 -> 1).
		log := getCheckinLog(t, concurrentHandler, userRace, "2026-11-26")
		if log.WinsData.Soul.Level != 1 {
			t.Fatalf("expected final soul level = 1, got %d", log.WinsData.Soul.Level)
		}
	})

	t.Run("Concurrency (-race): parallel PATCH /wins/{date}/toggle keeps wins_completed_count consistent with wins_data", func(t *testing.T) {
		userToggle := registerUser(t, handler, "race-toggle@example.com", "Asia/Jakarta")
		submitCheckin(t, handler, userToggle, "2026-11-26")

		concurrentHandler := server.NewHandler(server.Dependencies{
			Config:           cfg,
			Pool:             runtimePool,
			Redis:            redisClient,
			Limiter:          nil,
			IdempotencyStore: cache.NewIdempotencyStore(redisClient),
			AIProvider:       ctrlAI,
			Clock:            func() time.Time { return fixedNow },
		})

		// Wave 1: Toggle all 3 pillars to true simultaneously -> final count MUST be 3 (no lost updates).
		pillars := []string{"physical", "work", "soul"}
		startWave1 := make(chan struct{})
		var wg1 sync.WaitGroup
		for _, p := range pillars {
			wg1.Add(1)
			go func(pillar string) {
				defer wg1.Done()
				<-startWave1
				body, _ := json.Marshal(map[string]any{"pillar": pillar, "completed": true})
				rec := doAuthRequest(concurrentHandler, userToggle, http.MethodPatch, "/api/v1/wins/2026-11-26/toggle", body, "")
				if rec.Code != http.StatusOK {
					t.Errorf("parallel toggle %s=true failed: status=%d body=%s", pillar, rec.Code, rec.Body.String())
				}
			}(p)
		}
		close(startWave1)
		wg1.Wait()

		log1 := getCheckinLog(t, concurrentHandler, userToggle, "2026-11-26")
		if log1.WinsCompletedCount != 3 || !log1.WinsData.Physical.Completed || !log1.WinsData.Work.Completed || !log1.WinsData.Soul.Completed {
			t.Fatalf("expected all 3 wins completed (count=3), got count=%d data=%+v", log1.WinsCompletedCount, log1.WinsData)
		}

		// Wave 2: 12 concurrent mixed toggles across all pillars -> final count MUST match wins_data exactly.
		startWave2 := make(chan struct{})
		var wg2 sync.WaitGroup
		for i := 0; i < 12; i++ {
			wg2.Add(1)
			go func(idx int) {
				defer wg2.Done()
				<-startWave2
				pillar := pillars[idx%3]
				completed := idx%2 == 0
				body, _ := json.Marshal(map[string]any{"pillar": pillar, "completed": completed})
				rec := doAuthRequest(concurrentHandler, userToggle, http.MethodPatch, "/api/v1/wins/2026-11-26/toggle", body, "")
				if rec.Code != http.StatusOK {
					t.Errorf("mixed parallel toggle #%d failed: status=%d body=%s", idx, rec.Code, rec.Body.String())
				}
			}(i)
		}
		close(startWave2)
		wg2.Wait()

		log2 := getCheckinLog(t, concurrentHandler, userToggle, "2026-11-26")
		expectedCount := 0
		if log2.WinsData.Physical.Completed {
			expectedCount++
		}
		if log2.WinsData.Work.Completed {
			expectedCount++
		}
		if log2.WinsData.Soul.Completed {
			expectedCount++
		}
		if log2.WinsCompletedCount != expectedCount {
			t.Fatalf("inconsistent wins_completed_count=%d vs wins_data count=%d (%+v)", log2.WinsCompletedCount, expectedCount, log2.WinsData)
		}
	})
}
