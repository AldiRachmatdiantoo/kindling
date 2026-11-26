-- 1. Users
CREATE TABLE users (
    id            UUID PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT         NOT NULL,
    full_name     VARCHAR(120) NOT NULL,
    timezone      VARCHAR(64)  NOT NULL DEFAULT 'Asia/Jakarta',
    ai_consent_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Refresh Tokens (Rotation & Reuse Detection)
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,          -- hex SHA-256 dari token opak
    family_id   UUID        NOT NULL,
    revoked_at  TIMESTAMPTZ,                          -- NULL = aktif
    replaced_by UUID REFERENCES refresh_tokens(id),   -- untuk grace period rotasi
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id);

-- 3. Daily Logs
CREATE TABLE daily_logs (
    id                   UUID PRIMARY KEY,
    user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    log_date             DATE        NOT NULL,
    raw_answers          JSONB       NOT NULL CHECK (jsonb_typeof(raw_answers) = 'object'),
    brain_dump           TEXT        NOT NULL DEFAULT '' CHECK (char_length(brain_dump) <= 2000),
    fun_cope_input       TEXT        NOT NULL DEFAULT '' CHECK (char_length(fun_cope_input) <= 200),
    scores               JSONB       NOT NULL CHECK (jsonb_typeof(scores) = 'object'),
    calibration_tier     VARCHAR(16) NOT NULL CHECK (calibration_tier IN ('gentle','balanced','standard')),
    diagnostic_summary   TEXT        NOT NULL,
    safety_flag          BOOLEAN     NOT NULL DEFAULT FALSE,
    cope_options         JSONB       NOT NULL CHECK (jsonb_typeof(cope_options) = 'array'),
    positive_cope_chosen VARCHAR(150),
    wins_data            JSONB       NOT NULL CHECK (jsonb_typeof(wins_data) = 'object'),
    wins_completed_count SMALLINT    NOT NULL DEFAULT 0 CHECK (wins_completed_count BETWEEN 0 AND 3),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_log_date UNIQUE (user_id, log_date)
);

-- Index-Only Scan untuk heatmap 365 hari
CREATE INDEX idx_daily_logs_heatmap
    ON daily_logs (user_id, log_date DESC)
    INCLUDE (wins_completed_count, positive_cope_chosen);

-- Partial index untuk statistik kumulatif (hanya hari "aktif")
CREATE INDEX idx_daily_logs_active_milestones
    ON daily_logs (user_id, log_date)
    WHERE wins_completed_count > 0 OR positive_cope_chosen IS NOT NULL;

-- Trigger updated_at
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_daily_logs_updated_at
    BEFORE UPDATE ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. AI Audit Logs (append-only time-series)
CREATE TABLE ai_audit_logs (
    id          UUID PRIMARY KEY,
    user_id     UUID        NOT NULL,
    endpoint    VARCHAR(64) NOT NULL,
    latency_ms  INT         NOT NULL,
    is_fallback BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_audit_created_brin ON ai_audit_logs USING BRIN (created_at);

-- 5. Row-Level Security (defense-in-depth)
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs FORCE  ROW LEVEL SECURITY;

CREATE POLICY daily_logs_isolation_policy ON daily_logs
    FOR ALL
    USING      (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

-- 6. Least-privilege grants
GRANT SELECT, INSERT, UPDATE         ON users, daily_logs TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens    TO app_runtime;
GRANT INSERT                         ON ai_audit_logs     TO app_runtime;
