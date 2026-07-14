import type { z } from "zod";

/**
 * OpenAPI registry structure — SENVORI_CORE_DOMAINS.md §0.3 / D1.
 *
 * Contracts are authored in Zod and published as OpenAPI. This registry collects every
 * schema/route so the generator (wired in the API phase) can emit the document from a
 * single source of truth. No generation logic lives here yet — structure only.
 */

export interface RegisteredSchema {
  name: string;
  domain: string;
  schema: z.ZodTypeAny;
}

export interface RegisteredRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: `/v1/${string}`;
  domain: string;
  summary: string;
  /** Permission key `domain:resource:action` (§0.4), or null for public/session routes. */
  permission: string | null;
}

const schemas: RegisteredSchema[] = [];
const routes: RegisteredRoute[] = [];

export const registerSchema = (entry: RegisteredSchema): void => {
  schemas.push(entry);
};

export const registerRoute = (entry: RegisteredRoute): void => {
  routes.push(entry);
};

export const getRegisteredSchemas = (): readonly RegisteredSchema[] => schemas;
export const getRegisteredRoutes = (): readonly RegisteredRoute[] => routes;

export const OPENAPI_INFO = {
  title: "Senvori API",
  version: "0.1.0",
  description: "Senvori control-plane API. Contracts defined in @senvori/contracts (Zod).",
} as const;
