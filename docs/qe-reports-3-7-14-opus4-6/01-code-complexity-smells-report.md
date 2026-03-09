# Code Complexity & Code Smells Report -- AQE v3.7.14

**Analyzer**: V3 QE Code Complexity Analyzer (Opus 4.6)
**Date**: 2026-03-09
**Scope**: `/workspaces/agentic-qe-new/src/`
**Baseline**: v3.7.10 (prior analysis)

---

## Executive Summary

| Metric | v3.7.10 | v3.7.14 | Delta | Trend |
|--------|---------|---------|-------|-------|
| Source files (.ts) | 1,077 | 1,083 | +6 (+0.6%) | STABLE |
| Total LOC | 510,932 | 513,351 | +2,419 (+0.5%) | STABLE |
| Total functions (est.) | 27,746 | ~28,000 | +~254 (+0.9%) | STABLE |
| Critical functions (CC>50) | 14 | 19 | **+5 (+36%)** | REGRESSION |
| High functions (CC>20) | -- | 116 | (new metric) | -- |
| God files (>2000 lines) | 0 | 0 | 0 | GOOD |
| Files >1000 lines | -- | 82 | (new metric) | -- |
| Files >500 lines | 429 | 429 | 0 | STABLE |
| `as any` casts | 2 | 2 | 0 | GOOD |
| `any` type annotations | -- | 34 | (new metric) | -- |
| `console.*` calls | 3,266 | 3,291 | +25 (+0.8%) | STABLE |
| Silent catch blocks | 1 | 172 | **+171** | REGRESSION* |
| `@ts-ignore` / `@ts-expect-error` | 0 | 0 | 0 | GOOD |
| TODO / FIXME / HACK | 65 | 63 | -2 (-3%) | IMPROVING |
| Magic numbers (timeout/delay) | 451 | 456 | +5 (+1.1%) | STABLE |
| Deep nesting (>=6 levels) | 341 | 366 | +25 (+7.3%) | DEGRADING |
| Top offender CC | createHooksCommand CC=116 | createHooksCommand CC=141 | **+25** | REGRESSION |

*Note: The silent catch block count increase from 1 to 172 is likely a measurement methodology change. The v3.7.10 baseline used a simpler regex that missed most instances. The current analysis uses multi-line Python parsing which captures catch blocks whose body is empty or contains only a comment. Of the 172 found, ~150 contain explanatory comments (e.g., `// Continue to error`) and ~20 are truly empty.*

### Key Findings

1. **5 new critical-complexity functions** have appeared since v3.7.10, bringing the total from 14 to 19. The top offender `createHooksCommand` has grown from CC=116 to CC=141.
2. **Zero god files** (>2000 lines) -- a positive constraint that has held since v3.7.10.
3. **Type safety remains strong**: only 2 `as any` casts and 34 `any` annotations across 513K LOC; 857 uses of `unknown` indicate deliberate safe typing.
4. **172 silent/comment-only catch blocks** represent a testability and observability risk.
5. **96 switch statements without `default`** clauses could produce unexpected behavior on new enum values.
6. **125 nested ternaries** reduce readability in hot paths.

---

## 1. File Metrics

### Size Distribution

| Band | File Count | % of Total |
|------|-----------|------------|
| 1--100 lines | 140 | 12.9% |
| 101--200 lines | 136 | 12.6% |
| 201--300 lines | 102 | 9.4% |
| 301--500 lines | 276 | 25.5% |
| 501--1000 lines | 347 | 32.0% |
| 1001--2000 lines | 82 | 7.6% |
| >2000 lines | 0 | 0.0% |
| **Total** | **1,083** | **100%** |

**Observation**: 39.6% of files (429) exceed the 500-line guideline from CLAUDE.md. The 82 files over 1000 lines are the primary candidates for decomposition.

### Top 20 Largest Files

