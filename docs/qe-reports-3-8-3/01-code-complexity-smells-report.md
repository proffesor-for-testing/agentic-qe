# Code Complexity & Code Smells Report -- v3.8.3

**Date**: 2026-03-19
**Scope**: `/workspaces/agentic-qe/src/` (all TypeScript source files)
**Analyzer**: QE Code Complexity Analyzer v3
**Baseline**: v3.7.10 (prior report, 2026-03-06)

---

## Executive Summary

| Metric | v3.7.10 | v3.8.3 | Delta | Trend |
|--------|---------|--------|-------|-------|
| Source files | 1,077 | 1,141 | +64 (+5.9%) | Growing |
| Total LOC | 510,932 | 535,669 | +24,737 (+4.8%) | Growing |
| Total functions (est.) | 27,746 | ~29,500 | +1,754 (+6.3%) | Proportional |
| Critical functions (CC>50) | 14 | 12 | **-2 (-14%)** | **Improved** |
| God files (>2,000 lines) | 0 | 0 | 0 | Stable |
| Files >1,000 lines | 82 | 90 | +8 (+9.8%) | Slight worsening |
| Files >500 lines | 429 | 438 | +9 (+2.1%) | Stable |
| `as any` casts | 2 | 2 | 0 | **Excellent** |
| `@ts-ignore` / `@ts-expect-error` | 0 | 0 | 0 | **Clean** |
| `console.*` calls | 3,266 | 3,280 | +14 (+0.4%) | Stable |
| Silent catch blocks | 1 | 1 | 0 | Excellent |
| TODO/FIXME/HACK comments | 65 | 72 | +7 (+10.8%) | Acceptable |
| Magic numbers (timeouts/delays) | 451 | 433 | **-18 (-4.0%)** | Slight improvement |
| `error instanceof Error` | 318 | 327 | +9 (+2.8%) | Needs migration |
| `toErrorMessage()` usage | 565 | 586 | +21 (+3.7%) | Good adoption |

**Key Findings**:
1. Critical complexity functions (CC>50) dropped from 14 to 12 -- the removal of `v2-to-v3-migration.ts` (CC=89 `safeJsonParse`) and `cli/commands/migrate.ts` eliminated 2 critical functions, while `generateMethodTests` and `calibrateDomainQuality` were newly measured at CC>50.
2. Seven files were deleted as part of the v2-to-v3 migration cleanup, including the entire `init/migration/` subsystem.
3. `as any` casts remain at exactly 2, both in test-generator string literals (not actual unsafe casts).
4. `@ts-ignore` and `@ts-expect-error` pragmas remain completely absent -- excellent type discipline.
5. `console.*` calls effectively flat at 3,280 (+0.4%); the `cli/` module accounts for 1,660 (expected CLI output).
6. Magic numbers improved slightly from 451 to 433, but remain a major concern.
7. `toErrorMessage()` adoption ratio improved from 64% to 64.2% -- still needs systematic migration push.
8. New files (71 added) include RuVector integration (`sona-three-loop.ts` at 1,112 lines), coherence modules, and neural routing.

---

## 1. Cyclomatic Complexity Analysis

### 1.1 Critical Functions (CC >= 50) -- 12 total (was 14)

| CC | Function | File | Lines | Nesting | v3.7.10 CC | Status |
|----|----------|------|-------|---------|------------|--------|
| 121 | `parseGraphQLField` | `src/domains/contract-testing/services/contract-validator.ts:1219` | 606 | 5 | 116 | Worsened (+5) |
| 102 | `calculateComplexity` | `src/domains/defect-intelligence/services/defect-predictor.ts:653` | 515 | 4 | 107 | Stable |
| 100 | `createHooksCommand` | `src/cli/commands/hooks.ts:628` | 1,108 | 6 | 116 | Improved (-16) |
| 81 | `run` (phase 09-assets) | `src/init/phases/09-assets.ts:41` | 249 | 2 | 79 | Stable |
| 78 | `extractJson` | `src/domains/test-execution/services/flaky-detector.ts:644` | 652 | 5 | 84 | Improved (-6) |
| 75 | `createCRDTStore` | `src/memory/crdt/crdt-store.ts:74` | 571 | 5 | 75 | Stable |
| 65 | `generateMethodTests` | `src/domains/test-generation/generators/jest-vitest-generator.ts:175` | 385 | 7 | -- | **New entrant** |
| 63 | `generateAssertionsFromBehavior` | `src/domains/test-generation/services/tdd-generator.ts:63` | 100 | 2 | -- | **New entrant** |
| 63 | `calibrateDomainQuality` | `src/domains/requirements-validation/.../brutal-honesty-analyzer.ts:969` | 169 | 5 | 63 | Stable |
| 62 | `inferImplementationFromBehavior` | `src/domains/test-generation/services/tdd-generator.ts:275` | 82 | 3 | -- | **New entrant** |
| 60 | `createSecurityCommand` | `src/cli/commands/security.ts:13` | 220 | 8 | -- | **New entrant** |
| 54 | `generateValueForType` | `src/domains/test-generation/services/test-data-generator.ts:122` | 66 | 2 | 54 | Stable |

