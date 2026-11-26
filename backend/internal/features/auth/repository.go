package auth

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kindling/backend/internal/database"
	"github.com/kindling/backend/internal/database/sqlc"
)

var (
	ErrNotFound       = errors.New("record not found")
	ErrDuplicateEmail = errors.New("duplicate email")
)

// Store defines the persistence operations used by the auth service.
type Store interface {
	CreateUser(ctx context.Context, arg sqlc.CreateUserParams) (sqlc.User, error)
	GetUserByEmail(ctx context.Context, email string) (sqlc.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (sqlc.User, error)
	InsertRefreshToken(ctx context.Context, arg sqlc.InsertRefreshTokenParams) (sqlc.RefreshToken, error)
	GetRefreshTokenByHash(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error)
	GetRefreshTokenByHashForUpdate(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error)
	MarkRefreshTokenReplaced(ctx context.Context, arg sqlc.MarkRefreshTokenReplacedParams) error
	RevokeRefreshTokenFamily(ctx context.Context, arg sqlc.RevokeRefreshTokenFamilyParams) error
}

// Repository extends Store with transaction support.
type Repository interface {
	Store
	WithTx(ctx context.Context, fn func(tx Store) error) error
}

type sqlcStore struct {
	q *sqlc.Queries
}

func (s *sqlcStore) CreateUser(ctx context.Context, arg sqlc.CreateUserParams) (sqlc.User, error) {
	u, err := s.q.CreateUser(ctx, arg)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return sqlc.User{}, ErrDuplicateEmail
		}
		return sqlc.User{}, err
	}
	return u, nil
}

func (s *sqlcStore) GetUserByEmail(ctx context.Context, email string) (sqlc.User, error) {
	u, err := s.q.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return sqlc.User{}, ErrNotFound
	}
	return u, err
}

func (s *sqlcStore) GetUserByID(ctx context.Context, id uuid.UUID) (sqlc.User, error) {
	u, err := s.q.GetUserByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return sqlc.User{}, ErrNotFound
	}
	return u, err
}

func (s *sqlcStore) InsertRefreshToken(ctx context.Context, arg sqlc.InsertRefreshTokenParams) (sqlc.RefreshToken, error) {
	return s.q.InsertRefreshToken(ctx, arg)
}

func (s *sqlcStore) GetRefreshTokenByHash(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	rt, err := s.q.GetRefreshTokenByHash(ctx, tokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return sqlc.RefreshToken{}, ErrNotFound
	}
	return rt, err
}

func (s *sqlcStore) GetRefreshTokenByHashForUpdate(ctx context.Context, tokenHash string) (sqlc.RefreshToken, error) {
	rt, err := s.q.GetRefreshTokenByHashForUpdate(ctx, tokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return sqlc.RefreshToken{}, ErrNotFound
	}
	return rt, err
}

func (s *sqlcStore) MarkRefreshTokenReplaced(ctx context.Context, arg sqlc.MarkRefreshTokenReplacedParams) error {
	return s.q.MarkRefreshTokenReplaced(ctx, arg)
}

func (s *sqlcStore) RevokeRefreshTokenFamily(ctx context.Context, arg sqlc.RevokeRefreshTokenFamilyParams) error {
	return s.q.RevokeRefreshTokenFamily(ctx, arg)
}

// PostgresRepository implements Repository backed by pgxpool and sqlc.
type PostgresRepository struct {
	pool *pgxpool.Pool
	*sqlcStore
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{
		pool:      pool,
		sqlcStore: &sqlcStore{q: sqlc.New(pool)},
	}
}

func (r *PostgresRepository) WithTx(ctx context.Context, fn func(tx Store) error) error {
	return database.WithTx(ctx, r.pool, func(q *sqlc.Queries) error {
		return fn(&sqlcStore{q: q})
	})
}
