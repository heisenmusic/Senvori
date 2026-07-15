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
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";
import { devices } from "./fleet";
import { tenants } from "./tenancy";

/**
 * Scheduling domain schema — SENVORI_CORE_DOMAINS.md §7.
 *
 * Rules are authored in LOCAL wall-clock time as RRULE (RFC 5545); compilation
 * converts to the device's UTC timeline using the unit's IANA timezone (D4).
 * The Manifest is the signed, versioned, immutable execution contract (D6).
 *
 * Layers are a fixed platform vocabulary (§7.2): base_music → curated_override
 * → campaign → retail_media → announcement → emergency. Their interaction
 * policies (replace / duck / queue / interrupt) live in code, not in data.
 */

const scheduleLayers = [
  "base_music",
  "curated_override",
  "campaign",
  "retail_media",
  "announcement",
  "emergency",
] as const;

const targetTypes = ["tenant", "country", "brand", "group", "unit", "zone"] as const;

/** Programming container bound to a hierarchy node (§7.2 Schedule). */
export const schedules = pgTable(
  "schedules",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetType: text("target_type", { enum: targetTypes }).notNull(),
    /** UUID for entity scopes, ISO 3166 code for country scope. */
    targetId: text("target_id").notNull(),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("schedules_tenant_target_idx").on(t.tenantId, t.targetType, t.targetId),
    index("schedules_tenant_status_idx").on(t.tenantId, t.status),
    tenantIsolation("schedules"),
  ],
).enableRLS();

/**
 * Programming slot (§7.2 ScheduleEntry). `content_id` is polymorphic
 * (playlist / pack / campaign entry) — validated by the owning domain, no hard FK.
 */
export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    contentType: text("content_type", {
      enum: ["playlist", "pack", "campaign_ref", "silence"],
    }).notNull(),
    contentId: uuid("content_id"),
    /** RRULE (RFC 5545), local wall-clock semantics (D4). */
    rrule: text("rrule").notNull(),
    /** "HH:mm" local wall-clock window. */
    startTimeLocal: text("start_time_local").notNull(),
    endTimeLocal: text("end_time_local").notNull(),
    layer: text("layer", { enum: scheduleLayers }).notNull().default("base_music"),
    /** Fine priority inside a layer — specificity resolves first (§7.9 rule 3). */
    priority: integer("priority").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    ...auditFields(),
  },
  (t) => [
    index("schedule_entries_schedule_idx").on(t.scheduleId),
    index("schedule_entries_content_idx").on(t.contentType, t.contentId),
    tenantIsolation("schedule_entries"),
  ],
).enableRLS();

/** Silence windows (§7.2 SilencePolicy): legal quiet hours, closed periods. */
export const silencePolicies = pgTable(
  "silence_policies",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: targetTypes }).notNull(),
    targetId: text("target_id").notNull(),
    rrule: text("rrule").notNull(),
    startTimeLocal: text("start_time_local").notNull(),
    endTimeLocal: text("end_time_local").notNull(),
    behavior: text("behavior", { enum: ["full_silence", "reduced_volume"] })
      .notNull()
      .default("full_silence"),
    config: jsonb("config").notNull().default({}),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("silence_policies_tenant_target_idx").on(t.tenantId, t.targetType, t.targetId),
    tenantIsolation("silence_policies"),
  ],
).enableRLS();

/**
 * Compiled, signed manifest per device (§7.2 Manifest, D6): monotonic version,
 * 7-day resolved timeline, asset list with hash + signed URL, execution policies,
 * Ed25519 signature. Immutable — every change is a new version.
 */
export const manifests = pgTable(
  "manifests",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    version: bigint("version", { mode: "number" }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    timeline: jsonb("timeline").notNull(),
    assets: jsonb("assets").notNull().default([]),
    policies: jsonb("policies").notNull().default({}),
    /** Ed25519 over the canonical manifest body (§7.9 rule 6). */
    signature: text("signature").notNull(),
    compiledAt: timestamp("compiled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("manifests_device_version_idx").on(t.deviceId, t.version),
    index("manifests_tenant_idx").on(t.tenantId),
    tenantIsolation("manifests"),
  ],
).enableRLS();

/** Compilation queue mirror (§7.2 CompilationJob) — incremental by design. */
export const compilationJobs = pgTable(
  "compilation_jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    /** Affected device ids + reason (schedule change, license expiry, timezone…). */
    scope: jsonb("scope").notNull().default({}),
    reason: text("reason").notNull(),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] })
      .notNull()
      .default("queued"),
    error: text("error"),
    ...auditFields(),
  },
  (t) => [index("compilation_jobs_status_idx").on(t.status, t.createdAt)],
);
