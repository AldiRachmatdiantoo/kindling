package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/config"
	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/features/auth"
	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/server"
	"github.com/kindling/backend/internal/shared"
)

type testClock struct {
	mu  sync.RWMutex
	now time.Time
}

func newTestClock(t time.Time) *testClock {
	return &testClock{now: t}
}

func (c *testClock) Now() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.now
}

func (c *testClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func cookieByName(cookies []*http.Cookie, name string) *http.Cookie {
	for _, c := range cookies {
		if c.Name == name {
			return c
		}
	}
	return nil
}

func TestAuthFlow_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()

	// Start PostgreSQL 16 with 01-roles.sh and apply 000001 migration as app_migrator.
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
		t.Fatalf("connect app_migrator: %v", err)
	}
	if _, err := migratorPool.Exec(ctx, string(migrationSQL)); err != nil {
		migratorPool.Close()
		t.Fatalf("apply migration: %v", err)
	}
	migratorPool.Close()

	runtimeURL := fmt.Sprintf("postgres://app_runtime:runtime_test@%s:%s/kindling?sslmode=disable", pgHost, pgPort.Port())
	pool, err := database.NewPool(ctx, runtimeURL)
	if err != nil {
		t.Fatalf("connect app_runtime: %v", err)
	}
	defer pool.Close()

	redisConnStr, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}
	redisClient, err := cache.NewRedisClient(ctx, redisConnStr)
	if err != nil {
		t.Fatalf("connect redis: %v", err)
	}
	defer func() { _ = redisClient.Close() }()

	clock := newTestClock(time.Now().UTC().Truncate(time.Second))
	cfg := &config.Config{
		AppEnv:       "test",
		JWTSecret:    "0123456789abcdef0123456789abcdef",
		CookieSecure: true,
		InstanceID:   "api-test",
	}

	handler := server.NewHandler(server.Dependencies{
		Config:  cfg,
		Pool:    pool,
		Redis:   redisClient,
		Limiter: cache.NewRateLimiter(redisClient),
		Clock:   clock.Now,
	})

	doJSON := func(method, path string, body any, cookies []*http.Cookie, headers map[string]string) *httptest.ResponseRecorder {
		var buf bytes.Buffer
		if body != nil {
			if err := json.NewEncoder(&buf).Encode(body); err != nil {
				t.Fatalf("encode body: %v", err)
			}
		}
		req := httptest.NewRequest(method, path, &buf)
		req.RemoteAddr = "198.51.100.20:12345"
		req.Header.Set("Content-Type", "application/json")
		for _, c := range cookies {
			req.AddCookie(c)
		}
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		return rec
	}

	// 1. Register user and verify cookies (HttpOnly vs non-HttpOnly, Secure, SameSite=Strict).
	regRec := doJSON(http.MethodPost, "/api/v1/auth/register", map[string]any{
		"email":      "integration@kindling.app",
		"password":   "very-strong-password-2026",
		"full_name":  "Kindling Tester",
		"timezone":   "Asia/Jakarta",
		"ai_consent": true,
	}, nil, nil)
	if regRec.Code != http.StatusCreated {
		t.Fatalf("register expected 201, got %d: %s", regRec.Code, regRec.Body.String())
	}

	regCookies := regRec.Result().Cookies()
	accessCookie := cookieByName(regCookies, middleware.AccessTokenCookieName)
	refreshCookie := cookieByName(regCookies, auth.RefreshTokenCookieName)
	csrfCookie := cookieByName(regCookies, middleware.CSRFCookieName)

	if accessCookie == nil || !accessCookie.HttpOnly || !accessCookie.Secure || accessCookie.SameSite != http.SameSiteStrictMode || accessCookie.Path != "/api/v1" {
		t.Fatalf("unexpected access_token cookie: %+v", accessCookie)
	}
	if refreshCookie == nil || !refreshCookie.HttpOnly || !refreshCookie.Secure || refreshCookie.SameSite != http.SameSiteStrictMode || refreshCookie.Path != "/api/v1/auth" {
		t.Fatalf("unexpected refresh_token cookie: %+v", refreshCookie)
	}
	if csrfCookie == nil || csrfCookie.HttpOnly || !csrfCookie.Secure || csrfCookie.SameSite != http.SameSiteStrictMode || csrfCookie.Path != "/" {
		t.Fatalf("unexpected csrf_token cookie: %+v", csrfCookie)
	}

	// 2. GET /api/v1/auth/me works with access_token cookie.
	meRec := doJSON(http.MethodGet, "/api/v1/auth/me", nil, []*http.Cookie{accessCookie}, nil)
	if meRec.Code != http.StatusOK {
		t.Fatalf("GET /auth/me expected 200, got %d: %s", meRec.Code, meRec.Body.String())
	}

	// 3. Mutating request without X-CSRF-Token returns 403 CSRF_INVALID.
	noCSRFRec := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil, []*http.Cookie{refreshCookie, csrfCookie}, nil)
	if noCSRFRec.Code != http.StatusForbidden {
		t.Fatalf("POST /auth/refresh without X-CSRF-Token expected 403, got %d: %s", noCSRFRec.Code, noCSRFRec.Body.String())
	}
	var csrfErr shared.ErrorEnvelope
	if err := json.Unmarshal(noCSRFRec.Body.Bytes(), &csrfErr); err != nil {
		t.Fatalf("unmarshal csrf error: %v", err)
	}
	if csrfErr.Error.Code != shared.CodeCSRFInvalid {
		t.Fatalf("expected CSRF_INVALID, got %s", csrfErr.Error.Code)
	}

	// 4. Successful refresh rotation.
	rotRec := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
		[]*http.Cookie{refreshCookie, csrfCookie},
		map[string]string{middleware.CSRFHeaderName: csrfCookie.Value},
	)
	if rotRec.Code != http.StatusOK {
		t.Fatalf("POST /auth/refresh expected 200, got %d: %s", rotRec.Code, rotRec.Body.String())
	}
	rotCookies := rotRec.Result().Cookies()
	newAccess := cookieByName(rotCookies, middleware.AccessTokenCookieName)
	newRefresh := cookieByName(rotCookies, auth.RefreshTokenCookieName)
	newCSRF := cookieByName(rotCookies, middleware.CSRFCookieName)
	if newRefresh == nil || newRefresh.Value == refreshCookie.Value {
		t.Fatal("expected rotated refresh_token cookie to have a new value")
	}

	meAfterRot := doJSON(http.MethodGet, "/api/v1/auth/me", nil, []*http.Cookie{newAccess}, nil)
	if meAfterRot.Code != http.StatusOK {
		t.Fatalf("GET /auth/me after rotation expected 200, got %d", meAfterRot.Code)
	}

	// 5. Two parallel refreshes with the SAME refresh_token do NOT log the user out (10s grace period).
	var wg sync.WaitGroup
	results := make([]*httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
				[]*http.Cookie{newRefresh, newCSRF},
				map[string]string{middleware.CSRFHeaderName: newCSRF.Value},
			)
		}(i)
	}
	wg.Wait()

	var winnerRec, loserRec *httptest.ResponseRecorder
	for _, r := range results {
		switch r.Code {
		case http.StatusOK:
			winnerRec = r
		case http.StatusUnauthorized:
			loserRec = r
		default:
			t.Fatalf("unexpected status from parallel refresh: %d (%s)", r.Code, r.Body.String())
		}
	}
	if winnerRec == nil || loserRec == nil {
		t.Fatalf("expected exactly one 200 and one 401 from parallel refresh, got %d and %d", results[0].Code, results[1].Code)
	}
	// Loser (grace-period 401) must NOT clear cookies.
	if len(loserRec.Result().Cookies()) != 0 {
		t.Fatalf("grace-period 401 must not clear cookies, got %+v", loserRec.Result().Cookies())
	}

	// Winner's token must STILL be active (family was NOT revoked).
	winnerCookies := winnerRec.Result().Cookies()
	winnerRefresh := cookieByName(winnerCookies, auth.RefreshTokenCookieName)
	winnerCSRF := cookieByName(winnerCookies, middleware.CSRFCookieName)
	if winnerRefresh == nil || winnerCSRF == nil {
		t.Fatal("expected winner response to include new refresh & csrf cookies")
	}

	followUpRec := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
		[]*http.Cookie{winnerRefresh, winnerCSRF},
		map[string]string{middleware.CSRFHeaderName: winnerCSRF.Value},
	)
	if followUpRec.Code != http.StatusOK {
		t.Fatalf("expected winner refresh token to remain valid after parallel refresh, got %d: %s", followUpRec.Code, followUpRec.Body.String())
	}
	activeCookies := followUpRec.Result().Cookies()
	activeRefresh := cookieByName(activeCookies, auth.RefreshTokenCookieName)
	activeCSRF := cookieByName(activeCookies, middleware.CSRFCookieName)

	// 6. Reuse > 10 seconds revokes the ENTIRE family and clears cookies.
	clock.Advance(11 * time.Second)
	reuseRec := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
		[]*http.Cookie{winnerRefresh, activeCSRF},
		map[string]string{middleware.CSRFHeaderName: activeCSRF.Value},
	)
	if reuseRec.Code != http.StatusUnauthorized {
		t.Fatalf("reuse > 10s expected 401, got %d: %s", reuseRec.Code, reuseRec.Body.String())
	}
	clearedRefresh := cookieByName(reuseRec.Result().Cookies(), auth.RefreshTokenCookieName)
	if clearedRefresh == nil || clearedRefresh.MaxAge >= 0 {
		t.Fatalf("expected reuse > 10s to clear refresh_token cookie, got %+v", clearedRefresh)
	}

	// Previously active token in the same family must now ALSO be rejected.
	revokedActiveRec := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
		[]*http.Cookie{activeRefresh, activeCSRF},
		map[string]string{middleware.CSRFHeaderName: activeCSRF.Value},
	)
	if revokedActiveRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected active token in revoked family to return 401, got %d: %s", revokedActiveRec.Code, revokedActiveRec.Body.String())
	}

	// 7. Login rate limit (5/min per IP+email) + generic error messages.
	for i := 0; i < 5; i++ {
		rec := doJSON(http.MethodPost, "/api/v1/auth/login", map[string]any{
			"email":    "integration@kindling.app",
			"password": "wrong-password-attempt",
		}, nil, nil)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("login wrong pw attempt %d expected 401, got %d", i+1, rec.Code)
		}
	}
	rlRec := doJSON(http.MethodPost, "/api/v1/auth/login", map[string]any{
		"email":    "integration@kindling.app",
		"password": "very-strong-password-2026",
	}, nil, nil)
	if rlRec.Code != http.StatusTooManyRequests {
		t.Fatalf("6th login attempt expected 429, got %d: %s", rlRec.Code, rlRec.Body.String())
	}
	if rlRec.Header().Get("Retry-After") == "" {
		t.Fatal("expected Retry-After header on 429 response")
	}

	// 8. Logout revokes family and clears cookies (register a fresh user to avoid the login RL above).
	reg2Rec := doJSON(http.MethodPost, "/api/v1/auth/register", map[string]any{
		"email":      "logout-test@kindling.app",
		"password":   "very-strong-password-2026",
		"full_name":  "Logout Tester",
		"ai_consent": true,
	}, nil, nil)
	if reg2Rec.Code != http.StatusCreated {
		t.Fatalf("register user 2 expected 201, got %d", reg2Rec.Code)
	}
	u2Cookies := reg2Rec.Result().Cookies()
	u2Refresh := cookieByName(u2Cookies, auth.RefreshTokenCookieName)
	u2CSRF := cookieByName(u2Cookies, middleware.CSRFCookieName)

	logoutRec := doJSON(http.MethodPost, "/api/v1/auth/logout", nil,
		[]*http.Cookie{u2Refresh, u2CSRF},
		map[string]string{middleware.CSRFHeaderName: u2CSRF.Value},
	)
	if logoutRec.Code != http.StatusOK {
		t.Fatalf("logout expected 200, got %d: %s", logoutRec.Code, logoutRec.Body.String())
	}
	afterLogoutRefresh := doJSON(http.MethodPost, "/api/v1/auth/refresh", nil,
		[]*http.Cookie{u2Refresh, u2CSRF},
		map[string]string{middleware.CSRFHeaderName: u2CSRF.Value},
	)
	if afterLogoutRefresh.Code != http.StatusUnauthorized {
		t.Fatalf("refresh after logout expected 401, got %d", afterLogoutRefresh.Code)
	}
}
