# ADR-128: Preserve a richer RVF recovery mirror

| Field | Value |
|---|---|
| **Decision ID** | ADR-128 |
| **Status** | Proposed — implementation candidate (dual-host review pending) |
| **Date** | 2026-08-30 |
| **Updated** | 2026-08-30 — adversarial review expanded the guard to all mirrored tables and fail-closed ambiguous inspection |
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

RVF promotion is fail-closed when any mirrored table in the existing readable
mirror contains more rows than the candidate. The comparison occurs after the
candidate is fully written and closed, immediately before atomic promotion.
The existing store and sidecars remain untouched on refusal.

The generated checkpoint no longer deletes the mirror or id map before export.
An operator may explicitly acknowledge intentional data reduction with
`aqe brain export --force-overwrite-richer`; automation never supplies that
flag. The error directs recovery through `brain import` before retrying.

An unreadable RVF remains replaceable so #563 corruption recovery is not
regressed. If the RVF can still be opened and its kernel extracted but a
complete table inventory cannot be established, promotion fails closed as
ambiguous. Intentional deletion from any mirrored table requires the same
explicit operator override as intentional pattern reduction.

## Consequences

- Primary loss cannot silently turn a richer stage-2 mirror into a seed-only
  checkpoint.
- Legitimate manual exports that intentionally reduce pattern count require an
  explicit, auditable override.
- The guard does not automatically restore data. Automatic conflict resolution
  would mutate the primary and needs separate operator-approved recovery
  policy; refusal preserves both sides without guessing.
- Older readable mirrors without a complete table inventory require an
  explicit override; this favors preservation over an unprovable replacement.

## Verification

The #629 integration regressions use disposable SQLite databases and cover:
(1) 25 patterns versus five, (2) equal pattern counts but fewer captured
experiences, (3) a readable mirror with ambiguous kernel metadata, and (4) the
explicit override. The RVF and sidecars remain byte-identical on refusal. The
#563 corrupt-store recovery regression remains green. No project or production
database is opened.
