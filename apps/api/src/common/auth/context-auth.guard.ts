import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext } from "../../database/tenant-context";
import { memberships, roleAssignments } from "../../database/schema";
import { AUTH, type Auth } from "../../modules/identity/auth.config";
import {
  REQUEST_CONTEXT_KEY,
  type GrantScope,
  type RequestContext,
} from "../context/request-context";
import { IS_PUBLIC_KEY } from "./public.decorator";

const toHeaders = (raw: FastifyRequest["headers"]): Headers => {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }
  return headers;
};

/**
 * P1 — resolves the authenticated request context and attaches it to the
 * request. Steps (§1): resolve user (Better Auth session) → resolve active
 * membership → resolve tenant → load role assignments (in the tenant's RLS
 * context). Public routes are skipped. Runs before the permission guard and
 * before the ALS interceptor, which both read `request[REQUEST_CONTEXT_KEY]`.
 */
@Injectable()
export class ContextAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const session = await this.auth.api.getSession({ headers: toHeaders(req.headers) });
    if (!session?.user) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        title: "Authentication required",
      });
    }

    const userId = session.user.id;
    const activeOrg =
      (session.session as { activeOrganizationId?: string | null })?.activeOrganizationId ?? null;

    const rows = await this.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")));
    const membership = activeOrg ? rows.find((m) => m.organizationId === activeOrg) : rows[0];
    if (!membership) {
      throw new ForbiddenException({
        code: "NO_ACTIVE_MEMBERSHIP",
        title: "No active tenant membership",
      });
    }
    const tenantId = membership.organizationId;

    const assignmentRows = await withTenantContext(this.db, tenantId, (tx) =>
      tx.select().from(roleAssignments).where(eq(roleAssignments.membershipId, membership.id)),
    );
    const assignments: GrantScope[] = assignmentRows.map((a) => ({
      role: a.role as GrantScope["role"],
      scopeType: a.scopeType,
      scopeId: a.scopeId,
    }));

    const u = session.user as Record<string, unknown>;
    const ctx: RequestContext = {
      userId,
      user: {
        id: userId,
        name: String(u.name ?? ""),
        email: String(u.email ?? ""),
        emailVerified: Boolean(u.emailVerified),
        image: (u.image as string | null) ?? null,
        locale: (u.locale as string | null) ?? null,
        status: String(u.status ?? "active"),
      },
      tenantId,
      membershipId: membership.id,
      role: membership.role,
      assignments,
      ip: req.ip ?? null,
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    };
    req[REQUEST_CONTEXT_KEY] = ctx;
    return true;
  }
}
