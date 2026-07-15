import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { countries, tenants } from "./tenancy";

/**
 * Billing domain schema — SENVORI_CORE_DOMAINS.md §12 (D9).
 *
 * Money is ALWAYS an integer in the currency's minor unit + explicit ISO 4217
 * code — floats are forbidden across the whole domain. Prices come from per-
 * market price lists; FX conversion never happens. MVP charges BRL; the schema
 * is multi-currency from birth.
 */

/** Commercial product (§12.2 Plan) — platform scope. */
export const plans = pgTable(
  "plans",
  {
    id: id(),
    name: text("name").notNull(),
    features: jsonb("features").notNull().default({}),
    /** Base limits materialized into entitlements on subscribe. */
    baseLimits: jsonb("base_limits").notNull().default({}),
    /** Markets where the plan is sellable. */
    visibility: text("visibility").array().notNull().default([]),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [uniqueIndex("plans_name_idx").on(t.name)],
);

/** Plan prices per market (§12.2 PriceList) — platform scope. */
export const priceLists = pgTable(
  "price_lists",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    market: varchar("market", { length: 2 })
      .notNull()
      .references(() => countries.code),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountMonthly: bigint("amount_monthly", { mode: "number" }).notNull(),
    amountYearly: bigint("amount_yearly", { mode: "number" }),
    ...auditFields(),
  },
  (t) => [uniqueIndex("price_lists_plan_market_idx").on(t.planId, t.market)],
);

/** Tenant subscription (§12.2) — price frozen at subscribe (grandfathering). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    priceListId: uuid("price_list_id").references(() => priceLists.id),
    /** Frozen price (§12.9 rule 7): amount + currency at subscription time. */
    frozenAmount: bigint("frozen_amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    cycle: text("cycle", { enum: ["monthly", "yearly"] })
      .notNull()
      .default("monthly"),
    status: text("status", {
      enum: ["trialing", "active", "past_due", "suspended", "canceled"],
    })
      .notNull()
      .default("trialing"),
    gateway: text("gateway"),
    gatewayRef: text("gateway_ref"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    /** §12.9 rule 4: players keep playing this long after suspension. */
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [
    // One live subscription per tenant
    uniqueIndex("subscriptions_tenant_live_idx")
      .on(t.tenantId)
      .where(sql`status <> 'canceled'`),
    index("subscriptions_status_idx").on(t.status),
    tenantIsolation("subscriptions"),
  ],
).enableRLS();

/**
 * Materialized limits (§12.2 Entitlement) — the ONLY interface other domains
 * consult for plan limits (§12.9 rule 5). One row per tenant.
 */
export const entitlements = pgTable(
  "entitlements",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maxUnits: bigint("max_units", { mode: "number" }).notNull().default(1),
    storageGb: bigint("storage_gb", { mode: "number" }).notNull().default(5),
    aiCreditsMonth: bigint("ai_credits_month", { mode: "number" }).notNull().default(0),
    maxMembers: bigint("max_members", { mode: "number" }).notNull().default(5),
    /** Module access: marketplace, retail_media… */
    features: jsonb("features").notNull().default({}),
    /** §12.9 rule 10: tenant-configurable spending cap — no surprise invoices. */
    spendingCap: jsonb("spending_cap").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation("entitlements")],
).enableRLS();

/** Metered consumption (§12.2 UsageRecord). */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    metric: text("metric", {
      enum: ["ai_tts_seconds", "ai_tokens", "storage_gb", "active_units"],
    }).notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("usage_records_tenant_metric_idx").on(t.tenantId, t.metric, t.periodStart),
    tenantIsolation("usage_records"),
  ],
).enableRLS();

/** Invoice (§12.2). */
export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: text("number").notNull().unique(),
    currency: varchar("currency", { length: 3 }).notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    status: text("status", { enum: ["draft", "issued", "paid", "failed", "void"] })
      .notNull()
      .default("draft"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...auditFields(),
  },
  (t) => [
    index("invoices_tenant_status_idx").on(t.tenantId, t.status),
    tenantIsolation("invoices"),
  ],
).enableRLS();

/** Invoice line (§12.2): subscription, usage, marketplace, retail media. */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["subscription", "usage", "marketplace", "retail_media", "adjustment"],
    }).notNull(),
    description: text("description").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull().default(1),
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull(),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    /** Cross-domain reference (purchase id, IO id…) — polymorphic, no hard FK. */
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId), tenantIsolation("invoice_lines")],
).enableRLS();

/** Payment attempt/settlement (§12.2) — reconciled idempotently via webhooks. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    gateway: text("gateway").notNull(),
    method: text("method"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: text("status", {
      enum: ["pending", "succeeded", "failed", "refunded", "charged_back"],
    })
      .notNull()
      .default("pending"),
    gatewayRef: text("gateway_ref").unique(),
    error: text("error"),
    ...auditFields(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId), tenantIsolation("payments")],
).enableRLS();

/** Stored payment method (§12.2). */
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    gateway: text("gateway").notNull(),
    type: text("type").notNull(),
    gatewayRef: text("gateway_ref").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("payment_methods_tenant_idx").on(t.tenantId), tenantIsolation("payment_methods")],
).enableRLS();

/** Gateway adapter registration (§12.2 GatewayAccount) — platform scope. */
export const gatewayAccounts = pgTable(
  "gateway_accounts",
  {
    id: id(),
    provider: text("provider").notNull(),
    markets: text("markets").array().notNull().default([]),
    /** Vault reference only — secrets never live in the database (§8 security). */
    configRef: text("config_ref").notNull(),
    ...auditFields(),
  },
  (t) => [uniqueIndex("gateway_accounts_provider_idx").on(t.provider)],
);

/** Refund/adjustment (§12.2 CreditNote) — full trail (§12.9 rule 8). */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_notes_invoice_idx").on(t.invoiceId), tenantIsolation("credit_notes")],
).enableRLS();

/** Fiscal data per market (§12.2 TaxProfile). */
export const taxProfiles = pgTable(
  "tax_profiles",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    market: varchar("market", { length: 2 })
      .notNull()
      .references(() => countries.code),
    taxId: text("tax_id").notNull(),
    legalName: text("legal_name").notNull(),
    fiscalAddress: jsonb("fiscal_address").notNull().default({}),
    regime: text("regime"),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("tax_profiles_tenant_market_idx").on(t.tenantId, t.market),
    tenantIsolation("tax_profiles"),
  ],
).enableRLS();
