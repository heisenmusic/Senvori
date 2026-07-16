import { SetMetadata } from "@nestjs/common";
import type { SystemRole } from "@senvori/contracts";

export const REQUIRE_ROLE_KEY = "senvori:requireRole";

/** Requires the context to hold a specific system role at the tenant scope. */
export const RequireRole = (role: SystemRole) => SetMetadata(REQUIRE_ROLE_KEY, role);
