/**
 * Output Formatter Tests
 *
 * Comprehensive tests for the AI output formatting system.
 *
 * @module output/__tests__/OutputFormatter.test
 */

import {
  OutputFormatterImpl,
  AIActionSuggester,
  OutputMode,
  OutputModeDetector,
  TestResultsData,
  CoverageReportData,
  AgentStatusData,
  QualityMetricsData,
  ExecutionMetadata,
  SCHEMA_VERSION
} from '../index';

describe('OutputFormatterImpl', () => {
  let formatter: OutputFormatterImpl;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    formatter = new OutputFormatterImpl();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('formatTestResults', () => {
    it('should format test results with proper schema', () => {
      const testResults: TestResultsData = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1000,
          passRate: 80.0,
          failureRate: 20.0
        },
        suites: [],
        failures: [
          {
            testName: 'should work',
            suiteName: 'TestSuite',
            file: 'test.ts',
            line: 10,
            error: {
              message: 'Test failed',
              stack: 'Error stack',
              type: 'AssertionError'
            },
            duration: 100,
            retries: 0,
            lastRun: '2025-12-12T10:00:00.000Z'
          }
        ],
        flaky: []
      };

      const metadata: ExecutionMetadata = {
        agentId: 'qe-test-executor',
        agentVersion: '2.3.5',
        duration: 1000,
        environment: 'test'
      };

      const output = formatter.formatTestResults(testResults, metadata);

      expect(output.schemaVersion).toBe(SCHEMA_VERSION);
      expect(output.outputType).toBe('test_results');
      expect(output.status).toBe('failure');
      expect(output.data).toEqual(testResults);
      expect(output.metadata).toEqual(metadata);
      expect(output.actionSuggestions).toBeInstanceOf(Array);
      expect(output.warnings).toBeInstanceOf(Array);
      expect(output.errors).toBeInstanceOf(Array);
    });

    it('should generate action suggestions for test failures', () => {
      const testResults: TestResultsData = {
        summary: {
          total: 10,
          passed: 7,
          failed: 3,
          skipped: 0,
          duration: 1000,
          passRate: 70.0,
          failureRate: 30.0
        },
        suites: [],
        failures: [
          {
            testName: 'test1',
            suiteName: 'Suite1',
            file: 'test1.ts',
            line: 10,
            error: { message: 'Error', stack: '', type: 'Error' },
            duration: 100,
            retries: 0,
            lastRun: '2025-12-12T10:00:00.000Z'
          },
          {
            testName: 'test2',
            suiteName: 'Suite2',
            file: 'test2.ts',
            line: 20,
            error: { message: 'Error', stack: '', type: 'Error' },
            duration: 100,
            retries: 0,
            lastRun: '2025-12-12T10:00:00.000Z'
          },
          {
            testName: 'test3',
            suiteName: 'Suite3',
            file: 'test3.ts',
            line: 30,
            error: { message: 'Error', stack: '', type: 'Error' },
            duration: 100,
            retries: 0,
            lastRun: '2025-12-12T10:00:00.000Z'
          }
        ],
        flaky: []
      };

      const metadata: ExecutionMetadata = {
        agentId: 'qe-test-executor',
        agentVersion: '2.3.5',
        duration: 1000,
        environment: 'test'
      };

      const output = formatter.formatTestResults(testResults, metadata);

      expect(output.actionSuggestions.length).toBeGreaterThan(0);
      const fixAction = output.actionSuggestions.find(a => a.action === 'fix_test_failures');
      expect(fixAction).toBeDefined();
      expect(fixAction?.priority).toBe('critical');
      expect(fixAction?.affectedTests?.length).toBe(3);
    });
  });

  describe('formatCoverageReport', () => {
    it('should format coverage report with proper schema', () => {
      const coverageReport: CoverageReportData = {
        summary: {
          overall: 75.0,
          lines: { total: 100, covered: 75, uncovered: 25, percentage: 75.0 },
          branches: { total: 50, covered: 38, uncovered: 12, percentage: 76.0 },
          functions: { total: 20, covered: 15, uncovered: 5, percentage: 75.0 },
          statements: { total: 95, covered: 71, uncovered: 24, percentage: 74.74 }
        },
        gaps: [],
        files: []
      };

      const metadata: ExecutionMetadata = {
        agentId: 'qe-coverage-analyzer',
        agentVersion: '2.3.5',
        duration: 500,
        environment: 'test'
      };

      const output = formatter.formatCoverageReport(coverageReport, metadata);

      expect(output.schemaVersion).toBe(SCHEMA_VERSION);
      expect(output.outputType).toBe('coverage_report');
      expect(output.status).toBe('warning');
      expect(output.data).toEqual(coverageReport);
    });

    it('should generate action suggestions for coverage gaps', () => {
      const coverageReport: CoverageReportData = {
        summary: {
          overall: 55.0,
          lines: { total: 100, covered: 55, uncovered: 45, percentage: 55.0 },
          branches: { total: 50, covered: 28, uncovered: 22, percentage: 56.0 },
          functions: { total: 20, covered: 11, uncovered: 9, percentage: 55.0 },
          statements: { total: 95, covered: 52, uncovered: 43, percentage: 54.74 }
        },
        gaps: [
          {
            file: 'PaymentService.ts',
            type: 'critical_path',
            priority: 'critical',
            coverage: { lines: 45.0, branches: 30.0, functions: 50.0 },
            uncoveredLines: [1, 2, 3],
            uncoveredBranches: [],
            impact: 'high',
            reason: 'Critical payment path'
          }
        ],
        files: []
      };

      const metadata: ExecutionMetadata = {
        agentId: 'qe-coverage-analyzer',
        agentVersion: '2.3.5',
        duration: 500,
        environment: 'test'
      };

      const output = formatter.formatCoverageReport(coverageReport, metadata);

      expect(output.actionSuggestions.length).toBeGreaterThan(0);
      const coverageAction = output.actionSuggestions.find(a => a.action === 'increase_coverage');
      expect(coverageAction).toBeDefined();
      expect(coverageAction?.priority).toBe('critical');
    });
  });

  describe('isCompatibleVersion', () => {
    it('should return true for compatible versions', () => {
      expect(formatter.isCompatibleVersion('1.0.0', '1.0.0')).toBe(true);
      expect(formatter.isCompatibleVersion('1.1.0', '1.0.0')).toBe(true);
      expect(formatter.isCompatibleVersion('1.0.0', '1.5.0')).toBe(true);
    });

    it('should return false for incompatible versions', () => {
      expect(formatter.isCompatibleVersion('2.0.0', '1.0.0')).toBe(false);
      expect(formatter.isCompatibleVersion('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('format', () => {
    it('should format in AI mode when AQE_AI_OUTPUT=1', () => {
      process.env.AQE_AI_OUTPUT = '1';

      const testResults: TestResultsData = {
        summary: {
          total: 5,
          passed: 5,
          failed: 0,
          skipped: 0,
          duration: 500,
          passRate: 100.0,
          failureRate: 0.0
        },
        suites: [],
        failures: [],
        flaky: []
      };

      const output = formatter.format(testResults, 'test_results');

      expect(typeof output).toBe('string');
      expect(() => JSON.parse(output)).not.toThrow();

      const parsed = JSON.parse(output);
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.outputType).toBe('test_results');
    });

    it('should format in human mode when AQE_AI_OUTPUT=0', () => {
      process.env.AQE_AI_OUTPUT = '0';

      const testResults: TestResultsData = {
        summary: {
          total: 5,
          passed: 5,
          failed: 0,
          skipped: 0,
          duration: 500,
          passRate: 100.0,
          failureRate: 0.0
        },
        suites: [],
        failures: [],
        flaky: []
      };

      const output = formatter.format(testResults, 'test_results');

      expect(typeof output).toBe('string');
      expect(output).toContain('Test Results');
      expect(output).toContain('Summary:');
    });
  });
});

describe('OutputModeDetector', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect AI mode when AQE_AI_OUTPUT=1', () => {
    process.env.AQE_AI_OUTPUT = '1';
    expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
  });

  it('should detect human mode when AQE_AI_OUTPUT=0', () => {
    process.env.AQE_AI_OUTPUT = '0';
    expect(OutputModeDetector.detectMode()).toBe(OutputMode.HUMAN);
  });

  it('should detect AI mode in Claude Code', () => {
    delete process.env.AQE_AI_OUTPUT;
    process.env.CLAUDECODE = '1';
    expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
  });

  it('should detect AI mode in Cursor AI', () => {
    delete process.env.AQE_AI_OUTPUT;
    delete process.env.CLAUDECODE;
    process.env.CURSOR_AI = '1';
    expect(OutputModeDetector.detectMode()).toBe(OutputMode.AI);
  });

  it('should default to human mode', () => {
    delete process.env.AQE_AI_OUTPUT;
    delete process.env.CLAUDECODE;
    delete process.env.CURSOR_AI;
    delete process.env.AIDER_AI;
    expect(OutputModeDetector.detectMode()).toBe(OutputMode.HUMAN);
  });

  it('should detect pretty print mode', () => {
    process.env.AQE_OUTPUT_PRETTY = '1';
    expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(true);

    process.env.AQE_OUTPUT_PRETTY = '0';
    expect(OutputModeDetector.isPrettyPrintEnabled()).toBe(false);
  });

  it('should detect streaming mode', () => {
    process.env.AQE_OUTPUT_STREAM = '1';
    expect(OutputModeDetector.isStreamingEnabled()).toBe(true);

    process.env.AQE_OUTPUT_STREAM = '0';
    expect(OutputModeDetector.isStreamingEnabled()).toBe(false);
  });
});

