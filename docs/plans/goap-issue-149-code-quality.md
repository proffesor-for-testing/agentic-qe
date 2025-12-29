# GOAP Plan: Issue #149 Code Quality Remediation

**Created**: 2025-12-27
**Status**: Phase 2 Complete - v2.7.1
**Last Updated**: 2025-12-29
**Target Completion**: 4 Phases over 2-3 weeks

---

## 🎯 Execution Progress

### Phase 2 Complete (v2.7.1) - Type Safety Improvement

**Completed**: 2025-12-29

| Metric | Before | After | Target | Status |
|--------|--------|-------|--------|--------|
| `any` type usage | 1,470 | 538 | <735 | ✅ **63% reduction** |
| TypeScript errors | 146 | 0 | 0 | ✅ **100% fixed** |
| Compilation | Failing | Passing | Passing | ✅ |

#### Files Fixed (Major Changes)

| File | Errors Fixed | Key Patterns Applied |
|------|-------------|---------------------|
| FleetCommanderAgent.ts | 29 | Index signatures, event handler casts |
| RealAgentDBAdapter.ts | 28 | `getDb()` helper, SQL interface |
| DeploymentReadinessAgent.ts | 27 | Task payload typing, interface extensions |
| RequirementsValidatorAgent.ts | 16 | Memory retrieval casts |
| SecurityScannerAgent.ts | 15 | 3 interface index signatures |
| PatternMemoryIntegration.ts | 14 | Storage type interfaces |
| AccessibilityAllyAgent.ts | 11 | Event data casting |
| PerformanceTesterAgent.ts | 11 | Index signatures, history casts |
| FlakyTestHunterAgent.ts | 9 | Task payload typing |
| ProductionIntelligenceAgent.ts | 8 | Task payload casting |
| RegressionRiskAnalyzerAgent.ts | 7 | Task payload casting |
| CodeComplexityAnalyzerAgent.ts | 7 | Event handlers |
| TestExecutorAgent.ts | 6 | History cast, config typing |
| Other files | 9 | Scattered type fixes |

#### Type Safety Patterns Established

1. **Index signatures for SerializableValue**:
   ```typescript
   interface SomeInterface {
     field1: string;
     [key: string]: unknown;
   }
   ```

2. **Memory retrieval casting**:
   ```typescript
   const data = await memoryStore.retrieve(key) as SomeType | null;
   ```

3. **Task payload typing**:
   ```typescript
   const payload = task.payload as { field1?: Type1; field2?: Type2 };
   ```

4. **Array wrapper for storage**:
   ```typescript
   await memoryStore.store(key, { entries: someArray });
   ```

---

## Executive Summary

This Goal-Oriented Action Plan (GOAP) addresses the code quality issues identified in Issue #149 analysis. The plan uses a phased approach with clear milestones, agent assignments, and validation gates.

### Current State Assessment

| Category | Metric | Count | Priority |
|----------|--------|-------|----------|
| Math.random() usage | Non-deterministic tests | 113 occurrences in 46 files | P0 |
| setTimeout usage | Timer-based non-determinism | 142 occurrences in 92 files | P0 |
| Skipped tests | Tests needing review | 24 test files | P0 |
| `any` type usage | Type safety violations | 1,470+ occurrences in 209 files | P1 |
| console.log usage | Unstructured logging | 3,376 occurrences in 234 files | P2 |
| Large files | Files >1000 LOC | 30 files identified | P2 |

### Goal State

1. **Test Determinism**: Zero flaky tests from randomness/timing (100% deterministic)
2. **Type Safety**: Reduce `any` usage by 50% (target: <735 occurrences)
3. **Skipped Tests**: All skipped tests either enabled or documented with skip reason

---

## Phase 1: Test Determinism Foundation (P0)

**Duration**: 3-4 days
**Goal**: Eliminate Math.random() and setTimeout non-determinism

### Milestone 1.1: Seeded Random Utility

**Preconditions**: None
**Effects**: Deterministic random number generation available

```
WORLD STATE CHANGE:
  - has_seeded_random: false -> true
  - random_utility_path: null -> "src/utils/SeededRandom.ts"
```

#### Agent Assignments

