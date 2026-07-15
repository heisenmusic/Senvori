import {
  bigint,
  boolean,
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
  varchar,
} from "drizzle-orm/pg-core";
import {
  archivedAt,
  auditFields,
  id,
  tenantIsolation,
  tenantIsolationSharedRead,
} from "./_helpers";
import { voiceProfiles } from "./ai";
import { users } from "./identity";
import { countries, tenants } from "./tenancy";

/**
 * Catalog domain schema — SENVORI_CORE_DOMAINS.md §4.
 *
 * Universal media library. `tenant_id` is NULLABLE on shareable tables: platform
 * rows (origin senvori_catalog / marketplace) have NULL and are readable by every
 * tenant via the shared-read RLS policy; availability is ALWAYS a Licensing query,
 * never implied by visibility (D10).
 */

/** Media unit (§4.2). Immutable once ready; fixes create a superseding asset. */
export const assets = pgTable(
  "assets",
  {
    id: id(),
    /** NULL = platform-scope asset (senvori_catalog / marketplace origin). */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["track", "announcement", "video", "image", "signage_bundle"],
    }).notNull(),
    status: text("status", {
      enum: ["uploading", "processing", "ready", "failed", "archived"],
    })
      .notNull()
      .default("uploading"),
    /** Immutable provenance, traced end-to-end to proof-of-play (§4.9 rule 8). */
    origin: text("origin", {
      enum: ["tenant_upload", "senvori_catalog", "marketplace", "ai_generated"],
    }).notNull(),
    /** Mandatory global metadata (Principle 6). */
    language: text("language").notNull(),
    originCountry: varchar("origin_country", { length: 2 })
      .notNull()
      .references(() => countries.code),
    title: text("title").notNull(),
    durationMs: integer("duration_ms"),
    /** sha256 of the source media — dedup + integrity chain (D6/D7). */
    sourceHash: text("source_hash"),
    explicit: boolean("explicit").notNull().default(false),
    /** New version of a corrected asset (§4.9 rule 2). */
    supersedesId: uuid("supersedes_id"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("assets_tenant_type_status_idx").on(t.tenantId, t.type, t.status),
    index("assets_source_hash_idx").on(t.sourceHash),
    index("assets_language_idx").on(t.language),
    ...tenantIsolationSharedRead("assets"),
  ],
).enableRLS();

/** Music extension of Asset (§4.2 Track). */
export const tracks = pgTable(
  "tracks",
  {
    assetId: uuid("asset_id")
      .primaryKey()
      .references(() => assets.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    isrc: text("isrc"),
    artist: text("artist").notNull(),
    album: text("album"),
    genres: text("genres").array().notNull().default([]),
    bpm: smallint("bpm"),
    /** 1–5 energy scale used by smart playlists (§6.2). */
    energy: smallint("energy"),
    releaseYear: smallint("release_year"),
  },
  (t) => [
    index("tracks_isrc_idx").on(t.isrc),
    index("tracks_artist_idx").on(t.artist),
    ...tenantIsolationSharedRead("tracks"),
  ],
).enableRLS();

/** Voice/spot extension of Asset (§4.2 Announcement). */
export const announcements = pgTable(
  "announcements",
  {
    assetId: uuid("asset_id")
      .primaryKey()
      .references(() => assets.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    sourceText: text("source_text"),
    /** Set when TTS-generated (§14) — voice is licensable content (§5.9 rule 5). */
    voiceProfileId: uuid("voice_profile_id").references(() => voiceProfiles.id),
    category: text("category", { enum: ["institutional", "promo", "safety"] })
      .notNull()
      .default("institutional"),
  },
  () => [...tenantIsolationSharedRead("announcements")],
).enableRLS();

/** Multipart upload session with presigned URLs — R2 (§4.2, D7). */
export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "completed", "aborted", "expired"] })
      .notNull()
      .default("pending"),
    parts: jsonb("parts").notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditFields(),
  },
  (t) => [index("uploads_tenant_status_idx").on(t.tenantId, t.status), tenantIsolation("uploads")],
).enableRLS();

/** Media pipeline queue item (§4.2 TranscodeJob) — BullMQ mirror for audit. */
export const transcodeJobs = pgTable(
  "transcode_jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    profile: text("profile").notNull(),
    status: text("status", { enum: ["queued", "running", "completed", "failed"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    ...auditFields(),
  },
  (t) => [
    index("transcode_jobs_status_idx").on(t.status, t.createdAt),
    index("transcode_jobs_asset_idx").on(t.assetId),
    ...tenantIsolationSharedRead("transcode_jobs"),
  ],
).enableRLS();

/** Pipeline output per profile (§4.2 Rendition) — hash-verified by the player. */
export const renditions = pgTable(
  "renditions",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    /** aac_standard, aac_low, mp4_1080, webp_thumb… (§4.9 rule 5). */
    profile: text("profile").notNull(),
    storageKey: text("storage_key").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    hash: text("hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("renditions_asset_profile_idx").on(t.assetId, t.profile),
    ...tenantIsolationSharedRead("renditions"),
  ],
).enableRLS();

/** Curated taxonomy (§4.2 Category) — names translated via entity_translations. */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    /** Which asset types this category applies to. */
    assetTypes: text("asset_types").array().notNull().default([]),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("categories_tenant_slug_idx").on(t.tenantId, t.slug),
    ...tenantIsolationSharedRead("categories"),
  ],
).enableRLS();

/** Free-form tag (§4.2). */
export const tags = pgTable(
  "tags",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_tenant_name_idx").on(t.tenantId, t.name), tenantIsolation("tags")],
).enableRLS();

/** Logical folder for library organization (§4.2 Collection). */
export const collections = pgTable(
  "collections",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("collections_tenant_idx").on(t.tenantId), tenantIsolation("collections")],
).enableRLS();

/** N:N asset ↔ category. */
export const assetCategories = pgTable(
  "asset_categories",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.assetId, t.categoryId] }),
    ...tenantIsolationSharedRead("asset_categories"),
  ],
).enableRLS();

/** N:N asset ↔ tag. */
export const assetTags = pgTable(
  "asset_tags",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.tagId] }), tenantIsolation("asset_tags")],
).enableRLS();

/** N:N collection ↔ asset. */
export const collectionAssets = pgTable(
  "collection_assets",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.assetId] }),
    tenantIsolation("collection_assets"),
  ],
).enableRLS();
