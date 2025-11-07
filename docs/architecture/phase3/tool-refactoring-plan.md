# Phase 3: Domain-Specific QE Tools Architecture

**Version**: 1.0.0
**Date**: 2025-11-07
**Status**: Design Phase
**Author**: System Architecture Designer

---

## Executive Summary

This document outlines the comprehensive refactoring plan for the Agentic QE Fleet's MCP tools, transitioning from 54 generic tools to domain-specific, type-safe tools organized by QE domains. The refactoring improves developer experience, reduces errors, and enhances maintainability while maintaining backward compatibility.

### Key Objectives

1. **Domain Organization**: Group 54 tools into 8 domain-specific directories
2. **Type Safety**: Replace `any` types with strict TypeScript interfaces
3. **Backward Compatibility**: 3-month deprecation timeline with warnings
4. **Developer Experience**: Clear tool names like `generate_unit_test_suite_for_class()`
5. **Maintainability**: Shared types, validation, and utilities

### Impact Metrics

- **Before**: 54 tools with generic interfaces (`params: any`)
- **After**: 54 tools with domain-specific types (e.g., `UnitTestGenerationParams`)
- **Code Reduction**: ~30% via shared utilities and types
- **Type Safety**: 100% TypeScript coverage with strict mode
- **Backward Compatibility**: 100% for 3 months via deprecation layer

---

## Current Tool Inventory

### Tool Distribution by Domain

| Domain | Tool Count | Current Files | Examples |
|--------|-----------|---------------|----------|
| **Test Generation** | 8 | `test-generate.ts`, `test/test-generate-enhanced.ts` | `test_generate`, `test_generate_enhanced` |
| **Coverage Analysis** | 6 | `analysis/coverage-*.ts` | `coverage_analyze_sublinear`, `coverage_gaps_detect` |
| **Quality Gates** | 5 | `quality/quality-*.ts` | `quality_gate_execute`, `quality_validate_metrics` |
| **Flaky Detection** | 4 | `prediction/flaky-test-detect.ts` | `flaky_test_detect`, `regression_risk_analyze` |
| **Performance** | 4 | `analysis/performance-*.ts` | `performance_benchmark_run`, `performance_monitor_realtime` |
| **Security** | 5 | `analysis/security-*.ts`, `advanced/*` | `security_scan_comprehensive`, `api_breaking_changes` |
| **Coordination** | 12 | `coordination/*`, `memory/*` | `workflow_create`, `memory_store`, `blackboard_post` |
| **Advanced** | 10 | `advanced/*`, `prediction/*` | `requirements_validate`, `production_incident_replay`, `mutation_test_execute` |
| **Total** | **54** | **~70 files** | - |

### Current Tool Issues

1. **Generic Parameters**: `params: any`, `args: any`, `spec: any`
2. **Scattered Logic**: Test generation split across 3 files
3. **Missing Types**: No shared type library
4. **Inconsistent Naming**: Mix of `test_generate` vs `test-generate`
5. **No Deprecation**: Direct breaking changes required

---

## Proposed Architecture

### Directory Structure

```
src/mcp/tools/qe/
├── shared/
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── validation.ts         # Common validation schemas
│   ├── errors.ts             # Domain-specific errors
│   └── utils.ts              # Utility functions
├── test-generation/
│   ├── unit-test-suite.ts    # generate_unit_test_suite_for_class()
│   ├── integration-test-suite.ts
│   ├── e2e-test-suite.ts
│   ├── property-based-tests.ts
│   ├── mutation-tests.ts
│   ├── test-data-synthesis.ts
│   ├── test-pattern-detection.ts
│   └── index.ts              # Domain exports
├── coverage/
│   ├── sublinear-analysis.ts
│   ├── gap-detection.ts
│   ├── detailed-coverage.ts
│   ├── stream-coverage.ts
│   ├── branch-coverage.ts
│   └── index.ts
├── quality-gates/
│   ├── gate-execution.ts
│   ├── metrics-validation.ts
│   ├── risk-assessment.ts
│   ├── policy-check.ts
│   └── index.ts
├── flaky-detection/
│   ├── flaky-test-detect.ts
│   ├── regression-risk.ts
│   ├── visual-regression.ts
│   └── index.ts
├── performance/
│   ├── benchmark-run.ts
│   ├── realtime-monitor.ts
│   ├── load-testing.ts
│   └── index.ts
├── security/
│   ├── comprehensive-scan.ts
│   ├── breaking-changes.ts
│   ├── dependency-check.ts
│   ├── vulnerability-scan.ts
│   └── index.ts
├── coordination/
│   ├── workflow/
│   ├── memory/
│   ├── blackboard/
│   ├── consensus/
│   └── index.ts
└── advanced/
    ├── requirements/
    ├── production-intelligence/
    ├── incident-replay/
    └── index.ts
```

