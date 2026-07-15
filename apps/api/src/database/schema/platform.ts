import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantIsolationSharedRead } from "./_helpers";

/**
 * Cross-cutting platform infrastructure — SENVORI_CORE_DOMAINS.md §0.
 */

/**
 * Outbox pattern (§0.2): events are written in the same transaction as the
 * state change and dispatched by a worker. `event_id` is the idempotency key
 * for every consumer.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    /** The event_id of the envelope — UUIDv7, generated with the fact. */
    id: id(),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    /** NULL for platform-scope events (§0.2). */
    tenantId: uuid("tenant_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actor: jsonb("actor").$type<{ type: string; id: string | null }>().notNull(),
    payload: jsonb("payload").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // dispatcher scan: unpublished first, in insertion (time) order
    index("outbox_events_unpublished_idx")
      .on(t.createdAt)
      .where(sql`published_at IS NULL`),
    index("outbox_events_type_idx").on(t.eventType),
    index("outbox_events_tenant_idx").on(t.tenantId),
  ],
);

/**
 * Database-content translation (D8): per-entity table with chain fallback
 * (user locale → unit → tenant → EN) resolved at read time.
 */
export const entityTranslations = pgTable(
  "entity_translations",
  {
    id: id(),
    /** NULL for platform-owned content (Senvori catalog, marketplace listings). */
    tenantId: uuid("tenant_id"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    locale: text("locale").notNull(),
    field: text("field").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("entity_translations_key_idx").on(t.entityType, t.entityId, t.locale, t.field),
    ...tenantIsolationSharedRead("entity_translations"),
  ],
).enableRLS();
