import { Controller, Get, Query } from "@nestjs/common";
import type { AuditLogEntryDto } from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { IdentityService } from "./identity.service";

/** /v1/audit-logs — the administrative audit trail (§1.6). */
@Controller("audit-logs")
export class AuditLogsController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @RequirePermission("identity:audit:read")
  list(
    @CurrentContext() ctx: RequestContext,
    @Query("limit") limit?: string,
  ): Promise<AuditLogEntryDto[]> {
    const parsed = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return this.identity.listAuditLogs(ctx, parsed);
  }
}
