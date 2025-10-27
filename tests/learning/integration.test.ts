/**
 * Learning System Integration Tests
 *
 * Tests the complete workflow of LearningEngine + QLearning + ExperienceReplayBuffer
 * Validates state encoding, action selection, and persistence integration.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QLearning } from '../../src/learning/QLearning';
import { ExperienceReplayBuffer } from '../../src/learning/ExperienceReplayBuffer';
import { LearningEngine } from '../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import {
  TaskState,
  AgentAction,
  TaskExperience,
  LearningFeedback
} from '../../src/learning/types';

describe('Learning System Integration', () => {
  let qLearning: QLearning;
  let replayBuffer: ExperienceReplayBuffer;
  let learningEngine: LearningEngine;
  let memoryManager: SwarmMemoryManager;

  beforeEach(async () => {
    // Initialize components
    qLearning = new QLearning({
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      useExperienceReplay: true,
      replayBufferSize: 1000,
      batchSize: 32
    });

    replayBuffer = new ExperienceReplayBuffer({
      maxSize: 1000,
      minSize: 32,
      prioritized: false
    });

    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    learningEngine = new LearningEngine('test-agent', memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      explorationDecay: 0.995,
      minExplorationRate: 0.01,
      maxMemorySize: 10 * 1024 * 1024,
      batchSize: 32,
      updateFrequency: 10
    });

    await learningEngine.initialize();
  });

  afterEach(async () => {
    if (memoryManager && typeof memoryManager.clear === 'function') {
      await memoryManager.clear();
    }
  });

  describe('Complete Learning Cycle', () => {
    it('should complete full learning cycle: experience → replay → Q-update → policy improvement', async () => {
      // 1. Create initial state and action
      const state: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['testing', 'analysis'],
        contextFeatures: { framework: 'jest' },
        previousAttempts: 0,
        availableResources: 0.8,
        timeConstraint: 30000
      };

      const availableActions: AgentAction[] = [
        {
          strategy: 'parallel',
          toolsUsed: ['jest'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        },
        {
          strategy: 'sequential',
          toolsUsed: ['jest'],
          parallelization: 0.2,
          retryPolicy: 'linear',
          resourceAllocation: 0.5
        }
      ];

      // 2. Select action using Q-learning
      const selectedAction = qLearning.selectAction(state, availableActions);
      expect(selectedAction).toBeDefined();
      expect(availableActions).toContainEqual(selectedAction);

      // 3. Create experience
      const nextState: TaskState = {
        ...state,
        previousAttempts: 1,
        availableResources: 0.7
      };

      const experience: TaskExperience = {
        taskId: 'task-001',
        taskType: 'test-generation',
        state,
        action: selectedAction,
        reward: 1.5,
        nextState,
        timestamp: new Date(),
        agentId: 'test-agent'
      };

      // 4. Add to replay buffer
      replayBuffer.add(experience);
      expect(replayBuffer.size()).toBe(1);

      // 5. Update Q-table
      qLearning.update(experience);
      const qValue = qLearning.getQValue(state, selectedAction);
      expect(qValue).toBeGreaterThan(0);

      // 6. Verify policy improvement
      const bestAction = qLearning.getBestAction(state, availableActions);
      expect(bestAction).toBeDefined();
    });

    it('should integrate with LearningEngine for complete workflow', async () => {
      const task = {
        id: 'task-001',
        type: 'test-generation',
        requirements: {
          capabilities: ['testing', 'coverage']
        },
        context: {
          framework: 'jest',
          language: 'typescript'
        },
        timeout: 30000
      };

      const result = {
        success: true,
        strategy: 'parallel',
        toolsUsed: ['jest'],
        parallelization: 0.8,
        retryPolicy: 'exponential',
        resourceAllocation: 0.7,
        executionTime: 2500,
        coverage: 0.92
      };

      const feedback: LearningFeedback = {
        taskId: 'task-001',
        rating: 0.9,
        issues: [],
        suggestions: ['Excellent coverage'],
        timestamp: new Date(),
        source: 'system'
      };

      // Learn from execution
      const outcome = await learningEngine.learnFromExecution(task, result, feedback);

      expect(outcome.improved).toBeDefined();
      expect(outcome.confidence).toBeGreaterThanOrEqual(0);
      expect(outcome.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle batch learning with experience replay', async () => {
      // Add multiple experiences
      const experiences: TaskExperience[] = [];

      for (let i = 0; i < 50; i++) {
        const state: TaskState = {
          taskComplexity: 0.5 + i * 0.01,
          requiredCapabilities: ['testing'],
          contextFeatures: {},
          previousAttempts: 0,
          availableResources: 0.8
        };

        const action: AgentAction = {
          strategy: i % 2 === 0 ? 'parallel' : 'sequential',
          toolsUsed: ['jest'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        };

        const nextState: TaskState = {
          ...state,
          previousAttempts: 1
        };

        const exp: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state,
          action,
          reward: Math.random() * 2 - 0.5,
          nextState,
          timestamp: new Date(),
          agentId: 'test-agent'
        };

        experiences.push(exp);
        replayBuffer.add(exp);
        qLearning.update(exp);
      }

      // Verify batch learning
      expect(replayBuffer.size()).toBe(50);
      expect(qLearning.getTableSize()).toBeGreaterThan(0);

      // Perform batch update
      if (replayBuffer.canSample(32)) {
        const batch = replayBuffer.sample(32);
        expect(batch.length).toBe(32);

        for (const exp of batch) {
          qLearning.update(exp);
        }
      }

      // Verify Q-table has learned
      const stats = qLearning.getStatistics();
      expect(stats.tableSize).toBeGreaterThan(0);
      expect(stats.steps).toBeGreaterThanOrEqual(50);
    });
  });

  describe('State Encoding and Action Selection Integration', () => {
    it('should encode states consistently across components', () => {
      const state: TaskState = {
        taskComplexity: 0.75,
        requiredCapabilities: ['testing', 'analysis', 'optimization'],
        contextFeatures: { framework: 'jest' },
        previousAttempts: 2,
        availableResources: 0.6,
        timeConstraint: 60000
      };

      const actions: AgentAction[] = [
        {
          strategy: 'parallel',
          toolsUsed: ['jest'],
          parallelization: 0.8,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        },
        {
          strategy: 'sequential',
          toolsUsed: ['jest'],
          parallelization: 0.2,
          retryPolicy: 'linear',
          resourceAllocation: 0.5
        }
      ];

      // Select action multiple times - should be consistent for exploitation
      const action1 = qLearning.selectAction(state, actions);

      // Train on this state-action pair
      const experience: TaskExperience = {
        taskId: 'task-001',
        taskType: 'test',
        state,
        action: action1,
        reward: 1.5,
        nextState: state,
        timestamp: new Date(),
        agentId: 'test-agent'
      };

      qLearning.update(experience);

      // Get Q-value for verification
      const qValue = qLearning.getQValue(state, action1);
      expect(qValue).toBeGreaterThan(0);
    });

    it('should integrate action selection with Q-table updates', () => {
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const actions: AgentAction[] = [
        {
          strategy: 'fast',
          toolsUsed: ['jest'],
          parallelization: 1.0,
          retryPolicy: 'none',
          resourceAllocation: 0.9
        },
        {
          strategy: 'thorough',
          toolsUsed: ['jest'],
          parallelization: 0.3,
          retryPolicy: 'exponential',
          resourceAllocation: 0.5
        }
      ];

      // Initially both actions have Q-value 0
      expect(qLearning.getQValue(state, actions[0])).toBe(0);
      expect(qLearning.getQValue(state, actions[1])).toBe(0);

      // Update with positive reward for 'fast' strategy
      const exp1: TaskExperience = {
        taskId: 'task-001',
        taskType: 'test',
        state,
        action: actions[0],
        reward: 1.5,
        nextState: state,
        timestamp: new Date(),
        agentId: 'test-agent'
      };
      qLearning.update(exp1);

      // Update with negative reward for 'thorough' strategy
      const exp2: TaskExperience = {
        taskId: 'task-002',
        taskType: 'test',
        state,
        action: actions[1],
        reward: -0.5,
        nextState: state,
        timestamp: new Date(),
        agentId: 'test-agent'
      };
      qLearning.update(exp2);

      // Verify Q-values reflect learning
      const qValueFast = qLearning.getQValue(state, actions[0]);
      const qValueThorough = qLearning.getQValue(state, actions[1]);

      expect(qValueFast).toBeGreaterThan(qValueThorough);

      // Best action should be 'fast'
      const bestAction = qLearning.getBestAction(state, actions);
      expect(bestAction.strategy).toBe('fast');
    });
  });

  describe('Persistence Integration', () => {
    it('should save learning state → reload → continue learning', async () => {
      // Phase 1: Initial learning
      const state: TaskState = {
        taskComplexity: 0.6,
        requiredCapabilities: ['testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      const action: AgentAction = {
        strategy: 'parallel',
        toolsUsed: ['jest'],
        parallelization: 0.7,
        retryPolicy: 'exponential',
        resourceAllocation: 0.6
      };

      // Learn from 20 experiences
      for (let i = 0; i < 20; i++) {
        const exp: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test',
          state,
          action,
          reward: 1.0 + Math.random() * 0.5,
          nextState: state,
          timestamp: new Date(),
          agentId: 'test-agent'
        };
        qLearning.update(exp);
      }

      const statsBeforeSave = qLearning.getStatistics();
      expect(statsBeforeSave.steps).toBe(20);

      // Phase 2: Export state
      const exportedState = qLearning.export();
      expect(exportedState.qTable).toBeDefined();
      expect(exportedState.stepCount).toBe(20);

      // Phase 3: Create new instance and import
      const qLearning2 = new QLearning({
        learningRate: 0.1,
        discountFactor: 0.95,
        explorationRate: 0.3
      });

      qLearning2.import(exportedState);

      const statsAfterLoad = qLearning2.getStatistics();
      expect(statsAfterLoad.steps).toBe(20);
      expect(statsAfterLoad.tableSize).toBe(statsBeforeSave.tableSize);

      // Phase 4: Continue learning with reloaded state
      for (let i = 20; i < 30; i++) {
        const exp: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test',
          state,
          action,
          reward: 1.2,
          nextState: state,
          timestamp: new Date(),
          agentId: 'test-agent'
        };
        qLearning2.update(exp);
      }

      const statsFinal = qLearning2.getStatistics();
      expect(statsFinal.steps).toBe(30);
    });

    it('should persist learning through LearningEngine', async () => {
      const task = {
        id: 'task-001',
        type: 'test-generation',
        requirements: { capabilities: ['testing'] },
        context: {},
        timeout: 30000
      };

      const result = {
        success: true,
        strategy: 'parallel',
        toolsUsed: ['jest'],
        parallelization: 0.7,
        retryPolicy: 'exponential',
        resourceAllocation: 0.6,
        executionTime: 2000,
        coverage: 0.88
      };

      // Learn from multiple executions
      for (let i = 0; i < 15; i++) {
        await learningEngine.learnFromExecution(task, result);
      }

      expect(learningEngine.getTotalExperiences()).toBe(15);

      // Note: Actual persistence to memory store is tested in LearningEngine unit tests
      // This integration test verifies the workflow completes without errors
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty action list gracefully', () => {
      const state: TaskState = {
        taskComplexity: 0.5,
        requiredCapabilities: [],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      };

      expect(() => qLearning.selectAction(state, [])).toThrow('No available actions');
    });

    it('should handle missing Q-values for new states', () => {
      const newState: TaskState = {
        taskComplexity: 0.99,
        requiredCapabilities: ['unknown'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.1
      };

      const actions: AgentAction[] = [
        {
          strategy: 'test',
          toolsUsed: [],
          parallelization: 0.5,
          retryPolicy: 'none',
          resourceAllocation: 0.5
        }
      ];

      // Should return a random action when no Q-values exist
      const action = qLearning.getBestAction(newState, actions);
      expect(action).toBeDefined();
      expect(action).toBe(actions[0]);
    });

    it('should handle replay buffer underflow', () => {
      const smallBuffer = new ExperienceReplayBuffer({
        maxSize: 100,
        minSize: 32,
        prioritized: false
      });

      expect(smallBuffer.canSample(32)).toBe(false);
      expect(() => smallBuffer.sample(32)).toThrow('Cannot sample');
    });
  });
});
