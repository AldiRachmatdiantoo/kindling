package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"

	"github.com/kindling/backend/internal/shared"
)

// OWASP Argon2id baseline parameters per PRD NFR-04 (m=19 MiB, t=2, p=1).
const (
	Argon2Memory  uint32 = 19 * 1024 // 19 MiB in KiB (19456)
	Argon2Time    uint32 = 2
	Argon2Threads uint8  = 1
	Argon2SaltLen        = 16
	Argon2KeyLen  uint32 = 32

	AccessTokenTTL  = 15 * time.Minute
	RefreshTokenTTL = 7 * 24 * time.Hour
	RefreshGraceTTL = 10 * time.Second
	OpaqueTokenLen  = 32
)

// HashPassword hashes a plaintext password with Argon2id (m=19 MiB, t=2, p=1)
// and returns a PHC-formatted string.
func HashPassword(password string) (string, error) {
	salt := make([]byte, Argon2SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generate argon2 salt: %w", err)
	}

	hash := argon2.IDKey([]byte(password), salt, Argon2Time, Argon2Memory, Argon2Threads, Argon2KeyLen)

	b64Salt := base64.RawStdEncoding.EncodeToString(salt)
	b64Hash := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, Argon2Memory, Argon2Time, Argon2Threads, b64Salt, b64Hash), nil
}

// VerifyPassword compares a plaintext password against a PHC-formatted Argon2id hash
// in constant time.
func VerifyPassword(password, encodedHash string) (bool, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("invalid argon2id hash format")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("incompatible argon2 version")
	}

	var memory, iterations uint32
	var parallelism uint8
	for _, kv := range strings.Split(parts[3], ",") {
		pair := strings.SplitN(kv, "=", 2)
		if len(pair) != 2 {
			return false, errors.New("invalid argon2 parameters")
		}
		v, err := strconv.ParseUint(pair[1], 10, 32)
		if err != nil {
			return false, fmt.Errorf("parse argon2 param %s: %w", pair[0], err)
		}
		switch pair[0] {
		case "m":
			memory = uint32(v)
		case "t":
			iterations = uint32(v)
		case "p":
			parallelism = uint8(v)
		}
	}
	if memory == 0 || iterations == 0 || parallelism == 0 {
		return false, errors.New("missing argon2 parameters")
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("decode argon2 salt: %w", err)
	}
	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("decode argon2 hash: %w", err)
	}

	computed := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expectedHash)))
	return subtle.ConstantTimeCompare(computed, expectedHash) == 1, nil
}

// GenerateOpaqueToken generates 32 cryptographically random bytes encoded as base64url (no padding).
func GenerateOpaqueToken() (string, error) {
	buf := make([]byte, OpaqueTokenLen)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// HashToken returns the hex-encoded SHA-256 digest of a raw token string.
func HashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}

// TokenManager issues and verifies HS256 access JWTs.
type TokenManager struct {
	secret    []byte
	accessTTL time.Duration
	nowFn     func() time.Time
}

func NewTokenManager(secret string) *TokenManager {
	return &TokenManager{
		secret:    []byte(secret),
		accessTTL: AccessTokenTTL,
		nowFn:     time.Now,
	}
}

func (m *TokenManager) WithClock(nowFn func() time.Time) *TokenManager {
	if nowFn != nil {
		m.nowFn = nowFn
	}
	return m
}

func (m *TokenManager) GenerateAccessToken(userID uuid.UUID) (string, error) {
	now := m.nowFn().UTC()
	jti, err := shared.NewUUIDv7()
	if err != nil {
		return "", err
	}

	claims := jwt.RegisteredClaims{
		Subject:   userID.String(),
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(m.accessTTL)),
		ID:        jti.String(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", fmt.Errorf("sign access jwt: %w", err)
	}
	return signed, nil
}

// VerifyAccessToken validates an HS256 access JWT and returns the subject user UUID.
func (m *TokenManager) VerifyAccessToken(tokenString string) (uuid.UUID, error) {
	var claims jwt.RegisteredClaims
	parsed, err := jwt.ParseWithClaims(
		tokenString,
		&claims,
		func(token *jwt.Token) (any, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return m.secret, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithTimeFunc(m.nowFn),
	)
	if err != nil || !parsed.Valid {
		return uuid.Nil, errors.New("invalid access token")
	}

	userID, err := uuid.Parse(claims.Subject)
	if err != nil || userID == uuid.Nil {
		return uuid.Nil, errors.New("invalid subject claim")
	}
	return userID, nil
}
