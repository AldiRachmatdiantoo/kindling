package wins

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/kindling/backend/internal/shared"
)

const maxWinsBodyBytes = 16 * 1024 // 16 KiB

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) SliceTask(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req SliceTaskRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	dateStr := r.PathValue("date")
	resp, err := h.service.SliceTask(r.Context(), userID, dateStr, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) Recalibrate(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req RecalibrateRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	dateStr := r.PathValue("date")
	resp, err := h.service.Recalibrate(r.Context(), userID, dateStr, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) Swap(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req SwapWinRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	resp, err := h.service.SwapWin(r.Context(), userID, r.PathValue("date"), req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}
	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func (h *Handler) Toggle(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	var req ToggleWinRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	dateStr := r.PathValue("date")
	resp, err := h.service.Toggle(r.Context(), userID, dateStr, req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, resp)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) *shared.AppError {
	r.Body = http.MaxBytesReader(w, r.Body, maxWinsBodyBytes)
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