| # | File | LOC |
|---|------|-----|
| 1 | `src/learning/qe-reasoning-bank.ts` | 1,941 |
| 2 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 |
| 3 | `src/domains/contract-testing/services/contract-validator.ts` | 1,824 |
| 4 | `src/domains/test-generation/services/pattern-matcher.ts` | 1,769 |
| 5 | `src/domains/learning-optimization/coordinator.ts` | 1,750 |
| 6 | `src/cli/completions/index.ts` | 1,730 |
| 7 | `src/coordination/mincut/time-crystal.ts` | 1,714 |
| 8 | `src/cli/commands/hooks.ts` | 1,702 |
| 9 | `src/domains/chaos-resilience/coordinator.ts` | 1,701 |
| 10 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,699 |
| 11 | `src/domains/test-generation/coordinator.ts` | 1,673 |
| 12 | `src/coordination/protocols/security-audit.ts` | 1,642 |
| 13 | `src/shared/llm/router/types.ts` | 1,637 |
| 14 | `src/domains/visual-accessibility/coordinator.ts` | 1,636 |
| 15 | `src/domains/code-intelligence/services/c4-model/index.ts` | 1,603 |
| 16 | `src/governance/ab-benchmarking.ts` | 1,583 |
| 17 | `src/coordination/protocols/quality-gate.ts` | 1,567 |
| 18 | `src/coordination/mincut/neural-goap.ts` | 1,558 |
| 19 | `src/domains/code-intelligence/coordinator.ts` | 1,537 |
| 20 | `src/domains/visual-accessibility/services/visual-regression.ts` | 1,498 |

All 20 files are between 1,498 and 1,941 lines -- close to the 2,000-line god-file threshold. Five of the top 20 are domain coordinators, suggesting a pattern of coordinator bloat.

### LOC by Top-Level Directory

| Directory | LOC | Files | Avg LOC/File |
|-----------|-----|-------|-------------|
| domains | 135,135 | 252 | 536 |
| integrations | 63,571 | 129 | 493 |
| coordination | 51,632 | 108 | 478 |
| adapters | 42,460 | 75 | 566 |
| mcp | 40,182 | 97 | 414 |
| shared | 27,959 | 73 | 383 |
| learning | 24,191 | 31 | 780 |
| cli | 23,855 | 58 | 411 |
| init | 14,330 | 50 | 287 |
| governance | 13,840 | 16 | 865 |
| strange-loop | 8,034 | 19 | 423 |
| kernel | 6,725 | 19 | 354 |
| workers | 6,216 | 17 | 366 |
| routing | 5,207 | 13 | 400 |

**Hotspot directories**: `learning` (780 avg LOC/file), `governance` (865 avg LOC/file), and `adapters` (566 avg LOC/file) have the highest average file sizes, indicating concentrated complexity.

### LOC by Domain

| Domain | LOC | Files |
|--------|-----|-------|
| requirements-validation | 20,461 | 38 |
| test-generation | 17,153 | 42 |
| test-execution | 14,444 | 29 |
| visual-accessibility | 13,694 | 17 |
| code-intelligence | 11,019 | 18 |
| security-compliance | 9,411 | 24 |
| quality-assessment | 7,859 | 18 |
| learning-optimization | 7,790 | 13 |
| coverage-analysis | 7,461 | 13 |
| enterprise-integration | 6,726 | 11 |
| contract-testing | 6,644 | 8 |
| chaos-resilience | 6,159 | 8 |
| defect-intelligence | 5,332 | 9 |

---

## 2. Critical Complexity Functions (CC > 50)

19 functions exceed the critical cyclomatic complexity threshold of 50, up from 14 in v3.7.10.

