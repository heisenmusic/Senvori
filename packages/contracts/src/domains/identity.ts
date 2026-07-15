import { z } from "zod";
import { localeSchema, scopeSchema, utcTimestampSchema, uuidSchema } from "../common/primitives.js";

/**
 * Identity domain contracts — SENVORI_CORE_DOMAINS.md §1.
 * Foundation phase: read DTOs for the fundamental entities only.
 */

/** System roles (§0.4) — immutable, cover the MVP. */
export const systemRoleSchema = z.enum([
  "owner",
  "admin",
  "manager",
  "curator",
  "campaign_manager",
  "finance",
  "analyst",
  "unit_operator",
  "rights_manager",
  "provider",
  "sponsor",
  "support",
]);
export type SystemRole = z.infer<typeof systemRoleSchema>;

export const userStatusSchema = z.enum(["active", "suspended"]);

export const userSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.url().nullable(),
  locale: localeSchema.nullable(),
  status: userStatusSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type UserDto = z.infer<typeof userSchema>;

export const membershipStatusSchema = z.enum(["invited", "active", "suspended"]);

export const membershipSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  userId: uuidSchema,
  role: systemRoleSchema,
  status: membershipStatusSchema,
  createdAt: utcTimestampSchema,
});
export type MembershipDto = z.infer<typeof membershipSchema>;

export const roleAssignmentSchema = z.object({
  id: uuidSchema,
  membershipId: uuidSchema,
  role: systemRoleSchema,
  scope: scopeSchema,
  createdAt: utcTimestampSchema,
});
export type RoleAssignmentDto = z.infer<typeof roleAssignmentSchema>;

/**
 * Current-session identity — GET /v1/me (§1.6).
 * Effective permissions are the flattened grants for the active tenant.
 */
export const currentUserSchema = z.object({
  user: userSchema,
  tenantId: uuidSchema,
  membershipId: uuidSchema,
  role: systemRoleSchema,
  assignments: z.array(roleAssignmentSchema),
  permissions: z.array(z.string()),
});
export type CurrentUserDto = z.infer<typeof currentUserSchema>;

/** Membership list item with the embedded user (§1.6 GET /v1/members). */
export const membershipWithUserSchema = membershipSchema.extend({
  user: userSchema.pick({ id: true, name: true, email: true, image: true, status: true }),
});
export type MembershipWithUserDto = z.infer<typeof membershipWithUserSchema>;

/** PATCH /v1/me (§1.6). */
export const updateMeSchema = z.object({
  name: z.string().min(1).optional(),
  locale: localeSchema.nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

/** POST /v1/invitations (§1.6). Default scope is the whole tenant. */
export const inviteMemberSchema = z.object({
  email: z.email(),
  role: systemRoleSchema,
  scope: scopeSchema.optional(),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/** POST /v1/role-assignments (§1.6). */
export const assignRoleSchema = z.object({
  membershipId: uuidSchema,
  role: systemRoleSchema,
  scope: scopeSchema,
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

/** GET /v1/audit-logs — filterable trail (§1.6). */
export const auditLogEntrySchema = z.object({
  id: uuidSchema,
  actorType: z.enum(["user", "device", "system", "api_key"]),
  actorId: uuidSchema.nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  scopeType: z.string().nullable(),
  scopeId: z.string().nullable(),
  changes: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  occurredAt: utcTimestampSchema,
});
export type AuditLogEntryDto = z.infer<typeof auditLogEntrySchema>;
