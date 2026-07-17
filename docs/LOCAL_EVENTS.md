# Local Events (Sprint 08 · §9–§10)

> How Senvori layers editorial inserts, campaign slots and emergencies over a
> resolved base program — as deterministic **overlays**, never as edits to the
> published program. Code: `apps/api/src/modules/scheduling/resolver/local-events.ts`
> and the `local_events` table. Verified by `test/local-events-resolver.spec.ts`
> and the `scheduling`/`scheduling-timeline` suites.

## What a local event is

A local event describes something that should happen _on top of_ the base plan for
a **target scope** within a **local trigger window**. Three categories share one
mechanism:

| Category        | Meaning                                         | Precedence |
| --------------- | ----------------------------------------------- | ---------- |
| `local_event`   | Editorial insert/overlay chosen by the operator | lowest     |
| `campaign_slot` | A booked commercial/campaign moment             | middle     |
| `emergency`     | A safety/override announcement                  | highest    |

Each event has a **kind** describing how it touches the timeline:

- `insert` — place an asset at a timeline offset.
- `overlay` — mix an asset over the base bed, optionally **ducking** it
  (`duckingDb`, negative dB).
- `interrupt` — replace the base for the event's duration.

## From event to overlay

`selectLocalEventOverlays(events, ctx)` is pure. It:

1. **Filters** events to those whose target matches the unit
   (`unit`/`group`/`sync_group`/`tenant`) and that are **in effect** for the local
   date/time — same half-open `[start, end)` window, weekday and inclusive-validity
   rules as the schedule resolver. An empty/cross-midnight window is skipped with an
   `invalid_event_window` warning.
2. **Orders** survivors by precedence — `emergency > campaign_slot > local_event`,
   then higher priority, then id — so higher-precedence interrupts claim their span
   first.
3. **Masks** any lower-precedence event whose timeline span overlaps an already-placed
   `interrupt`, dropping it with a `local_event_masked` warning. This keeps the
   overlay set conflict-free (an emergency interrupt masks a campaign insert underneath
   it).
4. **Presents** the surviving overlays in timeline order (`startOffsetMs`, then
   `kind`, then `sourceReference`) so the set — and therefore the effective-plan
   hash — is independent of load order.

Each overlay carries a `sourceReference` (`local_event:<id>`) and a `reasonCode`
(`local_event_applied`, `campaign_slot_inserted`, `emergency_override`) so the
downstream Player (Not implemented) and any audit reader can explain every element.

## Emergencies

An emergency is an `interrupt` local event in the `emergency` category. When one is
in effect, `selectLocalEventOverlays` sets `emergencyActive: true`, which the
effective plan surfaces and folds into its hash. A **program-level swap** (replacing
the whole base program for the duration, rather than overlaying an interrupt) is
**Prepared** — the model supports it but no runtime executes it yet (ADR-08-03).

## Determinism & safety

The resolver is a pure function: no clock, no DB, no random, no locale. The same
events + context always yield the same ordered overlays, warnings and
`emergencyActive`. Persistence enforces tenant isolation via `FORCE ROW LEVEL
SECURITY`; a local event referencing another tenant's asset is rejected at create
time (400) by an RLS-scoped existence check. Every mutation is audited
(`scheduling.local_event.created|updated|archived`).

## Worked example

At 10:00 a `campaign_slot` insert (10:00–10:05) produces one overlay with
`campaign_slot_inserted`; the effective hash diverges from the bare base. At 14:00
an `emergency` interrupt (14:00–14:10) sets `emergencyActive` and, if a campaign
overlapped, masks it. Outside those windows the effective plan is exactly the base.
This full-day projection is asserted in `test/scheduling-timeline.spec.ts`.
