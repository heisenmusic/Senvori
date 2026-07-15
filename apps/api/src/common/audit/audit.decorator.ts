import { SetMetadata } from "@nestjs/common";

export interface AuditMeta {
  action: string;
  resourceType: string;
  /** Route param holding the affected resource id. */
  resourceIdParam?: string;
}

export const AUDIT_KEY = "senvori:audit";

/**
 * Marks a handler for automatic audit logging by AuditLogInterceptor (§1.9).
 * Use for coarse administrative mutations; domain services that need rich
 * before/after diffs call AuditLogService directly instead.
 */
export const Audit = (action: string, resourceType: string, resourceIdParam?: string) =>
  SetMetadata(AUDIT_KEY, { action, resourceType, resourceIdParam } satisfies AuditMeta);
