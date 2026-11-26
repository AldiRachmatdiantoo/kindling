package shared

import (
	"fmt"
	"net/http"
)

// Error codes defined in PRD §7.0.
const (
	CodeValidationError        = "VALIDATION_ERROR"
	CodeUnauthenticated        = "UNAUTHENTICATED"
	CodeInvalidCredentials     = "INVALID_CREDENTIALS" //nolint:gosec // API error code constant, not a credential
	CodeCSRFInvalid            = "CSRF_INVALID"
	CodeNotFound               = "NOT_FOUND"
	CodeEmailTaken             = "EMAIL_TAKEN"
	CodeCheckinLocked          = "CHECKIN_LOCKED"
	CodeIdempotencyInProgress  = "IDEMPOTENCY_IN_PROGRESS"
	CodeConcurrentModification = "CONCURRENT_MODIFICATION"
	CodeIdempotencyKeyReused   = "IDEMPOTENCY_KEY_REUSED"
	CodeMinLevelReached        = "MIN_LEVEL_REACHED"
	CodeDateOutOfRange         = "DATE_OUT_OF_RANGE"
	CodeRateLimited            = "RATE_LIMITED"
	CodeInternal               = "INTERNAL"
)

// AppError represents a structured domain/HTTP error returned in the API error envelope.
type AppError struct {
	HTTPStatus int            `json:"-"`
	Code       string         `json:"code"`
	Message    string         `json:"message"`
	Details    map[string]any `json:"details,omitempty"`
	Cause      error          `json:"-"`
}

func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("%s: %s (%v)", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func (e *AppError) Unwrap() error {
	return e.Cause
}

func NewAppError(status int, code, message string, details map[string]any) *AppError {
	return &AppError{
		HTTPStatus: status,
		Code:       code,
		Message:    message,
		Details:    details,
	}
}

func ErrValidation(message string, details map[string]any) *AppError {
	return NewAppError(http.StatusBadRequest, CodeValidationError, message, details)
}

func ErrUnauthenticated(message string) *AppError {
	if message == "" {
		message = "Authentication required"
	}
	return NewAppError(http.StatusUnauthorized, CodeUnauthenticated, message, nil)
}

func ErrInvalidCredentials() *AppError {
	return NewAppError(http.StatusUnauthorized, CodeInvalidCredentials, "Invalid email or password", nil)
}

func ErrCSRFInvalid() *AppError {
	return NewAppError(http.StatusForbidden, CodeCSRFInvalid, "Invalid or missing CSRF token", nil)
}

func ErrNotFound(message string) *AppError {
	if message == "" {
		message = "Resource not found"
	}
	return NewAppError(http.StatusNotFound, CodeNotFound, message, nil)
}

func ErrEmailTaken() *AppError {
	return NewAppError(http.StatusConflict, CodeEmailTaken, "Email is already registered", nil)
}

func ErrCheckinLocked() *AppError {
	return NewAppError(http.StatusConflict, CodeCheckinLocked, "Check-in cannot be modified after a win is completed", nil)
}

func ErrIdempotencyInProgress() *AppError {
	return NewAppError(http.StatusConflict, CodeIdempotencyInProgress, "Request with this Idempotency-Key is currently being processed", nil)
}

func ErrConcurrentModification() *AppError {
	return NewAppError(http.StatusConflict, CodeConcurrentModification, "Resource was modified concurrently; please retry", nil)
}

func ErrIdempotencyKeyReused() *AppError {
	return NewAppError(http.StatusUnprocessableEntity, CodeIdempotencyKeyReused, "Idempotency-Key was reused with a different request payload", nil)
}

func ErrMinLevelReached() *AppError {
	return NewAppError(http.StatusUnprocessableEntity, CodeMinLevelReached, "Target is already at the gentlest level; resting is a valid choice", nil)
}

func ErrDateOutOfRange() *AppError {
	return NewAppError(http.StatusUnprocessableEntity, CodeDateOutOfRange, "Date must be today or yesterday in your timezone", nil)
}

func ErrRateLimited() *AppError {
	return NewAppError(http.StatusTooManyRequests, CodeRateLimited, "Too many requests; please try again later", nil)
}

func ErrInternal(cause error) *AppError {
	return &AppError{
		HTTPStatus: http.StatusInternalServerError,
		Code:       CodeInternal,
		Message:    "An unexpected error occurred",
		Cause:      cause,
	}
}
