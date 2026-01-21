# Phase 3: Domain-Specific Tool Refactoring - Prioritized Checklist

**Status**: Ready for Next Release
**Estimated Effort**: 2 weeks (Weeks 3-4)
**Priority**: High (improves developer experience and tool discoverability)

---

## Overview

Refactor 54 generic MCP tools into 32 domain-specific tools organized by QE domains. This improves discoverability, type safety, and intent clarity.

---

## Prioritized Implementation Order

### Priority 1: High-Impact Domains (Week 3, Days 1-3)

These domains have the most user-facing impact and immediate value.

#### 1.1 Coverage Domain (4 new tools) 🔥 HIGHEST PRIORITY
**Why First**: Most requested feature, directly impacts test quality

- [ ] **1.1.1** Create `src/mcp/tools/qe/coverage/` directory
- [ ] **1.1.2** Move existing tools:
  - [ ] `coverage-analyze-sublinear-handler.ts` → `analyze-with-risk-scoring.ts`
  - [ ] `coverage-gaps-detect-handler.ts` → `detect-gaps-ml.ts`
- [ ] **1.1.3** Create new tool: `recommend-tests.ts`
  ```typescript
  export async function recommendTestsForGaps(params: {
    gaps: CoverageGap[];
    sourceFiles: string[];
    maxRecommendations: number;
    prioritizeBy: 'risk' | 'complexity' | 'changeFrequency';
  }): Promise<TestRecommendation[]>
  ```
- [ ] **1.1.4** Create new tool: `analyze-critical-paths.ts`
  ```typescript
  export async function analyzeCriticalPaths(params: {
    entryPoints: string[];
    coverage: CoverageData;
    sourceRoot: string;
  }): Promise<CriticalPathAnalysis>
  ```
- [ ] **1.1.5** Create new tool: `calculate-trends.ts`
  ```typescript
  export async function calculateCoverageTrends(params: {
    historicalData: string; // Path to historical coverage
    timeRange: string; // '7d', '30d', '90d'
    metrics: ('statements' | 'branches' | 'functions' | 'lines')[];
  }): Promise<CoverageTrends>
  ```
- [ ] **1.1.6** Create new tool: `export-report.ts`
  ```typescript
  export async function exportCoverageReport(params: {
    coverage: CoverageData;
    format: 'html' | 'json' | 'lcov' | 'cobertura';
    outputPath: string;
    includeCharts: boolean;
  }): Promise<ReportMetadata>
  ```
- [ ] **1.1.7** Create `index.ts` exporting all coverage tools
- [ ] **1.1.8** Register tools in MCP registry
- [ ] **1.1.9** Test all coverage tools
- [ ] **1.1.10** Update agent code execution examples

**Estimated Time**: 1 day

---

#### 1.2 Flaky Detection Domain (3 new tools) 🔥 HIGH PRIORITY
**Why Second**: Critical for test reliability, common pain point

- [ ] **1.2.1** Create `src/mcp/tools/qe/flaky-detection/` directory
- [ ] **1.2.2** Move existing tool:
  - [ ] `flaky-test-detect.ts` → `detect-statistical.ts`
- [ ] **1.2.3** Create new tool: `analyze-patterns.ts`
  ```typescript
  export async function analyzeFlakyTestPatterns(params: {
    testRuns: TestRunHistory[];
    minRuns: number;
    patternTypes: ('timing' | 'environment' | 'dependency' | 'race-condition')[];
  }): Promise<FlakyPattern[]>
  ```
- [ ] **1.2.4** Create new tool: `stabilize-auto.ts`
  ```typescript
  export async function stabilizeFlakyTestAuto(params: {
    testFile: string;
    flakyPattern: FlakyPattern;
    strategies: ('retry' | 'wait' | 'isolation' | 'mock')[];
  }): Promise<StabilizationResult>
  ```
