package middleware

import (
	"crypto/subtle"
	"net/http"

	"github.com/kindling/backend/internal/shared"
)

const (
	CSRFCookieName = "csrf_token"
	CSRFHeaderName = "X-CSRF-Token"
)

// CSRF enforces double-submit cookie verification (X-CSRF-Token == csrf_token cookie)
// on all non-safe HTTP methods except the explicitly exempted paths (e.g. register/login).
func CSRF(exemptPaths ...string) func(http.Handler) http.Handler {
	exempt := make(map[string]struct{}, len(exemptPaths))
	for _, p := range exemptPaths {
		exempt[p] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				next.ServeHTTP(w, r)
				return
			}

			if _, ok := exempt[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}

			cookie, err := r.Cookie(CSRFCookieName)
			if err != nil || cookie.Value == "" {
				shared.WriteError(w, r, shared.ErrCSRFInvalid())
				return
			}

			headerVal := r.Header.Get(CSRFHeaderName)
			if headerVal == "" {
				shared.WriteError(w, r, shared.ErrCSRFInvalid())
				return
			}

			if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(headerVal)) != 1 {
				shared.WriteError(w, r, shared.ErrCSRFInvalid())
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
