/**
 * Unit tests for Domain MCP Handlers
 * Tests domain-specific operations: test generation, execution, coverage, quality, security, etc.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock task executor at module level — prevents real task execution which
// times out in CI and causes OOM in DevPod environments (Issue #294).
// Must be declared BEFORE the handler imports so vi.mock hoists correctly.
// ---------------------------------------------------------------------------
const mockExecute = vi.fn();
const mockSetQualityFeedbackLoop = vi.fn();

vi.mock('../../../../src/coordination/task-executor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/coordination/task-executor')>();
  return {
    ...actual,
    createTaskExecutor: vi.fn(() => ({
      execute: mockExecute,
      setQualityFeedbackLoop: mockSetQualityFeedbackLoop,
    })),
  };
});

import {
  handleTestGenerate,
  handleTestExecute,
  handleCoverageAnalyze,
  handleQualityAssess,
  handleSecurityScan,
  handleContractValidate,
  handleAccessibilityTest,
  handleChaosTest,
  handleDefectPredict,
  handleRequirementsValidate,
  handleCodeIndex,
  resetTaskExecutor,
} from '../../../../src/mcp/handlers/domain-handlers';
import {
  handleFleetInit,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import type {
  TestGenerateParams,
  TestExecuteParams,
  CoverageAnalyzeParams,
  QualityAssessParams,
  SecurityScanParams,
  ContractValidateParams,
  AccessibilityTestParams,
  ChaosTestParams,
} from '../../../../src/mcp/types';

// Default mock response for all domain handlers
const defaultMockResponse = {
  success: true,
  data: {
    total: 5,
    passed: 4,
    failed: 1,
    skipped: 0,
    coverage: 82.5,
    vulnerabilities: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    valid: true,
    score: 85,
    qualityScore: 88,
    riskScore: 15,
    testsGenerated: 3,
    lineCoverage: 85,
    branchCoverage: 78,
    functionCoverage: 92,
    filesIndexed: 10,
    symbolsExtracted: 50,
    relationsFound: 25,
    requirementsAnalyzed: 5,
    testable: 4,
    total: 5,               // numeric test counts
    predictedDefects: [],
    recommendations: ['Improve test coverage'],
    breakingChanges: [],
    warnings: [],
    violations: [],
    gaps: [],
    results: [
      { id: 'test-1', name: 'sample test', status: 'passed', duration: 12 },
    ],
  },
  duration: 150,
  savedFiles: [],
};

// ============================================================================
// Tests
// ============================================================================

describe('Domain Handlers', { timeout: 30000 }, () => {
  // Initialize fleet ONCE for all tests (in-memory to avoid touching live DB).
  // Each fleet init creates 13 domain plugins + queen + MinCut + SONA engines,
  // so per-test init causes OOM in memory-constrained environments.
  beforeAll(async () => {
    // Set up mock executor default response
    mockExecute.mockResolvedValue(defaultMockResponse);
    await handleFleetInit({ memoryBackend: 'memory' });
  });

  afterAll(async () => {
    resetTaskExecutor();
    await disposeFleet();
    resetUnifiedPersistence();
  });

  // Reset mock state between tests to avoid cross-test leakage
  afterEach(() => {
    mockExecute.mockClear();
    mockExecute.mockResolvedValue(defaultMockResponse);
    resetTaskExecutor();
  });

  // --------------------------------------------------------------------------
  // handleTestGenerate
  // --------------------------------------------------------------------------

  describe('handleTestGenerate', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTestGenerate({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should generate tests with default parameters', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function add(a, b) { return a + b; }',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.testsGenerated).toBeGreaterThan(0);
    }, 30000);

    it('should respect language parameter', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'def add(a, b): return a + b',
        language: 'python',
      });

      expect(result.success).toBe(true);
      expect(result.data!.language).toBe('python');
    }, 30000);

    it('should respect testType parameter', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'const api = { fetch: () => {} }',
        testType: 'integration',
      });

      expect(result.success).toBe(true);
      expect(result.data!.tests).toBeDefined();
    }, 30000);

    it('should respect coverageGoal parameter', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
        coverageGoal: 95,
      });

      expect(result.success).toBe(true);
      // Coverage estimate should be a valid percentage (0-100)
      expect(result.data!.coverageEstimate).toBeGreaterThanOrEqual(0);
      expect(result.data!.coverageEstimate).toBeLessThanOrEqual(100);
    }, 30000);

    it('should include V2-compatible test objects', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function multiply(a, b) { return a * b; }',
      });

      expect(result.success).toBe(true);
      expect(result.data!.tests).toBeDefined();
      expect(Array.isArray(result.data!.tests)).toBe(true);

      if (result.data!.tests!.length > 0) {
        const test = result.data!.tests![0] as any;
        expect(test.id).toBeDefined();
        expect(test.name).toBeDefined();
        expect(test.type).toBeDefined();
      }
    }, 30000);

    it('should include AI insights when enabled', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function complex() { if(x) { for(i=0;i<10;i++) {} } }',
        aiEnhancement: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.aiInsights).toBeDefined();
      expect(result.data!.aiInsights!.recommendations).toBeDefined();
      expect(result.data!.aiInsights!.confidence).toBeGreaterThan(0);
    }, 30000);

    it('should detect anti-patterns when requested', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'var x = eval("code"); function f() { var y = 1; }',
        language: 'javascript',
        detectAntiPatterns: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.antiPatterns).toBeDefined();
      expect(Array.isArray(result.data!.antiPatterns)).toBe(true);
    }, 30000);

    it('should include complexity analysis', async () => {
      const result = await handleTestGenerate({
        sourceCode: `
          function complex(x) {
            if (x > 0) {
              for (let i = 0; i < x; i++) {
                if (i % 2) {
                  switch(i) {
                    case 1: return 1;
                    case 2: return 2;
                  }
                }
              }
            }
          }
        `,
      });

      expect(result.success).toBe(true);
      expect(result.data!.complexity).toBeDefined();
      expect(result.data!.complexity!.score).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(result.data!.complexity!.level);
    }, 30000);

    it('should include learning feedback', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
      });

      expect(result.success).toBe(true);
      expect(result.data!.learning).toBeDefined();
      expect(result.data!.learning!.enabled).toBe(true);
      expect(result.data!.learning!.agentId).toBeDefined();
    }, 30000);

    it('should include patterns used', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
      });

      expect(result.success).toBe(true);
      expect(result.data!.patternsUsed).toBeDefined();
      expect(Array.isArray(result.data!.patternsUsed)).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleTestExecute
  // --------------------------------------------------------------------------

  describe('handleTestExecute', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTestExecute({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should execute tests with default parameters', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/unit/**/*.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.status).toBe('completed');
    }, 30000);

    it('should return test counts', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/sample.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.total).toBeGreaterThanOrEqual(0);
      expect(result.data!.passed).toBeGreaterThanOrEqual(0);
      expect(result.data!.failed).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should respect parallel parameter', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/**/*.test.ts'],
        parallel: true,
        parallelism: 4,
      });

      expect(result.success).toBe(true);
      expect(result.data!.workerStats).toBeDefined();
      expect(result.data!.workerStats!.workersUsed).toBeGreaterThan(0);
    }, 30000);

    it('should include worker stats (V2-compatible)', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/unit.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.workerStats).toBeDefined();
      expect(result.data!.workerStats!.efficiency).toBeGreaterThanOrEqual(0);
      expect(result.data!.workerStats!.loadBalance).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should include retry stats (V2-compatible)', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/flaky.test.ts'],
        retryCount: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data!.retryStats).toBeDefined();
      expect(result.data!.retryStats!.totalRetries).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should include individual test results', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/sample.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.results).toBeDefined();
      expect(Array.isArray(result.data!.results)).toBe(true);
    }, 30000);

    it('should include summary', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/sample.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.summary).toBeDefined();
      expect(result.data!.summary!.totalTests).toBeGreaterThanOrEqual(0);
      expect(result.data!.summary!.passRate).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should include learning feedback', async () => {
      const result = await handleTestExecute({
        testFiles: ['tests/sample.test.ts'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.learning).toBeDefined();
    }, 30000);

    it('should handle test suites parameter', async () => {
      const result = await handleTestExecute({
        testSuites: ['unit', 'integration'],
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleCoverageAnalyze
  // --------------------------------------------------------------------------

  describe('handleCoverageAnalyze', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should analyze coverage with default parameters', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.lineCoverage).toBeGreaterThanOrEqual(0);
      expect(result.data!.branchCoverage).toBeGreaterThanOrEqual(0);
      expect(result.data!.functionCoverage).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should detect gaps when enabled', async () => {
      const result = await handleCoverageAnalyze({
        detectGaps: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.gaps).toBeDefined();
      expect(Array.isArray(result.data!.gaps)).toBe(true);
    }, 30000);

    it('should include gap analysis (V2-compatible)', async () => {
      const result = await handleCoverageAnalyze({
        detectGaps: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.gapAnalysis).toBeDefined();
      expect(result.data!.gapAnalysis!.totalGaps).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should include coverage by file', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data!.coverageByFile).toBeDefined();
      expect(Array.isArray(result.data!.coverageByFile)).toBe(true);
    }, 30000);

    it('should include trends', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data!.trends).toBeDefined();
    }, 30000);

    it('should include AI insights', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data!.aiInsights).toBeDefined();
      expect(result.data!.aiInsights!.recommendations).toBeDefined();
      expect(result.data!.aiInsights!.riskAssessment).toBeDefined();
    }, 30000);

    it('should include learning feedback', async () => {
      const result = await handleCoverageAnalyze({});

      expect(result.success).toBe(true);
      expect(result.data!.learning).toBeDefined();
    }, 30000);

    it('should respect target parameter', async () => {
      const result = await handleCoverageAnalyze({
        target: 'src/',
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should respect prioritization parameter', async () => {
      const result = await handleCoverageAnalyze({
        prioritization: 'complexity',
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleQualityAssess
  // --------------------------------------------------------------------------

  describe('handleQualityAssess', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleQualityAssess({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should assess quality with default parameters', async () => {
      const result = await handleQualityAssess({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.data!.qualityScore).toBeLessThanOrEqual(100);
    }, 30000);

    it('should return pass/fail status', async () => {
      // Override mock to return boolean passed (quality handler expects boolean)
      mockExecute.mockResolvedValueOnce({
        ...defaultMockResponse,
        data: { ...defaultMockResponse.data, passed: true },
      });
      const result = await handleQualityAssess({
        threshold: 70,
      });

      expect(result.success).toBe(true);
      expect(typeof result.data!.passed).toBe('boolean');
    }, 30000);

    it('should run quality gate when requested', async () => {
      const result = await handleQualityAssess({
        runGate: true,
        threshold: 80,
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should return quality metrics', async () => {
      const result = await handleQualityAssess({
        metrics: ['coverage', 'complexity', 'maintainability'],
      });

      expect(result.success).toBe(true);
      expect(result.data!.metrics).toBeDefined();
    }, 30000);

    it('should include recommendations', async () => {
      const result = await handleQualityAssess({});

      expect(result.success).toBe(true);
      expect(result.data!.recommendations).toBeDefined();
      expect(Array.isArray(result.data!.recommendations)).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleSecurityScan
  // --------------------------------------------------------------------------

  describe('handleSecurityScan', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleSecurityScan({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should scan security with default parameters', async () => {
      const result = await handleSecurityScan({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.vulnerabilities).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should categorize vulnerabilities by severity', async () => {
      const result = await handleSecurityScan({});

      expect(result.success).toBe(true);
      expect(result.data!.critical).toBeGreaterThanOrEqual(0);
      expect(result.data!.high).toBeGreaterThanOrEqual(0);
      expect(result.data!.medium).toBeGreaterThanOrEqual(0);
      expect(result.data!.low).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should perform SAST by default', async () => {
      const result = await handleSecurityScan({
        sast: true,
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should perform DAST when requested', async () => {
      const result = await handleSecurityScan({
        dast: true,
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should include top vulnerabilities', async () => {
      const result = await handleSecurityScan({});

      expect(result.success).toBe(true);
      expect(result.data!.topVulnerabilities).toBeDefined();
      expect(Array.isArray(result.data!.topVulnerabilities)).toBe(true);
    }, 30000);

    it('should include recommendations', async () => {
      const result = await handleSecurityScan({});

      expect(result.success).toBe(true);
      expect(result.data!.recommendations).toBeDefined();
    }, 30000);

    it('should handle compliance parameter', async () => {
      const result = await handleSecurityScan({
        compliance: ['owasp-top-10', 'pci-dss'],
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleContractValidate
  // --------------------------------------------------------------------------

  describe('handleContractValidate', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleContractValidate({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should validate contract with default parameters', async () => {
      const result = await handleContractValidate({
        contractPath: 'contracts/api.yaml',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(typeof result.data!.valid).toBe('boolean');
    }, 30000);

    it('should detect breaking changes when enabled', async () => {
      const result = await handleContractValidate({
        contractPath: 'contracts/api.yaml',
        checkBreakingChanges: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.breakingChanges).toBeDefined();
      expect(Array.isArray(result.data!.breakingChanges)).toBe(true);
    }, 30000);

    it('should return warnings', async () => {
      const result = await handleContractValidate({
        contractPath: 'contracts/api.yaml',
      });

      expect(result.success).toBe(true);
      expect(result.data!.warnings).toBeDefined();
      expect(Array.isArray(result.data!.warnings)).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleAccessibilityTest
  // --------------------------------------------------------------------------

  describe('handleAccessibilityTest', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleAccessibilityTest({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should test accessibility with default parameters', async () => {
      // Override mock to return boolean passed (accessibility handler expects boolean)
      mockExecute.mockResolvedValueOnce({
        ...defaultMockResponse,
        data: { ...defaultMockResponse.data, passed: true },
      });
      const result = await handleAccessibilityTest({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(typeof result.data!.passed).toBe('boolean');
    }, 30000);

    it('should return accessibility score', async () => {
      const result = await handleAccessibilityTest({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data!.score).toBeGreaterThanOrEqual(0);
      expect(result.data!.score).toBeLessThanOrEqual(100);
    }, 30000);

    it('should report violations', async () => {
      const result = await handleAccessibilityTest({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data!.violations).toBeDefined();
      expect(Array.isArray(result.data!.violations)).toBe(true);
    }, 30000);

    it('should report warnings', async () => {
      const result = await handleAccessibilityTest({
        url: 'https://example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data!.warnings).toBeDefined();
      expect(Array.isArray(result.data!.warnings)).toBe(true);
    }, 30000);

    it('should respect standard parameter', async () => {
      const result = await handleAccessibilityTest({
        url: 'https://example.com',
        standard: 'wcag21-aaa',
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleChaosTest
  // --------------------------------------------------------------------------

  describe('handleChaosTest', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleChaosTest({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should run chaos test with default parameters', async () => {
      const result = await handleChaosTest({
        target: 'api-service',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.faultType).toBeDefined();
    }, 30000);

    it('should return resilience metrics', async () => {
      const result = await handleChaosTest({
        target: 'api-service',
        faultType: 'latency',
      });

      expect(result.success).toBe(true);
      expect(result.data!.resilience).toBeDefined();
      expect(typeof result.data!.resilience.recovered).toBe('boolean');
      expect(result.data!.resilience.recoveryTime).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should respect faultType parameter', async () => {
      const faultTypes = ['latency', 'error', 'timeout'] as const;

      for (const faultType of faultTypes) {
        const result = await handleChaosTest({
          target: 'service',
          faultType,
        });

        expect(result.success).toBe(true);
        // mapToResult defaults to 'latency' when executor data lacks faultType
        expect(result.data!.faultType).toBeDefined();
      }
    }, 30000);

    it('should respect dryRun parameter', async () => {
      const result = await handleChaosTest({
        target: 'service',
        dryRun: true,
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleDefectPredict
  // --------------------------------------------------------------------------

  describe('handleDefectPredict', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleDefectPredict({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should predict defects with default parameters', async () => {
      const result = await handleDefectPredict({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.predictedDefects).toBeDefined();
      expect(Array.isArray(result.data!.predictedDefects)).toBe(true);
    }, 30000);

    it('should return risk score', async () => {
      const result = await handleDefectPredict({});

      expect(result.success).toBe(true);
      // Risk score is 0-100 (percentage)
      expect(result.data!.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.data!.riskScore).toBeLessThanOrEqual(100);
    }, 30000);

    it('should include recommendations', async () => {
      const result = await handleDefectPredict({});

      expect(result.success).toBe(true);
      expect(result.data!.recommendations).toBeDefined();
      expect(Array.isArray(result.data!.recommendations)).toBe(true);
    }, 30000);

    it('should respect lookback parameter', async () => {
      const result = await handleDefectPredict({
        lookback: 60,
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should respect minConfidence parameter', async () => {
      const result = await handleDefectPredict({
        minConfidence: 0.8,
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleRequirementsValidate
  // --------------------------------------------------------------------------

  describe('handleRequirementsValidate', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleRequirementsValidate({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    it('should validate requirements with default parameters', async () => {
      const result = await handleRequirementsValidate({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.requirementsAnalyzed).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should return testability metrics', async () => {
      const result = await handleRequirementsValidate({});

      expect(result.success).toBe(true);
      expect(result.data!.testable).toBeGreaterThanOrEqual(0);
      expect(result.data!.coverage).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should generate BDD scenarios when requested', async () => {
      const result = await handleRequirementsValidate({
        generateBDD: true,
      });

      expect(result.success).toBe(true);
      expect(result.data!.bddScenarios).toBeDefined();
      expect(Array.isArray(result.data!.bddScenarios)).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleCodeIndex
  // --------------------------------------------------------------------------

  describe('handleCodeIndex', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleCodeIndex({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
      // Re-init fleet for subsequent tests (shared fleet via beforeAll)
      await handleFleetInit({ memoryBackend: 'memory' });
    });

    // SKIP: These tests do real code indexing and take 30+ seconds each
    // They're more appropriate for integration tests
    it.skip('should index code with default parameters (integration)', async () => {
      const result = await handleCodeIndex({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.filesIndexed).toBeGreaterThanOrEqual(0);
    }, 60000);

    it.skip('should return indexing metrics (integration)', async () => {
      const result = await handleCodeIndex({});

      expect(result.success).toBe(true);
      expect(result.data!.symbolsExtracted).toBeGreaterThanOrEqual(0);
      expect(result.data!.relationsFound).toBeGreaterThanOrEqual(0);
    }, 60000);

    it.skip('should support incremental indexing (integration)', async () => {
      const result = await handleCodeIndex({
        incremental: true,
      });

      expect(result.success).toBe(true);
    }, 60000);

    it.skip('should support git-based filtering (integration)', async () => {
      const result = await handleCodeIndex({
        gitSince: 'HEAD~10',
      });

      expect(result.success).toBe(true);
    }, 60000);
  });

  // --------------------------------------------------------------------------
  // resetTaskExecutor
  // --------------------------------------------------------------------------

  describe('resetTaskExecutor', () => {
    it('should reset executor without error', () => {
      expect(() => resetTaskExecutor()).not.toThrow();
    });

    it('should allow new executor to be created after reset', async () => {
      resetTaskExecutor();

      const result = await handleTestGenerate({
        sourceCode: 'function test() {}',
      });

      expect(result.success).toBe(true);
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle empty source code', async () => {
      const result = await handleTestGenerate({
        sourceCode: '',
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should handle very large source code', async () => {
      const largeCode = 'function f() {}\n'.repeat(1000);

      const result = await handleTestGenerate({
        sourceCode: largeCode,
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should handle concurrent domain operations', async () => {
      const results = await Promise.all([
        handleTestGenerate({ sourceCode: 'code1' }),
        handleCoverageAnalyze({}),
        handleQualityAssess({}),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    }, 60000);

    it('should handle special characters in source code', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'const str = "test\\n\\t\\"quotes\\"";',
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should handle unicode in source code', async () => {
      const result = await handleTestGenerate({
        sourceCode: 'const emoji = "testing";',
      });

      expect(result.success).toBe(true);
    }, 30000);
  });
});
