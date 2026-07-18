import { z } from "zod";
import { utcTimestampSchema, uuidSchema } from "../common/primitives.js";

/**
 * Player integration contracts — Sprint 10A (backend integration foundation).
 *
 * These schemas define the wire between an installed Player (Fleet device) and
 * the control-plane API: activation (pairing + proof-of-possession), device
 * session credentials, heartbeat/runtime status, the effective execution plan a
 * device fetches, and idempotent telemetry / operational playback events.
 *
 * Honesty note (§2.1): these are the *contracts* plus the backend that serves
 * them. The Flutter adapters that consume them (secure storage, authenticated
 * HTTP client, real audio, sync cycle) are Phase 10B and remain NOT implemented.
 * Nothing here is "Proof of Play certified" — `playback_event`s are operational
 * execution events, deduplicated by a device-generated id.
 *
 * The device NEVER chooses its `tenant_id`/`unit_id`: scope is derived on the
 * server from the authenticated device credential.
 */

/** Wire contract version carried by every device⇄backend exchange. */
export const PLAYER_CONTRACT_VERSION = "1.0.0";

/** Max events accepted in one telemetry batch (bounds payload + work). */
export const PLAYER_TELEMETRY_BATCH_MAX = 200;

/* ------------------------------------------------------------ vocabulary -- */

/** Player host platform (matches Fleet `devices.platform`). */
export const playerPlatformSchema = z.enum(["android", "windows", "web"]);
export type PlayerPlatform = z.infer<typeof playerPlatformSchema>;

/** Lifecycle of an activation code (maps to `pairing_codes.status`). */
export const playerActivationStatusSchema = z.enum([
  "pending",
  "claimed",
  "completed",
  "expired",
  "revoked",
]);
export type PlayerActivationStatus = z.infer<typeof playerActivationStatusSchema>;

/** Explicit sync-cycle / runtime states reported by the Player (§4.7). */
export const playerRuntimeStateSchema = z.enum([
  "booting",
  "idle",
  "authenticating",
  "fetchingPlan",
  "validatingPlan",
  "downloadingAssets",
  "activatingPlan",
  "playing",
  "emergency",
  "flushingTelemetry",
  "healthy",
  "degraded",
  "offline",
  "blocked",
]);
export type PlayerRuntimeState = z.infer<typeof playerRuntimeStateSchema>;

/** Connectivity as observed by the Player. */
export const playerConnectivitySchema = z.enum([
  "online",
  "apiReachable",
  "captivePortal",
  "offline",
]);
export type PlayerConnectivity = z.infer<typeof playerConnectivitySchema>;

/** Operational playback event type (NOT certified Proof of Play). */
export const playbackEventTypeSchema = z.enum([
  "playback_started",
  "playback_progress_checkpoint",
  "playback_completed",
  "playback_skipped",
  "playback_failed",
  "emergency_started",
  "emergency_completed",
]);
export type PlaybackEventType = z.infer<typeof playbackEventTypeSchema>;

/** Lowercase sha256 hex (proof-of-possession hash + asset integrity). */
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/, "expected lowercase sha256 hex");

/** Human-typed activation code shown on the Player screen. */
const activationCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{6,16}$/, "expected 6–16 uppercase alphanumeric characters");

/** Device-declared capabilities recorded at activation (non-authoritative). */
export const playerCapabilitiesSchema = z
  .object({
    audioPlayback: z.boolean().default(false),
    secureStorage: z.boolean().default(false),
    keepScreenOn: z.boolean().default(false),
    kioskMode: z.boolean().default(false),
  })
  .strict();
export type PlayerCapabilities = z.infer<typeof playerCapabilitiesSchema>;

/* ----------------------------------------------------------- activation -- */

/**
 * Device → `POST /v1/player/activation/start`. The Player mints a local
 * `deviceId` and a high-entropy `activationSecret`, sending only the secret's
 * sha256. The raw secret never travels; it is the proof-of-possession the device
 * later presents to `complete`, so knowledge of the code alone cannot claim a
 * credential.
 */
export const playerActivationStartRequestSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    deviceId: z.string().min(8).max(128),
    platform: playerPlatformSchema,
    appVersion: z.string().min(1).max(32),
    activationSecretHash: sha256HexSchema,
    hardwareModel: z.string().max(128).optional(),
    capabilities: playerCapabilitiesSchema.optional(),
  })
  .strict();
