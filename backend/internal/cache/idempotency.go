package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	IdempotencyStatusProcessing = "processing"
	IdempotencyStatusCompleted  = "completed"

	IdempotencyProcessingTTL = 30 * time.Second
	IdempotencyCompletedTTL  = 24 * time.Hour
)

// IdempotencyRecord is persisted as JSON in Redis under idem:{user_id}:{route}:{key}.
type IdempotencyRecord struct {
	Status       string `json:"status"`
	BodyHash     string `json:"body_hash"`
	StatusCode   int    `json:"status_code,omitempty"`
	ContentType  string `json:"content_type,omitempty"`
	ResponseBody []byte `json:"response_body,omitempty"`
}

// IdempotencyState indicates the outcome of attempting to acquire an idempotency key.
type IdempotencyState int

const (
	IdempotencyAcquired IdempotencyState = iota
	IdempotencyReplay
	IdempotencyInProgress
	IdempotencyKeyReused
)

type IdempotencyAcquireResult struct {
	State  IdempotencyState
	Record *IdempotencyRecord
}

// IdempotencyStore manages request idempotency state in Redis per PRD §7.0.
type IdempotencyStore struct {
	client *redis.Client
}

func NewIdempotencyStore(client *redis.Client) *IdempotencyStore {
	return &IdempotencyStore{client: client}
}

// Key formats the canonical Redis key: idem:{user_id}:{route}:{key}.
func IdempotencyKey(userID, route, key string) string {
	return fmt.Sprintf("idem:%s:%s:%s", userID, route, key)
}

// Acquire atomically claims the idempotency key via SET NX (TTL 30s) or inspects the existing record.
func (s *IdempotencyStore) Acquire(ctx context.Context, redisKey, bodyHash string) (IdempotencyAcquireResult, error) {
	rec := IdempotencyRecord{
		Status:   IdempotencyStatusProcessing,
		BodyHash: bodyHash,
	}
	payload, err := json.Marshal(rec)
	if err != nil {
		return IdempotencyAcquireResult{}, fmt.Errorf("marshal idempotency processing record: %w", err)
	}

	acquired, err := s.client.SetNX(ctx, redisKey, payload, IdempotencyProcessingTTL).Result()
	if err != nil {
		return IdempotencyAcquireResult{}, fmt.Errorf("redis setnx idempotency: %w", err)
	}
	if acquired {
		return IdempotencyAcquireResult{State: IdempotencyAcquired}, nil
	}

	raw, err := s.client.Get(ctx, redisKey).Bytes()
	if errors.Is(err, redis.Nil) {
		// Key expired between SetNX and Get; retry once.
		acquired, err = s.client.SetNX(ctx, redisKey, payload, IdempotencyProcessingTTL).Result()
		if err != nil {
			return IdempotencyAcquireResult{}, fmt.Errorf("redis setnx retry idempotency: %w", err)
		}
		if acquired {
			return IdempotencyAcquireResult{State: IdempotencyAcquired}, nil
		}
		raw, err = s.client.Get(ctx, redisKey).Bytes()
		if err != nil {
			return IdempotencyAcquireResult{}, fmt.Errorf("redis get retry idempotency: %w", err)
		}
	} else if err != nil {
		return IdempotencyAcquireResult{}, fmt.Errorf("redis get idempotency: %w", err)
	}

	var existing IdempotencyRecord
	if err := json.Unmarshal(raw, &existing); err != nil {
		return IdempotencyAcquireResult{}, fmt.Errorf("unmarshal idempotency record: %w", err)
	}

	if existing.BodyHash != bodyHash {
		return IdempotencyAcquireResult{State: IdempotencyKeyReused, Record: &existing}, nil
	}
	if existing.Status == IdempotencyStatusProcessing {
		return IdempotencyAcquireResult{State: IdempotencyInProgress, Record: &existing}, nil
	}
	return IdempotencyAcquireResult{State: IdempotencyReplay, Record: &existing}, nil
}

// Complete stores the final HTTP response for 24 hours so identical retries are replayed.
func (s *IdempotencyStore) Complete(ctx context.Context, redisKey, bodyHash string, statusCode int, contentType string, responseBody []byte) error {
	rec := IdempotencyRecord{
		Status:       IdempotencyStatusCompleted,
		BodyHash:     bodyHash,
		StatusCode:   statusCode,
		ContentType:  contentType,
		ResponseBody: responseBody,
	}
	payload, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("marshal idempotency completed record: %w", err)
	}
	if err := s.client.Set(ctx, redisKey, payload, IdempotencyCompletedTTL).Err(); err != nil {
		return fmt.Errorf("redis set idempotency completed: %w", err)
	}
	return nil
}

// Release deletes the idempotency key (used on 5xx responses so the client may retry).
func (s *IdempotencyStore) Release(ctx context.Context, redisKey string) error {
	if err := s.client.Del(ctx, redisKey).Err(); err != nil {
		return fmt.Errorf("redis del idempotency: %w", err)
	}
	return nil
}
