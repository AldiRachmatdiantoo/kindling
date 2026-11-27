-- name: ListUserHabits :many
SELECT pillar, activity, struggle
FROM user_habits
WHERE user_id = $1
ORDER BY pillar;

-- name: UpsertUserHabit :exec
INSERT INTO user_habits (user_id, pillar, activity, struggle, updated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (user_id, pillar) DO UPDATE
SET activity = EXCLUDED.activity,
    struggle = EXCLUDED.struggle,
    updated_at = NOW();

-- name: DeleteUserHabit :exec
DELETE FROM user_habits
WHERE user_id = $1 AND pillar = $2;
