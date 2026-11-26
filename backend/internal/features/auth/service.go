package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kindling/backend/internal/cache"
	"github.com/kindling/backend/internal/database/sqlc"
	"github.com/kindling/backend/internal/shared"
)

const (
	LoginRateLimitMax    = 5
	LoginRateLimitWindow = time.Minute
)

// RateLimiter abstracts the Redis sliding-window limiter for login throttling.
type RateLimiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (cache.RateLimitResult, error)
}

// RateLimitError wraps a 429 AppError with the Retry-After duration.
type RateLimitError struct {
	AppErr     *shared.AppError
	RetryAfter time.Duration
}

func (e *RateLimitError) Error() string {
	return e.AppErr.Error()
}

func (e *RateLimitError) Unwrap() error {
	return e.AppErr
}

// Service implements authentication, session rotation, and reuse detection.
type Service struct {
	repo        Repository
	tokens      *TokenManager
	limiter     RateLimiter
	logger      *slog.Logger
	nowFn       func() time.Time
	refreshTTL  time.Duration
	gracePeriod time.Duration
	dummyHash   string
}

func NewService(repo Repository, tokens *TokenManager, limiter RateLimiter, logger *slog.Logger) *Service {
	// Precompute a valid Argon2id hash so login attempts for non-existent emails
	// perform equivalent CPU/memory work (mitigating timing-based user enumeration).
	dummyHash, err := HashPassword("kindling-dummy-timing-guard-password")
	if err != nil {
		panic(fmt.Errorf("init dummy argon2id hash: %w", err))
	}

	return &Service{
		repo:        repo,
		tokens:      tokens,
		limiter:     limiter,
		logger:      logger,
		nowFn:       time.Now,
		refreshTTL:  RefreshTokenTTL,
		gracePeriod: RefreshGraceTTL,
		dummyHash:   dummyHash,
	}
}

func (s *Service) WithClock(nowFn func() time.Time) *Service {
	if nowFn != nil {
		s.nowFn = nowFn
		s.tokens.WithClock(nowFn)
	}
	return s
}

func (s *Service) Register(ctx context.Context, req RegisterRequest) (UserDTO, SessionTokens, error) {
	if appErr := req.NormalizeAndValidate(); appErr != nil {
		return UserDTO{}, SessionTokens{}, appErr
	}

	passwordHash, err := HashPassword(req.Password)
	if err != nil {
		return UserDTO{}, SessionTokens{}, shared.ErrInternal(err)
	}

	userID, err := shared.NewUUIDv7()
	if err != nil {
		return UserDTO{}, SessionTokens{}, shared.ErrInternal(err)
	}

	now := s.nowFn().UTC()
	var createdUser sqlc.User
	var tokens SessionTokens

	err = s.repo.WithTx(ctx, func(tx Store) error {
		u, err := tx.CreateUser(ctx, sqlc.CreateUserParams{
			ID:           userID,
			Email:        req.Email,
			PasswordHash: passwordHash,
			FullName:     req.FullName,
			Timezone:     req.Timezone,
			AiConsentAt:  pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			if errors.Is(err, ErrDuplicateEmail) {
				return shared.ErrEmailTaken()
			}
			return shared.ErrInternal(err)
		}
		createdUser = u

		issued, err := s.issueSessionInTx(ctx, tx, u.ID, shared.MustUUIDv7(), now)
		if err != nil {
			return err
		}
		tokens = issued
		return nil
	})
	if err != nil {
		return UserDTO{}, SessionTokens{}, err
	}

	return userToDTO(createdUser), tokens, nil
}

func (s *Service) Login(ctx context.Context, req LoginRequest, clientIP string) (UserDTO, SessionTokens, error) {
	if appErr := req.NormalizeAndValidate(); appErr != nil {
		return UserDTO{}, SessionTokens{}, appErr
	}

	// Enforce login rate limit: 5 requests / minute per IP + email (PRD NFR-02 & §7.2).
	if s.limiter != nil {
		ip := clientIP
		if ip == "" {
			ip = "unknown"
		}
		emailHash := HashToken(req.Email)
		rlKey := fmt.Sprintf("rl:login:ip:%s:email:%s", ip, emailHash)
		res, err := s.limiter.Allow(ctx, rlKey, LoginRateLimitMax, LoginRateLimitWindow)
		if err != nil {
			if s.logger != nil {
				s.logger.Error("login rate limiter error", "err", err)
			}
		} else if !res.Allowed {
			return UserDTO{}, SessionTokens{}, &RateLimitError{
				AppErr:     shared.ErrRateLimited(),
				RetryAfter: res.RetryAfter,
			}
		}
	}

	user, err := s.repo.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			// Run dummy Argon2id verification to equalize response timing.
			_, _ = VerifyPassword(req.Password, s.dummyHash)
			return UserDTO{}, SessionTokens{}, shared.ErrInvalidCredentials()
		}
		return UserDTO{}, SessionTokens{}, shared.ErrInternal(err)
	}

	ok, err := VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !ok {
		return UserDTO{}, SessionTokens{}, shared.ErrInvalidCredentials()
	}

	now := s.nowFn().UTC()
	var tokens SessionTokens
	err = s.repo.WithTx(ctx, func(tx Store) error {
		issued, err := s.issueSessionInTx(ctx, tx, user.ID, shared.MustUUIDv7(), now)
		if err != nil {
			return err
		}
		tokens = issued
		return nil
	})
	if err != nil {
		return UserDTO{}, SessionTokens{}, err
	}

	return userToDTO(user), tokens, nil
}

