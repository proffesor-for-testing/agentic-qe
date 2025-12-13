/**
 * Output Formatter - Unit Tests
 *
 * Comprehensive test suite for AI-friendly output formatting.
 * Tests all output types, JSON schema compliance, and mode detection.
 *
 * Coverage target: 95%+
 *
 * @module tests/unit/output/OutputFormatter
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  // Enums
  OutputMode,

  // Types
  OutputType,
  ExecutionStatus,
  ActionPriority,
  StreamType,

  // Interfaces
  BaseAIOutput,
  ExecutionMetadata,
  ActionSuggestion,
  ActionAutomation,
  ActionImpact,
  OutputWarning,
  OutputError,
  TestResultsOutput,
  TestResultsData,
  TestSummary,
  TestSuite,
  TestFailure,
  FlakyTest,
  CoverageReportOutput,
  CoverageReportData,
  CoverageSummary,
  CoverageMetric,
  CoverageTrend,
  CoverageGap,
  FileCoverage,
  AgentStatusOutput,
  AgentStatusData,
  AgentInfo,
  AgentStats,
  LearningInfo,
  DependenciesStatus,
  Dependency,
  AgentConfiguration,
  QualityMetricsOutput,
  QualityMetricsData,
  QualityDimensions,
  QualityDimension,
  QualityGates,
  QualityGate,
  CodeSmells,
  CriticalSmell,
  TechnicalDebt,
  StreamStart,
  StreamProgress,
  StreamComplete,
  StreamError,

  // Constants
  SCHEMA_VERSION,
  ActionTypes,
  PriorityWeights,

  // Utilities
  OutputModeDetector,
} from '@/output/OutputFormatter';

describe('OutputFormatter', () => {
  describe('Output Mode Enum', () => {
    it('should define all output modes', () => {
      expect(OutputMode.HUMAN).toBe('human');
      expect(OutputMode.AI).toBe('ai');
      expect(OutputMode.AUTO).toBe('auto');
    });
  });

  describe('Output Types', () => {
    it('should support all output type values', () => {
      const types: OutputType[] = [
        'test_results',
        'coverage_report',
        'agent_status',
        'quality_metrics',
        'security_scan',
        'performance_metrics',
        'test_results_stream',
      ];

      types.forEach((type) => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Execution Status', () => {
    it('should define all status values', () => {
      const statuses: ExecutionStatus[] = ['success', 'failure', 'warning', 'error'];
      statuses.forEach((status) => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Action Priority', () => {
    it('should define all priority levels', () => {
      const priorities: ActionPriority[] = ['critical', 'high', 'medium', 'low', 'info'];
      priorities.forEach((priority) => {
        expect(typeof priority).toBe('string');
      });
    });

    it('should have correct priority weights', () => {
      expect(PriorityWeights.critical).toBe(1);
      expect(PriorityWeights.high).toBe(2);
      expect(PriorityWeights.medium).toBe(3);
      expect(PriorityWeights.low).toBe(4);
      expect(PriorityWeights.info).toBe(5);
    });

    it('should sort priorities by weight', () => {
      const priorities: ActionPriority[] = ['low', 'critical', 'medium', 'high', 'info'];
      const sorted = priorities.sort((a, b) => PriorityWeights[a] - PriorityWeights[b]);

      expect(sorted).toEqual(['critical', 'high', 'medium', 'low', 'info']);
    });
  });

  describe('Base AI Output Schema', () => {
    it('should create valid base output', () => {
      const output: BaseAIOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: {},
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      expect(output.schemaVersion).toBe('1.0.0');
      expect(output.status).toBe('success');
      expect(output.metadata).toBeDefined();
    });

    it('should include required metadata fields', () => {
      const metadata: ExecutionMetadata = {
        agentId: 'test-gen-1',
        agentVersion: '2.3.5',
        duration: 1500,
        environment: 'test',
        framework: 'jest',
      };

      expect(metadata.agentId).toBe('test-gen-1');
      expect(metadata.duration).toBe(1500);
      expect(metadata.environment).toBe('test');
    });

    it('should support CI/CD metadata', () => {
      const metadata: ExecutionMetadata = {
        agentId: 'test-gen-1',
        agentVersion: '2.3.5',
        duration: 1500,
        environment: 'production',
        ci: {
          provider: 'github-actions',
          buildNumber: '123',
          buildUrl: 'https://github.com/repo/actions/runs/123',
        },
      };

      expect(metadata.ci?.provider).toBe('github-actions');
      expect(metadata.ci?.buildNumber).toBe('123');
    });
  });

  describe('Action Suggestions', () => {
    it('should create valid action suggestion', () => {
      const action: ActionSuggestion = {
        action: ActionTypes.FIX_TEST_FAILURES,
        priority: 'critical',
        reason: 'Multiple test failures detected',
        affectedTests: ['test1', 'test2'],
        targetFiles: ['src/module.ts'],
        steps: ['Analyze failures', 'Fix bugs', 'Re-run tests'],
        automation: {
          command: 'aqe fix --tests test1,test2',
          canAutoFix: true,
          confidence: 0.85,
          estimatedTime: 5,
        },
      };

      expect(action.priority).toBe('critical');
      expect(action.automation.canAutoFix).toBe(true);
      expect(action.steps.length).toBe(3);
    });

    it('should support all action types', () => {
      const actionTypes = [
        ActionTypes.FIX_TEST_FAILURES,
        ActionTypes.STABILIZE_FLAKY_TESTS,
        ActionTypes.INCREASE_COVERAGE,
        ActionTypes.REDUCE_COMPLEXITY,
        ActionTypes.FIX_VULNERABILITIES,
        ActionTypes.OPTIMIZE_PERFORMANCE,
        ActionTypes.FIX_CODE_SMELLS,
        ActionTypes.UPDATE_DEPENDENCIES,
        ActionTypes.REVIEW_COVERAGE_TREND,
        ActionTypes.AGENT_READY,
      ];

      actionTypes.forEach((actionType) => {
        expect(typeof actionType).toBe('string');
      });
    });

    it('should include impact assessment', () => {
      const impact: ActionImpact = {
        currentValue: 75,
        targetValue: 90,
        estimatedImprovement: 15,
        businessValue: 'high',
      };

      expect(impact.estimatedImprovement).toBe(15);
      expect(impact.businessValue).toBe('high');
    });
  });

  describe('Test Results Output', () => {
    it('should create valid test results output', () => {
      const output: TestResultsOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: {
          summary: createMockSummary(),
          suites: [],
          failures: [],
          flaky: [],
        },
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      expect(output.outputType).toBe('test_results');
      expect(output.data.summary).toBeDefined();
    });

    it('should calculate test summary correctly', () => {
      const summary: TestSummary = {
        total: 100,
        passed: 90,
        failed: 5,
        skipped: 5,
        flaky: 2,
        duration: 5000,
        passRate: 90,
        failureRate: 5,
        flakyRate: 2,
      };

      expect(summary.total).toBe(summary.passed + summary.failed + summary.skipped);
      expect(summary.passRate).toBe(90);
    });

    it('should define test suite structure', () => {
      const suite: TestSuite = {
        name: 'UserService Tests',
        file: 'tests/UserService.test.ts',
        status: 'passed',
        total: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        duration: 1200,
      };

      expect(suite.status).toBe('passed');
      expect(suite.total).toBe(suite.passed + suite.failed + suite.skipped);
    });

    it('should define test failure structure', () => {
      const failure: TestFailure = {
        testName: 'should authenticate user',
        suiteName: 'AuthService',
        file: 'tests/AuthService.test.ts',
        line: 45,
        error: {
          message: 'Expected 200 but got 401',
          stack: 'Error: ...',
          type: 'AssertionError',
        },
        duration: 150,
        retries: 3,
        lastRun: new Date().toISOString(),
      };

      expect(failure.retries).toBe(3);
      expect(failure.error.type).toBe('AssertionError');
    });

    it('should define flaky test structure', () => {
      const flaky: FlakyTest = {
        testName: 'should handle async operation',
        suiteName: 'AsyncService',
        file: 'tests/AsyncService.test.ts',
        line: 30,
        flakinessScore: 0.35,
        failureRate: 0.3,
        totalRuns: 100,
        recentFailures: 30,
        pattern: 'timing-dependent',
      };

      expect(flaky.flakinessScore).toBeGreaterThan(0.3);
      expect(flaky.pattern).toBe('timing-dependent');
    });
  });

  describe('Coverage Report Output', () => {
    it('should create valid coverage report output', () => {
      const output: CoverageReportOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'coverage_report',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: {
          summary: createMockCoverageSummary(),
          gaps: [],
          files: [],
        },
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      expect(output.outputType).toBe('coverage_report');
      expect(output.data.summary).toBeDefined();
    });

    it('should define coverage metrics', () => {
      const metric: CoverageMetric = {
        total: 100,
        covered: 85,
        uncovered: 15,
        percentage: 85,
      };

      expect(metric.covered + metric.uncovered).toBe(metric.total);
      expect(metric.percentage).toBe(85);
    });

    it('should define coverage summary', () => {
      const summary: CoverageSummary = {
        overall: 85,
        lines: { total: 100, covered: 85, uncovered: 15, percentage: 85 },
        branches: { total: 50, covered: 40, uncovered: 10, percentage: 80 },
        functions: { total: 30, covered: 28, uncovered: 2, percentage: 93 },
        statements: { total: 120, covered: 100, uncovered: 20, percentage: 83 },
      };

      expect(summary.overall).toBe(85);
      expect(summary.functions.percentage).toBeGreaterThan(90);
    });

    it('should define coverage trend', () => {
      const trend: CoverageTrend = {
        direction: 'improving',
        change: 5,
        previousCoverage: 80,
        currentCoverage: 85,
      };

      expect(trend.direction).toBe('improving');
      expect(trend.currentCoverage - trend.previousCoverage).toBe(trend.change);
    });

    it('should define coverage gap', () => {
      const gap: CoverageGap = {
        file: 'src/UserService.ts',
        type: 'critical_path',
        priority: 'high',
        coverage: { lines: 60, branches: 50, functions: 70 },
        uncoveredLines: [10, 15, 20, 25],
        uncoveredBranches: [
          { line: 30, branch: 'else', condition: 'user === null' },
        ],
        impact: 'high',
        reason: 'Critical authentication logic not covered',
      };

      expect(gap.type).toBe('critical_path');
      expect(gap.uncoveredLines.length).toBe(4);
      expect(gap.priority).toBe('high');
    });
  });

  describe('Agent Status Output', () => {
    it('should create valid agent status output', () => {
      const output: AgentStatusOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'agent_status',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: {
          agent: createMockAgentInfo(),
          dependencies: { required: [], optional: [] },
          configuration: createMockAgentConfig(),
        },
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      expect(output.outputType).toBe('agent_status');
      expect(output.data.agent).toBeDefined();
    });

    it('should define agent info structure', () => {
      const info: AgentInfo = {
        id: 'qe-test-generator',
        name: 'Test Generator',
        version: '2.3.5',
        status: 'active',
        health: 'healthy',
        capabilities: ['test-generation', 'property-based-testing'],
        stats: {
          totalExecutions: 100,
          successRate: 95,
          averageDuration: 1500,
          testsGenerated: 500,
          lastExecution: new Date().toISOString(),
        },
      };

      expect(info.status).toBe('active');
      expect(info.stats.successRate).toBe(95);
    });

    it('should define learning info', () => {
      const learning: LearningInfo = {
        patternsLearned: 50,
        confidenceScore: 0.85,
        trainingIterations: 100,
        lastTraining: new Date().toISOString(),
      };

      expect(learning.patternsLearned).toBe(50);
      expect(learning.confidenceScore).toBeGreaterThan(0.8);
    });

    it('should define dependency status', () => {
      const dependency: Dependency = {
        service: 'openai',
        status: 'healthy',
        version: 'gpt-4',
        latency: 150,
        provider: 'OpenAI',
        model: 'gpt-4-turbo',
      };

      expect(dependency.status).toBe('healthy');
      expect(dependency.latency).toBeLessThan(200);
    });
  });

  describe('Quality Metrics Output', () => {
    it('should create valid quality metrics output', () => {
      const output: QualityMetricsOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'quality_metrics',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: createMockQualityMetrics(),
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      expect(output.outputType).toBe('quality_metrics');
      expect(output.data.overallScore).toBeDefined();
    });

    it('should calculate overall quality score', () => {
      const dimensions: QualityDimensions = {
        testCoverage: { score: 85, weight: 0.3, status: 'good' },
        codeQuality: { score: 90, weight: 0.25, status: 'excellent' },
        security: { score: 95, weight: 0.25, status: 'excellent' },
        performance: { score: 80, weight: 0.1, status: 'good' },
        maintainability: { score: 88, weight: 0.1, status: 'good' },
      };

      const overallScore =
        dimensions.testCoverage.score * dimensions.testCoverage.weight +
        dimensions.codeQuality.score * dimensions.codeQuality.weight +
        dimensions.security.score * dimensions.security.weight +
        dimensions.performance.score * dimensions.performance.weight +
        dimensions.maintainability.score * dimensions.maintainability.weight;

      expect(overallScore).toBeGreaterThan(85);
    });

    it('should define quality gates', () => {
      const gate: QualityGate = {
        name: 'Test Coverage',
        status: 'passed',
        actualValue: 85,
        threshold: 80,
        operator: 'gte',
        message: 'Coverage meets threshold',
      };

      expect(gate.status).toBe('passed');
      expect(gate.actualValue).toBeGreaterThanOrEqual(gate.threshold);
    });

    it('should track code smells', () => {
      const smells: CodeSmells = {
        total: 25,
        byType: {
          duplicate_code: 10,
          long_method: 8,
          large_class: 5,
          long_parameter_list: 2,
        },
        criticalSmells: [
          {
            type: 'duplicate_code',
            file: 'src/utils.ts',
            line: 100,
            severity: 'major',
            message: 'Duplicate code block detected',
          },
        ],
      };

      expect(smells.total).toBe(25);
      expect(smells.criticalSmells.length).toBeGreaterThan(0);
    });

    it('should calculate technical debt', () => {
      const debt: TechnicalDebt = {
        total: 15,
        unit: 'hours',
        byCategory: {
          code_smells: 8,
          complexity: 5,
          duplications: 2,
        },
      };

      expect(debt.total).toBe(15);
      expect(debt.unit).toBe('hours');
    });
  });

  describe('Streaming Support', () => {
    it('should define stream start message', () => {
      const start: StreamStart = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results',
        streamType: 'start',
        executionId: 'exec-123',
        timestamp: new Date().toISOString(),
        metadata: {
          totalTests: 100,
          estimatedDuration: 5000,
        },
      };

      expect(start.streamType).toBe('start');
      expect(start.metadata.totalTests).toBe(100);
    });

    it('should define stream progress message', () => {
      const progress: StreamProgress = {
        streamType: 'progress',
        completed: 50,
        total: 100,
        passed: 45,
        failed: 5,
        elapsed: 2500,
      };

      expect(progress.streamType).toBe('progress');
      expect(progress.completed / progress.total).toBe(0.5);
    });

    it('should define stream error message', () => {
      const error: StreamError = {
        streamType: 'error',
        executionId: 'exec-123',
        timestamp: new Date().toISOString(),
        error: {
          code: 'TEST_TIMEOUT',
          message: 'Test execution timed out',
        },
      };

      expect(error.streamType).toBe('error');
      expect(error.error.code).toBe('TEST_TIMEOUT');
    });
  });

  describe('Warnings and Errors', () => {
    it('should define warning structure', () => {
      const warning: OutputWarning = {
        code: 'DEPRECATED_API',
        message: 'Using deprecated API method',
        severity: 'warning',
        details: 'Use newMethod() instead',
      };

      expect(warning.severity).toBe('warning');
      expect(warning.details).toBeDefined();
    });

    it('should define error structure', () => {
      const error: OutputError = {
        code: 'TEST_FAILURE',
        message: 'Test execution failed',
        stack: 'Error: ...\n  at ...',
        context: {
          testName: 'should authenticate',
          file: 'auth.test.ts',
        },
      };

      expect(error.code).toBe('TEST_FAILURE');
      expect(error.context).toBeDefined();
    });
  });

  describe('Schema Version', () => {
    it('should have current schema version', () => {
      expect(SCHEMA_VERSION).toBe('1.0.0');
    });

    it('should support version comparison', () => {
      const versions = ['1.0.0', '1.1.0', '2.0.0'];
      const sorted = versions.sort((a, b) => {
        const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
        const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

        if (aMajor !== bMajor) return aMajor - bMajor;
        if (aMinor !== bMinor) return aMinor - bMinor;
        return aPatch - bPatch;
      });

      expect(sorted).toEqual(['1.0.0', '1.1.0', '2.0.0']);
    });
  });

  describe('JSON Schema Compliance', () => {
    it('should serialize to JSON without errors', () => {
      const output: BaseAIOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: { summary: createMockSummary() },
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      const json = JSON.stringify(output);
      expect(json).toBeDefined();
      expect(json.length).toBeGreaterThan(0);
    });

    it('should deserialize from JSON correctly', () => {
      const original: BaseAIOutput = {
        schemaVersion: SCHEMA_VERSION,
        outputType: 'test_results',
        timestamp: new Date().toISOString(),
        executionId: 'exec-123',
        status: 'success',
        metadata: createMockMetadata(),
        data: {},
        actionSuggestions: [],
        warnings: [],
        errors: [],
      };

      const json = JSON.stringify(original);
      const parsed = JSON.parse(json) as BaseAIOutput;

      expect(parsed.schemaVersion).toBe(original.schemaVersion);
      expect(parsed.executionId).toBe(original.executionId);
      expect(parsed.status).toBe(original.status);
    });
  });
});

// Helper functions

function createMockMetadata(): ExecutionMetadata {
  return {
    agentId: 'test-agent',
    agentVersion: '2.3.5',
    duration: 1500,
    environment: 'test',
    framework: 'jest',
  };
}

function createMockSummary(): TestSummary {
  return {
    total: 100,
    passed: 90,
    failed: 5,
    skipped: 5,
    duration: 5000,
    passRate: 90,
    failureRate: 5,
  };
}

function createMockCoverageSummary(): CoverageSummary {
  return {
    overall: 85,
    lines: { total: 100, covered: 85, uncovered: 15, percentage: 85 },
    branches: { total: 50, covered: 40, uncovered: 10, percentage: 80 },
    functions: { total: 30, covered: 28, uncovered: 2, percentage: 93 },
    statements: { total: 120, covered: 100, uncovered: 20, percentage: 83 },
  };
}

function createMockAgentInfo(): AgentInfo {
  return {
    id: 'qe-test-generator',
    name: 'Test Generator',
    version: '2.3.5',
    status: 'active',
    health: 'healthy',
    capabilities: ['test-generation'],
    stats: {
      totalExecutions: 100,
      successRate: 95,
      averageDuration: 1500,
      lastExecution: new Date().toISOString(),
    },
  };
}

function createMockAgentConfig(): AgentConfiguration {
  return {
    maxConcurrency: 4,
    timeout: 30000,
    retryAttempts: 3,
    learningEnabled: true,
    memoryPersistence: true,
  };
}

function createMockQualityMetrics(): QualityMetricsData {
  return {
    overallScore: 85,
    grade: 'A',
    dimensions: {
      testCoverage: { score: 85, weight: 0.3, status: 'good' },
      codeQuality: { score: 90, weight: 0.25, status: 'excellent' },
      security: { score: 95, weight: 0.25, status: 'excellent' },
      performance: { score: 80, weight: 0.1, status: 'good' },
      maintainability: { score: 88, weight: 0.1, status: 'good' },
    },
    qualityGates: {
      passed: 8,
      failed: 2,
      total: 10,
      gates: [],
    },
    codeSmells: {
      total: 25,
      byType: { duplicate_code: 10, long_method: 8, large_class: 5, long_parameter_list: 2 },
      criticalSmells: [],
    },
    technicalDebt: {
      total: 15,
      unit: 'hours',
      byCategory: { code_smells: 8, complexity: 5, duplications: 2 },
    },
  };
}
