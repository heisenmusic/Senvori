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
import {
  archivedAt,
  auditFields,
  id,
  tenantIsolation,
  tenantIsolationSharedRead,
} from "./_helpers";
import { licenses } from "./licensing";
import { brands, tenants } from "./tenancy";

/**
 * Brand Experience domain schema — SENVORI_CORE_DOMAINS.md §9.
 * Brand kits, themes, visualizers and signage templates. Themes are versioned,
 * immutable once published, and distributed through the manifest chain (D6/D7).
 */

/** Brand identity kit (§9.2): logos, palette, typography, tone of voice. */
export const brandKits = pgTable(
  "brand_kits",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** Asset references per logo variant (light/dark/mono). */
    logos: jsonb("logos").notNull().default({}),
    palette: jsonb("palette").notNull().default({}),
    typography: jsonb("typography").notNull().default({}),
    /** Consumed by the AI domain for voiceovers and copy (§9.4 case 7). */
    toneOfVoice: text("tone_of_voice"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [uniqueIndex("brand_kits_brand_idx").on(t.brandId), tenantIsolation("brand_kits")],
).enableRLS();

/**
 * Applied theme per surface (§9.2 Theme). Versioned & immutable after publish
 * (§9.9 rule 1); rollback = republishing a previous version.
 */
export const themes = pgTable(
  "themes",
  {
    id: id(),
    /** NULL = the platform default theme (mandatory fallback — §9.9 rule 3). */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    brandKitId: uuid("brand_kit_id").references(() => brandKits.id, { onDelete: "cascade" }),
    surface: text("surface", { enum: ["player_screen", "signage", "dashboard"] }).notNull(),
    /** Design-system token overrides only — never free CSS (§9.9 rule 5). */
    tokens: jsonb("tokens").notNull().default({}),
    version: integer("version").notNull().default(1),
    status: text("status", { enum: ["draft", "published", "archived"] })
      .notNull()
      .default("draft"),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    uniqueIndex("themes_kit_surface_version_idx").on(t.brandKitId, t.surface, t.version),
    index("themes_tenant_idx").on(t.tenantId),
    ...tenantIsolationSharedRead("themes"),
  ],
).enableRLS();

/** Now-playing screen preset (§9.2 VisualizerPreset). */
export const visualizerPresets = pgTable(
  "visualizer_presets",
  {
    id: id(),
    /** NULL = platform preset available to all tenants. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    layout: text("layout").notNull(),
    animation: jsonb("animation").notNull().default({}),
    /** Minimum device capabilities (matched against Fleet DeviceProfile). */
    capabilityRequirements: jsonb("capability_requirements").notNull().default({}),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  () => [...tenantIsolationSharedRead("visualizer_presets")],
).enableRLS();

/** Motion/animation library (§9.2 MotionPack) — platform scope, licensed. */
export const motionPacks = pgTable("motion_packs", {
  id: id(),
  name: text("name").notNull(),
  /** Asset references of the motion files. */
  assets: jsonb("assets").notNull().default([]),
  licenseId: uuid("license_id").references(() => licenses.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Screen layout for signage (§9.2 SignageTemplate): typed content zones. */
export const signageTemplates = pgTable(
  "signage_templates",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Grid regions with typed slots (media, ticker, clock, price). */
    grid: jsonb("grid").notNull().default({}),
    resolutions: jsonb("resolutions").notNull().default([]),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  () => [...tenantIsolationSharedRead("signage_templates")],
).enableRLS();

/**
 * Theme/visualizer/template assignment per hierarchy node (§9.2
 * ExperienceProfile) — same specificity rule as Scheduling (zone wins).
 */
export const experienceProfiles = pgTable(
  "experience_profiles",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    targetType: text("target_type", {
      enum: ["tenant", "country", "brand", "group", "unit", "zone"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    themeId: uuid("theme_id").references(() => themes.id),
    visualizerId: uuid("visualizer_id").references(() => visualizerPresets.id),
    templateId: uuid("template_id").references(() => signageTemplates.id),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("experience_profiles_target_idx").on(t.tenantId, t.targetType, t.targetId),
    tenantIsolation("experience_profiles"),
  ],
).enableRLS();
