import { SetMetadata } from "@nestjs/common";

/** How to resolve the permission target scope from the request. */
export interface PermissionOptions {
  /** Route param holding a unit id → check unit-scoped coverage. */
  unitParam?: string;
  /** Route param holding a brand id → check brand-scoped coverage. */
  brandParam?: string;
  /** Route param holding a group id → check group-scoped coverage. */
  groupParam?: string;
}

export interface RequiredPermission {
  permission: string;
  options: PermissionOptions;
}

export const REQUIRE_PERMISSION_KEY = "senvori:requirePermission";

/**
 * Requires a `domain:resource:action` permission (§0.4). Without a param option
 * the check is tenant-level (only tenant-scoped grants pass); with e.g.
 * `{ unitParam: 'id' }` the guard resolves the unit's ancestor scopes and lets
 * any covering grant through.
 */
export const RequirePermission = (permission: string, options: PermissionOptions = {}) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { permission, options } satisfies RequiredPermission);
