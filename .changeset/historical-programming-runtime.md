---
"@senvori/contracts": minor
"@senvori/sdk": minor
"@senvori/api": minor
"@senvori/dashboard": minor
---

Historical Programming Runtime (Sprint 07B): the deterministic engine gains
operational memory. A pure `planned_history` provider re-compiles prior local
dates to feed `recentPlays` and the cross-day seam, making **cross-day fatigue**
and **cross-day continuity** Complete without any Proof-of-Play. **Paired-track
avoidance** becomes a full product vertical — migration `0008` `rotation_pairs`
(RLS + FORCE + audit), REST CRUD under `playlists:rotation_pair:*`, SDK methods and
a Dashboard editor. The rotation policy gains `historyLookbackDays` and
`crossDayContinuity`. The compiler stays pure and deterministic; affinity weighting
remains Prepared (no score source, no learning).
