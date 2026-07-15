import { Global, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { TenantContextService } from "./context/tenant-context.service";
import { TenantContextInterceptor } from "./context/tenant-context.interceptor";
import { ContextAuthGuard } from "./auth/context-auth.guard";
import { PermissionService } from "./rbac/permission.service";
import { PermissionGuard } from "./rbac/permission.guard";
import { AuditLogService } from "./audit/audit-log.service";
import { AuditLogInterceptor } from "./audit/audit-log.interceptor";

/**
 * Global request pipeline (P1/P3/P4). Order matters:
 *   guards:       ContextAuthGuard → PermissionGuard
 *   interceptors: TenantContextInterceptor (ALS) → AuditLogInterceptor
 * The context guard runs first and attaches the RequestContext; the permission
 * guard enforces authz; then the ALS interceptor wraps the handler so every
 * tenant-scoped query runs inside `withTenantContext`.
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
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
  exports: [TenantContextService, PermissionService, AuditLogService],
})
export class CommonModule {}