### Type System Design

#### Shared Types (`src/mcp/tools/qe/shared/types.ts`)

```typescript
/**
 * Shared QE Types for Domain-Specific Tools
 * All types use strict TypeScript with no 'any' types
 */

// ==================== Core Types ====================

export type TestType = 'unit' | 'integration' | 'e2e' | 'property-based' | 'mutation';
export type TestFramework = 'jest' | 'mocha' | 'jasmine' | 'pytest' | 'junit' | 'nunit';
export type ProgrammingLanguage = 'javascript' | 'typescript' | 'python' | 'java' | 'csharp' | 'go';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type Environment = 'development' | 'staging' | 'production';

// ==================== Test Generation Domain ====================

export interface UnitTestGenerationParams {
  sourceCode: SourceCodeInfo;
  targetClass?: string;
  targetFunction?: string;
  framework: TestFramework;
  coverageTarget: number; // 0-100
  includeEdgeCases: boolean;
  generateMocks: boolean;
  testPatterns: TestPattern[];
}

export interface IntegrationTestGenerationParams {
  sourceCode: SourceCodeInfo;
  dependencyMap: DependencyInfo[];
  framework: TestFramework;
  mockStrategy: 'full' | 'partial' | 'none';
  contractTesting: boolean;
}

export interface E2ETestGenerationParams {
  userFlows: UserFlow[];
  pageObjects: PageObjectModel[];
  framework: TestFramework;
  browserTargets: string[];
}

export interface PropertyBasedTestParams {
  sourceCode: SourceCodeInfo;
  properties: PropertyInvariant[];
  generatorStrategy: 'quickcheck' | 'hypothesis' | 'fast-check';
  iterations: number;
}

export interface MutationTestParams {
  sourceCode: string;
  testCode: string;
  operators: MutationOperator[];
  timeout: number;
  parallelMutants: number;
}

export interface SourceCodeInfo {
  repositoryUrl: string;
  branch: string;
  language: ProgrammingLanguage;
  files: string[];
  excludePatterns?: string[];
}

export interface DependencyInfo {
  name: string;
  type: 'internal' | 'external';
  version?: string;
  interfaces: InterfaceDefinition[];
}

export interface UserFlow {
  name: string;
  steps: FlowStep[];
  expectedOutcome: string;
}

export interface PropertyInvariant {
  name: string;
  description: string;
  property: string; // Property expression
}

export type MutationOperator =
  | 'arithmetic'
  | 'logical'
  | 'relational'
  | 'assignment'
  | 'conditional';

export type TestPattern =
  | 'arrange-act-assert'
  | 'given-when-then'
  | 'builder'
  | 'object-mother';

// ==================== Coverage Domain ====================

export interface SublinearCoverageParams {
  sourceFiles: string[];
  coverageThreshold: number; // 0-1
  algorithm: 'johnson-lindenstrauss' | 'temporal-advantage' | 'hybrid';
  targetDimension?: number;
  includeUncoveredLines: boolean;
}

export interface CoverageGapDetectionParams {
  coverageData: CoverageReport;
  prioritization: 'complexity' | 'criticality' | 'change-frequency';
  minGapSize: number;
  includeRecommendations: boolean;
}

export interface DetailedCoverageParams {
  coverageData: CoverageReport;
  analysisType: 'line' | 'branch' | 'function' | 'comprehensive';
  detailLevel: 'basic' | 'detailed' | 'comprehensive';
  comparePrevious: boolean;
  historicalData?: CoverageReport[];
}

export interface CoverageReport {
  files: FileCoverage[];
  summary: CoverageSummary;
  timestamp: string;
}

export interface FileCoverage {
  path: string;
  lines: LineCoverage;
  branches: BranchCoverage;
  functions: FunctionCoverage;
  importance: Priority;
}

export interface LineCoverage {
  total: number;
  covered: number;
  uncovered: number[];
  percentage: number;
}

export interface BranchCoverage {
  total: number;
  covered: number;
  uncovered: number[];
  percentage: number;
}

export interface FunctionCoverage {
  total: number;
  covered: number;
  uncovered: string[];
  percentage: number;
}

export interface CoverageSummary {
  totalLines: number;
  coveredLines: number;
  totalBranches: number;
  coveredBranches: number;
  totalFunctions: number;
  coveredFunctions: number;
  overallPercentage: number;
}

// ==================== Quality Gates Domain ====================

export interface QualityGateExecutionParams {
  projectId: string;
  buildId: string;
  environment: Environment;
  policy: QualityPolicy;
  metrics: QualityMetrics;
}

export interface QualityPolicy {
  id: string;
  name: string;
  rules: QualityRule[];
  enforcement: 'blocking' | 'warning' | 'informational';
}

export interface QualityRule {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: Priority;
}

export interface QualityMetrics {
  coverage: CoverageSummary;
  testResults: TestResultsSummary;
  security: SecurityScanResults;
  performance: PerformanceMetrics;
  codeQuality: CodeQualityMetrics;
}

export interface TestResultsSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failureRate: number;
}

export interface SecurityScanResults {
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface Vulnerability {
  id: string;
  severity: Priority;
  title: string;
  description: string;
  cwe?: string;
  cvss?: number;
}

export interface PerformanceMetrics {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: number;
  errorRate: number;
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  cpu: number; // percentage
  memory: number; // MB
  disk: number; // MB
}

export interface CodeQualityMetrics {
  maintainabilityIndex: number;
  cyclomaticComplexity: number;
  technicalDebt: number; // hours
  codeSmells: number;
  duplications: number;
}

// ==================== Flaky Detection Domain ====================

export interface FlakyTestDetectionParams {
  testResults: TestResult[];
  minRuns: number;
  timeWindow: number; // days
  confidenceThreshold: number; // 0-1
  analysisConfig: FlakyAnalysisConfig;
}

export interface TestResult {
  testId: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  timestamp: string;
  error?: string;
  environment?: Record<string, string>;
}

export interface FlakyAnalysisConfig {
  algorithm: 'statistical' | 'ml' | 'hybrid';
  features: string[];
  autoStabilize: boolean;
}

export interface RegressionRiskParams {
  changes: CodeChange[];
  baselineMetrics: QualityMetrics;
  threshold: number; // 0-1
  historicalData?: QualityMetrics[];
}

export interface CodeChange {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  linesChanged: number;
  complexity: number;
  testCoverage: number;
}

// ==================== Performance Domain ====================

export interface PerformanceBenchmarkParams {
  benchmarkSuite: string;
  iterations: number;
  warmupIterations: number;
  parallel: boolean;
  reportFormat: 'json' | 'html' | 'markdown';
}

export interface RealtimeMonitorParams {
  target: string;
  duration: number; // seconds
  interval: number; // seconds
  metrics: MonitoringMetric[];
}

export type MonitoringMetric =
  | 'cpu'
  | 'memory'
  | 'network'
  | 'disk'
  | 'response-time'
  | 'throughput';

// ==================== Security Domain ====================

export interface SecurityScanParams {
  scanType: 'sast' | 'dast' | 'dependency' | 'comprehensive';
  target: string;
  depth: 'basic' | 'standard' | 'deep';
  includeFingerprinting: boolean;
  excludePatterns?: string[];
}

export interface BreakingChangeParams {
  oldAPI: string;
  newAPI: string;
  language: ProgrammingLanguage;
  calculateSemver: boolean;
  generateMigrationGuide: boolean;
}

// ==================== Common Response Types ====================

export interface QEToolResponse<T> {
  success: boolean;
  data?: T;
  error?: QEError;
  metadata: ResponseMetadata;
}

export interface QEError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: string;
  executionTime: number; // milliseconds
  agent?: string;
}

// ==================== Helper Types ====================

export interface FlowStep {
  action: string;
  target: string;
  input?: Record<string, unknown>;
  expected?: string;
}

export interface PageObjectModel {
  name: string;
  selectors: Record<string, string>;
  methods: string[];
}

export interface InterfaceDefinition {
  name: string;
  methods: MethodSignature[];
}

export interface MethodSignature {
  name: string;
  parameters: Parameter[];
  returnType: string;
}

export interface Parameter {
  name: string;
  type: string;
  optional: boolean;
}
```

