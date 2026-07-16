import { AsyncLocalStorage } from "node:async_hooks";
import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext, type TenantTx } from "../../database/tenant-context";
import type { RequestContext } from "./request-context";

type Tx = TenantTx;

/**
 * Runtime tenant context (P1). Holds the authenticated request context in
 * AsyncLocalStorage so services and repositories can resolve the current tenant
 * without threading it through every call — and, crucially, so every domain
 * query runs inside `withTenantContext` (RLS `app.tenant_id`). No tenant-scoped
 * query may execute outside this context.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Runs `fn` with the given request context active (used by the interceptor). */
  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  /** The active context, or throws if called outside an authenticated request. */
  get(): RequestContext {
    const ctx = this.als.getStore();
    if (!ctx) {
      throw new Error("No tenant context: a tenant-scoped operation ran outside a request");
    }
    return ctx;
  }

  getOrNull(): RequestContext | null {
    return this.als.getStore() ?? null;
  }

  get tenantId(): string {
    return this.get().tenantId;
  }

  get userId(): string {
    return this.get().userId;
  }

  /**
   * Runs a database operation inside the current tenant's RLS context.
   * Every tenant-scoped repository call goes through here.
   */
  withTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return withTenantContext(this.db, this.get().tenantId, fn);
  }
}
