package wins

import "net/http"

// RegisterRoutes mounts the 3 Daily Wins endpoints on the provided ServeMux (PRD §7.4).
// Middleware order on AI mutation endpoints: Auth -> Idempotency -> AI RateLimit (10 req/min/user) -> Handler.
func RegisterRoutes(
	mux *http.ServeMux,
	h *Handler,
	authMiddleware func(http.Handler) http.Handler,
	aiRateLimitMiddleware func(http.Handler) http.Handler,
	sliceTaskIdempotencyMiddleware func(http.Handler) http.Handler,
	recalibrateIdempotencyMiddleware func(http.Handler) http.Handler,
	swapIdempotencyMiddleware func(http.Handler) http.Handler,
) {
	sliceTask := http.Handler(http.HandlerFunc(h.SliceTask))
	if aiRateLimitMiddleware != nil {
		sliceTask = aiRateLimitMiddleware(sliceTask)
	}
	if sliceTaskIdempotencyMiddleware != nil {
		sliceTask = sliceTaskIdempotencyMiddleware(sliceTask)
	}
	if authMiddleware != nil {
		sliceTask = authMiddleware(sliceTask)
	}

	recalibrate := http.Handler(http.HandlerFunc(h.Recalibrate))
	if aiRateLimitMiddleware != nil {
		recalibrate = aiRateLimitMiddleware(recalibrate)
	}
	if recalibrateIdempotencyMiddleware != nil {
		recalibrate = recalibrateIdempotencyMiddleware(recalibrate)
	}
	if authMiddleware != nil {
		recalibrate = authMiddleware(recalibrate)
	}

	swap := http.Handler(http.HandlerFunc(h.Swap))
	if aiRateLimitMiddleware != nil {
		swap = aiRateLimitMiddleware(swap)
	}
	if swapIdempotencyMiddleware != nil {
		swap = swapIdempotencyMiddleware(swap)
	}
	if authMiddleware != nil {
		swap = authMiddleware(swap)
	}

	toggle := http.Handler(http.HandlerFunc(h.Toggle))
	if authMiddleware != nil {
		toggle = authMiddleware(toggle)
	}

	mux.Handle("POST /api/v1/wins/{date}/slice-task", sliceTask)
	mux.Handle("POST /api/v1/wins/{date}/recalibrate", recalibrate)
	mux.Handle("POST /api/v1/wins/{date}/swap", swap)
	mux.Handle("PATCH /api/v1/wins/{date}/toggle", toggle)
}
