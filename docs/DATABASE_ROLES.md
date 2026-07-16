# Senvori — Database Roles & Secure RLS (D3)

Tenant isolation in Senvori is enforced by PostgreSQL Row Level Security. Two mechanisms
combine to make it a **hard guarantee**, not a convention:

1. **FORCE ROW LEVEL SECURITY** (migration `0003`) — Postgres normally exempts a table's
   owner from RLS. FORCE removes that exemption, so policies apply to the owner too.
2. **Role separation** — the API connects as a role that owns nothing and has neither
   `SUPERUSER` nor `BYPASSRLS`. Even a bug that forgets the tenant context cannot leak
   data across tenants: with no context set, the policy predicate
   `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` evaluates to
   NULL and the row is filtered out.

## The three roles

| Role               | Attributes                                      | Used by                           | Purpose                                    |
| ------------------ | ----------------------------------------------- | --------------------------------- | ------------------------------------------ |
| `senvori_owner`    | LOGIN, NOSUPERUSER, NOBYPASSRLS                 | nobody at runtime (break-glass)   | owns the database/schema; DDL, DROP        |
| `senvori_migrator` | LOGIN, member of `senvori_owner`                | `drizzle-kit migrate` (CI/deploy) | runs migrations, owns tables (can ALTER)   |
| `senvori_app`      | LOGIN, **NOINHERIT, NOBYPASSRLS**, owns nothing | the NestJS API                    | serves requests; CRUD only, subject to RLS |

A fourth, **ops/worker** role with `BYPASSRLS` exists only for the paths that must write
shared-catalog platform rows (`tenant_id NULL` in `assets`, `licenses`, …). It is never
used by request-serving code and is provisioned out of band.

## Provisioning

```bash
# 1. create roles (once per cluster, as a superuser)
psql "$SUPERUSER_URL" \
  -v owner_pw="$SENVORI_OWNER_PW" \
  -v migrator_pw="$SENVORI_MIGRATOR_PW" \
  -v app_pw="$SENVORI_APP_PW" \
  -f infra/db/roles.sql

# 2. run migrations as the migrator (owns tables so it can ALTER later)
DATABASE_URL="postgres://senvori_migrator:$SENVORI_MIGRATOR_PW@host/senvori" \
  pnpm --filter @senvori/api db:migrate
# migration 0004 GRANTs privileges to senvori_app and sets default privileges

# 3. the API connects as the application role
DATABASE_URL="postgres://senvori_app:$SENVORI_APP_PW@host/senvori"
```

## Runtime contract

- The API sets `app.tenant_id` per transaction via `withTenantContext()` /
  `TenantContextService.withTenant()` (`set_config(..., true)` — transaction-local, safe
  with connection pooling).
- Every tenant-scoped query goes through that helper. Queries that run without a tenant
  context see **zero** rows (RLS denies), which is the safe default.

## Verification

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'senvori_%';
-- senvori_app  → rolsuper = f, rolbypassrls = f   (required)
```

Integration tests (`apps/api/test`) connect as a non-owner `senvori_app`-equivalent role
and assert: cross-tenant writes are rejected, per-tenant reads are isolated, and queries
without a context return nothing — proving the guarantee end-to-end at runtime.

## Local development

Locally the app may connect as the owner for convenience — FORCE RLS still enforces
isolation. Migration `0004` is a no-op when `senvori_app` does not exist, so nothing
breaks. Production and CI use the separated roles above.
