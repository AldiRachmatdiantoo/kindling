package auth

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
)

const testJWTSecret = "0123456789abcdef0123456789abcdef"

// memRepo is an in-memory Repository for deterministic unit tests of auth.Service.
type memRepo struct {
	mu           sync.Mutex
	usersByID    map[uuid.UUID]sqlc.User
	usersByEmail map[string]sqlc.User
	tokensByHash map[string]sqlc.RefreshToken
	tokensByID   map[uuid.UUID]sqlc.RefreshToken
}

func newMemRepo() *memRepo {
	return &memRepo{
		usersByID:    make(map[uuid.UUID]sqlc.User),
		usersByEmail: make(map[string]sqlc.User),
		tokensByHash: make(map[string]sqlc.RefreshToken),
		tokensByID:   make(map[uuid.UUID]sqlc.RefreshToken),
	}
}

func (m *memRepo) WithTx(_ context.Context, fn func(tx Store) error) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return fn(&memTxStore{m: m})
}

func (m *memRepo) CreateUser(ctx context.Context, arg sqlc.CreateUserParams) (sqlc.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).CreateUser(ctx, arg)
}

func (m *memRepo) GetUserByEmail(ctx context.Context, email string) (sqlc.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).GetUserByEmail(ctx, email)
}

func (m *memRepo) GetUserByID(ctx context.Context, id uuid.UUID) (sqlc.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).GetUserByID(ctx, id)
}

func (m *memRepo) InsertRefreshToken(ctx context.Context, arg sqlc.InsertRefreshTokenParams) (sqlc.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).InsertRefreshToken(ctx, arg)
}

func (m *memRepo) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).GetRefreshTokenByHash(ctx, tokenHash)
}

func (m *memRepo) GetRefreshTokenByHashForUpdate(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).GetRefreshTokenByHashForUpdate(ctx, tokenHash)
}

func (m *memRepo) MarkRefreshTokenReplaced(ctx context.Context, arg sqlc.MarkRefreshTokenReplacedParams) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).MarkRefreshTokenReplaced(ctx, arg)
}

func (m *memRepo) RevokeRefreshTokenFamily(ctx context.Context, arg sqlc.RevokeRefreshTokenFamilyParams) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return (&memTxStore{m: m}).RevokeRefreshTokenFamily(ctx, arg)
}

type memTxStore struct {
	m *memRepo
}

func (s *memTxStore) CreateUser(_ context.Context, arg sqlc.CreateUserParams) (sqlc.User, error) {
	if _, exists := s.m.usersByEmail[arg.Email]; exists {
		return sqlc.User{}, ErrDuplicateEmail
	}
	u := sqlc.User{
		ID:           arg.ID,
		Email:        arg.Email,
		PasswordHash: arg.PasswordHash,
		FullName:     arg.FullName,
		Timezone:     arg.Timezone,
		AiConsentAt:  arg.AiConsentAt,
	}
	s.m.usersByID[u.ID] = u
	s.m.usersByEmail[u.Email] = u
	return u, nil
}

func (s *memTxStore) GetUserByEmail(_ context.Context, email string) (sqlc.User, error) {
	u, ok := s.m.usersByEmail[email]
	if !ok {
		return sqlc.User{}, ErrNotFound
	}
	return u, nil
}

func (s *memTxStore) GetUserByID(_ context.Context, id uuid.UUID) (sqlc.User, error) {
	u, ok := s.m.usersByID[id]
	if !ok {
		return sqlc.User{}, ErrNotFound
	}
	return u, nil
}

func (s *memTxStore) InsertRefreshToken(_ context.Context, arg sqlc.InsertRefreshTokenParams) (sqlc.RefreshToken, error) {
	rt := sqlc.RefreshToken{
		ID:        arg.ID,
		UserID:    arg.UserID,
		TokenHash: arg.TokenHash,
		FamilyID:  arg.FamilyID,
		ExpiresAt: arg.ExpiresAt,
	}
	s.m.tokensByHash[rt.TokenHash] = rt
	s.m.tokensByID[rt.ID] = rt
	return rt, nil
}

func (s *memTxStore) GetRefreshTokenByHash(_ context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	rt, ok := s.m.tokensByHash[tokenHash]
	if !ok {
		return sqlc.RefreshToken{}, ErrNotFound
	}
	return rt, nil
}

func (s *memTxStore) GetRefreshTokenByHashForUpdate(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	return s.GetRefreshTokenByHash(ctx, tokenHash)
}

func (s *memTxStore) MarkRefreshTokenReplaced(_ context.Context, arg sqlc.MarkRefreshTokenReplacedParams) error {
	rt, ok := s.m.tokensByID[arg.ID]
	if !ok {
		return ErrNotFound
	}
	rt.RevokedAt = arg.RevokedAt
	rt.ReplacedBy = arg.ReplacedBy
	s.m.tokensByID[rt.ID] = rt
	s.m.tokensByHash[rt.TokenHash] = rt
	return nil
}

