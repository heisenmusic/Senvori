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
  `current_setting('app.tenant_id', true)::uuid`.
- The API sets the context per transaction via `withTenantContext()`
  (`set_config(..., true)` — transaction-local, safe with pooling).
- Auth tables (`users`, `sessions`, `accounts`, `verifications`, `memberships`,
  `invitations`) carry no RLS: authentication runs before tenant context exists and
  users are global (one user, N tenants). `countries` is a platform-scope reference.

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
