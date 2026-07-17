import { boolean, date, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";
import { playlists, playlistVersions } from "./playlists";
import { tenants } from "./tenancy";
import { users } from "./identity";

/**
 * Scheduling Runtime — Sprint 08 (§6/§7). A *schedule assignment* binds a
 * published program to a target scope for a local-time window on given weekdays,
 * with an explicit priority. This is intentionally NOT the RRULE/manifest model
 * in `scheduling.ts` (that is the future device-compilation layer, ADR-08-01):
 * assignments use a small, explicit days-of-week + local-window vocabulary so the
 * resolver stays a pure, deterministic function (no cron/rule language).
 */

const targetTypes = ["tenant", "group", "sync_group", "unit"] as const;

export const scheduleAssignments = pgTable(
  "schedule_assignments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    /** Pin a published version; null ⇒ the program's current published version. */
    programVersionId: uuid("program_version_id").references(() => playlistVersions.id, {
      onDelete: "set null",
    }),
    targetType: text("target_type", { enum: targetTypes }).notNull(),
    /** unit/group/sync-group id, or the tenant id for the tenant default. */
    targetId: text("target_id").notNull(),
    priority: integer("priority").notNull().default(0),
    /** Local weekdays 0=Sun…6=Sat; empty ⇒ every day. */
    daysOfWeek: integer("days_of_week").array().notNull().default([]),
    startTimeLocal: text("start_time_local").notNull().default("00:00"),
    endTimeLocal: text("end_time_local").notNull().default("23:59"),
    validFrom: date("valid_from", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("schedule_assignments_tenant_target_idx").on(t.tenantId, t.targetType, t.targetId),
    index("schedule_assignments_tenant_active_idx").on(t.tenantId, t.active),
    index("schedule_assignments_program_idx").on(t.programId),
    tenantIsolation("schedule_assignments"),
  ],
).enableRLS();

/**
 * Local events — Sprint 08 (§9/§10). A *local event* layers over the resolved
 * base program for a target scope within a local-time trigger window: it can
 * `insert` an asset at an offset, `overlay` (mix, optionally ducking the base),
 * or `interrupt` (replace the base for its duration). Three categories share the
 * mechanism — an editorial `local_event`, a `campaign_slot`, and an `emergency`
 * (which overrides everything else). Events map to deterministic effective-plan
 * overlays by the pure `local-events` resolver — no audio is produced here (§35).
 */

const eventTargetTypes = ["tenant", "group", "sync_group", "unit"] as const;
const eventKinds = ["insert", "overlay", "interrupt"] as const;
const eventCategories = ["local_event", "campaign_slot", "emergency"] as const;

export const localEvents = pgTable(
  "local_events",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** The asset injected/overlaid/interrupted with; null ⇒ base ducking only. */
    assetId: uuid("asset_id"),
    targetType: text("target_type", { enum: eventTargetTypes }).notNull(),
    targetId: text("target_id").notNull(),
    kind: text("kind", { enum: eventKinds }).notNull(),
    category: text("category", { enum: eventCategories }).notNull().default("local_event"),
    /** Higher wins when two events collide at the same offset. */
    priority: integer("priority").notNull().default(0),
    /** Local weekdays 0=Sun…6=Sat; empty ⇒ every day. */
    daysOfWeek: integer("days_of_week").array().notNull().default([]),
    /** Local trigger window "HH:mm"; the event is in effect when now ∈ [start,end). */
    startTimeLocal: text("start_time_local").notNull().default("00:00"),
    endTimeLocal: text("end_time_local").notNull().default("23:59"),
    /** Overlay geometry within the effective plan (ms). */
    startOffsetMs: integer("start_offset_ms").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    /** For `overlay`: attenuation applied to the base bed, in negative dB. */
    duckingDb: integer("ducking_db"),
    validFrom: date("valid_from", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("local_events_tenant_target_idx").on(t.tenantId, t.targetType, t.targetId),
    index("local_events_tenant_active_idx").on(t.tenantId, t.active),
    index("local_events_category_idx").on(t.tenantId, t.category),
    tenantIsolation("local_events"),
  ],
).enableRLS();