---

## Tool Migration Mapping

### Phase 3.1: Test Generation Domain (8 tools)

| Old Tool Name | New Tool Name | Status | Breaking Changes |
|--------------|---------------|--------|------------------|
| `mcp__agentic_qe__test_generate` | `mcp__agentic_qe__generate_unit_test_suite` | ⚠️ Deprecated | `spec: any` → `params: UnitTestGenerationParams` |
| `mcp__agentic_qe__test_generate_enhanced` | `mcp__agentic_qe__generate_enhanced_test_suite` | ⚠️ Deprecated | Type-safe params |
| `mcp__agentic_qe__test_execute` | `mcp__agentic_qe__execute_test_suite` | ⚠️ Deprecated | `spec: TestExecutionSpec` → strict types |
| `mcp__agentic_qe__test_execute_parallel` | `mcp__agentic_qe__execute_tests_parallel` | ⚠️ Deprecated | Array types |
| `mcp__agentic_qe__test_optimize_sublinear` | `mcp__agentic_qe__optimize_test_suite` | ⚠️ Deprecated | Algorithm enums |
| `mcp__agentic_qe__test_report_comprehensive` | `mcp__agentic_qe__generate_test_report` | ⚠️ Deprecated | Format enums |
| `mcp__agentic_qe__test_coverage_detailed` | Moved to Coverage domain | ⚠️ Deprecated | - |
| `mcp__agentic_qe__test_execute_stream` | `mcp__agentic_qe__execute_tests_stream` | ⚠️ Deprecated | Streaming types |