func (s *memTxStore) RevokeRefreshTokenFamily(_ context.Context, arg sqlc.RevokeRefreshTokenFamilyParams) error {
	for id, rt := range s.m.tokensByID {
		if rt.FamilyID == arg.FamilyID && !rt.RevokedAt.Valid {
			rt.RevokedAt = arg.RevokedAt
			s.m.tokensByID[id] = rt
			s.m.tokensByHash[rt.TokenHash] = rt
		}
	}
	return nil
}

type memRateLimiter struct {
	mu     sync.Mutex
	counts map[string]int
}

func newMemRateLimiter() *memRateLimiter {
	return &memRateLimiter{counts: make(map[string]int)}
}

func (l *memRateLimiter) Allow(_ context.Context, key string, limit int, _ time.Duration) (cache.RateLimitResult, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.counts[key] >= limit {
		return cache.RateLimitResult{Allowed: false, Remaining: 0, RetryAfter: 30 * time.Second}, nil
	}
	l.counts[key]++
	return cache.RateLimitResult{Allowed: true, Remaining: limit - l.counts[key]}, nil
}

func TestArgon2idHashAndVerify(t *testing.T) {
	hash, err := HashPassword("super-secret-password-123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("unexpected PHC prefix: %s", hash)
	}

	ok, err := VerifyPassword("super-secret-password-123", hash)
	if err != nil || !ok {
		t.Fatalf("expected valid password to verify, ok=%v err=%v", ok, err)
	}

	ok, err = VerifyPassword("wrong-password-123", hash)
	if err != nil || ok {
		t.Fatalf("expected wrong password to fail, ok=%v err=%v", ok, err)
	}
}

func TestTokenManager_AccessJWT(t *testing.T) {
	now := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	tm := NewTokenManager(testJWTSecret).WithClock(func() time.Time { return now })
	userID := shared.MustUUIDv7()

	token, err := tm.GenerateAccessToken(userID)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	gotID, err := tm.VerifyAccessToken(token)
	if err != nil || gotID != userID {
		t.Fatalf("VerifyAccessToken: got=%s err=%v", gotID, err)
	}

	// Advance 16 minutes -> expired.
	now = now.Add(16 * time.Minute)
	if _, err := tm.VerifyAccessToken(token); err == nil {
		t.Fatal("expected expired JWT to fail verification")
	}

	// Wrong secret fails.
	other := NewTokenManager("fedcba9876543210fedcba9876543210")
	if _, err := other.VerifyAccessToken(token); err == nil {
		t.Fatal("expected JWT signed with different secret to fail")
	}
}