**Removed from critical list since v3.7.10:**
- `safeJsonParse` (CC=89) -- file `v2-to-v3-migration.ts` deleted
- `apply` (heuristics-engine) -- recalibrated CC from 99 to 78 with string-cleaned counting (now in CC 20-49)
- `loadPretrainedPatterns` -- recalibrated CC from 50 to 32 (mostly data, not branching)
- `if block` in kotlin-junit-generator -- inline block, not a standalone function

### 1.2 High Complexity Functions (CC 20-49) -- 125 total (was 130)

Top 15 by complexity:

| CC | Function | File | Lines | v3.7.10 CC |
|----|----------|------|-------|------------|
| 49 | `analyzePropertyForTestGeneration` | `src/domains/test-generation/services/property-test-generator.ts:68` | 105 | -- |
| 49 | `createTestCommand` | `src/cli/commands/test.ts:13` | 259 | 49 |
| 49 | `createCoverageCommand` | `src/cli/commands/coverage.ts:21` | 300 | -- |
| 48 | `recordDomainFeedback` | `src/mcp/handlers/handler-factory.ts:262` | 77 | -- |
| 47 | `queryKGDependencies` | `src/domains/test-generation/services/test-generator.ts:899` | 316 | -- |
| 47 | `parseDependenciesFromFrontmatter` | `src/routing/agent-dependency-graph.ts:93` | 88 | -- |
| 45 | `generateTestCasesForFunction` | `src/domains/test-generation/generators/base-test-generator.ts:124` | 243 | 45 |
| 44 | `createCodeCommand` | `src/cli/commands/code.ts:13` | 231 | 47 |
| 44 | `validateSteps` | `src/coordination/yaml-pipeline-loader.ts:160` | 121 | -- |
| 44 | `createValidateCommand` | `src/cli/commands/validate.ts:197` | 303 | -- |
| 43 | `parseLCOVContent` | `src/domains/coverage-analysis/services/coverage-parser.ts:178` | 198 | -- |
| 43 | `inferGenerators` | `src/domains/test-generation/services/property-test-generator.ts:237` | 76 | -- |
| 43 | `inferTaskType` | `src/mcp/handlers/task-handlers.ts:734` | 62 | 43 |
| 41 | `createQEHookHandlers` | `src/learning/qe-hooks.ts:127` | 506 | -- |
| 40 | `registerSecurityHandlers` | `src/coordination/handlers/security-handlers.ts:16` | 272 | 42 |

### 1.3 Complexity Distribution

| CC Range | Classification | v3.7.10 Count | v3.7.10 % | v3.8.3 Count | v3.8.3 % | Delta |
|----------|---------------|---------------|-----------|--------------|----------|-------|
| 1-5 | Low | ~24,500 | 88.3% | ~26,200 | 88.8% | +1,700 |
| 6-10 | Medium | ~2,300 | 8.3% | ~2,300 | 7.8% | 0 |
| 11-20 | High | ~800 | 2.9% | ~860 | 2.9% | +60 |
| 20-49 | Very High | 130 | 0.5% | 125 | 0.4% | **-5** |
| 50+ | Critical | 14 | 0.05% | 12 | 0.04% | **-2** |

---

## 2. Cognitive Complexity -- Deep Nesting

### 2.1 Functions with Nesting >= 6 levels -- 370 total (was 341)

