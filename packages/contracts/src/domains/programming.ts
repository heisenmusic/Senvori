import { z } from "zod";
import {
  paginatedSchema,
  paginationQuerySchema,
  timezoneSchema,
  uuidSchema,
} from "../common/primitives.js";

/**
 * Programming domain contracts (Sprint 06 · §18). Product-language surface over
 * the existing `playlists` schema (a "program" is a playlist of type manual/smart;
 * an immutable "version" is a `playlist_version`). Audio-first. Preview never
 * accepts a tenant id — it derives from the authenticated context.
 */

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const localTimeSchema = z.string().regex(/^([01]?\d|2[0-4]):[0-5]\d$/, "expected HH:mm");

export const programStatusSchema = z.enum(["draft", "published", "archived"]);
export type ProgramStatus = z.infer<typeof programStatusSchema>;

export const programTypeSchema = z.enum(["manual", "smart"]);
export type ProgramType = z.infer<typeof programTypeSchema>;

/* ------------------------------------------------------------- mutations -- */

export const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: programTypeSchema.default("manual"),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "at least one field is required" });
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

/** Ordered content items of a manual program (asset ids from the Library). */
export const setProgramItemsSchema = z.object({
  assetIds: z.array(uuidSchema).max(2000),
});
export type SetProgramItemsInput = z.infer<typeof setProgramItemsSchema>;

/** A content item of a program, with the Library metadata needed to display it. */
export const programItemSchema = z.object({
  position: z.number().int(),
  assetId: uuidSchema,
  title: z.string(),
  artist: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  type: z.string(),
  status: z.string(),
});
export type ProgramItemDto = z.infer<typeof programItemSchema>;

/**
 * Tenant-level rotation policy (maps to `rotation_policies`, one per tenant).
 * Sprint 07 adds the Intelligent Programming Engine knobs — all optional and
 * off (null) by default, so existing policies keep their exact behaviour.
 */
export const upsertRotationPolicySchema = z.object({
  minTrackGapMinutes: z.number().int().min(0).max(1440),
  minArtistGapMinutes: z.number().int().min(0).max(1440),
  maxPlaysPerDay: z.number().int().min(1).max(10000).nullable().optional(),
  /** Minutes between two tracks sharing a category; null/0 ⇒ off (Sprint 07). */
  minCategoryGapMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  /** Cross-day fatigue penalty; 0/null ⇒ off (Sprint 07). */
  fatigueWeightPenalty: z.number().min(0).max(10).nullable().optional(),
  /** Affinity-aware weighting strength in [0,1]; 0/null ⇒ off (Sprint 07). */
  affinityStrength: z.number().min(0).max(1).nullable().optional(),
  /** Cross-day fatigue look-back, in local days; null ⇒ service default (Sprint 07B). */
  historyLookbackDays: z.number().int().min(0).max(90).nullable().optional(),
  /** Carry the previous day's tail across the seam; null ⇒ service default (Sprint 07B). */
  crossDayContinuity: z.boolean().nullable().optional(),
});
export type UpsertRotationPolicyInput = z.infer<typeof upsertRotationPolicySchema>;

export const rotationPolicySchema = z.object({
  minTrackGapMinutes: z.number().int(),
  minArtistGapMinutes: z.number().int(),
  maxPlaysPerDay: z.number().int().nullable(),
  minCategoryGapMinutes: z.number().int().nullable(),
  fatigueWeightPenalty: z.number().nullable(),
  affinityStrength: z.number().nullable(),
  historyLookbackDays: z.number().int().nullable(),
  crossDayContinuity: z.boolean().nullable(),
});
export type RotationPolicyDto = z.infer<typeof rotationPolicySchema>;

/* ------------------------------------------------------- rotation pairs -- */

