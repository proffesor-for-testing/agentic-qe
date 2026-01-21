# Phase 3: Domain-Specific Tool Refactoring - Complete Architecture

**Version**: 1.0.0
**Date**: 2025-11-08
**Status**: Ready for Implementation
**Estimated Effort**: 2 weeks (7 working days)

---

## Executive Summary

This document defines the complete architecture for refactoring 54 generic MCP tools into 32 domain-specific tools organized across 6 QE domains. The architecture prioritizes type safety, developer experience, and backward compatibility while maintaining zero breaking changes.

**Key Metrics**:
- **15 New Tools**: Created across 6 domains
- **17 Existing Tools**: Reorganized and renamed
- **100% Backward Compatibility**: All old tool names preserved as deprecated aliases
- **Zero `any` Types**: Full TypeScript strict mode compliance
- **6 Domain Directories**: Organized by QE specialization

---

## Table of Contents

1. [Directory Structure](#directory-structure)
2. [TypeScript Architecture](#typescript-architecture)
3. [Tool Specifications](#tool-specifications)
4. [Implementation Order](#implementation-order)
5. [Integration Points](#integration-points)
6. [Backward Compatibility](#backward-compatibility)
7. [Testing Strategy](#testing-strategy)

---

## 1. Directory Structure

### Complete Folder Hierarchy

```
src/mcp/tools/qe/
├── coverage/                         # 6 tools (2 existing + 4 new)
│   ├── analyze-with-risk-scoring.ts  # ← MOVED from handlers/analysis/coverage-analyze-sublinear-handler.ts
│   ├── detect-gaps-ml.ts             # ← MOVED from handlers/analysis/coverage-gaps-detect-handler.ts
│   ├── recommend-tests.ts            # ✨ NEW
│   ├── analyze-critical-paths.ts    # ✨ NEW
│   ├── calculate-trends.ts          # ✨ NEW
│   ├── export-report.ts             # ✨ NEW
│   └── index.ts                     # Barrel export
│
├── flaky-detection/                  # 4 tools (1 existing + 3 new)
│   ├── detect-statistical.ts        # ← MOVED from handlers/prediction/flaky-test-detect.ts
│   ├── analyze-patterns.ts          # ✨ NEW
│   ├── stabilize-auto.ts            # ✨ NEW
│   ├── track-history.ts             # ✨ NEW
│   └── index.ts                     # Barrel export
│
├── performance/                      # 4 tools (2 existing + 2 new)
│   ├── run-benchmark.ts             # ← MOVED from handlers/analysis/performance-benchmark-run-handler.ts
│   ├── monitor-realtime.ts          # ← MOVED from handlers/analysis/performance-monitor-realtime-handler.ts
│   ├── analyze-bottlenecks.ts       # ✨ NEW
│   ├── generate-report.ts           # ✨ NEW
│   └── index.ts                     # Barrel export
│
├── security/                         # 5 tools (1 existing + 4 new)
│   ├── scan-comprehensive.ts        # ← MOVED from handlers/analysis/security-scan-comprehensive-handler.ts
│   ├── validate-auth.ts             # ✨ NEW
│   ├── check-authz.ts               # ✨ NEW
│   ├── scan-dependencies.ts         # ✨ NEW
│   ├── generate-report.ts           # ✨ NEW
│   └── index.ts                     # Barrel export
│
├── visual/                           # 3 tools (1 existing + 2 new)
│   ├── detect-regression.ts         # ← MOVED from handlers/chaos/visual-test-regression.ts
│   ├── compare-screenshots.ts       # ✨ NEW
│   ├── validate-accessibility.ts    # ✨ NEW
│   └── index.ts                     # Barrel export
│
├── test-generation/                  # 4 tools (all existing, reorganized)
│   ├── generate-unit-tests.ts       # ← MOVED from handlers/test/generate-unit-tests.ts
│   ├── generate-integration-tests.ts # ← MOVED from handlers/test/generate-integration-tests.ts
│   ├── test-generate-enhanced.ts    # ← MOVED from handlers/test/test-generate-enhanced.ts
│   ├── optimize-test-suite.ts       # ← MOVED from handlers/test/optimize-test-suite.ts
│   └── index.ts                     # Barrel export
│
├── quality-gates/                    # 5 tools (all existing, renamed)
│   ├── validate-readiness.ts        # ← RENAMED from handlers/quality/quality-gate-execute.ts
│   ├── assess-risk.ts               # ← RENAMED from handlers/quality/quality-risk-assess.ts
│   ├── check-policies.ts            # ← RENAMED from handlers/quality/quality-policy-check.ts
│   ├── validate-metrics.ts          # ← RENAMED from handlers/quality/quality-validate-metrics.ts
│   ├── make-decision.ts             # ← RENAMED from handlers/quality/quality-decision-make.ts
│   └── index.ts                     # Barrel export
│
└── shared/
    ├── types.ts                     # ✅ ALREADY EXISTS - Shared TypeScript types
    ├── validators.ts                # ✨ NEW - Parameter validation utilities
    ├── errors.ts                    # ✨ NEW - Custom error classes
    └── index.ts                     # Barrel export
```

**Total Count**:
- **15 New Tools**: 4 coverage + 3 flaky + 2 performance + 4 security + 2 visual
- **17 Reorganized Tools**: 4 test-gen + 5 quality-gates + 2 coverage + 2 performance + 1 security + 1 visual + 1 flaky + 1 visual
- **32 Total Tools**: Organized across 6 domains

---

## 2. TypeScript Architecture

### 2.1 Base Types (Already Exist in `shared/types.ts`)

The following types are already defined in `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/types.ts`:

**Core Enums**:
- `TestType`, `TestFramework`, `ProgrammingLanguage`, `Priority`, `Environment`, `TestStatus`, `CoverageType`

**Domain Types**:
- `UnitTestGenerationParams`, `IntegrationTestGenerationParams`, `E2ETestGenerationParams`
- `SublinearCoverageParams`, `CoverageGapDetectionParams`, `DetailedCoverageParams`
- `QualityGateExecutionParams`, `QualityPolicy`, `QualityMetrics`
- `FlakyTestDetectionParams`, `RegressionRiskParams`
- `PerformanceBenchmarkParams`, `RealtimeMonitorParams`
- `SecurityScanParams`, `BreakingChangeParams`

**Response Types**:
- `QEToolResponse<T>`, `QEError`, `ResponseMetadata`

### 2.2 New Shared Types (to add to `shared/types.ts`)

```typescript
// ==================== New Coverage Domain Types ====================

/**
 * Parameters for test recommendation
 */
export interface TestRecommendationParams {
  /** Coverage gaps to analyze */
  gaps: CoverageGap[];

  /** Source files for context */
  sourceFiles: string[];

  /** Maximum recommendations to generate */
  maxRecommendations: number;

  /** Prioritization strategy */
  prioritizeBy: 'risk' | 'complexity' | 'changeFrequency';

  /** Include code examples */
  includeExamples: boolean;
}

/**
 * Coverage gap information
 */
export interface CoverageGap {
  /** File path */
  file: string;

  /** Gap type */
  type: 'line' | 'branch' | 'function';

  /** Line or range */
  location: {
    start: number;
    end: number;
  };

  /** Risk score (0-1) */
  riskScore: number;

  /** Complexity score */
  complexity: number;

  /** Change frequency (commits/month) */
  changeFrequency: number;
}

/**
 * Test recommendation
 */
export interface TestRecommendation {
  /** Target file */
  file: string;

  /** Recommended test type */
  testType: TestType;

  /** Priority level */
  priority: Priority;

  /** Rationale */
  rationale: string;

  /** Suggested test cases */
  testCases: string[];

  /** Code example (optional) */
  codeExample?: string;
}

/**
 * Critical path analysis parameters
 */
export interface CriticalPathAnalysisParams {
  /** Entry points to analyze */
  entryPoints: string[];

  /** Coverage data */
  coverage: CoverageReport;

  /** Source root directory */
  sourceRoot: string;

  /** Dependency graph */
  dependencyGraph?: DependencyGraph;
}

/**
 * Critical path analysis result
 */
export interface CriticalPathAnalysis {
  /** Identified critical paths */
  paths: CriticalPath[];

  /** Overall risk score */
  overallRisk: number;

  /** Coverage summary for critical paths */
  coverageSummary: CoverageSummary;

  /** Recommendations */
  recommendations: TestRecommendation[];
}

/**
 * Critical path definition
 */
export interface CriticalPath {
  /** Path identifier */
  id: string;

  /** Entry point */
  entryPoint: string;

  /** Files in path */
  files: string[];

  /** Total lines in path */
  totalLines: number;

  /** Covered lines in path */
  coveredLines: number;

  /** Risk score (0-1) */
  riskScore: number;

  /** Complexity score */
  complexity: number;
}

/**
 * Coverage trend parameters
 */
export interface CoverageTrendParams {
  /** Historical coverage data path */
  historicalData: string;

  /** Time range */
  timeRange: '7d' | '30d' | '90d';

  /** Metrics to analyze */
  metrics: CoverageType[];

  /** Include predictions */
  includePredictions: boolean;
}

/**
 * Coverage trends result
 */
export interface CoverageTrends {
  /** Time series data */
  timeSeries: TimeSeriesData[];

  /** Trend direction */
  trend: 'improving' | 'stable' | 'declining';

  /** Predicted future coverage */
  predictions?: CoveragePrediction[];

  /** Insights */
  insights: string[];
}

/**
 * Time series data point
 */
export interface TimeSeriesData {
  /** Timestamp */
  timestamp: string;

  /** Coverage percentage */
  coverage: number;

  /** Metric type */
  metric: CoverageType;

  /** Commit hash */
  commit?: string;
}

/**
 * Coverage prediction
 */
export interface CoveragePrediction {
  /** Future timestamp */
  timestamp: string;

  /** Predicted coverage */
  coverage: number;

  /** Confidence interval */
  confidence: {
    lower: number;
    upper: number;
  };
}

/**
 * Coverage report export parameters
 */
export interface CoverageReportExportParams {
  /** Coverage data */
  coverage: CoverageReport;

  /** Export format */
  format: 'html' | 'json' | 'lcov' | 'cobertura' | 'clover';

  /** Output path */
  outputPath: string;

  /** Include charts */
  includeCharts: boolean;

  /** Include historical comparison */
  includeHistorical: boolean;
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  /** Report path */
  path: string;

  /** Format */
  format: string;

  /** File size (bytes) */
  size: number;

  /** Generation timestamp */
  generatedAt: string;
}

// ==================== New Flaky Detection Types ====================

/**
 * Flaky pattern analysis parameters
 */
export interface FlakyPatternAnalysisParams {
  /** Test run history */
  testRuns: TestRunHistory[];

  /** Minimum runs to consider */
  minRuns: number;

  /** Pattern types to detect */
  patternTypes: FlakyPatternType[];

  /** Confidence threshold (0-1) */
  confidenceThreshold: number;
}

/**
 * Test run history
 */
export interface TestRunHistory {
  /** Run identifier */
  runId: string;

  /** Test results */
  results: TestResult[];

  /** Timestamp */
  timestamp: string;

  /** Environment info */
  environment: Record<string, string>;

  /** Build ID */
  buildId?: string;
}

/**
 * Flaky pattern types
 */
export type FlakyPatternType =
  | 'timing'              // Time-dependent failures
  | 'environment'         // Environment-specific failures
  | 'dependency'          // External dependency failures
  | 'race-condition'      // Concurrency issues
  | 'resource-leak'       // Memory/resource issues
  | 'order-dependent';    // Test execution order dependency

/**
 * Flaky pattern result
 */
export interface FlakyPattern {
  /** Pattern type */
  type: FlakyPatternType;

  /** Test identifier */
  testId: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Pattern description */
  description: string;

  /** Evidence */
  evidence: PatternEvidence[];

  /** Suggested fixes */
  suggestedFixes: string[];
}

/**
 * Pattern evidence
 */
export interface PatternEvidence {
  /** Evidence type */
  type: string;

  /** Description */
  description: string;

  /** Supporting data */
  data: Record<string, unknown>;
}

/**
 * Auto-stabilization parameters
 */
export interface AutoStabilizationParams {
  /** Test file path */
  testFile: string;

  /** Detected flaky pattern */
  flakyPattern: FlakyPattern;

  /** Stabilization strategies to try */
  strategies: StabilizationStrategy[];

  /** Dry run mode */
  dryRun: boolean;
}

/**
 * Stabilization strategies
 */
export type StabilizationStrategy =
  | 'retry'               // Add retry logic
  | 'wait'                // Add explicit waits
  | 'isolation'           // Improve test isolation
  | 'mock'                // Mock external dependencies
  | 'timeout-increase'    // Increase timeout
  | 'order-independence'; // Remove order dependencies

/**
 * Stabilization result
 */
export interface StabilizationResult {
  /** Success flag */
  success: boolean;

  /** Applied strategies */
  appliedStrategies: StabilizationStrategy[];

  /** Modified test file */
  modifiedTestFile?: string;

  /** Changes made */
  changes: CodeChange[];

  /** Verification status */
  verified: boolean;
}

/**
 * Code change information
 */
export interface CodeChange {
  /** File path */
  file: string;

  /** Change type */
  type: 'added' | 'modified' | 'deleted';

  /** Line number */
  line: number;

  /** Old content */
  oldContent?: string;

  /** New content */
  newContent?: string;

  /** Rationale */
  rationale: string;
}

/**
 * Flaky test history tracking parameters
 */
export interface FlakyTestHistoryParams {
  /** Test identifier */
  testIdentifier: string;

  /** Action to perform */
  action: 'log' | 'query' | 'analyze';

  /** Time range (for query/analyze) */
  timeRange?: string;

  /** Event data (for log) */
  event?: FlakyTestEvent;
}

/**
 * Flaky test event
 */
export interface FlakyTestEvent {
  /** Event type */
  type: 'detected' | 'stabilized' | 'regressed';

  /** Timestamp */
  timestamp: string;

  /** Pattern type */
  patternType?: FlakyPatternType;

  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Flaky test history result
 */
export interface FlakyTestHistory {
  /** Test identifier */
  testId: string;

  /** Historical events */
  events: FlakyTestEvent[];

  /** Current status */
  currentStatus: 'stable' | 'flaky' | 'unknown';

  /** Statistics */
  statistics: {
    totalRuns: number;
    failureRate: number;
    lastFlaky: string;
    stabilizationAttempts: number;
  };
}

// ==================== New Performance Domain Types ====================

/**
 * Bottleneck analysis parameters
 */
export interface BottleneckAnalysisParams {
  /** Performance data to analyze */
  performanceData: PerformanceMetrics;

  /** Thresholds for detection */
  thresholds: {
    cpu: number;
    memory: number;
    responseTime: number;
    throughput: number;
  };

  /** Include optimization recommendations */
  includeRecommendations: boolean;

  /** Analysis depth */
  depth: 'basic' | 'detailed' | 'comprehensive';
}

/**
 * Bottleneck analysis result
 */
export interface BottleneckAnalysis {
  /** Identified bottlenecks */
  bottlenecks: Bottleneck[];

  /** Overall performance score (0-100) */
  performanceScore: number;

  /** Recommendations */
  recommendations: PerformanceRecommendation[];

  /** Resource utilization summary */
  resourceSummary: ResourceUsage;
}

/**
 * Bottleneck information
 */
export interface Bottleneck {
  /** Bottleneck type */
  type: 'cpu' | 'memory' | 'io' | 'network' | 'database';

  /** Severity */
  severity: Priority;

  /** Description */
  description: string;

  /** Affected components */
  affectedComponents: string[];

  /** Impact metrics */
  impact: {
    responseTime: number;
    throughput: number;
    errorRate: number;
  };

  /** Root cause */
  rootCause?: string;
}

/**
 * Performance recommendation
 */
export interface PerformanceRecommendation {
  /** Recommendation type */
  type: 'optimization' | 'scaling' | 'architecture';

  /** Priority */
  priority: Priority;

  /** Title */
  title: string;

  /** Description */
  description: string;

  /** Expected impact */
  expectedImpact: {
    responseTime: number;  // % improvement
    throughput: number;    // % improvement
    cost: number;          // % change
  };

  /** Implementation effort */
  effort: 'low' | 'medium' | 'high';

  /** Code examples */
  examples?: string[];
}

/**
 * Performance report generation parameters
 */
export interface PerformanceReportParams {
  /** Benchmark results */
  benchmarkResults: BenchmarkData[];

  /** Report format */
  format: 'html' | 'pdf' | 'json' | 'markdown';

  /** Compare with baseline */
  compareBaseline?: string;

  /** Include charts */
  includeCharts: boolean;

  /** Include recommendations */
  includeRecommendations: boolean;
}

/**
 * Benchmark data
 */
export interface BenchmarkData {
  /** Benchmark name */
  name: string;

  /** Results */
  results: BenchmarkResult[];

  /** Timestamp */
  timestamp: string;

  /** Environment */
  environment: Record<string, string>;
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Operation name */
  operation: string;

  /** Iterations */
  iterations: number;

  /** Mean time (ms) */
  mean: number;

  /** Standard deviation */
  stddev: number;

  /** Percentiles */
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };

  /** Operations per second */
  opsPerSecond: number;
}

/**
 * Performance report result
 */
export interface PerformanceReport {
  /** Report path */
  path: string;

  /** Format */
  format: string;

  /** Summary */
  summary: {
    totalBenchmarks: number;
    improvements: number;
    regressions: number;
    neutral: number;
  };

  /** Generation timestamp */
  generatedAt: string;
}

// ==================== New Security Domain Types ====================

/**
 * Authentication validation parameters
 */
export interface AuthValidationParams {
  /** Authentication endpoints */
  authEndpoints: string[];

  /** Test cases */
  testCases: AuthTestCase[];

  /** Validate tokens */
  validateTokens: boolean;

  /** Validate session management */
  validateSessions: boolean;
}

/**
 * Authentication test case
 */
export interface AuthTestCase {
  /** Test name */
  name: string;

  /** Test type */
  type: 'login' | 'logout' | 'refresh' | 'password-reset' | 'mfa';

  /** Credentials */
  credentials?: {
    username: string;
    password: string;
  };

  /** Expected result */
  expectedResult: 'success' | 'failure';

  /** Expected status code */
  expectedStatusCode: number;
}

/**
 * Authentication validation result
 */
export interface AuthValidationResult {
  /** Overall success */
  success: boolean;

  /** Test results */
  testResults: AuthTestResult[];

  /** Vulnerabilities found */
  vulnerabilities: Vulnerability[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Authentication test result
 */
export interface AuthTestResult {
  /** Test name */
  testName: string;

  /** Success flag */
  success: boolean;

  /** Status code */
  statusCode: number;

  /** Response time (ms) */
  responseTime: number;

  /** Issues found */
  issues?: string[];
}

/**
 * Authorization check parameters
 */
export interface AuthzCheckParams {
  /** Roles to test */
  roles: string[];

  /** Resources to check */
  resources: string[];

  /** Policy file path */
  policies: string;

  /** Policy format */
  policyFormat: 'json' | 'yaml' | 'rego' | 'casbin';
}

/**
 * Authorization check result
 */
export interface AuthzCheckResult {
  /** Overall success */
  success: boolean;

  /** Permission matrix */
  permissionMatrix: PermissionCheck[];

  /** Policy violations */
  violations: PolicyViolation[];

  /** Recommendations */
  recommendations: string[];
}

/**
 * Permission check
 */
export interface PermissionCheck {
  /** Role */
  role: string;

  /** Resource */
  resource: string;

  /** Action */
  action: string;

  /** Allowed */
  allowed: boolean;

  /** Reason */
  reason?: string;
}

/**
 * Policy violation
 */
export interface PolicyViolation {
  /** Severity */
  severity: Priority;

  /** Description */
  description: string;

  /** Affected resources */
  affectedResources: string[];

  /** Remediation */
  remediation: string;
}

/**
 * Dependency vulnerability scan parameters
 */
export interface DependencyVulnScanParams {
  /** Package file path */
  packageFile: string;

  /** Severity levels to report */
  severity: ('low' | 'medium' | 'high' | 'critical')[];

  /** Auto-fix vulnerabilities */
  autoFix: boolean;

  /** Include dev dependencies */
  includeDevDependencies: boolean;
}

/**
 * Vulnerability scan result
 */
export interface VulnerabilityScanResult {
  /** Total vulnerabilities */
  total: number;

  /** Vulnerabilities by severity */
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  /** Detailed vulnerabilities */
  vulnerabilities: DependencyVulnerability[];

  /** Fixed vulnerabilities */
  fixed: number;

  /** Recommendations */
  recommendations: string[];
}

/**
 * Dependency vulnerability
 */
export interface DependencyVulnerability extends Vulnerability {
  /** Package name */
  packageName: string;

  /** Current version */
  currentVersion: string;

  /** Fixed version */
  fixedVersion?: string;

  /** Patched version */
  patchedVersion?: string;

  /** Dependency path */
  dependencyPath: string[];
}

/**
 * Security report generation parameters
 */
export interface SecurityReportParams {
  /** Scan results */
  scanResults: SecurityScanResults[];

  /** Report format */
  format: 'html' | 'sarif' | 'json' | 'pdf';

  /** Include fixes */
  includeFixes: boolean;

  /** Include compliance mapping */
  includeCompliance: boolean;
}

/**
 * Security report result
 */
export interface SecurityReport {
  /** Report path */
  path: string;

  /** Format */
  format: string;

  /** Summary */
  summary: SecurityScanResults;

  /** Compliance status */
  compliance?: ComplianceStatus[];

  /** Generation timestamp */
  generatedAt: string;
}

/**
 * Compliance status
 */
export interface ComplianceStatus {
  /** Standard name */
  standard: string;

  /** Compliant */
  compliant: boolean;

  /** Issues found */
  issues: number;

  /** Details */
  details: string[];
}

// ==================== New Visual Testing Types ====================

/**
 * Screenshot comparison parameters
 */
export interface ScreenshotComparisonParams {
  /** Baseline screenshot path */
  baseline: string;

  /** Current screenshot path */
  current: string;

  /** Difference threshold (0-1) */
  threshold: number;

  /** Use AI-powered comparison */
  useAI: boolean;

  /** Ignore regions */
  ignoreRegions?: Region[];
}

/**
 * Region definition
 */
export interface Region {
  /** X coordinate */
  x: number;

  /** Y coordinate */
  y: number;

  /** Width */
  width: number;

  /** Height */
  height: number;
}

/**
 * Screenshot comparison result
 */
export interface ScreenshotComparison {
  /** Match percentage (0-1) */
  matchPercentage: number;

  /** Passed threshold */
  passed: boolean;

  /** Difference image path */
  diffImagePath?: string;

  /** Differences found */
  differences: VisualDifference[];

  /** AI insights (if useAI=true) */
  aiInsights?: string[];
}

/**
 * Visual difference
 */
export interface VisualDifference {
  /** Region of difference */
  region: Region;

  /** Difference type */
  type: 'color' | 'layout' | 'content' | 'size';

  /** Severity */
  severity: Priority;

  /** Description */
  description: string;
}

/**
 * WCAG accessibility validation parameters
 */
export interface AccessibilityValidationParams {
  /** URL or HTML file to validate */
  url: string;

  /** WCAG level */
  level: 'A' | 'AA' | 'AAA';

  /** Include screenshots */
  includeScreenshots: boolean;

  /** Viewport size */
  viewport?: ViewportConfig;

  /** Wait for selector */
  waitForSelector?: string;
}

/**
 * Accessibility report result
 */
export interface AccessibilityReport {
  /** Overall compliance */
  compliant: boolean;

  /** WCAG level */
  level: 'A' | 'AA' | 'AAA';

  /** Total issues */
  totalIssues: number;

  /** Issues by severity */
  bySeverity: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };

  /** Detailed issues */
  issues: AccessibilityIssue[];

  /** Score (0-100) */
  score: number;

  /** Screenshots */
  screenshots?: string[];
}

/**
 * Accessibility issue
 */
export interface AccessibilityIssue {
  /** WCAG criterion */
  criterion: string;

  /** Severity */
  severity: 'critical' | 'serious' | 'moderate' | 'minor';

  /** Description */
  description: string;

  /** Affected elements */
  affectedElements: string[];

  /** Remediation */
  remediation: string;

  /** Help URL */
  helpUrl?: string;
}

// ==================== Dependency Graph (for Critical Path Analysis) ====================

/**
 * Dependency graph
 */
export interface DependencyGraph {
  /** Nodes (files) */
  nodes: DependencyNode[];

  /** Edges (dependencies) */
  edges: DependencyEdge[];
}

/**
 * Dependency node
 */
export interface DependencyNode {
  /** Node ID */
  id: string;

  /** File path */
  path: string;

  /** Type */
  type: 'source' | 'test' | 'config';

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Dependency edge
 */
export interface DependencyEdge {
  /** Source node ID */
  from: string;

  /** Target node ID */
  to: string;

  /** Dependency type */
  type: 'import' | 'require' | 'dynamic';
}
```

### 2.3 New Shared Validators (`shared/validators.ts`)

```typescript
/**
 * Parameter Validation Utilities
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { QEError } from './errors.js';
import * as types from './types.js';

/**
 * Validate coverage threshold (0-100)
 */
export function validateCoverageThreshold(threshold: number): void {
  if (threshold < 0 || threshold > 100) {
    throw new QEError(
      'INVALID_THRESHOLD',
      `Coverage threshold must be between 0 and 100, got: ${threshold}`
    );
  }
}

/**
 * Validate confidence score (0-1)
 */
export function validateConfidenceScore(score: number): void {
  if (score < 0 || score > 1) {
    throw new QEError(
      'INVALID_CONFIDENCE',
      `Confidence score must be between 0 and 1, got: ${score}`
    );
  }
}

/**
 * Validate file path exists
 */
export function validateFilePath(path: string): void {
  if (!path || path.trim().length === 0) {
    throw new QEError('INVALID_PATH', 'File path cannot be empty');
  }
}

/**
 * Validate array not empty
 */
export function validateNotEmpty<T>(arr: T[], fieldName: string): void {
  if (!arr || arr.length === 0) {
    throw new QEError('EMPTY_ARRAY', `${fieldName} cannot be empty`);
  }
}

/**
 * Validate severity level
 */
export function validateSeverity(severity: types.Priority): void {
  const validSeverities: types.Priority[] = ['low', 'medium', 'high', 'critical'];
  if (!validSeverities.includes(severity)) {
    throw new QEError(
      'INVALID_SEVERITY',
      `Severity must be one of: ${validSeverities.join(', ')}`
    );
  }
}

/**
 * Validate URL format
 */
export function validateUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    throw new QEError('INVALID_URL', `Invalid URL format: ${url}`);
  }
}

/**
 * Validate time range format (e.g., '7d', '30d', '90d')
 */
export function validateTimeRange(range: string): void {
  const validRanges = ['7d', '30d', '90d'];
  if (!validRanges.includes(range)) {
    throw new QEError(
      'INVALID_TIME_RANGE',
      `Time range must be one of: ${validRanges.join(', ')}`
    );
  }
}

/**
 * Validate test framework
 */
export function validateTestFramework(framework: types.TestFramework): void {
  const validFrameworks: types.TestFramework[] = [
    'jest', 'mocha', 'jasmine', 'pytest', 'junit', 'nunit', 'xunit', 'cucumber-js'
  ];
  if (!validFrameworks.includes(framework)) {
    throw new QEError(
      'INVALID_FRAMEWORK',
      `Test framework must be one of: ${validFrameworks.join(', ')}`
    );
  }
}
```

### 2.4 New Shared Errors (`shared/errors.ts`)

```typescript
/**
 * Custom Error Classes for QE Tools
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

/**
 * Base QE error class
 */
export class QEError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'QEError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): object {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * Validation error
 */
export class ValidationError extends QEError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/**
 * Tool execution error
 */
export class ToolExecutionError extends QEError {
  constructor(
    public readonly toolName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super('TOOL_EXECUTION_ERROR', message, details);
    this.name = 'ToolExecutionError';
  }
}

/**
 * File not found error
 */
export class FileNotFoundError extends QEError {
  constructor(filePath: string) {
    super('FILE_NOT_FOUND', `File not found: ${filePath}`, { filePath });
    this.name = 'FileNotFoundError';
  }
}

/**
 * Configuration error
 */
export class ConfigurationError extends QEError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFIGURATION_ERROR', message, details);
    this.name = 'ConfigurationError';
  }
}
```

---

## 3. Tool Specifications

### 3.1 Coverage Domain (6 Tools)

#### 3.1.1 `analyze-with-risk-scoring.ts` (EXISTING - MOVED)
**Source**: `handlers/analysis/coverage-analyze-sublinear-handler.ts`

```typescript
import { SublinearCoverageParams, QEToolResponse, CoverageReport } from '../shared/types.js';
import { validateCoverageThreshold, validateNotEmpty } from '../shared/validators.js';

export async function analyzeCoverageWithRiskScoring(
  params: SublinearCoverageParams
): Promise<QEToolResponse<CoverageReport>> {
  // Validation
  validateNotEmpty(params.sourceFiles, 'sourceFiles');
  validateCoverageThreshold(params.coverageThreshold * 100);

  // Implementation (existing logic from handler)
  // ...
}
```

#### 3.1.2 `detect-gaps-ml.ts` (EXISTING - MOVED)
**Source**: `handlers/analysis/coverage-gaps-detect-handler.ts`

```typescript
import { CoverageGapDetectionParams, QEToolResponse, CoverageGap } from '../shared/types.js';

export async function detectCoverageGapsML(
  params: CoverageGapDetectionParams
): Promise<QEToolResponse<CoverageGap[]>> {
  // Implementation (existing logic from handler)
  // ...
}
```

#### 3.1.3 `recommend-tests.ts` (NEW)
```typescript
import { TestRecommendationParams, QEToolResponse, TestRecommendation } from '../shared/types.js';
import { validateNotEmpty } from '../shared/validators.js';

/**
 * Recommend tests to close coverage gaps
 *
 * Analyzes coverage gaps and generates intelligent test recommendations
 * based on risk scoring, complexity, and change frequency.
 */
export async function recommendTestsForGaps(
  params: TestRecommendationParams
): Promise<QEToolResponse<TestRecommendation[]>> {
  const startTime = Date.now();

  try {
    // Validation
    validateNotEmpty(params.gaps, 'gaps');
    validateNotEmpty(params.sourceFiles, 'sourceFiles');

    // Sort gaps by priority
    const sortedGaps = sortGapsByPriority(params.gaps, params.prioritizeBy);

    // Generate recommendations
    const recommendations: TestRecommendation[] = [];
    const limit = Math.min(params.maxRecommendations, sortedGaps.length);

    for (let i = 0; i < limit; i++) {
      const gap = sortedGaps[i];
      const recommendation = await generateRecommendation(
        gap,
        params.sourceFiles,
        params.includeExamples
      );
      recommendations.push(recommendation);
    }

    return {
      success: true,
      data: recommendations,
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime,
        agent: 'qe-coverage-analyzer'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'RECOMMENDATION_FAILED',
        message: error.message,
        stack: error.stack
      },
      metadata: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        executionTime: Date.now() - startTime
      }
    };
  }
}

function sortGapsByPriority(gaps: CoverageGap[], prioritizeBy: string): CoverageGap[] {
  return gaps.sort((a, b) => {
    switch (prioritizeBy) {
      case 'risk':
        return b.riskScore - a.riskScore;
      case 'complexity':
        return b.complexity - a.complexity;
      case 'changeFrequency':
        return b.changeFrequency - a.changeFrequency;
      default:
        return 0;
    }
  });
}

async function generateRecommendation(
  gap: CoverageGap,
  sourceFiles: string[],
  includeExamples: boolean
): Promise<TestRecommendation> {
  // Implementation: Analyze gap and generate recommendation
  // Use ML model or heuristics to suggest test type, priority, and test cases

  return {
    file: gap.file,
    testType: determineTestType(gap),
    priority: determinePriority(gap),
    rationale: generateRationale(gap),
    testCases: generateTestCases(gap),
    codeExample: includeExamples ? generateCodeExample(gap) : undefined
  };
}

// Helper functions...
function determineTestType(gap: CoverageGap): TestType { /* ... */ }
function determinePriority(gap: CoverageGap): Priority { /* ... */ }
function generateRationale(gap: CoverageGap): string { /* ... */ }
function generateTestCases(gap: CoverageGap): string[] { /* ... */ }
function generateCodeExample(gap: CoverageGap): string { /* ... */ }
```

#### 3.1.4 `analyze-critical-paths.ts` (NEW)
```typescript
import { CriticalPathAnalysisParams, QEToolResponse, CriticalPathAnalysis } from '../shared/types.js';

/**
 * Analyze critical paths through the codebase
 *
 * Identifies high-risk execution paths that require thorough testing.
 */
export async function analyzeCriticalPaths(
  params: CriticalPathAnalysisParams
): Promise<QEToolResponse<CriticalPathAnalysis>> {
  // Implementation: Trace paths from entry points through dependency graph
  // Calculate risk scores based on coverage, complexity, and criticality
}
```

#### 3.1.5 `calculate-trends.ts` (NEW)
```typescript
import { CoverageTrendParams, QEToolResponse, CoverageTrends } from '../shared/types.js';

/**
 * Calculate coverage trends over time
 *
 * Analyzes historical coverage data to identify trends and predict future coverage.
 */
export async function calculateCoverageTrends(
  params: CoverageTrendParams
): Promise<QEToolResponse<CoverageTrends>> {
  // Implementation: Load historical data, calculate trends, generate predictions
}
```

#### 3.1.6 `export-report.ts` (NEW)
```typescript
import { CoverageReportExportParams, QEToolResponse, ReportMetadata } from '../shared/types.js';

/**
 * Export coverage report in various formats
 *
 * Generates coverage reports in HTML, JSON, LCOV, Cobertura, or Clover format.
 */
export async function exportCoverageReport(
  params: CoverageReportExportParams
): Promise<QEToolResponse<ReportMetadata>> {
  // Implementation: Generate report in specified format with charts and historical data
}
```

### 3.2 Flaky Detection Domain (4 Tools)

#### 3.2.1 `detect-statistical.ts` (EXISTING - MOVED)
**Source**: `handlers/prediction/flaky-test-detect.ts`

#### 3.2.2 `analyze-patterns.ts` (NEW)
```typescript
import { FlakyPatternAnalysisParams, QEToolResponse, FlakyPattern } from '../shared/types.js';

/**
 * Analyze flaky test patterns
 *
 * Uses statistical analysis and ML to identify patterns in flaky test behavior.
 */
export async function analyzeFlakyTestPatterns(
  params: FlakyPatternAnalysisParams
): Promise<QEToolResponse<FlakyPattern[]>> {
  // Implementation: Analyze test runs, detect patterns (timing, env, dependency, race conditions)
}
```

#### 3.2.3 `stabilize-auto.ts` (NEW)
```typescript
import { AutoStabilizationParams, QEToolResponse, StabilizationResult } from '../shared/types.js';

/**
 * Auto-stabilize flaky tests
 *
 * Automatically applies stabilization strategies to fix flaky tests.
 */
export async function stabilizeFlakyTestAuto(
  params: AutoStabilizationParams
): Promise<QEToolResponse<StabilizationResult>> {
  // Implementation: Apply strategies (retry, wait, isolation, mock) to fix flaky tests
}
```

#### 3.2.4 `track-history.ts` (NEW)
```typescript
import { FlakyTestHistoryParams, QEToolResponse, FlakyTestHistory } from '../shared/types.js';

/**
 * Track flaky test history
 *
 * Log, query, and analyze historical flakiness data.
 */
export async function trackFlakyTestHistory(
  params: FlakyTestHistoryParams
): Promise<QEToolResponse<FlakyTestHistory>> {
  // Implementation: Store/retrieve flaky test events, calculate statistics
}
```

### 3.3 Performance Domain (4 Tools)

#### 3.3.1 `run-benchmark.ts` (EXISTING - MOVED)
**Source**: `handlers/analysis/performance-benchmark-run-handler.ts`

#### 3.3.2 `monitor-realtime.ts` (EXISTING - MOVED)
**Source**: `handlers/analysis/performance-monitor-realtime-handler.ts`

#### 3.3.3 `analyze-bottlenecks.ts` (NEW)
```typescript
import { BottleneckAnalysisParams, QEToolResponse, BottleneckAnalysis } from '../shared/types.js';

/**
 * Analyze performance bottlenecks
 *
 * Identifies CPU, memory, I/O, and network bottlenecks with recommendations.
 */
export async function analyzePerformanceBottlenecks(
  params: BottleneckAnalysisParams
): Promise<QEToolResponse<BottleneckAnalysis>> {
  // Implementation: Analyze performance data, identify bottlenecks, generate recommendations
}
```

#### 3.3.4 `generate-report.ts` (NEW)
```typescript
import { PerformanceReportParams, QEToolResponse, PerformanceReport } from '../shared/types.js';

/**
 * Generate performance report
 *
 * Creates comprehensive performance reports with charts and baseline comparison.
 */
export async function generatePerformanceReport(
  params: PerformanceReportParams
): Promise<QEToolResponse<PerformanceReport>> {
  // Implementation: Generate report with charts, baseline comparison, recommendations
}
```

### 3.4 Security Domain (5 Tools)

#### 3.4.1 `scan-comprehensive.ts` (EXISTING - MOVED)
**Source**: `handlers/analysis/security-scan-comprehensive-handler.ts`

#### 3.4.2 `validate-auth.ts` (NEW)
```typescript
import { AuthValidationParams, QEToolResponse, AuthValidationResult } from '../shared/types.js';

/**
 * Validate authentication flows
 *
 * Tests authentication endpoints, token validation, and session management.
 */
export async function validateAuthenticationFlow(
  params: AuthValidationParams
): Promise<QEToolResponse<AuthValidationResult>> {
  // Implementation: Test login/logout/refresh/MFA, validate tokens and sessions
}
```

#### 3.4.3 `check-authz.ts` (NEW)
```typescript
import { AuthzCheckParams, QEToolResponse, AuthzCheckResult } from '../shared/types.js';

/**
 * Check authorization rules
 *
 * Validates role-based access control and permission policies.
 */
export async function checkAuthorizationRules(
  params: AuthzCheckParams
): Promise<QEToolResponse<AuthzCheckResult>> {
  // Implementation: Parse policies, test role-resource-action combinations
}
```

#### 3.4.4 `scan-dependencies.ts` (NEW)
```typescript
import { DependencyVulnScanParams, QEToolResponse, VulnerabilityScanResult } from '../shared/types.js';

/**
 * Scan dependencies for vulnerabilities
 *
 * Checks packages against vulnerability databases with auto-fix option.
 */
export async function scanDependenciesVulnerabilities(
  params: DependencyVulnScanParams
): Promise<QEToolResponse<VulnerabilityScanResult>> {
  // Implementation: Parse package file, check vulnerabilities, optionally auto-fix
}
```

#### 3.4.5 `generate-report.ts` (NEW)
```typescript
import { SecurityReportParams, QEToolResponse, SecurityReport } from '../shared/types.js';

/**
 * Generate security report
 *
 * Creates comprehensive security reports in HTML, SARIF, JSON, or PDF format.
 */
export async function generateSecurityReport(
  params: SecurityReportParams
): Promise<QEToolResponse<SecurityReport>> {
  // Implementation: Aggregate scan results, generate report with fixes and compliance mapping
}
```

### 3.5 Visual Testing Domain (3 Tools)

#### 3.5.1 `detect-regression.ts` (EXISTING - MOVED)
**Source**: `handlers/chaos/visual-test-regression.ts`

#### 3.5.2 `compare-screenshots.ts` (NEW)
```typescript
import { ScreenshotComparisonParams, QEToolResponse, ScreenshotComparison } from '../shared/types.js';

/**
 * Compare screenshots with AI
 *
 * Compares screenshots with AI-powered analysis for visual differences.
 */
export async function compareScreenshotsAI(
  params: ScreenshotComparisonParams
): Promise<QEToolResponse<ScreenshotComparison>> {
  // Implementation: Load images, compare with/without AI, generate diff image
}
```

#### 3.5.3 `validate-accessibility.ts` (NEW)
```typescript
import { AccessibilityValidationParams, QEToolResponse, AccessibilityReport } from '../shared/types.js';

/**
 * Validate WCAG accessibility
 *
 * Checks web pages against WCAG 2.2 guidelines (A, AA, AAA).
 */
export async function validateAccessibilityWCAG(
  params: AccessibilityValidationParams
): Promise<QEToolResponse<AccessibilityReport>> {
  // Implementation: Load page, run axe-core or similar, generate report
}
```

### 3.6 Test Generation Domain (4 Tools - All Existing)

All tools moved from `handlers/test/`:
- `generate-unit-tests.ts`
- `generate-integration-tests.ts`
- `test-generate-enhanced.ts`
- `optimize-test-suite.ts`

### 3.7 Quality Gates Domain (5 Tools - All Existing, Renamed)

All tools moved and renamed from `handlers/quality/`:
- `validate-readiness.ts` ← `quality-gate-execute.ts`
- `assess-risk.ts` ← `quality-risk-assess.ts`
- `check-policies.ts` ← `quality-policy-check.ts`
- `validate-metrics.ts` ← `quality-validate-metrics.ts`
- `make-decision.ts` ← `quality-decision-make.ts`

---

## 4. Implementation Order

### Priority Matrix

| Domain | New Tools | Priority | Days | Dependencies |
|--------|-----------|----------|------|--------------|
| **Coverage** | 4 | 🔥 CRITICAL | 1.0 | None |
| **Flaky Detection** | 3 | 🔥 HIGH | 1.0 | Memory/AgentDB |
| **Performance** | 2 | 🟡 MEDIUM | 0.5 | None |
| **Security** | 4 | 🟡 MEDIUM | 1.0 | None |
| **Visual** | 2 | 🟢 LOW | 0.5 | None |
| **Test-Gen** | 0 | 🟢 LOW | 0.5 | Reorganize only |
| **Quality-Gates** | 0 | 🟢 LOW | 0.5 | Reorganize only |
| **Shared Utils** | N/A | 🔥 CRITICAL | 0.5 | None (first) |
| **Backward Compat** | N/A | 🟡 MEDIUM | 0.5 | All domains |
| **Docs & Testing** | N/A | 🟡 MEDIUM | 1.0 | All domains |

### Sequential Implementation Plan

**Week 3 (Days 1-5)**:
1. **Day 1 AM**: Create shared validators and errors (`shared/validators.ts`, `shared/errors.ts`)
2. **Day 1 PM**: Coverage domain (4 new tools)
3. **Day 2**: Flaky detection domain (3 new tools)
4. **Day 3 AM**: Performance domain (2 new tools)
5. **Day 3 PM**: Security domain (4 new tools)
6. **Day 4 AM**: Visual testing domain (2 new tools)
7. **Day 4 PM**: Reorganize test-generation tools
8. **Day 5**: Reorganize quality-gates tools

**Week 4 (Days 1-3)**:
1. **Day 1**: Backward compatibility wrappers
2. **Day 2**: Migration guide and documentation
3. **Day 3**: Testing and validation

### Parallel vs Sequential

**Can Be Parallel**:
- Coverage, Performance, Security, Visual (no dependencies)
- All new types addition to `shared/types.ts`

**Must Be Sequential**:
1. Shared validators/errors FIRST
2. Flaky detection AFTER memory/AgentDB integration
3. Backward compatibility AFTER all domains
4. Documentation LAST

---

## 5. Integration Points

### 5.1 MCP Tool Registration

**Location**: `src/mcp/tools.ts`

```typescript
// Add new tools to agenticQETools array

// Coverage Domain
{
  name: 'mcp__agentic_qe__coverage__analyze_with_risk_scoring',
  description: 'Analyze code coverage with sublinear algorithms and risk scoring',
  inputSchema: { /* ... */ }
},
{
  name: 'mcp__agentic_qe__coverage__detect_gaps_ml',
  description: 'Detect coverage gaps using ML-powered gap detection',
  inputSchema: { /* ... */ }
},
{
  name: 'mcp__agentic_qe__coverage__recommend_tests',
  description: 'Recommend tests to close coverage gaps based on risk and complexity',
  inputSchema: { /* ... */ }
},
// ... (continue for all 32 tools)
```

### 5.2 Agent Code Execution Examples

**Location**: `.claude/agents/qe-coverage-analyzer.md`

```typescript
// BEFORE (Generic)
import { executeTool } from './servers/mcp/tools.js';
const result = await executeTool('test_coverage_detailed', params);

// AFTER (Domain-Specific)
import { analyzeCoverageWithRiskScoring } from './servers/qe-tools/coverage/index.js';
const result = await analyzeCoverageWithRiskScoring(params);
```

**Update Required For**:
- `qe-coverage-analyzer.md`
- `qe-flaky-test-hunter.md`
- `qe-performance-tester.md`
- `qe-security-scanner.md`
- `qe-visual-tester.md`
- `qe-test-generator.md` (test-generation domain)
- `qe-quality-gate.md` (quality-gates domain)

### 5.3 Memory/AgentDB Integration

**Flaky Detection Tools** use AgentDB for historical tracking:

```typescript
// In track-history.ts
import { AgentDB } from '@/lib/agentdb/index.js';

export async function trackFlakyTestHistory(params: FlakyTestHistoryParams) {
  const db = new AgentDB({ path: '.agentic-qe/db/flaky-tests.db' });

  if (params.action === 'log') {
    await db.store(`flaky/${params.testIdentifier}`, params.event);
  } else if (params.action === 'query') {
    const events = await db.retrieve(`flaky/${params.testIdentifier}`);
    return calculateStatistics(events);
  }
}
```

---

## 6. Backward Compatibility

### 6.1 Deprecation Wrapper Pattern

**Location**: `src/mcp/tools/deprecated.ts`

```typescript
/**
 * Deprecated MCP Tools - Backward Compatibility Layer
 *
 * These tools will be removed in v3.0.0 (February 2026)
 *
 * @version 1.0.0
 * @deprecated Use domain-specific tools instead
 */

import * as coverage from './qe/coverage/index.js';
import * as flaky from './qe/flaky-detection/index.js';
import * as performance from './qe/performance/index.js';
import * as security from './qe/security/index.js';
import * as visual from './qe/visual/index.js';

/**
 * @deprecated Use analyzeCoverageWithRiskScoring() from coverage domain
 * Will be removed in v3.0.0 (scheduled for February 2026)
 */
export async function test_coverage_detailed(params: any) {
  console.warn(
    '⚠️  test_coverage_detailed() is deprecated.\n' +
    '   Use analyzeCoverageWithRiskScoring() from coverage domain.\n' +
    '   Migration: docs/migration/phase3-tools.md'
  );
  return coverage.analyzeCoverageWithRiskScoring(params);
}

/**
 * @deprecated Use detectCoverageGapsML() from coverage domain
 * Will be removed in v3.0.0 (scheduled for February 2026)
 */
export async function coverage_gaps_detect(params: any) {
  console.warn(
    '⚠️  coverage_gaps_detect() is deprecated.\n' +
    '   Use detectCoverageGapsML() from coverage domain.\n' +
    '   Migration: docs/migration/phase3-tools.md'
  );
  return coverage.detectCoverageGapsML(params);
}

// ... (continue for all deprecated tools)
```

### 6.2 Deprecation Timeline

| Version | Date | Action |
|---------|------|--------|
| **v1.5.0** | November 2025 | Release domain-specific tools with deprecation warnings |
| **v2.0.0** | December 2025 | Deprecation warnings become errors in dev mode |
| **v2.5.0** | January 2026 | Deprecated tools throw errors with migration guide |
| **v3.0.0** | February 2026 | **REMOVAL** - Deprecated tools deleted from codebase |

### 6.3 Migration Guide Structure

**Location**: `docs/migration/phase3-tools.md`

```markdown
# Phase 3 Tool Migration Guide

## Quick Migration Table

| Old Tool | New Tool | Domain |
|----------|----------|--------|
| `test_coverage_detailed` | `analyzeCoverageWithRiskScoring` | coverage |
| `coverage_gaps_detect` | `detectCoverageGapsML` | coverage |
| ... | ... | ... |

## Before/After Examples

### Coverage Analysis

**Before**:
\`\`\`typescript
import { executeTool } from './servers/mcp/tools.js';
const result = await executeTool('test_coverage_detailed', {
  sourceFiles: ['src/**/*.ts'],
  threshold: 0.8
});
\`\`\`

**After**:
\`\`\`typescript
import { analyzeCoverageWithRiskScoring } from './servers/qe-tools/coverage/index.js';
const result = await analyzeCoverageWithRiskScoring({
  sourceFiles: ['src/**/*.ts'],
  coverageThreshold: 0.8,
  algorithm: 'hybrid',
  includeUncoveredLines: true,
  analysisDepth: 'comprehensive'
});
\`\`\`

## Troubleshooting
...
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**For Each New Tool** (15 tools):

```typescript
// Example: tests/unit/tools/qe/coverage/recommend-tests.test.ts

import { describe, it, expect } from '@jest/globals';
import { recommendTestsForGaps } from '@/mcp/tools/qe/coverage/recommend-tests.js';

describe('recommendTestsForGaps', () => {
  it('should recommend tests for coverage gaps', async () => {
    const params = {
      gaps: [
        {
          file: 'src/app.ts',
          type: 'line',
          location: { start: 10, end: 15 },
          riskScore: 0.8,
          complexity: 5,
          changeFrequency: 10
        }
      ],
      sourceFiles: ['src/**/*.ts'],
      maxRecommendations: 5,
      prioritizeBy: 'risk',
      includeExamples: true
    };

    const result = await recommendTestsForGaps(params);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].file).toBe('src/app.ts');
    expect(result.data[0].priority).toBe('high');
  });

  it('should validate empty gaps array', async () => {
    const params = {
      gaps: [],
      sourceFiles: ['src/**/*.ts'],
      maxRecommendations: 5,
      prioritizeBy: 'risk',
      includeExamples: false
    };

    const result = await recommendTestsForGaps(params);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EMPTY_ARRAY');
  });
});
```

**Unit Test Checklist** (per tool):
- ✅ Happy path test
- ✅ Validation error tests (empty arrays, invalid thresholds, etc.)
- ✅ Edge case tests
- ✅ Type safety tests (TypeScript compilation)

### 7.2 Integration Tests

**For Each Domain** (6 domains):

```typescript
// Example: tests/integration/tools/qe/coverage/coverage-domain.test.ts

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as coverage from '@/mcp/tools/qe/coverage/index.js';

describe('Coverage Domain Integration', () => {
  let coverageData: CoverageReport;

  beforeAll(async () => {
    // Setup: Generate real coverage data
    coverageData = await generateTestCoverage();
  });

  it('should complete full coverage workflow', async () => {
    // Step 1: Analyze coverage
    const analysis = await coverage.analyzeCoverageWithRiskScoring({
      sourceFiles: ['src/**/*.ts'],
      coverageThreshold: 0.8,
      algorithm: 'hybrid',
      includeUncoveredLines: true,
      analysisDepth: 'comprehensive'
    });

    expect(analysis.success).toBe(true);

    // Step 2: Detect gaps
    const gaps = await coverage.detectCoverageGapsML({
      coverageData: analysis.data,
      prioritization: 'risk',
      minGapSize: 5,
      includeRecommendations: true
    });

    expect(gaps.success).toBe(true);

    // Step 3: Recommend tests
    const recommendations = await coverage.recommendTestsForGaps({
      gaps: gaps.data,
      sourceFiles: ['src/**/*.ts'],
      maxRecommendations: 10,
      prioritizeBy: 'risk',
      includeExamples: true
    });

    expect(recommendations.success).toBe(true);
    expect(recommendations.data.length).toBeGreaterThan(0);
  });
});
```

### 7.3 Backward Compatibility Tests

```typescript
// tests/integration/tools/deprecated/backward-compatibility.test.ts

import { describe, it, expect } from '@jest/globals';
import * as deprecated from '@/mcp/tools/deprecated.js';
import * as coverage from '@/mcp/tools/qe/coverage/index.js';

describe('Backward Compatibility', () => {
  it('should maintain backward compatibility for test_coverage_detailed', async () => {
    const params = {
      sourceFiles: ['src/**/*.ts'],
      threshold: 0.8
    };

    // Call deprecated wrapper
    const deprecatedResult = await deprecated.test_coverage_detailed(params);

    // Call new tool
    const newResult = await coverage.analyzeCoverageWithRiskScoring({
      ...params,
      coverageThreshold: params.threshold,
      algorithm: 'hybrid',
      includeUncoveredLines: true,
      analysisDepth: 'comprehensive'
    });

    // Results should be equivalent
    expect(deprecatedResult.success).toBe(newResult.success);
    expect(deprecatedResult.data).toEqual(newResult.data);
  });
});
```

### 7.4 Test Execution Plan

**Batched Execution** (to avoid memory issues):

```bash
# Step 1: Unit tests for each domain (sequential)
npm run test:unit -- tests/unit/tools/qe/coverage
npm run test:unit -- tests/unit/tools/qe/flaky-detection
npm run test:unit -- tests/unit/tools/qe/performance
npm run test:unit -- tests/unit/tools/qe/security
npm run test:unit -- tests/unit/tools/qe/visual
npm run test:unit -- tests/unit/tools/qe/test-generation
npm run test:unit -- tests/unit/tools/qe/quality-gates

# Step 2: Integration tests (batched by domain)
npm run test:integration -- tests/integration/tools/qe/coverage
npm run test:integration -- tests/integration/tools/qe/flaky-detection
# ...

# Step 3: Backward compatibility tests
npm run test:integration -- tests/integration/tools/deprecated

# Step 4: TypeScript build verification
npm run build
npm run typecheck
```

---

## 8. Deliverables Checklist

### 8.1 Code Deliverables

- [ ] **Shared Utilities**:
  - [ ] `src/mcp/tools/qe/shared/validators.ts` (NEW)
  - [ ] `src/mcp/tools/qe/shared/errors.ts` (NEW)
  - [ ] `src/mcp/tools/qe/shared/types.ts` (UPDATE - add 15 new types)

- [ ] **Coverage Domain** (6 tools):
  - [ ] `analyze-with-risk-scoring.ts` (MOVED)
  - [ ] `detect-gaps-ml.ts` (MOVED)
  - [ ] `recommend-tests.ts` (NEW)
  - [ ] `analyze-critical-paths.ts` (NEW)
  - [ ] `calculate-trends.ts` (NEW)
  - [ ] `export-report.ts` (NEW)
  - [ ] `index.ts` (barrel export)

- [ ] **Flaky Detection Domain** (4 tools):
  - [ ] `detect-statistical.ts` (MOVED)
  - [ ] `analyze-patterns.ts` (NEW)
  - [ ] `stabilize-auto.ts` (NEW)
  - [ ] `track-history.ts` (NEW)
  - [ ] `index.ts` (barrel export)

- [ ] **Performance Domain** (4 tools):
  - [ ] `run-benchmark.ts` (MOVED)
  - [ ] `monitor-realtime.ts` (MOVED)
  - [ ] `analyze-bottlenecks.ts` (NEW)
  - [ ] `generate-report.ts` (NEW)
  - [ ] `index.ts` (barrel export)

- [ ] **Security Domain** (5 tools):
  - [ ] `scan-comprehensive.ts` (MOVED)
  - [ ] `validate-auth.ts` (NEW)
  - [ ] `check-authz.ts` (NEW)
  - [ ] `scan-dependencies.ts` (NEW)
  - [ ] `generate-report.ts` (NEW)
  - [ ] `index.ts` (barrel export)

- [ ] **Visual Testing Domain** (3 tools):
  - [ ] `detect-regression.ts` (MOVED)
  - [ ] `compare-screenshots.ts` (NEW)
  - [ ] `validate-accessibility.ts` (NEW)
  - [ ] `index.ts` (barrel export)

- [ ] **Test Generation Domain** (4 tools - reorganized):
  - [ ] `generate-unit-tests.ts` (MOVED)
  - [ ] `generate-integration-tests.ts` (MOVED)
  - [ ] `test-generate-enhanced.ts` (MOVED)
  - [ ] `optimize-test-suite.ts` (MOVED)
  - [ ] `index.ts` (barrel export)

- [ ] **Quality Gates Domain** (5 tools - renamed):
  - [ ] `validate-readiness.ts` (RENAMED)
  - [ ] `assess-risk.ts` (RENAMED)
  - [ ] `check-policies.ts` (RENAMED)
  - [ ] `validate-metrics.ts` (RENAMED)
  - [ ] `make-decision.ts` (RENAMED)
  - [ ] `index.ts` (barrel export)

- [ ] **Backward Compatibility**:
  - [ ] `src/mcp/tools/deprecated.ts` (NEW - 15+ wrappers)

- [ ] **MCP Registration**:
  - [ ] Update `src/mcp/tools.ts` with 32 tool definitions

### 8.2 Documentation Deliverables

- [ ] **Migration Guide**:
  - [ ] `docs/migration/phase3-tools.md` (NEW)
  - [ ] Before/after examples for all 15 deprecated tools
  - [ ] Troubleshooting section
  - [ ] Deprecation timeline

- [ ] **Tool Catalog**:
  - [ ] `docs/tools/catalog.md` (NEW)
  - [ ] All 32 tools documented with examples
  - [ ] Domain organization diagram

- [ ] **README Updates**:
  - [ ] Update README.md with domain-specific tools section
  - [ ] Add tool discovery commands

- [ ] **CLAUDE.md Updates**:
  - [ ] Update agent code execution examples (7 agents)
  - [ ] Add domain-specific tool usage patterns

- [ ] **CHANGELOG.md**:
  - [ ] Add Phase 3 release notes
  - [ ] Deprecation notices
  - [ ] Migration instructions

### 8.3 Testing Deliverables

- [ ] **Unit Tests** (15 new tools × 4 tests/tool = 60 tests):
  - [ ] Coverage domain tests
  - [ ] Flaky detection domain tests
  - [ ] Performance domain tests
  - [ ] Security domain tests
  - [ ] Visual testing domain tests

- [ ] **Integration Tests** (6 domains × 2 tests/domain = 12 tests):
  - [ ] Coverage domain workflow
  - [ ] Flaky detection domain workflow
  - [ ] Performance domain workflow
  - [ ] Security domain workflow
  - [ ] Visual testing domain workflow
  - [ ] Test generation domain workflow
  - [ ] Quality gates domain workflow

- [ ] **Backward Compatibility Tests** (15 deprecated tools = 15 tests):
  - [ ] All deprecated wrapper tests

- [ ] **Build Verification**:
  - [ ] TypeScript compilation succeeds
  - [ ] No type errors
  - [ ] Linting passes

---

## 9. Success Criteria

### Must Have ✅

- [x] Architecture designed for all 32 tools
- [ ] All 15 new tools implemented
- [ ] All 17 existing tools reorganized
- [ ] 100% backward compatibility maintained
- [ ] All unit tests pass (75 tests)
- [ ] All integration tests pass (19 tests)
- [ ] TypeScript build succeeds
- [ ] Migration guide created

### Should Have ✅

- [ ] Zero `any` types in new code
- [ ] JSDoc documentation for all tools
- [ ] Agent code execution examples updated (7 agents)
- [ ] Tool catalog generated
- [ ] Deprecation warnings logged in console

### Nice to Have ✨

- [ ] Interactive tool selector CLI (`aqe tools select`)
- [ ] Auto-generated tool documentation from JSDoc
- [ ] Usage analytics integration
- [ ] Performance benchmarks before/after

---

## 10. Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Breaking changes in production** | CRITICAL | LOW | 100% backward compatibility with deprecated wrappers |
| **Migration confusion** | HIGH | MEDIUM | Comprehensive migration guide with examples |
| **Test failures during integration** | HIGH | MEDIUM | Incremental testing after each domain |
| **Performance regression** | MEDIUM | LOW | Benchmark before/after, optimize if needed |
| **Type safety issues** | MEDIUM | LOW | Strict TypeScript mode, comprehensive type tests |
| **Memory leaks in new tools** | HIGH | LOW | Memory profiling, proper cleanup in all tools |
| **MCP registration conflicts** | MEDIUM | LOW | Unique tool names with domain prefixes |

---

## Appendix A: File Move Checklist

### Coverage Domain

- [ ] `handlers/analysis/coverage-analyze-sublinear-handler.ts` → `tools/qe/coverage/analyze-with-risk-scoring.ts`
- [ ] `handlers/analysis/coverage-gaps-detect-handler.ts` → `tools/qe/coverage/detect-gaps-ml.ts`

### Flaky Detection Domain

- [ ] `handlers/prediction/flaky-test-detect.ts` → `tools/qe/flaky-detection/detect-statistical.ts`

### Performance Domain

- [ ] `handlers/analysis/performance-benchmark-run-handler.ts` → `tools/qe/performance/run-benchmark.ts`
- [ ] `handlers/analysis/performance-monitor-realtime-handler.ts` → `tools/qe/performance/monitor-realtime.ts`

### Security Domain

- [ ] `handlers/analysis/security-scan-comprehensive-handler.ts` → `tools/qe/security/scan-comprehensive.ts`

### Visual Testing Domain

- [ ] `handlers/chaos/visual-test-regression.ts` → `tools/qe/visual/detect-regression.ts`

### Test Generation Domain

- [ ] `handlers/test/generate-unit-tests.ts` → `tools/qe/test-generation/generate-unit-tests.ts`
- [ ] `handlers/test/generate-integration-tests.ts` → `tools/qe/test-generation/generate-integration-tests.ts`
- [ ] `handlers/test/test-generate-enhanced.ts` → `tools/qe/test-generation/test-generate-enhanced.ts`
- [ ] `handlers/test/optimize-test-suite.ts` → `tools/qe/test-generation/optimize-test-suite.ts`

### Quality Gates Domain

- [ ] `handlers/quality/quality-gate-execute.ts` → `tools/qe/quality-gates/validate-readiness.ts`
- [ ] `handlers/quality/quality-risk-assess.ts` → `tools/qe/quality-gates/assess-risk.ts`
- [ ] `handlers/quality/quality-policy-check.ts` → `tools/qe/quality-gates/check-policies.ts`
- [ ] `handlers/quality/quality-validate-metrics.ts` → `tools/qe/quality-gates/validate-metrics.ts`
- [ ] `handlers/quality/quality-decision-make.ts` → `tools/qe/quality-gates/make-decision.ts`

---

## Appendix B: MCP Tool Naming Convention

**Pattern**: `mcp__agentic_qe__<domain>__<action>`

**Examples**:
- `mcp__agentic_qe__coverage__analyze_with_risk_scoring`
- `mcp__agentic_qe__coverage__detect_gaps_ml`
- `mcp__agentic_qe__coverage__recommend_tests`
- `mcp__agentic_qe__flaky_detection__analyze_patterns`
- `mcp__agentic_qe__performance__analyze_bottlenecks`
- `mcp__agentic_qe__security__validate_auth`
- `mcp__agentic_qe__visual__compare_screenshots`

---

**End of Architecture Document**

**Next Actions**:
1. Review and approve architecture
2. Begin implementation with Priority 1.1 (Coverage Domain)
3. Store architecture in memory: `aqe/phase3/architecture`