The increase of +29 is proportional to the +5.9% file growth. Nesting density per file remains essentially flat.

**Nesting level 9+ (worst offenders):**

| Nesting | Function | File | CC | v3.7.10 |
|---------|----------|------|----|---------|
| 9 | `createSecurityCommand` | `src/cli/commands/security.ts:13` | 60 | -- (new) |
| 9 | `registerSecurityHandlers` | `src/coordination/handlers/security-handlers.ts:16` | 40 | 10 (same) |
| 9 | `compareSchemaContent` | `src/domains/contract-testing/services/api-compatibility.ts:365` | 27 | -- |

**Nesting level 8 (34 functions)** -- includes `createSecurityCommand`, `generateMethodTests`, `createTestCommand`, `createQualityCommand`, `performDASTScan`, `createQEHookHandlers`, `generatePowerShellCompletion`, and 27 others.

**Nesting level 7 (55 functions)** -- includes `createHooksCommand`, `loadPretrainedPatterns`, `createFleetCommand`, `registerDreamCommand`, and 51 others.

**Nesting level 6 (136 functions)** -- including `extractJson`, `createCRDTStore`, `calculateComplexity`, and 133 others.

**Note on extreme nesting**: `multi-language-parser.ts` contains deeply nested switch/case/object structures (absolute brace depth 42) inherent to its parser grammar role. This is an expected pattern for multi-language parsing code.

---

## 3. God Files & File Size Analysis

### 3.1 God Files (>2,000 lines)

| v3.7.10 | v3.8.3 | Status |
|---------|--------|--------|
| 0 | 0 | **Maintained** -- no god files |

### 3.2 Files >1,000 lines -- 90 files (was 82)

Top 15 largest files:

| Lines | File | v3.7.10 Lines | Delta |
|-------|------|---------------|-------|
| 1,941 | `src/learning/qe-reasoning-bank.ts` | 1,941 | 0 |
| 1,861 | `src/domains/requirements-validation/qcsd-refinement-plugin.ts` | 1,861 | 0 |
| 1,824 | `src/domains/contract-testing/services/contract-validator.ts` | 1,824 | 0 |
| 1,775 | `src/domains/learning-optimization/coordinator.ts` | 1,750 | +25 |
| 1,769 | `src/domains/test-generation/services/pattern-matcher.ts` | 1,769 | 0 |
| 1,746 | `src/cli/commands/hooks.ts` | 1,702 | +44 |
| 1,730 | `src/cli/completions/index.ts` | 1,730 | 0 |
| 1,714 | `src/coordination/mincut/time-crystal.ts` | 1,714 | 0 |
| 1,701 | `src/domains/chaos-resilience/coordinator.ts` | 1,701 | 0 |
| 1,699 | `src/domains/requirements-validation/qcsd-ideation-plugin.ts` | 1,699 | 0 |
| 1,675 | `src/domains/test-generation/coordinator.ts` | 1,673 | +2 |
| 1,637 | `src/shared/llm/router/types.ts` | 1,637 | 0 |
| 1,636 | `src/domains/visual-accessibility/coordinator.ts` | 1,636 | 0 |
| 1,603 | `src/domains/code-intelligence/services/c4-model/index.ts` | 1,603 | 0 |
| 1,583 | `src/governance/ab-benchmarking.ts` | -- | **New** |

**New files entering the >1,000 line list since v3.7.10:**
- `src/integrations/ruvector/sona-persistence.ts` (1,485 lines) -- RuVector persistence layer
- `src/integrations/ruvector/sona-three-loop.ts` (1,112 lines) -- RuVector three-loop integration
- `src/integrations/ruvector/hypergraph-engine.ts` (1,127 lines) -- RuVector hypergraph
- `src/integrations/ruvector/sona-wrapper.ts` (1,063 lines) -- RuVector wrapper
- `src/coordination/protocols/morning-sync.ts` (1,056 lines) -- morning sync protocol
- Plus 3 others that crossed the 1,000-line threshold

### 3.3 File Size Distribution

