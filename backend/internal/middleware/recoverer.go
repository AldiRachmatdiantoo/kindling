package middleware

import (
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/kindling/backend/internal/shared"
)

// Recoverer catches panics, logs them structurally without sensitive request bodies, and returns 500 INTERNAL.
func Recoverer(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rec := recover(); rec != nil {
					if logger != nil {
						logger.Error("panic recovered",
							"request_id", shared.RequestIDFromContext(r.Context()),
							"method", r.Method,
							"path", r.URL.Path,
							"panic", rec,
							"stack", string(debug.Stack()),
						)
					}
					shared.WriteError(w, r, shared.ErrInternal(nil))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}
