# Programming — SDK & Dashboard (Sprint 06 · F5–F6)

> How the programming backend becomes a usable capability: the typed SDK and the
> "Programação" dashboard experience. Product language only — technical concepts
> (compiler, seed, plan hash) are translated for the user (§7.1, §19).

## F5 — SDK (`@senvori/sdk` · `client.programming`)

The dashboard never talks HTTP directly; every call goes through the SDK, which
reuses `@senvori/contracts` types (no duplication) and surfaces errors as
`SenvoriApiError` (typed `problem.code` + `status`, covering 401/403/404/409/422).

| Method                                     | HTTP                                | Notes                                    |
| ------------------------------------------ | ----------------------------------- | ---------------------------------------- |
| `createProgram(input)`                     | `POST /programs`                    | draft program                            |
| `listPrograms(query?, signal?)`            | `GET /programs`                     | cursor pagination + `status`/`q` filters |
| `getProgram(id)`                           | `GET /programs/:id`                 | includes `publishedVersion`, `itemCount` |
| `updateProgram(id, input)`                 | `PATCH /programs/:id`               | name/description                         |
| `archiveProgram(id)`                       | `POST /programs/:id/archive`        | 204, idempotent                          |
| `listItems(id)`                            | `GET /programs/:id/items`           | ordered content + Library metadata       |
| `setItems(id, { assetIds })`               | `PUT /programs/:id/items`           | replace = add/remove/reorder             |
| `getRotationPolicy()`                      | `GET /programs/rotation-policy`     | tenant-wide                              |
| `upsertRotationPolicy(input)`              | `PUT /programs/rotation-policy`     | tenant-wide                              |
| `preview(id, input, signal?)`              | `POST /programs/:id/preview`        | ephemeral, deterministic, cancellable    |
| `publish(id)`                              | `POST /programs/:id/versions`       | immutable version                        |
| `listVersions(id)` · `getVersion(id, vId)` | `GET /programs/:id/versions[/:vId]` | hash, compiler, publisher                |
| `createAssignment(id, input)`              | `POST /programs/:id/assignments`    | scope (brand/group/unit/…)               |

The tenant is always derived server-side from the authenticated session — it is
never a parameter. **Tests:** `packages/sdk/test/programming.test.ts` (22) —
serialization, query params, pagination, preview (incl. `AbortSignal`), publish
(no body), versions, assignments, and typed error mapping for non-JSON responses.

## F6 — Dashboard "Programação" (`/[locale]/programs`)

Reuses the existing design system (`@senvori/ui`), TanStack Query patterns, the
Library (Catalog) SDK, and the i18n infrastructure. No second design system, no
extra libraries.

### Routes & components

- `programs/page.tsx` — **list**: search (debounced), status filter, cursor "load
  more", columns (name, status, content count, published version, updated). States:
  loading, empty, no-results, error+retry, no-permission, session-expired.
- `programs/new/page.tsx` — **create** in two steps: Identity (name, meaning, type)
  → Content (pick ready tracks from the Library). Creates the draft + sets items,
  then routes to detail.
- `programs/[id]/page.tsx` — **detail**: header (name, status badge, meta), edit
  name/description, publish, archive (inline confirm); sections for Day preview,
  Content, Rotation rules, Scope (assignment), Version history. Archived programs
  are read-only (no editable affordances).
- `components/programs/`:
  - `preview-panel.tsx` — **Day preview** (the primary visual deliverable): unit +
    date + window form → accessible chronological table (local wall-clock times,
    DST-correct), translated warnings, total items/duration, timezone, and an
    abbreviated version identifier with an explanatory hint.
  - `publish-dialog.tsx` — conscious publish: modal `role="dialog"` with focus
    trap, Escape-to-close, focus restore, review summary; copy never implies the
    version reached a Player.
  - `content-selector.tsx` / `content-editor.tsx` — Library-backed picker (add /
    remove / reorder) and the detail content section.
  - `rotation-rules.tsx` — account-wide policy editor (copy makes the scope clear).
  - `assignment-form.tsx` — assign to unit/brand/group (selection is never trusted;
    the API enforces RBAC/RLS and its errors are shown).
  - `versions-list.tsx` — immutable history (version, date, publisher name, item
    count, abbreviated identifier, compiler version).

### Product language (§7.1 / §19)

| Technical        | Shown to the user                      |
| ---------------- | -------------------------------------- |
| execution plan   | Prévia do dia / Day preview            |
| compiler warning | Atenção na programação / Heads up      |
| relaxed rule     | "Uma regra precisou ser flexibilizada" |
| plan hash        | Identificador da versão (abbreviated)  |
| assignment       | Onde será usada / Where it's used      |

Warning codes are mapped in `lib/programs.ts` (`warningKey`) to translated copy,
with a `generic` fallback so future compiler codes never leak raw. Timezone,
duration and date formatting go through `Intl` per locale.

### Accessibility (§21)

Keyboard navigation, visible focus, labelled fields with `aria-describedby`,
`aria-live` regions for loading/error/success, the publish modal's focus trap and
restore, accessible tables with captions and `scope` headers, a textual timeline
(not a color-only graphic), and SVG icons with `aria-label`/`aria-hidden`.

### i18n

All copy in `pt-BR`, `en-US`, `es-ES` under the `programs.*` namespace (plus
`nav.programs`) in `packages/i18n/locales/*.json` — zero hardcoded strings
(enforced by `react/jsx-no-literals`).

### Tests (§25)

`apps/dashboard/test/` (22): `programs.test.ts` — pure helpers (warning mapping,
`M:SS`/`h min` durations, DST-correct wall-clock, hash abbreviation, local date);
`preview-panel.test.tsx` — behavior (empty prompt, generate → translated warning +
timeline row + abbreviated hash, friendly error + retry) with a mocked SDK.
