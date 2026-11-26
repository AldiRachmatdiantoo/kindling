package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/config"
	"github.com/kindling/backend/internal/features/auth"
	"github.com/kindling/backend/internal/features/checkin"
	"github.com/kindling/backend/internal/features/profile"
	"github.com/kindling/backend/internal/features/wins"
	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/shared"
	"github.com/kindling/backend/pkg/ai"
)

type Dependencies struct {
	Config           *config.Config
	Logger           *slog.Logger
	Pool             *pgxpool.Pool
	Redis            *redis.Client
	Limiter          *cache.RateLimiter
	IdempotencyStore *cache.IdempotencyStore
	AIProvider       ai.AiProvider
	Clock            func() time.Time
}

// NewHandler wires the HTTP router and global middleware chain.
func NewHandler(deps Dependencies) http.Handler {
	mux := http.NewServeMux()

	// Health endpoints (excluded from IP rate limiting so container/LB probes stay reliable).
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		if deps.Config != nil && deps.Config.InstanceID != "" {
			w.Header().Set("X-Instance-ID", deps.Config.InstanceID)
		}
		shared.WriteSuccess(w, r, http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	mux.HandleFunc("GET /api/v1/health/ready", func(w http.ResponseWriter, r *http.Request) {
		if deps.Config != nil && deps.Config.InstanceID != "" {
			w.Header().Set("X-Instance-ID", deps.Config.InstanceID)
		}

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		pgStatus := "ok"
		redisStatus := "ok"
		ready := true

		if deps.Pool == nil {
			pgStatus = "unavailable"
			ready = false
		} else if err := deps.Pool.Ping(ctx); err != nil {
			pgStatus = "error"
			ready = false
		}

		if deps.Redis == nil {
			redisStatus = "unavailable"
			ready = false
		} else if err := deps.Redis.Ping(ctx).Err(); err != nil {
			redisStatus = "error"
			ready = false
		}

		if !ready {
			shared.WriteError(w, r, shared.NewAppError(
				http.StatusServiceUnavailable,
				"NOT_READY",
				"One or more dependencies are not ready",
				map[string]any{
					"postgres": pgStatus,
					"redis":    redisStatus,
				},
			))
			return
		}

		shared.WriteSuccess(w, r, http.StatusOK, map[string]string{
			"status":   "ready",
			"postgres": pgStatus,
			"redis":    redisStatus,
		})
	})

	// Rate-limited & CSRF-protected API sub-router for feature modules (Modul 2–4).
	apiMux := http.NewServeMux()
	apiMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		shared.WriteError(w, r, shared.ErrNotFound("Endpoint not found"))
	})

	if deps.Pool != nil && deps.Config != nil {
		tokenMgr := auth.NewTokenManager(deps.Config.JWTSecret)
		authRepo := auth.NewPostgresRepository(deps.Pool)
		authSvc := auth.NewService(authRepo, tokenMgr, deps.Limiter, deps.Logger)
		if deps.Clock != nil {
			authSvc.WithClock(deps.Clock)
		}
		authHandler := auth.NewHandler(authSvc, deps.Config.CookieSecure)
		authMW := middleware.Auth(tokenMgr)
		auth.RegisterRoutes(apiMux, authHandler, authMW)

		aiProvider := deps.AIProvider
		if aiProvider == nil {
			if deps.Config.AIProvider == "gemini" {
				aiProvider = ai.NewGeminiProvider(ai.GeminiConfig{
					APIKey:  deps.Config.GeminiAPIKey,
					Model:   deps.Config.GeminiModel,
					Timeout: deps.Config.LLMTimeout,
				})
			} else {
				aiProvider = ai.NewMockAiProvider()
			}
		}

		idemStore := deps.IdempotencyStore
		if idemStore == nil && deps.Redis != nil {
			idemStore = cache.NewIdempotencyStore(deps.Redis)
		}

		checkinRepo := checkin.NewPostgresRepository(deps.Pool)
		checkinSvc := checkin.NewService(checkinRepo, aiProvider, deps.Logger)
		if deps.Clock != nil {
			checkinSvc.WithClock(deps.Clock)
		}
		checkinHandler := checkin.NewHandler(checkinSvc)
		aiRateLimitMW := middleware.RateLimitByUser(deps.Limiter, deps.Logger, "ai", 10, time.Minute)
		checkinIdemMW := middleware.Idempotency(idemStore, "POST:/checkin", deps.Logger)
		checkin.RegisterRoutes(apiMux, checkinHandler, authMW, aiRateLimitMW, checkinIdemMW)

		winsRepo := wins.NewPostgresRepository(deps.Pool)
		winsSvc := wins.NewService(winsRepo, aiProvider, deps.Logger)
		if deps.Clock != nil {
			winsSvc.WithClock(deps.Clock)
		}
		winsHandler := wins.NewHandler(winsSvc)
		sliceTaskIdemMW := middleware.Idempotency(idemStore, "POST:/wins/slice-task", deps.Logger)
		recalibrateIdemMW := middleware.Idempotency(idemStore, "POST:/wins/recalibrate", deps.Logger)
		wins.RegisterRoutes(apiMux, winsHandler, authMW, aiRateLimitMW, sliceTaskIdemMW, recalibrateIdemMW)

		profileRepo := profile.NewPostgresRepository(deps.Pool)
		profileSvc := profile.NewService(profileRepo)
		if deps.Clock != nil {
			profileSvc.WithClock(deps.Clock)
		}
		profileHandler := profile.NewHandler(profileSvc)
		profile.RegisterRoutes(apiMux, profileHandler, authMW)
	}

	csrfMW := middleware.CSRF(
		"/api/v1/auth/register",
		"/api/v1/auth/login",
	)
	generalRL := middleware.RateLimitByIP(deps.Limiter, deps.Logger, "global", 60, time.Minute)
	mux.Handle("/api/v1/", generalRL(csrfMW(apiMux)))

	handler := middleware.Chain(
		mux,
		middleware.RequestID,
		middleware.RealIP(deps.Config.TrustedProxyCIDRs),
		middleware.SecurityHeaders,
		middleware.Recoverer(deps.Logger),
		middleware.AccessLog(deps.Logger),
	)

	return handler
}
