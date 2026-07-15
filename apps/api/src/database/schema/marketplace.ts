import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { archivedAt, auditFields, id, tenantIsolation } from "./_helpers";
import { users } from "./identity";
import { licenses } from "./licensing";
import { countries, tenants } from "./tenancy";

/**
 * Marketplace domain schema — SENVORI_CORE_DOMAINS.md §11.
 *
 * Providers, listings, purchases, revenue share and payouts. Provider-side
 * tables are PLATFORM scope (no tenant_id — providers are not tenants); only
 * the buying side (purchases/acquisitions) is tenant-scoped with RLS.
 * Purchases never copy media: an Acquisition creates a License (§11.9 rule 4).
 */

/** Seller profile (§11.2 Provider): label, artist, agency, creator. */
export const providers = pgTable(
  "providers",
  {
    id: id(),
    type: text("type", { enum: ["label", "artist", "agency", "creator"] }).notNull(),
    name: text("name").notNull(),
    countryCode: varchar("country_code", { length: 2 })
      .notNull()
      .references(() => countries.code),
    /** Public profile — translatable via entity_translations. */
    publicProfile: jsonb("public_profile").notNull().default({}),
    status: text("status", { enum: ["pending", "approved", "suspended"] })
      .notNull()
      .default("pending"),
    payoutDetails: jsonb("payout_details").notNull().default({}),
    taxInfo: jsonb("tax_info").notNull().default({}),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("providers_status_idx").on(t.status)],
);

/** Provider staff (§11.2 ProviderMember, role `provider`). */
export const providerMembers = pgTable(
  "provider_members",
  {
    id: id(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("provider_members_unique_idx").on(t.providerId, t.userId)],
);

/** Published offer (§11.2 Listing) — visible only in licensed territories. */
export const listings = pgTable(
  "listings",
  {
    id: id(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "music_catalog",
        "playlist_pack",
        "voiceover_pack",
        "signage_templates",
        "curation_service",
      ],
    }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    territories: text("territories").array().notNull().default([]),
    status: text("status", { enum: ["draft", "in_review", "published", "suspended"] })
      .notNull()
      .default("draft"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("listings_provider_idx").on(t.providerId),
    index("listings_status_idx").on(t.status),
  ],
);

/** Versioned listing content (§11.2 ListingVersion). */
export const listingVersions = pgTable(
  "listing_versions",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** Referenced content: asset ids, pack ids, license mold. */
    content: jsonb("content").notNull().default({}),
    changelog: text("changelog"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("listing_versions_unique_idx").on(t.listingId, t.version)],
);

/** Price per market (§11.2 ListingPrice) — D9: minor units, no FX conversion. */
export const listingPrices = pgTable(
  "listing_prices",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    market: varchar("market", { length: 2 })
      .notNull()
      .references(() => countries.code),
    currency: varchar("currency", { length: 3 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    model: text("model", { enum: ["one_time", "subscription", "per_play"] }).notNull(),
    ...auditFields(),
  },
  (t) => [uniqueIndex("listing_prices_unique_idx").on(t.listingId, t.market, t.model)],
);

/** Buying transaction (§11.2 Purchase) — tenant-scoped, price frozen. */
export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id),
    listingVersionId: uuid("listing_version_id").references(() => listingVersions.id),
    priceAmount: bigint("price_amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    model: text("model", { enum: ["one_time", "subscription", "per_play"] }).notNull(),
    status: text("status", { enum: ["pending", "completed", "refunded"] })
      .notNull()
      .default("pending"),
    /** Logical FK → billing.invoices (kept unconstrained to avoid a domain cycle). */
    invoiceId: uuid("invoice_id"),
    ...auditFields(),
  },
  (t) => [
    index("purchases_tenant_idx").on(t.tenantId, t.status),
    index("purchases_listing_idx").on(t.listingId),
    tenantIsolation("purchases"),
  ],
).enableRLS();

/** Acquired right (§11.2 Acquisition) — materializes as a License (§5). */
export const acquisitions = pgTable(
  "acquisitions",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("acquisitions_purchase_idx").on(t.purchaseId),
    tenantIsolation("acquisitions"),
  ],
).enableRLS();

/** Revenue share model per provider (§11.2 RevenueShareAgreement). */
export const revenueShareAgreements = pgTable(
  "revenue_share_agreements",
  {
    id: id(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    model: text("model", { enum: ["fixed", "rev_share", "per_play"] }).notNull(),
    /** Senvori share in basis points (10000 = 100%). */
    senvoriShareBps: smallint("senvori_share_bps").notNull(),
    payoutCurrency: varchar("payout_currency", { length: 3 }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    ...auditFields(),
  },
  (t) => [index("revenue_share_provider_idx").on(t.providerId, t.effectiveFrom)],
);

/** Provider payout (§11.2 Payout) — immutable calculation basis attached. */
export const payouts = pgTable(
  "payouts",
  {
    id: id(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    /** `held` while a rights dispute freezes the content (§11.9 rule 9). */
    status: text("status", { enum: ["calculated", "processing", "paid", "held"] })
      .notNull()
      .default("calculated"),
    /** Calculation basis: sales + per-play counts from proof-of-play. */
    basis: jsonb("basis").notNull().default({}),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("payouts_provider_period_idx").on(t.providerId, t.periodStart, t.periodEnd),
    index("payouts_status_idx").on(t.status),
  ],
);

/** Senvori curation gate (§11.2 ReviewTask) — mandatory before publish. */
export const reviewTasks = pgTable(
  "review_tasks",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    checklist: jsonb("checklist").notNull().default({}),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    decision: text("decision", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    comment: text("comment"),
    ...auditFields(),
  },
  (t) => [index("review_tasks_listing_idx").on(t.listingId)],
);
