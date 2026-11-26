package cache

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// DailyAIBudget counts a user's AI calls per local calendar day in Redis. The day is part of
// the key, so the budget resets at the user's midnight rather than 24 hours after first use.
type DailyAIBudget struct {
	limiter *RateLimiter
	limit   int
	logger  *slog.Logger
}

func NewDailyAIBudget(limiter *RateLimiter, limit int, logger *slog.Logger) *DailyAIBudget {
	return &DailyAIBudget{limiter: limiter, limit: limit, logger: logger}
}

func (b *DailyAIBudget) Take(ctx context.Context, userID uuid.UUID, day time.Time) bool {
	if b == nil || b.limiter == nil || b.limit <= 0 {
		return true
	}
	key := fmt.Sprintf("rl:aiday:%s:%s", userID, day.Format("2006-01-02"))
	// The window outlives the day so the key can't expire mid-day; the date in the key does the reset.
	res, err := b.limiter.Allow(ctx, key, b.limit, 26*time.Hour)
	if err != nil {
		if b.logger != nil {
			b.logger.Warn("ai daily budget check failed; allowing the call", "err", err)
		}
		return true
	}
	return res.Allowed
}
