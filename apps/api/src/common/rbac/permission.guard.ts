import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { REQUEST_CONTEXT_KEY, type RequestContext } from "../context/request-context";
import { PermissionService, type PermissionTarget } from "./permission.service";
import { REQUIRE_PERMISSION_KEY, type RequiredPermission } from "./require-permission.decorator";
import { REQUIRE_ROLE_KEY } from "./require-role.decorator";

/**
 * P3 — enforces @RequirePermission / @RequireRole after the context guard has
 * attached the RequestContext. Resolves the permission target scope from route
 * params and delegates coverage to PermissionService.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRole = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required && !requiredRole) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const ctx = req[REQUEST_CONTEXT_KEY] as RequestContext | undefined;
    if (!ctx) {
      throw new ForbiddenException({ code: "NO_CONTEXT", title: "Missing request context" });
    }

    if (requiredRole && !this.permissions.hasRole(ctx, requiredRole)) {
      throw new ForbiddenException({
        code: "ROLE_REQUIRED",
        title: `Requires role ${requiredRole}`,
      });
    }

    if (required) {
      const params = (req.params ?? {}) as Record<string, string>;
      const target: PermissionTarget = {};
      if (required.options.unitParam) target.unitId = params[required.options.unitParam];
      if (required.options.brandParam) target.brandId = params[required.options.brandParam];
      if (required.options.groupParam) target.groupId = params[required.options.groupParam];

      const allowed = await this.permissions.can(
        ctx,
        required.permission,
        Object.keys(target).length ? target : undefined,
      );
      if (!allowed) {
        throw new ForbiddenException({
          code: "PERMISSION_DENIED",
          title: `Requires ${required.permission}`,
        });
      }
    }
    return true;
  }
}
