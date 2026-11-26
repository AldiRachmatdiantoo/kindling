package profile

import (
	"net/http"

	"github.com/kindling/backend/internal/shared"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) GetHeatmap(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	resp, err := h.service.GetHeatmap(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}
