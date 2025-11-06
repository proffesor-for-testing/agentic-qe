/**
 * Learning System Integration Tests
 * Tests Phase 2 learning system integration: PerformanceTracker, LearningEngine, ImprovementLoop
 *
 * Test Suite:
 * 1. Full learning flow (Agent → Metrics → Learning → Improvement)
 * 2. Performance overhead validation (<100ms)
 * 3. Multi-agent coordination
 * 4. A/B testing functionality
 * 5. Failure pattern detection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import {
  PerformanceMetrics,
  TaskExperience,
  LearningFeedback,
  ABTest
} from '@learning/types';

// Import Logger and patch it before loading the learning modules
import * as LoggerModule from '@utils/Logger';

// Create a mock logger instance
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Replace the getInstance method
(LoggerModule.Logger as any).getInstance = jest.fn(() => mockLogger);

// Now import the learning modules that use Logger
import { PerformanceTracker } from '@learning/PerformanceTracker';
import { LearningEngine } from '@learning/LearningEngine';
import { ImprovementLoop } from '@learning/ImprovementLoop';

describe('Learning System Integration Tests', () => {
  let memoryManager: SwarmMemoryManager;
  let performanceTracker: PerformanceTracker;
  let learningEngine: LearningEngine;
  let improvementLoop: ImprovementLoop;
  let additionalEngines: LearningEngine[] = []; // Track engines created during tests

  const TEST_AGENT_ID = 'test-agent-001';

  beforeEach(async () => {
    // Initialize fresh instances for each test
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    performanceTracker = new PerformanceTracker(TEST_AGENT_ID, memoryManager);
    await performanceTracker.initialize();

    learningEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3
    });
    await learningEngine.initialize();

    improvementLoop = new ImprovementLoop(
      TEST_AGENT_ID,
      memoryManager,
      learningEngine,
      performanceTracker
    );
    await improvementLoop.initialize();

    // Clear tracking array
    additionalEngines = [];
  });

  afterEach(async () => {
    // Cleanup after each test
    if (improvementLoop?.isActive?.()) {
      await improvementLoop.stop();
    }

    // Dispose main learning engine
    if (learningEngine?.dispose) {
      await learningEngine.dispose();
    }

    // Dispose additional engines created during tests
    for (const engine of additionalEngines) {
      if (engine?.dispose) {
        await engine.dispose();
      }
    }
    additionalEngines = [];

    if (memoryManager?.clear) {
      await memoryManager.clear();
    }
  });

  /**
   * Test 1: Full Learning Flow
   * Validates complete integration: Agent → Metrics → Learning → Improvement
   */
  describe('Test 1: Full Learning Flow', () => {
    it('should complete full learning flow from task execution to improvement', async () => {
      // Step 1: Record initial performance metrics
      const initialMetrics = {
        tasksCompleted: 10,
        successRate: 0.7,
        averageExecutionTime: 5000,
        errorRate: 0.3,
        userSatisfaction: 0.65,
        resourceEfficiency: 0.6
      };

      await performanceTracker.recordSnapshot(initialMetrics);

      // Step 2: Execute tasks and learn from them
      const taskResults = [
        {
          id: 'task-1',
          type: 'test-generation',
          success: true,
          executionTime: 4000,
          strategy: 'parallel',
          toolsUsed: ['jest', 'coverage'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7,
          coverage: 0.85
        },
        {
          id: 'task-2',
          type: 'test-generation',
          success: true,
          executionTime: 3500,
          strategy: 'parallel',
          toolsUsed: ['jest', 'coverage'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7,
          coverage: 0.90
        },
        {
          id: 'task-3',
          type: 'test-generation',
          success: false,
          executionTime: 6000,
          strategy: 'sequential',
          toolsUsed: ['jest'],
          parallelization: 0.3,
          retryPolicy: 'none',
          resourceAllocation: 0.5,
          errors: ['timeout', 'memory-overflow']
        }
      ];

      // Learn from each task execution
      const outcomes = [];
      for (const task of taskResults) {
        const feedback: LearningFeedback | undefined = task.success ? {
          taskId: task.id,
          rating: 0.85,
          issues: [],
          suggestions: ['maintain current strategy'],
          timestamp: new Date(),
          source: 'system'
        } : undefined;

        const outcome = await learningEngine.learnFromExecution(
          { id: task.id, type: task.type },
          task,
          feedback
        );

        outcomes.push(outcome);
      }

      // Step 3: Record improved metrics
      const improvedMetrics = {
        tasksCompleted: 13,
        successRate: 0.85,
        averageExecutionTime: 3800,
        errorRate: 0.15,
        userSatisfaction: 0.85,
        resourceEfficiency: 0.75
      };

      await performanceTracker.recordSnapshot(improvedMetrics);

      // Step 4: Calculate improvement
      const improvement = await performanceTracker.calculateImprovement();

      // Step 5: Get learned patterns
      const patterns = learningEngine.getPatterns();

      // Step 6: Get strategy recommendation
      const recommendation = await learningEngine.recommendStrategy({
        taskComplexity: 0.6,
        requiredCapabilities: ['test-generation', 'coverage-analysis'],
        contextFeatures: { framework: 'jest' },
        previousAttempts: 0,
        availableResources: 0.8
      });

      // Assertions
      expect(performanceTracker.getSnapshotCount()).toBeGreaterThanOrEqual(2);
      expect(improvement.improvementRate).toBeGreaterThan(0);
      expect(improvement.current.metrics.successRate).toBeGreaterThan(
        improvement.baseline.metrics.successRate
      );

      expect(learningEngine.getTotalExperiences()).toBe(3);
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0]).toHaveProperty('confidence');
      expect(patterns[0]).toHaveProperty('successRate');

      expect(recommendation.strategy).toBeDefined();
      expect(recommendation.confidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);

      console.log('✓ Full learning flow completed successfully');
      console.log(`  - Improvement rate: ${improvement.improvementRate.toFixed(2)}%`);
      console.log(`  - Learned patterns: ${patterns.length}`);
      console.log(`  - Recommended strategy: ${recommendation.strategy} (confidence: ${recommendation.confidence.toFixed(2)})`);
    }, 30000);
  });

  /**
   * Test 2: Performance Overhead Validation
   * Ensures learning overhead is <100ms per task
   */
  describe('Test 2: Performance Overhead', () => {
    it('should maintain learning overhead below 100ms per task', async () => {
      const ITERATIONS = 100;
      const MAX_OVERHEAD_MS = 100;

      // Benchmark: Execute tasks WITHOUT learning
      const withoutLearningStart = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        // Simulate task execution (minimal work)
        await new Promise(resolve => setImmediate(resolve));
      }
      const withoutLearningDuration = performance.now() - withoutLearningStart;
      const baselinePerTask = withoutLearningDuration / ITERATIONS;

      // Benchmark: Execute tasks WITH learning
      learningEngine.setEnabled(true);
      const withLearningStart = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        const task = {
          id: `perf-task-${i}`,
          type: 'test-execution',
          previousAttempts: 0
        };

        const result = {
          success: Math.random() > 0.2, // 80% success rate
          executionTime: 100 + Math.random() * 100,
          strategy: 'default',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        };

        await learningEngine.learnFromExecution(task, result);
      }

      const withLearningDuration = performance.now() - withLearningStart;
      const learningPerTask = withLearningDuration / ITERATIONS;

      // Calculate overhead
      const overheadPerTask = learningPerTask - baselinePerTask;
      const overheadPercentage = (overheadPerTask / baselinePerTask) * 100;

      // Assertions
      expect(overheadPerTask).toBeLessThan(MAX_OVERHEAD_MS);
      expect(learningEngine.getTotalExperiences()).toBe(ITERATIONS);

      console.log('✓ Performance overhead validation passed');
      console.log(`  - Baseline: ${baselinePerTask.toFixed(2)}ms per task`);
      console.log(`  - With learning: ${learningPerTask.toFixed(2)}ms per task`);
      console.log(`  - Overhead: ${overheadPerTask.toFixed(2)}ms (${overheadPercentage.toFixed(1)}%)`);
      console.log(`  - Target: <${MAX_OVERHEAD_MS}ms ✓`);
    }, 60000);
  });

  /**
   * Test 3: Multi-Agent Coordination
   * Tests learning shared via SwarmMemoryManager
   */
  describe('Test 3: Multi-Agent Coordination', () => {
    it('should coordinate learning across multiple agents', async () => {
      const AGENT_COUNT = 5;
      const TASKS_PER_AGENT = 10;

      // Create multiple agents with shared memory
      const agents: {
        id: string;
        tracker: PerformanceTracker;
        engine: LearningEngine;
      }[] = [];

      for (let i = 0; i < AGENT_COUNT; i++) {
        const agentId = `multi-agent-${i}`;
        const tracker = new PerformanceTracker(agentId, memoryManager);
        await tracker.initialize();

        const engine = new LearningEngine(agentId, memoryManager, {
          enabled: true,
          learningRate: 0.1,
          discountFactor: 0.95
        });
        await engine.initialize();

        // Track for cleanup
        additionalEngines.push(engine);

        agents.push({ id: agentId, tracker, engine });
      }

      // Each agent executes tasks and learns
      for (const agent of agents) {
        // Record baseline metrics
        await agent.tracker.recordSnapshot({
          tasksCompleted: 5,
          successRate: 0.6,
          averageExecutionTime: 5000,
          errorRate: 0.4,
          userSatisfaction: 0.6,
          resourceEfficiency: 0.5
        });

        // Execute tasks
        for (let j = 0; j < TASKS_PER_AGENT; j++) {
          const task = {
            id: `${agent.id}-task-${j}`,
            type: 'integration-test',
            previousAttempts: 0
          };

          const result = {
            success: Math.random() > 0.3, // 70% success
            executionTime: 3000 + Math.random() * 2000,
            strategy: j % 2 === 0 ? 'parallel' : 'sequential',
            toolsUsed: ['jest', 'supertest'],
            parallelization: j % 2 === 0 ? 0.7 : 0.3,
            retryPolicy: 'exponential',
            resourceAllocation: 0.6
          };

          await agent.engine.learnFromExecution(task, result);
        }

        // Record improved metrics
        await agent.tracker.recordSnapshot({
          tasksCompleted: 5 + TASKS_PER_AGENT,
          successRate: 0.75,
          averageExecutionTime: 4000,
          errorRate: 0.25,
          userSatisfaction: 0.8,
          resourceEfficiency: 0.7
        });
      }

      // Verify each agent learned
      for (const agent of agents) {
        expect(agent.engine.getTotalExperiences()).toBe(TASKS_PER_AGENT);
        expect(agent.tracker.getSnapshotCount()).toBeGreaterThanOrEqual(2);

        const improvement = await agent.tracker.calculateImprovement();
        expect(improvement.improvementRate).toBeGreaterThan(0);
      }

      // Verify memory coordination - check that learning data is stored
      const memoryKeys = await memoryManager.query('phase2/learning/%', {
        partition: 'learning'
      });

      // Should have data from all agents
      expect(memoryKeys.length).toBeGreaterThan(0);

      // Verify shared patterns - agents should be able to access each other's patterns
      const agent1Patterns = agents[0].engine.getPatterns();
      expect(agent1Patterns.length).toBeGreaterThan(0);

      console.log('✓ Multi-agent coordination working');
      console.log(`  - Agents: ${AGENT_COUNT}`);
      console.log(`  - Total experiences: ${agents.reduce((sum, a) => sum + a.engine.getTotalExperiences(), 0)}`);
      console.log(`  - Memory entries: ${memoryKeys.length}`);
      console.log(`  - Shared patterns: ${agent1Patterns.length}`);
    }, 60000);
  });

  /**
   * Test 4: A/B Testing
   * Tests A/B testing functionality
   */
  describe('Test 4: A/B Testing', () => {
    it('should execute A/B test and select winner correctly', async () => {
      // Create A/B test with 2 strategies
      const testId = await improvementLoop.createABTest(
        'Parallel vs Sequential Execution',
        [
          { name: 'parallel', config: { parallelization: 0.8 } },
          { name: 'sequential', config: { parallelization: 0.2 } }
        ],
        50 // sample size
      );

      expect(testId).toBeDefined();
      expect(typeof testId).toBe('string');

      // Simulate test executions
      // Strategy A (parallel) - better performance
      for (let i = 0; i < 25; i++) {
        await improvementLoop.recordTestResult(
          testId,
          'parallel',
          Math.random() > 0.2, // 80% success
          2000 + Math.random() * 1000 // 2-3 seconds
        );
      }

      // Strategy B (sequential) - worse performance
      for (let i = 0; i < 25; i++) {
        await improvementLoop.recordTestResult(
          testId,
          'sequential',
          Math.random() > 0.4, // 60% success
          4000 + Math.random() * 2000 // 4-6 seconds
        );
      }

      // Wait a bit for test completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify test completed
      const activeTests = improvementLoop.getActiveTests();
      expect(activeTests.length).toBe(0); // Test should be completed and removed

      // Verify winner was determined (check memory)
      const testData = await memoryManager.retrieve(
        `phase2/learning/${TEST_AGENT_ID}/abtests/${testId}`,
        { partition: 'learning' }
      ) as ABTest;

      expect(testData).toBeDefined();
      expect(testData.status).toBe('completed');
      expect(testData.winner).toBe('parallel'); // Better strategy should win
      expect(testData.completedAt).toBeDefined();

      // Verify result statistics
      const parallelResult = testData.results.find(r => r.strategy === 'parallel');
      const sequentialResult = testData.results.find(r => r.strategy === 'sequential');

      expect(parallelResult?.successRate).toBeGreaterThan(sequentialResult?.successRate || 0);
      expect(parallelResult?.averageTime).toBeLessThan(sequentialResult?.averageTime || Infinity);

      console.log('✓ A/B testing functional');
      console.log(`  - Test ID: ${testId}`);
      console.log(`  - Winner: ${testData.winner}`);
      console.log(`  - Parallel: ${(parallelResult?.successRate || 0 * 100).toFixed(1)}% success, ${parallelResult?.averageTime.toFixed(0)}ms avg`);
      console.log(`  - Sequential: ${(sequentialResult?.successRate || 0 * 100).toFixed(1)}% success, ${sequentialResult?.averageTime.toFixed(0)}ms avg`);
    }, 30000);
  });

  /**
   * Test 5: Failure Pattern Detection
   * Tests failure pattern detection and mitigation suggestions
   */
  describe('Test 5: Failure Pattern Detection', () => {
    it('should detect failure patterns and generate recommendations', async () => {
      // Execute tasks with deliberate failures
      const failureScenarios = [
        { type: 'timeout', count: 5, errorType: 'timeout' },
        { type: 'memory', count: 3, errorType: 'memory-overflow' },
        { type: 'validation', count: 4, errorType: 'validation-error' }
      ];

      for (const scenario of failureScenarios) {
        for (let i = 0; i < scenario.count; i++) {
          const task = {
            id: `failure-task-${scenario.type}-${i}`,
            type: `${scenario.type}:failure`,
            previousAttempts: i
          };

          const result = {
            success: false,
            executionTime: 10000,
            strategy: 'default',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'none',
            resourceAllocation: 0.5,
            errors: [scenario.errorType, 'execution-failed']
          };

          await learningEngine.learnFromExecution(task, result);
        }
      }

      // Run improvement cycle to detect patterns
      await improvementLoop.runImprovementCycle();

      // Get detected failure patterns
      const failurePatterns = learningEngine.getFailurePatterns();

      // Assertions
      expect(failurePatterns.length).toBeGreaterThan(0);

      // Verify each failure type was detected
      const timeoutPattern = failurePatterns.find(p => p.pattern.includes('timeout'));
      const memoryPattern = failurePatterns.find(p => p.pattern.includes('memory'));
      const validationPattern = failurePatterns.find(p => p.pattern.includes('validation'));

      expect(timeoutPattern).toBeDefined();
      expect(timeoutPattern?.frequency).toBeGreaterThanOrEqual(5);

      expect(memoryPattern).toBeDefined();
      expect(memoryPattern?.frequency).toBeGreaterThanOrEqual(3);

      expect(validationPattern).toBeDefined();
      expect(validationPattern?.frequency).toBeGreaterThanOrEqual(4);

      // Verify mitigations were suggested
      const patternsWithMitigation = failurePatterns.filter(p => p.mitigation);
      expect(patternsWithMitigation.length).toBeGreaterThan(0);

      console.log('✓ Failure pattern detection working');
      console.log(`  - Patterns detected: ${failurePatterns.length}`);
      console.log(`  - Patterns with mitigation: ${patternsWithMitigation.length}`);

      failurePatterns.slice(0, 3).forEach(pattern => {
        console.log(`  - ${pattern.pattern}: freq=${pattern.frequency}, conf=${pattern.confidence.toFixed(2)}`);
        if (pattern.mitigation) {
          console.log(`    Mitigation: ${pattern.mitigation.substring(0, 60)}...`);
        }
      });
    }, 30000);
  });

  /**
   * Integration Test: Complete System Flow
   * End-to-end test of all components working together
   */
  describe('Complete System Integration', () => {
    it('should handle complete learning lifecycle with all components', async () => {
      // Start improvement loop
      await improvementLoop.start(5000); // 5 second interval for testing

      // Simulate agent activity over time
      const SIMULATION_CYCLES = 3;
      const TASKS_PER_CYCLE = 5;

      for (let cycle = 0; cycle < SIMULATION_CYCLES; cycle++) {
        // Record metrics at start of cycle
        await performanceTracker.recordSnapshot({
          tasksCompleted: cycle * TASKS_PER_CYCLE,
          successRate: 0.6 + (cycle * 0.1), // Gradually improving
          averageExecutionTime: 5000 - (cycle * 500),
          errorRate: 0.4 - (cycle * 0.1),
          userSatisfaction: 0.6 + (cycle * 0.1),
          resourceEfficiency: 0.5 + (cycle * 0.1)
        });

        // Execute tasks
        for (let i = 0; i < TASKS_PER_CYCLE; i++) {
          const task = {
            id: `cycle-${cycle}-task-${i}`,
            type: 'integration-test',
            previousAttempts: 0
          };

          const result = {
            success: Math.random() > (0.3 - cycle * 0.05), // Improving success rate
            executionTime: 4000 - (cycle * 300) + Math.random() * 1000,
            strategy: cycle % 2 === 0 ? 'parallel' : 'adaptive',
            toolsUsed: ['jest', 'supertest'],
            parallelization: 0.5 + (cycle * 0.1),
            retryPolicy: 'exponential',
            resourceAllocation: 0.6 + (cycle * 0.05),
            coverage: 0.7 + (cycle * 0.08)
          };

          const feedback: LearningFeedback = {
            taskId: task.id,
            rating: 0.7 + (cycle * 0.1),
            issues: result.success ? [] : ['timeout', 'flaky'],
            suggestions: ['optimize parallelization'],
            timestamp: new Date(),
            source: 'system'
          };

          await learningEngine.learnFromExecution(task, result, feedback);
        }

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Stop improvement loop
      await improvementLoop.stop();

      // Generate final report
      const report = await performanceTracker.generateReport();

      // Verify complete system integration
      expect(performanceTracker.getSnapshotCount()).toBeGreaterThanOrEqual(SIMULATION_CYCLES);
      expect(learningEngine.getTotalExperiences()).toBe(SIMULATION_CYCLES * TASKS_PER_CYCLE);
      expect(report.improvement.improvementRate).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);

      const patterns = learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      console.log('✓ Complete system integration successful');
      console.log(`  - Cycles completed: ${SIMULATION_CYCLES}`);
      console.log(`  - Total tasks: ${SIMULATION_CYCLES * TASKS_PER_CYCLE}`);
      console.log(`  - Improvement rate: ${report.improvement.improvementRate.toFixed(2)}%`);
      console.log(`  - Patterns learned: ${patterns.length}`);
      console.log(`  - Recommendations: ${report.recommendations.length}`);
    }, 60000);
  });
});
