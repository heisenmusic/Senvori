import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PLAYER_CONTRACT_VERSION,
  type PlayerAssetDescriptor,
  type PlayerExecutionPlanResponse,
  type PlayerPlanItem,
  type PlayerPlanOverlay,
} from "@senvori/contracts";
import { STORAGE, type StorageProvider } from "../catalog/storage/storage.provider";
import {
  assembleEffectivePlan,
  type ResolverAssignment,
  resolveSchedule,
} from "../scheduling/resolver/resolver";
import {
  type LocalEventContext,
  type ResolverLocalEvent,
  selectLocalEventOverlays,
} from "../scheduling/resolver/local-events";
import { SchedulingRepository } from "../scheduling/scheduling.repository";
import { DeviceContext } from "./device-context";
import { FleetRepository } from "./fleet.repository";
import { localDayWindowUtc, nowInZone } from "./player-time";

/** Signed asset URLs live at least this long so a device can drain the plan. */
const PLAN_TTL_SECONDS = 900;

/**
 * Serves the effective execution plan to an authenticated device (Sprint 10A ·
 * §4.4). Reuses the pure Scheduling resolver (which program plays for the unit,
 * now) + the published version's resolved order, and enriches each referenced
 * asset with a signed, expiring download descriptor. The device supplies no
 * scope — the unit/timezone come from its credential.
 *
 * Honesty note: this returns the PUBLISHED resolved order plus overlays and
 * emergency state; it does not re-run the full deterministic compiler (fatigue/
 * affinity/history) at request time — that stays the publish-time responsibility.
 */
@Injectable()
export class ExecutionPlanService {
  private readonly downloadTtl: number;

  constructor(
    private readonly fleet: FleetRepository,
    private readonly scheduling: SchedulingRepository,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    this.downloadTtl = Math.max(
      PLAN_TTL_SECONDS,
      config.get<number>("CATALOG_DOWNLOAD_TTL_SECONDS") ?? PLAN_TTL_SECONDS,
    );
  }

