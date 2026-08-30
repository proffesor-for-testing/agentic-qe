# ADR-131: Qualify trajectory evidence before durable learning

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-131 |
| **Status** | Proposed — admission contract implemented; store integration pending |
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

This slice deliberately does not migrate or rewrite a learning database. It
establishes the pure admission contract and deterministic tests first. Store
integration must preserve rejected/null evidence and many-to-many lineage in an
additive schema migration tested against a copy, with explicit approval before
any production database operation.

Until that integration lands, existing auto-promotion remains legacy behavior;
this ADR is Proposed and issue #638 must stay open. The next gate is to require
admitted manifests at `recordUsage()` and cleanup promotion sites, with a
well-defined legacy/unknown migration and witness events.