| Task | Agent | Capabilities | Dependencies |
|------|-------|--------------|--------------|
| Create SeededRandom utility | `coder` | TypeScript, utility design | None |
| Unit tests for SeededRandom | `tester` | Jest, test design | SeededRandom.ts created |
| Code review | `reviewer` | Code quality | Implementation complete |
| Validate determinism | `qe-flaky-investigator` | Flaky test detection | All code reviewed |

#### Implementation Plan

```typescript
// src/utils/SeededRandom.ts - Target Implementation
export class SeededRandom {
  private seed: number;

  constructor(seed: number = 12345) {
    this.seed = seed;
  }

  next(): number {
    // Mulberry32 PRNG - fast, deterministic
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  // Compatibility methods
  random(): number { return this.next(); }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  int(min: number, max: number): number { return Math.floor(this.range(min, max + 1)); }
  choice<T>(array: T[]): T { return array[this.int(0, array.length - 1)]; }
  shuffle<T>(array: T[]): T[] { /* Fisher-Yates with seeded random */ }

  // Test helpers
  reset(): void { this.seed = this.initialSeed; }
  static createTestInstance(testName: string): SeededRandom {
    // Hash test name to seed for reproducibility
    return new SeededRandom(hashCode(testName));
  }
}
```

#### Success Criteria

- [ ] SeededRandom utility created with full API
- [ ] 100% unit test coverage for SeededRandom
- [ ] Documentation in JSDoc format
- [ ] Code review approved

### Milestone 1.2: Math.random() Migration

**Preconditions**: `has_seeded_random: true`
**Effects**: All Math.random() calls use SeededRandom in tests

```
WORLD STATE CHANGE:
  - math_random_in_tests: 113 -> 0
  - flaky_random_tests: estimated 50+ -> 0
```

#### Agent Assignments

| Task | Agent | Priority Files | Dependencies |
|------|-------|----------------|--------------|
| Migrate core/ | `coder` | 4 files with Math.random | SeededRandom ready |
| Migrate mcp/ | `coder` | 19 fleet/index.ts occurrences | SeededRandom ready |
| Migrate agents/ | `coder` | 4 files | SeededRandom ready |
| Migrate learning/ | `coder` | 15 files | SeededRandom ready |
| Test migration verification | `qe-flaky-investigator` | All migrated files | Migrations complete |

#### High-Priority Files (by occurrence count)

1. `src/mcp/tools/qe/fleet/index.ts` - 19 occurrences
2. `src/mcp/tools/qe/security/detect-vulnerabilities.ts` - 18 occurrences
3. `src/mcp/tools/qe/performance/monitor-realtime.ts` - 7 occurrences
4. `src/learning/FederatedManager.ts` - 5 occurrences
5. `src/learning/baselines/BaselineCollector.ts` - 4 occurrences

### Milestone 1.3: Timer Determinism

**Preconditions**: None (parallel with 1.2)
**Effects**: All setTimeout calls in tests use jest.useFakeTimers()

```
WORLD STATE CHANGE:
  - timer_controlled_tests: 8 files -> 92 files (all with setTimeout)
  - flaky_timer_tests: estimated 30+ -> 0
```

#### Agent Assignments

| Task | Agent | Dependencies |
|------|-------|--------------|
| Create timer test patterns | `coder` | None |
| Migrate high-impact files | `coder` | Pattern doc ready |
| Update test setup | `tester` | Pattern doc ready |
| Validate no timer leaks | `qe-flaky-investigator` | All migrations |

#### Timer Migration Pattern

```typescript
// jest.setup.ts addition
beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// Test pattern for async timers
it('handles timeout correctly', async () => {
  const promise = functionWithTimeout();
  jest.advanceTimersByTime(5000);
  await promise;
  expect(result).toBe(expected);
});
```

### Milestone 1.4: Skipped Tests Audit

**Preconditions**: None (parallel)
**Effects**: All 24 skipped test files reviewed and categorized

```
WORLD STATE CHANGE:
  - skipped_tests_unreviewed: 24 -> 0
  - skipped_tests_documented: 0 -> N (with reasons)
  - tests_enabled: 0 -> M (re-enabled tests)
```

#### Agent Assignments

| Task | Agent | Dependencies |
|------|-------|--------------|
| Audit skipped tests | `qe-flaky-investigator` | None |
| Fix fixable tests | `tester` | Audit complete |
| Document unfixable | `code-analyzer` | Audit complete |
| Remove obsolete | `coder` | Documentation complete |

