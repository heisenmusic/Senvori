# Identity + Tenancy Runtime

How an authenticated request flows through the Senvori control-plane API, and
the guarantees each stage provides. Every statement here is exercised by the
integration suite (`apps/api/test/*.spec.ts`) against a real PostgreSQL with the
application connected as a non-owner, `NOBYPASSRLS` role.

## Request pipeline (order)

NestJS runs enhancers in a fixed order; the pipeline relies on it:

```
Better Auth (/v1/auth/*, @Public)   ← session issuance, no tenant context
        │
guards        1. ContextAuthGuard    → resolves session → active membership →
              │                         tenant → role assignments; attaches the
              │                         RequestContext to the request object
              2. PermissionGuard      → enforces @RequirePermission/@RequireRole
        │                               reading that RequestContext
interceptor   TenantContextInterceptor→ enters AsyncLocalStorage with the context
        │
handler       controller → domain service → repository (withTenant)
```

- The **context guard runs first** and attaches `request[REQUEST_CONTEXT_KEY]`.
  Both guards read the context **from the request object**, not from
  AsyncLocalStorage — so authorization never depends on an interceptor that runs
  later.
- The **interceptor enters the ALS** for the duration of the handler, so domain
  services resolve the current tenant via `TenantContextService` without
  threading it through every call.
- `AsyncLocalStorage` gives each request an isolated store. Concurrent requests
  never share context — proven by a 24-way interleaved A/B test.

## Transaction & RLS

`withTenantContext(db, tenantId, fn)` opens **one** transaction, runs
`select set_config('app.tenant_id', tenantId, true)` (transaction-local, so it
can never leak across pooled connections), then runs `fn(tx)`. RLS policies on
every tenant-scoped table check `app.tenant_id`.

- The application connects as a **non-owner, `NOBYPASSRLS`** role, so RLS is
  enforced at runtime — with no tenant context set, reads return nothing and
  writes are rejected by the policy `WITH CHECK`.
- A rolled-back transaction clears the setting automatically; an error in one
  request cannot contaminate the next.

## RBAC

Permissions are `domain:resource:action` (see
`packages/contracts/src/rbac/permissions.ts` for the catalog and system-role
mapping). Grants may use `*` per segment (`identity:*`, `analytics:*:read`) or
the bare `*` (owner).

Authorization is always **permission ∧ scope**:

1. **Permission** — does any grant the context holds satisfy the required
   `domain:resource:action`? A grant comes from the membership role (at tenant
   scope) or from a `role_assignment` (at its own scope).
2. **Scope coverage** — does that grant sit at a scope that **covers** the
   target? Coverage follows the hierarchy
   `tenant → country → brand → group → unit`: a grant at any **ancestor** scope
   of the target authorizes it. For a unit target the covering set is
   `{tenant, its country, its brand, the groups it belongs to, the unit}`.

Precedence & safety:

- **Deny by default.** Access requires a grant that matches on both axes; there
  are no negative grants, so overlapping grants only ever widen what is allowed,
  never silently deny.
- An **action wildcard does not widen scope** — `fleet:device:*` at `unit:X`
  still only covers unit X.
- Only roles mapped to `*` (owner) hold the global wildcard; an unknown/invalid
  role maps to no permissions.
- A **suspended membership** is not resolved by the context guard → the request
  is denied (`NO_ACTIVE_MEMBERSHIP`).
- A grant in **Tenant A never covers Tenant B**: cross-tenant targets are hidden
  by RLS, so the operation surfaces as `404` — never a silent cross-tenant write.

## Better Auth · Identity · Tenancy

Clear separation of responsibilities, single source of truth per concern:

- **Better Auth** (`/v1/auth/*`) owns authentication and the session (cookie,
  expiry, logout). `session.activeOrganizationId` is a **preference pointer**.
- **Senvori Identity** owns memberships, role assignments and permissions.
  Memberships are the **authoritative** source of tenant access: the context
  guard honors `activeOrganizationId` when it maps to an _active_ membership and
  falls back to a valid membership otherwise, so a stale/suspended active org
  can never lock a user out — while access stays restricted to tenants the user
  actually belongs to.
- **Senvori Tenancy** is the source of truth for the organizational hierarchy
  (tenant → country → brand → group → unit → zone) that RBAC scopes resolve
  against.

## Transactional audit

Every administrative mutation records an `audit_log_entries` row **inside the
same transaction** as the mutation (`AuditLogService.recordInTx`):

- Actor and tenant come from the request context (ALS) — they cannot be spoofed
  by the caller.
- The service reads the real **before** state, applies the write, and records
  **before/after** in one `withTenant` transaction. If the audit insert fails,
  the whole unit of work rolls back — no orphan mutation, no orphan audit row.
- Only summarized before/after diffs are stored, never full sensitive payloads
  (LGPD/GDPR, D12). The trail is append-only (no update/delete path).

## Database roles

Owner / migration / application role separation and `FORCE RLS` are documented
in [`DATABASE_ROLES.md`](./DATABASE_ROLES.md). The application role owns nothing
and has neither `BYPASSRLS` nor DDL rights.

## Running the tests

Integration tests need a PostgreSQL reachable at `localhost:5432` with a
`senvori` superuser/`CREATEROLE` login (matching CI's service). They build the
app, provision a throwaway `senvori_test` database and a non-owner
`senvori_app_test` (`NOBYPASSRLS`) role, run migrations, boot the app as that
role and exercise the HTTP layer:

```bash
cd apps/api
pnpm test          # nest build && vitest run
```

- `test/integration.spec.ts` — the 6 core runtime guarantees.
- `test/hardening.spec.ts` — RBAC scope matrix, concurrent isolation, atomic
  audit, auth edges, API contract, active-tenant coherence.

CI runs the same suite (with a `postgres:16` service) **before** the build, so a
failing test, lint or typecheck fails the pipeline.
