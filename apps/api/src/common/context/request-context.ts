import type { SystemRole } from "@senvori/contracts";

/** Scope of a single role grant (§0.4). */
export interface GrantScope {
  role: SystemRole;
  scopeType: "tenant" | "country" | "brand" | "group" | "unit";
  scopeId: string;
}

/** The resolved identity + tenant context of an authenticated request. */
export interface RequestContext {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    locale: string | null;
    status: string;
  };
  tenantId: string;
  membershipId: string;
  /** Organization-level role from `memberships` (§1.2); raw string (may be `member`). */
  role: string;
  /** Fine-grained hierarchical role assignments (§1.2 RoleAssignment). */
  assignments: GrantScope[];
  ip: string | null;
  userAgent: string | null;
}

/** Where the guard stashes the resolved context on the Fastify request. */
export const REQUEST_CONTEXT_KEY = "senvoriContext";