export type PlayerActivationStartRequest = z.infer<typeof playerActivationStartRequestSchema>;

export const playerActivationStartResponseSchema = z.object({
  code: activationCodeSchema,
  expiresAt: utcTimestampSchema,
  pollIntervalSeconds: z.number().int().min(1).max(60),
});
export type PlayerActivationStartResponse = z.infer<typeof playerActivationStartResponseSchema>;

/**
 * Device → `GET /v1/player/activation/:code`. Poll for pairing status. Never
 * returns secrets or the credential — only whether an operator has claimed it.
 */
export const playerActivationStatusResponseSchema = z.object({
  status: playerActivationStatusSchema,
  unitName: z.string().nullable(),
  friendlyName: z.string().nullable(),
  expiresAt: utcTimestampSchema,
});
export type PlayerActivationStatusResponse = z.infer<typeof playerActivationStatusResponseSchema>;

/**
 * Operator (human, RBAC `fleet:device:pair`) →
 * `POST /v1/player/activation/:code/claim`. Binds the pending device to a zone in
 * the operator's tenant. Does NOT mint or return the device token — the raw token
 * is only ever issued to the device at `complete`.
 */
export const playerActivationClaimRequestSchema = z
  .object({
    zoneId: uuidSchema,
    friendlyName: z.string().min(1).max(120).optional(),
  })
  .strict();
export type PlayerActivationClaimRequest = z.infer<typeof playerActivationClaimRequestSchema>;

/**
 * Device → `POST /v1/player/activation/complete`. Presents the code and the raw
 * `activationSecret`. On success the server mints a device token, stores only its
 * hash, and returns the raw token exactly once (single-use; replay ⇒ 409).
 */
export const playerActivationCompleteRequestSchema = z
  .object({
    code: activationCodeSchema,
    activationSecret: z.string().min(16).max(256),
  })
  .strict();
export type PlayerActivationCompleteRequest = z.infer<typeof playerActivationCompleteRequestSchema>;

/**
 * The device credential. `token` is the raw bearer secret and is returned ONLY
 * here (complete) and on refresh — never persisted server-side in plaintext, only
 * as a sha256 hash. The Player must store it in platform secure storage (10B).
 */
export const playerCredentialResponseSchema = z.object({
  contractVersion: z.string(),
  deviceId: uuidSchema,
  token: z.string().min(1),
  tokenExpiresAt: utcTimestampSchema,
  tenantId: uuidSchema,
  unitId: uuidSchema,
  zoneId: uuidSchema,
  unitName: z.string(),
  friendlyName: z.string().nullable(),
  timezone: z.string(),
});
export type PlayerCredentialResponse = z.infer<typeof playerCredentialResponseSchema>;

/* --------------------------------------------------- heartbeat / status -- */

export const playerStorageStatusSchema = z
  .object({
    totalBytes: z.number().int().nonnegative(),
    freeBytes: z.number().int().nonnegative(),
    cacheBytes: z.number().int().nonnegative(),
  })
  .strict();
export type PlayerStorageStatus = z.infer<typeof playerStorageStatusSchema>;

/**
 * The Player's self-reported operational status. Carries only what operations
 * needs — never tokens, filesystem paths, or full stack traces (§4.8). `lastError`
 * is a short sanitized code/message.
 */
export const playerRuntimeStatusSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    appVersion: z.string().min(1).max(32),
    contractVersion: z.string().max(16),
    platform: playerPlatformSchema,
    runtimeState: playerRuntimeStateSchema,
    connectivity: playerConnectivitySchema,
    activePlanHash: z.string().max(128).nullable(),
    effectivePlanHash: z.string().max(128).nullable(),
    currentItemId: z.string().max(128).nullable(),
    positionMs: z.number().int().nonnegative().nullable(),
    storage: playerStorageStatusSchema.nullable(),
    assetCount: z.number().int().nonnegative(),
    outboxSize: z.number().int().nonnegative(),
    lastSyncAt: utcTimestampSchema.nullable(),
    lastError: z.string().max(500).nullable(),
    reportedAt: utcTimestampSchema,
  })
  .strict();
export type PlayerRuntimeStatus = z.infer<typeof playerRuntimeStatusSchema>;

