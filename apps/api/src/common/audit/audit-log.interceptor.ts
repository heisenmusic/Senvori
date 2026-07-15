import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import { type Observable, from, switchMap } from "rxjs";
import { REQUEST_CONTEXT_KEY, type RequestContext } from "../context/request-context";
import { AUDIT_KEY, type AuditMeta } from "./audit.decorator";
import { AuditLogService } from "./audit-log.service";

/**
 * P4 — automatic audit producer for handlers decorated with @Audit. Records
 * actor/ip/user-agent/timestamp and the response body as the "after" state
 * after a successful mutation. Domain services needing before/after diffs use
 * AuditLogService directly (those routes are not decorated, avoiding duplicates).
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const ctx = req[REQUEST_CONTEXT_KEY] as RequestContext | undefined;
    if (!ctx) return next.handle();

    const params = (req.params ?? {}) as Record<string, string>;
    const resourceId = meta.resourceIdParam ? (params[meta.resourceIdParam] ?? null) : null;

    return next.handle().pipe(
      switchMap((result) =>
        from(
          this.audit
            .recordWith(ctx, {
              action: meta.action,
              resourceType: meta.resourceType,
              resourceId:
                resourceId ??
                (result && typeof result === "object" && "id" in result
                  ? String((result as { id: unknown }).id)
                  : null),
              after: result,
            })
            .then(() => result),
        ),
      ),
    );
  }
}
