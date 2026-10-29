# ADR-128: Preserve a richer RVF recovery mirror

| Field | Value |
|---|---|
| **Decision ID** | ADR-128 |
| **Status** | Proposed — implementation candidate (dual-host review pending) |
| **Date** | 2026-08-30 |
| **Updated** | 2026-08-30 — adversarial review expanded the guard to all mirrored tables and fail-closed ambiguous inspection |
| **Amended** | 2026-10-29 — #1251: the Stop-hook checkpoint is compared too, under a checkpoint policy |
| **Author** | AQE Core |
| **Related** | ADR-072; issues #563, #574, #629, #1251 |

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

## Amendment (#1251): the Stop-hook checkpoint

The checkpoint hook (`.claude/helpers/brain-checkpoint.cjs export`) exports
to a temp path and renames it over `aqe.rvf` (#1238), so the guard above had
nothing at its output path to compare with. The hook now names the published
checkpoint with `aqe brain export --compare-with <aqe.rvf>`.

The strict rule would refuse almost every turn: routine retention deletes
mirrored rows between turns (routing-outcome retention, concept-edge pruning,
q-value and trajectory cleanup). The hook therefore passes
`--richness-policy checkpoint`, which refuses only a collapse. A table is
refused when it lost more than half its rows (more than 10% for `qe_patterns`
and `captured_experiences`), and either at least 10 rows or every row from at
least 3. That catches both #629 regressions (25 -> 5, 7 -> 0) and passes
routine retention such as 500 -> 450. A table that the older mirror lacks
counts as empty. A mirror with no table inventory is still ambiguous. Manual
exports keep the strict rule.

On a refusal the hook keeps `aqe.rvf`, logs the reason once, and backs off
for 6h the same way as a too-large export. Skipped turns are silent.
Session-start `verify` reports the pause and how to resume: run
`aqe brain export --force-overwrite-richer` manually, or delete the back-off
marker.

A deliberate shrink (`aqe learning prune --apply`, or dream retention when it
removed rows) writes `.agentic-qe/brain-checkpoint.accept-shrink.json` with
its creation time, its producer (`prune` or `dream`), and the mirrored row
counts right after the shrink. The hook passes it with `--accept-shrink`.
The export honours it in place of the mirror comparison only if it is under
24h old and no table has collapsed since, under the checkpoint policy. Growth
is always fine. Otherwise the hook deletes it, logs that it did, and the
normal policy applies. An honoured acknowledgement is deleted after the export
succeeds. Automation therefore never overrides the guard without a fresh
record of a deliberate shrink that still matches the brain.