| # | Function | File:Line | CC | Lines | Status vs v3.7.10 |
|---|----------|-----------|---:|------:|-------------------|
| 1 | `createHooksCommand` | `src/cli/commands/hooks.ts:584` | 141 | 1,108 | WORSENED (was 116) |
| 2 | `parseGraphQLField` | `src/domains/contract-testing/services/contract-validator.ts:1219` | 131 | 606 | WORSENED (was ~120) |
| 3 | `calculateComplexity` | `src/domains/defect-intelligence/services/defect-predictor.ts:653` | 122 | 515 | WORSENED (was ~110) |
| 4 | `createMigrateCommand` | `src/cli/commands/migrate.ts:18` | 116 | 627 | NEW critical |
| 5 | `extractJson` | `src/domains/test-execution/services/flaky-detector.ts:644` | 94 | 652 | NEW critical |
| 6 | `createCRDTStore` | `src/memory/crdt/crdt-store.ts:74` | 82 | 571 | NEW critical |
| 7 | `run` (phase 09-assets) | `src/init/phases/09-assets.ts:40` | 81 | 242 | NEW critical |
| 8 | `generateClassTests` (pytest) | `src/domains/test-generation/generators/pytest-generator.ts:237` | 81 | 235 | NEW critical |
| 9 | `inferImplementationFromBehavior` | `src/domains/test-generation/services/tdd-generator.ts:275` | 70 | 82 | Existing |
| 10 | `createSecurityCommand` | `src/cli/commands/security.ts:13` | 69 | 220 | Existing |
| 11 | `generateAssertionsFromBehavior` | `src/domains/test-generation/services/tdd-generator.ts:63` | 65 | 100 | Existing |
| 12 | `generateTestCasesForFunction` | `src/domains/test-generation/generators/base-test-generator.ts:124` | 64 | 243 | Existing |
| 13 | `calculateComplexity` (project-analyzer) | `src/init/project-analyzer.ts:566` | 62 | 159 | Existing |
| 14 | `createTestCommand` | `src/cli/commands/test.ts:13` | 61 | 259 | Existing |
| 15 | `queryKGDependencies` | `src/domains/test-generation/services/test-generator.ts:899` | 60 | 316 | Existing |
| 16 | `generateClassTests` (mocha) | `src/domains/test-generation/generators/mocha-generator.ts:177` | 54 | 209 | Existing |
| 17 | `createCodeCommand` | `src/cli/commands/code.ts:13` | 54 | 231 | Existing |
| 18 | `loadPretrainedPatterns` | `src/learning/qe-reasoning-bank.ts:486` | 51 | 740 | Existing |
| 19 | `createQEHookHandlers` | `src/learning/qe-hooks.ts:124` | 51 | 468 | Existing |

### High Complexity Functions (CC 21--50): 116 total

These are not individually listed but represent a significant testing burden. The test-generation domain alone contributes ~30 of these.

---

## 3. Complexity Density Hotspots

Files with the highest ratio of decision points to lines of code (complexity per LOC):

| Density | Decisions | LOC | File |
|---------|-----------|-----|------|
| 0.403 | 123 | 305 | `src/domains/test-generation/services/test-data-generator.ts` |
| 0.392 | 149 | 380 | `src/domains/test-generation/services/tdd-generator.ts` |
| 0.328 | 110 | 335 | `src/domains/test-generation/services/property-test-generator.ts` |
| 0.287 | 157 | 547 | `src/domains/code-intelligence/services/metric-collector/loc-counter.ts` |
| 0.272 | 63 | 232 | `src/cli/commands/security.ts` |
| 0.270 | 83 | 307 | `src/init/phases/09-assets.ts` |
| 0.264 | 131 | 497 | `src/coordination/task-dag/dag.ts` |
| 0.259 | 122 | 471 | `src/domains/test-generation/generators/pytest-generator.ts` |
| 0.244 | 166 | 680 | `src/domains/test-generation/generators/go-test-generator.ts` |
| 0.241 | 122 | 506 | `src/mcp/tools/qx-analysis/heuristics-engine.ts` |

A density above 0.25 means roughly 1 in 4 lines is a branching decision. The test-generation domain dominates this list -- its generators are inherently branchy but would benefit from table-driven approaches.

---

## 4. Code Smell Categories

### 4.1 Type Safety

| Smell | Count | Severity | Notes |
|-------|------:|----------|-------|
| `as any` casts | 2 | Low | Both in test generators (producing test output strings) |
| `any` type annotations | 34 | Medium | Scattered; prefer `unknown` with narrowing |
| `Record<string, any>` | 4 | Medium | Use typed records or `Record<string, unknown>` |
| `any[]` / `Array<any>` | 4 | Medium | Use typed arrays |
| `unknown` type usage | 857 | N/A (positive) | Indicates intentional safe typing |
| `@ts-ignore` / `@ts-expect-error` | 0 | N/A (positive) | Clean |
| Non-null assertions (`!`) | 659 | Medium | Prefer optional chaining or explicit null checks |

