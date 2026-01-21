/**
 * Learning Improvement Validation - 10-Iteration Test
 *
 * Validates that agents show measurable improvement (15%+) over 10 iterations.
 * This is the key success metric for Phase 2-4 learning implementation.
 */

import { TestGeneratorAgent } from '../../../src/agents/TestGeneratorAgent';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { createAgentDBManager } from '../../../src/core/memory/AgentDBManager';
import { EventEmitter } from 'events';
import { QETask, AgentContext, AgentType } from '../../../src/types';

describe('Learning Improvement Validation (10 Iterations)', () => {
  let memoryStore: SwarmMemoryManager;
  let eventBus: EventEmitter;

  beforeAll(async () => {
    const agentDB = createAgentDBManager({
      dbPath: ':memory:',
      enableLearning: true,
      enableReasoning: true
    });
    await agentDB.initialize();

    memoryStore = new SwarmMemoryManager({
      dbPath: ':memory:',
      cacheSize: 1000,
      ttl: 3600000
    });
    await memoryStore.initialize();

    eventBus = new EventEmitter();
  });

  afterAll(async () => {
    if (memoryStore) {
      await memoryStore.shutdown();
    }
  });

  it('should show 15%+ improvement over 10 iterations (test generation)', async () => {
    const agentId = 'improvement-validation-' + Date.now();
    const context: AgentContext = {
      id: agentId,
      type: 'test-generator' as AgentType,
      status: 'idle',
      metadata: {}
    };

    const agent = new TestGeneratorAgent({
      id: agentId,
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing', 'integration-testing'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest', 'mocha'],
      generationStrategies: ['boundary-value', 'equivalence-class', 'mutation-testing'],
      coverageTarget: 90,
      learningEnabled: true
    });

    const coverageResults: number[] = [];
    const executionTimes: number[] = [];
    const testCounts: number[] = [];

    console.log('\n=== Starting 10-Iteration Learning Validation ===');

    // Execute 10 iterations of the same task type
    for (let i = 0; i < 10; i++) {
      const task: QETask = {
        id: `validation-iteration-${i}`,
        type: 'test-generation',
        description: `Generate comprehensive test suite - iteration ${i + 1}`,
        requirements: {
          targetFiles: ['src/services/UserService.ts'],
          framework: 'jest',
          coverageTarget: 90,
          testTypes: ['unit', 'integration']
        },
        priority: 'high',
        createdAt: new Date(),
        status: 'pending'
      };

      const startTime = Date.now();
      const result = await agent.executeTask(task);
      const endTime = Date.now();

      const coverage = result.metrics?.coverage || 0;
      const executionTime = endTime - startTime;
      const testCount = result.testsGenerated?.length || 0;

      coverageResults.push(coverage);
      executionTimes.push(executionTime);
      testCounts.push(testCount);

      console.log(`Iteration ${i + 1}: Coverage=${coverage.toFixed(2)}%, Time=${executionTime}ms, Tests=${testCount}`);

      // Small delay between iterations
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Calculate improvement metrics
    const baselineCoverage = coverageResults.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const finalCoverage = coverageResults.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const coverageImprovement = ((finalCoverage - baselineCoverage) / baselineCoverage) * 100;

    const baselineTime = executionTimes.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const finalTime = executionTimes.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const timeImprovement = ((baselineTime - finalTime) / baselineTime) * 100;

    const baselineTests = testCounts.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const finalTests = testCounts.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const testCountImprovement = ((finalTests - baselineTests) / baselineTests) * 100;

    console.log('\n=== Learning Improvement Results ===');
    console.log(`Coverage: ${baselineCoverage.toFixed(2)}% → ${finalCoverage.toFixed(2)}% (${coverageImprovement.toFixed(2)}% improvement)`);
    console.log(`Execution Time: ${baselineTime.toFixed(0)}ms → ${finalTime.toFixed(0)}ms (${timeImprovement.toFixed(2)}% improvement)`);
    console.log(`Test Count: ${baselineTests.toFixed(1)} → ${finalTests.toFixed(1)} (${testCountImprovement.toFixed(2)}% improvement)`);

    // Verify at least one metric shows 15%+ improvement
    const improvements = [coverageImprovement, timeImprovement, testCountImprovement];
    const maxImprovement = Math.max(...improvements);

    console.log(`\nMaximum Improvement: ${maxImprovement.toFixed(2)}%`);
    expect(maxImprovement).toBeGreaterThanOrEqual(15);

    // Verify learning patterns were created
    const learningEngine = (agent as any).learningEngine;
    const patterns = await learningEngine.getPatterns();
    console.log(`\nLearned Patterns: ${patterns.length}`);
    expect(patterns.length).toBeGreaterThan(0);

    // Verify total experiences
    const totalExperiences = learningEngine.getTotalExperiences();
    console.log(`Total Experiences: ${totalExperiences}`);
    expect(totalExperiences).toBe(10);

    await agent.shutdown();
  }, 120000); // 2 minute timeout

  it('should show consistent improvement trend', async () => {
    const agentId = 'trend-validation-' + Date.now();
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
      generationStrategies: ['boundary-value', 'equivalence-class'],
      coverageTarget: 85,
      learningEnabled: true
    });

    const scores: number[] = [];

    // Execute 10 iterations
    for (let i = 0; i < 10; i++) {
      const task: QETask = {
        id: `trend-iteration-${i}`,
        type: 'test-generation',
        description: 'Generate unit tests',
        requirements: {
          targetFiles: ['src/utils/DataProcessor.ts'],
          framework: 'jest',
          coverageTarget: 85
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agent.executeTask(task);

      // Composite score: coverage * test quality
      const coverage = result.metrics?.coverage || 0;
      const testQuality = result.metrics?.quality || 0.5;
      const score = coverage * testQuality;

      scores.push(score);

      await new Promise(resolve => setTimeout(resolve, 150));
    }

    // Calculate trend (should be generally upward)
    let increasingCount = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] >= scores[i - 1] * 0.95) { // Allow 5% variance
        increasingCount++;
      }
    }

    // At least 60% of iterations should show improvement or maintenance
    const improvementRatio = increasingCount / (scores.length - 1);
    console.log(`\nTrend Analysis: ${improvementRatio.toFixed(2)} (${increasingCount}/${scores.length - 1} iterations improved)`);
    expect(improvementRatio).toBeGreaterThanOrEqual(0.6);

    await agent.shutdown();
  }, 90000);

  it('should persist improvement across agent restart', async () => {
    const agentId = 'persist-improvement-' + Date.now();
    const context: AgentContext = {
      id: agentId,
      type: 'test-generator' as AgentType,
      status: 'idle',
      metadata: {}
    };

    // First session: 5 iterations
    const agent1 = new TestGeneratorAgent({
      id: agentId,
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['mutation-testing'],
      coverageTarget: 85,
      learningEnabled: true
    });

    const session1Scores: number[] = [];
    for (let i = 0; i < 5; i++) {
      const task: QETask = {
        id: `session1-${i}`,
        type: 'test-generation',
        description: 'Generate tests session 1',
        requirements: {
          targetFiles: ['src/models/Product.ts'],
          framework: 'jest'
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agent1.executeTask(task);
      session1Scores.push(result.metrics?.coverage || 0);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await agent1.shutdown();

    // Second session: 5 more iterations (after restart)
    const agent2 = new TestGeneratorAgent({
      id: agentId, // Same ID to restore state
      type: 'test-generator' as AgentType,
      capabilities: ['unit-testing'],
      context,
      memoryStore,
      eventBus,
      frameworks: ['jest'],
      generationStrategies: ['mutation-testing'],
      coverageTarget: 85,
      learningEnabled: true
    });

    const session2Scores: number[] = [];
    for (let i = 0; i < 5; i++) {
      const task: QETask = {
        id: `session2-${i}`,
        type: 'test-generation',
        description: 'Generate tests session 2',
        requirements: {
          targetFiles: ['src/models/Product.ts'],
          framework: 'jest'
        },
        priority: 'medium',
        createdAt: new Date(),
        status: 'pending'
      };

      const result = await agent2.executeTask(task);
      session2Scores.push(result.metrics?.coverage || 0);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Session 2 should start where session 1 ended (or better)
    const session1Avg = session1Scores.reduce((a, b) => a + b, 0) / session1Scores.length;
    const session2Avg = session2Scores.reduce((a, b) => a + b, 0) / session2Scores.length;

    console.log(`\nSession 1 Average: ${session1Avg.toFixed(2)}%`);
    console.log(`Session 2 Average: ${session2Avg.toFixed(2)}%`);

    // Session 2 should maintain or exceed session 1 performance
    expect(session2Avg).toBeGreaterThanOrEqual(session1Avg * 0.95);

    await agent2.shutdown();
  }, 90000);
});
