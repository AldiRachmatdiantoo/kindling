package shared

import (
	"context"

	"github.com/google/uuid"
)

type ctxKey string

const (
	ctxKeyRequestID ctxKey = "request_id"
	ctxKeyClientIP  ctxKey = "client_ip"
	ctxKeyUserID    ctxKey = "user_id"
)

func WithRequestID(ctx context.Context, reqID string) context.Context {
	return context.WithValue(ctx, ctxKeyRequestID, reqID)
}

func RequestIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyRequestID).(string); ok {
		return v
	}
	return ""
}

func WithClientIP(ctx context.Context, ip string) context.Context {
	return context.WithValue(ctx, ctxKeyClientIP, ip)
}

func ClientIPFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(ctxKeyClientIP).(string); ok {
		return v
	}
	return ""
}

func WithUserID(ctx context.Context, userID uuid.UUID) context.Context {
	return context.WithValue(ctx, ctxKeyUserID, userID)
}

func UserIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	v, ok := ctx.Value(ctxKeyUserID).(uuid.UUID)
	if !ok || v == uuid.Nil {
		return uuid.Nil, false
	}
	return v, true
}
