package cache

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// slidingWindowLua atomically enforces a sliding-window rate limit using a Redis sorted set.
// KEYS[1]: rate limit key
// ARGV[1]: current timestamp in milliseconds
// ARGV[2]: window duration in milliseconds
// ARGV[3]: maximum allowed requests in window
// ARGV[4]: unique request member id
// Returns: {allowed (1|0), remaining, retry_after_ms}
var slidingWindowLua = redis.NewScript(`
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

local window_start = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)
if count < limit then
    redis.call('ZADD', key, now, member)
    redis.call('PEXPIRE', key, window)
    return {1, limit - count - 1, 0}
end

local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry_after = window
if oldest and oldest[2] then
    retry_after = math.max(1, (tonumber(oldest[2]) + window) - now)
end
redis.call('PEXPIRE', key, window)
return {0, 0, retry_after}
`)

type RateLimitResult struct {
	Allowed    bool
	Remaining  int
	RetryAfter time.Duration
}

type RateLimiter struct {
	client *redis.Client
	nowFn  func() time.Time
}

func NewRateLimiter(client *redis.Client) *RateLimiter {
	return &RateLimiter{
		client: client,
		nowFn:  time.Now,
	}
}

// Allow checks and records a request against a sliding window [limit requests per window].
func (l *RateLimiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (RateLimitResult, error) {
	nowMs := l.nowFn().UnixMilli()
	windowMs := window.Milliseconds()
	member := fmt.Sprintf("%d-%s", nowMs, uuid.NewString())

	res, err := slidingWindowLua.Run(ctx, l.client, []string{key}, nowMs, windowMs, limit, member).Int64Slice()
	if err != nil {
		return RateLimitResult{}, fmt.Errorf("run sliding window script: %w", err)
	}
	if len(res) != 3 {
		return RateLimitResult{}, fmt.Errorf("unexpected rate limit script result length: %d", len(res))
	}

	retryAfter := time.Duration(res[2]) * time.Millisecond
	if res[0] == 0 && retryAfter < time.Second {
		retryAfter = time.Second
	}

	return RateLimitResult{
		Allowed:    res[0] == 1,
		Remaining:  int(res[1]),
		RetryAfter: time.Duration(math.Ceil(retryAfter.Seconds())) * time.Second,
	}, nil
}
