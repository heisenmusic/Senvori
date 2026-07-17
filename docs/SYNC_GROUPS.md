# Sync Groups (Sprint 08 · §15)

> How multiple units share one programming identity, and what "in sync" means
> before there is a Player to keep them in lockstep. Code: the `sync_group` target
> type in `apps/api/src/modules/scheduling/resolver/resolver.ts` and the shared
> **base plan hash**. Sync _modes_ are modelled and documented here; their runtime
> **enforcement** is Prepared (there is no Player yet, §35).

## The shared identity: base plan hash

A **sync group** is a scope that several units resolve against. When a unit belongs
to a sync group and the resolver selects a `sync_group` assignment, every unit in
that group resolves the **same program version** and therefore the **same base plan
hash** (`playlist_versions.planHash`). The base plan hash is that group's shared
identity: it is computed once from the published sequence and is identical across
units, independent of any per-unit local time.

Per-unit variation lives entirely in the **effective plan**: local events overlay
the shared base, so two units in the same group can carry different overlays (a
local campaign in one city, an emergency in another) while still sharing the base.
This separation — shared base, per-unit effective — is the backbone of soft sync.

## Sync modes

| Mode          | Intent                                                                                                                                                               | Status                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `soft`        | Units share the base plan; each may drift and carry its own local overlays. Convergence on the base is guaranteed by the shared hash, not by sample-accurate timing. | **Supported** — the shared base hash _is_ soft sync.                  |
| `hard`        | Units play the same sequence position sample-accurately (lockstep). Requires a Player and a clock-distribution/transport protocol.                                   | **Prepared** — modelled, not enforceable without a Player.            |
| `independent` | Units in the group deliberately resolve on their own; no shared position.                                                                                            | **Supported** — expressed by not assigning at the `sync_group` scope. |

Soft and independent are fully expressible today through the assignment model:
assign at `sync_group` scope for shared programming, or at `unit` scope for
independence. Hard sync needs runtime transport that does not exist in this sprint,
so it is documented as **Prepared** rather than claimed as working.

## Why hard sync is honestly Prepared

Hard sync is not a scheduling decision — it is a **playback transport** concern:
distributing a common clock, aligning buffer positions and correcting drift across
devices. Scheduling can name the group and pin the shared base plan (the necessary
precondition), but nothing in Sprint 08 decodes or emits audio, so nothing can hold
units in lockstep. Claiming hard sync as functional would be dishonest; the model
is in place so that a future Fleet/Player sprint can implement enforcement without
reshaping the schema.

## Determinism

Because the base plan hash is derived purely from the published sequence, all units
in a sync group compute an identical value with no coordination. The effective plan
then layers each unit's in-effect overlays deterministically. There is no shared
mutable state and no clock in the resolution path — group membership is just another
explicit input to a pure function.
