/**
 * Complete platform schema — SENVORI_CORE_DOMAINS.md, one file per domain.
 *
 * Transversal conventions (§0.1): UUIDv7 ids, UTC timestamps, soft delete via
 * archived_at, audit fields, tenant_id + RLS on business tables. Shared
 * catalogs (assets, licenses, playlists…) use nullable tenant_id with a
 * shared-read RLS policy: platform rows (NULL) are readable by every tenant,
 * writable only by the ops service role.
 *
 * Import graph is acyclic: tenancy ← identity ← fleet/…; licensing ← ai ←
 * catalog ← playlists; retail-media ← campaigns. Cross-domain references that
 * would create cycles are logical FKs (documented inline).
 */

export * from "./platform";
export * from "./identity";
export * from "./tenancy";
export * from "./fleet";
export * from "./catalog";
export * from "./licensing";
export * from "./playlists";
export * from "./scheduling";
export * from "./scheduling-runtime";
export * from "./campaigns";
export * from "./brand-experience";
export * from "./retail-media";
export * from "./marketplace";
export * from "./billing";
export * from "./analytics";
export * from "./ai";
