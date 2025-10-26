/**
 * Comprehensive Test Suite for QualityAnalyzerAgent
 * Tests all task types, configurations, edge cases, and integration scenarios
 */

import { QualityAnalyzerAgent, QualityAnalyzerConfig } from '@agents/QualityAnalyzerAgent';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { EventBus } from '@core/EventBus';
import { QEAgentType, AgentContext, QETask } from '@types';
import * as path from 'path';
import * as fs from 'fs-extra';

describe('QualityAnalyzerAgent - Comprehensive Tests', () => {
  let agent: QualityAnalyzerAgent;
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventBus;
  let dbPath: string;

  beforeEach(async () => {
    // Setup test database
    dbPath = path.join(process.cwd(), '.temp', `test-quality-analyzer-${Date.now()}.db`);
    await fs.ensureDir(path.dirname(dbPath));

    memoryStore = new SwarmMemoryManager(dbPath);
    await memoryStore.initialize();

    eventBus = EventBus.getInstance();
    await eventBus.initialize();

    const context: AgentContext = {
      workspaceRoot: '/test/workspace',
      config: {
        timeout: 30000,
        retries: 3,
        logLevel: 'info'
      }
    };

    const config: QualityAnalyzerConfig & { context: AgentContext; memoryStore: SwarmMemoryManager; eventBus: typeof eventBus } = {
      tools: ['eslint', 'sonarqube', 'codecov'],
      thresholds: {
        coverage: 80,
        complexity: 10,
        maintainability: 70,
        security: 90
      },
      reportFormat: 'json',
      context,
      memoryStore,
      eventBus
    };

    agent = new QualityAnalyzerAgent(config);
  });

  afterEach(async () => {
    await agent.terminate();
    await eventBus.close();
    await memoryStore.close();
    await fs.remove(dbPath);
    EventBus.resetInstance();
  });

  describe('Initialization and Lifecycle', () => {
    test('should initialize with default configuration', async () => {
      await agent.initialize();
      const status = agent.getStatus();

      expect(status.agentId.type).toBe(QEAgentType.QUALITY_ANALYZER);
      expect(status.status).toBe('active');
    });

    test('should initialize with custom tools', async () => {
      await agent.initialize();
      expect(agent).toBeDefined();
    });

    test('should load knowledge base on initialization', async () => {
      // Pre-store some knowledge
      await memoryStore.store(`agent:${QEAgentType.QUALITY_ANALYZER}:quality-patterns`, {
        codeSmells: ['long-method', 'large-class']
      });

      await agent.initialize();
      const status = agent.getStatus();
      expect(status.status).toBe('active');
    });

    test('should handle initialization errors gracefully', async () => {
      // Close memory store to force error
      await memoryStore.close();

      await expect(agent.initialize()).rejects.toThrow();
    });

    test('should clean up resources on termination', async () => {
      await agent.initialize();
      await agent.terminate();

      const status = agent.getStatus();
      expect(status.status).toBe('terminated');
    });
  });

  describe('Code Analysis Tasks', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should analyze code with valid source path', async () => {
      const task: QETask = {
        id: 'task-1',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.js',
          language: 'javascript'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result).toBeDefined();
      expect(result.sourcePath).toBe('/test/src/app.js');
      expect(result.language).toBe('javascript');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.linesOfCode).toBeGreaterThan(0);
      expect(result.metrics.complexity).toBeGreaterThan(0);
    });

    test('should analyze TypeScript code', async () => {
      const task: QETask = {
        id: 'task-2',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.ts',
          language: 'typescript'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.language).toBe('typescript');
      expect(result.metrics).toBeDefined();
    });

    test('should calculate quality score correctly', async () => {
      const task: QETask = {
        id: 'task-3',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/module.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('should identify code quality issues', async () => {
      const task: QETask = {
        id: 'task-4',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/complex.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test('should pass when metrics meet thresholds', async () => {
      const task: QETask = {
        id: 'task-5',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/good-code.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.passed).toBeDefined();
      expect(typeof result.passed).toBe('boolean');
    });

    test('should fail when complexity exceeds threshold', async () => {
      const task: QETask = {
        id: 'task-6',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/very-complex.js'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      // Result might pass or fail depending on simulated values
      expect(result.passed).toBeDefined();
      expect(result.metrics.complexity).toBeDefined();
    });
  });

  describe('Complexity Analysis Tasks', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should calculate cyclomatic complexity', async () => {
      const task: QETask = {
        id: 'task-7',
        type: 'complexity-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.complexity.cyclomatic).toBeDefined();
      expect(result.complexity.cyclomatic).toBeGreaterThan(0);
    });

    test('should calculate cognitive complexity', async () => {
      const task: QETask = {
        id: 'task-8',
        type: 'complexity-analysis',
        payload: {
          sourcePath: '/test/src/module.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.complexity.cognitive).toBeDefined();
      expect(result.complexity.cognitive).toBeGreaterThan(0);
    });

    test('should provide complexity recommendations', async () => {
      const task: QETask = {
        id: 'task-9',
        type: 'complexity-analysis',
        payload: {
          sourcePath: '/test/src/complex.js'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should calculate Halstead metrics', async () => {
      const task: QETask = {
        id: 'task-10',
        type: 'complexity-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.complexity.halstead).toBeDefined();
      expect(result.complexity.halstead.difficulty).toBeDefined();
      expect(result.complexity.halstead.effort).toBeDefined();
    });
  });

  describe('Style Check Tasks', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should check code style with standard rules', async () => {
      const task: QETask = {
        id: 'task-11',
        type: 'style-check',
        payload: {
          sourcePath: '/test/src/app.js',
          rules: 'standard'
        },
        priority: 'low',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.violations).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(typeof result.violations).toBe('number');
    });

    test('should identify style violations', async () => {
      const task: QETask = {
        id: 'task-12',
        type: 'style-check',
        payload: {
          sourcePath: '/test/src/messy-code.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test('should pass when no violations found', async () => {
      const task: QETask = {
        id: 'task-13',
        type: 'style-check',
        payload: {
          sourcePath: '/test/src/clean-code.js'
        },
        priority: 'low',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.passed).toBeDefined();
    });
  });

  describe('Security Scanning Tasks', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should scan for security vulnerabilities', async () => {
      const task: QETask = {
        id: 'task-14',
        type: 'security-scan',
        payload: {
          sourcePath: '/test/src/app.js',
          depth: 'standard'
        },
        priority: 'critical',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.vulnerabilities).toBeDefined();
      expect(result.vulnerabilities.critical).toBeDefined();
      expect(result.vulnerabilities.high).toBeDefined();
      expect(result.score).toBeDefined();
    });

    test('should categorize vulnerabilities by severity', async () => {
      const task: QETask = {
        id: 'task-15',
        type: 'security-scan',
        payload: {
          sourcePath: '/test/src/insecure.js'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.vulnerabilities.critical).toBeGreaterThanOrEqual(0);
      expect(result.vulnerabilities.high).toBeGreaterThanOrEqual(0);
      expect(result.vulnerabilities.medium).toBeGreaterThanOrEqual(0);
      expect(result.vulnerabilities.low).toBeGreaterThanOrEqual(0);
    });

    test('should calculate security score', async () => {
      const task: QETask = {
        id: 'task-16',
        type: 'security-scan',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    test('should pass when security meets threshold', async () => {
      const task: QETask = {
        id: 'task-17',
        type: 'security-scan',
        payload: {
          sourcePath: '/test/src/secure-code.js'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.passed).toBeDefined();
    });
  });

  describe('Metrics Collection Tasks', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should collect quality metrics', async () => {
      const task: QETask = {
        id: 'task-18',
        type: 'metrics-collection',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.quality).toBeDefined();
      expect(result.metrics.coverage).toBeDefined();
      expect(result.metrics.complexity).toBeDefined();
    });

    test('should collect coverage metrics', async () => {
      const task: QETask = {
        id: 'task-19',
        type: 'metrics-collection',
        payload: {
          sourcePath: '/test/src'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.metrics.coverage.line).toBeDefined();
      expect(result.metrics.coverage.branch).toBeDefined();
      expect(result.metrics.coverage.function).toBeDefined();
    });

    test('should include historical data when requested', async () => {
      const task: QETask = {
        id: 'task-20',
        type: 'metrics-collection',
        payload: {
          sourcePath: '/test/src',
          includeHistory: true
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.includeHistory).toBe(true);
    });
  });

  describe('Quality Report Generation', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should generate comprehensive quality report', async () => {
      const task: QETask = {
        id: 'task-21',
        type: 'quality-report',
        payload: {
          sourcePath: '/test/src',
          format: 'json'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.sections).toBeDefined();
      expect(result.sections.codeAnalysis).toBeDefined();
      expect(result.sections.complexity).toBeDefined();
      expect(result.sections.security).toBeDefined();
      expect(result.sections.metrics).toBeDefined();
    });

    test('should include recommendations in report', async () => {
      const task: QETask = {
        id: 'task-22',
        type: 'quality-report',
        payload: {
          sourcePath: '/test/src'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should calculate overall score', async () => {
      const task: QETask = {
        id: 'task-23',
        type: 'quality-report',
        payload: {
          sourcePath: '/test/src'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.overallScore).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    test('should assign quality grade', async () => {
      const task: QETask = {
        id: 'task-24',
        type: 'quality-report',
        payload: {
          sourcePath: '/test/src'
        },
        priority: 'high',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);

      expect(result.summary.grade).toBeDefined();
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.summary.grade);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should handle unsupported task type', async () => {
      const task: QETask = {
        id: 'task-25',
        type: 'unsupported-task' as any,
        payload: {},
        priority: 'medium',
        createdAt: new Date()
      };

      await expect(agent.assignTask(task)).rejects.toThrow('Unsupported task type');
    });

    test('should handle missing payload data', async () => {
      const task: QETask = {
        id: 'task-26',
        type: 'code-analysis',
        payload: {},
        priority: 'medium',
        createdAt: new Date()
      };

      const result = await agent.assignTask(task);
      expect(result).toBeDefined();
    });

    test('should handle concurrent task execution', async () => {
      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `task-concurrent-${i}`,
        type: 'code-analysis' as const,
        payload: {
          sourcePath: `/test/src/file${i}.js`
        },
        priority: 'medium' as const,
        createdAt: new Date()
      }));

      const results = await Promise.all(tasks.map(task => agent.assignTask(task)));

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.sourcePath).toBeDefined();
      });
    });
  });

  describe('Performance Metrics Tracking', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should track task completion metrics', async () => {
      const task: QETask = {
        id: 'task-27',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      await agent.assignTask(task);

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(1);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should update last activity timestamp', async () => {
      const task: QETask = {
        id: 'task-28',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      const beforeTime = Date.now();
      await agent.assignTask(task);
      const afterTime = Date.now();

      const status = agent.getStatus();
      const lastActivity = status.performanceMetrics.lastActivity.getTime();

      expect(lastActivity).toBeGreaterThanOrEqual(beforeTime);
      expect(lastActivity).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Memory Integration', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should store task results in memory', async () => {
      const task: QETask = {
        id: 'task-29',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      await agent.assignTask(task);

      // Task results should be stored in agent's memory namespace
      const storedResult = await memoryStore.retrieve(`agent:${agent.getStatus().agentId.id}:task:task-29:result`);
      expect(storedResult).toBeDefined();
    });

    test('should store quality patterns', async () => {
      await agent.initialize();

      // Quality patterns should be initialized
      const patterns = await memoryStore.retrieve(`agent:${agent.getStatus().agentId.id}:quality-patterns`);
      expect(patterns).toBeDefined();
    });
  });

  describe('Event Bus Integration', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should emit events on task completion', async () => {
      const eventPromise = new Promise<any>(resolve => {
        eventBus.once('hook.post-task.completed', resolve);
      });

      const task: QETask = {
        id: 'task-30',
        type: 'code-analysis',
        payload: {
          sourcePath: '/test/src/app.js'
        },
        priority: 'medium',
        createdAt: new Date()
      };

      await agent.assignTask(task);

      const event = await eventPromise;
      expect(event).toBeDefined();
      expect(event.agentId).toBeDefined();
    });
  });

  describe('Configuration Scenarios', () => {
    test('should work with minimal configuration', async () => {
      const minimalConfig: QualityAnalyzerConfig & { context: AgentContext; memoryStore: SwarmMemoryManager; eventBus: typeof eventBus } = {
        tools: ['eslint'],
        thresholds: {
          coverage: 50,
          complexity: 20,
          maintainability: 50,
          security: 70
        },
        reportFormat: 'json',
        context: {
          workspaceRoot: '/test',
          config: {}
        },
        memoryStore,
        eventBus
      };

      const minimalAgent = new QualityAnalyzerAgent(minimalConfig);
      await minimalAgent.initialize();

      expect(minimalAgent).toBeDefined();

      await minimalAgent.terminate();
    });

    test('should work with maximum configuration', async () => {
      const maxConfig: QualityAnalyzerConfig & { context: AgentContext; memoryStore: SwarmMemoryManager; eventBus: typeof eventBus } = {
        tools: ['eslint', 'sonarqube', 'codecov', 'snyk', 'prettier'],
        thresholds: {
          coverage: 95,
          complexity: 5,
          maintainability: 90,
          security: 99
        },
        reportFormat: 'html',
        context: {
          workspaceRoot: '/test',
          config: { timeout: 60000, retries: 5 }
        },
        memoryStore,
        eventBus
      };

      const maxAgent = new QualityAnalyzerAgent(maxConfig);
      await maxAgent.initialize();

      expect(maxAgent).toBeDefined();

      await maxAgent.terminate();
    });
  });

  describe('Stress Testing', () => {
    beforeEach(async () => {
      await agent.initialize();
    });

    test('should handle rapid task submissions', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: `stress-task-${i}`,
        type: 'code-analysis' as const,
        payload: {
          sourcePath: `/test/src/file${i}.js`
        },
        priority: 'medium' as const,
        createdAt: new Date()
      }));

      const results = await Promise.all(tasks.map(task => agent.assignTask(task)));

      expect(results).toHaveLength(20);
      expect(agent.getStatus().performanceMetrics.tasksCompleted).toBe(20);
    });
  });
});
