import { Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TenantContextService } from "./context/tenant-context.service";
import { TenantContextInterceptor } from "./context/tenant-context.interceptor";
import { ContextAuthGuard } from "./auth/context-auth.guard";
import { PermissionService } from "./rbac/permission.service";
import { PermissionGuard } from "./rbac/permission.guard";
import { AuditLogService } from "./audit/audit-log.service";

/**
 * Global request pipeline (P1/P3/P4). Execution order:
 *   guards:      ContextAuthGuard → PermissionGuard
 *   interceptor: TenantContextInterceptor (enters ALS)
 *   handler:     controller → domain service
 *
 * The context guard runs first: it resolves the Better Auth session, the active
 * membership/tenant and the role assignments, and attaches the RequestContext to
 * the request. The permission guard then enforces authz reading that context.
 * Finally the ALS interceptor enters the tenant context so every tenant-scoped
 * query in the handler runs inside `withTenantContext`.
 *
 * Auditing is NOT an interceptor: domain services write the audit entry inside
 * the same transaction as the mutation (AuditLogService.recordInTx), so it is
 * atomic — a failed audit rolls the mutation back, and a rolled-back mutation
 * leaves no orphan audit row (§1.9 rule 7).
 */
@Global()
@Module({
  providers: [
    TenantContextService,
    PermissionService,
    AuditLogService,
    { provide: APP_GUARD, useClass: ContextAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [TenantContextService, PermissionService, AuditLogService],
})
export class CommonModule {}
