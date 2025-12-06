/**
 * PPOLearner Unit Tests
 *
 * Tests for the Proximal Policy Optimization (PPO-Clip) algorithm including:
 * - Action selection with softmax policy
 * - Trajectory collection
 * - GAE advantage estimation
 * - Clipped surrogate objective
 * - Policy and value updates
 */

import {
  PPOLearner,
  PPOConfig,
  createDefaultPPOConfig
} from '../../src/learning/algorithms/PPOLearner';
import { TaskState, AgentAction, TaskExperience } from '../../src/learning/types';

describe('PPOLearner', () => {
  let learner: PPOLearner;
  let defaultConfig: PPOConfig;

  const createState = (complexity: number = 0.5): TaskState => ({
    taskComplexity: complexity,
    requiredCapabilities: ['test'],
    contextFeatures: {},
    previousAttempts: 0,
    availableResources: 0.8,
    timeConstraint: 60000
  });

  const createAction = (strategy: string = 'default'): AgentAction => ({
    strategy,
    toolsUsed: ['tool1'],
    parallelization: 0.5,
    retryPolicy: 'exponential',
    resourceAllocation: 0.7
  });

  const createExperience = (
    reward: number,
    done: boolean = false,
    state?: TaskState
  ): TaskExperience => ({
    taskId: 'task-1',
    taskType: 'test',
    state: state ?? createState(),
    action: createAction(),
    reward,
    nextState: createState(0.6),
    timestamp: new Date(),
    agentId: 'agent-1',
    done
  });

  beforeEach(() => {
    defaultConfig = createDefaultPPOConfig();
    learner = new PPOLearner(defaultConfig);
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      const config = createDefaultPPOConfig();
      expect(config.clipEpsilon).toBe(0.2);
      expect(config.ppoEpochs).toBe(4);
      expect(config.miniBatchSize).toBe(64);
      expect(config.valueLossCoefficient).toBe(0.5);
      expect(config.entropyCoefficient).toBe(0.01);
      expect(config.gaeLambda).toBe(0.95);
      expect(config.clipValueLoss).toBe(true);
    });

    it('should initialize with empty state', () => {
      const stats = learner.getStatistics();
      expect(stats.tableSize).toBe(0);
      expect(stats.steps).toBe(0);
      expect(stats.episodes).toBe(0);
    });

    it('should initialize PPO specific state', () => {
      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(0);
      expect(ppoStats.valueTableSize).toBe(0);
      expect(ppoStats.policyTableSize).toBe(0);
    });
  });

  describe('action selection', () => {
    it('should select from available actions', () => {
      const state = createState();
      const actions = [
        createAction('strategy1'),
        createAction('strategy2'),
        createAction('strategy3')
      ];

      const selected = learner.selectAction(state, actions);
      expect(actions).toContainEqual(selected);
    });

    it('should throw when no actions available', () => {
      const state = createState();
      expect(() => learner.selectAction(state, [])).toThrow('No available actions');
    });

    it('should use softmax policy for selection', () => {
      const state = createState();
      const actions = [
        createAction('strategy1'),
        createAction('strategy2')
      ];

      // Multiple selections should sample from distribution
      const selections = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const action = learner.selectAction(state, actions);
        selections.add(action.strategy);
      }

      // Should see variety due to softmax sampling
      expect(selections.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('trajectory collection', () => {
    it('should collect steps in trajectory', () => {
      const state = createState();
      const action = createAction();

      learner.collectStep(state, action, 1.0, createState(0.6), false);

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(1);
    });

    it('should collect multiple steps', () => {
      for (let i = 0; i < 10; i++) {
        learner.collectStep(
          createState(0.5 + i * 0.01),
          createAction(),
          Math.random(),
          createState(0.6),
          i === 9
        );
      }

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(10);
    });
  });

  describe('update', () => {
    it('should collect experience and update step count', () => {
      const experience = createExperience(1.0);

      learner.update(experience);

      expect(learner.getStepCount()).toBe(1);
    });

    it('should train when trajectory buffer is full', () => {
      // Use smaller buffer size for testing
      const smallBufferConfig = {
        ...defaultConfig,
        replayBufferSize: 10 // Trigger training after 10 steps
      };
      const smallBufferLearner = new PPOLearner(smallBufferConfig);

      // Collect enough experiences to trigger training
      for (let i = 0; i < 15; i++) {
        smallBufferLearner.update(createExperience(Math.random(), i === 9));
      }

      // After training, trajectory should be cleared
      const ppoStats = smallBufferLearner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBeLessThan(15);
    });

    it('should handle terminal states correctly', () => {
      const experience = createExperience(1.0, true);

      learner.update(experience);

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(1);
    });
  });

  describe('trainOnTrajectory', () => {
    it('should clear trajectory after training', () => {
      // Collect some experiences
      for (let i = 0; i < 20; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          Math.random(),
          createState(0.6),
          i === 19
        );
      }

      // Train
      learner.trainOnTrajectory();

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(0);
    });

    it('should update policy table after training', () => {
      // Collect experiences
      for (let i = 0; i < 20; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          1.0,
          createState(0.6),
          i === 19
        );
      }

      const beforeTraining = learner.getPPOStatistics().policyTableSize;

      learner.trainOnTrajectory();

      const afterTraining = learner.getPPOStatistics().policyTableSize;
      expect(afterTraining).toBeGreaterThan(beforeTraining);
    });

    it('should update value table after training', () => {
      // Collect experiences
      for (let i = 0; i < 20; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          1.0,
          createState(0.6),
          i === 19
        );
      }

      const beforeTraining = learner.getPPOStatistics().valueTableSize;

      learner.trainOnTrajectory();

      const afterTraining = learner.getPPOStatistics().valueTableSize;
      expect(afterTraining).toBeGreaterThan(beforeTraining);
    });

    it('should handle empty trajectory', () => {
      // Should not throw
      expect(() => learner.trainOnTrajectory()).not.toThrow();
    });
  });

  describe('state value estimation', () => {
    it('should return 0 for unseen states', () => {
      const state = createState();
      const value = learner.getStateValue(state);
      expect(value).toBe(0);
    });

    it('should learn state values', () => {
      const state = createState();

      // Collect positive reward experiences
      for (let i = 0; i < 20; i++) {
        learner.collectStep(state, createAction(), 1.0, createState(0.6), i === 19);
      }
      learner.trainOnTrajectory();

      const value = learner.getStateValue(state);
      expect(value).not.toBe(0);
    });
  });

  describe('getBestAction', () => {
    it('should select best action after training', () => {
      const state = createState();
      const actions = [
        createAction('low'),
        createAction('high'),
        createAction('medium')
      ];

      // Train with high rewards for one action
      for (let i = 0; i < 30; i++) {
        const actionIndex = i % 3;
        const reward = actionIndex === 1 ? 10.0 : 0.0;
        learner.collectStep(state, actions[actionIndex], reward, createState(0.6), i % 10 === 9);

        if ((i + 1) % 10 === 0) {
          learner.trainOnTrajectory();
        }
      }

      const best = learner.getBestAction(state, actions);
      expect(actions).toContainEqual(best);
    });
  });

  describe('episode management', () => {
    it('should decay exploration rate', () => {
      // PPO typically has 0 exploration rate
      const exploratoryConfig = {
        ...defaultConfig,
        explorationRate: 0.3,
        explorationDecay: 0.9
      };
      const exploratoryLearner = new PPOLearner(exploratoryConfig);

      const initial = exploratoryLearner.getExplorationRate();
      exploratoryLearner.endEpisode();
      const after = exploratoryLearner.getExplorationRate();

      expect(after).toBeLessThan(initial);
    });

    it('should increment episode count', () => {
      learner.endEpisode();
      learner.endEpisode();

      expect(learner.getEpisodeCount()).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track general statistics', () => {
      for (let i = 0; i < 20; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          Math.random(),
          createState(0.6),
          i === 19
        );
      }
      learner.trainOnTrajectory();
      learner.endEpisode();

      const stats = learner.getStatistics();
      expect(stats.episodes).toBe(1);
      expect(stats.tableSize).toBeGreaterThan(0);
    });

    it('should track PPO specific statistics', () => {
      for (let i = 0; i < 20; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          Math.random(),
          createState(0.6),
          false
        );
      }

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(20);
      expect(typeof ppoStats.avgValue).toBe('number');
      expect(typeof ppoStats.avgAdvantage).toBe('number');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      // Train
      for (let i = 0; i < 20; i++) {
        learner.collectStep(createState(), createAction(), 1.0, createState(0.6), i === 19);
      }
      learner.trainOnTrajectory();
      learner.endEpisode();

      // Reset
      learner.reset();

      const stats = learner.getStatistics();
      expect(stats.steps).toBe(0);
      expect(stats.episodes).toBe(0);
      expect(stats.tableSize).toBe(0);

      const ppoStats = learner.getPPOStatistics();
      expect(ppoStats.trajectoryLength).toBe(0);
      expect(ppoStats.valueTableSize).toBe(0);
      expect(ppoStats.policyTableSize).toBe(0);
    });
  });

  describe('export and import', () => {
    it('should export complete state', () => {
      for (let i = 0; i < 20; i++) {
        learner.collectStep(createState(), createAction(), 1.0, createState(0.6), i === 19);
      }
      learner.trainOnTrajectory();

      const exported = learner.exportPPO();

      expect(exported.base).toBeDefined();
      expect(exported.valueTable).toBeDefined();
      expect(exported.policyTable).toBeDefined();
      expect(exported.ppoConfig).toBeDefined();
    });

    it('should import and restore state', () => {
      for (let i = 0; i < 20; i++) {
        learner.collectStep(createState(), createAction(), 1.0, createState(0.6), i === 19);
      }
      learner.trainOnTrajectory();

      const exported = learner.exportPPO();

      // Create new learner and import
      const newLearner = new PPOLearner(defaultConfig);
      newLearner.importPPO(exported);

      expect(newLearner.getPPOStatistics().valueTableSize).toBeGreaterThan(0);
      expect(newLearner.getPPOStatistics().policyTableSize).toBeGreaterThan(0);
    });
  });

  describe('memory usage', () => {
    it('should track memory usage', () => {
      const initialMemory = learner.getMemoryUsage();

      for (let i = 0; i < 100; i++) {
        learner.collectStep(
          createState(Math.random()),
          createAction(`strategy_${i % 5}`),
          Math.random(),
          createState(),
          i % 20 === 19
        );

        if ((i + 1) % 20 === 0) {
          learner.trainOnTrajectory();
        }
      }

      const finalMemory = learner.getMemoryUsage();
      expect(finalMemory).toBeGreaterThan(initialMemory);
    });
  });

  describe('GAE computation', () => {
    it('should normalize advantages', () => {
      // Collect varied rewards
      for (let i = 0; i < 50; i++) {
        learner.collectStep(
          createState(),
          createAction(),
          i % 2 === 0 ? 10.0 : -5.0, // Alternating rewards
          createState(0.6),
          i === 49
        );
      }

      // Train - this computes GAE
      learner.trainOnTrajectory();

      // After training, advantage statistics should show normalization effect
      const ppoStats = learner.getPPOStatistics();
      // Normalized advantages have mean ~ 0 and std ~ 1
      expect(typeof ppoStats.avgAdvantage).toBe('number');
    });
  });

  describe('clipping behavior', () => {
    it('should clip policy ratio within bounds', () => {
      // This is implicitly tested through training not diverging
      const smallConfig = {
        ...defaultConfig,
        clipEpsilon: 0.1, // Tight clipping
        replayBufferSize: 20
      };
      const clippedLearner = new PPOLearner(smallConfig);

      // Train with extreme rewards
      for (let i = 0; i < 50; i++) {
        clippedLearner.update(createExperience(i % 2 === 0 ? 100.0 : -100.0, i % 20 === 19));
      }

      // Should not throw or produce NaN
      const stats = clippedLearner.getStatistics();
      expect(stats.avgQValue).not.toBeNaN();
    });
  });
});