- [ ] **1.2.5** Create new tool: `track-history.ts`
  ```typescript
  export async function trackFlakyTestHistory(params: {
    testIdentifier: string;
    action: 'log' | 'query' | 'analyze';
    timeRange?: string;
  }): Promise<FlakyTestHistory>
  ```
- [ ] **1.2.6** Create `index.ts` exporting all flaky detection tools
- [ ] **1.2.7** Register tools in MCP registry
- [ ] **1.2.8** Test all flaky detection tools
- [ ] **1.2.9** Update qe-flaky-test-hunter agent examples

**Estimated Time**: 1 day

---

### Priority 2: Medium-Impact Domains (Week 3, Days 4-5)

#### 2.1 Performance Domain (2 new tools)
**Why Third**: Performance testing is frequently used

- [ ] **2.1.1** Create `src/mcp/tools/qe/performance/` directory
- [ ] **2.1.2** Move existing tools:
  - [ ] `performance-benchmark-run-handler.ts` → `run-benchmark.ts`
  - [ ] `performance-monitor-realtime-handler.ts` → `monitor-realtime.ts`
- [ ] **2.1.3** Create new tool: `analyze-bottlenecks.ts`
  ```typescript
  export async function analyzePerformanceBottlenecks(params: {
    performanceData: PerformanceMetrics;
    thresholds: { cpu: number; memory: number; responseTime: number };
    includeRecommendations: boolean;
  }): Promise<BottleneckAnalysis>
  ```
- [ ] **2.1.4** Create new tool: `generate-report.ts`
  ```typescript
  export async function generatePerformanceReport(params: {
    benchmarkResults: BenchmarkData[];
    format: 'html' | 'pdf' | 'json';
    compareBaseline?: string;
  }): Promise<PerformanceReport>
  ```
- [ ] **2.1.5** Create `index.ts` exporting all performance tools
- [ ] **2.1.6** Register tools in MCP registry
- [ ] **2.1.7** Test all performance tools
- [ ] **2.1.8** Update qe-performance-tester agent examples

**Estimated Time**: 0.5 days

---

#### 2.2 Security Domain (4 new tools)
**Why Fourth**: Security is important but less frequently changed

- [ ] **2.2.1** Create `src/mcp/tools/qe/security/` directory
- [ ] **2.2.2** Move existing tool:
  - [ ] `security-scan-comprehensive-handler.ts` → `scan-comprehensive.ts`
- [ ] **2.2.3** Create new tool: `validate-auth.ts`
  ```typescript
  export async function validateAuthenticationFlow(params: {
    authEndpoints: string[];
    testCases: AuthTestCase[];
    validateTokens: boolean;
  }): Promise<AuthValidationResult>
  ```
- [ ] **2.2.4** Create new tool: `check-authz.ts`
  ```typescript
  export async function checkAuthorizationRules(params: {
    roles: string[];
    resources: string[];
    policies: string; // Path to policy file
  }): Promise<AuthzCheckResult>
  ```
- [ ] **2.2.5** Create new tool: `scan-dependencies.ts`
  ```typescript
  export async function scanDependenciesVulnerabilities(params: {
    packageFile: string; // package.json, requirements.txt, etc.
    severity: ('low' | 'medium' | 'high' | 'critical')[];
    autoFix: boolean;
  }): Promise<VulnerabilityScanResult>
  ```
- [ ] **2.2.6** Create new tool: `generate-report.ts`
  ```typescript
  export async function generateSecurityReport(params: {
    scanResults: SecurityScanData[];
    format: 'html' | 'sarif' | 'json';
    includeFixes: boolean;
  }): Promise<SecurityReport>
  ```
- [ ] **2.2.7** Create `index.ts` exporting all security tools
- [ ] **2.2.8** Register tools in MCP registry
- [ ] **2.2.9** Test all security tools
- [ ] **2.2.10** Update qe-security-scanner agent examples

**Estimated Time**: 1 day

---