/** Device → `POST /v1/player/heartbeat` (device-authenticated). */
export const playerHeartbeatRequestSchema = playerRuntimeStatusSchema;
export type PlayerHeartbeatRequest = z.infer<typeof playerHeartbeatRequestSchema>;

export const playerHeartbeatResponseSchema = z.object({
  serverTime: utcTimestampSchema,
  effectivePlanHash: z.string().nullable(),
  planChanged: z.boolean(),
  nextHeartbeatSeconds: z.number().int().min(5).max(3600),
});
export type PlayerHeartbeatResponse = z.infer<typeof playerHeartbeatResponseSchema>;

/* ----------------------------------------------------- execution plan -- */

/** A resolved, downloadable asset referenced by the plan (§4.5). */
export const playerAssetDescriptorSchema = z.object({
  assetId: uuidSchema,
  /** Signed, expiring download URL (relative to the API origin or absolute). */
  url: z.string().min(1),
  checksumSha256: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  contentType: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  title: z.string(),
  artist: z.string().nullable(),
});
export type PlayerAssetDescriptor = z.infer<typeof playerAssetDescriptorSchema>;

/** One ordered item of the compiled plan. */
export const playerPlanItemSchema = z.object({
  position: z.number().int(),
  assetId: uuidSchema.nullable(),
  title: z.string(),
  artist: z.string().nullable(),
  startOffsetMs: z.number().int(),
  durationMs: z.number().int(),
  source: z.string(),
  reason: z.string(),
});
export type PlayerPlanItem = z.infer<typeof playerPlanItemSchema>;

/** Editorial / campaign / emergency overlay layered on the base plan. */
export const playerPlanOverlaySchema = z.object({
  kind: z.enum(["insert", "overlay", "interrupt"]),
  assetId: uuidSchema.nullable(),
  startOffsetMs: z.number().int(),
  durationMs: z.number().int(),
  duckingDb: z.number().optional(),
  sourceReference: z.string(),
  reasonCode: z.string(),
});
export type PlayerPlanOverlay = z.infer<typeof playerPlanOverlaySchema>;

/**
 * Device → `GET /v1/player/execution-plan` (device-authenticated). The effective
 * plan for the device's unit at the current local date/time: resolved program,
 * ordered items, overlays, emergency state, plan hashes, and downloadable asset
 * descriptors. `basePlanHash` is the shared base; `effectivePlanHash` differs iff
 * overlays/emergency apply.
 */
export const playerExecutionPlanResponseSchema = z.object({
  contractVersion: z.string(),
  unitId: uuidSchema,
  timezone: z.string(),
  localDate: z.string(),
  windowStartUtc: z.string().nullable(),
  windowEndUtc: z.string().nullable(),
  compilerVersion: z.string().nullable(),
  basePlanHash: z.string().nullable(),
  effectivePlanHash: z.string(),
  emergencyActive: z.boolean(),
  fallbackActive: z.boolean(),
  reasonCode: z.string(),
  items: z.array(playerPlanItemSchema),
  overlays: z.array(playerPlanOverlaySchema),
  assets: z.array(playerAssetDescriptorSchema),
  generatedAt: utcTimestampSchema,
  expiresAt: utcTimestampSchema,
});
export type PlayerExecutionPlanResponse = z.infer<typeof playerExecutionPlanResponseSchema>;

/* ------------------------------------------------------------- telemetry -- */

/**
 * An operational playback (execution) event. `eventId` is generated on the device
 * and is the idempotency key — re-sending the same event never double-counts.
 * Tenant/unit/zone scope is derived on the server from the credential, never sent.
 */
export const playerPlaybackEventSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  eventId: uuidSchema,
  type: playbackEventTypeSchema,
  planVersion: z.string().max(128).nullable(),
  effectivePlanHash: z.string().max(128).nullable(),
  itemId: z.string().max(128).nullable(),
  assetId: uuidSchema.nullable(),
  startedAt: utcTimestampSchema,
  endedAt: utcTimestampSchema.nullable(),
  positionMs: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  completionPct: z.number().int().min(0).max(100).nullable(),
  source: z.string().max(64),
  reason: z.string().max(200).nullable(),
  appVersion: z.string().max(32),
});
export type PlayerPlaybackEvent = z.infer<typeof playerPlaybackEventSchema>;