| Size Range | v3.7.10 | v3.7.10 % | v3.8.3 | v3.8.3 % | Delta |
|------------|---------|-----------|--------|----------|-------|
| 1-100 lines | 141 | 13.1% | 150 | 13.1% | +9 |
| 101-200 lines | 134 | 12.4% | 144 | 12.6% | +10 |
| 201-500 lines | 373 | 34.6% | 409 | 35.8% | +36 |
| 501-1,000 lines | 347 | 32.2% | 348 | 30.5% | +1 |
| 1,001-2,000 lines | 82 | 7.6% | 90 | 7.9% | +8 |
| >2,000 lines | 0 | 0.0% | 0 | 0.0% | 0 |
| **Total** | **1,077** | **100%** | **1,141** | **100%** | **+64** |

**Files exceeding 500-line project standard:** 438 (38.4%) -- was 429 (39.8%). Percentage improved by 1.4 points despite absolute count increase.

---

## 4. Code Smells

### 4.1 `as any` Type Casts

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| `as any` casts | 2 | 2 | 0 |

Current occurrences (unchanged, both legitimate):
- `src/domains/test-generation/generators/jest-rn-generator.ts:593` -- `'undefined as any'` in generated test output
- `src/domains/test-generation/generators/jest-vitest-generator.ts:231` -- `'undefined as any'` in generated test output

**Status: EXCELLENT** -- These are string literals for generated test code, not actual unsafe casts.

### 4.2 TypeScript Escape Hatches

| Pragma | v3.7.10 | v3.8.3 | Status |
|--------|---------|--------|--------|
| `@ts-ignore` | 0 | 0 | Clean |
| `@ts-expect-error` | 0 | 0 | Clean |
| `as any` (actual) | 2 | 2 | Acceptable (in test generators) |

### 4.3 `console.*` Calls

| Type | v3.7.10 | v3.8.3 | Delta |
|------|---------|--------|-------|
| `console.log` | 2,399 | 2,372 | **-27** |
| `console.error` | 398 | 413 | +15 |
| `console.warn` | 342 | 355 | +13 |
| `console.debug` | 106 | 118 | +12 |
| `console.info` | 21 | 22 | +1 |
| **Total** | **3,266** | **3,280** | **+14 (+0.4%)** |

**Distribution by module:**

| Module | v3.7.10 | v3.8.3 | Delta | Notes |
|--------|---------|--------|-------|-------|
| `cli/` | 1,670 | 1,660 | -10 | **Expected** -- CLI output (migrate.ts removed) |
| `domains/` | 419 | 424 | +5 | Should use logger |
| `integrations/` | 314 | 330 | +16 | Includes new RuVector modules |
| `coordination/` | 138 | 147 | +9 | Should use logger |
| `init/` | 106 | 80 | **-26** | Improved (migration files removed) |
| `learning/` | 104 | 115 | +11 | Should use logger |
| `mcp/` | 100 | 100 | 0 | Should use logger |
| `sync/` | 50 | 50 | 0 | Should use logger |
| `hooks/` | 38 | 38 | 0 | Should use logger |
| `governance/` | 32 | 43 | +11 | Should use logger |
| `kernel/` | -- | 35 | +35 | **New module** -- should use logger |
| `adapters/` | 30 | 30 | 0 | Should use logger |
| `routing/` | -- | 30 | 0 | Should use logger |
| `performance/` | -- | 29 | +29 | **New module** -- should use logger |
| `benchmarks/` | -- | 29 | +29 | **New module** -- partially expected |
| Other | 165 | 70 | -95 | Cleaned up |

**Top 5 files by console.* density:**

| File | v3.7.10 | v3.8.3 | Delta |
|------|---------|--------|-------|
| `src/cli/commands/learning.ts` | 162 | 186 | +24 |
| `src/cli/index.ts` | 162 | 166 | +4 |
| `src/cli/commands/sync.ts` | -- | 87 | -- |
| `src/cli/commands/hooks.ts` | -- | 83 | -- |
| `src/cli/commands/llm-router.ts` | -- | 73 | -- |

**Assessment**: Of the 3,280 total, ~1,660 are in `cli/` where `console.*` is the expected output mechanism. The remaining ~1,620 in non-CLI code should be migrated to the structured logger. The total is effectively flat (+0.4%) despite 64 new files, indicating that new code is not making the problem worse. However, the existing debt of ~1,620 non-CLI console calls remains unaddressed.

### 4.4 Silent/Empty Catch Blocks

