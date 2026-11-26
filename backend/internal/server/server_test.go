package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kindling/backend/internal/config"
	"github.com/kindling/backend/internal/server"
	"github.com/kindling/backend/internal/shared"
)

func TestHealthEndpoints(t *testing.T) {
	cfg := &config.Config{
		AppEnv:     "test",
		InstanceID: "api-1",
	}
	h := server.NewHandler(server.Dependencies{
		Config: cfg,
	})

	t.Run("GET /api/v1/health returns 200 ok", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if rec.Header().Get("X-Instance-ID") != "api-1" {
			t.Fatalf("expected X-Instance-ID api-1, got %q", rec.Header().Get("X-Instance-ID"))
		}
		if rec.Header().Get("X-Request-ID") == "" {
			t.Fatal("expected X-Request-ID header")
		}

		var env struct {
			Success bool              `json:"success"`
			Data    map[string]string `json:"data"`
			Meta    shared.Meta       `json:"meta"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if !env.Success || env.Data["status"] != "ok" {
			t.Fatalf("unexpected body: %+v", env)
		}
	})

	t.Run("GET /api/v1/health/ready returns 503 when dependencies nil", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health/ready", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected 503, got %d", rec.Code)
		}
	})

	t.Run("unknown API route returns 404 NOT_FOUND envelope", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/does-not-exist", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", rec.Code)
		}
		var env shared.ErrorEnvelope
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if env.Error.Code != shared.CodeNotFound {
			t.Fatalf("expected NOT_FOUND, got %s", env.Error.Code)
		}
	})
}
