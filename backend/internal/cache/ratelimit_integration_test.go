package cache_test

import (
	"context"
	"testing"
	"time"

	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"

	"github.com/kindling/backend/internal/cache"
)

func TestRateLimiterSlidingWindow_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	ctx := context.Background()
	redisContainer, err := tcredis.Run(ctx, "redis:7-alpine")
	if err != nil {
		t.Fatalf("start redis container: %v", err)
	}
	defer func() {
		_ = redisContainer.Terminate(ctx)
	}()

	connStr, err := redisContainer.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}

	client, err := cache.NewRedisClient(ctx, connStr)
	if err != nil {
		t.Fatalf("connect redis: %v", err)
	}
	defer func() { _ = client.Close() }()

	limiter := cache.NewRateLimiter(client)
	key := "rl:test:ip:203.0.113.10"
	limit := 3
	window := 2 * time.Second

	// First 3 requests must be allowed.
	for i := 0; i < limit; i++ {
		res, err := limiter.Allow(ctx, key, limit, window)
		if err != nil {
			t.Fatalf("allow call %d failed: %v", i+1, err)
		}
		if !res.Allowed {
			t.Fatalf("expected request %d to be allowed", i+1)
		}
		wantRem := limit - i - 1
		if res.Remaining != wantRem {
			t.Fatalf("request %d: expected remaining %d, got %d", i+1, wantRem, res.Remaining)
		}
	}

	// 4th request inside the window must be rejected with RetryAfter >= 1s.
	blocked, err := limiter.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("blocked call failed: %v", err)
	}
	if blocked.Allowed {
		t.Fatal("expected 4th request to be rate limited")
	}
	if blocked.RetryAfter < time.Second {
		t.Fatalf("expected RetryAfter >= 1s, got %v", blocked.RetryAfter)
	}

	// After window elapses, requests must be allowed again.
	time.Sleep(window + 150*time.Millisecond)
	afterWindow, err := limiter.Allow(ctx, key, limit, window)
	if err != nil {
		t.Fatalf("after-window call failed: %v", err)
	}
	if !afterWindow.Allowed {
		t.Fatal("expected request to be allowed after sliding window elapsed")
	}
}
