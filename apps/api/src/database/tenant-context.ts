import { sql } from "drizzle-orm";
import type { DrizzleDb } from "./database.module";

/**
 * Tenant execution context (D3): RLS policies check `app.tenant_id`, set per
 * transaction with `set_config(..., true)` so it can never leak across pooled
 * connections. Every tenant-scoped query path goes through here.
 */
export const withTenantContext = async <T>(
  db: DrizzleDb,
  tenantId: string,
  fn: (tx: Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
