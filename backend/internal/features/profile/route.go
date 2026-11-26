package profile

import "net/http"

// RegisterRoutes mounts the profile heatmap and insights endpoints on the provided ServeMux (PRD §7.5).
func RegisterRoutes(
	mux *http.ServeMux,
	h *Handler,
	authMiddleware func(http.Handler) http.Handler,
) {
	getHeatmap := http.Handler(http.HandlerFunc(h.GetHeatmap))
	if authMiddleware != nil {
		getHeatmap = authMiddleware(getHeatmap)
	}

	mux.Handle("GET /api/v1/profile/heatmap", getHeatmap)

	getInsights := http.Handler(http.HandlerFunc(h.GetInsights))
	if authMiddleware != nil {
		getInsights = authMiddleware(getInsights)
	}
	mux.Handle("GET /api/v1/profile/insights", getInsights)
}
