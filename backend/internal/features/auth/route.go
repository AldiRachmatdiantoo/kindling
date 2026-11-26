package auth

import "net/http"

// RegisterRoutes mounts the auth feature endpoints on the provided ServeMux.
func RegisterRoutes(mux *http.ServeMux, h *Handler, authMiddleware func(http.Handler) http.Handler) {
	mux.HandleFunc("POST /api/v1/auth/register", h.Register)
	mux.HandleFunc("POST /api/v1/auth/login", h.Login)
	mux.Handle("GET /api/v1/auth/me", authMiddleware(http.HandlerFunc(h.Me)))
	mux.HandleFunc("POST /api/v1/auth/refresh", h.Refresh)
	mux.HandleFunc("POST /api/v1/auth/logout", h.Logout)
}