**`as any` locations** (both are in generated test code strings, acceptable):
- `src/domains/test-generation/generators/jest-rn-generator.ts:593`
- `src/domains/test-generation/generators/jest-vitest-generator.ts:231`

### 4.2 Error Handling

| Smell | Count | Severity | Notes |
|-------|------:|----------|-------|
| Silent catch blocks (empty body) | ~20 | High | Swallow errors with zero observability |
| Silent catch blocks (comment only) | ~152 | Medium | Have intent but no logging or re-throw |
| `error instanceof Error` checks | 408 | Info | Standard pattern |
| `toErrorMessage()` utility usage | 565 | Info (positive) | Centralised error stringification |
| `new Promise()` constructor | 106 | Low | Some are legitimate; check for anti-patterns |
| `.then()` chains | 24 | Low | Minimal; async/await preferred |

**Top silent catch block hotspots**:
- `src/init/phases/10-workers.ts` -- 3 truly empty catch blocks
- `src/domains/test-execution/` -- 10 silent catches across services
- `src/domains/contract-testing/` -- 5 silent catches

### 4.3 Console Usage

| Type | Count |
|------|------:|
| `console.log` | 2,428 |
| `console.error` | 399 |
| `console.warn` | 343 |
| `console.debug` | 106 |
| `console.info` | 21 |
| **Total** | **3,297** |

**Assessment**: 3,297 console calls across 513K LOC is high. The CLI layer legitimately uses console for user output, but domain and service layers should use the structured logger at `src/logging/logger.ts`. Rough estimate: ~1,500 of these are in CLI/init (expected), ~1,800 are in domain/service/coordination layers (should migrate to logger).

### 4.4 Magic Numbers

| Category | Count |
|----------|------:|
| Timeout/delay/ttl/expire/retries/threshold | 456 |
| Port numbers | 3 |

Common hardcoded values found: `60000`, `30000`, `10000`, `5000`, `3000` (ms). These should be extracted into named constants or configuration.

### 4.5 Structural Smells

| Smell | Count | Severity |
|-------|------:|----------|
| Deep nesting (6+ levels, 24+ spaces) | 366 | High |
| Switch without `default` clause | 96 | Medium |
| Nested ternary expressions | 125 | Medium |
| TODO comments | 63 | Low |
| FIXME comments | 9 | Medium |
| HACK comments | 8 | Medium |
| Files >500 lines (CLAUDE.md limit) | 429 | Medium |
| Long parameter lists (>100 chars) | 1 | Low |

### 4.6 God Classes (>15 methods)

| Methods | Class | File |
|--------:|-------|------|
| 84 | `SurfaceGenerator` | `src/adapters/a2ui/renderer/surface-generator.ts` |
| 77 | `SubscriptionStore` | `src/adapters/a2a/notifications/subscription-store.ts` |
| 74 | `OAuth21Provider` | `src/mcp/security/oauth21-provider.ts` |
| 73 | `InMemoryClaimRepository` | `src/coordination/claims/claim-repository.ts` |
| 71 | `SurfaceStateBridge` | `src/adapters/a2ui/integration/surface-state-bridge.ts` |
| 69 | `WebSocketConnectionManager` | `src/mcp/transport/websocket/connection-manager.ts` |
| 68 | `QueenCoordinator` | `src/coordination/queen-coordinator.ts` |
| 68 | `OscillatorNeuron` | `src/coordination/mincut/kuramoto-cpg.ts` |
| 67 | `TaskRouter` | `src/adapters/a2a/tasks/task-router.ts` |
| 67 | `TaskDAG` | `src/coordination/task-dag/dag.ts` |

Classes with 60+ methods indicate Single Responsibility Principle violations. `SurfaceGenerator` at 84 methods is the worst offender and should be decomposed into sub-generators (layout, styling, accessibility, etc.).

### 4.7 High Fan-In Files (Import Dependencies)