### Priority 3: Lower-Impact Domains (Week 4, Days 1-2)

#### 3.1 Visual Testing Domain (2 new tools)
**Why Fifth**: Specialized use case, smaller user base

- [ ] **3.1.1** Create `src/mcp/tools/qe/visual/` directory
- [ ] **3.1.2** Move existing tool:
  - [ ] `visual-test-regression.ts` → `detect-regression.ts`
- [ ] **3.1.3** Create new tool: `compare-screenshots.ts`
  ```typescript
  export async function compareScreenshotsAI(params: {
    baseline: string;
    current: string;
    threshold: number;
    useAI: boolean; // AI-powered comparison
  }): Promise<ScreenshotComparison>
  ```
- [ ] **3.1.4** Create new tool: `validate-accessibility.ts`
  ```typescript
  export async function validateAccessibilityWCAG(params: {
    url: string;
    level: 'A' | 'AA' | 'AAA';
    includeScreenshots: boolean;
  }): Promise<AccessibilityReport>
  ```
- [ ] **3.1.5** Create `index.ts` exporting all visual tools
- [ ] **3.1.6** Register tools in MCP registry
- [ ] **3.1.7** Test all visual tools
- [ ] **3.1.8** Update qe-visual-tester agent examples

**Estimated Time**: 0.5 days

---

### Priority 4: Organization & Cleanup (Week 4, Days 3-4)

#### 4.1 Organize Existing Test-Generation Tools
- [ ] **4.1.1** Create `src/mcp/tools/qe/test-generation/` directory
- [ ] **4.1.2** Move existing handlers:
  - [ ] `generate-unit-tests.ts`
  - [ ] `generate-integration-tests.ts`
  - [ ] `test-generate-enhanced.ts`
  - [ ] `optimize-test-suite.ts`
- [ ] **4.1.3** Create `index.ts` with clean exports
- [ ] **4.1.4** Update imports across codebase

**Estimated Time**: 0.5 days

---

#### 4.2 Organize Existing Quality-Gates Tools
- [ ] **4.2.1** Create `src/mcp/tools/qe/quality-gates/` directory
- [ ] **4.2.2** Move existing handlers:
  - [ ] `quality-gate-execute.ts` → `validate-readiness.ts`
  - [ ] `quality-risk-assess.ts` → `assess-risk.ts`
  - [ ] `quality-policy-check.ts` → `check-policies.ts`
  - [ ] `quality-validate-metrics.ts` → `validate-metrics.ts`
  - [ ] `quality-decision-make.ts` → `make-decision.ts`
- [ ] **4.2.3** Create `index.ts` with clean exports
- [ ] **4.2.4** Register all quality gate tools in MCP registry
- [ ] **4.2.5** Update qe-quality-gate agent examples

**Estimated Time**: 0.5 days

---

### Priority 5: Backward Compatibility (Week 4, Day 5)

#### 5.1 Create Deprecation Wrappers
- [ ] **5.1.1** Create `src/mcp/tools/deprecated.ts`
- [ ] **5.1.2** Add wrapper for `test_coverage_detailed`:
  ```typescript
  /**
   * @deprecated Use analyzeCoverageWithRiskScoring() instead
   * Will be removed in v3.0.0 (scheduled for February 2026)
   */
  export async function test_coverage_detailed(params: any) {
    console.warn(
      '⚠️  test_coverage_detailed() is deprecated.\n' +
      '   Use analyzeCoverageWithRiskScoring() from coverage domain.\n' +
      '   Migration: docs/migration/phase3-tools.md'
    );
    return analyzeCoverageWithRiskScoring(params);
  }
  ```
- [ ] **5.1.3** Add wrappers for all deprecated tools (10-15 tools)
- [ ] **5.1.4** Set removal date: v3.0.0 (3 months from Phase 3 release)
- [ ] **5.1.5** Test deprecated wrappers
- [ ] **5.1.6** Update CHANGELOG.md with deprecation notices

