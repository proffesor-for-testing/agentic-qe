# ADR: Conservative GOAP duration budgets and atomic estimate backfill

Status: Proposed for review

Date: 2026-10-11

Related: Maintainer follow-up #911

## Context

Declared action estimates are persisted and used by planning, but actions without estimates contribute zero duration. Such plans bypass `maxDurationMs`, including the stored-plan reuse path. Startup also backfills missing library estimates through individual updates; a later database failure leaves an earlier subset committed.

## Decision

Budget an undeclared action at 1000 milliseconds in search expansion, returned plan totals, stored reuse totals, and reuse constraint validation. Preserve explicit zero and declared estimates. Run the existing narrowly matched library estimate updates inside one SQLite transaction, and skip this backfill when no missing estimates exist. Preserve the existing definition-match predicate and caller overrides.

## Alternatives

Zero treats missing information as free execution. Rejecting every unestimated action would prevent existing custom actions from participating in plans. A new configuration surface is unnecessary for restoring the previous conservative per-step scale. Separate update commits cannot preserve an all-or-none backfill if an update fails.

## Consequences

Unestimated actions may no longer fit previously accepted tight budgets. The 1000-ms fallback is a planning estimate, not a measured runtime or execution deadline guarantee. A failed duration backfill rolls back its duration updates; this does not make all initialization migrations one transaction. Startup performs a small missing-value query; custom unmatched missing rows retain their existing behavior and do not acquire guessed library estimates.

## Verification

Six public planner cases use newly created task-owned SQLite databases only. Original source fails four cases: single-action, cumulative, and reused-plan missing-estimate budgets plus a trigger-induced later backfill interruption. Explicit zero/declared estimates and successful missing-estimate backfill with override preservation pass as controls. The corrected planning family passes 78 tests. Existing MCP planning tool invocation tests pass 48 cases; this is not a new stdio wire constraint test. Typecheck, scoped lint, and full build pass. Literal full npm test stops under default bail in task-handler failures with exact identities matching the verified original-source baseline; unexecuted files have no verdict. No production learning database or model endpoint was used.
