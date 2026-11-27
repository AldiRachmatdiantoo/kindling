-- 7. User Habits: one standing activity per pillar that each day's win is built from.
CREATE TABLE user_habits (
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pillar     VARCHAR(16)  NOT NULL CHECK (pillar IN ('physical','work','soul')),
    activity   VARCHAR(120) NOT NULL CHECK (char_length(btrim(activity)) > 0),
    struggle   VARCHAR(200) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, pillar)
);

ALTER TABLE user_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_habits FORCE  ROW LEVEL SECURITY;

CREATE POLICY user_habits_isolation_policy ON user_habits
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_habits TO app_runtime;
