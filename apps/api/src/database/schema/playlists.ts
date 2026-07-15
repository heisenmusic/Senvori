import {
  index,
  integer,
  jsonb,
  pgTable,
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
import { generationJobs } from "./ai";
import { assets } from "./catalog";
import { users } from "./identity";
import { tenants } from "./tenancy";

/**
 * Playlists domain schema — SENVORI_CORE_DOMAINS.md §6.
 * Manual, smart and AI-generated playlists + curated packs. Resolution always
 * filters by Licensing availability; published output is snapshotted for audit.
 */

/** Playable sequence (§6.2). Names/descriptions translate via entity_translations. */
export const playlists = pgTable(
  "playlists",
  {
    id: id(),
    /** NULL = platform-curated playlist (Senvori catalog / marketplace pack content). */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["manual", "smart", "generated"] }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    ownerId: uuid("owner_id").references(() => users.id),
    targetEnergy: smallint("target_energy"),
    imageAssetId: uuid("image_asset_id").references(() => assets.id),
    /** Set for `generated` playlists (§6.2) — carries the AI rationale trail. */
    generationJobId: uuid("generation_job_id").references(() => generationJobs.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("playlists_tenant_status_idx").on(t.tenantId, t.status),
    ...tenantIsolationSharedRead("playlists"),
  ],
).enableRLS();

/** Ordered item of a manual playlist (§6.2). */
export const playlistItems = pgTable(
  "playlist_items",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("playlist_items_position_idx").on(t.playlistId, t.position),
    index("playlist_items_asset_idx").on(t.assetId),
    ...tenantIsolationSharedRead("playlist_items"),
  ],
).enableRLS();

/** Dynamic criteria of a smart playlist (§6.2 SmartRule) — 1:1 with playlist. */
export const smartRules = pgTable(
  "smart_rules",
  {
    playlistId: uuid("playlist_id")
      .primaryKey()
      .references(() => playlists.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    /** genres, categories, energy min/max, BPM, decades, languages, tags… */
    criteria: jsonb("criteria").notNull().default({}),
    targetDurationMs: integer("target_duration_ms"),
    ordering: text("ordering", { enum: ["weighted_shuffle", "energy_asc", "energy_desc"] })
      .notNull()
      .default("weighted_shuffle"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [...tenantIsolationSharedRead("smart_rules")],
).enableRLS();

/**
 * Anti-repetition execution policy (§6.2 RotationPolicy) — one per tenant;
 * the manifest carries it so the local rule engine can honor it offline.
 */
export const rotationPolicies = pgTable(
  "rotation_policies",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    minTrackGapMinutes: integer("min_track_gap_minutes").notNull().default(180),
    minArtistGapMinutes: integer("min_artist_gap_minutes").notNull().default(45),
    maxPlaysPerDay: integer("max_plays_per_day"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rotation_policies_tenant_idx").on(t.tenantId),
    tenantIsolation("rotation_policies"),
  ],
).enableRLS();

/** Curated product: named collection of playlists (§6.2 Pack) — marketplace unit. */
export const packs = pgTable(
  "packs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    vertical: text("vertical"),
    imageAssetId: uuid("image_asset_id").references(() => assets.id),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("packs_tenant_status_idx").on(t.tenantId, t.status),
    ...tenantIsolationSharedRead("packs"),
  ],
).enableRLS();

/** N:N pack ↔ playlist, ordered. */
export const packItems = pgTable(
  "pack_items",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    packId: uuid("pack_id")
      .notNull()
      .references(() => packs.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("pack_items_pack_playlist_idx").on(t.packId, t.playlistId),
    ...tenantIsolationSharedRead("pack_items"),
  ],
).enableRLS();

/**
 * Immutable resolution snapshot (§6.2 PlaylistVersion): what actually shipped
 * to a unit — reproducibility + audit against proof-of-play (§6.9 rule 6).
 */
export const playlistVersions = pgTable(
  "playlist_versions",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Resolved asset ids in order + shuffle seed. */
    resolvedItems: jsonb("resolved_items").notNull().default([]),
    /** Resolution context: unit, territory, licensing snapshot time. */
    context: jsonb("context").notNull().default({}),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("playlist_versions_playlist_version_idx").on(t.playlistId, t.version),
    ...tenantIsolationSharedRead("playlist_versions"),
  ],
).enableRLS();
