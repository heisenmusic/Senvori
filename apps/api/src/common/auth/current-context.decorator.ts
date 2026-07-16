import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { REQUEST_CONTEXT_KEY, type RequestContext } from "../context/request-context";

/** Injects the resolved RequestContext into a handler parameter. */
export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const req = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    return req[REQUEST_CONTEXT_KEY] as RequestContext;
  },
);
