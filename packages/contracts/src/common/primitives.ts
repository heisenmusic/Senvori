import { z } from "zod";

/**
 * Shared primitives — SENVORI_CORE_DOMAINS.md §0 (transversal conventions).
 * Every domain contract is built from these; no domain redefines them.
 */

/** UUIDv7 — every entity id (§0.1). */
export const uuidSchema = z.uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** BCP 47 locale tag. Platform launch locales are listed in @senvori/i18n. */
export const localeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "expected a BCP 47 tag such as pt-BR");
export type LocaleTag = z.infer<typeof localeSchema>;

/** ISO 3166-1 alpha-2 country code (D8/D10 — territories are always explicit). */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "expected ISO 3166-1 alpha-2");
export type CountryCode = z.infer<typeof countryCodeSchema>;

/** ISO 4217 currency code (D9 — money never has an implicit currency). */
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, "expected ISO 4217");
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;

/** IANA timezone identifier (D4 — every unit carries one). */
export const timezoneSchema = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "expected a valid IANA timezone such as America/Sao_Paulo" },
  );
export type Timezone = z.infer<typeof timezoneSchema>;

/**
 * Money (D9): integer amount in the currency's minor unit + explicit ISO 4217 code.
 * Floats are forbidden across the entire platform.
 */
export const moneySchema = z.object({
  amount: z.number().int(),
  currency: currencyCodeSchema,
});
export type Money = z.infer<typeof moneySchema>;

/** UTC timestamp serialized as ISO 8601 (§0.1 — persistence is always UTC). */
export const utcTimestampSchema = z.iso.datetime({ offset: true });
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;

/** Cursor pagination (§0.3). */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

/** Problem details error body (§0.3) with a stable per-domain code. */
export const problemDetailsSchema = z.object({
  type: z.union([z.url(), z.literal("about:blank")]),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  instance: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

/** Hierarchical permission scope (§0.4 / D11). */
export const scopeTypeSchema = z.enum(["tenant", "country", "brand", "group", "unit"]);
export type ScopeType = z.infer<typeof scopeTypeSchema>;

export const scopeSchema = z.object({
  type: scopeTypeSchema,
  id: uuidSchema.or(countryCodeSchema),
});
export type Scope = z.infer<typeof scopeSchema>;