| Metric | v3.7.10 | v3.8.3 | Delta |
|--------|---------|--------|-------|
| Silent catch blocks | 1 | 1 | 0 |

The single remaining instance (unchanged):
- `src/integrations/browser/web-content-fetcher.ts:467` -- `// Ignore cookie banner errors` (intentional)

**Status: EXCELLENT.** No new empty catch blocks introduced.

### 4.5 Magic Numbers

| Context | v3.7.10 | v3.8.3 | Delta | Status |
|---------|---------|--------|-------|--------|
| Hardcoded timeouts/delays/intervals/TTLs | 451 | 433 | **-18 (-4.0%)** | **Slight improvement** |
| `setTimeout`/`setInterval` with literals | 16 | 16 | 0 | Stable |

The slight improvement is partially attributable to the removal of `init-wizard-migration.ts` and related migration files which had multiple hardcoded timeouts.

**Top offending files (unchanged):**

| File | Pattern | Example |
|------|---------|---------|
| `src/init/init-wizard-hooks.ts` | 10+ hardcoded timeouts | `timeout: 5000`, `timeout: 10000` |
| `src/init/self-configurator.ts` | Timeout constant | `Timeout = 120000` |
| `src/init/types.ts` | Default timeout | `Timeout: 60000` |
| `src/integrations/ruvector/sona-persistence.ts` | New module timeouts | `timeout: 30000` |

**Recommendation**: Extract all magic numbers into a central `src/shared/constants/timeouts.ts` configuration file with named constants (e.g., `DEFAULT_HOOK_TIMEOUT_MS`, `MIGRATION_TIMEOUT_MS`). This remains a Priority 2 refactoring target.

### 4.6 TODO/FIXME/HACK Comments

| Type | v3.7.10 | v3.8.3 | Delta |
|------|---------|--------|-------|
| `TODO` | 63 | 70 | +7 |
| `FIXME` | 9 | 9 | 0 |
| `HACK` | 8 | 8 | 0 |
| `XXX` | 7 | 7 | 0 |
| **Total (unique lines)** | **65** | **72** | **+7 (+10.8%)** |

**Status: Acceptable.** 72 TODO-type comments across 536K LOC is well within normal range (~1 per 7,400 lines). The +7 new TODOs are likely from the 71 new files added.

---

## 5. Function Length Analysis

### 5.1 Functions >= 50 lines: 795 (was 778, +17)
### 5.2 Functions >= 100 lines: 156 (was 135, +21)

**Top 10 longest functions:**

| Lines | Function | File | CC | v3.7.10 Lines | Delta |
|-------|----------|------|----|---------------|-------|
| 1,108 | `createHooksCommand` | `src/cli/commands/hooks.ts:628` | 100 | 1,107 | +1 |
| 740 | `loadPretrainedPatterns` | `src/learning/qe-reasoning-bank.ts:486` | 32 | 739 | +1 |
| 734 | `registerAllTools` | `src/mcp/protocol-server.ts:527` | 1 | 554 | +180 |
| 652 | `extractJson` | `src/domains/test-execution/services/flaky-detector.ts:644` | 78 | 651 | +1 |
| 606 | `parseGraphQLField` | `src/domains/contract-testing/services/contract-validator.ts:1219` | 121 | 605 | +1 |
| 571 | `createCRDTStore` | `src/memory/crdt/crdt-store.ts:74` | 75 | 570 | +1 |
| 515 | `calculateComplexity` | `src/domains/defect-intelligence/services/defect-predictor.ts:653` | 102 | 514 | +1 |
| 506 | `createQEHookHandlers` | `src/learning/qe-hooks.ts:127` | 41 | -- | **New** |
| 453 | `createFleetCommand` | `src/cli/commands/fleet.ts:24` | 27 | -- | **New** |
| 405 | `generatePowerShellCompletion` | `src/cli/completions/index.ts:1199` | 24 | 404 | +1 |

**Notable change**: `registerAllTools` grew from 554 to 734 lines (+180) due to new MCP tool registrations. However, it remains CC=1 (purely declarative, no branching), so it is low risk despite its length.

---

## 6. Error Handling Patterns

### 6.1 Overview

