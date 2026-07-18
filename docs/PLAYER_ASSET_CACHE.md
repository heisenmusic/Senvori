# Player Asset Cache

## Model (`features/asset_cache/cached_asset.dart`)

Each referenced asset has an entry with id, version, source URI, local path,
expected/received bytes, checksum, MIME, duration, attempts, last error, last
access, pinning and priority. Lifecycle:

```
missing → queued → downloading → validating → ready
                                → failed / corrupted
ready → evicted
```

Priority (imminence-driven): `currentItem > nextItems > emergency > today >
future > optional`.

## Download manager (`features/asset_cache/download_manager.dart`)

- Bounded concurrency; deduplicates in-flight requests; priority insertion.
- Writes to a temp file, validates, then **atomically promotes** (temp → rename).
- Checksum, when known, must match or the asset is marked `corrupted` and not
  promoted.
- Transport failures mark `failed` with retryability; the manager itself does not
  sleep for backoff (a `BackoffPolicy` computes deterministic, jittered delays),
  keeping it testable.

Tests (`test/runtime/asset_cache_test.dart`): atomic promote, checksum-mismatch →
corrupted (no promote), transport failure → failed, dedup, and backoff growth.

## Disk management (`features/asset_cache/disk_manager.dart`)

A **pure** eviction planner: given entries + disk stats it returns which
removable assets to evict (coldest first, then lowest priority, deterministic
tie-break) to keep a safety margin and/or an optional Senvori-owned byte limit.
Pinned assets (active plan, emergency, imminent) are never evicted. Every
eviction records a reason. The caller performs the deletes.

## IO adapters (`features/asset_cache/io_adapters.dart`)

`IoFileSystem` does atomic promotion and refuses paths containing `..`. Path
safety is also enforced by `isSafeChildPath` in callers.

`Fnv1aChecksum` is the dependency-free default: it reliably detects
corruption/truncation but is **not** a security primitive. Production integrity
against a malicious source should use SHA-256 (`package:crypto`) — documented
explicitly rather than hidden.

## Not implemented

Own CDN, URL signing, and a real free-space query (the `IoFileSystem.diskStats`
returns a conservative placeholder; disk policy is proven via the pure
`DiskManager` in tests). A platform channel for real disk stats is follow-up.
