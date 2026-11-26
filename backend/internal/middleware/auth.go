package middleware

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/shared"
)

const AccessTokenCookieName = "access_token"

// AccessTokenVerifier validates an access JWT and returns the authenticated user's UUID.
type AccessTokenVerifier interface {
	VerifyAccessToken(tokenString string) (uuid.UUID, error)
}

// AccessTokenVerifierFunc adapts a function to AccessTokenVerifier.
type AccessTokenVerifierFunc func(tokenString string) (uuid.UUID, error)

func (f AccessTokenVerifierFunc) VerifyAccessToken(tokenString string) (uuid.UUID, error) {
	return f(tokenString)
}

// Auth validates the HttpOnly access_token cookie and attaches the user ID to context.
func Auth(verifier AccessTokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if verifier == nil {
				shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
				return
			}

			cookie, err := r.Cookie(AccessTokenCookieName)
			if err != nil || cookie.Value == "" {
				shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
				return
			}

			userID, err := verifier.VerifyAccessToken(cookie.Value)
			if err != nil || userID == uuid.Nil {
				shared.WriteError(w, r, shared.ErrUnauthenticated("Authentication required"))
				return
			}

			ctx := shared.WithUserID(r.Context(), userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
