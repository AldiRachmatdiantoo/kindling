package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"

	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/shared"
)

func TestRealIPTrustedVsUntrusted(t *testing.T) {
	trusted := []netip.Prefix{netip.MustParsePrefix("172.16.0.0/12")}

	var gotIP string
	h := middleware.RealIP(trusted)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotIP = shared.ClientIPFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("trusted proxy honors X-Real-IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "172.18.0.5:54321"
		req.Header.Set("X-Real-IP", "203.0.113.42")
		h.ServeHTTP(httptest.NewRecorder(), req)
		if gotIP != "203.0.113.42" {
			t.Fatalf("expected 203.0.113.42, got %q", gotIP)
		}
	})

	t.Run("untrusted caller cannot spoof X-Real-IP", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.RemoteAddr = "198.51.100.7:12345"
		req.Header.Set("X-Real-IP", "203.0.113.99")
		h.ServeHTTP(httptest.NewRecorder(), req)
		if gotIP != "198.51.100.7" {
			t.Fatalf("expected 198.51.100.7, got %q", gotIP)
		}
	})
}

func TestRequestIDAndSecurityHeadersAndRecoverer(t *testing.T) {
	h := middleware.Chain(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			panic("boom")
		}),
		middleware.RequestID,
		middleware.SecurityHeaders,
		middleware.Recoverer(nil),
	)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/panic", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", rec.Code)
	}
	if rec.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected X-Request-ID header to be set")
	}
	if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatal("expected X-Content-Type-Options: nosniff")
	}
	if rec.Header().Get("X-Frame-Options") != "DENY" {
		t.Fatal("expected X-Frame-Options: DENY")
	}

	var env shared.ErrorEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if env.Error.Code != shared.CodeInternal {
		t.Fatalf("expected INTERNAL code, got %s", env.Error.Code)
	}
	if env.Meta.RequestID != rec.Header().Get("X-Request-ID") {
		t.Fatalf("request_id mismatch between body (%s) and header (%s)", env.Meta.RequestID, rec.Header().Get("X-Request-ID"))
	}
}
