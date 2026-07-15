import { z } from "zod";
import {
  countryCodeSchema,
  localeSchema,
  paginationQuerySchema,
  utcTimestampSchema,
  uuidSchema,
} from "../common/primitives.js";

/**
 * Catalog domain contracts — SENVORI_CORE_DOMAINS.md §4.
 *
 * The catalog is the operational base for everything the platform can play. This
 * sprint covers the media-asset foundation: secure direct upload, processing,
 * metadata and the library. Licensing is NOT modeled here — only minimal
 * DECLARED (unverified) provenance travels with an asset (`declaredRights`).
 */

/* ------------------------------------------------------------ vocabulary -- */

/** Asset kind (schema `assets.type`). Audio-first this sprint: track + announcement. */
export const assetTypeSchema = z.enum([
  "track",
  "announcement",
  "video",
  "image",
  "signage_bundle",
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/** Lifecycle state (schema `assets.status`). */
export const assetStatusSchema = z.enum(["uploading", "processing", "ready", "failed", "archived"]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

/** Immutable provenance (schema `assets.origin`). */
export const assetOriginSchema = z.enum([
  "tenant_upload",
  "senvori_catalog",
  "marketplace",
  "ai_generated",
]);
export type AssetOrigin = z.infer<typeof assetOriginSchema>;

/** Announcement sub-category (schema `announcements.category`). */
export const announcementCategorySchema = z.enum(["institutional", "promo", "safety"]);

/**
 * Accepted audio upload content types → allowed extensions. Single source of
 * truth for MIME/extension validation on the backend and the dashboard picker.
 * Never trust the browser MIME alone — the backend also checks the signature.
 */
export const AUDIO_CONTENT_TYPES: Record<string, readonly string[]> = {
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/mpeg": [".mp3"],
  "audio/aac": [".aac"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/x-m4a": [".m4a"],
  "audio/flac": [".flac"],
  "audio/x-flac": [".flac"],
};

export const audioContentTypeSchema = z.enum(
  Object.keys(AUDIO_CONTENT_TYPES) as [string, ...string[]],
);

/** SHA-256 hex digest (64 lowercase hex chars). */
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "expected a sha-256 hex digest");

/* -------------------------------------------------------------- metadata -- */

/** Technical metadata extracted by processing (schema `assets.media_info`). */
export const mediaInfoSchema = z.object({
  container: z.string().optional(),
  codec: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  sampleRate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  bitrate: z.number().int().positive().optional(),
  lossless: z.boolean().optional(),
  /** Integrated loudness if measured; null when not computed this sprint. */
  loudnessLufs: z.number().optional(),
  probedAt: utcTimestampSchema.optional(),
});
export type MediaInfo = z.infer<typeof mediaInfoSchema>;

/**
 * Minimal DECLARED provenance (schema `assets.declared_rights`). Always treated
 * as unverified — never a legal assertion of clearance. Full Licensing (rights
 * holders, licenses, scopes, availability) is a separate domain, not this sprint.
 */
export const declaredRightsSchema = z.object({
  /** Who the uploader says holds the rights. */
  rightsHolderName: z.string().max(200).optional(),
  /** Declared license type, e.g. "own_content", "royalty_free", "licensed". */
  licenseType: z.string().max(80).optional(),
  /** Declared territories (ISO 3166-1 alpha-2) or empty for unspecified. */
  territories: z.array(countryCodeSchema).optional(),
  availabilityStart: utcTimestampSchema.optional(),
  availabilityEnd: utcTimestampSchema.optional(),
  /** Reference to a license document (URL or internal ref) — not verified. */
  referenceDocument: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
});
export type DeclaredRights = z.infer<typeof declaredRightsSchema>;

/* ---------------------------------------------------------------- upload -- */

/**
 * POST /v1/catalog/uploads — open a direct-to-storage upload session. Metadata
 * is intentionally light (progressive disclosure): the rest is edited later.
 */
export const createUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: audioContentTypeSchema,
  sizeBytes: z.number().int().positive(),
  /** Client-computed integrity digest, re-verified on confirm. */
  checksumSha256: sha256Schema,
  type: assetTypeSchema.default("track"),
  title: z.string().min(1).max(300).optional(),
  language: localeSchema,
  originCountry: countryCodeSchema,
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;

/** The opaque instruction the client uses to send the file to storage. */
export const uploadTicketSchema = z.object({
  uploadId: uuidSchema,
  assetId: uuidSchema,
  /** Opaque URL — never a storage-internal path. */
  url: z.string(),
  method: z.enum(["PUT", "POST"]),
  headers: z.record(z.string(), z.string()),
  expiresAt: utcTimestampSchema,
});
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

/** POST /v1/catalog/uploads/:id/confirm — no body; idempotent. */
export const confirmUploadSchema = z.object({}).optional();

/* ------------------------------------------------------------------ item -- */

/** A catalog item (an Asset with its type extension + declared metadata). */
export const catalogItemSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema.nullable(),
  type: assetTypeSchema,
  status: assetStatusSchema,
  origin: assetOriginSchema,
  title: z.string(),
  language: z.string(),
  originCountry: countryCodeSchema,
  durationMs: z.number().int().nullable(),
  explicit: z.boolean(),
  sourceHash: z.string().nullable(),
  createdBy: uuidSchema.nullable(),
  mediaInfo: mediaInfoSchema.nullable(),
  declaredRights: declaredRightsSchema.nullable(),
  /** Track extension (present when type = track). */
  track: z
    .object({
      isrc: z.string().nullable(),
      artist: z.string(),
      album: z.string().nullable(),
      genres: z.array(z.string()),
      bpm: z.number().int().nullable(),
      energy: z.number().int().nullable(),
      releaseYear: z.number().int().nullable(),
    })
    .nullable()
    .optional(),
  /** Announcement extension (present when type = announcement). */
  announcement: z
    .object({
      category: announcementCategorySchema,
      sourceText: z.string().nullable(),
    })
    .nullable()
    .optional(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
  archivedAt: utcTimestampSchema.nullable(),
});
export type CatalogItemDto = z.infer<typeof catalogItemSchema>;

/** GET /v1/catalog/items — pagination + search + filters (§4.6). */
export const catalogItemListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  type: assetTypeSchema.optional(),
  status: assetStatusSchema.optional(),
  origin: assetOriginSchema.optional(),
  language: z.string().optional(),
  explicit: z.stringbool().optional(),
});
export type CatalogItemListQuery = z.infer<typeof catalogItemListQuerySchema>;

