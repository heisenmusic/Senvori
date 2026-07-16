# Catalog & Media Asset Foundation

The catalog is Senvori's operational content base — the source of truth for what
can eventually play, where, and under which declared rights. This sprint builds
the media-asset foundation: secure direct upload, processing, metadata and the
library. Everything here is exercised by `apps/api/test/catalog.spec.ts` against
a real PostgreSQL (app on a non-owner `NOBYPASSRLS` role) and the local storage
driver.

> Scope note: **Licensing is not implemented** here. Assets carry only minimal
> **declared, unverified** provenance (`declared_rights`). The full Licensing
> domain (rights holders, licenses, scopes, availability) is a later sprint.

## Domain model

Built on the existing schema (`apps/api/src/database/schema/catalog.ts`); this
sprint added only additive columns (migration `0005`).

| Table                                           | Responsibility                                                                               | Tenant scope                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `assets`                                        | Media unit: type, status, origin, language, title, duration, `media_info`, `declared_rights` | nullable (`NULL` = platform/shared, shared-read RLS) |
| `tracks` / `announcements`                      | Type extensions (artist/album/genre…; category)                                              | shared-read                                          |
| `uploads`                                       | Upload session: object key, filename, content type, size, checksum, idempotency key          | strict tenant                                        |
| `transcode_jobs`                                | Durable processing queue / outbox                                                            | shared-read                                          |
| `renditions`                                    | Deliverable objects per profile (`original` this sprint)                                     | shared-read                                          |
| `categories` / `tags` / `collections` (+ joins) | Organization                                                                                 | mixed                                                |

Added in `0005` (nullable, backward-compatible): `assets.media_info`,
`assets.declared_rights`; `uploads.storage_key/file_name/content_type/size_bytes/checksum_sha256/idempotency_key/error` (+ unique `(tenant_id, idempotency_key)`).

## Taxonomy

`assets.type` ∈ `track | announcement | video | image | signage_bundle`
(audio-first this sprint: **track** and **announcement**). Finer distinctions
(spot, ident, jingle, voice-over) are expressed through `announcements.category`
and free-form tags/categories, not a rigid enum. Editable metadata is applied
progressively — upload asks only for the essentials (file, type, language,
origin, an auto-suggested title); artist/album/ISRC/genre/energy come later.

## Asset states

```
uploading ──confirm──► processing ──probe ok──► ready
     │                      │
     │                      └──probe/checksum fail──► failed ──reprocess──► processing
     └───────────────────────────── archive (soft delete) ─────────────► archived
```

- **uploading** — session created; bytes not yet confirmed.
- **processing** — object confirmed; queued for probing (async).
- **ready** — checksum + signature verified, metadata extracted, `original` rendition written.
- **failed** — deterministic failure (bad checksum/signature) or exhausted retries.
- **archived** — soft-deleted (`archived_at`); hidden from lists.

Guards: archived/non-ready assets cannot be edited or downloaded; reprocess is
allowed from ready/failed only; invalid transitions return `INVALID_STATE_TRANSITION`.

## Upload flow

```
1. POST /v1/catalog/uploads      → validate, create asset(uploading)+upload(pending), return signed ticket
2. PUT  <ticket.url>  (→ storage)→ client sends bytes directly to storage (never through the API in prod)
3. POST /v1/catalog/uploads/:id/confirm → verify object exists + size, atomically claim pending→completed,
                                           asset→processing, enqueue job
4. processing (async, off-request)      → read + sha-256 + signature + probe → asset→ready|failed
```

- **Idempotency** — `idempotency-key` header dedupes upload creation; the
  pending→completed claim is a single atomic UPDATE so concurrent confirms
  produce exactly one asset/job; the `original` rendition has a unique
  `(asset, profile)` constraint.
- **Validation** — content type allow-list (WAV/MP3/AAC-M4A/FLAC), size ceiling
  (`CATALOG_MAX_UPLOAD_BYTES`), object existence + size at confirm, and
  **checksum + magic-byte signature** during processing. The browser MIME is
  never trusted alone.

## Storage

