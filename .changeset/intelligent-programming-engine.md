---
"@senvori/contracts": minor
"@senvori/sdk": minor
"@senvori/api": minor
"@senvori/dashboard": minor
---

Intelligent Programming Engine (Sprint 07): the deterministic compiler grows to
2.0.0 with four engine-level capabilities. Only **advanced rotation categories**
is wired end-to-end (genres → migration `0007` → repository → service → contracts
→ SDK → Dashboard → compiler, with a real-Postgres E2E test). **Cross-day
fatigue**, **affinity-aware deterministic weighting** (not learning) and
**paired-track avoidance** are **Prepared** — the engine and, for the first two, a
persisted policy knob exist, but their production signal/surface is deferred to
Sprint 07B. The tenant rotation policy gains `minCategoryGapMinutes`,
`fatigueWeightPenalty` and `affinityStrength`. The execution plan reports a
`stats.engine` block; the compiler stays pure and deterministic.
