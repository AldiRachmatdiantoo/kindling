package shared

import (
	"encoding/json"
	"errors"
	"net/http"
)

type Meta struct {
	RequestID string `json:"request_id"`
}

type SuccessEnvelope struct {
	Success bool `json:"success"`
	Data    any  `json:"data"`
	Meta    Meta `json:"meta"`
}

type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type ErrorEnvelope struct {
	Success bool      `json:"success"`
	Error   ErrorBody `json:"error"`
	Meta    Meta      `json:"meta"`
}

func WriteSuccess(w http.ResponseWriter, r *http.Request, status int, data any) {
	resp := SuccessEnvelope{
		Success: true,
		Data:    data,
		Meta:    Meta{RequestID: RequestIDFromContext(r.Context())},
	}
	writeJSON(w, status, resp)
}

func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *AppError
	if !errors.As(err, &appErr) {
		appErr = ErrInternal(err)
	}

	details := appErr.Details
	if details == nil {
		details = map[string]any{}
	}

	resp := ErrorEnvelope{
		Success: false,
		Error: ErrorBody{
			Code:    appErr.Code,
			Message: appErr.Message,
			Details: details,
		},
		Meta: Meta{RequestID: RequestIDFromContext(r.Context())},
	}
	writeJSON(w, appErr.HTTPStatus, resp)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	buf, err := json.Marshal(payload)
	if err != nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"success":false,"error":{"code":"INTERNAL","message":"Failed to encode response","details":{}},"meta":{"request_id":""}}`))
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(buf)
}
