# ADR 0002 — Device authentication under FORCE RLS

- **Status:** Accepted (Sprint 10A)
- **Context:** The Player authenticates as a device, not a user. The API connects
  as a **NOBYPASSRLS** role and every business table is **FORCE ROW LEVEL
  SECURITY** (migration 0003), so a device credential must be verifiable _before_
  the tenant context exists — but a NOBYPASSRLS role cannot read across tenants,
  and `device_tokens` is a tenant-isolated table.

## Decision

1. **Opaque bearer token, hash-at-rest.** The raw token (`pdt_…`, 32 random
   bytes) is returned to the device exactly once (activation complete / refresh).
   Only its sha256 hash is stored in `device_tokens.token_hash`. A DB leak yields
   no usable credential.
2. **Self-auth RLS policy.** A permissive `SELECT` policy
   `device_tokens_self_auth` lets a caller read exactly the row whose
   `token_hash` equals the transaction-local GUC `app.device_token_hash`. The
   guard sets that GUC to the presented token's hash inside its own transaction,
   reads the single matching row, then discards the GUC. Only the holder of the
   raw token can read its row; every other access path stays tenant-isolated.
   This avoids introducing a BYPASSRLS role into the request path.
3. **Server-derived scope.** After the token resolves `tenant_id` + `device_id`,
   the guard loads the device + `zone → unit` inside the derived tenant context
   and attaches a `DeviceContext`. **The device never sends its tenant/unit.**
4. **Explicit revocation & expiry.** `revoked_at`/`expires_at` are checked on
   every request; refresh rotates (revoke-all + issue); deactivate revokes and
   decommissions.

## Alternatives considered

- **SECURITY DEFINER function** owned by a BYPASSRLS role — rejected: adds a
  BYPASSRLS surface and is heavier than a scoped RLS policy that already encodes
  "you must hold the token".
- **A non-RLS token table** (like `pairing_codes`) — rejected: `device_tokens`
  already exists with RLS; dropping isolation would be a security regression.

## Consequences

- Token verification is one indexed lookup gated by proof-of-possession of the
  exact hash. Custom two-part GUCs (`app.*`) need no grant to be SET at
  transaction scope, so the mechanism works for the least-privilege app role.
- Rotating credentials and per-device revocation are first-class.
- The device-side secure storage of the raw token is Phase 10B.
