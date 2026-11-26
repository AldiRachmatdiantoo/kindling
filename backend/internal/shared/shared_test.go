package shared_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/kindling/backend/internal/shared"
)

func TestNewUUIDv7(t *testing.T) {
	id1, err := shared.NewUUIDv7()
	if err != nil {
		t.Fatalf("NewUUIDv7 failed: %v", err)
	}
	if id1.Version() != 7 {
		t.Fatalf("expected UUID version 7, got %d", id1.Version())
	}

	id2, err := shared.NewUUIDv7()
	if err != nil {
		t.Fatalf("NewUUIDv7 failed: %v", err)
	}
	if id1 == id2 {
		t.Fatalf("expected distinct UUIDs, got identical %s", id1)
	}
}

func TestValidateMutationDate(t *testing.T) {
	// 2026-11-26 10:00:00 +07:00 (Asia/Jakarta)
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}
	now := time.Date(2026, 11, 26, 10, 0, 0, 0, loc)

	tests := []struct {
		name    string
		dateStr string
		wantErr string
	}{
		{name: "today allowed", dateStr: "2026-11-26"},
		{name: "yesterday allowed", dateStr: "2026-11-25"},
		{name: "two days ago rejected", dateStr: "2026-11-24", wantErr: shared.CodeDateOutOfRange},
		{name: "tomorrow rejected", dateStr: "2026-11-27", wantErr: shared.CodeDateOutOfRange},
		{name: "bad format rejected", dateStr: "26-11-2026", wantErr: shared.CodeValidationError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := shared.ValidateMutationDate(tc.dateStr, "Asia/Jakarta", now)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error %s, got nil", tc.wantErr)
			}
			appErr, ok := err.(*shared.AppError)
			if !ok {
				t.Fatalf("expected *AppError, got %T", err)
			}
			if appErr.Code != tc.wantErr {
				t.Fatalf("expected error code %s, got %s", tc.wantErr, appErr.Code)
			}
		})
	}
}

func TestWriteEnvelopes(t *testing.T) {
	t.Run("success envelope", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
		req = req.WithContext(shared.WithRequestID(req.Context(), "req-123"))
		rec := httptest.NewRecorder()

		shared.WriteSuccess(rec, req, http.StatusOK, map[string]string{"status": "ok"})

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		var body shared.SuccessEnvelope
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !body.Success || body.Meta.RequestID != "req-123" {
			t.Fatalf("unexpected envelope: %+v", body)
		}
	})

	t.Run("error envelope", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/unknown", nil)
		req = req.WithContext(shared.WithRequestID(req.Context(), "req-456"))
		rec := httptest.NewRecorder()

		shared.WriteError(rec, req, shared.ErrNotFound("not here"))

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var body shared.ErrorEnvelope
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if body.Success || body.Error.Code != shared.CodeNotFound || body.Meta.RequestID != "req-456" {
			t.Fatalf("unexpected error envelope: %+v", body)
		}
	})
}
