# Player Design System

Premium, restrained, and unmistakably Senvori — not a Flutter template, not an
admin panel, not a Spotify clone.

## Tokens (`design_system/tokens.dart`)

- **Surfaces**: layered near-blacks with a faint warm cast (`surface0..3`).
- **Text**: warm neutrals for calm legibility on dark.
- **Accent**: a single warm amber/gold, used sparingly for emphasis and motion.
- **Semantics**: online / offline / syncing / warning / degraded / emergency —
  always paired with an icon + text, never colour alone.
- Spacing, radii, motion durations and typography scales are centralised.

Dark-first (`SenvoriTheme.dark()`), with a light theme for daytime desktop/demo.

## Three modes (§25), never merged

- **Ambient** — calm, beautiful, safe for permanent display.
- **Operational** — adds status badges and operational detail.
- **Diagnostics** — a separate protected screen for support.

## Ambient artwork (`design_system/ambient_artwork.dart`)

When content has no cover, a **deterministic** abstract field is synthesised from
a seed (`assetId + planHash + visual version`) via a small seeded LCG — the same
content always looks the same, no randomness, no remote images. It is cheap (a
few radial gradients) and its optional `phase` drives a very slow ambient drift
that collapses to a still frame under reduce-motion.

## Components (`design_system/components.dart`)

`StatusBadge`, `PlaybackProgress`, `EmergencyBanner`, `DiagnosticRow`,
`MessageState` — each with semantics for screen readers.

## Motion (§27)

Fast, previsible, interruptible; durations in tokens. Ambient loops are low-cost.
`reduce motion` (via `MediaQuery.disableAnimations`) yields still frames — honored
by the ambient artwork and screens, and covered by tests.

## Responsiveness (§30)

`NowPlayingScreen` switches between a wide (side-by-side hero) and narrow
(stacked, wrapping top bar) layout at 720px. Verified at 390×840 (portrait),
1280×720 and via golden files; long text ellipsizes; three locales fit.

## Accessibility (§44)

Semantic labels, progress exposed as `Semantics.value`, live-region emergency
banner, non-colour-only states, scalable text, visible focus. Widget tests assert
localized copy in en/es and portrait layout without overflow.