func TestService_RegisterLoginAndRateLimit(t *testing.T) {
	ctx := context.Background()
	repo := newMemRepo()
	limiter := newMemRateLimiter()
	tm := NewTokenManager(testJWTSecret)
	svc := NewService(repo, tm, limiter, nil)

	// Validation failure: missing ai_consent & short password.
	_, _, err := svc.Register(ctx, RegisterRequest{
		Email:     "not-an-email",
		Password:  "short",
		FullName:  "",
		AIConsent: false,
	})
	var appErr *shared.AppError
	if !errors.As(err, &appErr) || appErr.Code != shared.CodeValidationError {
		t.Fatalf("expected VALIDATION_ERROR, got %v", err)
	}

	// Valid registration.
	user, tokens, err := svc.Register(ctx, RegisterRequest{
		Email:     "  Alice@Example.COM ",
		Password:  "correct-horse-battery",
		FullName:  "Alice Kindling",
		AIConsent: true,
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	if user.Email != "alice@example.com" || user.Timezone != DefaultTimezone {
		t.Fatalf("unexpected user: %+v", user)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" || tokens.CSRFToken == "" {
		t.Fatal("expected all 3 session tokens to be populated")
	}

	// Verify refresh token is stored as SHA-256 hash, never plaintext.
	if _, exists := repo.tokensByHash[tokens.RefreshToken]; exists {
		t.Fatal("raw refresh token must not be stored in repository")
	}
	if _, exists := repo.tokensByHash[HashToken(tokens.RefreshToken)]; !exists {
		t.Fatal("expected SHA-256 hash of refresh token in repository")
	}

	// Duplicate email returns 409 EMAIL_TAKEN.
	_, _, err = svc.Register(ctx, RegisterRequest{
		Email:     "alice@example.com",
		Password:  "another-valid-password",
		FullName:  "Alice Clone",
		AIConsent: true,
	})
	if !errors.As(err, &appErr) || appErr.Code != shared.CodeEmailTaken {
		t.Fatalf("expected EMAIL_TAKEN, got %v", err)
	}

	// Generic error for unknown email vs wrong password (identical code & message).
	_, _, errUnknown := svc.Login(ctx, LoginRequest{Email: "nobody@example.com", Password: "wrong-password"}, "203.0.113.10")
	_, _, errWrongPw := svc.Login(ctx, LoginRequest{Email: "alice@example.com", Password: "wrong-password"}, "203.0.113.10")
	var appErr1, appErr2 *shared.AppError
	if !errors.As(errUnknown, &appErr1) || !errors.As(errWrongPw, &appErr2) {
		t.Fatalf("expected AppError for both failed logins, got %v and %v", errUnknown, errWrongPw)
	}
	if appErr1.Code != shared.CodeInvalidCredentials || appErr2.Code != shared.CodeInvalidCredentials || appErr1.Message != appErr2.Message {
		t.Fatalf("login errors must be generic & identical: %+v vs %+v", appErr1, appErr2)
	}

	// Login rate limit: 5/min per IP+email (already used 1 attempt for alice@example.com from 203.0.113.10).
	for i := 0; i < 4; i++ {
		_, _, err = svc.Login(ctx, LoginRequest{Email: "alice@example.com", Password: "wrong-password"}, "203.0.113.10")
		if !errors.As(err, &appErr) || appErr.Code != shared.CodeInvalidCredentials {
			t.Fatalf("attempt %d: expected INVALID_CREDENTIALS, got %v", i+2, err)
		}
	}
	// 6th attempt -> 429 RATE_LIMITED.
	_, _, err = svc.Login(ctx, LoginRequest{Email: "alice@example.com", Password: "correct-horse-battery"}, "203.0.113.10")
	var rlErr *RateLimitError
	if !errors.As(err, &rlErr) || rlErr.AppErr.Code != shared.CodeRateLimited {
		t.Fatalf("6th login attempt: expected RATE_LIMITED, got %v", err)
	}

	// Me endpoint returns user.
	me, err := svc.Me(ctx, user.ID)
	if err != nil || me.ID != user.ID {
		t.Fatalf("Me: got=%+v err=%v", me, err)
	}
}

func TestService_RefreshRotationGracePeriodAndReuseDetection(t *testing.T) {
	ctx := context.Background()
	repo := newMemRepo()
	tm := NewTokenManager(testJWTSecret)

	now := time.Date(2026, 11, 26, 12, 0, 0, 0, time.UTC)
	svc := NewService(repo, tm, nil, nil).WithClock(func() time.Time { return now })

	_, tok1, err := svc.Register(ctx, RegisterRequest{
		Email:     "bob@example.com",
		Password:  "bob-secure-password",
		FullName:  "Bob",
		AIConsent: true,
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	// 1. Successful rotation: tok1 -> tok2.
	tok2, clearCookies, err := svc.Refresh(ctx, tok1.RefreshToken)
	if err != nil || clearCookies {
		t.Fatalf("Refresh tok1: clear=%v err=%v", clearCookies, err)
	}
	if tok2.RefreshToken == tok1.RefreshToken {
		t.Fatal("expected rotated refresh token to differ from previous token")
	}

	// 2. Grace period (<= 10s): replaying tok1 at +5s returns 401 WITHOUT clearing cookies or revoking family.
	now = now.Add(5 * time.Second)
	_, clearCookies, err = svc.Refresh(ctx, tok1.RefreshToken)
	var appErr *shared.AppError
	if !errors.As(err, &appErr) || appErr.Code != shared.CodeUnauthenticated {
		t.Fatalf("expected UNAUTHENTICATED during grace period, got %v", err)
	}
	if clearCookies {
		t.Fatal("grace-period 401 must NOT clear cookies")
	}

	// Verify tok2 is STILL active and can rotate -> tok3!
	tok3, clearCookies, err := svc.Refresh(ctx, tok2.RefreshToken)
	if err != nil || clearCookies {
		t.Fatalf("expected tok2 to remain active after grace-period replay: clear=%v err=%v", clearCookies, err)
	}

	// 3. Reuse detection (> 10s): replaying tok2 at +11s revokes the ENTIRE family (including tok3) and clears cookies.
	now = now.Add(11 * time.Second)
	_, clearCookies, err = svc.Refresh(ctx, tok2.RefreshToken)
	if !errors.As(err, &appErr) || appErr.Code != shared.CodeUnauthenticated {
		t.Fatalf("expected UNAUTHENTICATED on reuse > 10s, got %v", err)
	}
	if !clearCookies {
		t.Fatal("reuse > 10s must clear cookies")
	}

	// Verify tok3 is now revoked as well.
	_, clearCookies, err = svc.Refresh(ctx, tok3.RefreshToken)
	if !errors.As(err, &appErr) || appErr.Code != shared.CodeUnauthenticated {
		t.Fatalf("expected tok3 to be revoked after family reuse detection, got %v", err)
	}
	if !clearCookies {
		t.Fatal("revoked family token must clear cookies")
	}
}
