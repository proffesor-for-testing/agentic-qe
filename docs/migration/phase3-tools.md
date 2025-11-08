# Phase 3: Domain-Specific Tool Migration Guide

**Status**: 🟡 DRAFT - Phase 3 In Progress (19% Complete)
**Version**: 1.5.0 (planned)
**Last Updated**: 2025-11-08

---

## Overview

Phase 3 refactors 54 generic MCP tools into 32+ domain-specific tools organized by QE function. This improves discoverability, type safety, and developer experience.

### Implementation Status

| Domain | Tools Created | Tools Planned | Status |
|--------|---------------|---------------|--------|
| **Coverage** | 1 | 6 | 🟡 17% |
| **Flaky Detection** | 1 | 4 | 🟡 25% |
| **Performance** | 1 | 4 | 🟡 25% |
| **Visual Testing** | 2 | 3 | 🟢 67% |
| **Security** | 0 | 5 | 🔴 0% |
| **Quality Gates** | 0 | 5 | 🔴 0% |
| **Test Generation** | 0 | 8 | 🔴 0% |
| **TOTAL** | **6** | **32+** | **🟡 19%** |

---

## What's Changing?

### Before Phase 3 (Generic Tools)

Tools had generic names without clear domain context:

```typescript
// OLD: Generic naming (v1.4.5 and earlier)
mcp__agentic_qe__test_coverage_detailed()
mcp__agentic_qe__quality_analyze()
mcp__agentic_qe__predict_defects()
```

### After Phase 3 (Domain-Specific Tools)

Tools organized by QE domain with clear intent:

```typescript
// NEW: Domain-specific naming (v1.5.0+)
import { analyzeCoverageWithRiskScoring } from '@agentic-qe/tools/qe/coverage';
import { detectFlakyTestsStatistical } from '@agentic-qe/tools/qe/flaky-detection';
import { runPerformanceBenchmark } from '@agentic-qe/tools/qe/performance';
```

---

## Migration Examples

### 1. Coverage Analysis

#### Before (v1.4.x)
```typescript
// Generic tool
const result = await mcp__agentic_qe__test_coverage_detailed({
  coverageData: './coverage/coverage.json',
  analyzeGaps: true,
  riskScoring: true
});
```

#### After (v1.5.x)
```typescript
// Domain-specific tool
import { analyzeCoverageWithRiskScoring } from './tools/qe/coverage/analyze-with-risk-scoring';

const result = await analyzeCoverageWithRiskScoring({
  coverageFilePath: './coverage/coverage.json',
  includeRiskScoring: true,
  riskThreshold: 0.7
});
```

**Migration checklist:**
- ✅ Import from domain-specific path
- ✅ Update parameter names (check TypeScript types)
- ✅ Test updated code
- ⚠️ Old tool remains available with deprecation warning until v3.0.0

---

### 2. Flaky Test Detection

#### Before (v1.4.x)
```typescript
// Generic tool
const flaky = await mcp__agentic_qe__flaky_test_detect({
  testRuns: historyData,
  threshold: 0.05
});
```

#### After (v1.5.x)
```typescript
// Domain-specific tool
import { detectFlakyTestsStatistical } from './tools/qe/flaky-detection/detect-statistical';

const flaky = await detectFlakyTestsStatistical({
  testRunHistory: historyData,
  flakinessThreshold: 0.05,
  minRuns: 10,
  algorithm: 'chi-square'
});
```

**Benefits:**
- ✅ Better type safety (strict TypeScript)
- ✅ More descriptive parameters
- ✅ Algorithm selection
- ✅ Improved JSDoc documentation

---

### 3. Performance Testing

#### Before (v1.4.x)
```typescript
// Generic handler call
const perf = await mcp__agentic_qe__performance_benchmark_run({
  scenario: 'load-test',
  duration: 60
});
```

#### After (v1.5.x)
```typescript
// Domain-specific tool
import { analyzePerformanceBottlenecks } from './tools/qe/performance/analyze-bottlenecks';

const bottlenecks = await analyzePerformanceBottlenecks({
  performanceData: {
    cpu: perfMetrics.cpu,
    memory: perfMetrics.memory,
    responseTime: perfMetrics.responseTime
  },
  thresholds: {
    cpu: 80,
    memory: 85,
    responseTime: 1000
  },
  includeRecommendations: true
});
```

