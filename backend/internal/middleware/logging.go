package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/kindling/backend/internal/shared"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

// AccessLog logs request metadata in structured JSON without logging request/response bodies (NFR-06).
func AccessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			if logger != nil {
				logger.Info("http request",
					"request_id", shared.RequestIDFromContext(r.Context()),
					"method", r.Method,
					"path", r.URL.Path,
					"status", rec.status,
					"latency_ms", time.Since(start).Milliseconds(),
					"client_ip", shared.ClientIPFromContext(r.Context()),
				)
			}
		})
	}
}

// Chain applies middlewares in the order listed (first middleware wraps outermost).
func Chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}
