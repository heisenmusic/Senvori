import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { auditFields, id, tenantIsolation } from "./_helpers";
import { users } from "./identity";
import { tenants, zones } from "./tenancy";

/**
 * Fleet domain schema — SENVORI_CORE_DOMAINS.md §3.
 * Devices, pairing, tokens, hot heartbeat projection, OTA and remote commands.
 * Device identity is separate from user identity by design (D11).
 */

/** Physical player installation bound to a zone (§3.2). */
export const devices = pgTable(
  "devices",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zones.id),
    name: text("name").notNull(),
    platform: text("platform", { enum: ["android", "windows", "web"] }).notNull(),
    hardwareModel: text("hardware_model"),
    status: text("status", { enum: ["pending", "active", "offline", "decommissioned"] })
      .notNull()
      .default("pending"),
    installedVersion: text("installed_version"),
    releaseChannel: text("release_channel", { enum: ["stable", "beta", "canary"] })
      .notNull()
      .default("stable"),
    /** Declared capabilities from pairing (§3.2 DeviceProfile). */
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    decommissionedAt: timestamp("decommissioned_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [
    // §3.9 rule 3: one live device per zone
    uniqueIndex("devices_zone_live_idx")
      .on(t.zoneId)
      .where(sql`status IN ('pending', 'active', 'offline')`),
    index("devices_tenant_status_idx").on(t.tenantId, t.status),
    tenantIsolation("devices"),
  ],
).enableRLS();

/**
 * Pairing code shown on the player screen (§3.2). Created BEFORE any tenant
 * exists for the device, so tenant_id is set at claim time — no RLS here;
 * access is limited to the exchange endpoints by design.
 */
export const pairingCodes = pgTable(
  "pairing_codes",
  {
    id: id(),
    code: text("code").notNull().unique(),
    /** NULL until the claim assigns the device to a tenant/zone. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "cascade" }),
    /** Platform/profile reported by the unpaired player. */
    provisionalProfile: jsonb("provisional_profile").notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pairing_codes_expiry_idx").on(t.expiresAt)],
);

/** Rotating device credential with minimal scope (§3.2, D11). */
export const deviceTokens = pgTable(
  "device_tokens",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("device_tokens_device_idx").on(t.deviceId), tenantIsolation("device_tokens")],
).enableRLS();

/**
 * Hot heartbeat projection — last known state only (§3.2 HeartbeatStatus).
 * Raw heartbeat history lives in Analytics (device_metric_events).
 */
export const heartbeatStatuses = pgTable(
  "heartbeat_statuses",
  {
    deviceId: uuid("device_id")
      .primaryKey()
      .references(() => devices.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    appVersion: text("app_version"),
    appliedManifestVersion: bigint("applied_manifest_version", { mode: "number" }),
    network: jsonb("network").$type<Record<string, unknown>>().notNull().default({}),
    cache: jsonb("cache").$type<Record<string, unknown>>().notNull().default({}),
    playback: jsonb("playback").$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("heartbeat_statuses_tenant_idx").on(t.tenantId, t.lastSeenAt),
    tenantIsolation("heartbeat_statuses"),
  ],
).enableRLS();

/** Player build published by Senvori (§3.2) — platform scope, no tenant_id. */
export const playerReleases = pgTable(
  "player_releases",
  {
    id: id(),
    version: text("version").notNull(),
    platform: text("platform", { enum: ["android", "windows", "web"] }).notNull(),
    channel: text("channel", { enum: ["stable", "beta", "canary"] }).notNull(),
    artifactUrl: text("artifact_url").notNull(),
    artifactHash: text("artifact_hash").notNull(),
    changelog: text("changelog"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("player_releases_platform_version_idx").on(t.platform, t.version)],
);

/** Gradual OTA distribution with automatic rollback (§3.2, §3.9 rule 5). */
export const otaRollouts = pgTable(
  "ota_rollouts",
  {
    id: id(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => playerReleases.id),
    /** Targeting: channels, tenant ids, group ids. */
    target: jsonb("target").$type<Record<string, unknown>>().notNull().default({}),
    percentage: integer("percentage").notNull().default(0),
    failureThresholdPct: integer("failure_threshold_pct").notNull().default(5),
    status: text("status", {
      enum: ["draft", "running", "paused", "completed", "rolled_back"],
    })
      .notNull()
      .default("draft"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [index("ota_rollouts_status_idx").on(t.status)],
);

/** Remote command queue (§3.2) — desired state travels via manifest, not here. */
export const deviceCommands = pgTable(
  "device_commands",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "restart",
        "resync",
        "set_volume",
        "clear_cache",
        "run_diagnostics",
        "screenshot",
        "decommission",
      ],
    }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status", { enum: ["queued", "delivered", "acked", "failed", "expired"] })
      .notNull()
      .default("queued"),
    /** §3.9 rule 6: stale commands never execute after long offline periods. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    issuedBy: uuid("issued_by").references(() => users.id),
    ackedAt: timestamp("acked_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [
    index("device_commands_device_status_idx").on(t.deviceId, t.status),
    tenantIsolation("device_commands"),
  ],
).enableRLS();

/** On-demand diagnostics result (§3.2). */
export const diagnosticReports = pgTable(
  "diagnostic_reports",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    report: jsonb("report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("diagnostic_reports_device_idx").on(t.deviceId, t.createdAt),
    tenantIsolation("diagnostic_reports"),
  ],
).enableRLS();
