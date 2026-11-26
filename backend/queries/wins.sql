-- name: GetDailyWinsByDate :one
SELECT calibration_tier, wins_data, wins_completed_count
FROM daily_logs
WHERE user_id = $1 AND log_date = $2;

-- name: GetDailyWinsForUpdate :one
SELECT calibration_tier, wins_data, wins_completed_count
FROM daily_logs
WHERE user_id = $1 AND log_date = $2
FOR UPDATE;

-- name: UpdateDailyWins :one
UPDATE daily_logs
SET wins_data = $3,
    wins_completed_count = $4
WHERE user_id = $1 AND log_date = $2
RETURNING wins_data, wins_completed_count;