| Imports | File |
|--------:|------|
| 44 | `src/cli/index.ts` |
| 28 | `src/kernel/kernel.ts` |
| 28 | `src/domains/code-intelligence/coordinator.ts` |
| 27 | `src/coordination/queen-coordinator.ts` |
| 25 | `src/mcp/tools/registry.ts` |
| 24 | `src/domains/test-generation/services/test-generator.ts` |
| 22 | `src/domains/quality-assessment/coordinator.ts` |
| 21 | `src/integrations/ruvector/index.ts` |
| 21 | `src/domains/test-execution/coordinator.ts` |

`src/cli/index.ts` with 44 imports is an expected aggregation point. However, `kernel.ts` and coordinators with 20+ imports indicate tight coupling.

### 4.8 Duplicate/Repetitive Patterns

| Pattern | Occurrences | Notes |
|---------|------------|-------|
| `throw new Error(...)` | 663 | Standard; consider typed error classes where missing |
| `JSON.parse` / `JSON.stringify` | 462 | Many could use `safeJsonParse` |
| `this.emit(...)` | 172 | EventEmitter pattern; check for event name consistency |
| Logger calls via `this.logger.*` | 97 | Low -- most code uses console instead |

---

## 5. Trend Analysis (v3.7.10 to v3.7.14)

### Positive Trends
- **Zero god files** maintained -- the 2,000-line ceiling holds.
- **Zero `@ts-ignore`/`@ts-expect-error`** maintained -- strong type discipline.
- **`as any` casts stable at 2** -- deliberate constraint holding.
- **TODO/FIXME/HACK reduced** from 65 to 63 -- slight cleanup.
- **`unknown` usage at 857** -- demonstrates safe typing culture.

### Negative Trends
- **Critical functions grew 36%** (14 to 19): 5 new functions crossed the CC>50 threshold.
- **Top offender CC increased** from 116 to 141 (`createHooksCommand`).
- **Deep nesting increased 7.3%** (341 to 366 lines at 6+ indent levels).
- **Console calls increased** slightly (+25), suggesting new code is not always using the structured logger.

### Stagnant Issues
- **429 files >500 lines** -- unchanged, meaning no progress on the CLAUDE.md file-length guideline.
- **Magic numbers** at 456 -- no reduction in hardcoded timeout/delay values.

---

## 6. Recommendations

### P0 -- Critical (Address Before Next Release)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 1 | `createHooksCommand` CC=141, 1,108 lines | Decompose into `registerSubcommand()` functions per hook type. Extract action handlers into separate files. | Reduces CC to ~15-20 per function. Enables targeted testing. |
| 2 | `parseGraphQLField` CC=131, 606 lines | Replace recursive parsing with a table-driven state machine or use an established GraphQL parsing library. | Reduces CC to ~20. Eliminates a fragile hand-rolled parser. |
| 3 | `calculateComplexity` (defect-predictor) CC=122 | Factor out per-metric calculators (cyclomatic, cognitive, Halstead) into separate functions. | 3 functions at CC ~40 each, each independently testable. |
| 4 | `createMigrateCommand` CC=116 (NEW) | Same pattern as hooks: extract migration handlers per migration type. | CC ~20 per handler. |
| 5 | 20 truly empty catch blocks | Add at minimum a `console.debug` or structured log call. For production code, re-throw or return an error result. | Improves debuggability. Prevents silent failures in production. |

### P1 -- High (Address in Next Sprint)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 6 | 152 comment-only catch blocks | Audit each: add logging for non-obvious cases; convert to error returns where failures matter. | Improved observability. |
| 7 | 96 switch statements without `default` | Add `default: throw new Error('Unhandled case')` or `default: break` with a comment explaining exhaustiveness. | Prevents silent bugs when enums grow. |
| 8 | 5 coordinator files at 1,500--1,750 lines | Extract service orchestration into separate classes. Coordinators should delegate, not implement. | Files drop to 500--700 lines. |
| 9 | `SurfaceGenerator` (84 methods) | Split into `LayoutGenerator`, `StyleGenerator`, `AccessibilityGenerator`, etc. | Each sub-generator <20 methods. |
| 10 | ~1,800 console calls in domain/service layers | Replace with structured logger. Add lint rule `no-console` for `src/domains/`, `src/coordination/`, `src/learning/`. | Consistent log levels. Enables log aggregation. |

