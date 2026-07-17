import { describe, expect, it } from "vitest";
import {
  type LocalEventContext,
  type ResolverLocalEvent,
  selectLocalEventOverlays,
} from "../src/modules/scheduling/resolver/local-events";

/**
 * Pure local-events resolver — determinism, in-effect filtering, precedence and
 * interrupt masking. No DB, no clock; every input is explicit (Sprint 08 · §9).
 */

const ctx = (over: Partial<LocalEventContext> = {}): LocalEventContext => ({
  tenantId: "tenant-1",
  unitId: "unit-1",
  syncGroupId: null,
  groupIds: [],
  localDate: "2026-07-15", // a Wednesday
  localTime: "12:00",
  ...over,
});

const event = (over: Partial<ResolverLocalEvent> = {}): ResolverLocalEvent => ({
  id: "e1",
  assetId: "asset-1",
  targetType: "unit",
  targetId: "unit-1",
  kind: "insert",
  category: "local_event",
  priority: 0,
  daysOfWeek: [],
  startTimeLocal: "00:00",
  endTimeLocal: "23:59",
  startOffsetMs: 0,
  durationMs: 30_000,
  duckingDb: null,
  validFrom: null,
  validUntil: null,
  active: true,
  ...over,
});

describe("selectLocalEventOverlays — filtering", () => {
  it("keeps an in-effect unit event and maps it to an overlay", () => {
    const r = selectLocalEventOverlays([event()], ctx());
    expect(r.overlays).toHaveLength(1);
    expect(r.overlays[0]).toMatchObject({
      kind: "insert",
      assetId: "asset-1",
      sourceReference: "local_event:e1",
      reasonCode: "local_event_applied",
    });
    expect(r.emergencyActive).toBe(false);
  });

  it("drops an event outside its trigger window", () => {
    const r = selectLocalEventOverlays(
      [event({ startTimeLocal: "08:00", endTimeLocal: "09:00" })],
      ctx({ localTime: "12:00" }),
    );
    expect(r.overlays).toHaveLength(0);
  });

  it("drops an inactive event", () => {
    expect(selectLocalEventOverlays([event({ active: false })], ctx()).overlays).toHaveLength(0);
  });

  it("respects days-of-week (Wednesday only)", () => {
    expect(selectLocalEventOverlays([event({ daysOfWeek: [3] })], ctx()).overlays).toHaveLength(1);
    expect(selectLocalEventOverlays([event({ daysOfWeek: [1] })], ctx()).overlays).toHaveLength(0);
  });

  it("respects validity dates (inclusive)", () => {
    expect(
      selectLocalEventOverlays([event({ validFrom: "2026-07-16" })], ctx()).overlays,
    ).toHaveLength(0);
    expect(
      selectLocalEventOverlays([event({ validUntil: "2026-07-14" })], ctx()).overlays,
    ).toHaveLength(0);
    expect(
      selectLocalEventOverlays(
        [event({ validFrom: "2026-07-15", validUntil: "2026-07-15" })],
        ctx(),
      ).overlays,
    ).toHaveLength(1);
  });

  it("only matches the correct target scope", () => {
    expect(
      selectLocalEventOverlays([event({ targetType: "unit", targetId: "other" })], ctx()).overlays,
    ).toHaveLength(0);
    expect(
      selectLocalEventOverlays([event({ targetType: "tenant", targetId: "tenant-1" })], ctx())
        .overlays,
    ).toHaveLength(1);
    expect(
      selectLocalEventOverlays(
        [event({ targetType: "group", targetId: "g1" })],
        ctx({ groupIds: ["g1"] }),
      ).overlays,
    ).toHaveLength(1);
  });

  it("flags an empty/cross-midnight window instead of crashing", () => {
    const r = selectLocalEventOverlays(
      [event({ startTimeLocal: "22:00", endTimeLocal: "02:00" })],
      ctx({ localTime: "23:00" }),
    );
    expect(r.overlays).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === "invalid_event_window")).toBe(true);
  });
});

describe("selectLocalEventOverlays — precedence & masking", () => {
  it("marks an emergency active and stamps the override reason", () => {
    const r = selectLocalEventOverlays(
      [event({ id: "em", category: "emergency", kind: "interrupt", durationMs: 60_000 })],
      ctx(),
    );
    expect(r.emergencyActive).toBe(true);
    expect(r.overlays[0]?.reasonCode).toBe("emergency_override");
  });

  it("an emergency interrupt masks a campaign insert it overlaps", () => {
    const emergency = event({
      id: "em",
      category: "emergency",
      kind: "interrupt",
      startOffsetMs: 0,
      durationMs: 60_000,
    });
    const campaign = event({
      id: "cmp",
      category: "campaign_slot",
      kind: "insert",
      startOffsetMs: 10_000,
      durationMs: 5_000,
    });
    const r = selectLocalEventOverlays([campaign, emergency], ctx());
    expect(r.overlays.map((o) => o.sourceReference)).toEqual(["local_event:em"]);
    expect(r.warnings.some((w) => w.code === "local_event_masked")).toBe(true);
  });

  it("does not mask a non-overlapping event", () => {
    const emergency = event({
      id: "em",
      category: "emergency",
      kind: "interrupt",
      startOffsetMs: 0,
      durationMs: 30_000,
    });
    const later = event({ id: "late", startOffsetMs: 40_000, durationMs: 5_000 });
    const r = selectLocalEventOverlays([later, emergency], ctx());
    expect(r.overlays).toHaveLength(2);
  });

  it("is deterministic regardless of input order", () => {
    const a = event({ id: "a", startOffsetMs: 5_000 });
    const b = event({ id: "b", startOffsetMs: 1_000 });
    const c = event({ id: "c", category: "campaign_slot", startOffsetMs: 1_000 });
    const r1 = selectLocalEventOverlays([a, b, c], ctx());
    const r2 = selectLocalEventOverlays([c, a, b], ctx());
    expect(r1.overlays).toEqual(r2.overlays);
    // Ordered by startOffsetMs, then kind, then sourceReference.
    expect(r1.overlays.map((o) => o.startOffsetMs)).toEqual([1_000, 1_000, 5_000]);
  });
});
