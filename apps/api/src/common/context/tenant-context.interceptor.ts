import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Observable } from "rxjs";
import { REQUEST_CONTEXT_KEY, type RequestContext } from "./request-context";
import { TenantContextService } from "./tenant-context.service";

/**
 * P1 — enters the AsyncLocalStorage tenant context for the duration of the
 * handler, so services/repositories run inside `withTenantContext` (RLS). Runs
 * after the guards, which have attached the resolved RequestContext. Public
 * routes (no context) pass through untouched.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const ctx = req[REQUEST_CONTEXT_KEY] as RequestContext | undefined;
    if (!ctx) return next.handle();

    return new Observable((subscriber) => {
      this.tenantContext.run(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
