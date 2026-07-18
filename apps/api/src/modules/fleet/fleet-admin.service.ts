import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type PlayerActivationAdmin,
  type PlayerActivationStatus,
  type PlayerDeviceDetail,
  type PlayerDeviceSummary,
  type PlayerPlaybackEventRecord,
} from "@senvori/contracts";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";
import { FleetRepository } from "./fleet.repository";
import { toDeviceDetail, toDeviceSummary } from "./fleet.mappers";

const DEFAULT_LIMIT = 50;

/**
 * Human-facing Fleet administration (Sprint 10A · §7/§8). Runs in the operator's
 * tenant context (RLS), so cross-tenant reads/writes are impossible. Secrets are
 * never exposed — only credential presence.
 */
@Injectable()
export class FleetAdminService {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditLogService,
  ) {}

  async listDevices(ctx: RequestContext): Promise<{ items: PlayerDeviceSummary[] }> {
    const rows = await this.tenantContext.withTenant((tx) =>
      this.fleet.listDevices(tx, ctx.tenantId, DEFAULT_LIMIT),
    );
    return { items: rows.map((r) => toDeviceSummary(r)) };
  }

  async getDevice(deviceId: string): Promise<PlayerDeviceDetail> {
    return this.tenantContext.withTenant(async (tx) => {
      const row = await this.fleet.findDeviceDetail(tx, deviceId);
      if (!row)
        throw new NotFoundException({ code: "DEVICE_NOT_FOUND", title: "Device not found" });
      const hasCredential = await this.fleet.deviceHasActiveToken(tx, deviceId);
      return toDeviceDetail(row, hasCredential);
    });
  }

  async revokeDevice(ctx: RequestContext, deviceId: string): Promise<PlayerDeviceDetail> {
    const now = new Date();
    return this.tenantContext.withTenant(async (tx) => {
      const existing = await this.fleet.findDeviceInTenant(tx, deviceId);
      if (!existing) {
        throw new NotFoundException({ code: "DEVICE_NOT_FOUND", title: "Device not found" });
      }
      await this.fleet.revokeDeviceTokens(tx, deviceId, now);
      await this.fleet.setDeviceStatus(tx, deviceId, {
        status: "decommissioned",
        decommissionedAt: now,
      });
      await this.audit.recordInTx(tx, {
        action: "fleet.device.revoked",
        resourceType: "device",
        resourceId: deviceId,
        before: { status: existing.status },
        after: { status: "decommissioned" },
      });
      const row = await this.fleet.findDeviceDetail(tx, deviceId);
      return toDeviceDetail(row!, false);
    });
  }

  async getActivation(code: string): Promise<PlayerActivationAdmin> {
    return this.tenantContext.withTenant(async (tx) => {
      const row = await this.fleet.findActivationByCode(tx, code);
      if (!row) {
        throw new NotFoundException({ code: "ACTIVATION_NOT_FOUND", title: "Unknown code" });
      }
      const profile = (row.provisionalProfile ?? {}) as Record<string, unknown>;
      const status: PlayerActivationStatus =
        row.status === "pending" && row.expiresAt.getTime() <= Date.now() ? "expired" : row.status;
      return {
        code: row.code,
        status,
        platform: normalizePlatform(profile.platform),
        deviceId: row.deviceId,
        zoneId: row.zoneId,
        expiresAt: row.expiresAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async listPlaybackEvents(deviceId: string): Promise<{ items: PlayerPlaybackEventRecord[] }> {
    const rows = await this.tenantContext.withTenant((tx) =>
      this.fleet.listPlaybackEventsForDevice(tx, deviceId, DEFAULT_LIMIT),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        deviceId: r.deviceId,
        unitId: r.unitId,
        zoneId: r.zoneId,
        assetId: r.assetId,
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        completionPct: r.completionPct,
        receivedAt: r.receivedAt.toISOString(),
      })),
    };
  }
}

const normalizePlatform = (v: unknown): PlayerActivationAdmin["platform"] =>
  v === "windows" || v === "web" ? v : v === "android" ? "android" : null;
