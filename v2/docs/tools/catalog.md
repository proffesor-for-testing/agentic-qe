# Agentic QE Tool Catalog

**Version**: 1.5.0 (Phase 3 In Progress)
**Last Updated**: 2025-11-08
**Status**: 🟡 19% Complete (6/32 tools)

---

## Overview

Complete catalog of all QE MCP tools across 7 domains. Phase 3 reorganizes tools into domain-specific modules for better discoverability and type safety.

---

## Domain Summary

| Domain | Tools Created | Tools Planned | Completion | Priority |
|--------|---------------|---------------|------------|----------|
| [Coverage](#coverage-domain) | 1 | 6 | 17% | 🔥 HIGH |
| [Flaky Detection](#flaky-detection-domain) | 1 | 4 | 25% | 🔥 HIGH |
| [Performance](#performance-domain) | 1 | 4 | 25% | ⚠️ MEDIUM |
| [Visual Testing](#visual-testing-domain) | 2 | 3 | 67% | ✅ NEAR COMPLETE |
| [Security](#security-domain) | 0 | 5 | 0% | ⚠️ MEDIUM |
| [Quality Gates](#quality-gates-domain) | 0 | 5 | 0% | 🔴 PENDING |
| [Test Generation](#test-generation-domain) | 0 | 8 | 0% | 🔴 PENDING |
| **TOTAL** | **6** | **35** | **19%** | - |

---

## Coverage Domain

**Path**: `/src/mcp/tools/qe/coverage/`
**Status**: 🟡 1/6 tools (17% complete)
**Priority**: 🔥 HIGHEST

### Available Tools

#### ✅ 1. `analyzeCoverageWithRiskScoring`

**File**: `analyze-with-risk-scoring.ts`
**Status**: AVAILABLE
**Replaces**: `mcp__agentic_qe__test_coverage_detailed`

```typescript
import { analyzeCoverageWithRiskScoring } from '@agentic-qe/tools/qe/coverage';

const result = await analyzeCoverageWithRiskScoring({
  coverageFilePath: string;        // Path to coverage.json
  includeRiskScoring: boolean;     // Enable ML-based risk scoring
  riskThreshold: number;           // Risk threshold (0-1)
  coverageTypes: CoverageType[];   // ['line', 'branch', 'function', 'statement']
});

// Returns
interface CoverageAnalysisResult {
  summary: CoverageSummary;
  criticalGaps: CoverageGap[];
  recommendations: TestRecommendation[];
  riskScore: number;
}
```

**Use Cases**:
- Identify high-risk uncovered code
- Generate test recommendations
- Track coverage trends
- Risk-based test prioritization

---

### Planned Tools

#### 🔴 2. `detectCoverageGapsML`

**File**: `detect-gaps-ml.ts` (PENDING)
**ETA**: Week 3
**Replaces**: `mcp__agentic_qe__coverage_gaps_detect`

```typescript
// Planned signature
function detectCoverageGapsML(params: {
  coverageData: CoverageData;
  mlModel: 'complexity' | 'historical' | 'hybrid';
  minConfidence: number;
}): Promise<CoverageGap[]>
```

---

#### 🔴 3. `recommendTestsForGaps`

**File**: `recommend-tests.ts` (PENDING)
**ETA**: Week 3
**New Feature**: Not available in v1.4.x

```typescript
// Planned signature
function recommendTestsForGaps(params: {
  gaps: CoverageGap[];
  sourceFiles: string[];
  maxRecommendations: number;
  prioritizeBy: 'risk' | 'complexity' | 'changeFrequency';
}): Promise<TestRecommendation[]>
```

---

#### 🔴 4. `analyzeCriticalPaths`

**File**: `analyze-critical-paths.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function analyzeCriticalPaths(params: {
  entryPoints: string[];
  coverage: CoverageData;
  sourceRoot: string;
}): Promise<CriticalPathAnalysis>
```

---

#### 🔴 5. `calculateCoverageTrends`

**File**: `calculate-trends.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function calculateCoverageTrends(params: {
  historicalData: string;
  timeRange: '7d' | '30d' | '90d';
  metrics: CoverageType[];
}): Promise<CoverageTrends>
```

---

#### 🔴 6. `exportCoverageReport`

**File**: `export-report.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function exportCoverageReport(params: {
  coverage: CoverageData;
  format: 'html' | 'json' | 'lcov' | 'cobertura';
  outputPath: string;
  includeCharts: boolean;
}): Promise<ReportMetadata>
```

---

## Flaky Detection Domain

**Path**: `/src/mcp/tools/qe/flaky-detection/`
**Status**: 🟡 1/4 tools (25% complete)
**Priority**: 🔥 HIGH

### Available Tools

#### ✅ 1. `detectFlakyTestsStatistical`

**File**: `detect-statistical.ts`
**Status**: AVAILABLE
**Replaces**: `mcp__agentic_qe__flaky_test_detect`

```typescript
import { detectFlakyTestsStatistical } from '@agentic-qe/tools/qe/flaky-detection';

const flaky = await detectFlakyTestsStatistical({
  testRunHistory: TestRun[];
  flakinessThreshold: number;      // 0.05 = 5% failure rate
  minRuns: number;                 // Minimum runs for statistical significance
  algorithm: 'chi-square' | 'binomial' | 'sequential';
  confidenceLevel: number;         // 0.95 = 95% confidence
});

// Returns
interface FlakyTestResult {
  flakyTests: FlakyTest[];
  analysis: FlakinessAnalysis;
  recommendations: StabilizationRecommendation[];
}
```

**Use Cases**:
- Detect flaky tests with statistical confidence
- Root cause analysis of flakiness
- Track flaky test trends
- Generate stabilization recommendations

---

### Planned Tools

#### 🔴 2. `analyzeFlakyTestPatterns`

**File**: `analyze-patterns.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function analyzeFlakyTestPatterns(params: {
  testRuns: TestRunHistory[];
  minRuns: number;
  patternTypes: ('timing' | 'environment' | 'dependency' | 'race-condition')[];
}): Promise<FlakyPattern[]>
```

---

#### 🔴 3. `stabilizeFlakyTestAuto`

**File**: `stabilize-auto.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function stabilizeFlakyTestAuto(params: {
  testFile: string;
  flakyPattern: FlakyPattern;
  strategies: ('retry' | 'wait' | 'isolation' | 'mock')[];
}): Promise<StabilizationResult>
```

---

#### 🔴 4. `trackFlakyTestHistory`

**File**: `track-history.ts` (PENDING)
**ETA**: Week 3

```typescript
// Planned signature
function trackFlakyTestHistory(params: {
  testIdentifier: string;
  action: 'log' | 'query' | 'analyze';
  timeRange?: string;
}): Promise<FlakyTestHistory>
```

---

## Performance Domain

**Path**: `/src/mcp/tools/qe/performance/`
**Status**: 🟡 1/4 tools (25% complete)
**Priority**: ⚠️ MEDIUM

### Available Tools

#### ✅ 1. `analyzePerformanceBottlenecks`

**File**: `analyze-bottlenecks.ts`
**Status**: AVAILABLE
**New Feature**: Not available in v1.4.x

```typescript
import { analyzePerformanceBottlenecks } from '@agentic-qe/tools/qe/performance';

const bottlenecks = await analyzePerformanceBottlenecks({
  performanceData: {
    cpu: number[];                 // CPU usage percentages
    memory: number[];              // Memory usage (MB)
    responseTime: number[];        // Response times (ms)
  };
  thresholds: {
    cpu: number;                   // e.g., 80 (80%)
    memory: number;                // e.g., 85 (85%)
    responseTime: number;          // e.g., 1000 (1000ms)
  };
  includeRecommendations: boolean;
});

// Returns
interface BottleneckAnalysis {
  bottlenecks: Bottleneck[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendations: PerformanceRecommendation[];
  metrics: PerformanceMetrics;
}
```

**Use Cases**:
- Identify performance bottlenecks
- Track performance metrics
- Generate optimization recommendations
- Monitor resource usage

---

### Planned Tools

#### 🔴 2. `runPerformanceBenchmark`

**File**: `run-benchmark.ts` (PENDING)
**ETA**: Week 3
**Replaces**: `mcp__agentic_qe__performance_benchmark_run`

---

#### 🔴 3. `monitorPerformanceRealtime`

**File**: `monitor-realtime.ts` (PENDING)
**ETA**: Week 3
**Replaces**: `mcp__agentic_qe__performance_monitor_realtime`

---

#### 🔴 4. `generatePerformanceReport`

**File**: `generate-report.ts` (PENDING)
**ETA**: Week 3

---

## Visual Testing Domain

**Path**: `/src/mcp/tools/qe/visual/`
**Status**: 🟢 2/3 tools (67% complete)
**Priority**: ✅ NEAR COMPLETE

### Available Tools

#### ✅ 1. `detectVisualRegression`

**File**: `detect-regression.ts`
**Status**: AVAILABLE
**Replaces**: `mcp__agentic_qe__visual_test_regression`

```typescript
import { detectVisualRegression } from '@agentic-qe/tools/qe/visual';

const regression = await detectVisualRegression({
  baselineDir: string;             // Path to baseline screenshots
  currentDir: string;              // Path to current screenshots
  threshold: number;               // Diff threshold (0-1)
  useAIComparison: boolean;        // Enable AI-powered comparison
  ignoreRegions?: Region[];        // Regions to ignore
});

// Returns
interface VisualRegressionResult {
  differences: VisualDifference[];
  passedTests: number;
  failedTests: number;
  screenshots: ScreenshotComparison[];
}
```

---

#### ✅ 2. `compareScreenshotsAI`

**File**: `compare-screenshots.ts`
**Status**: AVAILABLE
**New Feature**: Not available in v1.4.x

```typescript
import { compareScreenshotsAI } from '@agentic-qe/tools/qe/visual';

const diff = await compareScreenshotsAI({
  baseline: string;                // Baseline screenshot path
  current: string;                 // Current screenshot path
  threshold: number;               // 0.02 = 2% difference threshold
  useAI: boolean;                  // AI-powered semantic comparison
});

// Returns
interface ScreenshotComparison {
  passed: boolean;
  diffPercentage: number;
  diffImage?: string;              // Path to diff visualization
  regions: DiffRegion[];
  aiAnalysis?: AIAnalysis;
}
```

---

### Planned Tools

#### 🔴 3. `validateAccessibilityWCAG`

**File**: `validate-accessibility.ts` (PENDING)
**ETA**: Week 4

```typescript
// Planned signature
function validateAccessibilityWCAG(params: {
  url: string;
  level: 'A' | 'AA' | 'AAA';
  includeScreenshots: boolean;
}): Promise<AccessibilityReport>
```

---

## Security Domain

**Path**: `/src/mcp/tools/qe/security/`
**Status**: 🔴 0/5 tools (0% complete)
**Priority**: ⚠️ MEDIUM

### Planned Tools

#### 🔴 1. `scanSecurityComprehensive`

**File**: `scan-comprehensive.ts` (PENDING)
**ETA**: Week 3-4
**Replaces**: `mcp__agentic_qe__security_scan_comprehensive`

---

#### 🔴 2. `validateAuthenticationFlow`

**File**: `validate-auth.ts` (PENDING)
**ETA**: Week 4

---

#### 🔴 3. `checkAuthorizationRules`

**File**: `check-authz.ts` (PENDING)
**ETA**: Week 4

---

#### 🔴 4. `scanDependenciesVulnerabilities`

**File**: `scan-dependencies.ts` (PENDING)
**ETA**: Week 4

---

#### 🔴 5. `generateSecurityReport`

**File**: `generate-report.ts` (PENDING)
**ETA**: Week 4

---

## Quality Gates Domain

**Path**: `/src/mcp/tools/qe/quality-gates/`
**Status**: 🔴 0/5 tools (0% complete)
**Priority**: 🔴 PENDING

### Planned Tools

All quality gate tools are pending implementation. Existing handlers exist in `src/mcp/handlers/quality/` but need refactoring into domain-specific tools.

---

## Test Generation Domain

**Path**: `/src/mcp/tools/qe/test-generation/`
**Status**: 🔴 0/8 tools (0% complete)
**Priority**: 🔴 PENDING

### Planned Tools

Test generation tools need organization from existing handlers in `src/mcp/handlers/test/`.

---

## Shared Types

**Path**: `/src/mcp/tools/qe/shared/types.ts`
**Status**: ✅ AVAILABLE

Common types used across all domains:

```typescript
// Core enums
export type TestType = 'unit' | 'integration' | 'e2e' | 'property-based' | 'mutation';
export type TestFramework = 'jest' | 'mocha' | 'jasmine' | 'pytest' | 'junit' | ...;
export type ProgrammingLanguage = 'javascript' | 'typescript' | 'python' | 'java' | ...;
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type CoverageType = 'line' | 'branch' | 'function' | 'statement';

// Domain-specific interfaces (100+ types)
```

---

## CLI Tool Discovery

```bash
# List all available tools
aqe tools list

# List tools by domain
aqe tools list --domain coverage
aqe tools list --domain flaky-detection

# Check Phase 3 status
aqe tools phase3-status

# View tool details
aqe tools info analyzeCoverageWithRiskScoring

# Search tools
aqe tools search "coverage"
```

---

## Development

### Adding a New Tool

1. Create tool file in domain directory
2. Implement strict TypeScript types
3. Add JSDoc documentation with examples
4. Export from domain `index.ts`
5. Register in MCP server
6. Write unit tests
7. Update this catalog

**Template**:
```typescript
/**
 * [Tool Name] - [Brief Description]
 *
 * [Detailed description]
 *
 * @param params - [Parameters description]
 * @returns [Return value description]
 *
 * @example
 * ```typescript
 * const result = await toolName({...});
 * ```
 */
export async function toolName(
  params: ToolParams
): Promise<ToolResult> {
  // Implementation
}
```

---

## Version History

### v1.5.0 (Phase 3 - In Progress)

**Status**: 19% Complete (6/35 tools)

**Created**:
- ✅ `analyzeCoverageWithRiskScoring` (coverage)
- ✅ `detectFlakyTestsStatistical` (flaky-detection)
- ✅ `analyzePerformanceBottlenecks` (performance)
- ✅ `detectVisualRegression` (visual)
- ✅ `compareScreenshotsAI` (visual)

**In Progress**: 29 tools pending across 7 domains

---

### v1.4.5 (Current Stable)

**Released**: 2025-11-07

**Features**:
- Agent frontmatter simplification (Phase 1)
- Code execution examples (Phase 2)
- 54 MCP tools (generic naming)

---

## Support

- **Phase 3 Checklist**: `docs/improvement-plan/phase3-checklist.md`
- **Migration Guide**: `docs/migration/phase3-tools.md`
- **Type Definitions**: `src/mcp/tools/qe/shared/types.ts`
- **GitHub Issues**: https://github.com/proffesor-for-testing/agentic-qe/issues

---

**Last Updated**: 2025-11-08
**Next Update**: When Phase 3 reaches 50% completion
