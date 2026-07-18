import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

/** Request key under which the DeviceAuthGuard attaches the resolved device. */
export const DEVICE_CONTEXT_KEY = "senvori:deviceContext";

/**
 * The authenticated device's derived scope. Everything here comes from the
 * device credential on the server — the device never sends its tenant/unit, so
 * it can never forge scope (§5). Mirrors how RequestContext works for humans.
 */
export interface DeviceContext {
  deviceId: string;
  tenantId: string;
  zoneId: string;
  unitId: string;
  unitName: string;
  timezone: string;
  tokenId: string;
}

/** Injects the authenticated DeviceContext into a device-route handler. */
export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DeviceContext => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const device = req[DEVICE_CONTEXT_KEY] as DeviceContext | undefined;
    if (!device) {
      // The guard runs first and throws on failure, so this is a programming error.
      throw new Error("DeviceContext missing: is DeviceAuthGuard applied to this route?");
    }
    return device;
  },
);