func (s *Service) Me(ctx context.Context, userID uuid.UUID) (UserDTO, error) {
	if userID == uuid.Nil {
		return UserDTO{}, shared.ErrUnauthenticated("Authentication required")
	}
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return UserDTO{}, shared.ErrUnauthenticated("Authentication required")
		}
		return UserDTO{}, shared.ErrInternal(err)
	}
	return userToDTO(user), nil
}

// Refresh rotates a refresh token with reuse detection and a 10-second grace period
// for parallel refresh requests (PRD §7.2).
// Returns (tokens, clearCookies, err).
func (s *Service) Refresh(ctx context.Context, rawRefreshToken string) (SessionTokens, bool, error) {
	if rawRefreshToken == "" {
		return SessionTokens{}, true, shared.ErrUnauthenticated("Authentication required")
	}

	tokenHash := HashToken(rawRefreshToken)
	now := s.nowFn().UTC()

	var (
		newTokens    SessionTokens
		clearCookies bool
		authErr      error
	)

	err := s.repo.WithTx(ctx, func(tx Store) error {
		rt, err := tx.GetRefreshTokenByHashForUpdate(ctx, tokenHash)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				clearCookies = true
				authErr = shared.ErrUnauthenticated("Authentication required")
				return nil
			}
			return shared.ErrInternal(err)
		}

		// Case 1: Token has already been revoked.
		if rt.RevokedAt.Valid {
			elapsed := now.Sub(rt.RevokedAt.Time)
			// Grace period: revoked <= 10s ago and replaced by a successor token -> parallel refresh.
			// Return 401 without revoking the family and without clearing cookies so the winning request's cookies remain valid.
			if rt.ReplacedBy.Valid && elapsed <= s.gracePeriod {
				clearCookies = false
				authErr = shared.ErrUnauthenticated("Authentication required")
				return nil
			}

			// Reuse detected (> 10s or revoked without replacement): revoke the entire token family.
			if err := tx.RevokeRefreshTokenFamily(ctx, sqlc.RevokeRefreshTokenFamilyParams{
				FamilyID:  rt.FamilyID,
				RevokedAt: pgtype.Timestamptz{Time: now, Valid: true},
			}); err != nil {
				return shared.ErrInternal(err)
			}
			clearCookies = true
			authErr = shared.ErrUnauthenticated("Authentication required")
			return nil
		}

		// Case 2: Token is expired.
		if !rt.ExpiresAt.Valid || !now.Before(rt.ExpiresAt.Time) {
			clearCookies = true
			authErr = shared.ErrUnauthenticated("Authentication required")
			return nil
		}

		// Case 3: Active and valid token -> rotate inside the same family.
		newTokenID, err := shared.NewUUIDv7()
		if err != nil {
			return shared.ErrInternal(err)
		}
		rawNewRefresh, err := GenerateOpaqueToken()
		if err != nil {
			return shared.ErrInternal(err)
		}
		rawNewCSRF, err := GenerateOpaqueToken()
		if err != nil {
			return shared.ErrInternal(err)
		}
		accessJWT, err := s.tokens.GenerateAccessToken(rt.UserID)
		if err != nil {
			return shared.ErrInternal(err)
		}

		// Insert successor first to satisfy FK constraint on replaced_by.
		if _, err := tx.InsertRefreshToken(ctx, sqlc.InsertRefreshTokenParams{
			ID:        newTokenID,
			UserID:    rt.UserID,
			TokenHash: HashToken(rawNewRefresh),
			FamilyID:  rt.FamilyID,
			ExpiresAt: pgtype.Timestamptz{Time: now.Add(s.refreshTTL), Valid: true},
		}); err != nil {
			return shared.ErrInternal(err)
		}

		if err := tx.MarkRefreshTokenReplaced(ctx, sqlc.MarkRefreshTokenReplacedParams{
			ID:         rt.ID,
			RevokedAt:  pgtype.Timestamptz{Time: now, Valid: true},
			ReplacedBy: uuid.NullUUID{UUID: newTokenID, Valid: true},
		}); err != nil {
			return shared.ErrInternal(err)
		}

		newTokens = SessionTokens{
			AccessToken:  accessJWT,
			RefreshToken: rawNewRefresh,
			CSRFToken:    rawNewCSRF,
		}
		return nil
	})
	if err != nil {
		return SessionTokens{}, false, err
	}
	if authErr != nil {
		return SessionTokens{}, clearCookies, authErr
	}

	return newTokens, false, nil
}

