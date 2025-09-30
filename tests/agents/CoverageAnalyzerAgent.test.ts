/**
 * CoverageAnalyzerAgent Test Suite - Agent System Priority #2
 * Tests O(log n) coverage optimization and gap detection
 */

import { CoverageAnalyzerAgent } from '../../src/agents/CoverageAnalyzerAgent';
import { EventBus } from '../../src/core/EventBus';
import { Task } from '../../src/core/Task';

describe('CoverageAnalyzerAgent', () => {
  let agent: CoverageAnalyzerAgent;
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
    agent = new CoverageAnalyzerAgent('coverage-analyzer-1', eventBus);
  });

  afterEach(async () => {
    if (agent.isRunning()) {
      await agent.stop();
    }
  });

  describe('initialization and capabilities', () => {
    it('should initialize with coverage analysis capabilities', () => {
      expect(agent.getType()).toBe('coverage-analyzer');
      expect(agent.hasCapability('coverage-analysis')).toBe(true);
      expect(agent.hasCapability('gap-detection')).toBe(true);
      expect(agent.hasCapability('sublinear-optimization')).toBe(true);
      expect(agent.hasCapability('critical-path-analysis')).toBe(true);
    });

    it('should start and be ready for coverage analysis', async () => {
      await agent.start();
      expect(agent.isRunning()).toBe(true);
      expect(agent.getStatus()).toBe('idle');
    });
  });

  describe('coverage analysis', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should analyze basic coverage data', async () => {
      const task = new Task('basic-coverage-analysis', 'analyze-coverage', {
        coverageData: {
          lines: { total: 100, covered: 80, percentage: 80 },
          branches: { total: 50, covered: 35, percentage: 70 },
          functions: { total: 20, covered: 18, percentage: 90 },
          statements: { total: 150, covered: 120, percentage: 80 }
        },
        thresholds: {
          lines: 85,
          branches: 75,
          functions: 90,
          statements: 85
        }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.analysis).toBeDefined();
      expect(result.result.analysis.overallCoverage).toBe(80);
      expect(result.result.analysis.meetsThresholds).toBe(false);
      expect(result.result.gaps).toBeDefined();
    });

    it('should identify specific coverage gaps', async () => {
      const task = new Task('gap-identification', 'analyze-coverage', {
        coverageData: generateDetailedCoverageData(),
        sourceFiles: [
          'src/user/UserService.js',
          'src/payment/PaymentProcessor.js',
          'src/utils/Validator.js'
        ]
      });

      const result = await agent.executeTask(task);

      expect(result.result.gaps).toBeDefined();
      expect(result.result.gaps.uncoveredLines).toBeInstanceOf(Array);
      expect(result.result.gaps.uncoveredBranches).toBeInstanceOf(Array);
      expect(result.result.gaps.prioritizedGaps).toBeDefined();
    });

    it('should perform O(log n) optimization for large codebases', async () => {
      const task = new Task('sublinear-coverage-analysis', 'analyze-coverage', {
        coverageData: generateLargeCoverageData(10000), // 10k lines
        optimizationTarget: 'sublinear',
        algorithm: 'binary-search-gaps'
      });

      const startTime = Date.now();
      const result = await agent.executeTask(task);
      const executionTime = Date.now() - startTime;

      expect(result.status).toBe('completed');
      expect(result.result.optimization).toBeDefined();
      expect(result.result.optimization.algorithm).toBe('O(log n)');
      expect(result.result.optimization.executionTime).toBeLessThan(5000);
      expect(executionTime).toBeLessThan(6000); // Should be fast
    });
  });

  describe('gap detection algorithms', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should detect critical path gaps', async () => {
      const task = new Task('critical-path-gaps', 'detect-gaps', {
        coverageData: generateCoverageWithCriticalPaths(),
        criticalPaths: [
          'src/payment/PaymentProcessor.js:processPayment',
          'src/auth/AuthService.js:validateToken',
          'src/db/DatabaseConnection.js:transaction'
        ]
      });

      const result = await agent.executeTask(task);

      expect(result.result.criticalPathGaps).toBeDefined();
      expect(result.result.criticalPathGaps.length).toBeGreaterThan(0);
      expect(result.result.riskAssessment).toBeDefined();
      expect(result.result.riskAssessment.highRiskGaps).toBeDefined();
    });

    it('should use binary search for efficient gap detection', async () => {
      const task = new Task('binary-search-gaps', 'detect-gaps', {
        coverageData: generateSortedCoverageData(1000),
        algorithm: 'binary-search',
        targetCoverage: 90
      });

      const result = await agent.executeTask(task);

      expect(result.result.algorithm).toBe('binary-search');
      expect(result.result.searchSteps).toBeLessThan(Math.log2(1000) + 1);
      expect(result.result.gapsFound).toBeDefined();
    });

    it('should implement matrix-based gap analysis', async () => {
      const task = new Task('matrix-gap-analysis', 'detect-gaps', {
        coverageMatrix: generateCoverageMatrix(100, 50), // 100 files, 50 tests
        algorithm: 'matrix-decomposition'
      });

      const result = await agent.executeTask(task);

      expect(result.result.matrixAnalysis).toBeDefined();
      expect(result.result.matrixAnalysis.rank).toBeDefined();
      expect(result.result.matrixAnalysis.nullSpace).toBeDefined();
      expect(result.result.recommendedTests).toBeDefined();
    });
  });

  describe('optimization strategies', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should optimize test selection for maximum coverage gain', async () => {
      const task = new Task('optimize-test-selection', 'optimize-coverage', {
        existingTests: generateTestSuite(50),
        uncoveredCode: generateUncoveredSegments(200),
        budget: 10, // Can only add 10 more tests
        strategy: 'maximum-coverage-gain'
      });

      const result = await agent.executeTask(task);

      expect(result.result.selectedTests).toBeDefined();
      expect(result.result.selectedTests.length).toBeLessThanOrEqual(10);
      expect(result.result.expectedCoverageGain).toBeGreaterThan(0);
      expect(result.result.optimization.algorithm).toBe('greedy-sublinear');
    });

    it('should minimize test execution time while maintaining coverage', async () => {
      const task = new Task('minimize-execution-time', 'optimize-coverage', {
        testSuite: generateTestSuiteWithTiming(100),
        minCoverageThreshold: 85,
        strategy: 'minimize-time'
      });

      const result = await agent.executeTask(task);

      expect(result.result.optimizedSuite).toBeDefined();
      expect(result.result.totalExecutionTime).toBeLessThan(
        calculateTotalTime(generateTestSuiteWithTiming(100))
      );
      expect(result.result.maintainedCoverage).toBeGreaterThanOrEqual(85);
    });

    it('should balance coverage vs execution time trade-offs', async () => {
      const task = new Task('balance-tradeoffs', 'optimize-coverage', {
        testSuite: generateTestSuiteWithTiming(100),
        weights: { coverage: 0.7, time: 0.3 },
        strategy: 'pareto-optimal'
      });

      const result = await agent.executeTask(task);

      expect(result.result.paretoFront).toBeDefined();
      expect(result.result.recommendedSolution).toBeDefined();
      expect(result.result.tradeoffAnalysis).toBeDefined();
    });
  });

  describe('real-time monitoring', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should provide real-time coverage updates', async () => {
      const task = new Task('realtime-monitoring', 'monitor-coverage', {
        watchMode: true,
        updateInterval: 100, // 100ms updates
        duration: 1000 // Monitor for 1 second
      });

      const updates: any[] = [];
      eventBus.on('coverage:update', (data) => updates.push(data));

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(updates.length).toBeGreaterThan(0);
      expect(result.result.monitoringSession).toBeDefined();
    });

    it('should detect coverage regressions in real-time', async () => {
      const task = new Task('regression-detection', 'monitor-coverage', {
        baseline: { coverage: 85, timestamp: Date.now() - 1000 },
        threshold: 2, // 2% regression threshold
        realtime: true
      });

      // Simulate coverage drop
      setTimeout(() => {
        eventBus.emit('test:completed', { coverage: 82 });
      }, 100);

      const result = await agent.executeTask(task);

      expect(result.result.regressionDetected).toBe(true);
      expect(result.result.regressionSeverity).toBe('medium');
    });
  });

  describe('reporting and visualization', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should generate comprehensive coverage reports', async () => {
      const task = new Task('generate-report', 'generate-report', {
        coverageData: generateDetailedCoverageData(),
        format: 'comprehensive',
        includeCharts: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.report).toBeDefined();
      expect(result.result.report.summary).toBeDefined();
      expect(result.result.report.fileDetails).toBeDefined();
      expect(result.result.report.trends).toBeDefined();
      expect(result.result.visualizations).toBeDefined();
    });

    it('should create coverage heat maps', async () => {
      const task = new Task('generate-heatmap', 'generate-visualization', {
        coverageData: generateDetailedCoverageData(),
        visualization: 'heatmap',
        granularity: 'function'
      });

      const result = await agent.executeTask(task);

      expect(result.result.heatmap).toBeDefined();
      expect(result.result.heatmap.data).toBeDefined();
      expect(result.result.heatmap.colorScale).toBeDefined();
    });

    it('should track coverage trends over time', async () => {
      const task = new Task('track-trends', 'analyze-trends', {
        historicalData: generateHistoricalCoverageData(30), // 30 days
        timeframe: 'weekly',
        predictions: true
      });

      const result = await agent.executeTask(task);

      expect(result.result.trends).toBeDefined();
      expect(result.result.trends.direction).toMatch(/increasing|decreasing|stable/);
      expect(result.result.predictions).toBeDefined();
    });
  });

  describe('integration with external tools', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should integrate with Istanbul coverage data', async () => {
      const task = new Task('istanbul-integration', 'import-coverage', {
        source: 'istanbul',
        data: generateIstanbulCoverageData()
      });

      const result = await agent.executeTask(task);

      expect(result.result.imported).toBe(true);
      expect(result.result.normalizedData).toBeDefined();
      expect(result.result.analysis).toBeDefined();
    });

    it('should integrate with Jest coverage reports', async () => {
      const task = new Task('jest-integration', 'import-coverage', {
        source: 'jest',
        reportPath: './coverage/lcov.info'
      });

      const result = await agent.executeTask(task);

      expect(result.result.imported).toBe(true);
      expect(result.result.testFramework).toBe('jest');
    });

    it('should export to external monitoring systems', async () => {
      const task = new Task('export-metrics', 'export-coverage', {
        destination: 'prometheus',
        metrics: ['coverage_percentage', 'gap_count', 'critical_gaps'],
        format: 'prometheus'
      });

      const result = await agent.executeTask(task);

      expect(result.result.exported).toBe(true);
      expect(result.result.metricsFormat).toBe('prometheus');
      expect(result.result.metricsData).toBeDefined();
    });
  });

  describe('error handling and edge cases', () => {
    beforeEach(async () => {
      await agent.start();
    });

    it('should handle malformed coverage data', async () => {
      const task = new Task('malformed-data', 'analyze-coverage', {
        coverageData: { invalid: 'data' }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('malformed');
    });

    it('should handle empty coverage data gracefully', async () => {
      const task = new Task('empty-data', 'analyze-coverage', {
        coverageData: { lines: { total: 0, covered: 0 } }
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('completed');
      expect(result.result.analysis.overallCoverage).toBe(0);
      expect(result.result.recommendations).toContain('No tests found');
    });
  });
});

// Helper functions for generating test data
function generateDetailedCoverageData() {
  return {
    lines: { total: 1000, covered: 850, percentage: 85 },
    branches: { total: 500, covered: 375, percentage: 75 },
    functions: { total: 100, covered: 90, percentage: 90 },
    statements: { total: 1200, covered: 960, percentage: 80 },
    files: {
      'src/user/UserService.js': { lines: 80, branches: 60, functions: 90 },
      'src/payment/PaymentProcessor.js': { lines: 70, branches: 65, functions: 85 },
      'src/utils/Validator.js': { lines: 95, branches: 90, functions: 100 }
    }
  };
}

function generateLargeCoverageData(lineCount: number) {
  return {
    lines: { total: lineCount, covered: Math.floor(lineCount * 0.85) },
    branches: { total: Math.floor(lineCount * 0.3), covered: Math.floor(lineCount * 0.25) },
    functions: { total: Math.floor(lineCount * 0.1), covered: Math.floor(lineCount * 0.09) },
    statements: { total: Math.floor(lineCount * 1.2), covered: Math.floor(lineCount * 1.0) }
  };
}

function generateCoverageWithCriticalPaths() {
  return {
    files: {
      'src/payment/PaymentProcessor.js': {
        functions: {
          'processPayment': { covered: false, critical: true },
          'validateCard': { covered: true, critical: true },
          'formatAmount': { covered: false, critical: false }
        }
      },
      'src/auth/AuthService.js': {
        functions: {
          'validateToken': { covered: false, critical: true },
          'refreshToken': { covered: true, critical: true }
        }
      }
    }
  };
}

function generateCoverageMatrix(fileCount: number, testCount: number) {
  const matrix = Array(fileCount).fill(null).map(() =>
    Array(testCount).fill(0).map(() => Math.random() > 0.7 ? 1 : 0)
  );
  return matrix;
}

function generateTestSuite(testCount: number) {
  return Array.from({ length: testCount }, (_, i) => ({
    id: `test-${i}`,
    name: `Test ${i}`,
    coverage: Math.random() * 20 + 5, // 5-25% coverage per test
    executionTime: Math.random() * 1000 + 100 // 100-1100ms
  }));
}

function generateTestSuiteWithTiming(testCount: number) {
  return Array.from({ length: testCount }, (_, i) => ({
    id: `test-${i}`,
    name: `Test ${i}`,
    coverage: Math.random() * 15 + 5,
    executionTime: Math.random() * 2000 + 50,
    priority: Math.floor(Math.random() * 3) + 1
  }));
}

function calculateTotalTime(testSuite: any[]) {
  return testSuite.reduce((total, test) => total + test.executionTime, 0);
}

function generateUncoveredSegments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    file: `src/file${Math.floor(i / 10)}.js`,
    line: (i % 100) + 1,
    type: Math.random() > 0.5 ? 'line' : 'branch',
    complexity: Math.floor(Math.random() * 5) + 1
  }));
}

function generateHistoricalCoverageData(days: number) {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000),
    coverage: 70 + Math.random() * 20 + i * 0.5, // Gradually improving
    tests: 100 + i * 2,
    files: 50 + Math.floor(i / 5)
  }));
}

function generateIstanbulCoverageData() {
  return {
    version: '1.0.0',
    summary: {
      lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
      functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
      statements: { total: 120, covered: 100, skipped: 0, pct: 83.33 },
      branches: { total: 50, covered: 40, skipped: 0, pct: 80 }
    }
  };
}

function generateSortedCoverageData(size: number) {
  return Array.from({ length: size }, (_, i) => ({
    line: i + 1,
    covered: Math.random() > 0.15, // 85% coverage
    file: `src/file${Math.floor(i / 100)}.js`
  })).sort((a, b) => a.line - b.line);
}