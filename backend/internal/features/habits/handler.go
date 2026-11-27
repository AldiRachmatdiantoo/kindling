package habits

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/shared"
)

const maxHabitsBodyBytes = 8 * 1024

// Service validates and stores habits.
type Service struct {
	repo Repository
}

func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Get(ctx context.Context, userID uuid.UUID) (HabitsData, error) {
	return s.repo.List(ctx, userID)
}

func (s *Service) Put(ctx context.Context, userID uuid.UUID, req HabitsData) (HabitsData, error) {
	clean, valErr := req.Validate()
	if valErr != nil {
		return HabitsData{}, valErr
	}
	return s.repo.Replace(ctx, userID, clean)
}

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}
	resp, err := h.service.Get(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}
	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) Put(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxHabitsBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var req HabitsData
	if err := dec.Decode(&req); err != nil {
		shared.WriteError(w, r, shared.ErrValidation("Malformed JSON request body", nil))
		return
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		shared.WriteError(w, r, shared.ErrValidation("Request body must contain a single JSON object", nil))
		return
	}

	resp, err := h.service.Put(r.Context(), userID, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}
	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

// RegisterRoutes mounts GET and PUT /api/v1/habits.
func RegisterRoutes(mux *http.ServeMux, h *Handler, authMiddleware func(http.Handler) http.Handler) {
	get := http.Handler(http.HandlerFunc(h.Get))
	put := http.Handler(http.HandlerFunc(h.Put))
	if authMiddleware != nil {
		get = authMiddleware(get)
		put = authMiddleware(put)
	}
	mux.Handle("GET /api/v1/habits", get)
	mux.Handle("PUT /api/v1/habits", put)
}
