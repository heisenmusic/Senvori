import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { DEVICE_CONTEXT_KEY, type DeviceContext } from "./device-context";
import { FleetRepository } from "./fleet.repository";
import { sha256Hex } from "./player-crypto";

/**
 * Authenticates a device by its bearer token (Sprint 10A · §4.2). The raw token
 * is hashed and looked up via the self-auth RLS path; the resolved tenant, zone
 * and unit are attached as a DeviceContext. Applied per-route with
 * `@UseGuards(DeviceAuthGuard)`; those routes are also `@Public()` so the human
 * session guard is skipped. Never logs the token.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly fleet: FleetRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest & Record<string, unknown>>();
    const header = req.headers["authorization"];
    const raw = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!raw) {
      throw new UnauthorizedException({
        code: "DEVICE_UNAUTHENTICATED",
        title: "Missing device token",
      });
    }

    const auth = await this.fleet.authenticateToken(sha256Hex(raw));
    const now = new Date();
    if (!auth) {
      throw new UnauthorizedException({
        code: "DEVICE_TOKEN_INVALID",
        title: "Invalid device token",
      });
    }
    if (auth.revokedAt) {
      throw new UnauthorizedException({
        code: "DEVICE_TOKEN_REVOKED",
        title: "Device token revoked",
      });
    }
    if (auth.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException({
        code: "DEVICE_TOKEN_EXPIRED",
        title: "Device token expired",
      });
    }

    const scope = await this.fleet.withTenant(auth.tenantId, async (tx) => {
      const s = await this.fleet.loadDeviceScope(tx, auth.deviceId);
      if (s) await this.fleet.touchToken(tx, auth.tokenId, now);
      return s;
    });
    if (!scope || scope.status === "decommissioned") {
      throw new UnauthorizedException({ code: "DEVICE_NOT_ACTIVE", title: "Device is not active" });
    }

    const device: DeviceContext = {
      deviceId: auth.deviceId,
      tenantId: auth.tenantId,
      zoneId: scope.zoneId,
      unitId: scope.unitId,
      unitName: scope.unitName,
      timezone: scope.timezone,
      tokenId: auth.tokenId,
    };
    req[DEVICE_CONTEXT_KEY] = device;
    return true;
  }
}