### P2 -- Medium (Address Over Next Quarter)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 11 | 456 magic numbers in timeouts/delays | Extract into `src/shared/constants/timeouts.ts` with named exports. | Self-documenting code. Single place to tune performance. |
| 12 | 366 deeply nested lines | Apply early-return pattern, extract nested logic into helper functions. | Improves readability and testability. |
| 13 | 125 nested ternaries | Refactor to if/else or extract into named helper functions. | Readability improvement. |
| 14 | 659 non-null assertions (`!`) | Replace with optional chaining (`?.`) or explicit null guards. | Prevents runtime TypeErrors. |
| 15 | 34 `any` type annotations | Replace with `unknown` + type narrowing or proper typed interfaces. | Stronger type safety. |
| 16 | 429 files >500 lines | Systematically decompose, starting with files >1000 lines. Enforce with lint rule. | Aligns with CLAUDE.md guideline. |

### P3 -- Low (Continuous Improvement)

| # | Issue | Action | Impact |
|---|-------|--------|--------|
| 17 | Test generators have high complexity density (0.25--0.40) | Use table-driven test generation with language config objects instead of branching per language. | Reduces generator CC by 50-70%. |
| 18 | 462 raw `JSON.parse`/`JSON.stringify` calls | Audit for cases that should use `safeJsonParse` to prevent crash on malformed input. | Robustness improvement. |
| 19 | 63 TODO / 9 FIXME / 8 HACK markers | Triage: convert to issues for genuine work items, remove stale ones. | Reduces noise. |
| 20 | `kernel.ts` and coordinators with 20+ imports | Introduce barrel exports or facade modules to reduce direct dependency counts. | Cleaner dependency graph. |

---

## 7. Testability Assessment

Based on the complexity analysis, the overall testability score is estimated at **62/100 (MODERATE)**.

| Factor | Score | Weight | Contribution |
|--------|------:|-------:|-------------|
| Function complexity (CC) | 55 | 30% | 16.5 |
| File size compliance | 60 | 15% | 9.0 |
| Type safety | 90 | 15% | 13.5 |
| Error handling coverage | 50 | 15% | 7.5 |
| Nesting depth | 55 | 10% | 5.5 |
| Coupling (imports) | 65 | 10% | 6.5 |
| Code smell density | 60 | 5% | 3.0 |
| **Weighted Total** | | **100%** | **61.5** |

### Estimated Testing Effort for Critical Functions

| Function | CC | Est. Test Cases | Est. Hours |
|----------|---:|---------------:|----------:|
| createHooksCommand | 141 | ~180 | 24h |
| parseGraphQLField | 131 | ~160 | 20h |
| calculateComplexity | 122 | ~150 | 18h |
| createMigrateCommand | 116 | ~140 | 16h |
| extractJson | 94 | ~110 | 14h |
| **Top 5 total** | | **~740** | **~92h** |

After recommended refactoring, the same coverage could be achieved in an estimated 25-30 hours (70% reduction).

---

## 8. Methodology Notes

- **Cyclomatic Complexity (CC)**: Estimated by counting decision points (`if`, `else if`, `for`, `while`, `case`, `catch`, `??`, `&&`, `||`) plus 1 for the function entry. This is a heuristic; actual CC requires control flow graph analysis.
- **Function boundaries**: Detected via regex matching of function declarations, method definitions, and arrow functions with brace-counting for scope. Some anonymous callbacks and nested functions may be missed or double-counted.
- **Deep nesting**: Measured as lines with 24+ leading spaces (6 levels of 4-space indent or 12 levels of 2-space indent). Lines that are purely comments or blank are excluded.
- **Silent catch blocks**: Matched with multi-line regex as catch blocks whose body is empty or contains only a single-line comment.
- **Files analyzed**: Only `.ts` files under `src/`; test files (`.test.ts`, `.spec.ts`) and declaration files (`.d.ts` for wasm bindings) are excluded from `as any` counts but included in LOC totals.

---

*Report generated by V3 QE Code Complexity Analyzer on 2026-03-09.*
*Baseline comparison: v3.7.10 analysis.*
*Next scheduled analysis: v3.7.15 or on-demand.*
