import {
  boolean,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";
import { tenants } from "./tenancy";

/**
 * Identity domain schema — SENVORI_CORE_DOMAINS.md §1.
 *
 * Auth core tables double as the Better Auth model (D11): user/session/account/
 * verification/two_factor; memberships/invitations back the organization plugin,
 * mapped onto Tenancy (organization = tenant).
 *
 * RLS note: auth tables carry no RLS — authentication runs before any tenant
 * context exists, and `users` is global by design (§1.9 rule 1: one user, N
 * tenants). RBAC, API keys and the audit log ARE tenant-scoped and carry RLS.
 */

/** Global person (§1.2) — exists outside any tenant. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** User's own locale (Founding Principle 3). */
  locale: text("locale"),
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  ...auditFields(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Set by the Better Auth organization plugin: the tenant in focus. */
    activeOrganizationId: uuid("active_organization_id"),
    ...auditFields(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Authentication credential per provider (password lives here too). */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...auditFields(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/** Email verification / password reset tokens. */
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...auditFields(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

/** MFA factor (§1.2 MfaFactor) — Better Auth twoFactor plugin model. */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("two_factors_user_idx").on(t.userId)],
);

/**
 * User ↔ tenant link (§1.2 Membership). Better Auth organization "member".
 * TS property is `organizationId` (auth contract); SQL column is `tenant_id`.
 */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    status: text("status", { enum: ["invited", "active", "suspended"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_idx").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

/** Pending invitation (§1.2) — expires in 7 days (auth config). */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_tenant_idx").on(t.organizationId)],
);

/**
 * Role × membership × hierarchical scope (§1.2 RoleAssignment, §0.4).
 * `scope_id` is text: a UUID for tenant/brand/group/unit scopes or an ISO 3166
 * code for country scope. Authorization is always permission ∧ scope.
 */
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** System role key (§0.4) — immutable vocabulary, validated in contracts. */
    role: text("role").notNull(),
    scopeType: text("scope_type", { enum: ["tenant", "country", "brand", "group", "unit"] })
      .notNull()
      .default("tenant"),
    scopeId: text("scope_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_assignments_unique_idx").on(t.membershipId, t.role, t.scopeType, t.scopeId),
    index("role_assignments_tenant_idx").on(t.tenantId),
    tenantIsolation("role_assignments"),
  ],
).enableRLS();

/** Server-to-server integration credential (§1.2 ApiKey) — least privilege. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** Subset of permission keys `domain:resource:action` (§0.4). */
    permissions: text("permissions").array().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditFields(),
  },
  (t) => [index("api_keys_tenant_idx").on(t.tenantId), tenantIsolation("api_keys")],
).enableRLS();

/** SSO connection (§1.2 — phase 2 via WorkOS; schema reserved now). */
export const ssoConnections = pgTable(
  "sso_connections",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["saml", "oidc"] }).notNull(),
    emailDomain: text("email_domain").notNull(),
    config: jsonb("config").notNull().default({}),
    roleMapping: jsonb("role_mapping").$type<Record<string, string>>().notNull().default({}),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("disabled"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("sso_connections_domain_idx").on(t.emailDomain),
    tenantIsolation("sso_connections"),
  ],
).enableRLS();

/**
 * Immutable audit trail of administrative actions (§1.2, D12, LGPD/GDPR).
 * Written synchronously in the same transaction as the action (§1.9 rule 7).
 * Append-only: no update/delete path exists in the application.
 */
export const auditLogEntries = pgTable(
  "audit_log_entries",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorType: text("actor_type", { enum: ["user", "device", "system", "api_key"] }).notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    scopeType: text("scope_type"),
    scopeId: text("scope_id"),
    /** Summarized before/after diff — never full sensitive payloads. */
    changes: jsonb("changes"),
    ipAddress: inet("ip_address"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_tenant_time_idx").on(t.tenantId, t.occurredAt),
    index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_log_actor_idx").on(t.actorId),
    tenantIsolation("audit_log_entries"),
  ],
).enableRLS();
