package middleware

import (
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/shared"
)

// RateLimitByIP enforces a Redis Lua sliding-window rate limit per client IP.
func RateLimitByIP(limiter *cache.RateLimiter, logger *slog.Logger, scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if limiter == nil {
				next.ServeHTTP(w, r)
				return
			}

			ip := shared.ClientIPFromContext(r.Context())
			if ip == "" {
				ip = "unknown"
			}
			key := fmt.Sprintf("rl:%s:ip:%s", scope, ip)

			res, err := limiter.Allow(r.Context(), key, limit, window)
			if err != nil {
				// Fail open on transient Redis error so liveness/API stays available, but log it.
				if logger != nil {
					logger.Error("rate limiter error", "request_id", shared.RequestIDFromContext(r.Context()), "err", err)
				}
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(res.Remaining))

			if !res.Allowed {
				retrySecs := int(res.RetryAfter.Seconds())
				if retrySecs < 1 {
					retrySecs = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(retrySecs))
				shared.WriteError(w, r, shared.ErrRateLimited())
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// RateLimitByUser enforces a Redis Lua sliding-window rate limit per authenticated user (PRD NFR-02, §7.0).
// Must run after Auth middleware so UserIDFromContext is populated.
func RateLimitByUser(limiter *cache.RateLimiter, logger *slog.Logger, scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if limiter == nil {
				next.ServeHTTP(w, r)
				return
			}

			userID, ok := shared.UserIDFromContext(r.Context())
			if !ok {
				shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
				return
			}

			key := fmt.Sprintf("rl:%s:user:%s", scope, userID.String())
			res, err := limiter.Allow(r.Context(), key, limit, window)
			if err != nil {
				if logger != nil {
					logger.Error("user rate limiter error", "request_id", shared.RequestIDFromContext(r.Context()), "scope", scope, "err", err)
				}
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(res.Remaining))

			if !res.Allowed {
				retrySecs := int(res.RetryAfter.Seconds())
				if retrySecs < 1 {
					retrySecs = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(retrySecs))
				shared.WriteError(w, r, shared.ErrRateLimited())
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
