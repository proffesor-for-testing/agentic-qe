# ADR-131: Qualify trajectory evidence before durable learning

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-131 |
| **Status** | Proposed — admission contract and additive v12 store implemented; promotion gate pending |
| **Date** | 2026-08-30 |
| **Author** | AQE Core |
| **Review Cadence** | 3 months |
| **Supersedes** | — |
| **Related** | ADR-105, ADR-110, ADR-121, ADR-130, issues #549 and #638 |

## Decision

Binary task success is not sufficient evidence for durable pattern promotion.
AQE uses an immutable, content-hashed learning-evidence manifest that records the
executed outcome, oracle references, environment/revision, process safety signals,
and segment-level contribution. Only causal or supporting segments explicitly
admitted for learning may contribute reusable guidance.

Unknown outcomes, weakened oracles, leakage/shortcuts, and unsafe side effects
cannot be auto-promotable. Missing or inferred evidence routes to human review.
Replay of an identical manifest does not increase independent support.

## Staging and data safety

Schema v12 adds append-only manifests, segments, derivation edges, admissions,
and strict pattern-to-manifest/segment lineage. Existing patterns are backfilled
only as `legacy-unknown`; their mutable `sourceTrajectoryId` is not promoted into
certified lineage. The migration is additive, idempotent, and tested against a
disposable copy with source hash/row-count preservation and SQLite integrity
checks. No production database operation is part of this change.

Existing auto-promotion remains legacy behavior, so this ADR is Proposed and
issue #638 must stay open. The next gate is to require admitted manifests at
`recordUsage()` and cleanup promotion sites and emit promotion/rollback witness
events.