#### Skipped Test Files (24 identified)

```
tests/unit/cli/commands/kg/mincut.test.ts
tests/integration/mcp/regression-risk.integration.test.ts
tests/integration/mcp/parameter-validation.integration.test.ts
tests/integration/mcp/fleet-management.integration.test.ts
tests/code-intelligence/unit/analysis/mincut/MinCutAnalyzer.test.ts
tests/code-intelligence/unit/CodeIntelligenceService.test.ts
tests/mcp/handlers/IntegrationTools.test.ts
tests/journeys/flaky-detection.test.ts
... (16 more)
```

### Phase 1 Validation Gate

**QE Agent**: `qe-flaky-investigator`

```bash
# Validation Commands
npm run test:unit -- --runInBand --detectOpenHandles 2>&1 | tee phase1-validation.log
grep -c "Math.random" src/**/*.ts  # Should be 0 in test paths
grep -c "\.skip\(" tests/**/*.test.ts  # Document remaining skips
```

**Success Criteria**:
- [ ] 0 Math.random() calls in test execution paths
- [ ] All test files use fake timers where setTimeout exists
- [ ] 100% of skipped tests documented or re-enabled
- [ ] Test suite passes 5 consecutive runs (determinism check)

---

## Phase 2: Type Safety Improvement (P1)

**Duration**: 5-7 days
**Goal**: Reduce `any` type usage by 50%

### Current `any` Distribution

| Directory | Count | Target Reduction |
|-----------|-------|------------------|
| src/agents/ | 402 | 200 (50%) |
| src/core/ | 279 | 140 (50%) |
| src/mcp/ | 250 | 125 (50%) |
| src/cli/ | 250+ | 125 (50%) |
| Other | 289 | 145 (50%) |
| **Total** | 1,470 | **735** |

### Milestone 2.1: Core Type Definitions

**Preconditions**: Phase 1 complete
**Effects**: Shared types available for migration

```
WORLD STATE CHANGE:
  - shared_types_defined: false -> true
  - type_import_available: false -> true
```

#### Agent Assignments

| Task | Agent | Dependencies |
|------|-------|--------------|
| Analyze common `any` patterns | `code-analyzer` | None |
| Create shared type definitions | `coder` | Analysis complete |
| Review type definitions | `qe-code-reviewer` | Types created |

### Milestone 2.2: Agent Type Safety

**Preconditions**: Core types defined
**Effects**: src/agents/ `any` reduced by 50%

#### Priority Files (highest `any` count)

1. `src/agents/TestGeneratorAgent.ts` - 66 occurrences
2. `src/agents/TestDataArchitectAgent.ts` - 36 occurrences
3. `src/agents/CoverageAnalyzerAgent.ts` - 34 occurrences
4. `src/agents/ApiContractValidatorAgent.ts` - 29 occurrences
5. `src/agents/TestExecutorAgent.ts` - 27 occurrences

#### Agent Assignments

| Task | Agent | Files | Dependencies |
|------|-------|-------|--------------|
| Type TestGeneratorAgent | `coder` | 1 file, 66 `any` | Core types |
| Type TestDataArchitectAgent | `coder` | 1 file, 36 `any` | Core types |
| Type CoverageAnalyzerAgent | `coder` | 1 file, 34 `any` | Core types |
| Type remaining agents | `coder` | 23 files | Core types |
| Validate compilation | `qe-coverage-analyzer` | All | Typing complete |

### Milestone 2.3: Core Type Safety

**Preconditions**: Core types defined
**Effects**: src/core/ `any` reduced by 50%

#### Priority Files

1. `src/core/memory/SwarmMemoryManager.ts` - 51 occurrences
2. `src/core/memory/MigrationTools.ts` - 14 occurrences
3. `src/core/memory/RealAgentDBAdapter.ts` - 13 occurrences
4. `src/core/neural/NeuralTrainer.ts` - 11 occurrences

### Milestone 2.4: MCP Handler Type Safety

**Preconditions**: Core types defined
**Effects**: src/mcp/ `any` reduced by 50%

#### Priority Files

1. `src/mcp/handlers/phase3/Phase3DomainTools.ts` - 33 occurrences
2. `src/mcp/handlers/test/test-optimize-sublinear.ts` - 16 occurrences
3. `src/mcp/handlers/test/generate-integration-tests.ts` - 15 occurrences

