import { z } from "zod";
import { utcTimestampSchema, uuidSchema } from "../common/primitives.js";

/**
 * System event envelope — SENVORI_CORE_DOMAINS.md §0.2.
 *
 * - Names follow `domain.entity.action`, action always in the past tense.
 * - Events are facts, never commands.
 * - Published via the outbox pattern; consumed idempotently by `event_id`.
 */

export const eventTypeSchema = z
  .string()
  .regex(
    /^[a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*$/,
    "expected domain.entity.action (snake_case, past tense action)",
  );
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventActorSchema = z.object({
  type: z.enum(["user", "device", "system", "api_key"]),
  id: uuidSchema.nullable(),
});
export type EventActor = z.infer<typeof eventActorSchema>;

export const eventEnvelopeSchema = z.object({
  event_id: uuidSchema,
  event_type: eventTypeSchema,
  schema_version: z.number().int().min(1),
  /** null for platform-scope events (OTA releases, marketplace ops…). */
  tenant_id: uuidSchema.nullable(),
  occurred_at: utcTimestampSchema,
  actor: eventActorSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** Builds a typed envelope schema for a concrete event payload. */
export const defineEvent = <T extends z.ZodTypeAny>(eventType: string, payload: T) =>
  eventEnvelopeSchema.extend({
    event_type: z.literal(eventType),
    payload,
  });