func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	if rawRefreshToken == "" {
		return nil
	}

	tokenHash := HashToken(rawRefreshToken)
	now := s.nowFn().UTC()

	return s.repo.WithTx(ctx, func(tx Store) error {
		rt, err := tx.GetRefreshTokenByHash(ctx, tokenHash)
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil
			}
			return shared.ErrInternal(err)
		}

		if err := tx.RevokeRefreshTokenFamily(ctx, sqlc.RevokeRefreshTokenFamilyParams{
			FamilyID:  rt.FamilyID,
			RevokedAt: pgtype.Timestamptz{Time: now, Valid: true},
		}); err != nil {
			return shared.ErrInternal(err)
		}
		return nil
	})
}

func (s *Service) issueSessionInTx(ctx context.Context, tx Store, userID, familyID uuid.UUID, now time.Time) (SessionTokens, error) {
	refreshID, err := shared.NewUUIDv7()
	if err != nil {
		return SessionTokens{}, shared.ErrInternal(err)
	}
	rawRefresh, err := GenerateOpaqueToken()
	if err != nil {
		return SessionTokens{}, shared.ErrInternal(err)
	}
	rawCSRF, err := GenerateOpaqueToken()
	if err != nil {
		return SessionTokens{}, shared.ErrInternal(err)
	}
	accessJWT, err := s.tokens.GenerateAccessToken(userID)
	if err != nil {
		return SessionTokens{}, shared.ErrInternal(err)
	}

	if _, err := tx.InsertRefreshToken(ctx, sqlc.InsertRefreshTokenParams{
		ID:        refreshID,
		UserID:    userID,
		TokenHash: HashToken(rawRefresh),
		FamilyID:  familyID,
		ExpiresAt: pgtype.Timestamptz{Time: now.Add(s.refreshTTL), Valid: true},
	}); err != nil {
		return SessionTokens{}, shared.ErrInternal(err)
	}

	return SessionTokens{
		AccessToken:  accessJWT,
		RefreshToken: rawRefresh,
		CSRFToken:    rawCSRF,
	}, nil
}
