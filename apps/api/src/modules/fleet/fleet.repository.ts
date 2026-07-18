import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext, type TenantTx } from "../../database/tenant-context";
import {
  assets,
  auditLogEntries,
  deviceMetricEvents,
  deviceTokens,
  devices,
  groupMemberships,
  heartbeatStatuses,
  ingestionBatches,
  pairingCodes,
  playbackEvents,
  playerErrorEvents,
  playlistVersions,
  renditions,
  tracks,
  units,
  uploads,
  zones,
} from "../../database/schema";

export type PairingCodeRow = typeof pairingCodes.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;

/** Result of authenticating a device credential (pre tenant-context). */
export interface DeviceTokenAuth {
  tokenId: string;
  deviceId: string;
  tenantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** A device joined to its zone + unit (resolved inside tenant context). */
export interface DeviceScopeRow {
  deviceId: string;
  status: string;
  zoneId: string;
  unitId: string;
  unitName: string;
  timezone: string;
  installedVersion: string | null;
}

/**
 * Fleet data access for the Player integration (Sprint 10A). Every method takes
 * an explicit tenant-scoped `tx` (RLS) EXCEPT the pre-auth token lookup and the
 * pairing-code table, which is intentionally non-RLS (accessed only by the
 * activation exchange endpoints — mirrors the pre-existing design of this table).
 */
@Injectable()
export class FleetRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Runs a unit of work inside a device/tenant RLS context. */
  withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenantContext(this.db, tenantId, fn);
  }

  /* --------------------------------------------------- device auth (§4.2) -- */

  /**
   * Verifies a device token by its sha256 hash BEFORE any tenant context exists.
   * Uses the `app.device_token_hash` GUC + the `device_tokens_self_auth` RLS
   * policy so only the row whose hash the caller already holds is visible. Runs
   * in its own transaction so the GUC stays transaction-local.
   */
  async authenticateToken(tokenHash: string): Promise<DeviceTokenAuth | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.device_token_hash', ${tokenHash}, true)`);
      const [row] = await tx
        .select({
          tokenId: deviceTokens.id,
          deviceId: deviceTokens.deviceId,
          tenantId: deviceTokens.tenantId,
          expiresAt: deviceTokens.expiresAt,
          revokedAt: deviceTokens.revokedAt,
        })
        .from(deviceTokens)
        .where(eq(deviceTokens.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    });
  }

  async loadDeviceScope(tx: TenantTx, deviceId: string): Promise<DeviceScopeRow | null> {
    const [row] = await tx
      .select({
        deviceId: devices.id,
        status: devices.status,
        zoneId: devices.zoneId,
        unitId: zones.unitId,
        unitName: units.name,
        timezone: units.timezone,
        installedVersion: devices.installedVersion,
      })
      .from(devices)
      .innerJoin(zones, eq(devices.zoneId, zones.id))
      .innerJoin(units, eq(zones.unitId, units.id))
      .where(eq(devices.id, deviceId))
      .limit(1);
    return row ?? null;
  }

  async touchToken(tx: TenantTx, tokenId: string, when: Date): Promise<void> {
    await tx.update(deviceTokens).set({ lastUsedAt: when }).where(eq(deviceTokens.id, tokenId));
  }

  /* ------------------------------------------------ activation (§4.1) ------ */

  /** Non-RLS: activation start writes a fresh pairing code (no tenant yet). */
  async insertPairingCode(values: typeof pairingCodes.$inferInsert): Promise<PairingCodeRow> {
    const [row] = await this.db.insert(pairingCodes).values(values).returning();
    return row as PairingCodeRow;
  }

  /** Non-RLS lookup by code (activation exchange path only). */
  async findPairingByCode(code: string): Promise<PairingCodeRow | null> {
    const [row] = await this.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.code, code))
      .limit(1);
    return row ?? null;
  }

  /** Non-RLS status transition on a pairing code (single-writer exchange path). */
  async updatePairing(
    code: string,
    patch: Partial<typeof pairingCodes.$inferInsert>,
  ): Promise<PairingCodeRow | null> {
    const [row] = await this.db
      .update(pairingCodes)
      .set(patch)
      .where(eq(pairingCodes.code, code))
      .returning();
    return row ?? null;
  }

  /** Status transition on a pairing code inside an existing transaction. */
  async updatePairingInTx(
    tx: TenantTx,
    code: string,
    patch: Partial<typeof pairingCodes.$inferInsert>,
  ): Promise<PairingCodeRow | null> {
    const [row] = await tx
      .update(pairingCodes)
      .set(patch)
      .where(eq(pairingCodes.code, code))
      .returning();
    return row ?? null;
  }

  /** Zone lookup for claim validation (tenant scoped). */
  async findZone(
    tx: TenantTx,
    zoneId: string,
  ): Promise<{ id: string; unitId: string; unitName: string } | null> {
    const [row] = await tx
      .select({ id: zones.id, unitId: zones.unitId, unitName: units.name })
      .from(zones)
      .innerJoin(units, eq(zones.unitId, units.id))
      .where(eq(zones.id, zoneId))
      .limit(1);
    return row ?? null;
  }

  async insertDevice(tx: TenantTx, values: typeof devices.$inferInsert): Promise<DeviceRow> {
    const [row] = await tx.insert(devices).values(values).returning();
    return row as DeviceRow;
  }

  async insertDeviceToken(tx: TenantTx, values: typeof deviceTokens.$inferInsert): Promise<void> {
    await tx.insert(deviceTokens).values(values);
  }

  /** Revoke every live token for a device (rotation / deactivation). */
  async revokeDeviceTokens(tx: TenantTx, deviceId: string, when: Date): Promise<void> {
    await tx
      .update(deviceTokens)
      .set({ revokedAt: when })
      .where(and(eq(deviceTokens.deviceId, deviceId), isNull(deviceTokens.revokedAt)));
  }

  async setDeviceStatus(
    tx: TenantTx,
    deviceId: string,
    patch: Partial<typeof devices.$inferInsert>,
  ): Promise<void> {
    await tx.update(devices).set(patch).where(eq(devices.id, deviceId));
  }

  /* ------------------------------------------------ heartbeat (§4.8) ------ */

  async upsertHeartbeat(
    tx: TenantTx,
    values: typeof heartbeatStatuses.$inferInsert,
  ): Promise<void> {
    await tx
      .insert(heartbeatStatuses)
      .values(values)
      .onConflictDoUpdate({ target: heartbeatStatuses.deviceId, set: values });
  }

  async insertMetricEvent(
    tx: TenantTx,
    values: typeof deviceMetricEvents.$inferInsert,
  ): Promise<void> {
    await tx.insert(deviceMetricEvents).values(values).onConflictDoNothing();
  }

  /* ---------------------------------------------- execution plan (§4.4) --- */

  /** Group ids the unit belongs to (for group-scoped schedule assignments). */
  async loadUnitGroupIds(tx: TenantTx, unitId: string): Promise<string[]> {
    const rows = await tx
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(eq(groupMemberships.unitId, unitId));
    return rows.map((r) => r.groupId);
  }

  async unitTimezone(tx: TenantTx, unitId: string): Promise<string | null> {
    const [row] = await tx
      .select({ timezone: units.timezone })
      .from(units)
      .where(eq(units.id, unitId))
      .limit(1);
    return row?.timezone ?? null;
  }

  /** Ordered resolved asset ids + plan hash for a published version. */
  async versionPlan(
    tx: TenantTx,
    versionId: string,
  ): Promise<{ resolvedItems: string[]; planHash: string | null } | null> {
    const [row] = await tx
      .select({
        resolvedItems: playlistVersions.resolvedItems,
        planHash: playlistVersions.planHash,
      })
      .from(playlistVersions)
      .where(eq(playlistVersions.id, versionId))
      .limit(1);
    if (!row) return null;
    return { resolvedItems: (row.resolvedItems as string[]) ?? [], planHash: row.planHash };
  }

  /** Latest published version for a program (highest version number). */
  async currentVersion(
    tx: TenantTx,
    programId: string,
  ): Promise<{ id: string; resolvedItems: string[]; planHash: string | null } | null> {
    const [row] = await tx
      .select({
        id: playlistVersions.id,
        resolvedItems: playlistVersions.resolvedItems,
        planHash: playlistVersions.planHash,
      })
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, programId))
      .orderBy(desc(playlistVersions.version))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      resolvedItems: (row.resolvedItems as string[]) ?? [],
      planHash: row.planHash,
    };
  }

  /**
   * Playable descriptors for a set of asset ids: title/artist/duration plus the
   * "original" rendition object (storage key, size, hash) and source content
   * type. Only READY assets with an object are returned.
   */
  async loadPlayableAssets(
    tx: TenantTx,
    assetIds: string[],
  ): Promise<
    Array<{
      assetId: string;
      title: string;
      artist: string | null;
      durationMs: number | null;
      storageKey: string;
      sizeBytes: number | null;
      checksumSha256: string | null;
      contentType: string | null;
    }>
  > {
    if (assetIds.length === 0) return [];
    const rows = await tx
      .select({
        assetId: assets.id,
        title: assets.title,
        durationMs: assets.durationMs,
        status: assets.status,
        artist: tracks.artist,
        storageKey: renditions.storageKey,
        sizeBytes: renditions.bytes,
        checksumSha256: renditions.hash,
        contentType: uploads.contentType,
      })
      .from(assets)
      .innerJoin(
        renditions,
        and(eq(renditions.assetId, assets.id), eq(renditions.profile, "original")),
      )
      .leftJoin(tracks, eq(tracks.assetId, assets.id))
      .leftJoin(uploads, eq(uploads.assetId, assets.id))
      .where(and(inArray(assets.id, assetIds), eq(assets.status, "ready")));
    return rows.map((r) => ({
      assetId: r.assetId,
      title: r.title,
      artist: r.artist ?? null,
      durationMs: r.durationMs,
      storageKey: r.storageKey,
      sizeBytes: r.sizeBytes,
      checksumSha256: r.checksumSha256,
      contentType: r.contentType,
    }));
  }

  /* ------------------------------------------------ telemetry (§4.9) ------ */

  /** Idempotent insert; returns the ids that were newly stored. */
  async insertPlaybackEvents(
    tx: TenantTx,
    rows: Array<typeof playbackEvents.$inferInsert>,
  ): Promise<string[]> {
    if (rows.length === 0) return [];
    const inserted = await tx
      .insert(playbackEvents)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: playbackEvents.id });
    return inserted.map((r) => r.id);
  }

  async insertErrorEvents(
    tx: TenantTx,
    rows: Array<typeof playerErrorEvents.$inferInsert>,
  ): Promise<string[]> {
    if (rows.length === 0) return [];
    const inserted = await tx
      .insert(playerErrorEvents)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: playerErrorEvents.id });
    return inserted.map((r) => r.id);
  }

  async insertIngestionBatch(
    tx: TenantTx,
    values: typeof ingestionBatches.$inferInsert,
  ): Promise<void> {
    await tx.insert(ingestionBatches).values(values);
  }

  /* ---------------------------------------------------- audit (device) --- */

  /** Device-actor audit entry (no human ALS context on device requests). */
  async recordDeviceAudit(
    tx: TenantTx,
    entry: {
      tenantId: string;
      deviceId: string;
      action: string;
      resourceId: string;
      after?: unknown;
    },
  ): Promise<void> {
    await tx.insert(auditLogEntries).values({
      tenantId: entry.tenantId,
      actorType: "device",
      actorId: entry.deviceId,
      action: entry.action,
      resourceType: "device",
      resourceId: entry.resourceId,
      changes: { after: entry.after ?? null },
    });
  }

  /* --------------------------------------------------- admin queries ------ */

  async listDevices(
    tx: TenantTx,
    tenantId: string,
    limit: number,
  ): Promise<
    Array<DeviceRow & { unitId: string | null; unitName: string | null; lastSeenAt: Date | null }>
  > {
    return tx
      .select({
        ...deviceColumns(),
        unitId: zones.unitId,
        unitName: units.name,
        lastSeenAt: heartbeatStatuses.lastSeenAt,
      })
      .from(devices)
      .leftJoin(zones, eq(devices.zoneId, zones.id))
      .leftJoin(units, eq(zones.unitId, units.id))
      .leftJoin(heartbeatStatuses, eq(heartbeatStatuses.deviceId, devices.id))
      .where(eq(devices.tenantId, tenantId))
      .orderBy(desc(devices.createdAt))
      .limit(limit) as never;
  }

  async findDeviceDetail(tx: TenantTx, deviceId: string) {
    const [row] = await tx
      .select({
        device: deviceColumns(),
        unitId: zones.unitId,
        unitName: units.name,
        heartbeat: {
          lastSeenAt: heartbeatStatuses.lastSeenAt,
          runtimeState: heartbeatStatuses.runtimeState,
          connectivity: heartbeatStatuses.connectivity,
          effectivePlanHash: heartbeatStatuses.effectivePlanHash,
          currentItemId: heartbeatStatuses.currentItemId,
          storage: heartbeatStatuses.storage,
          lastError: heartbeatStatuses.lastError,
          lastSyncAt: heartbeatStatuses.lastSyncAt,
          contractVersion: heartbeatStatuses.contractVersion,
        },
      })
      .from(devices)
      .leftJoin(zones, eq(devices.zoneId, zones.id))
      .leftJoin(units, eq(zones.unitId, units.id))
      .leftJoin(heartbeatStatuses, eq(heartbeatStatuses.deviceId, devices.id))
      .where(eq(devices.id, deviceId))
      .limit(1);
    return row ?? null;
  }

  async deviceHasActiveToken(tx: TenantTx, deviceId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(and(eq(deviceTokens.deviceId, deviceId), isNull(deviceTokens.revokedAt)))
      .limit(1);
    return Boolean(row);
  }

  async findDeviceInTenant(tx: TenantTx, deviceId: string): Promise<DeviceRow | null> {
    const [row] = await tx.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
    return row ?? null;
  }

  async findActivationByCode(tx: TenantTx, code: string): Promise<PairingCodeRow | null> {
    // Admin path: pairing_codes is non-RLS; the operator only sees codes they typed.
    const [row] = await tx.select().from(pairingCodes).where(eq(pairingCodes.code, code)).limit(1);
    return row ?? null;
  }

  async listPlaybackEventsForDevice(tx: TenantTx, deviceId: string, limit: number) {
    return tx
      .select({
        id: playbackEvents.id,
        deviceId: playbackEvents.deviceId,
        unitId: playbackEvents.unitId,
        zoneId: playbackEvents.zoneId,
        assetId: playbackEvents.assetId,
        startedAt: playbackEvents.startedAt,
        endedAt: playbackEvents.endedAt,
        completionPct: playbackEvents.completionPct,
        receivedAt: playbackEvents.receivedAt,
      })
      .from(playbackEvents)
      .where(eq(playbackEvents.deviceId, deviceId))
      .orderBy(desc(playbackEvents.occurredAt))
      .limit(limit);
  }

  /** Mark pairing codes expired past their TTL (housekeeping on read). */
  async expireStalePairing(now: Date): Promise<void> {
    await this.db
      .update(pairingCodes)
      .set({ status: "expired" })
      .where(and(eq(pairingCodes.status, "pending"), lt(pairingCodes.expiresAt, now)));
  }
}

/** Shared device column projection (avoids repeating the select map). */
const deviceColumns = () => ({
  id: devices.id,
  tenantId: devices.tenantId,
  zoneId: devices.zoneId,
  name: devices.name,
  platform: devices.platform,
  hardwareModel: devices.hardwareModel,
  status: devices.status,
  installedVersion: devices.installedVersion,
  releaseChannel: devices.releaseChannel,
  profile: devices.profile,
  pairedAt: devices.pairedAt,
  decommissionedAt: devices.decommissionedAt,
  createdAt: devices.createdAt,
  updatedAt: devices.updatedAt,
});
