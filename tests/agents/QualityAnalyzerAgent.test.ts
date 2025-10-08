/**
 * Tests for QualityAnalyzerAgent
 *
 * Comprehensive test suite for code quality analysis agent.
 * Tests code analysis, complexity analysis, style checking, security scanning,
 * metrics collection, and quality report generation.
 *
 * @group unit
 * @group agents
 */

import { QualityAnalyzerAgent, QualityAnalyzerConfig } from '../../src/agents/QualityAnalyzerAgent';
import { QETask, AgentContext, MemoryStore, AgentStatus } from '../../src/types';
import { EventEmitter } from 'events';

// Mock Logger to avoid file system operations
jest.mock('../../src/utils/Logger', () => ({
  Logger: {
    getInstance: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('QualityAnalyzerAgent', () => {
  let agent: QualityAnalyzerAgent;
  let mockMemoryStore: jest.Mocked<MemoryStore>;
  let mockEventBus: EventEmitter;
  let mockContext: AgentContext;
  let config: QualityAnalyzerConfig & { context: AgentContext; memoryStore: MemoryStore; eventBus: EventEmitter };

  beforeEach(() => {
    // Create mocks
    mockMemoryStore = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      retrieveShared: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      exists: jest.fn().mockResolvedValue(false),
      list: jest.fn().mockResolvedValue([]),
      clear: jest.fn().mockResolvedValue(0)
    } as any;

    mockEventBus = new EventEmitter();
    jest.spyOn(mockEventBus, 'emit');

    mockContext = {
      id: 'test-context-id',
      type: 'test',
      status: AgentStatus.INITIALIZING,
      metadata: {
        workingDirectory: '/test',
        environment: 'test'
      }
    };

    config = {
      tools: ['eslint', 'sonarqube', 'codecov'],
      thresholds: {
        coverage: 80,
        complexity: 10,
        maintainability: 70,
        security: 90
      },
      reportFormat: 'json',
      context: mockContext,
      memoryStore: mockMemoryStore,
      eventBus: mockEventBus
    };

    agent = new QualityAnalyzerAgent(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should create agent with provided configuration', () => {
      expect(agent).toBeInstanceOf(QualityAnalyzerAgent);
    });

    it('should use default configuration when not provided', () => {
      const minimalConfig = {
        tools: [],
        thresholds: {},
        reportFormat: 'json' as const,
        context: mockContext,
        memoryStore: mockMemoryStore,
        eventBus: mockEventBus
      };

      const defaultAgent = new QualityAnalyzerAgent(minimalConfig);
      expect(defaultAgent).toBeInstanceOf(QualityAnalyzerAgent);
    });

    it('should initialize with correct agent type', async () => {
      await agent.initialize();
      const status = agent.getStatus();
      expect(status.state).toBeDefined();
    });
  });

  describe('Code Analysis', () => {
    let analysisTask: QETask;

    beforeEach(() => {
      analysisTask = {
        taskId: { id: 'test-task-1', timestamp: Date.now() },
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/module.ts',
          language: 'typescript'
        },
        status: 'pending',
        priority: 'high'
      };
    });

    it('should analyze code and return metrics', async () => {
      const result = await agent.executeTask(analysisTask);

      expect(result).toHaveProperty('sourcePath');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('metrics');
      expect(result.metrics).toHaveProperty('linesOfCode');
      expect(result.metrics).toHaveProperty('methods');
      expect(result.metrics).toHaveProperty('classes');
      expect(result.metrics).toHaveProperty('complexity');
      expect(result.metrics).toHaveProperty('maintainability');
      expect(result.metrics).toHaveProperty('coverage');
    });

    it('should detect quality issues', async () => {
      const result = await agent.executeTask(analysisTask);

      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);
      if (result.issues.length > 0) {
        expect(result.issues[0]).toHaveProperty('type');
        expect(result.issues[0]).toHaveProperty('category');
        expect(result.issues[0]).toHaveProperty('message');
        expect(result.issues[0]).toHaveProperty('line');
      }
    });

    it('should calculate quality score', async () => {
      const result = await agent.executeTask(analysisTask);

      expect(result).toHaveProperty('score');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should validate against thresholds', async () => {
      const result = await agent.executeTask(analysisTask);

      expect(result).toHaveProperty('passed');
      expect(typeof result.passed).toBe('boolean');
    });

    it('should handle different programming languages', async () => {
      const languages = ['javascript', 'typescript', 'python', 'java'];

      for (const language of languages) {
        const langTask = {
          ...analysisTask,
          payload: { ...analysisTask.payload, language }
        };

        const result = await agent.executeTask(langTask);
        expect(result.language).toBe(language);
      }
    });

    it('should fail when complexity exceeds threshold', async () => {
      // Run multiple times to get a result that exceeds threshold
      let result;
      for (let i = 0; i < 10; i++) {
        result = await agent.executeTask(analysisTask);
        if (result.metrics.complexity > config.thresholds.complexity) {
          expect(result.passed).toBe(false);
          break;
        }
      }
    });
  });

  describe('Complexity Analysis', () => {
    let complexityTask: QETask;

    beforeEach(() => {
      complexityTask = {
        taskId: { id: 'test-task-2', timestamp: Date.now() },
        type: 'complexity-analysis',
        payload: {
          sourcePath: '/test/src/complex.ts'
        },
        status: 'pending',
        priority: 'medium'
      };
    });

    it('should analyze cyclomatic complexity', async () => {
      const result = await agent.executeTask(complexityTask);

      expect(result).toHaveProperty('complexity');
      expect(result.complexity).toHaveProperty('cyclomatic');
      expect(typeof result.complexity.cyclomatic).toBe('number');
      expect(result.complexity.cyclomatic).toBeGreaterThanOrEqual(1);
    });

    it('should analyze cognitive complexity', async () => {
      const result = await agent.executeTask(complexityTask);

      expect(result.complexity).toHaveProperty('cognitive');
      expect(typeof result.complexity.cognitive).toBe('number');
      expect(result.complexity.cognitive).toBeGreaterThanOrEqual(1);
    });

    it('should calculate Halstead metrics', async () => {
      const result = await agent.executeTask(complexityTask);

      expect(result.complexity).toHaveProperty('halstead');
      expect(result.complexity.halstead).toHaveProperty('difficulty');
      expect(result.complexity.halstead).toHaveProperty('effort');
    });

    it('should provide recommendations for high complexity', async () => {
      const result = await agent.executeTask(complexityTask);

      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.recommendations)).toBe(true);

      if (result.complexity.cyclomatic > 10 || result.complexity.cognitive > 15) {
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });

    it('should validate complexity against threshold', async () => {
      const result = await agent.executeTask(complexityTask);

      expect(result).toHaveProperty('passed');
      expect(result.passed).toBe(result.complexity.cyclomatic <= config.thresholds.complexity);
    });
  });

  describe('Style Checking', () => {
    let styleTask: QETask;

    beforeEach(() => {
      styleTask = {
        taskId: { id: 'test-task-3', timestamp: Date.now() },
        type: 'style-check',
        payload: {
          sourcePath: '/test/src/style.ts',
          rules: 'standard'
        },
        status: 'pending',
        priority: 'low'
      };
    });

    it('should check code style', async () => {
      const result = await agent.executeTask(styleTask);

      expect(result).toHaveProperty('sourcePath');
      expect(result).toHaveProperty('rules');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('warnings');
    });

    it('should detect style violations', async () => {
      const result = await agent.executeTask(styleTask);

      expect(result).toHaveProperty('issues');
      expect(Array.isArray(result.issues)).toBe(true);

      result.issues.forEach((issue: any) => {
        expect(issue).toHaveProperty('type');
        expect(['error', 'warning']).toContain(issue.type);
        expect(issue).toHaveProperty('rule');
        expect(issue).toHaveProperty('line');
        expect(issue).toHaveProperty('message');
      });
    });

    it('should pass when no violations found', async () => {
      // Mock a clean result
      const result = await agent.executeTask(styleTask);

      if (result.violations === 0) {
        expect(result.passed).toBe(true);
      }
    });

    it('should support different rule sets', async () => {
      const ruleSets = ['standard', 'airbnb', 'google'];

      for (const rules of ruleSets) {
        const ruleTask = {
          ...styleTask,
          payload: { ...styleTask.payload, rules }
        };

        const result = await agent.executeTask(ruleTask);
        expect(result.rules).toBe(rules);
      }
    });
  });

  describe('Security Scanning', () => {
    let securityTask: QETask;

    beforeEach(() => {
      securityTask = {
        taskId: { id: 'test-task-4', timestamp: Date.now() },
        type: 'security-scan',
        payload: {
          sourcePath: '/test/src/app.ts',
          depth: 'standard'
        },
        status: 'pending',
        priority: 'high'
      };
    });

    it('should scan for security vulnerabilities', async () => {
      const result = await agent.executeTask(securityTask);

      expect(result).toHaveProperty('vulnerabilities');
      expect(result.vulnerabilities).toHaveProperty('critical');
      expect(result.vulnerabilities).toHaveProperty('high');
      expect(result.vulnerabilities).toHaveProperty('medium');
      expect(result.vulnerabilities).toHaveProperty('low');
    });

    it('should calculate security score', async () => {
      const result = await agent.executeTask(securityTask);

      expect(result).toHaveProperty('score');
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should count total vulnerabilities', async () => {
      const result = await agent.executeTask(securityTask);

      expect(result).toHaveProperty('total');
      const expectedTotal =
        result.vulnerabilities.critical +
        result.vulnerabilities.high +
        result.vulnerabilities.medium +
        result.vulnerabilities.low;
      expect(result.total).toBe(expectedTotal);
    });

    it('should validate against security threshold', async () => {
      const result = await agent.executeTask(securityTask);

      expect(result).toHaveProperty('passed');
      expect(result.passed).toBe(result.score >= config.thresholds.security);
    });

    it('should support different scan depths', async () => {
      const depths = ['quick', 'standard', 'deep'];

      for (const depth of depths) {
        const depthTask = {
          ...securityTask,
          payload: { ...securityTask.payload, depth }
        };

        const result = await agent.executeTask(depthTask);
        expect(result.depth).toBe(depth);
      }
    });
  });

  describe('Metrics Collection', () => {
    let metricsTask: QETask;

    beforeEach(() => {
      metricsTask = {
        taskId: { id: 'test-task-5', timestamp: Date.now() },
        type: 'metrics-collection',
        payload: {
          sourcePath: '/test/src',
          includeHistory: false
        },
        status: 'pending',
        priority: 'medium'
      };
    });

    it('should collect quality metrics', async () => {
      const result = await agent.executeTask(metricsTask);

      expect(result).toHaveProperty('metrics');
      expect(result.metrics).toHaveProperty('quality');
      expect(result.metrics).toHaveProperty('coverage');
      expect(result.metrics).toHaveProperty('complexity');
      expect(result.metrics).toHaveProperty('size');
    });

    it('should collect coverage metrics', async () => {
      const result = await agent.executeTask(metricsTask);

      expect(result.metrics.coverage).toHaveProperty('line');
      expect(result.metrics.coverage).toHaveProperty('branch');
      expect(result.metrics.coverage).toHaveProperty('function');
    });

    it('should include timestamp', async () => {
      const result = await agent.executeTask(metricsTask);

      expect(result).toHaveProperty('timestamp');
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should respect includeHistory flag', async () => {
      const resultWithHistory = await agent.executeTask({
        ...metricsTask,
        payload: { ...metricsTask.payload, includeHistory: true }
      });

      expect(resultWithHistory.includeHistory).toBe(true);
    });
  });

  describe('Quality Report Generation', () => {
    let reportTask: QETask;

    beforeEach(() => {
      reportTask = {
        taskId: { id: 'test-task-6', timestamp: Date.now() },
        type: 'quality-report',
        payload: {
          sourcePath: '/test/src',
          format: 'json'
        },
        status: 'pending',
        priority: 'high'
      };
    });

    it('should generate comprehensive quality report', async () => {
      const result = await agent.executeTask(reportTask);

      expect(result).toHaveProperty('sourcePath');
      expect(result).toHaveProperty('format');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('overallScore');
      expect(result).toHaveProperty('sections');
      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('summary');
    });

    it('should include all analysis sections', async () => {
      const result = await agent.executeTask(reportTask);

      expect(result.sections).toHaveProperty('codeAnalysis');
      expect(result.sections).toHaveProperty('complexity');
      expect(result.sections).toHaveProperty('security');
      expect(result.sections).toHaveProperty('metrics');
    });

    it('should calculate overall score', async () => {
      const result = await agent.executeTask(reportTask);

      expect(typeof result.overallScore).toBe('number');
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should provide recommendations', async () => {
      const result = await agent.executeTask(reportTask);

      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should include summary with grade', async () => {
      const result = await agent.executeTask(reportTask);

      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('score');
      expect(result.summary).toHaveProperty('grade');
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.summary.grade);
    });

    it('should support different report formats', async () => {
      const formats: Array<'json' | 'xml' | 'html'> = ['json', 'xml', 'html'];

      for (const format of formats) {
        const formatTask = {
          ...reportTask,
          payload: { ...reportTask.payload, format }
        };

        const result = await agent.executeTask(formatTask);
        expect(result.format).toBe(format);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported task type', async () => {
      const invalidTask: QETask = {
        taskId: { id: 'invalid-task', timestamp: Date.now() },
        type: 'invalid-type' as any,
        payload: {},
        status: 'pending',
        priority: 'low'
      };

      await expect(agent.executeTask(invalidTask)).rejects.toThrow('Unsupported task type');
    });

    it('should handle missing source path gracefully', async () => {
      const noPathTask: QETask = {
        taskId: { id: 'no-path-task', timestamp: Date.now() },
        type: 'code-analysis',
        payload: {},
        status: 'pending',
        priority: 'medium'
      };

      // Should not throw, but may return undefined or default values
      const result = await agent.executeTask(noPathTask);
      expect(result).toBeDefined();
    });
  });

  describe('Agent Lifecycle', () => {
    it('should initialize successfully', async () => {
      await expect(agent.initialize()).resolves.not.toThrow();
    });

    it('should terminate gracefully', async () => {
      await agent.initialize();
      await expect(agent.terminate()).resolves.not.toThrow();
    });

    it('should emit events during task execution', async () => {
      await agent.initialize();

      const task: QETask = {
        taskId: { id: 'event-task', timestamp: Date.now() },
        type: 'code-analysis',
        payload: { sourcePath: '/test' },
        status: 'pending',
        priority: 'low'
      };

      await agent.executeTask(task);

      // Verify event bus was used
      expect(mockEventBus.emit).toHaveBeenCalled();
    });
  });

  describe('Memory Integration', () => {
    it('should store analysis results in memory', async () => {
      await agent.initialize();

      const task: QETask = {
        taskId: { id: 'memory-task', timestamp: Date.now() },
        type: 'code-analysis',
        payload: { sourcePath: '/test' },
        status: 'pending',
        priority: 'medium'
      };

      await agent.executeTask(task);

      // Verify memory store was called
      expect(mockMemoryStore.store).toHaveBeenCalled();
    });

    it('should retrieve historical data from memory', async () => {
      mockMemoryStore.retrieve.mockResolvedValue({ historical: 'data' });

      await agent.initialize();

      // Memory should be checked during initialization
      expect(mockMemoryStore.retrieve).toHaveBeenCalled();
    });
  });
});
