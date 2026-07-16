import { sql } from "drizzle-orm";
import { pgPolicy, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * Schema helpers — transversal conventions (SENVORI_CORE_DOMAINS.md §0.1).
 *
 * - UUIDv7 primary keys (app-generated; time-ordered index locality).
 * - UTC timestamps only (`timestamptz`).
 * - Soft delete via `archived_at`.
 * - Audit fields on every business table.
 * - RLS (D3): tenant isolation via `app.tenant_id`, set per transaction.
 *
 * Factories return fresh builders — drizzle column builders must never be
 * shared between two tables.
 */

/** UUIDv7 primary key. */
export const id = () => uuid("id").primaryKey().$defaultFn(uuidv7);

/** Audit timestamps (§0.1) — always UTC. */
export const auditFields = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

/** Soft delete (§0.1) — hard delete only via retention/compliance routines. */
export const archivedAt = () => timestamp("archived_at", { withTimezone: true });

/**
 * NULLIF guards the empty string: an unset/cleared context must DENY (NULL
 * comparison), never raise a cast error. Tables are also FORCEd (migration
 * 0004) so the table owner is subject to RLS too — only the BYPASSRLS service
 * role (workers, platform ops) can cross tenants.
 */
const tenantMatch = sql`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`;
const tenantMatchOrPlatform = sql`tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`;

/**
 * RLS for strictly tenant-owned tables: rows are visible and writable only
 * inside the owning tenant's context.
 */
export const tenantIsolation = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: "permissive",
    for: "all",
    using: tenantMatch,
    withCheck: tenantMatch,
  });

/**
 * RLS for shared catalogs (`tenant_id` nullable — platform rows have NULL):
 * every tenant can READ platform rows and its own rows; WRITES are always
 * tenant-scoped. Platform rows are written by the ops service role, which
 * bypasses RLS (BYPASSRLS), never through tenant sessions.
 */
export const tenantIsolationSharedRead = (table: string) => [
  pgPolicy(`${table}_shared_read`, {
    as: "permissive",
    for: "select",
    using: tenantMatchOrPlatform,
  }),
  pgPolicy(`${table}_tenant_write`, {
    as: "permissive",
    for: "all",
    using: tenantMatch,
    withCheck: tenantMatch,
  }),
];
