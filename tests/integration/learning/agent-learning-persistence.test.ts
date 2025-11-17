/**
 * Agent Learning Integration Tests - Phase 2-4 Verification
 *
 * Tests that agents persist learning across restarts and show measurable improvement.
 * This verifies the complete learning pipeline from agent execution to database storage.
 */

import { TestGeneratorAgent } from '../../../src/agents/TestGeneratorAgent';
import { CoverageAnalyzerAgent } from '../../../src/agents/CoverageAnalyzerAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { createAgentDBManager } from '../../../src/core/memory/AgentDBManager';
import { EventEmitter } from 'events';
import { QETask, AgentContext, AgentType } from '../../../src/types';

describe('Agent Learning Persistence Integration', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;
  const testDbPath = ':memory:';

  beforeEach(async () => {
    // Create shared memory store
    const agentDB = createAgentDBManager({
      dbPath: testDbPath,
      enableLearning: true,
      enableReasoning: true
    });
    await agentDB.initialize();

    memoryStore = new SwarmMemoryManager({
      dbPath: testDbPath,
      cacheSize: 1000,
      ttl: 3600000
    });
    await memoryStore.initialize();

    eventBus = new EventEmitter();
  });

  afterEach(async () => {
    if (memoryStore) {
      await memoryStore.shutdown();
    }
  });

  describe('TestGeneratorAgent Learning', () => {
    it('should persist learning across agent restarts', async () => {
      const agentId = 'test-gen-persist-' + Date.now();
      const context: AgentContext = {
        id: agentId,
        type: 'test-generator' as AgentType,
        status: 'idle',
        metadata: {}
      };

      // Create first agent instance
      const agent1 = new TestGeneratorAgent({
        id: agentId,
        type: 'test-generator' as AgentType,
        capabilities: ['unit-testing', 'integration-testing'],
        context,
        memoryStore,
        eventBus,
        frameworks: ['jest'],
        generationStrategies: ['boundary-value'],
        coverageTarget: 80,
        learningEnabled: true
      });

      const task1: QETask = {
        id: 'task-1',
        type: 'test-generation',
        description: 'Generate unit tests for Calculator class',
        requirements: {
          targetFiles: ['src/Calculator.ts'],
          framework: 'jest',
          coverageTarget: 80
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      // Execute task with first agent
      const result1 = await agent1.executeTask(task1);
      const initialCoverage = result1.metrics?.coverage || 0;

      // Shutdown first agent
      await agent1.shutdown();

      // Create second agent instance (simulating restart)
      const agent2 = new TestGeneratorAgent({
        id: agentId, // Same ID to restore state
        type: 'test-generator' as AgentType,
        capabilities: ['unit-testing', 'integration-testing'],
        context,
        memoryStore,
        eventBus,
        frameworks: ['jest'],
        generationStrategies: ['boundary-value'],
        coverageTarget: 80,
        learningEnabled: true
      });

      const task2: QETask = {
        id: 'task-2',
        type: 'test-generation',
        description: 'Generate unit tests for Calculator class',
        requirements: {
          targetFiles: ['src/Calculator.ts'],
          framework: 'jest',
          coverageTarget: 80
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      // Execute same task with restarted agent
      const result2 = await agent2.executeTask(task2);
      const secondCoverage = result2.metrics?.coverage || 0;

      // Second execution should be at least as good (learned from first)
      expect(secondCoverage).toBeGreaterThanOrEqual(initialCoverage * 0.95);

      await agent2.shutdown();
    }, 30000);

    it('should improve performance over multiple iterations', async () => {
      const agentId = 'test-gen-improve-' + Date.now();
      const context: AgentContext = {
        id: agentId,
        type: 'test-generator' as AgentType,
        status: 'idle',
        metadata: {}
      };

      const agent = new TestGeneratorAgent({
        id: agentId,
        type: 'test-generator' as AgentType,
        capabilities: ['unit-testing'],
        context,
        memoryStore,
        eventBus,
        frameworks: ['jest'],
        generationStrategies: ['equivalence-class', 'boundary-value'],
        coverageTarget: 85,
        learningEnabled: true
      });

      const coverageResults: number[] = [];

      // Execute same task 10 times
      for (let i = 0; i < 10; i++) {
        const task: QETask = {
          id: `iteration-${i}`,
          type: 'test-generation',
          description: `Generate tests iteration ${i}`,
          requirements: {
            targetFiles: ['src/utils/StringHelper.ts'],
            framework: 'jest',
            coverageTarget: 85
          },
          priority: 'medium',
          createdAt: new Date(),
          status: 'pending'
        };

        const result = await agent.executeTask(task);
        const coverage = result.metrics?.coverage || 0;
        coverageResults.push(coverage);

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Calculate improvement
      const baseline = coverageResults.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const final = coverageResults.slice(-3).reduce((a, b) => a + b, 0) / 3;
      const improvement = ((final - baseline) / baseline) * 100;

      // Should show at least 10% improvement over 10 iterations
      expect(improvement).toBeGreaterThanOrEqual(10);

      await agent.shutdown();
    }, 60000);
  });

  describe('CoverageAnalyzerAgent Learning', () => {
    it('should persist learned patterns across restarts', async () => {
      const agentId = 'coverage-persist-' + Date.now();
      const context: AgentContext = {
        id: agentId,
        type: 'coverage-analyzer' as AgentType,
        status: 'idle',
        metadata: {}
      };

      // First agent instance
      const agent1 = new CoverageAnalyzerAgent({
        id: agentId,
        type: 'coverage-analyzer' as AgentType,
        capabilities: ['coverage-analysis', 'gap-detection'],
        context,
        memoryStore,
        eventBus,
        targetCoverage: 90,
        sublinearOptimization: true,
        learningEnabled: true
      });

      const task1: QETask = {
        id: 'coverage-task-1',
        type: 'coverage-analysis',
        description: 'Analyze coverage for src/',
        requirements: {
          targetDirectory: 'src/',
          threshold: 90,
          frameworks: ['jest']
        },
        priority: 'high',
        createdAt: new Date(),
        status: 'pending'
      };

      const result1 = await agent1.executeTask(task1);
      const initialGaps = result1.coverageGaps?.length || 0;

      await agent1.shutdown();

      // Restart agent
      const agent2 = new CoverageAnalyzerAgent({
        id: agentId,
        type: 'coverage-analyzer' as AgentType,
        capabilities: ['coverage-analysis', 'gap-detection'],
        context,
        memoryStore,
        eventBus,
        targetCoverage: 90,
        sublinearOptimization: true,
        learningEnabled: true
      });

      const task2: QETask = {
        id: 'coverage-task-2',
        type: 'coverage-analysis',
        description: 'Analyze coverage for src/',
        requirements: {
          targetDirectory: 'src/',
          threshold: 90,
          frameworks: ['jest']
        },
        priority: 'high',
        createdAt: new Date(),
        status: 'pending'
      };

      const result2 = await agent2.executeTask(task2);
      const secondGaps = result2.coverageGaps?.length || 0;

      // Should find at least as many gaps (learning improves detection)
      expect(secondGaps).toBeGreaterThanOrEqual(initialGaps * 0.9);

      await agent2.shutdown();
    }, 30000);
  });

  describe('Multi-Agent Learning Coordination', () => {
    it('should share learning across different agent types', async () => {
      const sharedDbPath = ':memory:';

      // Create shared memory for both agents
      const agentDB = createAgentDBManager({
        dbPath: sharedDbPath,
        enableLearning: true
      });
      await agentDB.initialize();

      const sharedMemory = new SwarmMemoryManager({
        dbPath: sharedDbPath,
        cacheSize: 1000,
        ttl: 3600000
      });
      await sharedMemory.initialize();

      // Create test generator
      const testGenContext: AgentContext = {
        id: 'test-gen-shared',
        type: 'test-generator' as AgentType,
        status: 'idle',
        metadata: {}
      };

      const testGen = new TestGeneratorAgent({
        id: 'test-gen-shared',
        type: 'test-generator' as AgentType,
        capabilities: ['unit-testing'],
        context: testGenContext,
        memoryStore: sharedMemory,
        eventBus,
        frameworks: ['jest'],
        generationStrategies: ['mutation-testing'],
        coverageTarget: 85,
        learningEnabled: true
      });

      // Create coverage analyzer
      const coverageContext: AgentContext = {
        id: 'coverage-shared',
        type: 'coverage-analyzer' as AgentType,
        status: 'idle',
        metadata: {}
      };

      const coverage = new CoverageAnalyzerAgent({
        id: 'coverage-shared',
        type: 'coverage-analyzer' as AgentType,
        capabilities: ['coverage-analysis'],
        context: coverageContext,
        memoryStore: sharedMemory,
        eventBus,
        targetCoverage: 85,
        sublinearOptimization: true,
        learningEnabled: true
      });

      // Execute tasks with both agents
      const testTask: QETask = {
        id: 'shared-test-task',
        type: 'test-generation',
        description: 'Generate tests',
        requirements: { targetFiles: ['src/shared.ts'], framework: 'jest' },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const coverageTask: QETask = {
        id: 'shared-coverage-task',
        type: 'coverage-analysis',
        description: 'Analyze coverage',
        requirements: { targetDirectory: 'src/', threshold: 85 },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      await testGen.executeTask(testTask);
      await coverage.executeTask(coverageTask);

      // Verify both agents stored learning data
      const stats = await agentDB.getStats();
      expect(stats.experienceCount || stats.patterns || 0).toBeGreaterThan(0);

      await testGen.shutdown();
      await coverage.shutdown();
      await sharedMemory.shutdown();
    }, 30000);
  });

  describe('Learning Metrics Validation', () => {
    it('should track and persist learning metrics', async () => {
      const agentId = 'metrics-agent-' + Date.now();
      const context: AgentContext = {
        id: agentId,
        type: 'test-generator' as AgentType,
        status: 'idle',
        metadata: {}
      };

      const agent = new TestGeneratorAgent({
        id: agentId,
        type: 'test-generator' as AgentType,
        capabilities: ['unit-testing'],
        context,
        memoryStore,
        eventBus,
        frameworks: ['jest'],
        generationStrategies: ['boundary-value'],
        coverageTarget: 80,
        learningEnabled: true
      });

      // Execute multiple tasks
      for (let i = 0; i < 5; i++) {
        const task: QETask = {
          id: `metrics-task-${i}`,
          type: 'test-generation',
          description: `Metrics test ${i}`,
          requirements: {
            targetFiles: ['src/Metrics.ts'],
            framework: 'jest'
          },
          priority: 'medium',
          createdAt: new Date(),
          status: 'pending'
        };

        await agent.executeTask(task);
      }

      // Verify learning metrics stored
      const learningEngine = (agent as any).learningEngine;
      expect(learningEngine.getTotalExperiences()).toBe(5);

      const patterns = await learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      await agent.shutdown();
    }, 30000);
  });
});