---

### 4. Visual Regression Testing

#### Before (v1.4.x)
```typescript
// Generic tool
const visual = await mcp__agentic_qe__visual_test_regression({
  baseline: './screenshots/baseline/',
  current: './screenshots/current/'
});
```

#### After (v1.5.x)
```typescript
// Domain-specific tools (2 tools created ✅)
import { detectVisualRegression } from './tools/qe/visual/detect-regression';
import { compareScreenshotsAI } from './tools/qe/visual/compare-screenshots';

// Option 1: Full regression detection
const regression = await detectVisualRegression({
  baselineDir: './screenshots/baseline/',
  currentDir: './screenshots/current/',
  threshold: 0.02,
  useAIComparison: true
});

// Option 2: Individual screenshot comparison
const diff = await compareScreenshotsAI({
  baseline: './baseline/login.png',
  current: './current/login.png',
  threshold: 0.02,
  useAI: true
});
```

---

## Complete Tool Mapping

### ✅ Completed Migrations

| Old Tool (v1.4.x) | New Tool (v1.5.x) | Domain | Status |
|-------------------|-------------------|--------|--------|
| `test_coverage_detailed` | `analyzeCoverageWithRiskScoring` | coverage | ✅ CREATED |
| `flaky_test_detect` | `detectFlakyTestsStatistical` | flaky-detection | ✅ CREATED |
| `performance_benchmark_run` | `analyzePerformanceBottlenecks` | performance | ✅ CREATED |
| `visual_test_regression` | `detectVisualRegression` | visual | ✅ CREATED |
| - | `compareScreenshotsAI` | visual | ✅ CREATED (NEW) |

### 🟡 In Progress Migrations

| Old Tool (v1.4.x) | New Tool (v1.5.x) | Domain | ETA |
|-------------------|-------------------|--------|-----|
| - | `recommendTestsForGaps` | coverage | Week 3 |
| - | `analyzeCriticalPaths` | coverage | Week 3 |
| - | `calculateCoverageTrends` | coverage | Week 3 |
| - | `exportCoverageReport` | coverage | Week 3 |
| - | `analyzeFlakyTestPatterns` | flaky-detection | Week 3 |
| - | `stabilizeFlakyTestAuto` | flaky-detection | Week 3 |
| - | `trackFlakyTestHistory` | flaky-detection | Week 3 |
| - | `runPerformanceBenchmark` | performance | Week 3 |
| - | `monitorPerformanceRealtime` | performance | Week 3 |
| - | `generatePerformanceReport` | performance | Week 3 |

### 🔴 Pending Migrations (Week 4+)

| Old Tool (v1.4.x) | New Tool (v1.5.x) | Domain | Status |
|-------------------|-------------------|--------|--------|
| `security_scan_comprehensive` | `scanSecurityComprehensive` | security | PENDING |
| - | `validateAuthenticationFlow` | security | PENDING (NEW) |
| - | `checkAuthorizationRules` | security | PENDING (NEW) |
| - | `scanDependenciesVulnerabilities` | security | PENDING (NEW) |
| - | `generateSecurityReport` | security | PENDING (NEW) |
| `quality_gate_execute` | `validateDeploymentReadiness` | quality-gates | PENDING |
| `quality_risk_assess` | `assessDeploymentRisk` | quality-gates | PENDING |
| `quality_policy_check` | `checkQualityPolicies` | quality-gates | PENDING |
| `quality_validate_metrics` | `validateQualityMetrics` | quality-gates | PENDING |
| `quality_decision_make` | `makeQualityDecision` | quality-gates | PENDING |

---

## Backward Compatibility

### Deprecation Timeline

```
v1.5.0 (Nov 2025)  →  v2.0.0 (Jan 2026)  →  v3.0.0 (Feb 2026)
    │                       │                      │
    │                       │                      └─ Old tools REMOVED
    │                       └─ Deprecation warnings intensify
    └─ Old tools work with warnings
```

### Using Deprecated Tools (v1.5.0 - v2.9.x)

Old tools continue to work with deprecation warnings:

```typescript
// This still works, but shows a warning:
const result = await mcp__agentic_qe__test_coverage_detailed({...});

// Console output:
⚠️  test_coverage_detailed() is deprecated.
   Use analyzeCoverageWithRiskScoring() from coverage domain.
   This function will be removed in v3.0.0 (scheduled for February 2026).
   Migration guide: docs/migration/phase3-tools.md
```