  async build(device: DeviceContext): Promise<PlayerExecutionPlanResponse> {
    const now = new Date();
    const { localDate, localTime } = nowInZone(device.timezone, now);
    const { startUtc, endUtc } = localDayWindowUtc(localDate, device.timezone);

    const assembled = await this.fleet.withTenant(device.tenantId, async (tx) => {
      const groupIds = await this.fleet.loadUnitGroupIds(tx, device.unitId);
      const assignmentRows = await this.scheduling.loadActiveAssignments(tx, device.tenantId);
      const assignments: ResolverAssignment[] = assignmentRows.map((r) => ({
        id: r.id,
        programId: r.programId,
        programVersionId: r.programVersionId,
        targetType: r.targetType,
        targetId: r.targetId,
        priority: r.priority,
        daysOfWeek: r.daysOfWeek,
        startTimeLocal: r.startTimeLocal,
        endTimeLocal: r.endTimeLocal,
        validFrom: r.validFrom,
        validUntil: r.validUntil,
        active: r.active,
      }));

      const resolution = resolveSchedule({
        tenantId: device.tenantId,
        unitId: device.unitId,
        syncGroupId: null,
        groupIds,
        timezone: device.timezone,
        localDate,
        localTime,
        assignments,
      });

      // Resolve the published version + its ordered asset ids.
      let versionId: string | null = resolution.selectedProgramVersionId;
      let resolvedItems: string[] = [];
      let basePlanHash: string | null = null;
      if (versionId) {
        const v = await this.fleet.versionPlan(tx, versionId);
        resolvedItems = v?.resolvedItems ?? [];
        basePlanHash = v?.planHash ?? null;
      } else if (resolution.selectedProgramId) {
        const v = await this.fleet.currentVersion(tx, resolution.selectedProgramId);
        if (v) {
          versionId = v.id;
          resolvedItems = v.resolvedItems;
          basePlanHash = v.planHash;
        }
      }

      // Overlays (editorial / campaign / emergency) for this unit + local time.
      const eventRows = await this.scheduling.loadActiveLocalEvents(tx, device.tenantId);
      const selection = selectLocalEventOverlays(eventRows.map(toResolverEvent), {
        tenantId: device.tenantId,
        unitId: device.unitId,
        syncGroupId: null,
        groupIds,
        localDate,
        localTime,
      } satisfies LocalEventContext);

      const effective = assembleEffectivePlan({
        unitId: device.unitId,
        localDate,
        timezone: device.timezone,
        resolution,
        basePlanHash,
        overlays: selection.overlays,
        emergencyActive: selection.emergencyActive,
        overlayWarnings: selection.warnings,
      });

      // Load descriptors for every referenced asset (plan items + overlays).
      const overlayAssetIds = selection.overlays
        .map((o) => o.assetId)
        .filter((x): x is string => Boolean(x));
      const assetIds = [...new Set([...resolvedItems, ...overlayAssetIds])];
      const playable = await this.fleet.loadPlayableAssets(tx, assetIds);

      return { resolution, effective, resolvedItems, playable, versionId };
    });

    const { effective, resolution, resolvedItems, playable, versionId } = assembled;
    const byId = new Map(playable.map((p) => [p.assetId, p]));

    // Ordered items from the published resolved order.
    const items: PlayerPlanItem[] = resolvedItems.map((assetId, i) => {
      const p = byId.get(assetId);
      return {
        position: i,
        assetId,
        title: p?.title ?? "",
        artist: p?.artist ?? null,
        startOffsetMs: 0,
        durationMs: p?.durationMs ?? 0,
        source: "program",
        reason: resolution.reasonCode,
      };
    });

    const overlays: PlayerPlanOverlay[] = effective.overlays.map((o) => ({
      kind: o.kind,
      assetId: o.assetId,
      startOffsetMs: o.startOffsetMs,
      durationMs: o.durationMs,
      ...(o.duckingDb !== undefined ? { duckingDb: o.duckingDb } : {}),
      sourceReference: o.sourceReference,
      reasonCode: o.reasonCode,
    }));

    // Signed, expiring download descriptors.
    const assets: PlayerAssetDescriptor[] = await Promise.all(
      playable.map(async (p): Promise<PlayerAssetDescriptor> => {
        const target = await this.storage.createDownloadTarget(p.storageKey, {
          expiresInSeconds: this.downloadTtl,
          contentType: p.contentType ?? undefined,
        });
        return {
          assetId: p.assetId,
          url: target.url,
          checksumSha256: p.checksumSha256,
          sizeBytes: p.sizeBytes,
          contentType: p.contentType,
          durationMs: p.durationMs,
          title: p.title,
          artist: p.artist,
        };
      }),
    );

    return {
      contractVersion: PLAYER_CONTRACT_VERSION,
      unitId: device.unitId,
      timezone: device.timezone,
      localDate: effective.localDate,
      windowStartUtc: startUtc.toISOString(),
      windowEndUtc: endUtc.toISOString(),
      compilerVersion: versionId ? "published" : null,
      basePlanHash: effective.basePlanHash,
      effectivePlanHash: effective.effectivePlanHash,
      emergencyActive: effective.emergencyActive,
      fallbackActive: resolution.reasonCode === "fallback_program_selected",
      reasonCode: resolution.reasonCode,
      items,
      overlays,
      assets,
      generatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.downloadTtl * 1000).toISOString(),
    };
  }
}

/** Map a persisted local-event row to the pure resolver's view (mirrors Scheduling). */
const toResolverEvent = (row: {
  id: string;
  assetId: string | null;
  targetType: string;
  targetId: string;
  kind: string;
  category: string;
  priority: number;
  daysOfWeek: number[];
  startTimeLocal: string;
  endTimeLocal: string;
  startOffsetMs: number;
  durationMs: number;
  duckingDb: number | null;
  validFrom: string | null;
  validUntil: string | null;
  active: boolean;
}): ResolverLocalEvent => ({
  id: row.id,
  assetId: row.assetId,
  targetType: row.targetType as ResolverLocalEvent["targetType"],
  targetId: row.targetId,
  kind: row.kind as ResolverLocalEvent["kind"],
  category: row.category as ResolverLocalEvent["category"],
  priority: row.priority,
  daysOfWeek: row.daysOfWeek,
  startTimeLocal: row.startTimeLocal,
  endTimeLocal: row.endTimeLocal,
  startOffsetMs: row.startOffsetMs,
  durationMs: row.durationMs,
  duckingDb: row.duckingDb,
  validFrom: row.validFrom,
  validUntil: row.validUntil,
  active: row.active,
});
