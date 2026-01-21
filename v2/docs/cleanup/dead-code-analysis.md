# Dead Code Analysis Report

**Generated:** 2026-01-02
**Project:** Agentic QE Fleet
**Version:** v2.7.4

## Executive Summary

A comprehensive analysis of the Agentic QE codebase identified **significant dead code** across multiple areas. This report consolidates findings from module-by-module analysis and provides actionable cleanup recommendations.

### Key Metrics

| Category | Dead Code Items | Est. Lines | Impact |
|----------|----------------|------------|--------|
| MCP Handlers (unregistered) | 14 handlers | ~2,500 | High - missing features |
| CLI Commands (unregistered) | 45+ files | ~4,000 | High - inaccessible features |
| Scripts (one-time/orphaned) | 100+ scripts | ~8,000 | Medium - clutter |
| Orphaned Directories | 3 directories | ~1,700 | Medium - confusion |
| Unused Dependencies | 4-12 packages | - | Low - bundle size |
| Test Organization Issues | 7+ files | ~500 | Low - maintenance |

**Total estimated removable code:** ~16,000+ lines

---

## 1. MCP Handlers - Dead Code

### 1.1 Unregistered Chaos Engineering Handlers

**Location:** `/src/mcp/handlers/chaos/`

| File | Status | Impact |
|------|--------|--------|
| `chaos-inject-latency.ts` | DEAD | Chaos testing unavailable |
| `chaos-inject-failure.ts` | DEAD | Failure injection unavailable |
| `chaos-resilience-test.ts` | DEAD | Resilience testing unavailable |

**Issue:** Exported from index.ts but NOT registered in `server.ts` or `TOOL_NAMES`

### 1.2 Unregistered Integration Testing Handlers

**Location:** `/src/mcp/handlers/integration/`

| File | Status | Impact |
|------|--------|--------|
| `contract-validate.ts` | DEAD | Contract testing unavailable |
| `dependency-check.ts` | DEAD | Dependency validation unavailable |
| `integration-test-orchestrate.ts` | DEAD | Integration orchestration unavailable |

### 1.3 Unregistered Filtered Handlers (Token Optimization)

**Location:** `/src/mcp/handlers/filtered/`

These handlers provide **95-99% token reduction** but are completely unused:

| File | Token Reduction | Annual Savings* |
|------|----------------|-----------------|
| `coverage-analyzer-filtered.ts` | 99% | ~$18,000 |
| `test-executor-filtered.ts` | 97.3% | ~$15,000 |
| `flaky-detector-filtered.ts` | 98.5% | ~$12,000 |
| `performance-tester-filtered.ts` | 98.3% | ~$20,000 |
| `security-scanner-filtered.ts` | 97.2% | ~$8,000 |
| `quality-assessor-filtered.ts` | 97.5% | ~$8,000 |

*Estimated at 1,000 ops/day with Claude API pricing

### 1.4 Orphaned Type Definitions

**Location:** `/src/mcp/types/`

| File | Lines | Status |
|------|-------|--------|
| `chaos.ts` | 368 | Orphaned - types for unregistered handlers |
| `integration.ts` | 502 | Orphaned - types for unregistered handlers |

---

## 2. CLI Commands - Dead Code

### 2.1 Completely Unregistered Command Modules

**45+ TypeScript files** are defined but never accessible via CLI:

#### Fleet Command (13 files)
**Path:** `/src/cli/commands/fleet/`
```
backup.ts, health.ts, init.ts, logs.ts, metrics.ts,
monitor.ts, optimize.ts, recover.ts, restart.ts,
scale.ts, shutdown.ts, status.ts, topology.ts
```
**Impact:** Fleet lifecycle management commands inaccessible

#### Test Command (14 files)
**Path:** `/src/cli/commands/test/`
```
analyze-failures.ts, clean.ts, debug.ts, diff.ts,
flakiness.ts, mutate.ts, parallel.ts, profile.ts,
queue.ts, retry.ts, snapshot.ts, trace.ts, watch.ts
```
**Impact:** Advanced test execution features unavailable

#### Quality Command (9 files)
**Path:** `/src/cli/commands/quality/`
```
baseline.ts, compare.ts, decision.ts, gate.ts,
policy.ts, risk.ts, trends.ts, validate.ts
```
**Impact:** Quality gates and policy management unavailable

#### Monitor Command (6 files)
**Path:** `/src/cli/commands/monitor/`
```
alerts.ts, analyze.ts, compare.ts, dashboard.ts, export.ts
```
**Impact:** Monitoring and alerting unavailable

### 2.2 Partially Registered Commands

| Command | Import Status | Registration Status |
|---------|--------------|---------------------|
| `migrate` | ✓ Imported | ✗ Never added to program |
| `ruvector` | ✓ Imported | ✗ Never added to program |
| `agentdb` | ✗ Not imported | ✗ Not registered |

### 2.3 Duplicate/Backup CLI Files

**Path:** `/src/cli/`

