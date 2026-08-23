-- DEV-ONLY fixed credentials. Production uses managed secrets, never this file.

-- Application runtime role: NOT superuser, so RLS actually applies.
CREATE ROLE kithlink_app LOGIN PASSWORD 'kithlink_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE kithlink TO kithlink_app;
GRANT USAGE ON SCHEMA public TO kithlink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kithlink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kithlink_app;
