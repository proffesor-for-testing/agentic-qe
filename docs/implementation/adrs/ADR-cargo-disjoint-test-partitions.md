# ADR: Keep Cargo test categories disjoint

## Status

Accepted for implementation, pending exact-revision validation and independent review.

## Context

Cargo listing returns each discovered test once. The metric collector independently counts names containing integration and e2e, so an e2e test within an integration module appears in both categories. A real dependency-free Rust fixture has three discovered tests but reports unit 1, integration 2 and e2e 1. This makes category sums inconsistent with the native total.

## Decision

Give the existing e2e name classification precedence over integration, matching the disjoint-category treatment already used by other native runners. Preserve the existing case-sensitive name heuristics and discovery command. Unit tests continue to be names matching neither category.

## Scope and cost

Only Cargo categorization changes. No test callbacks execute and no additional tooling invocation is added to production collection. The public MetricCollectorService report continues to expose the same fields. This is heuristic categorization, not semantic knowledge of a project's testing architecture.

## Verification

A private offline Rust fixture is compiled with the installed toolchain. Public countTests and MetricCollectorService collection consume actual Cargo listings; callbacks panic if executed. Original code fails the overlapping-category regression while passing populated-unit and genuinely-empty controls. The fix must report one test in each category and preserve the native total. Applicable build, typecheck, lint and broader test limitations are recorded privately before publication.

The fixed relevant counter family passes all eleven tests across Cargo, Go/pytest partitions, Python fallback and real Vitest discovery, without skips. Build, typecheck and production ESLint pass. Full npm test is invoked and bails on the same four existing task-handler failures; full-suite success is not claimed. Historical PR #891 changed only pytest/Go classification, while open #890 changes Vitest discovery; the remaining Cargo defect is distinct from those implemented scopes.
