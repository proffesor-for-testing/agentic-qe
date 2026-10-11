# ADR: Count else-if branches once in cognitive metrics

## Status

Implemented, pending immutable revision review and required checks.

## Context

The public CodeMetricsAnalyzer analyzes source files for quality metrics. An else-if line matches both the plain-if and else-if clauses, counting twice and increasing nesting for subsequent sibling branches. Issue #907 requests separating those matches.

## Decision

Exclude else-if lines from the plain-if condition. Preserve the existing else-if weighting, brace bookkeeping, ordinary conditions and all other heuristic rules. This repairs the reported duplicate branch calculation without adding a parser or changing metric extraction.

## Scope and cost

This remains a line-based heuristic, not a complete implementation of Sonar cognitive-complexity semantics. A flat ladder no longer acquires extra nesting through the duplicate plain-if clause. There is one additional regex check per plain-if matching line; no I/O or dependency changes.

## Verification

Public analyzeFile fixtures reproduce two original score failures and four unchanged controls. The original scores are 12 rather than 7 for an if/else-if/else ladder and 23 rather than 11 for the longer ladder. These expected values preserve the existing heuristic branch weighting, not a claim of standardized scores. Fixed cognitive and existing cyclomatic families pass eleven tests, including straight-line, ordinary else and genuinely nested if controls. The initial outside-project temporary fixture was rejected by FileReader before analysis and is explicitly invalidated; authoritative fixtures use a private owned directory inside the project.

Build, typecheck and scoped production ESLint pass. Literal npm test was invoked with one worker and fails in existing task-handler tests; each exact failure identity occurs in the original unbailed baseline. The full suite is not green.
