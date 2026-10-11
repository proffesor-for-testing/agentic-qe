# ADR: Complete CRDT delivery across a trimmed delta checkpoint

Status: Proposed for review

Date: 2026-10-11

## Context

Delta history is bounded by `maxDeltaHistory`. When a caller requests a checkpoint older than the retained suffix, `getDelta` previously labeled that suffix as covering the entire requested interval. A fresh peer silently misses earlier values, and an existing peer misses discarded OR-set removal tombstones.

## Decision

If the requested version precedes the oldest retained delta's starting version, return current complete state in the existing delta envelope. Include registers, G-counters, PN-counters, and OR-sets with their tombstones. Preserve incremental delivery inside the retained window and null results for up-to-date peers.

## Alternatives

Returning the suffix falsely claims complete coverage. Returning null would be indistinguishable from an up-to-date peer. Throwing or adding a new resynchronization wire message would change the existing consumer API unnecessarily; its merge operations already accept the same full CRDT maps.

## Consequences

Lagging peers receive a larger response proportional to current state. Counter merge semantics and OR-set tombstones make repeat delivery safe for values and membership. The existing store's local deletion methods have no distributed key-deletion tombstones; this change does not create such a protocol or promise propagation of deleted container keys. Empty/disabled history behavior is unchanged.

## Verification

Five public cases exercise JSON-transported deltas applied to fresh and stale peers, all four CRDT types, observed member removal, repeated counter delivery, in-window updates, up-to-date null results, and ordinary retained-history delivery. Original source fails the fresh and stale cases while three controls pass. Corrected CRDT tests pass 98 cases. Typecheck, scoped lint, and full build pass. Literal full npm test stops under default bail on task-handler failures whose exact identities match original-source baseline failures. Unexecuted files have no verdict; no full-suite-green claim is made.
