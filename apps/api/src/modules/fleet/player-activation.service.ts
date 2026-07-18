import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PLAYER_CONTRACT_VERSION,
  type PlayerActivationClaimRequest,
  type PlayerActivationCompleteRequest,
  type PlayerActivationStartRequest,
  type PlayerActivationStartResponse,
  type PlayerActivationStatusResponse,
  type PlayerCredentialResponse,
  type PlayerDeviceSummary,
} from "@senvori/contracts";
import type { RequestContext } from "../../common/context/request-context";
import { AuditLogService } from "../../common/audit/audit-log.service";
import { TenantContextService } from "../../common/context/tenant-context.service";
import { DeviceContext } from "./device-context";
import { FleetRepository, type PairingCodeRow } from "./fleet.repository";
import { generateActivationCode, hashesEqual, mintDeviceToken, sha256Hex } from "./player-crypto";
import { toDeviceSummary } from "./fleet.mappers";

/** Activation code lifetime — short, single-use (§4.1). */
const ACTIVATION_TTL_MS = 15 * 60 * 1000;
/** Device session token lifetime; the Player refreshes before expiry (10B). */
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const POLL_INTERVAL_SECONDS = 5;

/**
 * Player activation (Sprint 10A · §4.1). Proof-of-possession pairing:
 *   start (device)  → code + secret hash stored
 *   claim (operator)→ device created, bound to a zone, code claimed
 *   complete (device, presents raw secret) → token minted, returned ONCE
 * Single-use, expiring, replay-protected, tenant-isolated, audited.
 */
