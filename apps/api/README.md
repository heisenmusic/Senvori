# @senvori/api

Senvori control-plane API — NestJS on the Fastify adapter, modular monolith (D2).

## Layout

```
src/
  config/        zod-validated environment contract
  database/      Drizzle + pg pool, schema per domain, RLS tenant context
  modules/       one module per domain (SENVORI_CORE_DOMAINS.md)
drizzle/         generated SQL migrations (drizzle-kit)
```

## Boundary rule (D2)

No module imports another module's internals. Communication happens through public
interfaces (exported providers) or system events. ESLint enforcement lands with the
first cross-domain interface.

## Multi-tenancy & RLS (D3)

- Every business table carries `tenant_id`; policies check
  `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` (the `NULLIF`
  guard makes an unset/empty context DENY rather than raise a cast error).
- The API sets the context per transaction via `withTenantContext()`
  (`set_config(..., true)` — transaction-local, safe with pooling).
- Tables are **FORCE ROW LEVEL SECURITY** (migration `0003`): Postgres exempts a table's
  owner from RLS, and migrations run as the owner, so without FORCE an app connecting as
  the owner would silently bypass isolation. With FORCE the guarantee holds no matter which
  role the API connects as. The **only** way to cross tenants is a dedicated ops/worker
  role with `BYPASSRLS`, used to write shared-catalog platform rows (`tenant_id NULL`).
- Shared catalogs (`assets`, `licenses`, `playlists`, `themes`, …) have a nullable
  `tenant_id` and a two-policy RLS: every tenant may READ platform rows (`NULL`) and its
  own rows; WRITES are always tenant-scoped.
- Auth tables (`users`, `sessions`, `accounts`, `verifications`, `two_factors`,
  `memberships`, `invitations`) carry no RLS: authentication runs before tenant context
  exists and users are global (one user, N tenants). Platform reference tables
  (`countries`, `plans`, `player_releases`, marketplace `providers`/`listings`) are global.

Full table-by-table reference: [`docs/DATABASE_ERD.md`](../../docs/DATABASE_ERD.md).

## Auth (D11)

Better Auth mounted at `/v1/auth/*`, organization plugin mapped onto Tenancy:
organization → `tenants`, member → `memberships`, invitation → `invitations`.
Device identity is NOT here — device tokens belong to the Fleet domain.

## Database workflow

```bash
docker compose -f ../../infra/docker/docker-compose.yml up -d
pnpm db:generate   # emit SQL migrations from src/database/schema
pnpm db:migrate    # apply to DATABASE_URL
```
