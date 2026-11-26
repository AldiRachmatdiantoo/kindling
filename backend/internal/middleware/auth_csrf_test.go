package middleware_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/shared"
)

func TestCSRFMiddleware(t *testing.T) {
	okHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		shared.WriteSuccess(w, r, http.StatusOK, map[string]bool{"ok": true})
	})

	h := middleware.CSRF("/api/v1/auth/register", "/api/v1/auth/login")(okHandler)

	t.Run("GET is exempt from CSRF", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})

	t.Run("exempt paths skip CSRF on POST", func(t *testing.T) {
		for _, path := range []string{"/api/v1/auth/register", "/api/v1/auth/login"} {
			req := httptest.NewRequest(http.MethodPost, path, nil)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("path %s: expected 200, got %d", path, rec.Code)
			}
		}
	})

	t.Run("POST without X-CSRF-Token returns 403 CSRF_INVALID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "token-abc"})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", rec.Code)
		}
		var env shared.ErrorEnvelope
		if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if env.Error.Code != shared.CodeCSRFInvalid {
			t.Fatalf("expected CSRF_INVALID, got %s", env.Error.Code)
		}
	})

	t.Run("POST with mismatched CSRF token returns 403 CSRF_INVALID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "token-abc"})
		req.Header.Set(middleware.CSRFHeaderName, "token-xyz")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403, got %d", rec.Code)
		}
	})

	t.Run("POST with matching CSRF cookie and header succeeds", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", nil)
		req.AddCookie(&http.Cookie{Name: middleware.CSRFCookieName, Value: "matching-token"})
		req.Header.Set(middleware.CSRFHeaderName, "matching-token")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
	})
}

func TestAuthMiddleware(t *testing.T) {
	expectedUser := shared.MustUUIDv7()
	verifier := middleware.AccessTokenVerifierFunc(func(token string) (uuid.UUID, error) {
		if token == "valid-jwt" {
			return expectedUser, nil
		}
		return uuid.Nil, errors.New("invalid token")
	})

	var gotUserID uuid.UUID
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, ok := shared.UserIDFromContext(r.Context())
		if !ok {
			t.Error("expected user ID in context")
		}
		gotUserID = uid
		w.WriteHeader(http.StatusOK)
	})

	h := middleware.Auth(verifier)(next)

	t.Run("missing cookie returns 401 UNAUTHENTICATED", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("invalid token returns 401 UNAUTHENTICATED", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.AddCookie(&http.Cookie{Name: middleware.AccessTokenCookieName, Value: "bad-jwt"})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401, got %d", rec.Code)
		}
	})

	t.Run("valid token attaches user ID to context", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.AddCookie(&http.Cookie{Name: middleware.AccessTokenCookieName, Value: "valid-jwt"})
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		if gotUserID != expectedUser {
			t.Fatalf("expected user %s, got %s", expectedUser, gotUserID)
		}
	})
}
