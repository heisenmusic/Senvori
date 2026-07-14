import { sql } from "drizzle-orm";
import {
  doublePrecision,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * Tenancy domain schema — SENVORI_CORE_DOMAINS.md §2.
 *
 * Multi-tenant model (D3): every business table carries `tenant_id` with Row Level
 * Security; the API sets `app.tenant_id` per request/transaction. Platform-scope
 * reference tables (countries) carry no tenant_id by design (§0.1).
 */

/** RLS: rows are only visible/writable inside the current tenant context (D3). */
const tenantIsolation = (table: string) =>
  pgPolicy(`${table}_tenant_isolation`, {
    as: "permissive",
    for: "all",
    using: sql`tenant_id = current_setting('app.tenant_id', true)::uuid`,
    withCheck: sql`tenant_id = current_setting('app.tenant_id', true)::uuid`,
  });

/**
 * Tenant — the Senvori customer (§2.2).
 * Also serves as the Better Auth organization model (D11): `logo`/`metadata`
 * columns belong to the auth layer contract.
 */
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    defaultLocale: text("default_locale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("groups_tenant_idx").on(t.tenantId), tenantIsolation("groups")],
).enableRLS();

/** The store — atomic execution target of the platform (§2.2). */
export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
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
