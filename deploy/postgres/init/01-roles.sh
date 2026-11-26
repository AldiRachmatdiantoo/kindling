#!/bin/bash
set -euo pipefail

MIGRATOR_PASS="${APP_MIGRATOR_PASSWORD:-migrator_secret_dev}"
RUNTIME_PASS="${APP_RUNTIME_PASSWORD:-runtime_secret_dev}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_pass="$MIGRATOR_PASS" \
  -v runtime_pass="$RUNTIME_PASS" \
  -v db_name="$POSTGRES_DB" <<-'EOSQL'
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
            CREATE ROLE app_migrator LOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
            CREATE ROLE app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
        END IF;
    END
    $$;

    ALTER ROLE app_migrator WITH PASSWORD :'migrator_pass';
    ALTER ROLE app_runtime  WITH PASSWORD :'runtime_pass';

    GRANT CONNECT, CREATE ON DATABASE :"db_name" TO app_migrator;
    ALTER SCHEMA public OWNER TO app_migrator;
    GRANT ALL ON SCHEMA public TO app_migrator;

    GRANT CONNECT ON DATABASE :"db_name" TO app_runtime;
    GRANT USAGE   ON SCHEMA public TO app_runtime;
EOSQL
