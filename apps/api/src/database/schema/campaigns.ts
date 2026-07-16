import {
  boolean,
  date,
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
import { assets } from "./catalog";
import { users } from "./identity";
import { insertionOrders } from "./retail-media";
import { tenants, units } from "./tenancy";

/**
 * Campaigns domain schema — SENVORI_CORE_DOMAINS.md §8.
 * Messages with a goal and a deadline: locale versions, hierarchy segmentation,
 * rotation rules and an approval workflow. A global campaign auto-selects the
 * right locale version per unit (Principle 5).
 */

/** The campaign (§8.2). */
export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    objective: text("objective"),
    type: text("type", { enum: ["audio_spot", "signage", "mixed"] }).notNull(),
    status: text("status", {
      enum: ["draft", "in_review", "approved", "live", "paused", "completed", "archived"],
    })
      .notNull()
      .default("draft"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    /** Retail Media specialization (§10): sponsored campaigns carry the IO. */
    sponsored: boolean("sponsored").notNull().default(false),
    insertionOrderId: uuid("insertion_order_id").references(() => insertionOrders.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("campaigns_tenant_status_idx").on(t.tenantId, t.status),
    index("campaigns_io_idx").on(t.insertionOrderId),
    tenantIsolation("campaigns"),
  ],
).enableRLS();

/**
 * Locale/country version (§8.2 CampaignVersion). Immutable once the campaign
 * is approved — changes create a new revision (§8.9 rule 3).
 */
export const campaignVersions = pgTable(
  "campaign_versions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    /** Optional country restriction of this version. */
    countryCodes: text("country_codes").array(),
    revision: integer("revision").notNull().default(1),
    status: text("status", { enum: ["draft", "ready", "superseded"] })
      .notNull()
      .default("draft"),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("campaign_versions_unique_idx").on(t.campaignId, t.locale, t.revision),
    tenantIsolation("campaign_versions"),
  ],
).enableRLS();

/** Assets of a version (§8.2 CampaignAsset). */
export const campaignVersionAssets = pgTable(
  "campaign_version_assets",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => campaignVersions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    role: text("role", { enum: ["audio_spot", "signage_media", "thumbnail"] }).notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("campaign_version_assets_unique_idx").on(t.versionId, t.assetId, t.role),
    tenantIsolation("campaign_version_assets"),
  ],
).enableRLS();

/**
 * Airing window (§8.2 Flight): dates interpreted in each unit's LOCAL wall
 * clock — "Nov 24, 8am" is 8am in every store's own timezone (§8.9 rule 6).
 */
export const campaignFlights = pgTable(
  "campaign_flights",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /** Allowed dayparts in local time, e.g. [{ start: "08:00", end: "22:00" }]. */
    dayparts: jsonb("dayparts").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_flights_campaign_idx").on(t.campaignId),
    tenantIsolation("campaign_flights"),
  ],
).enableRLS();

/** Hierarchy segmentation (§8.2 Segment) — 1:1 with campaign. */
export const campaignSegments = pgTable(
  "campaign_segments",
  {
    campaignId: uuid("campaign_id")
      .primaryKey()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** { countries: [], brands: [], groups: [], units: [], tags: [] } */
    include: jsonb("include").notNull().default({}),
    exclude: jsonb("exclude").notNull().default({}),
    /** §8.9 rule 7: explicit behavior for units joining the segment mid-flight. */
    autoIncludeNewUnits: boolean("auto_include_new_units").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation("campaign_segments")],
).enableRLS();

/** Frequency & spacing (§8.2 RotationRule) — enforced by the local rule engine. */
export const campaignRotationRules = pgTable(
  "campaign_rotation_rules",
  {
    campaignId: uuid("campaign_id")
      .primaryKey()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    playsPerHour: integer("plays_per_hour").notNull().default(2),
    minGapMinutes: integer("min_gap_minutes").notNull().default(20),
    preferredPosition: text("preferred_position", { enum: ["any", "break_start", "break_end"] })
      .notNull()
      .default("any"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation("campaign_rotation_rules")],
).enableRLS();

/** Approval trail (§8.2 ApprovalRecord) — append-only. */
export const campaignApprovals = pgTable(
  "campaign_approvals",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["submitted", "approved", "rejected"] }).notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_approvals_campaign_idx").on(t.campaignId, t.createdAt),
    tenantIsolation("campaign_approvals"),
  ],
).enableRLS();

/**
 * Materialized distribution (§8.2 DistributionResolution): unit → selected
 * version, or exclusion + reason. Recomputed on tenancy/licensing events.
 */
export const campaignDistributionResolutions = pgTable(
  "campaign_distribution_resolutions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    versionId: uuid("version_id").references(() => campaignVersions.id),
    /** Set when the unit is excluded (no compatible locale version — §8.9 rule 2). */
    excludedReason: text("excluded_reason"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_distribution_unique_idx").on(t.campaignId, t.unitId),
    tenantIsolation("campaign_distribution_resolutions"),
  ],
).enableRLS();
