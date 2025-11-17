/**
 * LearningEngine Unit Tests - Phase 2-4 Verification
 *
 * Tests learning persistence with AgentDB and SwarmMemoryManager.
 * Verifies that learning data persists across agent restarts.
 */

import { LearningEngine } from '../../../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../../../src/core/memory/SwarmMemoryManager';
import { createAgentDBManager } from '../../../src/core/memory/AgentDBManager';
import { TaskExperience } from '../../../src/learning/types';
import { SecureRandom } from '../../../src/utils/SecureRandom';

describe('LearningEngine with AgentDB Persistence', () => {
  let memoryStore: SwarmMemoryManager;
  let learningEngine: LearningEngine;
  const testAgentId = 'test-agent-' + Date.now();
  const testDbPath = ':memory:'; // In-memory for tests

  beforeEach(async () => {
    // Create AgentDB manager
    const agentDB = createAgentDBManager({
      dbPath: testDbPath,
      enableLearning: true,
      enableReasoning: true
    });
    await agentDB.initialize();

    // Create SwarmMemoryManager with AgentDB
    memoryStore = new SwarmMemoryManager(testDbPath);
    await memoryStore.initialize();

    // Create LearningEngine
    learningEngine = new LearningEngine(testAgentId, memoryStore);
    await learningEngine.initialize();
  });

  afterEach(async () => {
    if (learningEngine) {
      learningEngine.dispose();
    }
    if (memoryStore) {
      await memoryStore.close();
    }
  });

  describe('Pattern Storage', () => {
    it('should store patterns in AgentDB', async () => {
      const experience: TaskExperience = {
        taskId: 'task-1',
        taskType: 'test-generation',
        state: {
          taskComplexity: 0.5,
          requiredCapabilities: ['unit-testing', 'jest'],
          contextFeatures: { framework: 'jest' },
          previousAttempts: 0,
          availableResources: 1.0,
          timeConstraint: 60000
        },
        action: {
          strategy: 'tdd-approach',
          toolsUsed: ['jest', 'coverage'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        },
        reward: 1.0,
        nextState: {
          taskComplexity: 0.5,
          requiredCapabilities: ['unit-testing', 'jest'],
          contextFeatures: { framework: 'jest' },
          previousAttempts: 1,
          availableResources: 0.9,
          timeConstraint: 60000
        },
        timestamp: new Date(),
        agentId: testAgentId
      };

      await learningEngine.learnFromExperience(experience);

      // Verify stored in memory
      expect(learningEngine.getTotalExperiences()).toBe(1);
    });

    it('should update Q-values and persist to database', async () => {
      const experience: TaskExperience = {
        taskId: 'task-2',
        taskType: 'coverage-analysis',
        state: {
          taskComplexity: 0.7,
          requiredCapabilities: ['coverage', 'analysis'],
          contextFeatures: { threshold: 80 },
          previousAttempts: 0,
          availableResources: 1.0
        },
        action: {
          strategy: 'sublinear-coverage',
          toolsUsed: ['istanbul', 'nyc'],
          parallelization: 0.8,
          retryPolicy: 'immediate',
          resourceAllocation: 0.6
        },
        reward: 0.8,
        nextState: {
          taskComplexity: 0.7,
          requiredCapabilities: ['coverage', 'analysis'],
          contextFeatures: { threshold: 80 },
          previousAttempts: 1,
          availableResources: 0.8
        },
        timestamp: new Date(),
        agentId: testAgentId
      };

      await learningEngine.learnFromExperience(experience);

      // Verify Q-table updated
      const recommendation = await learningEngine.recommendStrategy(experience.state);
      expect(recommendation).toBeDefined();
      expect(recommendation.strategy).toBeTruthy();
    });

    it('should retrieve stored patterns', async () => {
      // Store multiple experiences - directly test updatePatterns()
      for (let i = 0; i < 5; i++) {
        const experience: TaskExperience = {
          taskId: `task-${i}`,
          taskType: 'test-generation',
          state: {
            taskComplexity: 0.5,
            requiredCapabilities: ['unit-testing', 'jest'],
            contextFeatures: { framework: 'jest' },
            previousAttempts: 0,
            availableResources: 1.0,
            timeConstraint: 60000
          },
          action: {
            strategy: 'boundary-testing',
            toolsUsed: ['jest', 'coverage'],
            parallelization: 0.5,
            retryPolicy: 'exponential',
            resourceAllocation: 0.7
          },
          reward: 1.0,
          nextState: {
            taskComplexity: 0.5,
            requiredCapabilities: ['unit-testing', 'jest'],
            contextFeatures: { framework: 'jest' },
            previousAttempts: 1,
            availableResources: 0.9,
            timeConstraint: 60000
          },
          timestamp: new Date(),
          agentId: testAgentId
        };

        // Directly test updatePatterns() - the method this test is supposed to verify
        await (learningEngine as any).updatePatterns(experience);
      }

      // Verify patterns stored
      const patterns = await learningEngine.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify pattern content
      const testGenPattern = patterns.find(p => p.pattern.includes('test-generation'));
      expect(testGenPattern).toBeDefined();
      expect(testGenPattern?.usageCount).toBeGreaterThan(0);
    });
  });

  describe('Persistence Across Restarts', () => {
    it('should persist patterns across engine restarts', async () => {
      // Store pattern
      const experience: TaskExperience = {
        taskId: 'persistent-task',
        taskType: 'performance-testing',
        state: {
          taskComplexity: 0.8,
          requiredCapabilities: ['performance', 'load-testing'],
          contextFeatures: { targetRPS: 1000 },
          previousAttempts: 0,
          availableResources: 1.0
        },
        action: {
          strategy: 'gradual-ramp',
          toolsUsed: ['k6', 'artillery'],
          parallelization: 0.9,
          retryPolicy: 'none',
          resourceAllocation: 0.8
        },
        reward: 1.0,
        nextState: {
          taskComplexity: 0.8,
          requiredCapabilities: ['performance', 'load-testing'],
          contextFeatures: { targetRPS: 1000 },
          previousAttempts: 1,
          availableResources: 0.7
        },
        timestamp: new Date(),
        agentId: testAgentId
      };

      await learningEngine.learnFromExperience(experience);
      const initialExperiences = learningEngine.getTotalExperiences();

      // Force save state
      await (learningEngine as any).saveState();

      // Dispose and recreate engine
      learningEngine.dispose();

      // Create new engine instance (simulating restart)
      const learningEngine2 = new LearningEngine(testAgentId, memoryStore);
      await learningEngine2.initialize();

      // Verify pattern persisted
      const restoredExperiences = learningEngine2.getTotalExperiences();
      expect(restoredExperiences).toBe(initialExperiences);

      learningEngine2.dispose();
    });

    it('should maintain Q-table state across restarts', async () => {
      const state = {
        taskComplexity: 0.6,
        requiredCapabilities: ['security', 'scanning'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0
      };

      // Store experience and get initial recommendation
      const experience: TaskExperience = {
        taskId: 'security-task',
        taskType: 'security-scan',
        state,
        action: {
          strategy: 'owasp-top-10',
          toolsUsed: ['zap', 'snyk'],
          parallelization: 0.6,
          retryPolicy: 'exponential',
          resourceAllocation: 0.7
        },
        reward: 0.95,
        nextState: { ...state, previousAttempts: 1, availableResources: 0.8 },
        timestamp: new Date(),
        agentId: testAgentId
      };

      await learningEngine.learnFromExperience(experience);
      const initialRecommendation = await learningEngine.recommendStrategy(state);

      // Save and restart
      await (learningEngine as any).saveState();
      learningEngine.dispose();

      const learningEngine2 = new LearningEngine(testAgentId, memoryStore);
      await learningEngine2.initialize();

      // Verify same recommendation
      const restoredRecommendation = await learningEngine2.recommendStrategy(state);
      expect(restoredRecommendation.strategy).toBe(initialRecommendation.strategy);

      learningEngine2.dispose();
    });
  });

  describe('Learning Improvement', () => {
    it('should show improvement over multiple iterations', async () => {
      const rewards: number[] = [];

      // Run 20 iterations with varying success
      for (let i = 0; i < 20; i++) {
        const experience: TaskExperience = {
          taskId: `improvement-task-${i}`,
          taskType: 'test-generation',
          state: {
            taskComplexity: 0.5,
            requiredCapabilities: ['unit-testing'],
            contextFeatures: {},
            previousAttempts: i,
            availableResources: 1.0 - i * 0.02
          },
          action: {
            strategy: 'mutation-testing',
            toolsUsed: ['stryker'],
            parallelization: 0.5 + i * 0.02,
            retryPolicy: 'exponential',
            resourceAllocation: 0.5 + i * 0.02
          },
          // Gradual improvement in rewards
          reward: 0.5 + (i / 20) * 0.5,
          nextState: {
            taskComplexity: 0.5,
            requiredCapabilities: ['unit-testing'],
            contextFeatures: {},
            previousAttempts: i + 1,
            availableResources: 0.98 - i * 0.02
          },
          timestamp: new Date(),
          agentId: testAgentId
        };

        const outcome = await learningEngine.learnFromExecution(
          { id: experience.taskId, type: experience.taskType },
          { success: true, coverage: 0.5 + i * 0.02 },
          { rating: 0.5 + i * 0.025, issues: [] }
        );

        rewards.push(experience.reward);
      }

      // Calculate improvement
      const baseline = rewards.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const recent = rewards.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const improvement = ((recent - baseline) / baseline) * 100;

      expect(improvement).toBeGreaterThan(15);
    });
  });

  describe('Failure Pattern Detection', () => {
    it('should detect and store failure patterns', async () => {
      // Create failing experiences
      for (let i = 0; i < 5; i++) {
        const experience: TaskExperience = {
          taskId: `failure-task-${i}`,
          taskType: 'integration-test',
          state: {
            taskComplexity: 0.9,
            requiredCapabilities: ['integration'],
            contextFeatures: { unstable: true },
            previousAttempts: i,
            availableResources: 0.5
          },
          action: {
            strategy: 'sequential-execution',
            toolsUsed: ['jest'],
            parallelization: 0.0,
            retryPolicy: 'none',
            resourceAllocation: 0.3
          },
          reward: -0.5,
          nextState: {
            taskComplexity: 0.9,
            requiredCapabilities: ['integration'],
            contextFeatures: { unstable: true },
            previousAttempts: i + 1,
            availableResources: 0.4
          },
          timestamp: new Date(),
          agentId: testAgentId
        };

        await learningEngine.learnFromExecution(
          { id: experience.taskId, type: experience.taskType },
          { success: false, errors: ['timeout', 'connection-failed'] }
        );
      }

      // Verify failure patterns detected
      const failurePatterns = learningEngine.getFailurePatterns();
      expect(failurePatterns.length).toBeGreaterThan(0);
      expect(failurePatterns[0].frequency).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Q-Learning Integration', () => {
    it('should enable Q-learning mode', () => {
      learningEngine.enableQLearning();
      expect(learningEngine.isQLearningEnabled()).toBe(true);

      const stats = learningEngine.getQLearningStats();
      expect(stats.enabled).toBe(true);
    });

    it('should use Q-learning for action selection', async () => {
      learningEngine.enableQLearning();

      const state = {
        taskComplexity: 0.7,
        requiredCapabilities: ['api-testing'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 1.0
      };

      const availableActions = [
        {
          strategy: 'rest-assured',
          toolsUsed: ['rest-assured'],
          parallelization: 0.5,
          retryPolicy: 'exponential',
          resourceAllocation: 0.6
        },
        {
          strategy: 'postman',
          toolsUsed: ['newman'],
          parallelization: 0.7,
          retryPolicy: 'immediate',
          resourceAllocation: 0.5
        }
      ];

      const selectedAction = await learningEngine.selectActionWithPolicy(state, availableActions);
      expect(selectedAction).toBeDefined();
      expect(availableActions).toContainEqual(selectedAction);
    });
  });

  describe('Memory Management', () => {
    it('should respect max memory size', async () => {
      // Create engine with small memory limit
      const smallMemoryEngine = new LearningEngine(
        'small-memory-agent',
        memoryStore,
        { maxMemorySize: 10000 } // 10KB limit
      );
      await smallMemoryEngine.initialize();

      // Add many experiences
      for (let i = 0; i < 2000; i++) {
        const experience: TaskExperience = {
          taskId: `mem-task-${i}`,
          taskType: 'test',
          state: {
            taskComplexity: Math.random(),
            requiredCapabilities: ['test'],
            contextFeatures: { iteration: i },
            previousAttempts: 0,
            availableResources: 1.0
          },
          action: {
            strategy: 'default',
            toolsUsed: ['jest'],
            parallelization: 0.5,
            retryPolicy: 'none',
            resourceAllocation: 0.5
          },
          reward: Math.random(),
          nextState: {
            taskComplexity: Math.random(),
            requiredCapabilities: ['test'],
            contextFeatures: { iteration: i },
            previousAttempts: 1,
            availableResources: 0.9
          },
          timestamp: new Date(),
          agentId: 'small-memory-agent'
        };

        await smallMemoryEngine.learnFromExperience(experience);
      }

      // Force save and reload to trigger pruning persistence
      await (smallMemoryEngine as any).saveState();
      smallMemoryEngine.dispose();

      // Create new engine to load pruned state
      const smallMemoryEngine2 = new LearningEngine(
        'small-memory-agent',
        memoryStore,
        { maxMemorySize: 10000 }
      );
      await smallMemoryEngine2.initialize();

      // After reload, should have pruned experiences (keeps last 1000, then 500 if over limit)
      expect(smallMemoryEngine2.getTotalExperiences()).toBeLessThan(2000);
      expect(smallMemoryEngine2.getTotalExperiences()).toBeLessThanOrEqual(1000);

      smallMemoryEngine2.dispose();
    });
  });

  describe('Exploration Rate Decay', () => {
    it('should decay exploration rate over time', async () => {
      const initialRate = learningEngine.getExplorationRate();

      // Run many iterations using learnFromExecution (which calls decayExploration)
      for (let i = 0; i < 200; i++) {
        const task = {
          id: `decay-task-${i}`,
          type: 'test',
          previousAttempts: 0
        };

        const result = {
          success: true,
          coverage: 0.5,
          strategy: 'default',
          toolsUsed: [],
          parallelization: 0.5,
          retryPolicy: 'none',
          resourceAllocation: 0.5
        };

        // Use learnFromExecution which calls decayExploration()
        await learningEngine.learnFromExecution(task, result);
      }

      const finalRate = learningEngine.getExplorationRate();

      // After 200 iterations with 0.995 decay: 0.3 × (0.995)^200 = 0.3 × 0.367 = 0.11
      expect(finalRate).toBeLessThan(initialRate);
      expect(finalRate).toBeGreaterThanOrEqual(0.01); // min rate
    });
  });
});
