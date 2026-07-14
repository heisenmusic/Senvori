import { z } from "zod";
import {
  countryCodeSchema,
  currencyCodeSchema,
  localeSchema,
  timezoneSchema,
  utcTimestampSchema,
  uuidSchema,
} from "../common/primitives.js";

/**
 * Tenancy domain contracts — SENVORI_CORE_DOMAINS.md §2.
 * Source of truth for the organizational hierarchy: tenant → country → brand → group → unit.
 */

export const tenantStatusSchema = z.enum(["active", "suspended", "canceled"]);

export const tenantSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  defaultLocale: localeSchema,
  defaultTimezone: timezoneSchema,
  defaultCurrency: currencyCodeSchema,
  status: tenantStatusSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type TenantDto = z.infer<typeof tenantSchema>;

/** Platform-scope ISO 3166 reference, maintained by Senvori (§2.2). */
export const countrySchema = z.object({
  code: countryCodeSchema,
  nameEn: z.string().min(1),
  /** locale → localized name (D8 translation fallback applies). */
  names: z.record(z.string(), z.string()),
  currencies: z.array(currencyCodeSchema),
});
export type CountryDto = z.infer<typeof countrySchema>;

export const tenantCountryStatusSchema = z.enum(["active", "disabled"]);

export const tenantCountrySchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  countryCode: countryCodeSchema,
  defaultLocale: localeSchema,
  billingCurrency: currencyCodeSchema,
  status: tenantCountryStatusSchema,
  createdAt: utcTimestampSchema,
});
export type TenantCountryDto = z.infer<typeof tenantCountrySchema>;

export const brandSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  defaultLocale: localeSchema.nullable(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type BrandDto = z.infer<typeof brandSchema>;

export const groupSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  name: z.string().min(1),
  /** Free-form kind: region, franchisee, test cluster… (§2.2 — groups are flexible). */
  kind: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type GroupDto = z.infer<typeof groupSchema>;

export const unitStatusSchema = z.enum(["active", "paused", "archived"]);

export const unitSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
  brandId: uuidSchema,
  countryCode: countryCodeSchema,
  name: z.string().min(1),
  externalCode: z.string().nullable(),
  timezone: timezoneSchema,
  locale: localeSchema,
  address: z
    .object({
      line1: z.string().optional(),
      line2: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  status: unitStatusSchema,
  createdAt: utcTimestampSchema,
  updatedAt: utcTimestampSchema,
});
export type UnitDto = z.infer<typeof unitSchema>;