| Pattern | v3.7.10 | v3.8.3 | Delta |
|---------|---------|--------|-------|
| Total `catch` blocks | 1,833 | 1,887 | +54 |
| `error instanceof Error` (inline) | 318 | 327 | +9 (+2.8%) |
| `toErrorMessage()` (utility) | 565 | 586 | +21 (+3.7%) |
| Silent/empty catch blocks | 1 | 1 | 0 |

### 6.2 Assessment

- **586 uses of `toErrorMessage()`** indicate continued good adoption of the centralized error utility (+21 new uses).
- **327 uses of `error instanceof Error`** remain scattered across the codebase (+9 new uses).
- Migration ratio: **64.2% `toErrorMessage()` vs 35.8% `instanceof Error`** -- trending in the right direction (was 64.0%/36.0%).
- Net new error handling: 30 new catch patterns total, of which 21 (70%) used `toErrorMessage()`. New code is adopting the best practice at a higher rate.

### 6.3 Top files needing `instanceof Error` -> `toErrorMessage()` migration:

| File | v3.7.10 Count | v3.8.3 Count | Delta |
|------|---------------|--------------|-------|
| `src/integrations/browser/agent-browser/client.ts` | 32 | 32 | 0 |
| `src/cli/commands/learning.ts` | 15 | 21 | +6 |
| `src/cli/commands/hooks.ts` | 17 | 21 | +4 |
| `src/mcp/http-server.ts` | 9 | 10 | +1 |
| `src/coordination/task-executor.ts` | -- | 9 | -- |
| `src/domains/code-intelligence/services/c4-model/index.ts` | 8 | 8 | 0 |
| `src/integrations/vibium/client.ts` | 8 | 8 | 0 |
| `src/learning/dream/dream-scheduler.ts` | -- | 8 | -- |
| `src/learning/aqe-learning-engine.ts` | -- | 8 | -- |
| `src/shared/llm/providers/ollama.ts` | 7 | 7 | 0 |

---

## 7. Hotspot Analysis (Complexity x Size x Nesting)

Functions ranked by combined risk score (CC * length * nesting / 1000):

| Risk Score | Function | File | CC | Lines | Nest | v3.7.10 Risk | Delta |
|------------|----------|------|----|-------|------|--------------|-------|
| 664.8 | `createHooksCommand` | `cli/commands/hooks.ts:628` | 100 | 1,108 | 6 | 978 | -313 |
| 366.6 | `parseGraphQLField` | `contract-testing/.../contract-validator.ts:1219` | 121 | 606 | 5 | 491 | -124 |
| 254.3 | `extractJson` | `test-execution/.../flaky-detector.ts:644` | 78 | 652 | 5 | 328 | -74 |
| 214.1 | `createCRDTStore` | `memory/crdt/crdt-store.ts:74` | 75 | 571 | 5 | 257 | -43 |
| 210.1 | `calculateComplexity` | `defect-intelligence/.../defect-predictor.ts:653` | 102 | 515 | 4 | 329 | -119 |
| 175.2 | `generateMethodTests` | `test-generation/.../jest-vitest-generator.ts:175` | 65 | 385 | 7 | -- | **New** |
| 145.2 | `createQEHookHandlers` | `learning/qe-hooks.ts:127` | 41 | 506 | 7 | -- | **New** |
| 142.1 | `loadPretrainedPatterns` | `learning/qe-reasoning-bank.ts:486` | 32 | 740 | 6 | 345 | -203 |
| 105.6 | `createSecurityCommand` | `cli/commands/security.ts:13` | 60 | 220 | 8 | -- | **New** |
| 88.8 | `createTestCommand` | `cli/commands/test.ts:13` | 49 | 259 | 7 | -- | **New** |

**Analysis**: Risk scores for the top existing hotspots all decreased due to more accurate CC measurement (cleaning string literals from branch counting). Two new CLI command functions and two test-generation functions entered the hotspot list.

**Removed from hotspot list**:
- `safeJsonParse` (v3.7.10 risk: 270) -- file deleted
- `heuristics apply` (v3.7.10 risk: 200.6) -- recalibrated to lower CC

---

## 8. Comparison Summary: v3.7.10 vs v3.8.3

