import {
  bigint,
  date,
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
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";
import { users } from "./identity";
import { countries, tenants } from "./tenancy";

/**
 * Retail Media domain schema — SENVORI_CORE_DOMAINS.md §10.
 * Sponsors buy audio/screen inventory; delivery is paced and every reported
 * number comes from proof-of-play (§10.9 rule 2). Money follows D9: integer
 * minor units + explicit ISO 4217 currency.
 */

/** Advertiser (§10.2 Sponsor). */
export const sponsors = pgTable(
  "sponsors",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Industry category for competitive separation (§10.2). */
    industryCategory: text("industry_category"),
    contacts: jsonb("contacts").notNull().default([]),
    status: text("status", { enum: ["active", "suspended"] })
      .notNull()
      .default("active"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("sponsors_tenant_idx").on(t.tenantId), tenantIsolation("sponsors")],
).enableRLS();

/** Restricted sponsor access (§10.2 SponsorUser, role `sponsor`). */
export const sponsorUsers = pgTable(
  "sponsor_users",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sponsor_users_unique_idx").on(t.sponsorId, t.userId),
    tenantIsolation("sponsor_users"),
  ],
).enableRLS();

/** Sellable inventory definition (§10.2 InventorySlot). */
export const inventorySlots = pgTable(
  "inventory_slots",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: ["audio_spot", "screen_slot"] }).notNull(),
    /** Hierarchy nodes where this inventory exists. */
    networkScope: jsonb("network_scope").notNull().default({}),
    /** Daypart in local wall-clock (D4). */
    daypart: jsonb("daypart").notNull().default({}),
    /** §10.9 rule 1: saturation cap — experience before revenue. */
    capacityPerHour: integer("capacity_per_hour").notNull().default(4),
    exclusivityPolicy: jsonb("exclusivity_policy").notNull().default({}),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("inventory_slots_tenant_idx").on(t.tenantId), tenantIsolation("inventory_slots")],
).enableRLS();

/** Pricing per market (§10.2 RateCard) — price list, never FX conversion (D9). */
export const rateCards = pgTable(
  "rate_cards",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slotType: text("slot_type", { enum: ["audio_spot", "screen_slot"] }).notNull(),
    market: varchar("market", { length: 2 })
      .notNull()
      .references(() => countries.code),
    currency: varchar("currency", { length: 3 }).notNull(),
    pricingModel: text("pricing_model", { enum: ["per_play", "per_period"] }).notNull(),
    /** Integer minor units (D9). */
    priceAmount: bigint("price_amount", { mode: "number" }).notNull(),
    volumeDiscounts: jsonb("volume_discounts").notNull().default([]),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("rate_cards_unique_idx").on(t.tenantId, t.slotType, t.market, t.pricingModel),
    tenantIsolation("rate_cards"),
  ],
).enableRLS();

/** The purchase contract (§10.2 InsertionOrder). */
export const insertionOrders = pgTable(
  "insertion_orders",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sponsorId: uuid("sponsor_id")
      .notNull()
      .references(() => sponsors.id),
    /** Purchased slots (inventory slot ids + parameters). */
    slots: jsonb("slots").notNull().default([]),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    goalPlays: integer("goal_plays"),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: text("status", { enum: ["draft", "signed", "active", "fulfilled", "canceled"] })
      .notNull()
      .default("draft"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("insertion_orders_tenant_status_idx").on(t.tenantId, t.status),
    index("insertion_orders_sponsor_idx").on(t.sponsorId),
    tenantIsolation("insertion_orders"),
  ],
).enableRLS();

/**
 * Delivery pacing projection (§10.2 PacingState) — recomputed from Analytics
 * rollups; redistribution stays inside the IO limits (§10.9 rule 3).
 */
export const pacingStates = pgTable(
  "pacing_states",
  {
    insertionOrderId: uuid("insertion_order_id")
      .primaryKey()
      .references(() => insertionOrders.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    delivered: integer("delivered").notNull().default(0),
    planned: integer("planned").notNull().default(0),
    projected: integer("projected").notNull().default(0),
    status: text("status", { enum: ["on_track", "at_risk", "under", "over"] })
      .notNull()
      .default("on_track"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [tenantIsolation("pacing_states")],
).enableRLS();

/** Certified delivery report (§10.2 DeliveryReport) — proof-of-play only. */
export const deliveryReports = pgTable(
  "delivery_reports",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    insertionOrderId: uuid("insertion_order_id")
      .notNull()
      .references(() => insertionOrders.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** Aggregated plays per unit/daypart, sourced exclusively from Analytics. */
    data: jsonb("data").notNull().default({}),
    /** Integrity hash of the report body — auditable by the sponsor. */
    certificationHash: text("certification_hash").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("delivery_reports_io_idx").on(t.insertionOrderId),
    tenantIsolation("delivery_reports"),
  ],
).enableRLS();

/** Competitive separation policy (§10.2): categories that never share a break. */
export const competitiveSeparations = pgTable(
  "competitive_separations",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    categories: text("categories").array().notNull().default([]),
    scope: jsonb("scope").notNull().default({}),
    ...auditFields(),
  },
  (t) => [
    index("competitive_separations_tenant_idx").on(t.tenantId),
    tenantIsolation("competitive_separations"),
  ],
).enableRLS();
