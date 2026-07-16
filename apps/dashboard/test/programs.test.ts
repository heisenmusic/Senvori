import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDateTime,
  formatHoursMinutes,
  itemClock,
  programStatusVariant,
  shortHash,
  todayLocalISODate,
  totalDurationMs,
  warningKey,
} from "../src/lib/programs";

describe("warningKey", () => {
  it("maps known compiler codes to themselves", () => {
    expect(warningKey("insufficient_catalog")).toBe("insufficient_catalog");
    expect(warningKey("track_gap_relaxed")).toBe("track_gap_relaxed");
    expect(warningKey("fallback_used")).toBe("fallback_used");
    expect(warningKey("window_not_filled")).toBe("window_not_filled");
  });
  it("falls back to 'generic' for unknown codes (forward-compatible UI)", () => {
    expect(warningKey("some_future_code")).toBe("generic");
    expect(warningKey("")).toBe("generic");
  });
});

describe("formatClock", () => {
  it("formats M:SS", () => {
    expect(formatClock(210_000)).toBe("3:30");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(5_000)).toBe("0:05");
  });
  it("guards null/zero", () => {
    expect(formatClock(null)).toBe("0:00");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(undefined)).toBe("0:00");
  });
});

describe("formatHoursMinutes", () => {
  it("formats minutes-only under an hour", () => {
    expect(formatHoursMinutes(45 * 60_000)).toBe("45 min");
  });
  it("formats whole hours", () => {
    expect(formatHoursMinutes(120 * 60_000)).toBe("2 h");
  });
  it("formats hours and minutes", () => {
    expect(formatHoursMinutes(90 * 60_000)).toBe("1 h 30 min");
  });
  it("guards null/zero", () => {
    expect(formatHoursMinutes(0)).toBe("0 min");
    expect(formatHoursMinutes(null)).toBe("0 min");
  });
});

describe("itemClock", () => {
  it("computes the local wall-clock from a UTC window start + offset (São Paulo, UTC−3)", () => {
    // 03:00Z is 00:00 in São Paulo; +5h offset → 05:00 local.
    expect(itemClock("2026-07-16T03:00:00.000Z", 5 * 3_600_000, "America/Sao_Paulo", "pt-BR")).toBe(
      "05:00",
    );
  });
  it("respects DST zones (New York, July = EDT/UTC−4)", () => {
    // 04:00Z is 00:00 EDT; +2h30m offset → 02:30 local.
    expect(
      itemClock(
        "2026-07-16T04:00:00.000Z",
        2 * 3_600_000 + 30 * 60_000,
        "America/New_York",
        "en-GB",
      ),
    ).toBe("02:30");
  });
  it("returns a HH:MM string and tolerates a bad timezone", () => {
    expect(itemClock("2026-07-16T03:00:00.000Z", 0, "Not/AZone", "pt-BR")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("shortHash", () => {
  it("abbreviates long hashes", () => {
    expect(shortHash("abcdef1234567890")).toBe("abcd…7890");
  });
  it("keeps short values and guards null", () => {
    expect(shortHash("abc123")).toBe("abc123");
    expect(shortHash(null)).toBe("—");
    expect(shortHash(undefined)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("returns a non-empty localized string for a valid ISO", () => {
    const out = formatDateTime("2026-07-16T12:00:00.000Z", "pt-BR");
    expect(out).not.toBe("—");
    expect(out.length).toBeGreaterThan(0);
  });
  it("guards null/invalid", () => {
    expect(formatDateTime(null, "pt-BR")).toBe("—");
    expect(formatDateTime("not-a-date", "pt-BR")).toBe("—");
  });
});

describe("totalDurationMs", () => {
  it("sums durations treating nulls as zero", () => {
    expect(
      totalDurationMs([{ durationMs: 1000 }, { durationMs: null }, { durationMs: 2000 }]),
    ).toBe(3000);
    expect(totalDurationMs([])).toBe(0);
  });
});

describe("todayLocalISODate", () => {
  it("returns a YYYY-MM-DD string for a timezone", () => {
    const now = new Date("2026-07-16T10:00:00.000Z");
    expect(todayLocalISODate("America/Sao_Paulo", now)).toBe("2026-07-16");
  });
  it("rolls to the correct local date near midnight", () => {
    // 02:00Z on the 16th is still 22:00 on the 15th in São Paulo (UTC−3).
    const nearMidnight = new Date("2026-07-16T02:00:00.000Z");
    expect(todayLocalISODate("America/Sao_Paulo", nearMidnight)).toBe("2026-07-15");
  });
});

describe("programStatusVariant", () => {
  it("maps status to a badge variant", () => {
    expect(programStatusVariant("published")).toBe("success");
    expect(programStatusVariant("archived")).toBe("neutral");
    expect(programStatusVariant("draft")).toBe("default");
  });
});
