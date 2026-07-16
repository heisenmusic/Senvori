import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { archivedAt, auditFields, id, tenantIsolationSharedRead } from "./_helpers";
import { countries, tenants } from "./tenancy";

/**
 * Licensing domain schema — SENVORI_CORE_DOMAINS.md §5 (D10).
 *
 * Playability is ALWAYS a query over these tables — never an `if` in code.
 * Shared-read RLS: platform licenses (Senvori catalog, marketplace molds) have
 * NULL tenant_id and are readable by every tenant.
 */

/** Rights holder (§5.2): label, publisher, aggregator, the tenant, Senvori. */
export const rightsHolders = pgTable(
  "rights_holders",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["label", "publisher", "aggregator", "tenant", "senvori", "provider"],
    }).notNull(),
    name: text("name").notNull(),
    countryCode: varchar("country_code", { length: 2 }).references(() => countries.code),
    contact: jsonb("contact").notNull().default({}),
    /** Logical FK → marketplace.providers (kept unconstrained to avoid a domain cycle). */
    providerId: uuid("provider_id"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("rights_holders_tenant_idx").on(t.tenantId),
    ...tenantIsolationSharedRead("rights_holders"),
  ],
).enableRLS();

/** Usage contract (§5.2 License). */
export const licenses = pgTable(
  "licenses",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    rightsHolderId: uuid("rights_holder_id")
      .notNull()
      .references(() => rightsHolders.id),
    origin: text("origin", {
      enum: ["own_content", "partner", "marketplace", "ai_generated", "senvori_catalog"],
    }).notNull(),
    status: text("status", { enum: ["draft", "active", "expiring", "expired", "revoked"] })
      .notNull()
      .default("draft"),
    referenceDocument: text("reference_document"),
    /** §5.9 rule 6: applies only when renewal is flagged as in negotiation. */
    gracePeriodDays: integer("grace_period_days").notNull().default(30),
    renewalInNegotiation: boolean("renewal_in_negotiation").notNull().default(false),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("licenses_tenant_status_idx").on(t.tenantId, t.status),
    ...tenantIsolationSharedRead("licenses"),
  ],
).enableRLS();

/**
 * Scope of a license (§5.2): territories × time window × usage types × channels.
 * Territories are ALWAYS an explicit ISO list or worldwide (§5.9 rule 3).
 */
export const licenseScopes = pgTable(
  "license_scopes",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    worldwide: boolean("worldwide").notNull().default(false),
    territories: text("territories").array().notNull().default([]),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** NULL = perpetual. */
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** §5.2 UsageType vocabulary (validated in contracts). */
    usageTypes: text("usage_types").array().notNull().default([]),
    channels: text("channels").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("license_scopes_license_idx").on(t.licenseId),
    ...tenantIsolationSharedRead("license_scopes"),
  ],
).enableRLS();

/** Veto inside a scope (§5.2 Restriction) — restrictions beat scopes (§5.9 rule 8). */
export const licenseRestrictions = pgTable(
  "license_restrictions",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    scopeId: uuid("scope_id")
      .notNull()
      .references(() => licenseScopes.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["blackout_dates", "venue_category", "tenant_block", "exclusivity"],
    }).notNull(),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("license_restrictions_scope_idx").on(t.scopeId),
    ...tenantIsolationSharedRead("license_restrictions"),
  ],
).enableRLS();

/**
 * N:N license ↔ target (§5.2): individual asset, pack or whole catalog —
 * big deals are not managed track by track. Polymorphic target, no hard FK.
 */
export const licenseAssetLinks = pgTable(
  "license_asset_links",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    targetType: text("target_type", { enum: ["asset", "pack", "catalog"] }).notNull(),
    /** asset id or pack id; NULL when target is a whole named catalog. */
    targetId: uuid("target_id"),
    catalogRef: text("catalog_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("license_asset_links_license_idx").on(t.licenseId),
    index("license_asset_links_target_idx").on(t.targetType, t.targetId),
    ...tenantIsolationSharedRead("license_asset_links"),
  ],
).enableRLS();

/** Collective management society per country (§5.2) — platform reference. */
export const collectingSocieties = pgTable(
  "collecting_societies",
  {
    id: id(),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    name: text("name").notNull(),
    reportingRequirements: jsonb("reporting_requirements").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("collecting_societies_country_name_idx").on(t.countryCode, t.name)],
);

/** What must be reported, to whom, how often (§5.2 ReportingObligation). */
export const reportingObligations = pgTable(
  "reporting_obligations",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id").references(() => licenses.id, { onDelete: "cascade" }),
    societyId: uuid("society_id").references(() => collectingSocieties.id),
    /** RRULE (RFC 5545) for the reporting cadence. */
    rrule: text("rrule").notNull(),
    format: text("format").notNull(),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [
    index("reporting_obligations_due_idx").on(t.nextDueAt),
    ...tenantIsolationSharedRead("reporting_obligations"),
  ],
).enableRLS();

/**
 * Materialized availability projection (§5.2 AvailabilityIndex): read cache for
 * the manifest compiler. Rebuilt from license events — licenses remain the truth.
 */
export const availabilityIndex = pgTable(
  "availability_index",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").notNull(),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    usageType: text("usage_type").notNull(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id, { onDelete: "cascade" }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("availability_index_unique_idx").on(
      t.assetId,
      t.countryCode,
      t.usageType,
      t.licenseId,
    ),
    index("availability_index_lookup_idx").on(t.countryCode, t.usageType, t.assetId),
    ...tenantIsolationSharedRead("availability_index"),
  ],
).enableRLS();
