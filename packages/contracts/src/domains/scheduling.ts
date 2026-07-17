import { z } from "zod";
import { timezoneSchema, uuidSchema } from "../common/primitives.js";

/**
 * Scheduling Runtime contracts (Sprint 08 · §23). Schedule assignments bind a
 * published program to a target scope on given weekdays in a local-time window,
 * with an explicit priority. The resolver decides the active program per unit +
 * local date/time; the effective plan separates the shared base hash from the
 * per-unit effective hash. Audio is never processed here (§35).
 */

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const localTime = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "expected HH:mm (00:00–23:59)");
const weekday = z.number().int().min(0).max(6);

export const scheduleTargetTypeSchema = z.enum(["tenant", "group", "sync_group", "unit"]);
export type ScheduleTargetType = z.infer<typeof scheduleTargetTypeSchema>;

/* ----------------------------------------------------------- assignments -- */

export const createScheduleAssignmentSchema = z
  .object({
    programId: uuidSchema,
    programVersionId: uuidSchema.nullable().optional(),
    targetType: scheduleTargetTypeSchema,
    targetId: z.string().min(1),
    priority: z.number().int().min(0).max(1000).default(0),
    daysOfWeek: z.array(weekday).max(7).default([]),
    startTimeLocal: localTime.default("00:00"),
    endTimeLocal: localTime.default("23:59"),
    validFrom: localDate.nullable().optional(),
    validUntil: localDate.nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine((o) => o.startTimeLocal < o.endTimeLocal, {
    message: "startTimeLocal must be before endTimeLocal (no cross-midnight windows in v1)",
  });
export type CreateScheduleAssignmentInput = z.infer<typeof createScheduleAssignmentSchema>;

export const updateScheduleAssignmentSchema = z
  .object({
    priority: z.number().int().min(0).max(1000).optional(),
    daysOfWeek: z.array(weekday).max(7).optional(),
    startTimeLocal: localTime.optional(),
    endTimeLocal: localTime.optional(),
    validFrom: localDate.nullable().optional(),
    validUntil: localDate.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "at least one field is required" });
export type UpdateScheduleAssignmentInput = z.infer<typeof updateScheduleAssignmentSchema>;

export const scheduleAssignmentSchema = z.object({
  id: uuidSchema,
  programId: uuidSchema,
  programVersionId: uuidSchema.nullable(),
  targetType: scheduleTargetTypeSchema,
  targetId: z.string(),
  priority: z.number().int(),
  daysOfWeek: z.array(weekday),
  startTimeLocal: z.string(),
  endTimeLocal: z.string(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScheduleAssignmentDto = z.infer<typeof scheduleAssignmentSchema>;

export const scheduleAssignmentListSchema = z.object({
  items: z.array(scheduleAssignmentSchema),
  nextCursor: z.string().nullable(),
});

/* --------------------------------------------------- resolution & preview -- */

export const scheduleResolveRequestSchema = z.object({
  unitId: uuidSchema,
  syncGroupId: uuidSchema.nullable().optional(),
  groupIds: z.array(uuidSchema).max(50).default([]),
  timezone: timezoneSchema,
  localDate,
  localTime,
});
export type ScheduleResolveRequestInput = z.infer<typeof scheduleResolveRequestSchema>;

export const schedulingWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const scheduleResolutionSchema = z.object({
  selectedAssignmentId: uuidSchema.nullable(),
  selectedProgramId: uuidSchema.nullable(),
  selectedProgramVersionId: uuidSchema.nullable(),
  targetType: scheduleTargetTypeSchema.nullable(),
  reasonCode: z.string(),
  reason: z.string(),
  warnings: z.array(schedulingWarningSchema),
});
export type ScheduleResolutionDto = z.infer<typeof scheduleResolutionSchema>;

export const effectiveOverlaySchema = z.object({
  kind: z.enum(["insert", "overlay", "interrupt"]),
  assetId: uuidSchema.nullable(),
  startOffsetMs: z.number().int(),
  durationMs: z.number().int(),
  duckingDb: z.number().optional(),
  sourceReference: z.string(),
  reasonCode: z.string(),
});

export const effectivePlanSchema = z.object({
  unitId: uuidSchema,
  localDate: z.string(),
  timezone: z.string(),
  resolution: scheduleResolutionSchema,
  basePlanHash: z.string().nullable(),
  effectivePlanHash: z.string(),
  overlays: z.array(effectiveOverlaySchema),
  warnings: z.array(schedulingWarningSchema),
});
export type EffectivePlanDto = z.infer<typeof effectivePlanSchema>;
