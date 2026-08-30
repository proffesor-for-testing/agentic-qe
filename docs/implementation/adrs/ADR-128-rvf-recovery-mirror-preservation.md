# ADR-128: Preserve a richer RVF recovery mirror

| Field | Value |
|---|---|
| **Decision ID** | ADR-128 |
| **Status** | Proposed — implementation candidate (dual-host review pending) |
| **Date** | 2026-08-30 |
| **Author** | AQE Core |
| **Related** | ADR-072; issues #563, #574, #629 |

## Context

Migration stage 2 names SQLite as primary and RVF as its recovery mirror. The
generated session-end checkpoint previously deleted the published RVF before
calling `aqe brain export`; the exporter then atomically promoted whatever the
current SQLite contained. After primary loss, a freshly recreated database can
therefore replace the only richer recovery copy with seed rows.

Atomic replacement from #563 protects against interrupted writes, but it does
not distinguish a complete yet destructive export from a safe checkpoint.

## Decision

RVF promotion is fail-closed when the existing readable mirror contains more
patterns than the candidate. The comparison occurs after the candidate is
fully written and closed, immediately before atomic promotion. The existing
store and sidecars remain untouched on refusal.

The generated checkpoint no longer deletes the mirror or id map before export.
An operator may explicitly acknowledge intentional data reduction with
`aqe brain export --force-overwrite-richer`; automation never supplies that
flag. The error directs recovery through `brain import` before retrying.

An unreadable RVF remains replaceable so #563 corruption recovery is not
regressed. Pattern count is the first conservative invariant because it is the
loss demonstrated by #629; broader per-table monotonicity is a follow-up once
table-specific deletion semantics are defined.

## Consequences

- Primary loss cannot silently turn a richer stage-2 mirror into a seed-only
  checkpoint.
- Legitimate manual exports that intentionally reduce pattern count require an
  explicit, auditable override.
- The guard does not automatically restore data. Automatic conflict resolution
  would mutate the primary and needs separate operator-approved recovery
  policy; refusal preserves both sides without guessing.
- A valid mirror that loses only non-pattern tables is not yet detected. The
  candidate/existing manifest should later carry monotonic per-table counts.

## Verification

The #629 integration regression creates two disposable SQLite databases, exports
25 patterns to RVF, attempts a five-pattern replacement, and proves the RVF and
manifest remain byte-identical. It then proves the explicit override replaces
the mirror. No project or production database is opened.