#### Migration Example: Test Generation

**Before (Generic)**:
```typescript
// Old tool call
mcp__agentic_qe__test_generate({
  spec: {
    type: 'unit', // string, no validation
    sourceCode: {
      repositoryUrl: 'https://...',
      language: 'typescript' // typo possible
    },
    coverageTarget: 150 // invalid, no validation!
  }
});
```

**After (Domain-Specific)**:
```typescript
// New tool call
mcp__agentic_qe__generate_unit_test_suite({
  sourceCode: {
    repositoryUrl: 'https://...',
    branch: 'main',
    language: 'typescript', // ProgrammingLanguage enum
    files: ['src/**/*.ts']
  },
  framework: 'jest', // TestFramework enum
  coverageTarget: 80, // 0-100, validated
  includeEdgeCases: true,
  generateMocks: true,
  testPatterns: ['arrange-act-assert']
} satisfies UnitTestGenerationParams);
```

### Phase 3.2: Coverage Domain (6 tools)

| Old Tool Name | New Tool Name | Status |
|--------------|---------------|--------|
| `mcp__agentic_qe__coverage_analyze_sublinear` | `mcp__agentic_qe__analyze_coverage_sublinear` | ⚠️ Deprecated |
| `mcp__agentic_qe__coverage_gaps_detect` | `mcp__agentic_qe__detect_coverage_gaps` | ⚠️ Deprecated |
| `mcp__agentic_qe__coverage_analyze_stream` | `mcp__agentic_qe__analyze_coverage_stream` | ⚠️ Deprecated |
| `mcp__agentic_qe__test_coverage_detailed` | `mcp__agentic_qe__analyze_detailed_coverage` | ⚠️ Deprecated |

### Phase 3.3: Quality Gates Domain (5 tools)

| Old Tool Name | New Tool Name | Status |
|--------------|---------------|--------|
| `mcp__agentic_qe__quality_gate_execute` | `mcp__agentic_qe__execute_quality_gate` | ⚠️ Deprecated |
| `mcp__agentic_qe__quality_validate_metrics` | `mcp__agentic_qe__validate_quality_metrics` | ⚠️ Deprecated |
| `mcp__agentic_qe__quality_risk_assess` | `mcp__agentic_qe__assess_quality_risk` | ⚠️ Deprecated |
| `mcp__agentic_qe__quality_decision_make` | `mcp__agentic_qe__make_quality_decision` | ⚠️ Deprecated |
| `mcp__agentic_qe__quality_policy_check` | `mcp__agentic_qe__check_quality_policy` | ⚠️ Deprecated |

