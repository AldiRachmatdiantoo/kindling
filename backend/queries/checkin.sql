-- name: UpsertDailyLog :one
INSERT INTO daily_logs (
    id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
    scores, calibration_tier, diagnostic_summary, safety_flag,
    cope_options, positive_cope_chosen, wins_data, wins_completed_count
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, NULL, $12, 0
)
ON CONFLICT (user_id, log_date) DO UPDATE SET
    raw_answers = EXCLUDED.raw_answers,
    brain_dump = EXCLUDED.brain_dump,
    fun_cope_input = EXCLUDED.fun_cope_input,
    scores = EXCLUDED.scores,
    calibration_tier = EXCLUDED.calibration_tier,
    diagnostic_summary = EXCLUDED.diagnostic_summary,
    safety_flag = EXCLUDED.safety_flag,
    cope_options = EXCLUDED.cope_options,
    positive_cope_chosen = NULL,
    wins_data = EXCLUDED.wins_data,
    wins_completed_count = 0
WHERE daily_logs.wins_completed_count = 0
RETURNING id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
          scores, calibration_tier, diagnostic_summary, safety_flag,
          cope_options, positive_cope_chosen, wins_data, wins_completed_count,
          created_at, updated_at;

-- name: GetDailyLogByDate :one
SELECT id, user_id, log_date, raw_answers, brain_dump, fun_cope_input,
       scores, calibration_tier, diagnostic_summary, safety_flag,
       cope_options, positive_cope_chosen, wins_data, wins_completed_count,
       created_at, updated_at
FROM daily_logs
WHERE user_id = $1 AND log_date = $2;

-- name: UpdatePositiveCopeChosen :one
UPDATE daily_logs
SET positive_cope_chosen = $3
WHERE user_id = $1 AND log_date = $2
RETURNING positive_cope_chosen;

-- name: InsertAiAuditLog :exec
INSERT INTO ai_audit_logs (
    id, user_id, endpoint, latency_ms, is_fallback
) VALUES (
    $1, $2, $3, $4, $5
);