| File | Size | Status |
|------|------|--------|
| `index-spec.ts` | 7.6 KB | Superseded backup |
| `index-working.ts` | 29.1 KB | Superseded working copy |
| `index.ts` | 50.5 KB | **ACTIVE** |

---

## 3. Scripts Directory - Dead Code

### 3.1 One-Time Store Scripts (16 files)

**Path:** `/scripts/store-*.ts`

All store results from historical test runs - no current references:
```
store-suite1-results.ts, store-suite2-results.ts,
store-suite3-results.ts, store-suite4-and-final-results.ts,
store-batch-001-results.ts, store-batch-004-completion.ts,
store-batch-completion-status.ts, store-test-results.ts,
store-coverage-progress.ts, store-coverage-improvement.ts,
store-jest-fix-results.ts, store-infrastructure-fixes.ts,
store-core-test-fixes.ts, store-comprehensive-results.ts,
store-calculator-learning.ts, store-pass-rate-analysis.ts
```

### 3.2 Orphaned Migration Scripts

**Superseded by newer migrations:**
- `migrate-add-qe-tables.ts`
- `migrate-patterns-table.ts`
- `migrate-patterns.ts`

**KEEP (Active in package.json):**
- `migrate-learning-schema.ts`
- `migrate-to-agentdb.ts`

### 3.3 One-Time Verification Scripts (20 files)

**Path:** `/scripts/verify-*.ts` (except those in package.json)

Most are one-time checks for specific deployments or issues:
```
verify-deployment-fixes.ts, verify-learning-persistence.ts,
verify-pattern-persistence.ts, verify-security-fix.ts,
verify-infrastructure-fixes.ts, verify-issue-79-fix.ts,
verify-regression-tools.ts, verify-ruvector-integration.ts,
... (12 more)
```

### 3.4 Summary by Category

| Category | Count | Recommendation |
|----------|-------|----------------|
| Active (in package.json) | 45 | KEEP |
| One-time/Historical | 60+ | ARCHIVE or DELETE |
| Orphaned (no references) | 40+ | DELETE |
| Development utilities | 60+ | KEEP for dev |
| Workers/Hooks | 5 | KEEP (active) |

---

## 4. Orphaned Source Directories

### 4.1 Completely Dead Directories

#### `/src/alerting/` - DEAD
- **Files:** 5 TypeScript files (~700 lines)
- **Status:** Zero imports anywhere in codebase
- **Note:** `src/learning/metrics/AlertManager.ts` serves this purpose
- **Action:** DELETE entire directory

#### `/src/reporting/` - DEAD
- **Files:** 7 TypeScript files (~1,000 lines)
- **Status:** Exported but never imported
- **Classes:** `ReporterFactory`, `ResultAggregator` never used
- **Action:** DELETE entire directory

#### `/src/transport/` - DEAD (Design-Only)
- **Files:** 1 README only
- **Status:** No TypeScript implementation
- **Action:** DELETE directory

### 4.2 Active Directories (KEEP)

| Directory | Files | Status |
|-----------|-------|--------|
| `/src/visualization/` | 6 | ACTIVE - 40+ agent integrations |
| `/src/memory/` | 7 | ACTIVE - pattern storage layer |
| `/src/config/` | 3 | ACTIVE - LLM configuration |
| `/src/security/` | 1 | ACTIVE - PII tokenization |
| `/src/plugins/` | 8 | ACTIVE - test framework adapters |
| `/src/providers/` | 18 | ACTIVE - LLM routing |
| `/src/voting/` | 6 | ACTIVE - constitution voting |
| `/src/test/partition/` | 5 | ACTIVE - MinCut test partitioning |

---

## 5. Unused npm Dependencies

### 5.1 Definitely Unused

| Package | Type | Evidence |
|---------|------|----------|
| `jose` | devDep | Zero imports - JWT library never used |
| `@types/chrome` | devDep | Zero imports - extension types unused |
| `gpt-tokenizer` | dep | Only in validation script, not src |

### 5.2 Minimal Usage (Review)

| Package | Type | Usage |
|---------|------|-------|
| `react` | devDep | 1 file (`useKeyboardShortcuts.ts`) - unused hook |

### 5.3 Duplicate Functionality (OpenTelemetry)

11 OpenTelemetry packages installed with duplicates:
- Both GRPC and HTTP exporters for metrics/traces
- Only `@opentelemetry/api` actually imported

**Consolidation potential:** Remove 4-6 packages

---

## 6. Test Organization Issues

### 6.1 Tests in Wrong Location (CRITICAL)

**Violates CLAUDE.md rules:**

| File | Current Location | Correct Location |
|------|-----------------|------------------|
| `HNSWPatternStore.test.ts` | `src/memory/__tests__/` | `tests/unit/core/memory/` |
| `OutputFormatter.test.ts` | `src/output/__tests__/` | `tests/unit/output/` (exists) |

### 6.2 Duplicate Test Files

