import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  archivedAt,
  auditFields,
  id,
  tenantIsolation,
  tenantIsolationSharedRead,
} from "./_helpers";
import { users } from "./identity";
import { tenants } from "./tenancy";

/**
 * Analytics domain schema — SENVORI_CORE_DOMAINS.md §13 (D12).
 *
 * Proof-of-play is the auditable currency of Licensing, Retail Media and
 * Marketplace: never invented, never interpolated. Event tables use a composite
 * PK (id, occurred_at) and are converted to time-partitioned tables by a custom
 * migration (D3: partitioned in the MVP; ClickHouse arrives in phase 2 without
 * changing contracts). Event ids come FROM THE DEVICE (idempotency key), and
 * dimension references are plain UUIDs on purpose — no FK overhead on the hot
 * ingestion path, and events must survive dimension archival.
 */

/** Proof-of-play (§13.2 PlaybackEvent) — one row per execution. */
export const playbackEvents = pgTable(
  "playback_events",
  {
    /** event_id generated on the device — dedup key (§13.9 rule 2). */
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    unitId: uuid("unit_id").notNull(),
    zoneId: uuid("zone_id"),
    assetId: uuid("asset_id").notNull(),
    /** playlist/campaign/layer/manifest_version at execution time. */
    context: jsonb("context").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Partition key — equals started_at at ingestion. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    completionPct: smallint("completion_pct"),
    volume: smallint("volume"),
    /** Server-side clock-skew adjustment, original preserved (§13.9 rule 3). */
    clockSkewMs: integer("clock_skew_ms"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.occurredAt] }),
    index("playback_events_tenant_time_idx").on(t.tenantId, t.occurredAt),
    index("playback_events_asset_time_idx").on(t.assetId, t.occurredAt),
    index("playback_events_device_time_idx").on(t.deviceId, t.occurredAt),
    tenantIsolation("playback_events"),
  ],
).enableRLS();

/** Heartbeat history (§13.2 DeviceMetricEvent) — the Fleet keeps only the hot row. */
export const deviceMetricEvents = pgTable(
  "device_metric_events",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    metrics: jsonb("metrics").notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.occurredAt] }),
    index("device_metric_events_device_time_idx").on(t.deviceId, t.occurredAt),
    tenantIsolation("device_metric_events"),
  ],
).enableRLS();

/** Player errors (§13.2 PlayerErrorEvent) — feeds OTA failure rates (§13.9 rule 9). */
export const playerErrorEvents = pgTable(
  "player_error_events",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull(),
    appVersion: text("app_version"),
    detail: jsonb("detail").notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.occurredAt] }),
    index("player_error_events_kind_idx").on(t.kind, t.occurredAt),
    tenantIsolation("player_error_events"),
  ],
).enableRLS();

/** Ingestion batch bookkeeping (§13.2 IngestionBatch). */
export const ingestionBatches = pgTable(
  "ingestion_batches",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull(),
    eventCount: integer("event_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    window: jsonb("window").notNull().default({}),
    status: text("status", { enum: ["received", "stored", "failed"] })
      .notNull()
      .default("received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ingestion_batches_device_idx").on(t.deviceId, t.createdAt),
    tenantIsolation("ingestion_batches"),
  ],
).enableRLS();

/**
 * Hour/day aggregations (§13.2 MetricRollup) — permanent, while raw events have
 * bounded retention (§13.9 rule 4). `dimensions_hash` makes the tuple indexable.
 */
export const metricRollups = pgTable(
  "metric_rollups",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    granularity: text("granularity", { enum: ["hour", "day"] }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    dimensions: jsonb("dimensions").notNull().default({}),
    dimensionsHash: text("dimensions_hash").notNull(),
    value: bigint("value", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("metric_rollups_unique_idx").on(
      t.tenantId,
      t.metric,
      t.granularity,
      t.periodStart,
      t.dimensionsHash,
    ),
    tenantIsolation("metric_rollups"),
  ],
).enableRLS();

/** Report definition (§13.2 ReportTemplate) — platform + tenant custom. */
export const reportTemplates = pgTable(
  "report_templates",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    definition: jsonb("definition").notNull().default({}),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  () => [...tenantIsolationSharedRead("report_templates")],
).enableRLS();

/** Materialized report (§13.2 Report) — immutable once submitted (§13.9 rule 7). */
export const reports = pgTable(
  "reports",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => reportTemplates.id),
    params: jsonb("params").notNull().default({}),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    format: text("format", { enum: ["web", "csv", "pdf"] })
      .notNull()
      .default("web"),
    /** Report is rendered in the recipient's locale (§13.9 rule 10). */
    locale: text("locale").notNull(),
    status: text("status", { enum: ["queued", "generating", "ready", "failed", "submitted"] })
      .notNull()
      .default("queued"),
    artifactKey: text("artifact_key"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditFields(),
  },
  (t) => [index("reports_tenant_status_idx").on(t.tenantId, t.status), tenantIsolation("reports")],
).enableRLS();

/** Recurring report schedule (§13.2 ReportSchedule) — RRULE cadence. */
export const reportSchedules = pgTable(
  "report_schedules",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => reportTemplates.id),
    rrule: text("rrule").notNull(),
    recipients: jsonb("recipients").notNull().default([]),
    locale: text("locale").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("report_schedules_tenant_idx").on(t.tenantId), tenantIsolation("report_schedules")],
).enableRLS();

/** Saved analytical views per user (§13.2 SavedView). */
export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    config: jsonb("config").notNull().default({}),
    ...auditFields(),
  },
  (t) => [index("saved_views_user_idx").on(t.userId), tenantIsolation("saved_views")],
).enableRLS();

/** Export with audit trail (§13.2 Export / §13.9 rule 8). Const is `dataExports`
 * because `exports` is reserved at CJS module scope; the DB table stays "exports". */
export const dataExports = pgTable(
  "exports",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    params: jsonb("params").notNull().default({}),
    artifactKey: text("artifact_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exports_tenant_idx").on(t.tenantId, t.createdAt), tenantIsolation("exports")],
).enableRLS();
