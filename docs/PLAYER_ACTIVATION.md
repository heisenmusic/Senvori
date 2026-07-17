# Player Activation

Pairing binds a Player to a unit. The operator reads a short code from the Player
and enters it in the Dashboard; the backend confirms out-of-band.

## Flow (`features/activation/activation.dart`)

`ActivationController` drives `request code → poll → confirmed`, over an
`ActivationGateway` port. Phases: `idle → requesting → awaiting → confirmed /
error`. Expiry and invalid codes route to `error` so the UI can offer _try
again_.

`ActivationCode.display` groups the code (`SENV-1234`) for legibility;
`isExpired(now)` uses the injected clock.

## Screen (`features/activation/activation_screen.dart`)

Explains the process, shows the code large and copyable, shows a waiting
indicator, and handles the error state with a retry action. Copy is localized
(pt/en/es).

## Honesty

The default `MockActivationGateway` is deterministic and contacts **no** backend
— it confirms after N polls. No real pairing backend, QR, or token exchange is
implemented this sprint; the gateway port is the seam for it. Any real token a
production gateway returns must be stored via secure storage and **never
logged** — only the short pairing code is ever displayed. Status: **Partial**.