**RuVector Tests (2 implementations):**
- `tests/integration/RuVector.SelfLearning.test.ts` (Jest)
- `tests/integration/ruvector-self-learning.test.ts` (Vitest)

**Learning Persistence Tests (5 variations):**
```
tests/integration/agent-learning-persistence.test.ts
tests/integration/learning-persistence-agent.test.ts
tests/integration/learning-persistence.test.ts
tests/integration/learning-persistence-corrected.test.ts
tests/integration/learning-persistence-verification.test.ts
```

### 6.3 Temp Directory Artifacts

**Path:** `tests/temp/`
- **Files:** 398 auto-generated test files
- **Pattern:** `cli-test-TIMESTAMP/tests/user.test.ts`
- **Action:** Review retention policy or delete

---

## 7. Cleanup Recommendations

### Phase 1: Critical (Immediate Impact)

1. **Register or remove MCP handlers**
   - Chaos handlers: 3 files
   - Integration handlers: 3 files
   - Filtered handlers: 7 files (or register for cost savings)

2. **Fix CLI command registrations**
   - Add `program.addCommand(createMigrateCommand())`
   - Add `program.addCommand(createRuVectorCommand())`
   - Register or archive fleet/test/quality/monitor commands

3. **Move tests from src/ to tests/**
   - `src/memory/__tests__/` → `tests/unit/core/memory/`
   - `src/output/__tests__/` → consolidate with existing

### Phase 2: High Priority (Code Quality)

4. **Remove dead directories**
   - Delete: `src/alerting/`, `src/reporting/`, `src/transport/`
   - ~1,700 lines of unused code

5. **Remove CLI backup files**
   - Delete: `src/cli/index-spec.ts`, `src/cli/index-working.ts`

6. **Consolidate duplicate tests**
   - Merge RuVector tests
   - Consolidate learning persistence tests

### Phase 3: Medium Priority (Maintenance)

7. **Archive one-time scripts**
   - Move to `scripts/archive/`: store-*.ts, old verify-*.ts

8. **Remove unused dependencies**
   - Remove: `jose`, `@types/chrome`, `gpt-tokenizer`
   - Move `react` to optional if keyboard shortcuts are future feature

9. **Consolidate OpenTelemetry packages**
   - Choose GRPC or HTTP exporters, not both

### Phase 4: Low Priority (Nice to Have)

10. **Clean up tests/temp/**
11. **Document skipped tests (21 files)**
12. **Review HybridRouter test variants**

---

## Appendix A: File Paths Reference

### Dead MCP Handlers
```
src/mcp/handlers/chaos/chaos-inject-latency.ts
src/mcp/handlers/chaos/chaos-inject-failure.ts
src/mcp/handlers/chaos/chaos-resilience-test.ts
src/mcp/handlers/integration/contract-validate.ts
src/mcp/handlers/integration/dependency-check.ts
src/mcp/handlers/integration/integration-test-orchestrate.ts
src/mcp/handlers/filtered/coverage-analyzer-filtered.ts
src/mcp/handlers/filtered/test-executor-filtered.ts
src/mcp/handlers/filtered/flaky-detector-filtered.ts
src/mcp/handlers/filtered/performance-tester-filtered.ts
src/mcp/handlers/filtered/security-scanner-filtered.ts
src/mcp/handlers/filtered/quality-assessor-filtered.ts
src/mcp/types/chaos.ts
src/mcp/types/integration.ts
```

### Dead CLI Commands
```
src/cli/commands/fleet/ (13 files)
src/cli/commands/test/ (14 files)
src/cli/commands/quality/ (9 files)
src/cli/commands/monitor/ (6 files)
src/cli/index-spec.ts
src/cli/index-working.ts
```

### Dead Source Directories
```
src/alerting/ (5 files)
src/reporting/ (7 files)
src/transport/ (README only)
```

### Test Organization Issues
```
src/memory/__tests__/HNSWPatternStore.test.ts
src/output/__tests__/OutputFormatter.test.ts
tests/integration/RuVector.SelfLearning.test.ts (duplicate)
tests/integration/ruvector-self-learning.test.ts (duplicate)
tests/integration/*learning-persistence*.test.ts (5 files)
```

---

## Appendix B: Active Code Summary

### Confirmed Active (DO NOT DELETE)

**MCP Handlers (Registered):**
- 60+ tools in TOOL_NAMES
- Fleet, Memory, Workflow, Learning, Phase3 Domain tools

**CLI Commands (Active):**
- init, start, status, workflow, config, debug
- memory, routing, learn, dream, transfer
- patterns, skills, improve, telemetry
- quantization, constitution, providers, kg

**Source Directories (Integrated):**
- src/agents/, src/core/, src/cli/, src/mcp/
- src/visualization/, src/memory/, src/providers/
- src/plugins/, src/security/, src/voting/
- src/config/, src/test/partition/

---

*Report generated by comprehensive codebase analysis using parallel Explore agents*
