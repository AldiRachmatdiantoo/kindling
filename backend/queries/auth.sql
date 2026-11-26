-- name: GetUserByEmail :one
SELECT id, email, password_hash, full_name, timezone, ai_consent_at, created_at
FROM users
WHERE email = $1;

-- name: InsertRefreshToken :one
INSERT INTO refresh_tokens (
    id, user_id, token_hash, family_id, expires_at
) VALUES (
    $1, $2, $3, $4, $5
)
RETURNING id, user_id, token_hash, family_id, revoked_at, replaced_by, expires_at, created_at;

-- name: GetRefreshTokenByHashForUpdate :one
SELECT id, user_id, token_hash, family_id, revoked_at, replaced_by, expires_at, created_at
FROM refresh_tokens
WHERE token_hash = $1
FOR UPDATE;

-- name: GetRefreshTokenByHash :one
SELECT id, user_id, token_hash, family_id, revoked_at, replaced_by, expires_at, created_at
FROM refresh_tokens
WHERE token_hash = $1;

-- name: MarkRefreshTokenReplaced :exec
UPDATE refresh_tokens
SET revoked_at = $2,
    replaced_by = $3
WHERE id = $1;

-- name: RevokeRefreshTokenFamily :exec
UPDATE refresh_tokens
SET revoked_at = COALESCE(revoked_at, $2)
WHERE family_id = $1
  AND revoked_at IS NULL;
