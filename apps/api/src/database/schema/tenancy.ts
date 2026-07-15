import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";

/**
 * Tenancy domain schema — SENVORI_CORE_DOMAINS.md §2.
 *
 * Source of truth for the organizational hierarchy:
 * tenant → country → brand → group → unit → zone.
 * Platform-scope reference tables (countries) carry no tenant_id by design (§0.1).
 */

/**
 * Tenant — the Senvori customer (§2.2).
 * Also serves as the Better Auth organization model (D11): `logo`/`metadata`
 * columns belong to the auth layer contract.
 */
export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  defaultLocale: text("default_locale").notNull().default("en-US"),
  defaultTimezone: text("default_timezone").notNull().default("UTC"),
  defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("USD"),
  status: text("status", { enum: ["active", "suspended", "canceled"] })
    .notNull()
    .default("active"),
  ...auditFields(),
  archivedAt: archivedAt(),
});

/** ISO 3166-1 reference, platform scope, maintained by Senvori (§2.2). */
export const countries = pgTable("countries", {
  code: varchar("code", { length: 2 }).primaryKey(),
  nameEn: text("name_en").notNull(),
  /** locale → localized name (D8). */
  names: jsonb("names").$type<Record<string, string>>().notNull().default({}),
  currencies: text("currencies").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Market enabled for a tenant (§2.2 TenantCountry). */
export const tenantCountries = pgTable(
  "tenant_countries",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    defaultLocale: text("default_locale").notNull(),
    billingCurrency: varchar("billing_currency", { length: 3 }).notNull(),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("tenant_countries_tenant_country_idx").on(t.tenantId, t.countryCode),
    tenantIsolation("tenant_countries"),
  ],
).enableRLS();

/** Brand operated by the tenant (§2.2). */
export const brands = pgTable(
  "brands",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    defaultLocale: text("default_locale"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("brands_tenant_slug_idx").on(t.tenantId, t.slug),
    index("brands_tenant_idx").on(t.tenantId),
    tenantIsolation("brands"),
  ],
).enableRLS();

/** Flexible, transversal grouping of units (§2.2 — never a rigid hierarchy). */
export const groups = pgTable(
  "groups",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind"),
    description: text("description"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("groups_tenant_idx").on(t.tenantId), tenantIsolation("groups")],
).enableRLS();

/** The store — atomic execution target of the platform (§2.2). */
export const units = pgTable(
  "units",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    name: text("name").notNull(),
    externalCode: text("external_code"),
    /** IANA timezone — no implicit defaults, ever (D4 / Principle 1). */
    timezone: text("timezone").notNull(),
    locale: text("locale").notNull(),
    address: jsonb("address").$type<Record<string, string>>(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    status: text("status", { enum: ["active", "paused", "archived"] })
      .notNull()
      .default("active"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("units_tenant_external_code_idx").on(t.tenantId, t.externalCode),
    index("units_tenant_idx").on(t.tenantId),
    index("units_brand_idx").on(t.brandId),
    index("units_country_idx").on(t.countryCode),
    tenantIsolation("units"),
  ],
).enableRLS();

/** N:N unit ↔ group (§2.3). */
export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_memberships_group_unit_idx").on(t.groupId, t.unitId),
    index("group_memberships_tenant_idx").on(t.tenantId),
    tenantIsolation("group_memberships"),
  ],
).enableRLS();

/**
 * Execution point inside a unit (§2.2 Zone): ambient audio, storefront screen…
 * Every unit is born with a default zone; devices (Fleet) bind to zones.
 */
export const zones = pgTable(
  "zones",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["audio", "screen", "hybrid"] })
      .notNull()
      .default("audio"),
    /** The non-removable default zone (§2.9 rule 7). */
    isDefault: boolean("is_default").notNull().default(false),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("zones_unit_name_idx").on(t.unitId, t.name),
    index("zones_tenant_idx").on(t.tenantId),
    tenantIsolation("zones"),
  ],
).enableRLS();

/**
 * Unit business hours (§2.2): weekly rules in LOCAL wall-clock time plus dated
 * exceptions (holidays, events). Outside business hours the default is silence.
 */
export const businessHours = pgTable(
  "business_hours",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    /** [{ weekday: 1..7, open: "08:00", close: "22:00" }] — local wall-clock (D4). */
    weeklyRules: jsonb("weekly_rules")
      .$type<Array<{ weekday: number; open: string; close: string }>>()
      .notNull()
      .default([]),
    /** [{ date: "2026-12-25", closed: true, open?, close? }] */
    exceptions: jsonb("exceptions")
      .$type<Array<{ date: string; closed: boolean; open?: string; close?: string }>>()
      .notNull()
      .default([]),
    ...auditFields(),
  },
  (t) => [uniqueIndex("business_hours_unit_idx").on(t.unitId), tenantIsolation("business_hours")],
).enableRLS();
