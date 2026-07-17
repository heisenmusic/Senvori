/**
 * Local-events resolver — pure, deterministic (Sprint 08 · §9/§10/§18).
 *
 * Given the local events already loaded + tenant-scoped by the caller and the
 * unit's local date/time context, it selects which events are in effect and maps
 * them to ordered effective-plan overlays. Like the schedule resolver it is a
 * pure function: no DB, no clock, no random, no locale, no ambient timezone —
 * the same context always yields the same overlays (and hence the same
 * `effectivePlanHash`). No audio is produced here; overlays are *descriptions*
 * the Player (Not implemented) would later render.
 */

import type { EffectiveOverlay, ScheduleWarning } from "./resolver";
import { localWeekday } from "./resolver";

export type LocalEventTargetType = "tenant" | "group" | "sync_group" | "unit";
export type LocalEventKind = "insert" | "overlay" | "interrupt";
export type LocalEventCategory = "local_event" | "campaign_slot" | "emergency";

/** A local event as the resolver sees it (loaded + tenant-scoped by the caller). */
export interface ResolverLocalEvent {
  id: string;
  assetId: string | null;
  targetType: LocalEventTargetType;
  targetId: string;
  kind: LocalEventKind;
  category: LocalEventCategory;
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
}

export interface LocalEventContext {
  tenantId: string;
  unitId: string;
  syncGroupId: string | null;
  groupIds: string[];
  localDate: string;
  localTime: string;
}

export interface LocalEventSelection {
  overlays: EffectiveOverlay[];
  warnings: ScheduleWarning[];
  /** True when an emergency event is in effect — callers may override resolution. */
  emergencyActive: boolean;
}

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

const targetMatches = (e: ResolverLocalEvent, ctx: LocalEventContext): boolean => {
  switch (e.targetType) {
    case "unit":
      return e.targetId === ctx.unitId;
    case "group":
      return ctx.groupIds.includes(e.targetId);
    case "sync_group":
      return ctx.syncGroupId !== null && e.targetId === ctx.syncGroupId;
    case "tenant":
      return e.targetId === ctx.tenantId;
  }
};

const isInEffect = (
  e: ResolverLocalEvent,
  ctx: LocalEventContext,
  warnings: ScheduleWarning[],
): boolean => {
  if (!e.active) return false;
  if (e.validFrom !== null && ctx.localDate < e.validFrom) return false;
  if (e.validUntil !== null && ctx.localDate > e.validUntil) return false;
  if (e.daysOfWeek.length > 0 && !e.daysOfWeek.includes(localWeekday(ctx.localDate))) return false;

  const start = toMinutes(e.startTimeLocal);
  const end = toMinutes(e.endTimeLocal);
  const now = toMinutes(ctx.localTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(now)) return false;
  if (start >= end) {
    warnings.push({
      code: "invalid_event_window",
      message: "Local event time window is empty or crosses midnight; ignored.",
      detail: { eventId: e.id, start: e.startTimeLocal, end: e.endTimeLocal },
    });
    return false;
  }
  return now >= start && now < end;
};

/**
 * Deterministic order for events sharing a start offset: higher priority first,
 * then a stable id tiebreak. Emergencies never sort *below* other categories
 * because they are pre-boosted in `categoryRank`.
 */
const categoryRank = (c: LocalEventCategory): number =>
  c === "emergency" ? 2 : c === "campaign_slot" ? 1 : 0;

/**
 * Select the in-effect local events and map them to ordered effective-plan
 * overlays. Higher-precedence `interrupt` events mask lower ones they overlap
 * (an emergency interrupt masks a campaign insert at the same time); overlaps
 * that are masked are dropped, keeping the overlay set conflict-free and
 * deterministic. Pure.
 */
export const selectLocalEventOverlays = (
  events: ResolverLocalEvent[],
  ctx: LocalEventContext,
): LocalEventSelection => {
  const warnings: ScheduleWarning[] = [];
  const active = events.filter((e) => targetMatches(e, ctx) && isInEffect(e, ctx, warnings));

  // Precedence order: emergency > campaign > editorial, then priority, then id.
  // Sorting first lets higher-precedence interrupts claim their span before
  // lower-precedence overlays are considered.
  const ordered = [...active].sort((x, y) => {
    const cr = categoryRank(y.category) - categoryRank(x.category);
    if (cr !== 0) return cr;
    if (x.priority !== y.priority) return y.priority - x.priority;
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
  });

  const overlays: EffectiveOverlay[] = [];
  const interrupts: Array<{ start: number; end: number }> = [];
  for (const e of ordered) {
    const start = e.startOffsetMs;
    const end = e.startOffsetMs + e.durationMs;
    const masked = interrupts.some((i) => start < i.end && i.start < end);
    if (masked) {
      warnings.push({
        code: "local_event_masked",
        message: "Local event is masked by a higher-precedence interrupt; dropped.",
        detail: { eventId: e.id, category: e.category },
      });
      continue;
    }
    const overlay: EffectiveOverlay = {
      kind: e.kind,
      assetId: e.assetId,
      startOffsetMs: e.startOffsetMs,
      durationMs: e.durationMs,
      ...(e.duckingDb !== null ? { duckingDb: e.duckingDb } : {}),
      sourceReference: `local_event:${e.id}`,
      reasonCode:
        e.category === "emergency"
          ? "emergency_override"
          : e.category === "campaign_slot"
            ? "campaign_slot_inserted"
            : "local_event_applied",
    };
    overlays.push(overlay);
    if (e.kind === "interrupt") interrupts.push({ start, end });
  }

  // Present overlays in timeline order (matches assembleEffectivePlan's own sort,
  // so the hash is order-independent of how events happened to be loaded).
  overlays.sort(
    (a, b) =>
      a.startOffsetMs - b.startOffsetMs ||
      a.kind.localeCompare(b.kind) ||
      (a.sourceReference < b.sourceReference ? -1 : a.sourceReference > b.sourceReference ? 1 : 0),
  );

  const emergencyActive = ordered.some((e) => e.category === "emergency");
  return { overlays, warnings, emergencyActive };
};
