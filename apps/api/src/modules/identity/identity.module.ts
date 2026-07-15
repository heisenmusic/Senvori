import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { MeController } from "./me.controller";
import { MembersController } from "./members.controller";
import { InvitationsController } from "./invitations.controller";
import { RoleAssignmentsController } from "./role-assignments.controller";
import { AuditLogsController } from "./audit-logs.controller";
import { IdentityService } from "./identity.service";

/**
 * Identity domain — SENVORI_CORE_DOMAINS.md §1.
 * Authentication (Better Auth) is bridged by AuthController; the AUTH provider
 * itself lives in the global AuthModule. This module owns the RBAC-guarded
 * member/invitation/role/audit endpoints.
 */
@Module({
  controllers: [
    AuthController,
    MeController,
    MembersController,
    InvitationsController,
    RoleAssignmentsController,
    AuditLogsController,
  ],
  providers: [IdentityService],
})
export class IdentityModule {}