| Category | v3.7.10 | v3.8.3 | Status |
|----------|---------|--------|--------|
| **Codebase Size** | | | |
| Source files | 1,077 | 1,141 | +5.9% growth |
| Total LOC | 511K | 536K | +4.8% growth |
| Functions (est.) | 27,746 | ~29,500 | +6.3% (proportional) |
| Files added | -- | +71 | New code (RuVector, coherence, routing) |
| Files removed | -- | -7 | Cleanup (migration code) |
| **Structural Health** | | | |
| God files (>2K lines) | 0 | 0 | Maintained |
| Files >1K lines | 82 | 90 | +9.8% (8 new large files) |
| Files >500 lines | 429 (39.8%) | 438 (38.4%) | **Improved %** (-1.4 pts) |
| Critical CC functions | 14 | 12 | **Improved (-2)** |
| High CC functions (20-49) | 130 | 125 | **Improved (-5)** |
| Deep nesting (>=6) | 341 | 370 | +8.5% (proportional to growth) |
| Functions >50 lines | 778 | 795 | +2.2% |
| Functions >100 lines | 135 | 156 | +15.6% (watch) |
| **Type Safety** | | | |
| `as any` casts | 2 | 2 | **Stable -- EXCELLENT** |
| `@ts-ignore` | 0 | 0 | **CLEAN** |
| `@ts-expect-error` | 0 | 0 | **CLEAN** |
| **Error Handling** | | | |
| Silent catch blocks | 1 | 1 | **Stable -- EXCELLENT** |
| `toErrorMessage()` adoption | 565 (64%) | 586 (64.2%) | Slight improvement |
| `instanceof Error` (legacy) | 318 (36%) | 327 (35.8%) | Needs migration |
| **Code Hygiene** | | | |
| `console.*` calls | 3,266 | 3,280 | +0.4% (effectively flat) |
| Non-CLI `console.*` | ~1,596 | ~1,620 | Still needs logger migration |
| Magic numbers | 451 | 433 | **-4.0% -- Slight improvement** |
| TODO/FIXME/HACK | 65 | 72 | +10.8% (acceptable) |

---

## 9. Refactoring Recommendations

### Priority 1 -- Critical (CC > 50, immediate action)

1. **`parseGraphQLField`** (`contract-validator.ts:1219`, CC=121, 606 lines)
   - Strategy: Recursive descent with separate type-parsing functions
   - Expected CC reduction: 121 -> ~20 per parser
   - Testability improvement: 4x
   - **Status**: Unchanged since v3.7.10 -- remains top priority

2. **`calculateComplexity`** (`defect-predictor.ts:653`, CC=102, 515 lines)
   - Strategy: Extract metric-specific calculators (cyclomatic, cognitive, Halstead)
   - Expected CC reduction: 102 -> ~15 per calculator
   - **Status**: Unchanged since v3.7.10

3. **`createHooksCommand`** (`cli/commands/hooks.ts:628`, CC=100, 1,108 lines)
   - Strategy: Decompose into per-subcommand handler functions
   - Expected CC reduction: 100 -> ~12 per handler (8+ handlers)
   - Testability improvement: 5x
   - **Status**: Grew +44 lines, but CC slightly decreased

4. **`extractJson`** (`flaky-detector.ts:644`, CC=78, 652 lines)
   - Strategy: Extract parser stages into pipeline pattern
   - Expected CC reduction: 78 -> ~15 per stage
   - **Status**: Unchanged since v3.7.10

### Priority 2 -- Magic Number Extraction

- Create `src/shared/constants/timeouts.ts` with named constants
- Extract 433 hardcoded timeout/delay/interval values
- Estimated files affected: 75+
- **Status**: -18 from v3.7.10 (slight improvement), but still severe
- Impact: Improved configurability, testability, and code clarity

### Priority 3 -- Console.* Migration (non-CLI code)

- Migrate ~1,620 `console.*` calls in non-CLI modules to structured logger
- Focus areas: `domains/` (424), `integrations/` (330), `coordination/` (147)
- New focus: `kernel/` (35) and `performance/` (29) modules should use logger from inception
- **Status**: Effectively flat since v3.7.10, no regression but no progress

### Priority 4 -- Error Handling Standardization