**Estimated Time**: 0.5 days

---

### Priority 6: Documentation & Testing (Week 4, Day 5)

#### 6.1 Create Migration Guide
- [ ] **6.1.1** Create `docs/migration/phase3-tools.md`
- [ ] **6.1.2** Document all tool name changes
- [ ] **6.1.3** Provide before/after examples
- [ ] **6.1.4** Add deprecation timeline
- [ ] **6.1.5** Include troubleshooting section

**Estimated Time**: 0.5 days

---

#### 6.2 Update Documentation
- [ ] **6.2.1** Update `README.md` with new tool structure
- [ ] **6.2.2** Update `CLAUDE.md` with domain-specific tools
- [ ] **6.2.3** Update agent code execution examples
- [ ] **6.2.4** Create tool catalog: `docs/tools/catalog.md`
- [ ] **6.2.5** Update improvement plan with Phase 3 completion

**Estimated Time**: 0.5 days

---

#### 6.3 Testing & Validation
- [ ] **6.3.1** Run full unit test suite
- [ ] **6.3.2** Run integration tests (batched)
- [ ] **6.3.3** Test backward compatibility wrappers
- [ ] **6.3.4** Verify all domain tools registered in MCP
- [ ] **6.3.5** Test tool discovery commands
- [ ] **6.3.6** Validate TypeScript build
- [ ] **6.3.7** Run linting

**Estimated Time**: 0.5 days

---

## Success Criteria

### Must Have ✅
- [ ] All 15 new domain-specific tools created
- [ ] All existing tools organized into 6 domains
- [ ] 100% backward compatibility maintained
- [ ] All tests pass
- [ ] TypeScript build succeeds
- [ ] Migration guide created

### Should Have ✅
- [ ] Better type safety (no `any` types)
- [ ] JSDoc documentation for all tools
- [ ] Agent examples updated
- [ ] Tool catalog generated

### Nice to Have ✨
- [ ] Interactive tool selector CLI
- [ ] Auto-generated tool documentation
- [ ] Usage analytics integration

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking changes | Maintain 100% backward compatibility with deprecation wrappers |
| Migration confusion | Comprehensive migration guide with examples |
| Test failures | Incremental testing after each domain |
| Performance regression | Benchmark before/after |

---

## Estimated Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Week 3, Day 1** | 1 day | Coverage domain (4 tools) |
| **Week 3, Day 2** | 1 day | Flaky detection domain (3 tools) |
| **Week 3, Day 3** | 0.5 days | Performance domain (2 tools) |
| **Week 3, Day 4-5** | 1 day | Security domain (4 tools) |
| **Week 4, Day 1** | 0.5 days | Visual testing domain (2 tools) |
| **Week 4, Day 2** | 0.5 days | Organize test-generation tools |
| **Week 4, Day 3** | 0.5 days | Organize quality-gates tools |
| **Week 4, Day 4** | 0.5 days | Backward compatibility |
| **Week 4, Day 5** | 1 day | Documentation & testing |
| **Total** | **7 days** | **15 new tools + organization** |

---

## Dependencies

- ✅ Phase 1 Complete (Agent frontmatter simplification)
- ✅ Phase 2 Complete (Code execution examples)
- ⚠️ TypeScript types may need updates
- ⚠️ MCP server restart after tool registration

---

## Deliverables

1. **Code**:
   - 15 new domain-specific tools
   - 6 domain directories with organized tools
   - Backward compatibility wrappers
   - Updated MCP tool registry

2. **Documentation**:
   - Migration guide
   - Tool catalog
   - Updated CLAUDE.md
   - Updated agent examples

3. **Tests**:
   - Unit tests for all new tools
   - Integration tests for domains
   - Backward compatibility tests

---

**Status**: Ready to Start
**Next Action**: Begin with Priority 1.1 (Coverage Domain)
**Blocking Issues**: None
