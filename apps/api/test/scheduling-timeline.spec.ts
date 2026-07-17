import { describe, expect, it } from "vitest";
import {
  assembleEffectivePlan,
  type ResolverAssignment,
  resolveSchedule,
} from "../src/modules/scheduling/resolver/resolver";
import {
  type ResolverLocalEvent,
  selectLocalEventOverlays,
} from "../src/modules/scheduling/resolver/local-events";

/**
 * Timeline simulation (Sprint 08 · §29). Drives the pure runtime across a full
 * local day for one unit — tenant default + morning/afternoon unit programs, a
 * campaign slot and an emergency window — and asserts the resolved program, the
 * overlays and the effective-plan hash at each hour, plus whole-timeline
 * determinism. No DB, no clock: every input is explicit.
 */

const TENANT = "tenant-1";
const UNIT = "unit-1";
const DATE = "2026-07-15"; // a Wednesday

const PROGRAMS = {
  default: "prog-default",
  morning: "prog-morning",
  afternoon: "prog-afternoon",
};

const assignments: ResolverAssignment[] = [
  {
    id: "a-default",
    programId: PROGRAMS.default,
    programVersionId: null,
    targetType: "tenant",
    targetId: TENANT,
    priority: 0,
    daysOfWeek: [],
    startTimeLocal: "00:00",
    endTimeLocal: "23:59",
    validFrom: null,
    validUntil: null,
    active: true,
  },
  {
    id: "a-morning",
    programId: PROGRAMS.morning,
    programVersionId: null,
    targetType: "unit",
    targetId: UNIT,
    priority: 10,
    daysOfWeek: [],
    startTimeLocal: "06:00",
    endTimeLocal: "12:00",
    validFrom: null,
    validUntil: null,
    active: true,
  },
  {
    id: "a-afternoon",
    programId: PROGRAMS.afternoon,
    programVersionId: null,
    targetType: "unit",
    targetId: UNIT,
    priority: 10,
    daysOfWeek: [],
    startTimeLocal: "12:00",
    endTimeLocal: "18:00",
    validFrom: null,
    validUntil: null,
    active: true,
  },
];

const events: ResolverLocalEvent[] = [
  {
    id: "ev-campaign",
    assetId: "asset-campaign",
    targetType: "unit",
    targetId: UNIT,
    kind: "insert",
    category: "campaign_slot",
    priority: 0,
    daysOfWeek: [],
    startTimeLocal: "10:00",
    endTimeLocal: "10:05",
    startOffsetMs: 0,
    durationMs: 30_000,
    duckingDb: null,
    validFrom: null,
    validUntil: null,
    active: true,
  },
  {
    id: "ev-emergency",
    assetId: "asset-emergency",
    targetType: "tenant",
    targetId: TENANT,
    kind: "interrupt",
    category: "emergency",
    priority: 0,
    daysOfWeek: [],
    startTimeLocal: "14:00",
    endTimeLocal: "14:10",
    startOffsetMs: 0,
    durationMs: 120_000,
    duckingDb: null,
    validFrom: null,
    validUntil: null,
    active: true,
  },
];

// A DB-free stand-in for the compiler's base plan hash — deterministic per program.
const basePlanHashFor = (programId: string | null): string | null =>
  programId ? `hash-${programId}` : null;

const simulateHour = (hour: number) => {
  const localTime = `${String(hour).padStart(2, "0")}:00`;
  const resolution = resolveSchedule({
    tenantId: TENANT,
    unitId: UNIT,
    syncGroupId: null,
    groupIds: [],
    timezone: "America/Sao_Paulo",
    localDate: DATE,
    localTime,
    assignments,
  });
  const selection = selectLocalEventOverlays(events, {
    tenantId: TENANT,
    unitId: UNIT,
    syncGroupId: null,
    groupIds: [],
    localDate: DATE,
    localTime,
  });
  return assembleEffectivePlan({
    unitId: UNIT,
    localDate: DATE,
    timezone: "America/Sao_Paulo",
    resolution,
    basePlanHash: basePlanHashFor(resolution.selectedProgramId),
    overlays: selection.overlays,
    emergencyActive: selection.emergencyActive,
    overlayWarnings: selection.warnings,
  });
};

const fullDay = () => Array.from({ length: 24 }, (_, h) => simulateHour(h));

describe("Scheduling timeline simulation", () => {
  it("resolves the right program in each part of the day", () => {
    const day = fullDay();
    const program = (h: number) => day[h]!.resolution.selectedProgramId;

    for (let h = 0; h < 6; h++) expect(program(h)).toBe(PROGRAMS.default);
    for (let h = 6; h < 12; h++) expect(program(h)).toBe(PROGRAMS.morning);
    for (let h = 12; h < 18; h++) expect(program(h)).toBe(PROGRAMS.afternoon);
    for (let h = 18; h < 24; h++) expect(program(h)).toBe(PROGRAMS.default);
  });

  it("applies the campaign slot only within its window", () => {
    const at10 = simulateHour(10);
    expect(at10.overlays).toHaveLength(1);
    expect(at10.overlays[0]?.reasonCode).toBe("campaign_slot_inserted");
    // The overlay changes the effective hash away from the bare base.
    const at11 = simulateHour(11);
    expect(at11.overlays).toHaveLength(0);
    expect(at10.effectivePlanHash).not.toBe(at11.effectivePlanHash);
  });

  it("raises emergency in its window and stamps the override", () => {
    const at14 = simulateHour(14);
    expect(at14.emergencyActive).toBe(true);
    expect(at14.overlays[0]?.reasonCode).toBe("emergency_override");
    expect(simulateHour(13).emergencyActive).toBe(false);
  });

  it("produces a byte-identical timeline across runs (determinism)", () => {
    expect(JSON.stringify(fullDay())).toBe(JSON.stringify(fullDay()));
  });

  it("is invariant to the input order of assignments and events", () => {
    const shuffledAssignments = [assignments[2]!, assignments[0]!, assignments[1]!];
    const shuffledEvents = [events[1]!, events[0]!];
    const at10Shuffled = (() => {
      const resolution = resolveSchedule({
        tenantId: TENANT,
        unitId: UNIT,
        syncGroupId: null,
        groupIds: [],
        timezone: "America/Sao_Paulo",
        localDate: DATE,
        localTime: "10:00",
        assignments: shuffledAssignments,
      });
      const selection = selectLocalEventOverlays(shuffledEvents, {
        tenantId: TENANT,
        unitId: UNIT,
        syncGroupId: null,
        groupIds: [],
        localDate: DATE,
        localTime: "10:00",
      });
      return assembleEffectivePlan({
        unitId: UNIT,
        localDate: DATE,
        timezone: "America/Sao_Paulo",
        resolution,
        basePlanHash: basePlanHashFor(resolution.selectedProgramId),
        overlays: selection.overlays,
        emergencyActive: selection.emergencyActive,
        overlayWarnings: selection.warnings,
      });
    })();
    expect(JSON.stringify(at10Shuffled)).toBe(JSON.stringify(simulateHour(10)));
  });
});
