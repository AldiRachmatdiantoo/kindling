package checkin

import "net/http"

// RegisterRoutes mounts the check-in and positive cope endpoints on the provided ServeMux.
// Middleware order on POST /checkin: Auth -> Idempotency -> AI RateLimit (10 req/min/user) -> Handler.
func RegisterRoutes(
	mux *http.ServeMux,
	h *Handler,
	authMiddleware func(http.Handler) http.Handler,
	aiRateLimitMiddleware func(http.Handler) http.Handler,
	checkinIdempotencyMiddleware func(http.Handler) http.Handler,
) {
	postCheckin := http.Handler(http.HandlerFunc(h.SubmitCheckin))
	if aiRateLimitMiddleware != nil {
		postCheckin = aiRateLimitMiddleware(postCheckin)
	}
	if checkinIdempotencyMiddleware != nil {
		postCheckin = checkinIdempotencyMiddleware(postCheckin)
	}
	if authMiddleware != nil {
		postCheckin = authMiddleware(postCheckin)
	}

	getToday := http.Handler(http.HandlerFunc(h.GetToday))
	getByDate := http.Handler(http.HandlerFunc(h.GetByDate))
	patchCope := http.Handler(http.HandlerFunc(h.ChooseCope))
	if authMiddleware != nil {
		getToday = authMiddleware(getToday)
		getByDate = authMiddleware(getByDate)
		patchCope = authMiddleware(patchCope)
	}

	mux.Handle("POST /api/v1/checkin", postCheckin)
	mux.Handle("GET /api/v1/checkin/today", getToday)
	mux.Handle("GET /api/v1/checkin/{date}", getByDate)
	mux.Handle("PATCH /api/v1/checkin/{date}/cope", patchCope)
}
