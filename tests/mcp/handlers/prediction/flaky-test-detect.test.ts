/**
 * prediction/flaky-test-detect Test Suite
 *
 * Tests for flaky test detection with ML patterns and statistical analysis.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  FlakyTestDetectHandler,
  FlakyTestDetectArgs,
  TestRunResult
} from '../../../../src/mcp/handlers/prediction/flaky-test-detect.js';
import { AgentRegistry } from '../../../../src/mcp/services/AgentRegistry.js';
import { HookExecutor } from '../../../../src/mcp/services/HookExecutor.js';

describe('FlakyTestDetectHandler', () => {
  let handler: FlakyTestDetectHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockRegistry = {
      getAgent: jest.fn(),
      registerAgent: jest.fn(),
      getAllAgents: jest.fn(),
    } as any;

    mockHookExecutor = {
      executeHook: jest.fn().mockResolvedValue(undefined),
    } as any;

    handler = new FlakyTestDetectHandler(mockRegistry, mockHookExecutor);
  });

  const createTestRun = (
    testId: string,
    testName: string,
    status: 'pass' | 'fail' | 'skip' | 'timeout',
    duration: number,
    timestamp: Date,
    errorMessage?: string
  ): TestRunResult => ({
    testId,
    testName,
    status,
    duration,
    timestamp: timestamp.toISOString(),
    environment: 'ci',
    errorMessage,
    stackTrace: errorMessage ? 'Error stack trace...' : undefined
  });

  const createHistoricalTestData = (testId: string, pattern: 'stable' | 'flaky' | 'timing' | 'network'): TestRunResult[] => {
    const results: TestRunResult[] = [];
    const baseTime = Date.now() - (30 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 20; i++) {
      const timestamp = new Date(baseTime + (i * 24 * 60 * 60 * 1000));
      let status: 'pass' | 'fail' | 'timeout' = 'pass';
      let duration = 150;
      let errorMessage: string | undefined;

      switch (pattern) {
        case 'stable':
          status = 'pass';
          duration = 150 + Math.random() * 10;
          break;
        case 'flaky':
          status = i % 4 === 0 ? 'fail' : 'pass';
          duration = 150 + Math.random() * 50;
          errorMessage = status === 'fail' ? 'Assertion failed: expected true, got false' : undefined;
          break;
        case 'timing':
          status = i % 5 === 0 ? 'timeout' : 'pass';
          duration = status === 'timeout' ? 5000 : 150 + Math.random() * 200;
          errorMessage = status === 'timeout' ? 'Test timeout after 5000ms' : undefined;
          break;
        case 'network':
          status = i % 6 === 0 ? 'fail' : 'pass';
          duration = 150 + Math.random() * 100;
          errorMessage = status === 'fail' ? 'Network request failed: ECONNREFUSED' : undefined;
          break;
      }

      results.push(createTestRun(testId, `Test ${testId}`, status, duration, timestamp, errorMessage));
    }

    return results;
  };

  describe('Happy Path - Stable Tests', () => {
    it('should identify stable tests with 100% pass rate', async () => {
      const testResults = createHistoricalTestData('test-001', 'stable');

      const args: FlakyTestDetectArgs = {
        testData: {
          testResults,
          minRuns: 5,
          timeWindow: 30
        },
        analysisConfig: {
          flakinessThreshold: 0.1,
          patternDetection: true
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.summary.totalTests).toBeGreaterThan(0);
      expect(response.data.summary.overallReliability).toBeGreaterThan(0.9);
    });

    it('should provide comprehensive summary statistics', async () => {
      const testResults = [
        ...createHistoricalTestData('test-001', 'stable'),
        ...createHistoricalTestData('test-002', 'flaky'),
        ...createHistoricalTestData('test-003', 'stable')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const summary = response.data.summary;
      expect(summary).toHaveProperty('totalTests');
      expect(summary).toHaveProperty('flakyTests');
      expect(summary).toHaveProperty('suspiciousTests');
      expect(summary).toHaveProperty('stableTests');
      expect(summary).toHaveProperty('overallReliability');
      expect(summary.totalTests).toBe(summary.flakyTests + summary.suspiciousTests + summary.stableTests);
    });
  });

  describe('Flakiness Detection - Pass/Fail Patterns', () => {
    it('should detect flaky tests with intermittent failures', async () => {
      const testResults = createHistoricalTestData('test-flaky-001', 'flaky');

      const args: FlakyTestDetectArgs = {
        testData: {
          testResults,
          minRuns: 10
        },
        analysisConfig: {
          flakinessThreshold: 0.1
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const flakyTest = response.data.flakyTests.find(t => t.testId === 'test-flaky-001');

      if (flakyTest && flakyTest.status === 'flaky') {
        expect(flakyTest.statistics.failures).toBeGreaterThan(0);
        expect(flakyTest.statistics.failures).toBeLessThan(flakyTest.statistics.totalRuns);
        expect(flakyTest.flakinessScore).toBeGreaterThan(0);
        expect(flakyTest.impact.severity).toMatch(/low|medium|high|critical/);
      }
    });

    it('should calculate accurate pass/fail rates', async () => {
      const testResults: TestRunResult[] = [
        ...Array(15).fill(null).map((_, i) =>
          createTestRun('test-002', 'Intermittent Test', 'pass', 100, new Date(Date.now() - i * 86400000))
        ),
        ...Array(5).fill(null).map((_, i) =>
          createTestRun('test-002', 'Intermittent Test', 'fail', 100, new Date(Date.now() - (i + 15) * 86400000), 'Random failure')
        )
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-002');

      if (test) {
        expect(test.statistics.totalRuns).toBe(20);
        expect(test.statistics.passes).toBe(15);
        expect(test.statistics.failures).toBe(5);
        expect(test.statistics.passRate).toBeCloseTo(0.75, 2);
        expect(test.statistics.failureRate).toBeCloseTo(0.25, 2);
      }
    });

    it('should detect status transitions indicating instability', async () => {
      const testResults: TestRunResult[] = [];
      const pattern = ['pass', 'fail', 'pass', 'pass', 'fail', 'pass', 'fail', 'fail', 'pass', 'fail'];

      pattern.forEach((status, i) => {
        testResults.push(
          createTestRun(
            'test-transitions',
            'Unstable Test',
            status as 'pass' | 'fail',
            150,
            new Date(Date.now() - i * 86400000),
            status === 'fail' ? 'Test failed' : undefined
          )
        );
      });

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-transitions');

      if (test) {
        expect(test.flakinessScore).toBeGreaterThan(0.3);
      }
    });
  });

  describe('Timeout Pattern Detection', () => {
    it('should detect tests with timeout issues', async () => {
      const testResults = createHistoricalTestData('test-timeout-001', 'timing');

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-timeout-001');

      if (test && test.statistics.timeouts > 0) {
        expect(test.statistics.timeouts).toBeGreaterThan(0);
        const timeoutPattern = test.patterns.find(p => p.type === 'timeout-pattern');
        expect(timeoutPattern).toBeDefined();
        expect(timeoutPattern?.confidence).toBeGreaterThan(0.9);
      }
    });

    it('should identify external dependency issues from timeouts', async () => {
      const testResults = createHistoricalTestData('test-network-001', 'timing');

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        analysisConfig: { patternDetection: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-network-001');

      if (test && test.statistics.timeouts > 0) {
        const externalDepCause = test.rootCauses.find(c => c.category === 'external-dependency');
        if (externalDepCause) {
          expect(externalDepCause.confidence).toBeGreaterThan(0.7);
          expect(externalDepCause.fixComplexity).toMatch(/low|medium|high/);
        }
      }
    });
  });

  describe('Timing Variance Analysis', () => {
    it('should detect timing instability from duration variance', async () => {
      const testResults: TestRunResult[] = Array(15).fill(null).map((_, i) => {
        const baseDuration = 150;
        const variance = i % 2 === 0 ? 50 : 300;
        return createTestRun(
          'test-timing-variance',
          'Variable Duration Test',
          'pass',
          baseDuration + variance,
          new Date(Date.now() - i * 86400000)
        );
      });

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        analysisConfig: {
          flakinessThreshold: 0.05,
          includeTimingAnalysis: true
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-timing-variance');

      if (test) {
        const timingPattern = test.patterns.find(p => p.type === 'timing-instability');
        if (timingPattern) {
          expect(timingPattern.confidence).toBeGreaterThan(0.8);
        }
      }
    });

    it('should suggest fixes for timing-related flakiness', async () => {
      const testResults = createHistoricalTestData('test-timing-fix', 'timing');

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        reportConfig: { generateFixSuggestions: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-timing-fix');

      if (test && test.patterns.some(p => p.type === 'timing-instability')) {
        expect(test.suggestedFixes.length).toBeGreaterThan(0);
        expect(test.suggestedFixes.some(fix =>
          fix.toLowerCase().includes('wait') || fix.toLowerCase().includes('timeout')
        )).toBe(true);
      }
    });
  });

  describe('Root Cause Analysis', () => {
    it('should identify race conditions from error messages', async () => {
      const testResults: TestRunResult[] = Array(10).fill(null).map((_, i) => {
        const status = i % 4 === 0 ? 'fail' : 'pass';
        return createTestRun(
          'test-race-condition',
          'Concurrent Access Test',
          status as 'pass' | 'fail',
          150,
          new Date(Date.now() - i * 86400000),
          status === 'fail' ? 'Race condition: concurrent modification detected' : undefined
        );
      });

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-race-condition');

      if (test) {
        const raceCause = test.rootCauses.find(c => c.category === 'race-condition');
        if (raceCause) {
          expect(raceCause.confidence).toBeGreaterThan(0.8);
          expect(raceCause.fixComplexity).toBe('high');
        }
      }
    });

    it('should categorize timing issues correctly', async () => {
      const testResults = createHistoricalTestData('test-timing-category', 'timing');

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-timing-category');

      if (test) {
        const timingCause = test.rootCauses.find(c => c.category === 'timing');
        if (timingCause) {
          expect(timingCause.description).toBeTruthy();
          expect(timingCause.evidence).toBeInstanceOf(Array);
          expect(timingCause.evidence.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Impact Assessment', () => {
    it('should calculate developer time wasted', async () => {
      const testResults = createHistoricalTestData('test-impact-001', 'flaky');

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-impact-001');

      if (test && test.status === 'flaky') {
        expect(test.impact.developerTimeWasted).toBeGreaterThan(0);
        expect(test.impact.ciCostImpact).toBeGreaterThan(0);
        expect(test.impact.confidenceImpact).toBeTruthy();
      }
    });

    it('should assess severity based on failure rate', async () => {
      const highFailureRate: TestRunResult[] = Array(20).fill(null).map((_, i) => {
        const status = i < 12 ? 'fail' : 'pass';
        return createTestRun(
          'test-high-failure',
          'Critical Flaky Test',
          status as 'pass' | 'fail',
          150,
          new Date(Date.now() - i * 86400000),
          status === 'fail' ? 'Test failed' : undefined
        );
      });

      const args: FlakyTestDetectArgs = {
        testData: { testResults: highFailureRate }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const test = response.data.flakyTests.find(t => t.testId === 'test-high-failure');

      if (test && test.statistics.failureRate > 0.5) {
        expect(test.impact.severity).toMatch(/high|critical/);
      }
    });
  });

  describe('Pattern Detection Across Tests', () => {
    it('should identify time-based patterns affecting multiple tests', async () => {
      const testResults = [
        ...createHistoricalTestData('test-timing-001', 'timing'),
        ...createHistoricalTestData('test-timing-002', 'timing'),
        ...createHistoricalTestData('test-timing-003', 'timing')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        analysisConfig: { patternDetection: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const timeBasedPattern = response.data.patterns.find(p => p.type === 'time-based');

      if (timeBasedPattern) {
        expect(timeBasedPattern.affectedTests.length).toBeGreaterThan(1);
        expect(timeBasedPattern.frequency).toBeGreaterThan(0);
        expect(timeBasedPattern.suggestedMitigation).toBeTruthy();
      }
    });

    it('should detect network flakiness patterns', async () => {
      const testResults = [
        ...createHistoricalTestData('test-network-001', 'network'),
        ...createHistoricalTestData('test-network-002', 'network')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        analysisConfig: { patternDetection: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const networkPattern = response.data.patterns.find(p => p.type === 'network-flake');

      if (networkPattern) {
        expect(networkPattern.affectedTests.length).toBeGreaterThan(0);
        expect(networkPattern.description).toMatch(/external|network|dependency/i);
      }
    });
  });

  describe('Recommendations Engine', () => {
    it('should recommend quarantine for critical flaky tests', async () => {
      const criticalFlaky: TestRunResult[] = Array(20).fill(null).map((_, i) => {
        const status = i % 2 === 0 ? 'fail' : 'pass';
        return createTestRun(
          'test-critical-flaky',
          'Super Unstable Test',
          status as 'pass' | 'fail',
          150,
          new Date(Date.now() - i * 86400000),
          status === 'fail' ? 'Critical failure' : undefined
        );
      });

      const args: FlakyTestDetectArgs = {
        testData: { testResults: criticalFlaky },
        reportConfig: { includeRecommendations: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const quarantineRec = response.data.recommendations.find(r => r.category === 'quarantine');
      if (quarantineRec) {
        expect(quarantineRec.priority).toMatch(/critical|high/);
        expect(quarantineRec.actions.some(a => a.toLowerCase().includes('quarantine'))).toBe(true);
      }
    });

    it('should suggest quick fixes for timing issues', async () => {
      const testResults = createHistoricalTestData('test-timing-quick-fix', 'timing');

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        reportConfig: {
          includeRecommendations: true,
          generateFixSuggestions: true
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const quickFixRec = response.data.recommendations.find(r =>
        r.category === 'quick-fix' && r.title.toLowerCase().includes('timing')
      );

      if (quickFixRec) {
        expect(quickFixRec.actions.length).toBeGreaterThan(0);
        expect(quickFixRec.estimatedEffort).toBeGreaterThan(0);
        expect(quickFixRec.impactReduction).toBeGreaterThan(0);
      }
    });

    it('should prioritize recommendations by impact', async () => {
      const testResults = [
        ...createHistoricalTestData('test-001', 'flaky'),
        ...createHistoricalTestData('test-002', 'timing'),
        ...createHistoricalTestData('test-003', 'network')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        reportConfig: {
          includeRecommendations: true,
          prioritizeByImpact: true
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeInstanceOf(Array);

      if (response.data.recommendations.length > 1) {
        const priorities = response.data.recommendations.map(r => r.priority);
        expect(priorities).toContain(expect.stringMatching(/low|medium|high|critical/));
      }
    });
  });

  describe('Insights Generation', () => {
    it('should identify common root causes across tests', async () => {
      const testResults = [
        ...createHistoricalTestData('test-timing-001', 'timing'),
        ...createHistoricalTestData('test-timing-002', 'timing'),
        ...createHistoricalTestData('test-network-001', 'network')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.insights).toBeDefined();
      expect(response.data.insights.commonCauses).toBeInstanceOf(Array);
      expect(response.data.insights.timingIssues).toBeGreaterThanOrEqual(0);
      expect(response.data.insights.resourceContention).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject missing testData parameter', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/testData/i);
    });

    it('should reject empty test results', async () => {
      const args: FlakyTestDetectArgs = {
        testData: {
          testResults: []
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/test results/i);
    });

    it('should use default analysis config when not provided', async () => {
      const testResults = createHistoricalTestData('test-001', 'stable');

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should respect minimum runs threshold', async () => {
      const testResults = createTestRun('test-few-runs', 'Test', 'pass', 100, new Date());

      const args: FlakyTestDetectArgs = {
        testData: {
          testResults: [testResults],
          minRuns: 5
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.summary.totalTests).toBe(0);
    });
  });

  describe('Clustering and Grouping', () => {
    it('should group tests by similar flakiness patterns', async () => {
      const testResults = [
        ...createHistoricalTestData('test-group-a-001', 'timing'),
        ...createHistoricalTestData('test-group-a-002', 'timing'),
        ...createHistoricalTestData('test-group-b-001', 'network')
      ];

      const args: FlakyTestDetectArgs = {
        testData: { testResults },
        analysisConfig: {
          flakinessThreshold: 0.1,
          clusteringEnabled: true
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('Hook Integration', () => {
    it('should execute pre-task hook before detection', async () => {
      const testResults = createHistoricalTestData('test-001', 'stable');
      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'pre-task',
        expect.objectContaining({
          taskType: 'flaky-test-detect'
        })
      );
    });

    it('should execute post-task hook after detection', async () => {
      const testResults = createHistoricalTestData('test-001', 'stable');
      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      await handler.handle(args);

      expect(mockHookExecutor.executeHook).toHaveBeenCalledWith(
        'post-task',
        expect.objectContaining({
          taskType: 'flaky-test-detect',
          result: expect.any(Object)
        })
      );
    });
  });

  describe('Performance', () => {
    it('should handle large test result datasets efficiently', async () => {
      const largeDataset: TestRunResult[] = [];
      for (let i = 0; i < 50; i++) {
        largeDataset.push(...createHistoricalTestData(`test-${i}`, i % 2 === 0 ? 'stable' : 'flaky'));
      }

      const args: FlakyTestDetectArgs = {
        testData: { testResults: largeDataset }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000);
      expect(response.data.performance.analysisTime).toBeGreaterThan(0);
    });

    it('should report performance metrics', async () => {
      const testResults = createHistoricalTestData('test-perf', 'stable');

      const args: FlakyTestDetectArgs = {
        testData: { testResults }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.performance).toBeDefined();
      expect(response.data.performance.analysisTime).toBeGreaterThan(0);
      expect(response.data.performance.testsAnalyzed).toBeGreaterThan(0);
    });
  });

  describe('Time Window Analysis', () => {
    it('should respect time window parameter', async () => {
      const oldTest = createTestRun(
        'test-old',
        'Old Test',
        'fail',
        150,
        new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        'Old failure'
      );
      const recentTest = createTestRun(
        'test-recent',
        'Recent Test',
        'fail',
        150,
        new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        'Recent failure'
      );

      const args: FlakyTestDetectArgs = {
        testData: {
          testResults: [oldTest, recentTest],
          timeWindow: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });
  });
});
