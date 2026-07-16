import { Injectable } from "@nestjs/common";
import type { TenantTx } from "../../database/tenant-context";
import { auditLogEntries } from "../../database/schema";
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
 * ip, user-agent and timestamp.
 *
 * Auditing is TRANSACTIONAL: `recordInTx` writes into the SAME transaction as
 * the mutation, so a failed audit insert rolls the mutation back and a rolled-
 * back mutation can never leave an orphan audit row. The actor/tenant come from
 * the active request context (AsyncLocalStorage), not the caller, so they can't
 * be spoofed. Only summarized before/after diffs are stored — never full
 * sensitive payloads (LGPD/GDPR, D12).
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly tenantContext: TenantContextService) {}

  /**
   * Append an audit entry inside an already tenant-scoped transaction. Must be
   * called within `TenantContextService.withTenant` (or `withTenantContext`) so
   * `app.tenant_id` is set and the write is atomic with the mutation.
   */
  async recordInTx(tx: TenantTx, entry: AuditEntry): Promise<void> {
    const ctx = this.tenantContext.get();
    await tx.insert(auditLogEntries).values({
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
    });
  }
}
