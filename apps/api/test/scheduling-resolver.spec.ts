import { describe, expect, it } from "vitest";
import {
  assembleEffectivePlan,
  localWeekday,
  resolveSchedule,
  type EffectiveOverlay,
  type ResolverAssignment,
  type ScheduleResolutionInput,
} from "../src/modules/scheduling/resolver/resolver";

/**
 * Scheduling resolver — pure unit tests (Sprint 08 · §28). No DB, no clock.
 * Prove specificity, priority, conflict, validity, days, time window, DST-safe
 * weekday, determinism, stable ordering and effective-plan hashing.
 */

const A = (over: Partial<ResolverAssignment> & { id: string }): ResolverAssignment => ({
  programId: `prog-${over.id}`,
  programVersionId: `ver-${over.id}`,
  targetType: "unit",
  targetId: "unit-1",
  priority: 0,
  daysOfWeek: [],
  startTimeLocal: "00:00",
  endTimeLocal: "23:59", // near-full-day default window
  validFrom: null,
  validUntil: null,
  active: true,
  ...over,
});

const input = (
  assignments: ResolverAssignment[],
  over: Partial<ScheduleResolutionInput> = {},
): ScheduleResolutionInput => ({
  tenantId: "tenant-1",
  unitId: "unit-1",
  syncGroupId: "sg-1",
  groupIds: ["grp-1"],
  timezone: "America/Sao_Paulo",
  localDate: "2026-06-15", // a Monday
  localTime: "10:00",
  assignments,
  ...over,
});

describe("resolver — weekday (calendar, DST-safe)", () => {
  it("computes the local weekday from the civil date", () => {
    expect(localWeekday("2026-06-15")).toBe(1); // Monday
    expect(localWeekday("2026-06-14")).toBe(0); // Sunday
    expect(localWeekday("2026-03-08")).toBe(0); // NY DST day — still Sunday
  });
});

describe("resolver — selection", () => {
  it("selects the only in-effect assignment", () => {
    const r = resolveSchedule(input([A({ id: "a" })]));
    expect(r.selectedAssignmentId).toBe("a");
    expect(r.reasonCode).toBe("unit_assignment_selected");
  });

  it("returns no_assignment when nothing is in effect", () => {
    const r = resolveSchedule(input([]));
    expect(r.selectedAssignmentId).toBeNull();
    expect(r.reasonCode).toBe("no_assignment");
  });

  it("prefers unit over sync-group over tenant (specificity)", () => {
    const r = resolveSchedule(
      input([
        A({ id: "tenant", targetType: "tenant", targetId: "tenant-1" }),
        A({ id: "sg", targetType: "sync_group", targetId: "sg-1" }),
        A({ id: "unit", targetType: "unit", targetId: "unit-1" }),
      ]),
    );
    expect(r.selectedAssignmentId).toBe("unit");
    expect(r.reasonCode).toBe("unit_assignment_selected");
  });

  it("falls back to a sync-group assignment when no unit one applies", () => {
    const r = resolveSchedule(
      input([
        A({ id: "sg", targetType: "sync_group", targetId: "sg-1" }),
        A({ id: "other-unit", targetType: "unit", targetId: "unit-9" }),
      ]),
    );
    expect(r.selectedAssignmentId).toBe("sg");
    expect(r.reasonCode).toBe("sync_group_assignment_selected");
  });

  it("uses explicit priority within the same specificity level", () => {
    const r = resolveSchedule(
      input([A({ id: "low", priority: 1 }), A({ id: "high", priority: 5 })]),
    );
    expect(r.selectedAssignmentId).toBe("high");
  });

  it("prefers the more specific period (narrower window) at equal priority", () => {
    const r = resolveSchedule(
      input([
        A({ id: "wide", startTimeLocal: "08:00", endTimeLocal: "18:00" }),
        A({ id: "narrow", startTimeLocal: "09:00", endTimeLocal: "11:00" }),
      ]),
    );
    expect(r.selectedAssignmentId).toBe("narrow");
  });

  it("flags an ambiguous tie instead of deciding silently by id", () => {
    const r = resolveSchedule(
      input([
        A({ id: "bbb", startTimeLocal: "08:00", endTimeLocal: "12:00" }),
        A({ id: "aaa", startTimeLocal: "08:00", endTimeLocal: "12:00" }),
      ]),
    );
    expect(r.reasonCode).toBe("assignment_conflict_detected");
    expect(r.warnings.map((w) => w.code)).toContain("assignment_conflict_detected");
    // Still deterministic: lowest id.
    expect(r.selectedAssignmentId).toBe("aaa");
  });
});