### Phase 3.4-3.8: Remaining Domains

Similar migration patterns for:
- **Flaky Detection** (4 tools)
- **Performance** (4 tools)
- **Security** (5 tools)
- **Coordination** (12 tools)
- **Advanced** (10 tools)

---

## Backward Compatibility Strategy

### Deprecation Layer

```typescript
/**
 * Deprecation Wrapper for Backward Compatibility
 * Provides 3-month grace period with warnings
 */

import { DeprecationWarning } from './shared/errors.js';

export function createDeprecatedTool<TOld, TNew>(
  oldName: string,
  newName: string,
  newHandler: (params: TNew) => Promise<any>,
  mapper: (oldParams: TOld) => TNew,
  deprecationDate: string,
  removalDate: string
) {
  return async function deprecatedHandler(oldParams: TOld) {
    // Emit deprecation warning
    console.warn(DeprecationWarning.format({
      oldTool: oldName,
      newTool: newName,
      deprecationDate,
      removalDate,
      migrationGuide: `https://docs.agentic-qe.dev/migration/${newName}`
    }));

    // Transform old params to new params
    const newParams = mapper(oldParams);

    // Call new handler
    return newHandler(newParams);
  };
}

// Example usage
export const test_generate = createDeprecatedTool(
  'mcp__agentic_qe__test_generate',
  'mcp__agentic_qe__generate_unit_test_suite',
  generate_unit_test_suite,
  (oldParams) => ({
    sourceCode: oldParams.spec.sourceCode,
    framework: oldParams.spec.frameworks[0] || 'jest',
    coverageTarget: oldParams.spec.coverageTarget,
    includeEdgeCases: true,
    generateMocks: true,
    testPatterns: ['arrange-act-assert']
  }),
  '2025-11-07',
  '2026-02-07' // 3 months
);
```

### Deprecation Timeline

| Phase | Duration | Actions |
|-------|----------|---------|
| **Phase 3.0** | Week 1 | Release new tools alongside old tools |
| **Phase 3.1** | Weeks 2-4 | Add deprecation warnings to old tools |
| **Phase 3.2** | Weeks 5-8 | Update documentation, migrate internal usage |
| **Phase 3.3** | Weeks 9-12 | Increase warning severity, offer migration assistance |
| **Phase 3.4** | Week 13 | Remove old tools, retain deprecation layer for errors |

---

## Implementation Phases

### Phase 3.1: Foundation (Week 1)

**Deliverables**:
- ✅ `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/types.ts` (complete type library)
- ✅ `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/validation.ts` (Zod schemas)
- ✅ `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/errors.ts` (error classes)
- ✅ `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/utils.ts` (utilities)

**Tasks**:
1. Create shared types library (2,000+ lines of TypeScript)
2. Define Zod validation schemas for runtime checks
3. Create domain-specific error classes
4. Build utility functions for common operations

### Phase 3.2: Test Generation Domain (Week 2)

**Deliverables**:
- ✅ 8 new domain-specific test generation tools
- ✅ Deprecation wrappers for 8 old tools
- ✅ Unit tests with 90% coverage

**Tools**:
1. `generate_unit_test_suite()` - Unit test generation with strict types
2. `generate_integration_test_suite()` - Integration test generation
3. `generate_e2e_test_suite()` - E2E test generation
4. `generate_property_based_tests()` - Property-based testing
5. `generate_mutation_tests()` - Mutation testing
6. `synthesize_test_data()` - Test data generation
7. `detect_test_patterns()` - Pattern detection
8. `execute_tests_stream()` - Streaming execution

### Phase 3.3: Coverage Domain (Week 3)

**Deliverables**:
- ✅ 6 new coverage analysis tools
- ✅ Sublinear algorithm integration
- ✅ Gap detection with prioritization

### Phase 3.4: Quality Gates Domain (Week 4)

**Deliverables**:
- ✅ 5 new quality gate tools
- ✅ Policy enforcement engine
- ✅ Risk assessment algorithms

### Phase 3.5: Remaining Domains (Weeks 5-8)

**Deliverables**:
- ✅ Flaky Detection (4 tools)
- ✅ Performance (4 tools)
- ✅ Security (5 tools)
- ✅ Coordination (12 tools)
- ✅ Advanced (10 tools)

### Phase 3.6: Testing & Documentation (Weeks 9-10)

**Deliverables**:
- ✅ Integration tests for all 54 tools
- ✅ Migration guides
- ✅ API documentation
- ✅ Examples and tutorials

### Phase 3.7: Rollout (Weeks 11-12)

**Deliverables**:
- ✅ Internal migration (agents, commands)
- ✅ Deprecation warnings active
- ✅ Monitoring dashboard

### Phase 3.8: Cleanup (Week 13)

**Deliverables**:
- ✅ Remove old tool implementations
- ✅ Archive deprecated code
- ✅ Final documentation updates

---

## Validation & Testing Strategy

### Unit Testing

```typescript
describe('UnitTestGenerationTool', () => {
  it('should validate params with strict types', () => {
    const params: UnitTestGenerationParams = {
      sourceCode: {
        repositoryUrl: 'https://github.com/example/repo',
        branch: 'main',
        language: 'typescript',
        files: ['src/**/*.ts']
      },
      framework: 'jest',
      coverageTarget: 80,
      includeEdgeCases: true,
      generateMocks: true,
      testPatterns: ['arrange-act-assert']
    };

    expect(() => validateUnitTestParams(params)).not.toThrow();
  });

  it('should reject invalid coverage target', () => {
    const params = {
      // ... valid params
      coverageTarget: 150 // Invalid!
    };

    expect(() => validateUnitTestParams(params as any)).toThrow(
      'Coverage target must be between 0 and 100'
    );
  });
});
```

### Integration Testing

```typescript
describe('Tool Migration', () => {
  it('should call new tool via deprecated wrapper', async () => {
    const oldParams = {
      spec: {
        type: 'unit',
        sourceCode: {
          repositoryUrl: 'https://...',
          language: 'typescript'
        },
        coverageTarget: 80
      }
    };

    const result = await mcp__agentic_qe__test_generate(oldParams);

    expect(result.success).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('DEPRECATED')
    );
  });
});
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking changes | High | High | 3-month deprecation, backward compatibility layer |
| Type errors | Medium | Medium | Strict TypeScript, Zod validation, comprehensive tests |
| Performance regression | Low | Medium | Benchmark tests, profiling |
| Documentation lag | Medium | Low | Automated API docs, migration guides |
| Adoption resistance | Medium | Low | Clear benefits, gradual rollout, support |

