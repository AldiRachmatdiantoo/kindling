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

-- name: GetInsightDays :many
SELECT log_date, scores, calibration_tier, positive_cope_chosen, wins_completed_count, wins_data
FROM daily_logs
WHERE user_id = $1
  AND log_date >= $2
  AND log_date <= $3
ORDER BY log_date ASC;

-- name: GetPillarCompletions :many
-- Lifetime per-pillar completion flags for Milestone Path, oldest first. Kept apart from
-- GetHeatmapDays so the heatmap query still only reads idx_daily_logs_heatmap columns.
SELECT
    log_date,
    COALESCE(wins_data->'physical'->>'completed' = 'true', false)::BOOLEAN AS physical_done,
    COALESCE(wins_data->'work'->>'completed' = 'true', false)::BOOLEAN AS work_done,
    COALESCE(wins_data->'soul'->>'completed' = 'true', false)::BOOLEAN AS soul_done
FROM daily_logs
WHERE user_id = $1
  AND wins_completed_count > 0
ORDER BY log_date ASC;