@Injectable()
export class PlayerActivationService {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditLogService,
  ) {}

  /* ------------------------------------------------------- device: start -- */

  async start(input: PlayerActivationStartRequest): Promise<PlayerActivationStartResponse> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS);
    // Retry on the (rare) unique-code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateActivationCode();
      try {
        const row = await this.fleet.insertPairingCode({
          code,
          status: "pending",
          activationSecretHash: input.activationSecretHash,
          provisionalProfile: {
            deviceLocalId: input.deviceId,
            platform: input.platform,
            appVersion: input.appVersion,
            hardwareModel: input.hardwareModel ?? null,
            capabilities: input.capabilities ?? {},
          },
          expiresAt,
        });
        return {
          code: row.code,
          expiresAt: row.expiresAt.toISOString(),
          pollIntervalSeconds: POLL_INTERVAL_SECONDS,
        };
      } catch (e) {
        if (attempt === 4) throw e;
      }
    }
    // Unreachable — the loop returns or throws.
    throw new BadRequestException({
      code: "ACTIVATION_UNAVAILABLE",
      title: "Could not allocate a code",
    });
  }

  /* ------------------------------------------------------ device: status -- */

  async status(code: string): Promise<PlayerActivationStatusResponse> {
    const row = await this.fleet.findPairingByCode(code);
    if (!row) throw new NotFoundException({ code: "ACTIVATION_NOT_FOUND", title: "Unknown code" });
    const status = this.effectiveStatus(row, new Date());
    let unitName: string | null = null;
    let friendlyName: string | null = null;
    if (row.deviceId && row.tenantId) {
      const device = await this.fleet.withTenant(row.tenantId, (tx) =>
        this.fleet.findDeviceInTenant(tx, row.deviceId as string),
      );
      friendlyName = device?.name ?? null;
      if (row.zoneId) {
        const zone = await this.fleet.withTenant(row.tenantId, (tx) =>
          this.fleet.findZone(tx, row.zoneId as string),
        );
        unitName = zone?.unitName ?? null;
      }
    }
    return { status, unitName, friendlyName, expiresAt: row.expiresAt.toISOString() };
  }

  /* ----------------------------------------------------- operator: claim -- */

  async claim(
    ctx: RequestContext,
    code: string,
    input: PlayerActivationClaimRequest,
  ): Promise<PlayerDeviceSummary> {
    return this.tenantContext.withTenant(async (tx) => {
      const pairing = await this.fleet.findActivationByCode(tx, code);
      if (!pairing) {
        throw new NotFoundException({ code: "ACTIVATION_NOT_FOUND", title: "Unknown code" });
      }
      if (this.effectiveStatus(pairing, new Date()) !== "pending") {
        throw new ConflictException({
          code: "ACTIVATION_NOT_PENDING",
          title: "Code is not awaiting a claim",
        });
      }
      const zone = await this.fleet.findZone(tx, input.zoneId);
      if (!zone) {
        throw new BadRequestException({ code: "ZONE_NOT_FOUND", title: "Unknown zone" });
      }
      const profile = (pairing.provisionalProfile ?? {}) as Record<string, unknown>;
      const platform = normalizePlatform(profile.platform);
      const device = await this.fleet.insertDevice(tx, {
        tenantId: ctx.tenantId,
        zoneId: input.zoneId,
        name: input.friendlyName ?? `${zone.unitName} player`,
        platform,
        hardwareModel: (profile.hardwareModel as string | null) ?? null,
        status: "pending",
        profile: (profile.capabilities as Record<string, unknown>) ?? {},
      });
      await this.fleet.updatePairingInTx(tx, code, {
        status: "claimed",
        tenantId: ctx.tenantId,
        deviceId: device.id,
        zoneId: input.zoneId,
        claimedBy: ctx.userId,
        claimedAt: new Date(),
      });
      await this.audit.recordInTx(tx, {
        action: "fleet.device.claimed",
        resourceType: "device",
        resourceId: device.id,
        after: { zoneId: input.zoneId, code },
      });
      return toDeviceSummary({
        ...device,
        unitId: zone.unitId,
        unitName: zone.unitName,
        lastSeenAt: null,
      });
    });
  }

  /* ---------------------------------------------------- device: complete -- */

  async complete(input: PlayerActivationCompleteRequest): Promise<PlayerCredentialResponse> {
    const pairing = await this.fleet.findPairingByCode(input.code);
    const now = new Date();
    if (!pairing) {
      throw new NotFoundException({ code: "ACTIVATION_NOT_FOUND", title: "Unknown code" });
    }
    const status = this.effectiveStatus(pairing, now);
    if (status === "completed") {
      // Single-use: a completed code never yields a second credential (replay).
      throw new ConflictException({ code: "ACTIVATION_ALREADY_USED", title: "Code already used" });
    }
    if (status === "expired" || status === "revoked") {
      throw new ForbiddenException({
        code: "ACTIVATION_EXPIRED",
        title: "Code is no longer valid",
      });
    }
    if (status !== "claimed" || !pairing.tenantId || !pairing.deviceId || !pairing.zoneId) {
      throw new ForbiddenException({
        code: "ACTIVATION_NOT_CLAIMED",
        title: "Code has not been claimed by an operator",
      });
    }
    if (
      !pairing.activationSecretHash ||
      !hashesEqual(sha256Hex(input.activationSecret), pairing.activationSecretHash)
    ) {
      throw new ForbiddenException({
        code: "ACTIVATION_SECRET_MISMATCH",
        title: "Activation secret does not match",
      });
    }

    const tenantId = pairing.tenantId;
    const deviceId = pairing.deviceId;
    const token = mintDeviceToken();
    const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

    return this.fleet.withTenant(tenantId, async (tx) => {
      const scope = await this.fleet.loadDeviceScope(tx, deviceId);
      if (!scope) {
        throw new NotFoundException({ code: "DEVICE_NOT_FOUND", title: "Device not found" });
      }
      await this.fleet.insertDeviceToken(tx, {
        tenantId,
        deviceId,
        tokenHash: sha256Hex(token),
        expiresAt: tokenExpiresAt,
      });
      await this.fleet.setDeviceStatus(tx, deviceId, { status: "active", pairedAt: now });
      await this.fleet.updatePairingInTx(tx, input.code, { status: "completed", completedAt: now });
      await this.fleet.recordDeviceAudit(tx, {
        tenantId,
        deviceId,
        action: "fleet.device.activation_completed",
        resourceId: deviceId,
      });
      const device = await this.fleet.findDeviceInTenant(tx, deviceId);
      return {
        contractVersion: PLAYER_CONTRACT_VERSION,
        deviceId,
        token,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        tenantId,
        unitId: scope.unitId,
        zoneId: scope.zoneId,
        unitName: scope.unitName,
        friendlyName: device?.name ?? null,
        timezone: scope.timezone,
      } satisfies PlayerCredentialResponse;
    });
  }

  /* --------------------------------------------- device: refresh / revoke -- */

  async refresh(device: DeviceContext): Promise<PlayerCredentialResponse> {
    const now = new Date();
    const token = mintDeviceToken();
    const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
    return this.fleet.withTenant(device.tenantId, async (tx) => {
      // Rotate: retire every live token, then issue a fresh one.
      await this.fleet.revokeDeviceTokens(tx, device.deviceId, now);
      await this.fleet.insertDeviceToken(tx, {
        tenantId: device.tenantId,
        deviceId: device.deviceId,
        tokenHash: sha256Hex(token),
        expiresAt: tokenExpiresAt,
      });
      const record = await this.fleet.findDeviceInTenant(tx, device.deviceId);
      return {
        contractVersion: PLAYER_CONTRACT_VERSION,
        deviceId: device.deviceId,
        token,
        tokenExpiresAt: tokenExpiresAt.toISOString(),
        tenantId: device.tenantId,
        unitId: device.unitId,
        zoneId: device.zoneId,
        unitName: device.unitName,
        friendlyName: record?.name ?? null,
        timezone: device.timezone,
      } satisfies PlayerCredentialResponse;
    });
  }

  async deactivate(device: DeviceContext): Promise<void> {
    const now = new Date();
    await this.fleet.withTenant(device.tenantId, async (tx) => {
      await this.fleet.revokeDeviceTokens(tx, device.deviceId, now);
      await this.fleet.setDeviceStatus(tx, device.deviceId, {
        status: "decommissioned",
        decommissionedAt: now,
      });
      await this.fleet.recordDeviceAudit(tx, {
        tenantId: device.tenantId,
        deviceId: device.deviceId,
        action: "fleet.device.deactivated",
        resourceId: device.deviceId,
      });
    });
  }

  /* --------------------------------------------------------------- utils -- */

  private effectiveStatus(row: PairingCodeRow, now: Date): PairingCodeRow["status"] {
    if (row.status === "pending" && row.expiresAt.getTime() <= now.getTime()) return "expired";
    return row.status;
  }
}

/** Coerce a provisional profile's platform to a valid Fleet platform enum. */
const normalizePlatform = (value: unknown): "android" | "windows" | "web" => {
  return value === "windows" || value === "web" ? value : "android";
};
