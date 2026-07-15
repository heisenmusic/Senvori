-- Custom migration: privileges for the application role (D3 secure RLS model).
--
-- Roles are cluster-global and provisioned once by infra/db/roles.sql (run by a
-- superuser). This migration only GRANTs privileges to `senvori_app` IF that role
-- exists, so it is safe in local/dev where the app connects as the owner. The
-- application role has NO ownership and NO BYPASSRLS — combined with FORCE RLS
-- (0003) that guarantees tenant isolation cannot be bypassed at runtime.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senvori_app') THEN
    -- schema usage (no CREATE — the app never runs DDL)
    GRANT USAGE ON SCHEMA public TO senvori_app;

    -- CRUD on all current business tables (RLS still applies per row)
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO senvori_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO senvori_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO senvori_app;

    -- future tables/sequences created by the migrator role stay reachable
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO senvori_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO senvori_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT EXECUTE ON FUNCTIONS TO senvori_app;

    -- the app sets app.tenant_id per transaction (RLS context)
    GRANT SET ON PARAMETER "app.tenant_id" TO senvori_app;
  END IF;
END
$$;
