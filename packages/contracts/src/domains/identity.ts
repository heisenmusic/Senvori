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
