import { Injectable } from "@nestjs/common";
import {
  type PlayerHeartbeatRequest,
  type PlayerHeartbeatResponse,
  type PlayerPlaybackEvent,
  type PlayerRuntimeErrorEvent,
  type PlayerTelemetryBatchRequest,
  type PlayerTelemetryBatchResponse,
} from "@senvori/contracts";
import { DeviceContext } from "./device-context";
import { FleetRepository } from "./fleet.repository";

const NEXT_HEARTBEAT_SECONDS = 60;

/**
 * Player runtime ingestion (Sprint 10A · §4.8/§4.9). Heartbeat updates the hot
 * projection + history; telemetry ingests operational playback/error events
 * idempotently (dedup by device-generated id). Tenant/unit/zone scope comes from
 * the authenticated DeviceContext — never from the payload.
 */
@Injectable()
export class PlayerRuntimeService {
  constructor(private readonly fleet: FleetRepository) {}

  /* ----------------------------------------------------------- heartbeat -- */

  async heartbeat(
    device: DeviceContext,
    input: PlayerHeartbeatRequest,
  ): Promise<PlayerHeartbeatResponse> {
    const now = new Date();
    await this.fleet.withTenant(device.tenantId, async (tx) => {
      await this.fleet.upsertHeartbeat(tx, {
        deviceId: device.deviceId,
        tenantId: device.tenantId,
        lastSeenAt: now,
        appVersion: input.appVersion,
        network: { connectivity: input.connectivity },
        cache: { assetCount: input.assetCount, outboxSize: input.outboxSize },
        playback: {
          runtimeState: input.runtimeState,
          currentItemId: input.currentItemId,
          positionMs: input.positionMs,
          activePlanHash: input.activePlanHash,
        },
        runtimeState: input.runtimeState,
        connectivity: input.connectivity,
        contractVersion: input.contractVersion,
        effectivePlanHash: input.effectivePlanHash,
        currentItemId: input.currentItemId,
        lastError: input.lastError,
        storage: input.storage ? { ...input.storage } : {},
        lastSyncAt: input.lastSyncAt ? new Date(input.lastSyncAt) : null,
        updatedAt: now,
      });
      // Keep the device row's coarse status/version fresh for the Fleet list.
      await this.fleet.setDeviceStatus(tx, device.deviceId, {
        status: "active",
        installedVersion: input.appVersion,
      });
      // Append to bounded history (dedup-safe; id is unique per heartbeat).
      await this.fleet.insertMetricEvent(tx, {
        id: crypto.randomUUID(),
        tenantId: device.tenantId,
        deviceId: device.deviceId,
        occurredAt: now,
        metrics: {
          runtimeState: input.runtimeState,
          connectivity: input.connectivity,
          effectivePlanHash: input.effectivePlanHash,
          assetCount: input.assetCount,
          outboxSize: input.outboxSize,
          storage: input.storage ?? null,
        },
      });
    });
    return {
      serverTime: now.toISOString(),
      // 10A: the device drives plan fetches on its own cadence; the backend does
      // not compute a plan diff on every heartbeat. `planChanged` is reserved.
      effectivePlanHash: input.effectivePlanHash,
      planChanged: false,
      nextHeartbeatSeconds: NEXT_HEARTBEAT_SECONDS,
    };
  }

  /* ----------------------------------------------------------- telemetry -- */

  async ingest(
    device: DeviceContext,
    input: PlayerTelemetryBatchRequest,
  ): Promise<PlayerTelemetryBatchResponse> {
    const now = new Date();
    const accepted: string[] = [];
    const duplicate: string[] = [];
    const rejected: string[] = [];

    // Playback events carrying an asset become proof-of-play rows; asset-less
    // markers (emergency start/stop) are preserved as metric events so nothing
    // is lost. Both dedup on their composite PK by the device-supplied id.
    const withAsset = input.playbackEvents.filter((e) => e.assetId);
    const withoutAsset = input.playbackEvents.filter((e) => !e.assetId);

    await this.fleet.withTenant(device.tenantId, async (tx) => {
      const playbackRows = withAsset.map((e) => this.toPlaybackRow(device, e));
      const insertedPlayback = new Set(await this.fleet.insertPlaybackEvents(tx, playbackRows));
      classify(withAsset, insertedPlayback, accepted, duplicate);

      const markerRows = withoutAsset.map((e) => ({
        id: e.eventId,
        tenantId: device.tenantId,
        deviceId: device.deviceId,
        occurredAt: new Date(e.startedAt),
        metrics: { type: e.type, effectivePlanHash: e.effectivePlanHash, reason: e.reason },
      }));
      for (const row of markerRows) await this.fleet.insertMetricEvent(tx, row);
      // Metric insert is best-effort dedup without RETURNING; treat markers as accepted.
      accepted.push(...withoutAsset.map((e) => e.eventId));

      const errorRows = input.errorEvents.map((e) => this.toErrorRow(device, e));
      const insertedErrors = new Set(await this.fleet.insertErrorEvents(tx, errorRows));
      classify(input.errorEvents, insertedErrors, accepted, duplicate);

      await this.fleet.insertIngestionBatch(tx, {
        tenantId: device.tenantId,
        deviceId: device.deviceId,
        eventCount: input.playbackEvents.length + input.errorEvents.length,
        duplicateCount: duplicate.length,
        window: { batchId: input.batchId, receivedAt: now.toISOString() },
        status: "stored",
      });
    });

    return {
      batchId: input.batchId,
      acceptedIds: accepted,
      duplicateIds: duplicate,
      rejectedIds: rejected,
    };
  }

  private toPlaybackRow(device: DeviceContext, e: PlayerPlaybackEvent) {
    const startedAt = new Date(e.startedAt);
    return {
      id: e.eventId,
      tenantId: device.tenantId,
      deviceId: device.deviceId,
      unitId: device.unitId,
      zoneId: device.zoneId,
      assetId: e.assetId as string,
      context: {
        type: e.type,
        itemId: e.itemId,
        planVersion: e.planVersion,
        effectivePlanHash: e.effectivePlanHash,
        source: e.source,
        reason: e.reason,
        appVersion: e.appVersion,
      },
      startedAt,
      endedAt: e.endedAt ? new Date(e.endedAt) : null,
      occurredAt: startedAt,
      completionPct: e.completionPct,
    };
  }

  private toErrorRow(device: DeviceContext, e: PlayerRuntimeErrorEvent) {
    return {
      id: e.eventId,
      tenantId: device.tenantId,
      deviceId: device.deviceId,
      occurredAt: new Date(e.occurredAt),
      kind: e.kind,
      appVersion: e.appVersion,
      detail: e.detail ?? {},
    };
  }
}

/** Split submitted ids into accepted (newly stored) vs duplicate (already seen). */
const classify = (
  submitted: Array<{ eventId: string }>,
  inserted: Set<string>,
  accepted: string[],
  duplicate: string[],
): void => {
  for (const e of submitted) {
    if (inserted.has(e.eventId)) accepted.push(e.eventId);
    else duplicate.push(e.eventId);
  }
};