/** A configured avoid-pair (Sprint 07B · §11) — tenant-wide, bidirectional. */
export const rotationPairSchema = z.object({
  id: uuidSchema,
  assetA: uuidSchema,
  assetB: uuidSchema,
  assetATitle: z.string().nullable(),
  assetBTitle: z.string().nullable(),
  minGapMinutes: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RotationPairDto = z.infer<typeof rotationPairSchema>;

export const createRotationPairSchema = z
  .object({
    assetA: uuidSchema,
    assetB: uuidSchema,
    minGapMinutes: z.number().int().min(1).max(1440).default(60),
    active: z.boolean().default(true),
  })
  .refine((o) => o.assetA !== o.assetB, { message: "a pair needs two different tracks" });
export type CreateRotationPairInput = z.infer<typeof createRotationPairSchema>;

export const updateRotationPairSchema = z
  .object({
    minGapMinutes: z.number().int().min(1).max(1440).optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "at least one field is required" });
export type UpdateRotationPairInput = z.infer<typeof updateRotationPairSchema>;

export const rotationPairListSchema = z.object({
  items: z.array(rotationPairSchema),
  nextCursor: z.string().nullable(),
});

/** Assignment of a program to a scope (maps to `schedules`). */
export const createAssignmentSchema = z.object({
  targetType: z.enum(["tenant", "country", "brand", "group", "unit", "zone"]),
  targetId: z.string().min(1),
  validFrom: z.iso.datetime({ offset: true }).optional(),
  validUntil: z.iso.datetime({ offset: true }).optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

/* --------------------------------------------------------------- preview -- */

export const previewRequestSchema = z.object({
  /** Preview a published version; omit for the current draft config. */
  versionId: uuidSchema.optional(),
  /** Sync group / unit for the deterministic seed; validated to the tenant. */
  unitId: uuidSchema.optional(),
  timezone: timezoneSchema,
  localDate: localDateSchema,
  windowStartLocal: localTimeSchema.default("00:00"),
  windowEndLocal: localTimeSchema.default("24:00"),
});
export type PreviewRequestInput = z.infer<typeof previewRequestSchema>;

export const executionItemSchema = z.object({
  position: z.number().int(),
  assetId: uuidSchema.nullable(),
  title: z.string(),
  artist: z.string().nullable(),
  startOffsetMs: z.number().int(),
  durationMs: z.number().int(),
  source: z.string(),
  reason: z.string(),
});
export type ExecutionItemDto = z.infer<typeof executionItemSchema>;

export const programWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});
export type ProgramWarningDto = z.infer<typeof programWarningSchema>;

export const executionPlanSchema = z.object({
  compilerVersion: z.string(),
  timezone: z.string(),
  localDate: z.string(),
  windowStartUtc: z.string(),
  windowEndUtc: z.string(),
  totalDurationMs: z.number().int(),
  items: z.array(executionItemSchema),
  warnings: z.array(programWarningSchema),
  planHash: z.string(),
  stats: z.object({
    candidateCount: z.number().int(),
    itemCount: z.number().int(),
    relaxedRules: z.array(z.string()),
    fallbackCount: z.number().int(),
    /** Which intelligence layers shaped this plan (Sprint 07). */
    engine: z.object({
      fatigueApplied: z.boolean(),
      affinityApplied: z.boolean(),
      categoriesApplied: z.boolean(),
      avoidPairBlocks: z.number().int(),
    }),
  }),
});
export type ExecutionPlanDto = z.infer<typeof executionPlanSchema>;

/* ------------------------------------------------------------------ dtos -- */

export const programSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema.nullable(),
  type: programTypeSchema,
  name: z.string(),
  description: z.string().nullable(),
  status: programStatusSchema,
  publishedVersion: z.number().int().nullable(),
  itemCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type ProgramDto = z.infer<typeof programSchema>;

export const programVersionSchema = z.object({
  id: uuidSchema,
  programId: uuidSchema,
  version: z.number().int(),
  resolvedItems: z.array(uuidSchema),
  planHash: z.string().nullable(),
  compilerVersion: z.string().nullable(),
  publishedBy: uuidSchema.nullable(),
  resolvedAt: z.string(),
});
export type ProgramVersionDto = z.infer<typeof programVersionSchema>;

export const programListQuerySchema = paginationQuerySchema.extend({
  status: programStatusSchema.optional(),
  q: z.string().max(200).optional(),
});
export type ProgramListQuery = z.infer<typeof programListQuerySchema>;

export const programListSchema = paginatedSchema(programSchema);
export const programVersionListSchema = paginatedSchema(programVersionSchema);
