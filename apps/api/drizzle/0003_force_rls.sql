-- Custom migration: FORCE row level security (D3 hard guarantee).
--
-- ENABLE ROW LEVEL SECURITY (set in 0001/0002) does NOT apply to a table's OWNER,
-- and migrations run as the owner. Without FORCE, an app that connects as the owner
-- role would silently bypass every tenant_isolation policy. FORCE makes the owner
-- subject to RLS too, so tenant isolation holds regardless of which role the API
-- connects as. The ONLY way to cross tenants becomes the ops/worker service role,
-- which is granted BYPASSRLS explicitly (see apps/api/README.md) to write platform
-- rows (tenant_id NULL) in the shared catalogs.
--
-- Applies to every table that currently has RLS enabled — including the partitioned
-- analytics event tables from 0002 — so the guarantee stays complete as the schema grows.

DO $$
DECLARE
	t regclass;
BEGIN
	FOR t IN
		SELECT c.oid::regclass
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public'
		  AND c.relkind IN ('r', 'p')   -- ordinary + partitioned tables
		  AND c.relrowsecurity = true    -- RLS already enabled
	LOOP
		EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
	END LOOP;
END;
$$;