/** PATCH /v1/catalog/items/:id — edit permitted metadata (progressive). */
export const updateCatalogItemSchema = z
  .object({
    title: z.string().min(1).max(300),
    language: localeSchema,
    explicit: z.boolean(),
    declaredRights: declaredRightsSchema,
    track: z
      .object({
        isrc: z.string().max(15).nullable(),
        artist: z.string().min(1).max(300),
        album: z.string().max(300).nullable(),
        genres: z.array(z.string().max(60)),
        bpm: z.number().int().min(20).max(400).nullable(),
        energy: z.number().int().min(1).max(5).nullable(),
        releaseYear: z.number().int().min(1900).max(2200).nullable(),
      })
      .partial(),
    announcement: z
      .object({
        category: announcementCategorySchema,
        sourceText: z.string().max(5000).nullable(),
      })
      .partial(),
  })
  .partial();
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;

/** Authorized, short-lived download for a ready asset. */
export const downloadTicketSchema = z.object({
  url: z.string(),
  expiresAt: utcTimestampSchema,
});
export type DownloadTicket = z.infer<typeof downloadTicketSchema>;

/** Catalog-specific error codes (stable, for typed client handling). */
export const CATALOG_ERROR_CODES = [
  "UPLOAD_NOT_FOUND",
  "ITEM_NOT_FOUND",
  "INVALID_CONTENT_TYPE",
  "FILE_TOO_LARGE",
  "CHECKSUM_MISMATCH",
  "OBJECT_NOT_FOUND",
  "UPLOAD_ALREADY_CONFIRMED",
  "INVALID_STATE_TRANSITION",
  "ASSET_NOT_READY",
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];
