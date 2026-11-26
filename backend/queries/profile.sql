-- name: GetHeatmapDays :many
SELECT log_date, wins_completed_count, positive_cope_chosen
FROM daily_logs
WHERE user_id = $1
  AND log_date >= $2
  AND log_date <= $3
ORDER BY log_date DESC;

-- name: GetProfileMilestones :one
SELECT
    COUNT(*) FILTER (WHERE wins_completed_count > 0 OR positive_cope_chosen IS NOT NULL)::BIGINT AS total_active_days,
    COUNT(*) FILTER (WHERE wins_completed_count = 3)::BIGINT AS total_complete_days,
    COUNT(*) FILTER (WHERE positive_cope_chosen IS NOT NULL AND wins_completed_count = 0)::BIGINT AS total_recovery_days,
    COALESCE(SUM(wins_completed_count), 0)::BIGINT AS total_daily_wins
FROM daily_logs
WHERE user_id = $1
  AND (wins_completed_count > 0 OR positive_cope_chosen IS NOT NULL);
