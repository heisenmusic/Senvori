import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./database.module";

/**
 * A transaction handle already bound to a tenant's RLS context. Passed to
 * services/repositories/audit so a mutation and its audit log share ONE
 * transaction (§1.9 rule 7: audit is written synchronously with the action).
 */
export type TenantTx = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0];

/**
 * Tenant execution context (D3): RLS policies check `app.tenant_id`, set per
 * transaction with `set_config(..., true)` so it can never leak across pooled
 * connections. Every tenant-scoped query path goes through here. The whole unit
 * of work — read-before, mutation and audit — runs inside this single
 * transaction, so any failure (including the audit insert) rolls back atomically.
 */
export const withTenantContext = async <T>(
  db: DrizzleDb,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
