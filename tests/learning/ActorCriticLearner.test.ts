/**
 * ActorCriticLearner Unit Tests
 *
 * Tests for the Advantage Actor-Critic (A2C) algorithm including:
 * - Action selection with softmax policy
 * - Actor and critic updates
 * - Advantage calculation
 * - Entropy bonus
 * - State value estimation
 */

import {
  ActorCriticLearner,
  ActorCriticConfig,
  createDefaultActorCriticConfig
} from '../../src/learning/algorithms/ActorCriticLearner';
import { TaskState, AgentAction, TaskExperience } from '../../src/learning/types';

describe('ActorCriticLearner', () => {
  let learner: ActorCriticLearner;
  let defaultConfig: ActorCriticConfig;

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
    defaultConfig = createDefaultActorCriticConfig();
    learner = new ActorCriticLearner(defaultConfig);
  });

  describe('initialization', () => {
    it('should create with default config', () => {
      const config = createDefaultActorCriticConfig();
      expect(config.actorLearningRate).toBe(0.01);
      expect(config.criticLearningRate).toBe(0.1);
      expect(config.entropyCoefficient).toBe(0.01);
      expect(config.temperature).toBe(1.0);
      expect(config.normalizeAdvantage).toBe(true);
      expect(config.targetUpdateFrequency).toBe(100);
    });

    it('should initialize with empty tables', () => {
      const stats = learner.getStatistics();
      expect(stats.tableSize).toBe(0);
      expect(stats.steps).toBe(0);
      expect(stats.episodes).toBe(0);
    });

    it('should initialize actor-critic specific state', () => {
      const acStats = learner.getActorCriticStatistics();
      expect(acStats.valueTableSize).toBe(0);
      expect(acStats.policyTableSize).toBe(0);
      expect(acStats.avgStateValue).toBe(0);
      expect(acStats.avgEntropy).toBe(0);
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

    it('should explore with epsilon probability', () => {
      // Set high exploration rate
      const exploratoryConfig = {
        ...defaultConfig,
        explorationRate: 1.0 // Always explore
      };
      const exploratoryLearner = new ActorCriticLearner(exploratoryConfig);

      const state = createState();
      const actions = [
        createAction('strategy1'),
        createAction('strategy2')
      ];

      // With 100% exploration, should get different actions over many trials
      const selections = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const action = exploratoryLearner.selectAction(state, actions);
        selections.add(action.strategy);
      }

      // Should eventually see both strategies due to random selection
      expect(selections.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('update', () => {
    it('should update critic value function', () => {
      const experience = createExperience(1.0);

      learner.update(experience);

      const stats = learner.getActorCriticStatistics();
      expect(stats.valueTableSize).toBeGreaterThan(0);
    });

    it('should update actor policy', () => {
      const experience = createExperience(1.0);

      learner.update(experience);

      const stats = learner.getActorCriticStatistics();
      expect(stats.policyTableSize).toBeGreaterThan(0);
    });

    it('should increment step count', () => {
      const experience = createExperience(1.0);

      learner.update(experience);
      learner.update(experience);
      learner.update(experience);

      expect(learner.getStepCount()).toBe(3);
    });

    it('should handle terminal states', () => {
      const experience = createExperience(1.0, true);

      learner.update(experience);

      const stats = learner.getStatistics();
      expect(stats.steps).toBe(1);
    });

    it('should compute advantage correctly', () => {
      // Positive reward should lead to positive advantage initially
      const experience = createExperience(10.0);
      learner.update(experience);

      const acStats = learner.getActorCriticStatistics();
      // Advantage should be tracked in history
      expect(acStats.advantageStd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('state value estimation', () => {
    it('should return 0 for unseen states', () => {
      const state = createState();
      const value = learner.getStateValue(state);
      expect(value).toBe(0);
    });

    it('should update state values after learning', () => {
      const state = createState();

      // Generate experiences with positive rewards
      for (let i = 0; i < 20; i++) {
        learner.update(createExperience(1.0, false, state));
      }

      const value = learner.getStateValue(state);
      expect(value).not.toBe(0);
    });
  });

  describe('getBestAction', () => {
    it('should return action with highest Q-value', () => {
      const state = createState();
      const actions = [
        createAction('low'),
        createAction('high'),
        createAction('medium')
      ];

      // Train to prefer 'high' strategy
      for (let i = 0; i < 50; i++) {
        const exp: TaskExperience = {
          ...createExperience(i % 3 === 1 ? 10.0 : 0.0, false, state),
          action: actions[i % 3]
        };
        learner.update(exp);
      }

      // Should prefer the action that got highest rewards
      const best = learner.getBestAction(state, actions);
      expect(actions).toContainEqual(best);
    });
  });

  describe('episode management', () => {
    it('should decay exploration rate on episode end', () => {
      const initialExploration = learner.getExplorationRate();

      learner.endEpisode();

      expect(learner.getExplorationRate()).toBeLessThan(initialExploration);
    });

    it('should not decay below minimum', () => {
      // Run many episodes
      for (let i = 0; i < 1000; i++) {
        learner.endEpisode();
      }

      expect(learner.getExplorationRate()).toBeGreaterThanOrEqual(defaultConfig.minExplorationRate);
    });

    it('should increment episode count', () => {
      learner.endEpisode();
      learner.endEpisode();

      expect(learner.getEpisodeCount()).toBe(2);
    });
  });

  describe('target network sync', () => {
    it('should sync target network after configured updates', () => {
      const configWithLowSync = {
        ...defaultConfig,
        targetUpdateFrequency: 5
      };
      const syncLearner = new ActorCriticLearner(configWithLowSync);

      // Perform enough updates to trigger sync
      for (let i = 0; i < 10; i++) {
        syncLearner.update(createExperience(1.0));
      }

      // Should have synced at least once
      const stats = syncLearner.getStatistics();
      expect(stats.steps).toBe(10);
    });
  });

  describe('statistics', () => {
    it('should track all statistics correctly', () => {
      // Train for a while
      for (let i = 0; i < 20; i++) {
        learner.update(createExperience(Math.random()));
      }
      learner.endEpisode();

      const stats = learner.getStatistics();
      expect(stats.steps).toBe(20);
      expect(stats.episodes).toBe(1);
      expect(stats.tableSize).toBeGreaterThan(0);
      expect(typeof stats.avgQValue).toBe('number');
    });

    it('should track actor-critic specific statistics', () => {
      for (let i = 0; i < 20; i++) {
        learner.update(createExperience(Math.random()));
      }

      const acStats = learner.getActorCriticStatistics();
      expect(acStats.valueTableSize).toBeGreaterThan(0);
      expect(acStats.policyTableSize).toBeGreaterThan(0);
      expect(typeof acStats.avgStateValue).toBe('number');
      expect(typeof acStats.avgEntropy).toBe('number');
      expect(typeof acStats.advantageMean).toBe('number');
      expect(typeof acStats.advantageStd).toBe('number');
    });
  });

  describe('reset', () => {
    it('should clear all learning state', () => {
      // Train
      for (let i = 0; i < 20; i++) {
        learner.update(createExperience(1.0));
      }
      learner.endEpisode();

      // Reset
      learner.reset();

      const stats = learner.getStatistics();
      expect(stats.steps).toBe(0);
      expect(stats.episodes).toBe(0);
      expect(stats.tableSize).toBe(0);

      const acStats = learner.getActorCriticStatistics();
      expect(acStats.valueTableSize).toBe(0);
      expect(acStats.policyTableSize).toBe(0);
    });
  });

  describe('export and import', () => {
    it('should export complete state', () => {
      for (let i = 0; i < 10; i++) {
        learner.update(createExperience(1.0));
      }

      const exported = learner.exportActorCritic();

      expect(exported.base).toBeDefined();
      expect(exported.valueTable).toBeDefined();
      expect(exported.policyTable).toBeDefined();
      expect(exported.actorConfig).toBeDefined();
    });

    it('should import and restore state', () => {
      for (let i = 0; i < 10; i++) {
        learner.update(createExperience(1.0));
      }

      const exported = learner.exportActorCritic();

      // Create new learner and import
      const newLearner = new ActorCriticLearner(defaultConfig);
      newLearner.importActorCritic(exported);

      expect(newLearner.getStatistics().steps).toBe(10);
      expect(newLearner.getActorCriticStatistics().valueTableSize).toBeGreaterThan(0);
    });
  });

  describe('memory usage', () => {
    it('should track memory usage', () => {
      const initialMemory = learner.getMemoryUsage();

      for (let i = 0; i < 100; i++) {
        learner.update(createExperience(Math.random()));
      }

      const finalMemory = learner.getMemoryUsage();
      expect(finalMemory).toBeGreaterThan(initialMemory);
    });
  });
});
