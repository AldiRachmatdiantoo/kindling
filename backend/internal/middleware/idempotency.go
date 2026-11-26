package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/shared"
)

const (
	IdempotencyKeyHeader   = "Idempotency-Key"
	maxIdempotentBodyBytes = 64 * 1024 // 64 KiB
)

// IdempotencyBackend abstracts Redis idempotency storage for middleware testing.
type IdempotencyBackend interface {
	Acquire(ctx context.Context, redisKey, bodyHash string) (cache.IdempotencyAcquireResult, error)
	Complete(ctx context.Context, redisKey, bodyHash string, statusCode int, contentType string, responseBody []byte) error
	Release(ctx context.Context, redisKey string) error
}

// Idempotency enforces PRD §7.0 Idempotency-Key semantics for AI mutation endpoints.
// Must run after Auth middleware so UserIDFromContext is populated.
func Idempotency(store IdempotencyBackend, route string, logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rawKey := strings.TrimSpace(r.Header.Get(IdempotencyKeyHeader))
			if rawKey == "" {
				shared.WriteError(w, r, shared.ErrValidation(
					"Idempotency-Key header is required",
					map[string]any{"Idempotency-Key": "required UUID"},
				))
				return
			}
			parsedKey, err := uuid.Parse(rawKey)
			if err != nil {
				shared.WriteError(w, r, shared.ErrValidation(
					"Idempotency-Key header must be a valid UUID",
					map[string]any{"Idempotency-Key": "must be a valid UUID"},
				))
				return
			}

			if store == nil {
				next.ServeHTTP(w, r)
				return
			}

			userID, ok := shared.UserIDFromContext(r.Context())
			if !ok {
				shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
				return
			}

			limited := http.MaxBytesReader(w, r.Body, maxIdempotentBodyBytes)
			bodyBytes, err := io.ReadAll(limited)
			if err != nil {
				shared.WriteError(w, r, shared.ErrValidation("Request body too large or unreadable", nil))
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(bodyBytes))

			sum := sha256.Sum256(bodyBytes)
			bodyHash := hex.EncodeToString(sum[:])
			redisKey := cache.IdempotencyKey(userID.String(), route, parsedKey.String())

			res, err := store.Acquire(r.Context(), redisKey, bodyHash)
			if err != nil {
				if logger != nil {
					logger.Error("idempotency acquire error",
						"request_id", shared.RequestIDFromContext(r.Context()),
						"route", route,
						"err", err,
					)
				}
				shared.WriteError(w, r, shared.ErrInternal(err))
				return
			}

			switch res.State {
			case cache.IdempotencyKeyReused:
				shared.WriteError(w, r, shared.ErrIdempotencyKeyReused())
				return
			case cache.IdempotencyInProgress:
				shared.WriteError(w, r, shared.ErrIdempotencyInProgress())
				return
			case cache.IdempotencyReplay:
				ct := res.Record.ContentType
				if ct == "" {
					ct = "application/json; charset=utf-8"
				}
				w.Header().Set("Content-Type", ct)
				w.Header().Set("Idempotency-Replayed", "true")
				status := res.Record.StatusCode
				if status == 0 {
					status = http.StatusOK
				}
				w.WriteHeader(status)
				_, _ = w.Write(res.Record.ResponseBody)
				return
			}

			rec := &responseCapture{
				header: make(http.Header),
				status: http.StatusOK,
			}

			// Guard against panic leaving the processing lock dangling.
			completed := false
			defer func() {
				if !completed {
					relCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					defer cancel()
					_ = store.Release(relCtx, redisKey)
				}
			}()

			next.ServeHTTP(rec, r)

			// Copy headers from downstream handler.
			for k, vals := range rec.header {
				for _, v := range vals {
					w.Header().Add(k, v)
				}
			}

			// PRD §7.0: 5xx responses (and transient 429 rate-limits) are NOT cached; delete the key so clients can retry.
			if rec.status >= http.StatusInternalServerError || rec.status == http.StatusTooManyRequests {
				relCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				if err := store.Release(relCtx, redisKey); err != nil && logger != nil {
					logger.Error("idempotency release error", "request_id", shared.RequestIDFromContext(r.Context()), "err", err)
				}
				completed = true
			} else {
				saveCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				ct := rec.header.Get("Content-Type")
				if err := store.Complete(saveCtx, redisKey, bodyHash, rec.status, ct, rec.body.Bytes()); err != nil && logger != nil {
					logger.Error("idempotency complete error", "request_id", shared.RequestIDFromContext(r.Context()), "err", err)
				}
				completed = true
			}

			w.WriteHeader(rec.status)
			_, _ = w.Write(rec.body.Bytes())
		})
	}
}

type responseCapture struct {
	header      http.Header
	body        bytes.Buffer
	status      int
	wroteHeader bool
}

func (c *responseCapture) Header() http.Header {
	return c.header
}

func (c *responseCapture) WriteHeader(code int) {
	if c.wroteHeader {
		return
	}
	c.status = code
	c.wroteHeader = true
}

func (c *responseCapture) Write(p []byte) (int, error) {
	if !c.wroteHeader {
		c.WriteHeader(http.StatusOK)
	}
	return c.body.Write(p)
}
