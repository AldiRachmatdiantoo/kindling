-- name: Ping :one
SELECT 1 AS ok;

-- name: CreateUser :one
INSERT INTO users (
    id, email, password_hash, full_name, timezone, ai_consent_at
) VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING id, email, password_hash, full_name, timezone, ai_consent_at, created_at;

-- name: GetUserByID :one
SELECT id, email, password_hash, full_name, timezone, ai_consent_at, created_at
FROM users
WHERE id = $1;

-- name: InsertDailyLog :one
INSERT INTO daily_logs (
    id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
    scores, calibration_tier, diagnostic_summary, safety_flag,
    cope_options, positive_cope_chosen, wins_data, wins_completed_count
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13, $14
)
RETURNING *;

-- name: ListAllVisibleDailyLogs :many
SELECT id, user_id, log_date, calibration_tier, wins_completed_count, positive_cope_chosen
FROM daily_logs
ORDER BY log_date DESC;
