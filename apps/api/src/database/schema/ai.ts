import {
  bigint,
  boolean,
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
import { users } from "./identity";
import { licenses } from "./licensing";
import { tenants } from "./tenancy";

/**
 * AI domain schema — SENVORI_CORE_DOMAINS.md §14.
 * Internal AI gateway with adapters; every output is traced, licensed and
 * human-approved by default (§14.9 rule 1). Cost is metered per job.
 */

/** Pluggable provider behind the gateway (§14.2 AiAdapter) — platform scope. */
export const aiAdapters = pgTable(
  "ai_adapters",
  {
    id: id(),
    capability: text("capability", { enum: ["text", "tts", "image"] }).notNull(),
    provider: text("provider").notNull(),
    models: jsonb("models").notNull().default([]),
    unitCosts: jsonb("unit_costs").notNull().default({}),
    enabled: boolean("enabled").notNull().default(false),
    ...auditFields(),
  },
  (t) => [uniqueIndex("ai_adapters_capability_provider_idx").on(t.capability, t.provider)],
);

/**
 * Brand voice for TTS (§14.2 VoiceProfile). Voice is licensable content:
 * every profile references a `tts_voice` license (§5.9 rule 5).
 */
export const voiceProfiles = pgTable(
  "voice_profiles",
  {
    id: id(),
    /** NULL = platform voice available to all tenants. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    providerVoice: jsonb("provider_voice").notNull().default({}),
    languages: text("languages").array().notNull().default([]),
    params: jsonb("params").notNull().default({}),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [
    index("voice_profiles_tenant_idx").on(t.tenantId),
    ...tenantIsolationSharedRead("voice_profiles"),
  ],
).enableRLS();

/** Versioned prompt templates per use case (§14.2) — platform scope. */
export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: id(),
    useCase: text("use_case", {
      enum: ["voiceover_copy", "playlist_brief", "campaign_draft", "branding"],
    }).notNull(),
    version: integer("version").notNull(),
    locales: text("locales").array().notNull().default([]),
    template: text("template").notNull(),
    variables: jsonb("variables").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prompt_templates_usecase_version_idx").on(t.useCase, t.version)],
);

/** Generation work item (§14.2 GenerationJob). */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["tts", "playlist", "campaign_copy", "campaign_full", "branding_suggestion"],
    }).notNull(),
    input: jsonb("input").notNull().default({}),
    status: text("status", {
      enum: ["queued", "running", "review", "approved", "rejected", "failed"],
    })
      .notNull()
      .default("queued"),
    /** Reproducibility (§14.9 rule 8): template + version used. */
    promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id),
    estimatedCost: jsonb("estimated_cost").notNull().default({}),
    actualCost: jsonb("actual_cost").notNull().default({}),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    error: text("error"),
    ...auditFields(),
  },
  (t) => [
    index("generation_jobs_tenant_status_idx").on(t.tenantId, t.status),
    tenantIsolation("generation_jobs"),
  ],
).enableRLS();

/**
 * Generation output (§14.2 GenerationResult): artifact references (asset ids,
 * playlist/campaign draft ids) + mandatory rationale for human review.
 */
export const generationResults = pgTable(
  "generation_results",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    artifacts: jsonb("artifacts").notNull().default({}),
    rationale: text("rationale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("generation_results_job_idx").on(t.jobId), tenantIsolation("generation_results")],
).enableRLS();

/** Phase-2 automation: trigger → generation → approval queue (§14.2). */
export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    trigger: jsonb("trigger").notNull().default({}),
    promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id),
    /** Auto-publish is opt-in per tenant and per content type (§14.9 rule 1). */
    approvalPolicy: text("approval_policy", { enum: ["manual", "auto"] })
      .notNull()
      .default("manual"),
    enabled: boolean("enabled").notNull().default(false),
    ...auditFields(),
    archivedAt: archivedAt(),
  },
  (t) => [index("automation_rules_tenant_idx").on(t.tenantId), tenantIsolation("automation_rules")],
).enableRLS();

/** Metered consumption (§14.2 AiUsageRecord) — feeds Billing usage records. */
export const aiUsageRecords = pgTable(
  "ai_usage_records",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => generationJobs.id, { onDelete: "set null" }),
    metric: text("metric", { enum: ["tokens", "tts_seconds"] }).notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_usage_records_tenant_time_idx").on(t.tenantId, t.createdAt),
    tenantIsolation("ai_usage_records"),
  ],
).enableRLS();

/**
 * Generation guardrails (§14.2 ContentPolicy). Platform row (tenant NULL) is
 * inviolable; a tenant row only restricts further (§14.9 rule 6).
 */
export const contentPolicies = pgTable(
  "content_policies",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    rules: jsonb("rules").notNull().default({}),
    ...auditFields(),
  },
  (t) => [
    uniqueIndex("content_policies_tenant_idx").on(t.tenantId),
    ...tenantIsolationSharedRead("content_policies"),
  ],
).enableRLS();
