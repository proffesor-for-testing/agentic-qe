# ADR: Resume OR-set tag allocation after checkpoint restoration

Status: Proposed for review

Date: 2026-10-11

## Context

OR-set additions use owner, wall-clock timestamp, and a local counter as their identity. Restoring a checkpoint resets the counter to zero. A same-owner addition in the same clock tick can therefore reuse a removed tag and become immediately invisible. Reusing a retained tag also lets an older observed removal erase an independently acknowledged re-addition.

## Decision

Advance the local counter past valid tags belonging to the local owner whenever importing element tags or tombstones. Recognize the existing `owner:timestamp:counter` format with an integer timestamp and a nonnegative safe counter. Keep all imported tags unchanged. Match the complete owner prefix, including colon-containing owner IDs, and validate the remaining two numeric fields.

## Alternatives

Changing tags to UUIDs would change the documented allocation format. Depending on advancing wall-clock time would not protect restoration or clock rollback. Resuming from element tags alone misses compacted states that retain only tombstones.

## Consequences

Restored additions use fresh identities without altering checkpoint schema or merge membership rules. Foreign and malformed tags retain their previous merge behavior but do not affect local allocation. Tags at the numeric exhaustion boundary are not used to advance the counter beyond safe integers. This correction does not coordinate multiple processes deliberately sharing the same owner ID, authenticate imported state, or provide unlimited counter space.

## Verification

Six public cases cover removed-tag restoration, tombstone-only checkpoints, old observed removals, colon-containing owners, malformed/foreign tags, and uninterrupted/different-owner controls. Original source fails four cases with two controls passing. The corrected OR-set/CRDT family passes 115 tests. Typecheck and the full build pass. Scoped lint reports the same unused getActiveTags helper on original and corrected source. Literal full npm test stops under default bail in the task-handler family; each observed failure matches original-source baseline failures. Unexecuted files have no verdict, and neither lint nor the full suite is claimed green.
