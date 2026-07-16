# Programming Domain (Sprint 06 · §28)

> Entities, states, versions, assignments, permissions and API of the programming
> foundation. Product-language "program" is backed by the existing `playlists`
> schema (audit: `docs/sprint-06/PRE_IMPLEMENTATION_AUDIT.md`). Audio-first.

## Entities (reused schema + additive migration)

| Concept                     | Table                             | Notes                                                                                                       |
| --------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Program                     | `playlists` (`type` manual/smart) | name, description, status, ownerId                                                                          |
| Program items               | `playlist_items`                  | ordered `assetId` + `position`                                                                              |
| Rotation policy             | `rotation_policies`               | tenant-level track/artist gap + maxPlaysPerDay                                                              |
| Program version (immutable) | `playlist_versions`               | `version`, `resolvedItems`, `context`, **`plan_hash`, `compiler_version`, `published_by`** (migration 0006) |
| Assignment                  | `schedules` + `schedule_entries`  | scope target + a base-music daily entry                                                                     |
| Media asset                 | `catalog.assets` / `tracks`       | source of candidates (title/duration/artist/status)                                                         |

Migration **0006** (`0006_programming_plan_audit.sql`) is additive only:
`ALTER TABLE playlist_versions ADD COLUMN plan_hash | compiler_version | published_by`
(+ FK `published_by → users`). Validated on clean and existing databases.

## States

```
Program:  draft ──publish──► published ──(edit → new version)──► published
   │
   └──archive──► archived   (archived is terminal for edits/publish)
```

- A program is created **draft**. Publishing a version flips it to **published**.
- Editing items/name in a **published** program is allowed and takes effect on the
  next published version (versions are immutable snapshots).
- **archived** programs cannot be edited or published (idempotent archive).

## Versions (immutability — ADR-06-03, §9.3)

- Publishing computes the next `version` (max + 1), snapshots `resolvedItems`
  (ordered ready-track asset ids) + `context` (rules, itemCount, source), a config
  `plan_hash`, `compiler_version`, and `published_by`.
- Version rows are **never updated** — the service has no update path, the
  `(playlist_id, version)` unique index prevents duplicates, and an integration test
  asserts a prior version is unchanged after a later publish.
- You can answer: which version, when (`resolved_at`), by whom (`published_by`), with
  which rules/catalog (`context`/`resolved_items`), which compiler (`compiler_version`).

## Assignment

`POST /v1/programs/:id/assignments` binds a program to a scope
(`tenant|country|brand|group|unit|zone`) by creating a `schedule` (the scope
container) plus a `schedule_entry` (`contentType=playlist`, `contentId=program`,
`FREQ=DAILY`, `00:00–24:00`, layer `base_music`). Full RRULE/daypart resolution is
Scheduling Runtime (Sprint 07) — this is the minimal, schema-honest assignment.

## Preview (ephemeral — ADR-06-06)

`POST /v1/programs/:id/preview` compiles a deterministic plan for a
`{ timezone, localDate, window, unitId?, versionId? }` and returns it **without
persisting**. With `versionId` it uses that version's frozen `resolvedItems` (so a
published version previews identically even after the draft changes). The tenant is
always from the authenticated context — never the request body.

## Permissions (RBAC, deny-by-default)

| Permission                  | Endpoints                                   |
| --------------------------- | ------------------------------------------- |
| `playlists:program:read`    | list/get program, versions, rotation policy |
| `playlists:program:create`  | create program                              |
| `playlists:program:update`  | edit, set items, set rotation policy        |
| `playlists:program:publish` | publish version                             |
| `playlists:program:preview` | preview                                     |
| `playlists:program:archive` | archive                                     |
| `scheduling:program:assign` | create assignment                           |

Roles already grant coverage via wildcards: `curator`/`admin` have `playlists:*`;
`manager`/`admin` have `scheduling:*`. `analyst` (read-only) has none → denied.

## API surface (`/v1/programs`)

| Method  | Path                                              | Permission                           |
| ------- | ------------------------------------------------- | ------------------------------------ |
| POST    | `/programs`                                       | create                               |
| GET     | `/programs`                                       | read (cursor + `status`/`q` filters) |
| GET     | `/programs/:id`                                   | read                                 |
| PATCH   | `/programs/:id`                                   | update                               |
| PUT     | `/programs/:id/items`                             | update                               |
| GET/PUT | `/programs/rotation-policy`                       | read / update                        |
| POST    | `/programs/:id/archive`                           | archive (204)                        |
| POST    | `/programs/:id/preview`                           | preview (200)                        |
| POST    | `/programs/:id/versions`                          | publish                              |
| GET     | `/programs/:id/versions` · `/versions/:versionId` | read                                 |
| POST    | `/programs/:id/assignments`                       | assign                               |

Every mutation runs in one tenant transaction (`withTenant`) with RLS in force and an
atomic audit entry (`recordInTx`): `programming.program.created|updated|items_set|
archived`, `programming.rotation_policy.updated`, `programming.version.published`,
`programming.assignment.created`. Preview is read-only and not audited (§19).

## Errors (structured)

`PROGRAM_NOT_FOUND` (404), `VERSION_NOT_FOUND` (404), `INSUFFICIENT_CATALOG` (400 on
publish without ready content), `INVALID_STATE_TRANSITION` (400 editing/publishing an
archived program), `INVALID_TIMEZONE`/`INVALID_WINDOW` (400 from the compiler), plus
403 (permission) and 401 (unauthenticated) from the global guards.

## Out of scope (Sprint 06)

Manifest/Player/Fleet, signed distribution, proof-of-play, campaigns, RRULE runtime,
dayparts, video/signage — see `docs/MEDIA_EXECUTION_ARCHITECTURE.md` §1 and the
prompt §29.
