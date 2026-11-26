-- Reverse order teardown of 000001_init_schema.up.sql

REVOKE INSERT                         ON ai_audit_logs     FROM app_runtime;
REVOKE SELECT, INSERT, UPDATE, DELETE ON refresh_tokens    FROM app_runtime;
REVOKE SELECT, INSERT, UPDATE         ON users, daily_logs FROM app_runtime;

DROP POLICY IF EXISTS daily_logs_isolation_policy ON daily_logs;
ALTER TABLE IF EXISTS daily_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_logs DISABLE  ROW LEVEL SECURITY;

DROP INDEX IF EXISTS idx_ai_audit_created_brin;
DROP TABLE IF EXISTS ai_audit_logs;

DROP TRIGGER IF EXISTS trg_daily_logs_updated_at ON daily_logs;
DROP FUNCTION IF EXISTS set_updated_at();

DROP INDEX IF EXISTS idx_daily_logs_active_milestones;
DROP INDEX IF EXISTS idx_daily_logs_heatmap;
DROP TABLE IF EXISTS daily_logs;

DROP INDEX IF EXISTS idx_refresh_tokens_user;
DROP INDEX IF EXISTS idx_refresh_tokens_family;
DROP TABLE IF EXISTS refresh_tokens;

DROP TABLE IF EXISTS users;
