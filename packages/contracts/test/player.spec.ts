import { describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import {
  PLAYER_CONTRACT_VERSION,
  PLAYER_TELEMETRY_BATCH_MAX,
  playerActivationCompleteRequestSchema,
  playerActivationStartRequestSchema,
  playerExecutionPlanResponseSchema,
  playerHeartbeatRequestSchema,
  playerPlaybackEventSchema,
  playerRuntimeStatusSchema,
  playerTelemetryBatchRequestSchema,
} from "../src/index.js";

const HASH = "a".repeat(64);

describe("player activation contracts", () => {
  it("accepts a well-formed start request and defaults schemaVersion", () => {
    const parsed = playerActivationStartRequestSchema.parse({
      deviceId: "dev-local-0001",
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: HASH,
    });
    expect(parsed.schemaVersion).toBe(1);
  });

  it("rejects a non-sha256 activation secret hash", () => {
    const r = playerActivationStartRequestSchema.safeParse({
      deviceId: "dev-local-0001",
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: "NOTAHASH",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown fields (strict)", () => {
    const r = playerActivationStartRequestSchema.safeParse({
      deviceId: "dev-local-0001",
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: HASH,
      tenantId: "attacker-chosen",
    });
    expect(r.success).toBe(false);
  });

  it("requires a minimum-length raw secret on complete", () => {
    expect(
      playerActivationCompleteRequestSchema.safeParse({ code: "ABC123", activationSecret: "short" })
        .success,
    ).toBe(false);
    expect(
      playerActivationCompleteRequestSchema.safeParse({
        code: "ABC123",
        activationSecret: "0123456789abcdef",
      }).success,
    ).toBe(true);
  });
});

describe("player runtime status / heartbeat", () => {
  const base = {
    appVersion: "1.0.0",
    contractVersion: PLAYER_CONTRACT_VERSION,
    platform: "android" as const,
    runtimeState: "healthy" as const,
    connectivity: "apiReachable" as const,
    activePlanHash: null,
    effectivePlanHash: null,
    currentItemId: null,
    positionMs: null,
    storage: null,
    assetCount: 0,
    outboxSize: 0,
    lastSyncAt: null,
    lastError: null,
    reportedAt: "2026-07-18T09:30:00.000Z",
  };

  it("accepts a minimal status", () => {
    expect(playerHeartbeatRequestSchema.safeParse(base).success).toBe(true);
  });

  it("caps lastError length", () => {
    expect(
      playerRuntimeStatusSchema.safeParse({ ...base, lastError: "x".repeat(501) }).success,
    ).toBe(false);
  });

  it("rejects negative storage numbers", () => {
    expect(
      playerRuntimeStatusSchema.safeParse({
        ...base,
        storage: { totalBytes: -1, freeBytes: 0, cacheBytes: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("player telemetry batch", () => {
  const event = () => ({
    eventId: uuidv7(),
    type: "playback_completed" as const,
    planVersion: null,
    effectivePlanHash: null,
    itemId: "item-1",
    assetId: uuidv7(),
    startedAt: "2026-07-18T09:30:00.000Z",
    endedAt: "2026-07-18T09:33:00.000Z",
    positionMs: 180000,
    durationMs: 180000,
    completionPct: 100,
    source: "plan",
    reason: null,
    appVersion: "1.0.0",
  });

  it("accepts a batch of playback events", () => {
    const r = playerTelemetryBatchRequestSchema.safeParse({
      batchId: uuidv7(),
      playbackEvents: [event()],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty batch", () => {
    const r = playerTelemetryBatchRequestSchema.safeParse({ batchId: uuidv7() });
    expect(r.success).toBe(false);
  });

  it("rejects a batch over the size limit", () => {
    const r = playerTelemetryBatchRequestSchema.safeParse({
      batchId: uuidv7(),
      playbackEvents: Array.from({ length: PLAYER_TELEMETRY_BATCH_MAX + 1 }, event),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid completion percentage", () => {
    const r = playerPlaybackEventSchema.safeParse({ ...event(), completionPct: 150 });
    expect(r.success).toBe(false);
  });
});

describe("player execution plan response", () => {
  it("validates a plan envelope with assets and items", () => {
    const assetId = uuidv7();
    const parsed = playerExecutionPlanResponseSchema.parse({
      contractVersion: PLAYER_CONTRACT_VERSION,
      unitId: uuidv7(),
      timezone: "America/Sao_Paulo",
      localDate: "2026-07-18",
      windowStartUtc: "2026-07-18T11:00:00.000Z",
      windowEndUtc: "2026-07-19T01:00:00.000Z",
      compilerVersion: "1",
      basePlanHash: "base",
      effectivePlanHash: "eff",
      emergencyActive: false,
      fallbackActive: false,
      reasonCode: "assignment_selected",
      items: [
        {
          position: 0,
          assetId,
          title: "Track",
          artist: "Artist",
          startOffsetMs: 0,
          durationMs: 180000,
          source: "program",
          reason: "scheduled",
        },
      ],
      overlays: [],
      assets: [
        {
          assetId,
          url: "/v1/catalog/_storage/token",
          checksumSha256: "b".repeat(64),
          sizeBytes: 1024,
          contentType: "audio/mpeg",
          durationMs: 180000,
          title: "Track",
          artist: "Artist",
        },
      ],
      generatedAt: "2026-07-18T09:30:00.000Z",
      expiresAt: "2026-07-18T09:35:00.000Z",
    });
    expect(parsed.items).toHaveLength(1);
    expect(parsed.assets[0].assetId).toBe(assetId);
  });
});
