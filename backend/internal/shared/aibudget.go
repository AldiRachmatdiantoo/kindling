package shared

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// AI notes tell the client why it got the simpler, template version instead of an AI answer.
const (
	// AINoteDailyLimit: the user used up today's AI calls; resets at their local midnight.
	AINoteDailyLimit = "daily_limit"
	// AINoteUnavailable: the AI provider failed or timed out (for example its own quota ran out).
	AINoteUnavailable = "unavailable"
)

// AIBudget caps how many AI calls one user can make on one local day. Take records a call and
// reports whether it fits. Implementations fail open: an outage never blocks the user.
type AIBudget interface {
	Take(ctx context.Context, userID uuid.UUID, day time.Time) bool
}
