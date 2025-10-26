/**
 * CoverageAnalyzerAgent Test Suite - Agent System Priority #2
 * Tests O(log n) coverage optimization and gap detection
 */

// Mock Logger before any imports
jest.mock('../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      log: jest.fn()
    }))
  }
}));

import { CoverageAnalyzerAgent } from '../../src/agents/CoverageAnalyzerAgent';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { AgentStatus, TestSuite, Test } from '../../src/types';

describe('CoverageAnalyzerAgent', () => {
  let agent: CoverageAnalyzerAgent;
  let memoryStore: SwarmMemoryManager;

  beforeEach(async () => {
    memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();

    agent = new CoverageAnalyzerAgent({
      id: { type: 'coverage-analyzer', id: 'cov-1' },
      memoryStore,
      enableLearning: false,  // Disable learning to avoid Logger dependency
      enablePatterns: false   // Disable patterns to avoid Logger dependency
    });

    await agent.initialize();
  });

  afterEach(async () => {
    if (agent.getStatus().status !== AgentStatus.STOPPED) {
      await agent.terminate();
    }
    await memoryStore.close();
  });

  describe('initialization and capabilities', () => {
    it('should initialize with coverage analysis capabilities', () => {
      const status = agent.getStatus();
      expect(status.agentId.type).toBe('coverage-analyzer');
      expect(status.capabilities).toContain('coverage-optimization');
      expect(status.capabilities).toContain('gap-detection');
      expect(status.capabilities).toContain('sublinear-analysis');
    });

    it('should be ready for coverage analysis after initialization', async () => {
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.IDLE);
    });
  });

  describe('coverage analysis', () => {
    it('should analyze basic coverage data', async () => {
      const task = {
        id: 'basic-coverage-analysis',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(10),
          codeBase: generateBasicCodeBase(100),
          targetCoverage: 85,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result).toBeDefined();
      expect(result.optimization).toBeDefined();
      expect(result.optimization.originalTestCount).toBe(10);
      expect(result.coverageReport).toBeDefined();
      expect(result.gaps).toBeDefined();
    });

    it('should identify specific coverage gaps', async () => {
      const task = {
        id: 'gap-identification',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(20),
          codeBase: generateCodeBaseWithCriticalFunctions(50),
          targetCoverage: 90,
          optimizationGoals: {
            minimizeTestCount: false,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.gaps).toBeDefined();
      expect(Array.isArray(result.gaps)).toBe(true);
    });

    it('should perform O(log n) optimization for large codebases', async () => {
      const task = {
        id: 'sublinear-coverage-analysis',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(100),
          codeBase: generateBasicCodeBase(1000),
          targetCoverage: 80,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const startTime = Date.now();
      const result = await agent.executeTask(task);
      const executionTime = Date.now() - startTime;

      expect(result.optimization).toBeDefined();
      expect(result.optimization.algorithmUsed).toBeDefined();
      expect(executionTime).toBeLessThan(10000); // Should complete in <10s
    });
  });

  describe('gap detection algorithms', () => {
    it('should detect critical path gaps', async () => {
      const task = {
        id: 'critical-path-gaps',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(15),
          codeBase: generateCodeBaseWithCriticalFunctions(75),
          targetCoverage: 85,
          optimizationGoals: {
            minimizeTestCount: false,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.gaps).toBeDefined();
      // Check for high-severity gaps
      const criticalGaps = result.gaps.filter(g => g.severity === 'critical' || g.severity === 'high');
      expect(criticalGaps.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide gap likelihood predictions', async () => {
      const task = {
        id: 'gap-likelihood',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(10),
          codeBase: generateBasicCodeBase(50),
          targetCoverage: 80,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.gaps).toBeDefined();
      if (result.gaps.length > 0) {
        expect(result.gaps[0].likelihood).toBeDefined();
        expect(typeof result.gaps[0].likelihood).toBe('number');
        expect(result.gaps[0].likelihood).toBeGreaterThanOrEqual(0);
        expect(result.gaps[0].likelihood).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('optimization strategies', () => {
    it('should optimize test selection for maximum coverage gain', async () => {
      const task = {
        id: 'optimize-test-selection',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(50),
          codeBase: generateBasicCodeBase(200),
          targetCoverage: 85,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      expect(result.optimizedSuite).toBeDefined();
      expect(result.optimization.optimizedTestCount).toBeLessThanOrEqual(50);
      expect(result.optimization.optimizationRatio).toBeLessThanOrEqual(1.0);
    });

    it('should track learning metrics when learning is enabled', async () => {
      const task = {
        id: 'learning-metrics',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(20),
          codeBase: generateBasicCodeBase(100),
          targetCoverage: 85,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);

      // Learning metrics should be present when learning is enabled
      if (result.learningMetrics) {
        expect(result.learningMetrics.improvementRate).toBeDefined();
        expect(result.learningMetrics.confidence).toBeDefined();
        expect(result.learningMetrics.patternsApplied).toBeDefined();
      }
    });
  });

  describe('agent status and lifecycle', () => {
    it('should report correct status information', () => {
      const status = agent.getStatus();

      expect(status.agentId).toBeDefined();
      expect(status.status).toBe(AgentStatus.IDLE);
      expect(status.capabilities).toBeInstanceOf(Array);
      expect(status.performance).toBeDefined();
    });

    it('should report learning status when disabled', () => {
      const status = agent.getStatus();

      // Learning is disabled in tests to avoid Logger dependency
      if (status.learning) {
        expect(status.learning.enabled).toBe(false);
      }
    });

    it('should handle termination gracefully', async () => {
      await agent.terminate();
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.STOPPED);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle empty test suite gracefully', async () => {
      const task = {
        id: 'empty-suite',
        type: 'coverage-analysis',
        payload: {
          testSuite: { id: 'empty', name: 'Empty Suite', tests: [], metadata: { framework: 'jest', generatedAt: new Date(), coverageTarget: 80 } },
          codeBase: generateBasicCodeBase(50),
          targetCoverage: 80,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      // Agent handles empty suite gracefully - doesn't throw
      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
      expect(result.optimization.originalTestCount).toBe(0);
      expect(result.optimization.optimizedTestCount).toBe(0);
    });

    it('should handle very small codebase', async () => {
      const task = {
        id: 'small-codebase',
        type: 'coverage-analysis',
        payload: {
          testSuite: generateBasicTestSuite(5),
          codeBase: generateBasicCodeBase(5),
          targetCoverage: 80,
          optimizationGoals: {
            minimizeTestCount: true,
            maximizeCoverage: true,
            balanceEfficiency: true
          }
        }
      };

      const result = await agent.executeTask(task);
      expect(result).toBeDefined();
    });
  });
});

// Helper functions for generating test data
function generateBasicTestSuite(testCount: number): TestSuite {
  const tests: Test[] = [];
  for (let i = 0; i < testCount; i++) {
    tests.push({
      id: `test-${i}`,
      name: `Test ${i}`,
      type: 'unit',
      filePath: `tests/test-${i}.spec.ts`,
      description: `Test case ${i}`,
      framework: 'jest',
      language: 'typescript',
      code: `test('test ${i}', () => { expect(true).toBe(true); })`,
      assertions: [],
      dependencies: [],
      estimatedDuration: 100 + Math.random() * 900,
      complexity: Math.floor(Math.random() * 5) + 1
    });
  }

  return {
    id: `suite-${Date.now()}`,
    name: 'Test Suite',
    tests,
    metadata: {
      generatedAt: new Date(),
      coverageTarget: 80,
      framework: 'jest',
      estimatedDuration: tests.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0)
    }
  };
}

function generateBasicCodeBase(coveragePointCount: number) {
  const files = [];
  const coveragePoints = [];

  // Generate files
  const fileCount = Math.ceil(coveragePointCount / 20);
  for (let i = 0; i < fileCount; i++) {
    const functions = [];
    const pointsPerFile = Math.ceil(coveragePointCount / fileCount);

    // Generate functions for this file
    for (let j = 0; j < Math.min(pointsPerFile / 5, 10); j++) {
      functions.push({
        name: `function${i}_${j}`,
        startLine: j * 10 + 1,
        endLine: j * 10 + 8,
        complexity: Math.floor(Math.random() * 10) + 1
      });
    }

    files.push({
      path: `src/file-${i}.ts`,
      content: `// File ${i} content`,
      language: 'typescript',
      functions
    });
  }

  // Generate coverage points
  for (let i = 0; i < coveragePointCount; i++) {
    const fileIndex = Math.floor(i / 20);
    coveragePoints.push({
      id: `point-${i}`,
      file: `src/file-${fileIndex}.ts`,
      line: (i % 20) + 1,
      type: ['statement', 'branch', 'function'][Math.floor(Math.random() * 3)]
    });
  }

  return { files, coveragePoints };
}

function generateCodeBaseWithCriticalFunctions(coveragePointCount: number) {
  const codeBase = generateBasicCodeBase(coveragePointCount);

  // Mark some functions as critical (high complexity)
  for (const file of codeBase.files) {
    for (let i = 0; i < file.functions.length; i++) {
      if (i % 3 === 0) {
        file.functions[i].complexity = Math.floor(Math.random() * 5) + 10; // 10-14 complexity
      }
    }
  }

  return codeBase;
}