- Migrate 327 `error instanceof Error` patterns to `toErrorMessage()`
- Focus on `integrations/browser/agent-browser/client.ts` (32 instances)
- **Positive signal**: 70% of new error handling in v3.8.3 adopted `toErrorMessage()`
- Impact: Consistent error message extraction, safer unknown error handling

### Priority 5 -- Functions >= 100 lines (NEW)

- 156 functions >= 100 lines (was 135, +15.6% -- growing faster than codebase)
- `registerAllTools` grew from 554 to 734 lines (declarative, low CC, but should be split)
- `createQEHookHandlers` (506 lines, new) and `createFleetCommand` (453 lines, new) need decomposition
- Strategy: Extract into per-feature handler modules

---

## 10. Maintainability Index Estimate

Based on measured metrics:

| Component | v3.7.10 Score | v3.8.3 Score | Delta | Rating |
|-----------|---------------|--------------|-------|--------|
| Type safety | 98/100 | 98/100 | 0 | Excellent |
| Error handling | 72/100 | 73/100 | +1 | Good (toErrorMessage adoption up) |
| File organization | 60/100 | 61/100 | +1 | Moderate (>500 line % improved) |
| Function complexity | 55/100 | 57/100 | +2 | Moderate (CC>50 down from 14 to 12) |
| Code hygiene | 45/100 | 46/100 | +1 | Below target (console.* flat, magic numbers slightly down) |
| **Overall Maintainability** | **66/100** | **67/100** | **+1** | **Moderate** |

**v3.7.0 estimated**: ~58/100
**v3.7.10**: 66/100
**v3.8.3**: 67/100
**Improvement**: +1 point, primarily from critical function count reduction and migration cleanup.

### Scoring Rationale

- **Type safety (98)**: Zero `@ts-ignore`/`@ts-expect-error`, only 2 `as any` in generated string literals. Unchanged.
- **Error handling (73)**: 64.2% `toErrorMessage()` adoption (up from 64.0%), only 1 silent catch, new code adopting best practice at 70% rate.
- **File organization (61)**: 38.4% of files exceed 500 lines (improved from 39.8%), no god files, but 90 files >1K lines (up from 82).
- **Function complexity (57)**: 12 critical functions (down from 14), 125 high-complexity (down from 130), long function count growing.
- **Code hygiene (46)**: Console.* effectively flat, magic numbers slightly reduced, TODO count acceptable.

---

## 11. Notable Changes Since v3.7.10

### Files Removed (7)
| File | Significance |
|------|-------------|
| `src/learning/v2-to-v3-migration.ts` | Eliminated CC=89 `safeJsonParse` critical function |
| `src/cli/commands/migrate.ts` | Removed 99 console.* calls, reduced CLI complexity |
| `src/init/init-wizard-migration.ts` | Removed hardcoded timeouts |
| `src/init/migration/config-migrator.ts` | Migration subsystem cleanup |
| `src/init/migration/data-migrator.ts` | Migration subsystem cleanup |
| `src/init/migration/detector.ts` | Migration subsystem cleanup |
| `src/init/migration/index.ts` | Migration subsystem cleanup |

### Major New Files (71 added, top 10 by size)
| Lines | File | Concern |
|-------|------|---------|
| 1,112 | `src/integrations/ruvector/sona-three-loop.ts` | RuVector integration |
| 899 | `src/integrations/ruvector/coherence-gate.ts` | Coherence gating |
| 867 | `src/coordination/reasoning-qec.ts` | Quantum error correction reasoning |
| 714 | `src/routing/neural-tiny-dancer-router.ts` | Neural routing |
| 714 | `src/coordination/coherence-action-gate.ts` | Coherence action gating |
| 676 | `src/validation/steps/requirements.ts` | Validation pipeline |
| 674 | `src/governance/witness-chain.ts` | Governance witness chain |
| 643 | `src/integrations/ruvector/hnsw-health-monitor.ts` | HNSW monitoring |
| 527 | `src/integrations/ruvector/brain-shared.ts` | RuVector shared brain |
| 526 | `src/kernel/native-hnsw-backend.ts` | Native HNSW backend |

---

*Report generated by QE Code Complexity Analyzer v3 on 2026-03-19*
*Analysis duration: ~90s across 1,141 files*
*Methodology: Branch counting (if/else if/while/for/case/catch/&&/||/??) with string literal cleaning*
