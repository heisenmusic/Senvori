import { Inject, Injectable } from "@nestjs/common";
import { hasPermission, permissionsForRole } from "@senvori/contracts";
import { eq } from "drizzle-orm";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext } from "../../database/tenant-context";
import { groupMemberships, units } from "../../database/schema";
import type { RequestContext } from "../context/request-context";

/**
 * A resource the permission is being checked against. Omitted → tenant-level
 * operation (create/list), which only tenant-scoped grants authorize.
 */
export interface PermissionTarget {
  unitId?: string;
  brandId?: string;
  groupId?: string;
  countryCode?: string;
  scopeType?: "tenant" | "country" | "brand" | "group" | "unit";
  scopeId?: string;
}

interface Grant {
  perms: readonly string[];
  scopeType: string;
  scopeId: string;
}

/**
 * P3 — authorization engine (§0.4). A request is allowed when it holds a grant
 * that (a) satisfies the required `domain:resource:action` and (b) sits at a
 * scope that COVERS the target. Coverage follows the hierarchy
 * tenant → country → brand → group → unit: a grant at any ancestor scope of the
 * target authorizes it.
 */
@Injectable()
export class PermissionService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Every grant the context holds: membership role (tenant scope) + assignments. */
  private grantsFor(ctx: RequestContext): Grant[] {
    const grants: Grant[] = [
      { perms: permissionsForRole(ctx.role), scopeType: "tenant", scopeId: ctx.tenantId },
    ];
    for (const a of ctx.assignments) {
      grants.push({
        perms: permissionsForRole(a.role),
        scopeType: a.scopeType,
        scopeId: a.scopeId,
      });
    }
    return grants;
  }

  /** The set of `scopeType:scopeId` that would cover the target (its ancestors). */
  private async coveringScopes(
    ctx: RequestContext,
    target?: PermissionTarget,
  ): Promise<Set<string>> {
    const set = new Set<string>([`tenant:${ctx.tenantId}`]);
    if (!target) return set;

    if (target.unitId) {
      const [unit] = await withTenantContext(this.db, ctx.tenantId, (tx) =>
        tx
          .select({ id: units.id, brandId: units.brandId, countryCode: units.countryCode })
          .from(units)
          .where(eq(units.id, target.unitId as string)),
      );
      if (unit) {
        set.add(`unit:${unit.id}`);
        set.add(`brand:${unit.brandId}`);
        set.add(`country:${unit.countryCode}`);
        const memberships = await withTenantContext(this.db, ctx.tenantId, (tx) =>
          tx
            .select({ groupId: groupMemberships.groupId })
            .from(groupMemberships)
            .where(eq(groupMemberships.unitId, unit.id)),
        );
        for (const m of memberships) set.add(`group:${m.groupId}`);
      }
      return set;
    }
    if (target.brandId) set.add(`brand:${target.brandId}`);
    if (target.groupId) set.add(`group:${target.groupId}`);
    if (target.countryCode) set.add(`country:${target.countryCode}`);
    if (target.scopeType && target.scopeId) set.add(`${target.scopeType}:${target.scopeId}`);
    return set;
  }

  async can(ctx: RequestContext, permission: string, target?: PermissionTarget): Promise<boolean> {
    const covering = await this.coveringScopes(ctx, target);
    return this.grantsFor(ctx).some(
      (g) => hasPermission(g.perms, permission) && covering.has(`${g.scopeType}:${g.scopeId}`),
    );
  }

  /** Does the context hold `role` at the tenant scope (membership or assignment)? */
  hasRole(ctx: RequestContext, role: string): boolean {
    if (ctx.role === role) return true;
    return ctx.assignments.some((a) => a.role === role);
  }

  /** Flattened grant patterns for display (GET /v1/me) — not scope-resolved. */
  effectivePermissions(ctx: RequestContext): string[] {
    const set = new Set<string>();
    for (const g of this.grantsFor(ctx)) for (const p of g.perms) set.add(p);
    return [...set];
  }
}
