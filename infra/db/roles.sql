-- Senvori — database role provisioning (D3 secure RLS model).
--
-- Run ONCE per cluster by a superuser, BEFORE the app connects. Roles are
-- cluster-global; migrations only grant privileges to senvori_app (0004).
--
--   psql "$SUPERUSER_URL" \
--     -v owner_pw="$SENVORI_OWNER_PW" \
--     -v migrator_pw="$SENVORI_MIGRATOR_PW" \
--     -v app_pw="$SENVORI_APP_PW" \
--     -f infra/db/roles.sql
--
-- Three separated roles (never share one):
--   senvori_owner    — owns the database + schema. DDL, DROP. Used by nobody at
--                      runtime; break-glass only.
--   senvori_migrator — runs drizzle-kit migrate. Owns tables (so it can ALTER),
--                      inherits from owner. NEVER serves requests.
--   senvori_app      — the API connection. LOGIN, NOINHERIT, **NOBYPASSRLS**, owns
--                      nothing. FORCE RLS (migration 0003) applies to it fully, so
--                      tenant isolation cannot be bypassed even with a bug.
--
-- Only the ops/worker path that must write platform rows (tenant_id NULL in the
-- shared catalogs) uses a separate BYPASSRLS role — provisioned separately and
-- never exposed to request-serving code.

-- owner ------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senvori_owner') THEN
    CREATE ROLE senvori_owner LOGIN PASSWORD :'owner_pw' NOSUPERUSER NOCREATEDB NOBYPASSRLS;
  END IF;
END $$;

-- migrator (owns objects; can DDL) ---------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senvori_migrator') THEN
    CREATE ROLE senvori_migrator LOGIN PASSWORD :'migrator_pw' NOSUPERUSER NOCREATEDB NOBYPASSRLS;
  END IF;
END $$;
GRANT senvori_owner TO senvori_migrator;

-- application (request-serving; least privilege) -------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senvori_app') THEN
    CREATE ROLE senvori_app LOGIN PASSWORD :'app_pw'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

-- The app must never own objects. Privileges are granted by migration 0004
-- (GRANT ... TO senvori_app + ALTER DEFAULT PRIVILEGES), which re-runs safely.
--
-- Verify the guarantee after provisioning:
--   SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname LIKE 'senvori_%';
--   -- senvori_app must show rolbypassrls = f and rolsuper = f
