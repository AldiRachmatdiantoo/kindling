package checkin

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/kindling/backend/internal/shared"
)

const maxCheckinBodyBytes = 64 * 1024 // 64 KiB

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) SubmitCheckin(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req CheckinRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	resp, err := h.service.SubmitCheckin(r.Context(), userID, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) GetToday(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	resp, err := h.service.GetToday(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) GetByDate(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	dateStr := r.PathValue("date")
	resp, err := h.service.GetByDate(r.Context(), userID, dateStr)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) ChooseCope(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req CopeUpdateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	dateStr := r.PathValue("date")
	resp, err := h.service.ChooseCope(r.Context(), userID, dateStr, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) *shared.AppError {
	r.Body = http.MaxBytesReader(w, r.Body, maxCheckinBodyBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return shared.ErrValidation("Malformed JSON request body", nil)
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return shared.ErrValidation("Request body must contain a single JSON object", nil)
	}
	return nil
}