describe('AIActionSuggester', () => {
  let suggester: AIActionSuggester;

  beforeEach(() => {
    suggester = new AIActionSuggester();
  });

  describe('generateTestResultActions', () => {
    it('should generate fix failures action', () => {
      const testResults: TestResultsData = {
        summary: {
          total: 10,
          passed: 8,
          failed: 2,
          skipped: 0,
          duration: 1000,
          passRate: 80.0,
          failureRate: 20.0
        },
        suites: [],
        failures: [
          {
            testName: 'test1',
            suiteName: 'Suite1',
            file: 'test.ts',
            line: 10,
            error: { message: 'Error', stack: '', type: 'Error' },
            duration: 100,
            retries: 0,
            lastRun: '2025-12-12T10:00:00.000Z'
          }
        ],
        flaky: []
      };

      const actions = suggester.generateTestResultActions(testResults);

      expect(actions.length).toBeGreaterThan(0);
      const fixAction = actions.find(a => a.action === 'fix_test_failures');
      expect(fixAction).toBeDefined();
      expect(fixAction?.priority).toBe('critical');
      expect(fixAction?.automation.canAutoFix).toBe(false);
    });

    it('should generate stabilize flaky action', () => {
      const testResults: TestResultsData = {
        summary: {
          total: 10,
          passed: 9,
          failed: 0,
          skipped: 0,
          flaky: 1,
          duration: 1000,
          passRate: 90.0,
          failureRate: 0.0,
          flakyRate: 10.0
        },
        suites: [],
        failures: [],
        flaky: [
          {
            testName: 'flakyTest',
            suiteName: 'FlakySuite',
            file: 'flaky.ts',
            line: 20,
            flakinessScore: 0.45,
            failureRate: 0.15,
            totalRuns: 100,
            recentFailures: 5,
            pattern: 'intermittent_timeout'
          }
        ]
      };

      const actions = suggester.generateTestResultActions(testResults);

      expect(actions.length).toBeGreaterThan(0);
      const flakyAction = actions.find(a => a.action === 'stabilize_flaky_tests');
      expect(flakyAction).toBeDefined();
      expect(flakyAction?.automation.canAutoFix).toBe(true);
    });

    it('should generate success acknowledgment', () => {
      const testResults: TestResultsData = {
        summary: {
          total: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
          duration: 1000,
          passRate: 100.0,
          failureRate: 0.0
        },
        suites: [],
        failures: [],
        flaky: []
      };

      const actions = suggester.generateTestResultActions(testResults);

      expect(actions.length).toBeGreaterThan(0);
      const successAction = actions.find(a => a.action === 'agent_ready');
      expect(successAction).toBeDefined();
      expect(successAction?.priority).toBe('info');
    });
  });

  describe('generateCoverageReportActions', () => {
    it('should generate critical gaps action', () => {
      const coverageReport: CoverageReportData = {
        summary: {
          overall: 75.0,
          lines: { total: 100, covered: 75, uncovered: 25, percentage: 75.0 },
          branches: { total: 50, covered: 38, uncovered: 12, percentage: 76.0 },
          functions: { total: 20, covered: 15, uncovered: 5, percentage: 75.0 },
          statements: { total: 95, covered: 71, uncovered: 24, percentage: 74.74 }
        },
        gaps: [
          {
            file: 'CriticalService.ts',
            type: 'critical_path',
            priority: 'critical',
            coverage: { lines: 40.0, branches: 30.0, functions: 50.0 },
            uncoveredLines: [1, 2, 3, 4, 5],
            uncoveredBranches: [],
            impact: 'critical',
            reason: 'Business critical'
          }
        ],
        files: []
      };

      const actions = suggester.generateCoverageReportActions(coverageReport);

      expect(actions.length).toBeGreaterThan(0);
      const criticalAction = actions.find(
        a => a.action === 'increase_coverage' && a.priority === 'critical'
      );
      expect(criticalAction).toBeDefined();
      expect(criticalAction?.automation.canAutoFix).toBe(true);
    });
  });

  describe('generateQualityMetricsActions', () => {
    it('should generate quality gate failures action', () => {
      const qualityMetrics: QualityMetricsData = {
        overallScore: 65.0,
        grade: 'C',
        dimensions: {
          testCoverage: { score: 70.0, weight: 0.25, status: 'fair' },
          codeQuality: { score: 60.0, weight: 0.25, status: 'needs_improvement' },
          security: { score: 85.0, weight: 0.2, status: 'good' },
          performance: { score: 55.0, weight: 0.15, status: 'needs_improvement' },
          maintainability: { score: 60.0, weight: 0.15, status: 'fair' }
        },
        qualityGates: {
          passed: 5,
          failed: 2,
          total: 7,
          gates: [
            {
              name: 'max_complexity',
              status: 'failed',
              actualValue: 25,
              threshold: 15,
              operator: 'lte'
            }
          ]
        },
        codeSmells: {
          total: 10,
          byType: { duplicate_code: 5, long_method: 5 },
          criticalSmells: []
        },
        technicalDebt: {
          total: 30,
          unit: 'hours',
          byCategory: { code_smells: 15, complexity: 10, duplications: 5 }
        }
      };

      const actions = suggester.generateQualityMetricsActions(qualityMetrics);

      expect(actions.length).toBeGreaterThan(0);
      const gateAction = actions.find(a => a.action === 'fix_quality_gates');
      expect(gateAction).toBeDefined();
    });
  });
});
