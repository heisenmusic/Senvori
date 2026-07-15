import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext } from "../../database/tenant-context";
import { auditLogEntries } from "../../database/schema";
import type { RequestContext } from "../context/request-context";
import { TenantContextService } from "../context/tenant-context.service";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * P4 — the official producer of `audit_log_entries` (§1.9 rule 7). Every
 * administrative mutation records actor, tenant, resource, action, before/after,
 * ip, user-agent and timestamp, written in the tenant's RLS context in the same
 * logical flow as the mutation.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly tenantContext: TenantContextService,
  ) {}

  /** Record using the active ALS context (called by domain services). */
  async record(entry: AuditEntry): Promise<void> {
    return this.recordWith(this.tenantContext.get(), entry);
  }

  /** Record with an explicit context (called by the interceptor, no ALS needed). */
  async recordWith(ctx: RequestContext, entry: AuditEntry): Promise<void> {
    await withTenantContext(this.db, ctx.tenantId, (tx) =>
      tx.insert(auditLogEntries).values({
        tenantId: ctx.tenantId,
        actorType: "user",
        actorId: ctx.userId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        scopeType: entry.scopeType ?? null,
        scopeId: entry.scopeId ?? null,
        changes: {
          before: entry.before ?? null,
          after: entry.after ?? null,
          meta: { userAgent: ctx.userAgent },
        },
        ipAddress: ctx.ip,
      }),
    );
  }
}
