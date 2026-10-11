# ADR: JSON-normalized AG-UI state deltas

Status: Proposed for review

Date: 2026-10-11

Related: ADR-053; maintainer follow-up #914

## Context

AG-UI state is transported as JSON, and the delta cache already hashes a JSON-normalized state. However, it computes patches from the original JavaScript objects and clones patches with `structuredClone`. A function-valued property can therefore produce an operation that throws `DataCloneError` when cached, even though JSON transport omits that property. Normalizing only the completed patch is insufficient: JSON would remove the operation's value without removing the add operation.

## Decision

Normalize both state inputs with a JSON round trip before hashing and diffing in `getDelta` and `precompute`. Store and return independent JSON copies of the resulting operations. This aligns patch computation with the existing cache-key semantics and preserves ownership of cached values.

## Alternatives

Keeping `structuredClone` retains values outside the wire contract and the reproduced exception. JSON-cloning patches alone can retain invalid value-less add operations. Introducing a separate serializer or broader state schema would expand this correction beyond the existing JSON contract.

## Consequences

Functions and undefined object properties are omitted, dates become their JSON strings, and undefined array members become null, matching JSON transport. Cyclic values and BigInt continue to be rejected before a cache entry is created. Caller objects and returned patches remain independently owned. Serialization happens before diffing and adds work; this change makes no performance claim or promise to support arbitrary JavaScript objects.

## Verification

Ten regression cases cover JSON normalization, both public cache paths, cache hits, caller ownership, ordinary JSON, cycles, and BigInt. On the original source, the two flat-function cases fail with `DataCloneError` and eight controls pass. The corrected cache family passes 81 tests across seven files. Type checking, scoped lint, and the full package build pass. The literal full `npm test` command was also run with one worker. It stopped under the repository default bail setting after three task-handler failures and 27 passes; each failed test is present in the separately reproduced original-source task-handler failure set. Unexecuted files have no verdict, and this change does not claim a green full suite.