### Phase 2 Validation Gate

**QE Agent**: `qe-code-reviewer`

```bash
# Validation Commands
grep -r ": any" src/ | wc -l  # Target: <735
npm run typecheck  # Must pass
npm run test:unit  # All tests still pass
```

**Success Criteria**:
- [x] `any` count reduced from 1,470 to <735 ✅ **538 achieved (63% reduction)**
- [x] TypeScript compilation passes with strict mode ✅ **0 errors**
- [x] No runtime type errors in tests ✅ **All tests pass**
- [x] Code review approved for all changes ✅ **v2.7.1**

---

## Phase 3: Code Quality Enhancement (P2)

**Duration**: 3-4 days
**Goal**: Improve logging and identify modularization candidates

### Milestone 3.1: Logging Audit

**Preconditions**: Phase 1 & 2 complete
**Effects**: console.* usage mapped and prioritized

```
WORLD STATE CHANGE:
  - logging_audit_complete: false -> true
  - logging_migration_plan: null -> defined
```

Note: Full console.log migration (3,376 occurrences) is deferred to a future phase.
This milestone focuses on:
1. Identifying critical paths that need structured logging
2. Creating the Logger utility enhancements
3. Migrating high-traffic logging paths

### Milestone 3.2: Large File Analysis

**Preconditions**: None (parallel)
**Effects**: Modularization candidates identified

#### Files >1000 LOC (Top 10)

| File | LOC | Action |
|------|-----|--------|
| src/mcp/tools.ts | 4,221 | Split by tool category |
| src/agents/QXPartnerAgent.ts | 3,101 | Extract strategies |
| src/core/memory/SwarmMemoryManager.ts | 3,075 | Already flagged for type safety |
| src/providers/HybridRouter.ts | 2,094 | Extract routing strategies |
| src/agents/TestDataArchitectAgent.ts | 2,057 | Extract generators |
| src/providers/RuvllmProvider.ts | 2,029 | Extract API handlers |
| src/agents/BaseAgent.ts | 1,913 | Extract shared behaviors |
| src/agents/FlakyTestHunterAgent.ts | 1,731 | Extract detection strategies |
| src/agents/n8n/N8nSecretsHygieneAuditorAgent.ts | 1,698 | Extract audit rules |
| src/agents/FleetCommanderAgent.ts | 1,650 | Extract command handlers |

### Phase 3 Validation Gate

**QE Agent**: `qe-coverage-analyzer`

**Success Criteria**:
- [ ] Logging migration plan documented
- [ ] Top 5 large files have modularization proposals
- [ ] No regression in test coverage

---

## Phase 4: Continuous Improvement Setup

**Duration**: 1-2 days
**Goal**: Prevent regression and automate quality checks

### Milestone 4.1: Quality Gates

**Effects**: CI/CD gates prevent new quality issues

```
WORLD STATE CHANGE:
  - ci_type_check: false -> true
  - ci_any_limit: null -> 735
  - ci_determinism_check: false -> true
```

#### Implementation

```yaml
# .github/workflows/quality-gate.yml additions
- name: Type Safety Check
  run: |
    ANY_COUNT=$(grep -r ": any" src/ | wc -l)
    if [ $ANY_COUNT -gt 735 ]; then
      echo "Type safety regression: $ANY_COUNT > 735"
      exit 1
    fi

- name: Test Determinism Check
  run: |
    for i in {1..3}; do
      npm run test:unit -- --runInBand
    done
```

### Milestone 4.2: Learning Persistence

**Effects**: Quality learnings stored in QE memory

```javascript
// Store learnings for future reference
mcp__agentic-qe__memory_store({
  key: "quality-patterns/determinism",
  namespace: "qe-learnings",
  value: {
    seededRandomPattern: "...",
    fakeTimersPattern: "...",
    commonPitfalls: [...]
  },
  persist: true,
  ttl: 0  // Never expire
});
```

---

## Execution Protocol

### Agent Spawning Pattern