### Testing Compatibility

Run compatibility tests to identify deprecated tool usage:

```bash
# Check for deprecated tool usage
aqe tools check-deprecated

# Generate migration report
aqe tools migration-report --output ./migration.json

# Preview changes (dry run)
aqe tools migrate --dry-run

# Auto-migrate (with backup)
aqe tools migrate --auto --backup
```

---

## New Features (Phase 3 Only)

### 1. Better Type Safety

All domain tools use strict TypeScript with no `any` types:

```typescript
// OLD: Loose typing
function test_coverage_detailed(params: any): Promise<any>

// NEW: Strict typing
function analyzeCoverageWithRiskScoring(
  params: CoverageAnalysisParams
): Promise<CoverageAnalysisResult>
```

### 2. Domain-Specific Parameters

Parameters optimized for each domain:

```typescript
// Coverage domain
interface CoverageAnalysisParams {
  coverageFilePath: string;
  includeRiskScoring: boolean;
  riskThreshold: number;
  coverageTypes: CoverageType[];
}

// Flaky detection domain
interface FlakyDetectionParams {
  testRunHistory: TestRun[];
  flakinessThreshold: number;
  minRuns: number;
  algorithm: 'chi-square' | 'binomial' | 'sequential';
}
```

### 3. Improved Documentation

Every tool has comprehensive JSDoc:

```typescript
/**
 * Analyze code coverage with ML-based risk scoring
 *
 * Uses machine learning to identify high-risk uncovered code paths
 * based on:
 * - Code complexity metrics
 * - Historical bug density
 * - Change frequency
 * - Dependency criticality
 *
 * @param params - Coverage analysis parameters
 * @returns Risk-scored coverage analysis with recommendations
 *
 * @example
 * ```typescript
 * const result = await analyzeCoverageWithRiskScoring({
 *   coverageFilePath: './coverage/coverage.json',
 *   includeRiskScoring: true,
 *   riskThreshold: 0.7
 * });
 *
 * console.log(`Critical gaps: ${result.criticalGaps.length}`);
 * ```
 */
export async function analyzeCoverageWithRiskScoring(
  params: CoverageAnalysisParams
): Promise<CoverageAnalysisResult>
```

---

## Troubleshooting

### Issue: "Cannot find module '@agentic-qe/tools/qe/coverage'"

**Solution**: Phase 3 tools may not be published yet. Check status:

```bash
aqe version --check-phase3
# Output: Phase 3: 19% complete (6/32 tools)
```

**Workaround**: Use deprecated tools until Phase 3 completion (v1.5.0).

---

### Issue: "Deprecated tool warnings flooding logs"

**Solution**: Suppress warnings temporarily (not recommended):

```bash
export AQE_SUPPRESS_DEPRECATION_WARNINGS=true
```

**Better solution**: Migrate to new tools using migration guide.

---

### Issue: "Type errors after migration"

**Solution**: Update parameter names and types:

```typescript
// Before
await tool({ analyzeGaps: true })

// After
await tool({ includeGapAnalysis: true })
```

Check TypeScript errors for specific parameter name changes.

---

## FAQ

### When will Phase 3 be complete?

**Target**: End of November 2025 (2-week sprint)

**Current Progress**: 19% (6/32 tools created)

**Tracking**: Run `aqe tools phase3-status` for live progress

---

### Do I need to migrate immediately?

**No**. Old tools work until v3.0.0 (February 2026). You have 3 months.

**Recommendation**: Migrate incrementally as Phase 3 tools become available.

---

### Will this break my existing code?

**No**. Phase 3 is 100% backward compatible. Old tools continue to work with deprecation warnings.

---

### How do I know which tools are available?

```bash
# List all domain-specific tools
aqe tools list --phase3

# Check specific domain
aqe tools list --domain coverage

# Show migration status
aqe tools migration-status
```

---

## Getting Help

- **Migration Issues**: [GitHub Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Tool Catalog**: `docs/tools/catalog.md`
- **Phase 3 Checklist**: `docs/improvement-plan/phase3-checklist.md`
- **Type Definitions**: `src/mcp/tools/qe/shared/types.ts`

---

**Last Updated**: 2025-11-08 (Phase 3 in progress - 19% complete)