describe("resolver — validity & windows", () => {
  it("respects the local validity date range", () => {
    const future = A({ id: "future", validFrom: "2026-07-01" });
    expect(resolveSchedule(input([future])).selectedAssignmentId).toBeNull();
    expect(resolveSchedule(input([future], { localDate: "2026-07-05" })).selectedAssignmentId).toBe(
      "future",
    );
  });

  it("respects days-of-week (local weekday)", () => {
    const weekend = A({ id: "weekend", daysOfWeek: [0, 6] });
    expect(resolveSchedule(input([weekend])).selectedAssignmentId).toBeNull(); // Monday
    expect(
      resolveSchedule(input([weekend], { localDate: "2026-06-14" })).selectedAssignmentId,
    ).toBe("weekend"); // Sunday
  });

  it("respects the local time window [start, end)", () => {
    const morning = A({ id: "m", startTimeLocal: "08:00", endTimeLocal: "12:00" });
    expect(
      resolveSchedule(input([morning], { localTime: "07:59" })).selectedAssignmentId,
    ).toBeNull();
    expect(resolveSchedule(input([morning], { localTime: "08:00" })).selectedAssignmentId).toBe(
      "m",
    );
    expect(
      resolveSchedule(input([morning], { localTime: "12:00" })).selectedAssignmentId,
    ).toBeNull();
  });

  it("ignores a cross-midnight / empty window and warns", () => {
    const bad = A({ id: "bad", startTimeLocal: "22:00", endTimeLocal: "02:00" });
    const r = resolveSchedule(input([bad], { localTime: "23:00" }));
    expect(r.selectedAssignmentId).toBeNull();
    expect(r.warnings.map((w) => w.code)).toContain("invalid_assignment_window");
  });

  it("skips inactive assignments", () => {
    expect(
      resolveSchedule(input([A({ id: "off", active: false })])).selectedAssignmentId,
    ).toBeNull();
  });
});

describe("resolver — determinism", () => {
  it("is order-independent and reproducible", () => {
    const a = A({ id: "a", priority: 3 });
    const b = A({ id: "b", priority: 5 });
    const c = A({ id: "c", targetType: "sync_group", targetId: "sg-1" });
    const r1 = resolveSchedule(input([a, b, c]));
    const r2 = resolveSchedule(input([c, b, a]));
    expect(r1).toEqual(r2);
  });
});

describe("effective plan — base vs effective hash", () => {
  const resolution = resolveSchedule(input([A({ id: "a" })]));

  it("keeps the base hash as the shared identity; effective adds overlays", () => {
    const noOverlay = assembleEffectivePlan({
      unitId: "unit-1",
      localDate: "2026-06-15",
      timezone: "America/Sao_Paulo",
      resolution,
      basePlanHash: "base-abc",
      overlays: [],
    });
    const overlay: EffectiveOverlay = {
      kind: "insert",
      assetId: "asset-1",
      startOffsetMs: 60_000,
      durationMs: 15_000,
      sourceReference: "local_event:e1",
      reasonCode: "local_event_inserted",
    };
    const withOverlay = assembleEffectivePlan({
      unitId: "unit-1",
      localDate: "2026-06-15",
      timezone: "America/Sao_Paulo",
      resolution,
      basePlanHash: "base-abc",
      overlays: [overlay],
    });
    expect(withOverlay.basePlanHash).toBe(noOverlay.basePlanHash); // shared base
    expect(withOverlay.effectivePlanHash).not.toBe(noOverlay.effectivePlanHash);
  });

  it("orders overlays deterministically before hashing", () => {
    const o1: EffectiveOverlay = {
      kind: "insert",
      assetId: "a1",
      startOffsetMs: 120_000,
      durationMs: 1000,
      sourceReference: "x:2",
      reasonCode: "local_event_inserted",
    };
    const o2: EffectiveOverlay = {
      kind: "overlay",
      assetId: "a2",
      startOffsetMs: 30_000,
      durationMs: 1000,
      sourceReference: "x:1",
      reasonCode: "local_overlay_applied",
    };
    const p1 = assembleEffectivePlan({
      unitId: "u",
      localDate: "2026-06-15",
      timezone: "America/Sao_Paulo",
      resolution,
      basePlanHash: "b",
      overlays: [o1, o2],
    });
    const p2 = assembleEffectivePlan({
      unitId: "u",
      localDate: "2026-06-15",
      timezone: "America/Sao_Paulo",
      resolution,
      basePlanHash: "b",
      overlays: [o2, o1],
    });
    expect(p1.effectivePlanHash).toBe(p2.effectivePlanHash);
    expect(p1.overlays[0]?.startOffsetMs).toBe(30_000); // sorted by offset
  });
});
