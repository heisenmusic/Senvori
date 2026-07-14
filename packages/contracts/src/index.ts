/**
 * @senvori/contracts — shared platform contracts.
 *
 * Layout mirrors SENVORI_CORE_DOMAINS.md:
 * - common/  transversal primitives (§0.1, §0.3, §0.4)
 * - events/  system event envelope (§0.2)
 * - domains/ per-domain DTO schemas (foundation phase: identity + tenancy)
 * - openapi/ registry structure for OpenAPI generation (D1)
 */

export * from "./common/primitives.js";
export * from "./events/envelope.js";
export * from "./domains/identity.js";
export * from "./domains/tenancy.js";
export * from "./openapi/index.js";