`StorageProvider` abstraction (`modules/catalog/storage/`), selected by
`STORAGE_DRIVER`:

- **local** (dev/test) — filesystem under `STORAGE_LOCAL_DIR`; upload/download go
  through the API's signed, expiring blob endpoint (`/v1/catalog/_storage/:token`,
  HMAC over key+op+expiry), mirroring presigned semantics.
- **r2** (production) — Cloudflare R2 via the S3 API with presigned PUT/GET URLs.

**Object keys** are system-generated only: `tenants/{tenantId}/catalog/uploads/{uploadId}/original.{ext}`.
No user input in the path (no traversal, no collision, no tenant mixing); the
original filename is stored as metadata. Buckets are **private** — access is
only ever via short-lived single-object URLs. Downloads require `ready` status
and are audited; the signed URL is never persisted.

## Processing & retries

Trigger-driven and **tenant-scoped**, so it runs under the `NOBYPASSRLS` app role
without a cross-tenant scan (`transcode_jobs` is the queue). Heavy work (read +
sha-256 + `music-metadata` probe — pure JS, no ffmpeg/shell, no injection
surface) runs **outside** any transaction, so confirm returns fast. Each job is
claimed atomically (status guard), extracts `container/codec/duration/sampleRate/
channels/bitrate`, then commits `ready` + the `original` rendition + a system
audit row. Transient failures retry (bounded, `attempts`); deterministic ones
(bad checksum/signature) fail immediately. Waveform/normalized derivatives and a
BullMQ/Redis-backed queue are documented future work.

## Permissions (RBAC)

Tenant-scoped this sprint. `catalog:item:read/create/update/archive`,
`catalog:asset:upload/download/reprocess`, `catalog:metadata:manage`,
`catalog:rights:read/manage`. Roles: **owner/admin/curator** full (curator =
content manager); **manager** read + download; **analyst** read-only. Upload and
edits are never granted to read-only roles.

## Audit

Every administrative mutation (upload create/confirm, item update, archive,
reprocess, sensitive download) writes an `audit_log_entries` row **in the same
transaction** as the change (`recordInTx`) — atomic, with real before/after.
Processing outcomes are recorded as `system` actor. Never stored: binary
content, signed URLs, tokens, credentials.

## Security summary

RLS + tenant + membership + permission on every request; content-type/extension/
size/checksum/signature validation; system-only object keys; private buckets +
short-lived URLs; no shelling out to media tools (pure-JS probe); id-based keys
resist enumeration; upload size ceiling and bounded processing.

## Configuration

See `.env.example`. Key vars: `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`,
`CATALOG_MAX_UPLOAD_BYTES`, `CATALOG_UPLOAD_TTL_SECONDS`,
`CATALOG_DOWNLOAD_TTL_SECONDS`, and (R2 only) `R2_ENDPOINT/BUCKET/ACCESS_KEY_ID/
SECRET_ACCESS_KEY/REGION`. Never commit real keys; buckets stay private.

## Running locally & tests

```bash
# API (local storage driver by default)
pnpm --filter @senvori/api dev

# Integration tests (real Postgres + local storage round-trip)
cd apps/api && pnpm test   # nest build && vitest run
```

`test/catalog.spec.ts` covers RLS/authz, upload validation, idempotency, the
upload→confirm→process state machine with extracted metadata, download gating,
reprocess, pagination/search/filters, soft delete, standardized errors,
transactional audit and concurrency — 27 tests, no storage mocks for the flow.

## Limitations / future work

- Full checksum/signature verification runs in processing (async), not at
  confirm, so confirm stays fast; the processor buffers the object (bounded by
  the size ceiling) — a streaming pipeline is future work for very large media.
- No BullMQ/Redis yet: `transcode_jobs` + a trigger-driven, tenant-scoped worker
  is the MVP; a background reconciler for stuck jobs needs the ops (BYPASSRLS)
  role and is deferred.
- No derived renditions (normalized/preview/waveform) or in-browser player.
- **Licensing** is not implemented — only declared, unverified provenance.
- Quotas/retention per tenant are not enforced (schema has no quota columns).