```javascript
// Phase 1 Execution - Spawn all agents in single message
[Single Message - Phase 1]:
  Task("Seeded Random Implementation",
       "Create src/utils/SeededRandom.ts with Mulberry32 PRNG...",
       "coder")

  Task("Timer Pattern Documentation",
       "Document jest.useFakeTimers patterns for setTimeout migration...",
       "tester")

  Task("Skipped Tests Audit",
       "Analyze all 24 skipped test files, categorize by reason...",
       "qe-flaky-investigator")

  Task("Math.random Inventory",
       "Create detailed inventory of all 113 Math.random occurrences...",
       "code-analyzer")
```

### Dependency Graph

```
Phase 1:
  1.1 SeededRandom ──┬──> 1.2 Math.random Migration
                     │
  1.3 Timer Patterns ┴──> Phase 1 Validation
                     │
  1.4 Skipped Audit ─┘

Phase 2:
  2.1 Core Types ──┬──> 2.2 Agent Types
                   ├──> 2.3 Core Types
                   └──> 2.4 MCP Types
                         │
                         └──> Phase 2 Validation

Phase 3:
  3.1 Logging Audit ────> Phase 3 Validation
  3.2 Large File Analysis ┘

Phase 4:
  4.1 Quality Gates
  4.2 Learning Persistence
```

### Rollback Strategy

#### Phase 1 Rollback

```bash
# If determinism fixes cause issues
git revert --no-commit HEAD~N  # Revert N commits
npm run test:unit  # Verify original behavior
git commit -m "Rollback: Phase 1 determinism changes causing issues"
```

#### Phase 2 Rollback

```bash
# If type changes break runtime
git checkout main -- src/types/
npm run typecheck
npm run test:unit
```

### Progress Tracking

```javascript
// Store progress in QE memory
mcp__agentic-qe__memory_store({
  key: "issue-149/progress",
  namespace: "goap-execution",
  value: {
    phase: 1,
    milestone: "1.2",
    completedTasks: [...],
    blockers: [...],
    metrics: {
      mathRandomCount: 45,  // Down from 113
      anyTypeCount: 1200,   // Down from 1470
      skippedTests: 10      // Down from 24
    }
  },
  persist: true
});
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Seeded random breaks tests | Medium | High | Run full test suite after each file migration |
| Type changes cause runtime errors | Low | Medium | Use incremental typing, test thoroughly |
| Fake timers cause test hangs | Medium | Medium | Add timeout guards, use runOnlyPendingTimers |
| Large refactoring merge conflicts | High | Low | Small, focused PRs per milestone |

---

## Success Metrics

### Phase 1 (Test Determinism)
- Math.random in tests: 113 -> 0
- setTimeout without fake timers: 92 files -> 0
- Skipped tests unreviewed: 24 -> 0
- Test flakiness rate: TBD% -> 0%

### Phase 2 (Type Safety)
- `any` type usage: 1,470 -> <735 (50% reduction)
- TypeScript strict mode violations: 0
- Runtime type errors: 0

### Phase 3 (Code Quality)
- Logging strategy documented: Yes
- Modularization candidates identified: 10+ files

### Phase 4 (Prevention)
- CI quality gates active: Yes
- Quality learnings persisted: Yes

---

## Appendix A: Tool Availability

### Claude-Flow Agents
- `coder` - Primary implementation
- `tester` - Test creation and migration
- `reviewer` - Code review
- `code-analyzer` - Static analysis

### QE Agents
- `qe-test-generator` - Generate replacement tests
- `qe-flaky-investigator` - Validate determinism
- `qe-code-reviewer` - Type safety review
- `qe-coverage-analyzer` - Coverage verification

### Existing Infrastructure
- `src/utils/FakerDataGenerator.ts` - Has seed support (use as reference)
- `jest.setup.ts` - Global test configuration
- `jest.config.js` - Test runner configuration

---

## Appendix B: Commands Reference

```bash
# Test Commands
npm run test:unit          # Run unit tests (batched, safe)
npm run test:integration   # Run integration tests (batched)

# Analysis Commands
grep -r "Math.random" src/ | wc -l   # Count random usage
grep -r ": any" src/ | wc -l         # Count any usage
grep -r "\.skip\(" tests/ | wc -l    # Count skipped tests

# Validation Commands
npm run typecheck          # TypeScript validation
npm run lint               # ESLint validation
npm run build              # Full build validation
```

---

**Plan Version**: 1.0.0
**Last Updated**: 2025-12-27
**Author**: GOAP Planning Agent
