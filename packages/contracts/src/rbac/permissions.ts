import type { SystemRole } from "../domains/identity.js";

/**
 * RBAC permission catalog and role mapping — SENVORI_CORE_DOMAINS.md §0.4.
 *
 * Permissions are `domain:resource:action`. Grants may use `*` wildcards per
 * segment (`identity:*`, `analytics:*:read`) or the bare `*` (everything).
 * Authorization is always `permission ∧ scope`; scope coverage lives in the API
 * (needs DB) — this module only defines WHAT each role may do, not WHERE.
 */

export const PERMISSIONS = [
  // Identity (§1.8)
  "identity:member:read",
  "identity:member:invite",
  "identity:member:manage",
  "identity:role:assign",
  "identity:apikey:manage",
  "identity:audit:read",
  // Tenancy (§2.8)
  "tenancy:tenant:manage",
  "tenancy:country:manage",
  "tenancy:brand:manage",
  "tenancy:group:manage",
  "tenancy:unit:create",
  "tenancy:unit:read",
  "tenancy:unit:update",
  "tenancy:unit:manage",
  // Catalog (§4.8)
  "catalog:item:read",
  "catalog:item:create",
  "catalog:item:update",
  "catalog:item:archive",
  "catalog:asset:upload",
  "catalog:asset:download",
  "catalog:asset:reprocess",
  "catalog:metadata:manage",
  "catalog:rights:read",
  "catalog:rights:manage",
  // Programming (Sprint 06) — reuses the playlists/scheduling domains
  "playlists:program:read",
  "playlists:program:create",
  "playlists:program:update",
  "playlists:program:publish",
  "playlists:program:preview",
  "playlists:program:archive",
  // Historical Programming Runtime (Sprint 07B)
  "playlists:rotation_pair:read",
  "playlists:rotation_pair:manage",
  "scheduling:program:assign",
  // Scheduling Runtime (Sprint 08)
  "scheduling:assignment:read",
  "scheduling:assignment:manage",
  "scheduling:event:read",
  "scheduling:event:manage",
  "scheduling:plan:read",
  // Fleet (§3.8) — used by later sprints, catalogued now
  "fleet:device:read",
  "fleet:device:pair",
  "fleet:device:command",
  "fleet:device:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * System role → granted permission patterns (§0.4).
 * `owner` gets everything; other roles get the least privilege that covers
 * their job. Business domains beyond this sprint are granted with domain
 * wildcards so they light up as those domains are implemented.
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRole, readonly string[]> = {
  owner: ["*"],
  admin: [
    "identity:*",
    "tenancy:*",
    "catalog:*",
    "licensing:*",
    "playlists:*",
    "scheduling:*",
    "campaigns:*",
    "brand:*",
    "fleet:*",
    "retail:*",
    "marketplace:*",
    "analytics:*",
    "ai:*",
  ],
  manager: [
    "identity:member:read",
    "tenancy:unit:read",
    "tenancy:unit:update",
    "tenancy:unit:manage",
    "tenancy:brand:manage",
    "tenancy:group:manage",
    "catalog:item:read",
    "catalog:asset:download",
    "catalog:rights:read",
    "fleet:device:*",
    "scheduling:*",
    "campaigns:*",
    "analytics:*:read",
  ],
  curator: ["catalog:*", "playlists:*", "tenancy:unit:read"],
  campaign_manager: ["campaigns:*", "tenancy:unit:read", "analytics:*:read"],
  finance: ["billing:*", "analytics:*:read"],
  // Read-only role (the "viewer"): sees, never mutates.
  analyst: ["identity:member:read", "tenancy:unit:read", "catalog:item:read", "analytics:*:read"],
  unit_operator: ["tenancy:unit:read", "fleet:device:pair", "fleet:device:command"],
  rights_manager: ["licensing:*", "analytics:*:read"],
  provider: [],
  sponsor: [],
  support: ["identity:audit:read", "tenancy:unit:read", "fleet:device:read"],
};

/** Does a single grant pattern satisfy a required `domain:resource:action`? */
export const grantMatches = (grant: string, required: string): boolean => {
  if (grant === "*") return true;
  const g = grant.split(":");
  const r = required.split(":");
  if (r.length !== 3) return false;
  while (g.length < 3) g.push("*");
  return g.every((seg, i) => seg === "*" || seg === r[i]);
};

/** Does any grant in the list satisfy the required permission? */
export const hasPermission = (grants: readonly string[], required: string): boolean =>
  grants.some((g) => grantMatches(g, required));

/**
 * All permission patterns granted by a role. Accepts a raw string (e.g. the
 * Better Auth default membership role `member`) and returns `[]` for any role
 * outside the system catalog — least privilege by default.
 */
export const permissionsForRole = (role: string): readonly string[] =>
  SYSTEM_ROLE_PERMISSIONS[role as SystemRole] ?? [];
