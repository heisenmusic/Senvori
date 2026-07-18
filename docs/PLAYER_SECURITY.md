# Player Security

Applied this sprint:

- **Contract validation** — plans are validated (`PlanValidator`) before touching
  any slot; the wire mapper (`PlanMapper`) never trusts wire data blindly and
  returns `Err` on malformed input.
- **Log sanitization** — `Logger._sanitize` redacts secret-looking fields and
  trims signed URLs to their origin, centrally.
- **Path-traversal prevention** — `isSafeChildPath` and `IoFileSystem.promote`
  reject `..` and paths escaping the cache root.
- **Checksum validation** — downloads are validated before promotion (FNV-1a by
  default; see below).
- **Tenant context preserved** — identity carries tenant/unit; diagnostics never
  expose other tenants' data; device id is masked in operator surfaces.
- **No secrets in plain text** — identity's descriptive fields are stored plain;
  any activation secret is destined for secure storage (port), never logged.
- **TLS via the platform stack** — no custom crypto, no cert pinning invented.

## Honest limitations

- The default checksum is **FNV-1a** — integrity/corruption detection, **not** a
  security primitive. Production should use SHA-256 (`package:crypto`) against a
  trusted manifest. The `ChecksumPort` is the seam.
- Secure storage is a **capability flag + port**, not yet wired to a
  platform keystore (`DeviceCapabilities.secureStorage`).
- No cryptographic manifest signature verification (out of scope; Prepared).

Nothing here claims more than the code does.
