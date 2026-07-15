import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AssignRoleInput,
  AuditLogEntryDto,
  CurrentUserDto,
  InviteMemberInput,
  MembershipWithUserDto,
  RoleAssignmentDto,
  SystemRole,
} from "@senvori/contracts";
import { and, desc, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import {
  auditLogEntries,
  invitations,
  memberships,
  roleAssignments,
  users,
} from "../../database/schema";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";
import { PermissionService } from "../../common/rbac/permission.service";

const iso = (d: Date | null | undefined): string => (d ?? new Date()).toISOString();

/**
 * Identity domain service — SENVORI_CORE_DOMAINS.md §1.
 * Auth tables (users/memberships/invitations) are global (no RLS) and filtered
 * explicitly by tenant; role_assignments and audit_log_entries are RLS-scoped
 * and go through the tenant context.
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly tenantContext: TenantContextService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditLogService,
  ) {}

  me(ctx: RequestContext): CurrentUserDto {
    return {
      user: {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        emailVerified: ctx.user.emailVerified,
        image: ctx.user.image,
        locale: ctx.user.locale,
        status: ctx.user.status === "suspended" ? "suspended" : "active",
        createdAt: iso(new Date()),
        updatedAt: iso(new Date()),
      },
      tenantId: ctx.tenantId,
      membershipId: ctx.membershipId,
      role: (ctx.role as SystemRole) ?? "analyst",
      assignments: [],
      permissions: this.permissions.effectivePermissions(ctx),
    };
  }

  async updateMe(
    ctx: RequestContext,
    input: { name?: string; locale?: string | null },
  ): Promise<void> {
    await this.db
      .update(users)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.userId));
  }

  async listMembers(ctx: RequestContext): Promise<MembershipWithUserDto[]> {
    const rows = await this.db
      .select({
        id: memberships.id,
        tenantId: memberships.organizationId,
        userId: memberships.userId,
        role: memberships.role,
        status: memberships.status,
        createdAt: memberships.createdAt,
        userName: users.name,
        userEmail: users.email,
        userImage: users.image,
        userStatus: users.status,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, ctx.tenantId));

    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      userId: r.userId,
      role: (r.role as SystemRole) ?? "analyst",
      status: r.status,
      createdAt: iso(r.createdAt),
      user: {
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        image: r.userImage,
        status: r.userStatus,
      },
    }));
  }

  async suspendMember(ctx: RequestContext, membershipId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.tenantId)));
    if (!existing)
      throw new NotFoundException({ code: "MEMBER_NOT_FOUND", title: "Membership not found" });

    await this.db
      .update(memberships)
      .set({ status: "suspended" })
      .where(eq(memberships.id, membershipId));
    await this.audit.record({
      action: "identity.membership.suspended",
      resourceType: "membership",
      resourceId: membershipId,
      before: { status: existing.status },
      after: { status: "suspended" },
    });
  }

  async createInvitation(ctx: RequestContext, input: InviteMemberInput): Promise<{ id: string }> {
    const id = uuidv7();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.insert(invitations).values({
      id,
      organizationId: ctx.tenantId,
      email: input.email,
      role: input.role,
      status: "pending",
      expiresAt,
      inviterId: ctx.userId,
    });
    await this.audit.record({
      action: "identity.invitation.sent",
      resourceType: "invitation",
      resourceId: id,
      after: { email: input.email, role: input.role },
    });
    return { id };
  }

  async listInvitations(
    ctx: RequestContext,
  ): Promise<{ id: string; email: string; role: string; status: string; expiresAt: string }[]> {
    const rows = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, ctx.tenantId));
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role ?? "",
      status: r.status,
      expiresAt: iso(r.expiresAt),
    }));
  }

  async assignRole(ctx: RequestContext, input: AssignRoleInput): Promise<RoleAssignmentDto> {
    // membership must belong to this tenant (auth table, filter explicitly)
    const [membership] = await this.db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.id, input.membershipId), eq(memberships.organizationId, ctx.tenantId)),
      );
    if (!membership)
      throw new ForbiddenException({ code: "MEMBER_NOT_FOUND", title: "Membership not in tenant" });

    const id = uuidv7();
    await this.tenantContext.withTenant((tx) =>
      tx.insert(roleAssignments).values({
        id,
        tenantId: ctx.tenantId,
        membershipId: input.membershipId,
        role: input.role,
        scopeType: input.scope.type,
        scopeId: input.scope.id,
      }),
    );
    await this.audit.record({
      action: "identity.role.assigned",
      resourceType: "role_assignment",
      resourceId: id,
      scopeType: input.scope.type,
      scopeId: input.scope.id,
      after: { role: input.role, membershipId: input.membershipId },
    });
    return {
      id,
      membershipId: input.membershipId,
      role: input.role,
      scope: input.scope,
      createdAt: iso(new Date()),
    };
  }

  async revokeRoleAssignment(ctx: RequestContext, id: string): Promise<void> {
    const deleted = await this.tenantContext.withTenant((tx) =>
      tx
        .delete(roleAssignments)
        .where(eq(roleAssignments.id, id))
        .returning({ id: roleAssignments.id }),
    );
    if (deleted.length === 0) {
      throw new NotFoundException({
        code: "ASSIGNMENT_NOT_FOUND",
        title: "Role assignment not found",
      });
    }
    await this.audit.record({
      action: "identity.role.revoked",
      resourceType: "role_assignment",
      resourceId: id,
    });
  }

  async listAuditLogs(ctx: RequestContext, limit: number): Promise<AuditLogEntryDto[]> {
    const rows = await this.tenantContext.withTenant((tx) =>
      tx.select().from(auditLogEntries).orderBy(desc(auditLogEntries.occurredAt)).limit(limit),
    );
    return rows.map((r) => ({
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      scopeType: r.scopeType,
      scopeId: r.scopeId,
      changes: r.changes ?? null,
      ipAddress: r.ipAddress,
      occurredAt: iso(r.occurredAt),
    }));
  }
}