---

## Success Metrics

### Developer Experience

- **Type Safety**: 100% TypeScript coverage (strict mode)
- **Error Rate**: <1% invalid tool calls (vs 15% current)
- **IDE Support**: Full autocomplete and inline docs
- **Migration Time**: <2 hours per agent (vs 8 hours for breaking changes)

### Code Quality

- **Code Reduction**: 30% via shared utilities
- **Test Coverage**: 90% for all new tools
- **Maintainability**: 80+ maintainability index
- **Performance**: <5% overhead for type validation

### Adoption

- **Internal Migration**: 100% within 3 months
- **External Users**: 80% within 6 months
- **Support Tickets**: <10 migration-related tickets/month

---

## Next Steps

1. **Approve Architecture**: Review and approve this plan
2. **Phase 3.1**: Build shared types library (Week 1)
3. **Phase 3.2**: Implement test generation domain (Week 2)
4. **Phase 3.3-3.5**: Remaining domains (Weeks 3-8)
5. **Phase 3.6-3.8**: Testing, rollout, cleanup (Weeks 9-13)

---

## Appendix A: Tool-by-Tool Migration Matrix

See attached spreadsheet: `tool-migration-matrix.xlsx`

## Appendix B: Type Definitions

See: `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/types.ts`

## Appendix C: Validation Schemas

See: `/workspaces/agentic-qe-cf/src/mcp/tools/qe/shared/validation.ts`

---

**Document Status**: Ready for Review
**Next Review Date**: 2025-11-14
**Approval Required**: Yes
**Estimated Effort**: 13 weeks (1 architect + 2 developers)
