package auth

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/kindling/backend/internal/middleware"
	"github.com/kindling/backend/internal/shared"
)

const (
	RefreshTokenCookieName = "refresh_token"
	maxAuthBodyBytes       = 64 * 1024 // 64 KiB
)

type Handler struct {
	service      *Service
	cookieSecure bool
}

func NewHandler(service *Service, cookieSecure bool) *Handler {
	return &Handler{
		service:      service,
		cookieSecure: cookieSecure,
	}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	user, tokens, err := h.service.Register(r.Context(), req)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	h.setSessionCookies(w, tokens)
	shared.WriteSuccess(w, r, http.StatusCreated, AuthResponse{User: user})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	clientIP := shared.ClientIPFromContext(r.Context())
	user, tokens, err := h.service.Login(r.Context(), req, clientIP)
	if err != nil {
		var rlErr *RateLimitError
		if errors.As(err, &rlErr) {
			secs := int(rlErr.RetryAfter.Seconds())
			if secs < 1 {
				secs = 1
			}
			w.Header().Set("Retry-After", strconv.Itoa(secs))
		}
		shared.WriteError(w, r, err)
		return
	}

	h.setSessionCookies(w, tokens)
	shared.WriteSuccess(w, r, http.StatusOK, AuthResponse{User: user})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := shared.UserIDFromContext(r.Context())
	if !ok {
		shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
		return
	}

	user, err := h.service.Me(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, r, err)
		return
	}

	shared.WriteSuccess(w, r, http.StatusOK, AuthResponse{User: user})
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var rawRefresh string
	if c, err := r.Cookie(RefreshTokenCookieName); err == nil {
		rawRefresh = c.Value
	}

	tokens, clearCookies, err := h.service.Refresh(r.Context(), rawRefresh)
	if err != nil {
		if clearCookies {
			h.clearSessionCookies(w)
		}
		shared.WriteError(w, r, err)
		return
	}

	h.setSessionCookies(w, tokens)
	shared.WriteSuccess(w, r, http.StatusOK, RefreshResponse{Refreshed: true})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	var rawRefresh string
	if c, err := r.Cookie(RefreshTokenCookieName); err == nil {
		rawRefresh = c.Value
	}

	if err := h.service.Logout(r.Context(), rawRefresh); err != nil {
		shared.WriteError(w, r, err)
		return
	}

	h.clearSessionCookies(w)
	shared.WriteSuccess(w, r, http.StatusOK, LogoutResponse{LoggedOut: true})
}

func (h *Handler) setSessionCookies(w http.ResponseWriter, tokens SessionTokens) {
	http.SetCookie(w, &http.Cookie{
		Name:     middleware.AccessTokenCookieName,
		Value:    tokens.AccessToken,
		Path:     "/api/v1",
		MaxAge:   int(AccessTokenTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     RefreshTokenCookieName,
		Value:    tokens.RefreshToken,
		Path:     "/api/v1/auth",
		MaxAge:   int(RefreshTokenTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    tokens.CSRFToken,
		Path:     "/",
		MaxAge:   int(RefreshTokenTTL.Seconds()),
		HttpOnly: false, // Readable by JS for CSRF double-submit (PRD §7.2 & NFR-04).
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func (h *Handler) clearSessionCookies(w http.ResponseWriter) {
	expired := time.Unix(0, 0).UTC()

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.AccessTokenCookieName,
		Value:    "",
		Path:     "/api/v1",
		MaxAge:   -1,
		Expires:  expired,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     RefreshTokenCookieName,
		Value:    "",
		Path:     "/api/v1/auth",
		MaxAge:   -1,
		Expires:  expired,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})

	http.SetCookie(w, &http.Cookie{
		Name:     middleware.CSRFCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Expires:  expired,
		HttpOnly: false,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteStrictMode,
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) *shared.AppError {
	r.Body = http.MaxBytesReader(w, r.Body, maxAuthBodyBytes)
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
