package auth

import (
	"net/mail"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode/utf8"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
)

const (
	DefaultTimezone = "Asia/Jakarta"
	MinPasswordLen  = 10
	MaxPasswordLen  = 128
	MaxEmailLen     = 255
	MaxFullNameLen  = 120
)

type RegisterRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FullName  string `json:"full_name"`
	Timezone  string `json:"timezone,omitempty"`
	AIConsent bool   `json:"ai_consent"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UserDTO struct {
	ID       uuid.UUID `json:"id"`
	Email    string    `json:"email"`
	FullName string    `json:"full_name"`
	Timezone string    `json:"timezone"`
}

type AuthResponse struct {
	User UserDTO `json:"user"`
}

type RefreshResponse struct {
	Refreshed bool `json:"refreshed"`
}

type LogoutResponse struct {
	LoggedOut bool `json:"logged_out"`
}

type SessionTokens struct {
	AccessToken  string
	RefreshToken string
	CSRFToken    string
}

func userToDTO(u sqlc.User) UserDTO {
	return UserDTO{
		ID:       u.ID,
		Email:    u.Email,
		FullName: u.FullName,
		Timezone: u.Timezone,
	}
}

func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func isValidEmail(email string) bool {
	if email == "" || len(email) > MaxEmailLen {
		return false
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[0] == "" || !strings.Contains(parts[1], ".") {
		return false
	}
	return true
}

func (r *RegisterRequest) NormalizeAndValidate() *shared.AppError {
	details := map[string]any{}

	r.Email = normalizeEmail(r.Email)
	if !isValidEmail(r.Email) {
		details["email"] = "must be a valid email address"
	}

	pwRunes := utf8.RuneCountInString(r.Password)
	if pwRunes < MinPasswordLen || len(r.Password) > MaxPasswordLen {
		details["password"] = "must be between 10 and 128 characters"
	}

	r.FullName = strings.TrimSpace(r.FullName)
	nameRunes := utf8.RuneCountInString(r.FullName)
	if nameRunes == 0 || nameRunes > MaxFullNameLen {
		details["full_name"] = "must be between 1 and 120 characters"
	}

	r.Timezone = strings.TrimSpace(r.Timezone)
	if r.Timezone == "" {
		r.Timezone = DefaultTimezone
	} else if _, err := time.LoadLocation(r.Timezone); err != nil {
		details["timezone"] = "must be a valid IANA timezone"
	}

	if !r.AIConsent {
		details["ai_consent"] = "must be accepted to register"
	}

	if len(details) > 0 {
		return shared.ErrValidation("Invalid registration input", details)
	}
	return nil
}

func (r *LoginRequest) NormalizeAndValidate() *shared.AppError {
	details := map[string]any{}

	r.Email = normalizeEmail(r.Email)
	if !isValidEmail(r.Email) {
		details["email"] = "must be a valid email address"
	}
	if r.Password == "" || len(r.Password) > MaxPasswordLen {
		details["password"] = "is required"
	}

	if len(details) > 0 {
		return shared.ErrValidation("Invalid login input", details)
	}
	return nil
}