/** A sanitized runtime error event (feeds `player_error_events`). */
export const playerRuntimeErrorEventSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  eventId: uuidSchema,
  kind: z.string().max(64),
  occurredAt: utcTimestampSchema,
  appVersion: z.string().max(32),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type PlayerRuntimeErrorEvent = z.infer<typeof playerRuntimeErrorEventSchema>;

/**
 * Device → `POST /v1/player/telemetry` (device-authenticated). A bounded batch of
 * playback and/or error events plus a `batchId`. Ingestion is idempotent: the
 * server dedups by `eventId` and returns per-event accepted/duplicate/rejected.
 */
export const playerTelemetryBatchRequestSchema = z
  .object({
    batchId: uuidSchema,
    playbackEvents: z.array(playerPlaybackEventSchema).max(PLAYER_TELEMETRY_BATCH_MAX).default([]),
    errorEvents: z.array(playerRuntimeErrorEventSchema).max(PLAYER_TELEMETRY_BATCH_MAX).default([]),
  })
  .strict()
  .refine((b) => b.playbackEvents.length + b.errorEvents.length > 0, {
    message: "batch must contain at least one event",
  })
  .refine((b) => b.playbackEvents.length + b.errorEvents.length <= PLAYER_TELEMETRY_BATCH_MAX, {
    message: `batch may not exceed ${PLAYER_TELEMETRY_BATCH_MAX} events`,
  });
export type PlayerTelemetryBatchRequest = z.infer<typeof playerTelemetryBatchRequestSchema>;

export const playerTelemetryBatchResponseSchema = z.object({
  batchId: uuidSchema,
  acceptedIds: z.array(uuidSchema),
  duplicateIds: z.array(uuidSchema),
  rejectedIds: z.array(uuidSchema),
});
export type PlayerTelemetryBatchResponse = z.infer<typeof playerTelemetryBatchResponseSchema>;

/* ------------------------------------------------ admin (human) surface -- */

/** Admin view of a Fleet device (RBAC `fleet:device:read`). No secrets. */
export const playerDeviceSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  platform: playerPlatformSchema,
  status: z.enum(["pending", "active", "offline", "decommissioned"]),
  zoneId: uuidSchema,
  unitId: uuidSchema.nullable(),
  unitName: z.string().nullable(),
  installedVersion: z.string().nullable(),
  lastSeenAt: utcTimestampSchema.nullable(),
  createdAt: utcTimestampSchema,
});
export type PlayerDeviceSummary = z.infer<typeof playerDeviceSummarySchema>;

/** Admin device detail: summary + last runtime projection (no secrets). */
export const playerDeviceDetailSchema = playerDeviceSummarySchema.extend({
  runtimeState: playerRuntimeStateSchema.nullable(),
  connectivity: playerConnectivitySchema.nullable(),
  effectivePlanHash: z.string().nullable(),
  currentItemId: z.string().nullable(),
  storage: playerStorageStatusSchema.nullable(),
  lastError: z.string().nullable(),
  lastSyncAt: utcTimestampSchema.nullable(),
  contractVersion: z.string().nullable(),
  hasActiveCredential: z.boolean(),
});
export type PlayerDeviceDetail = z.infer<typeof playerDeviceDetailSchema>;

/** Admin view of an activation code (RBAC `fleet:device:pair`). */
export const playerActivationAdminSchema = z.object({
  code: activationCodeSchema,
  status: playerActivationStatusSchema,
  platform: playerPlatformSchema.nullable(),
  deviceId: uuidSchema.nullable(),
  zoneId: uuidSchema.nullable(),
  expiresAt: utcTimestampSchema,
  createdAt: utcTimestampSchema,
});
export type PlayerActivationAdmin = z.infer<typeof playerActivationAdminSchema>;

/** Admin view of a persisted operational playback event. */
export const playerPlaybackEventRecordSchema = z.object({
  id: uuidSchema,
  deviceId: uuidSchema,
  unitId: uuidSchema,
  zoneId: uuidSchema.nullable(),
  assetId: uuidSchema,
  startedAt: utcTimestampSchema,
  endedAt: utcTimestampSchema.nullable(),
  completionPct: z.number().int().nullable(),
  receivedAt: utcTimestampSchema,
});
export type PlayerPlaybackEventRecord = z.infer<typeof playerPlaybackEventRecordSchema>;
