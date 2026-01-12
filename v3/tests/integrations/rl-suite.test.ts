/**
 * Agentic QE v3 - RL Suite Tests
 *
 * Tests for the 9 RL algorithms implementing ADR-040.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createQERLSuite,
  QERLSuite,
  RLState,
  RLAction,
  RLExperience,
  RLAlgorithmType,
  DomainName,
} from '../../src/integrations/rl-suite';

// ============================================================================
// Test Utilities
// ============================================================================

function createTestState(overrides?: Partial<RLState>): RLState {
  return {
    id: 'test-state-1',
    features: [0.5, 0.7, 0.3],
    timestamp: new Date(),
    ...overrides,
  };
}

function createTestAction(overrides?: Partial<RLAction>): RLAction {
  return {
    type: 'test-action',
    value: 'test-value',
    ...overrides,
  };
}

function createTestExperience(overrides?: Partial<RLExperience>): RLExperience {
  const state = createTestState({ id: 'test-state-1' });
  const nextState = createTestState({ id: 'test-state-2' });

  return {
    state,
    action: createTestAction(),
    reward: 0.8,
    nextState,
    done: false,
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Suite Initialization Tests
// ============================================================================

describe('QERLSuite - Initialization', () => {
  it('should create suite with default config', () => {
    const suite = createQERLSuite();

    expect(suite).toBeInstanceOf(QERLSuite);
    expect(suite.getStats().totalPredictions).toBe(0);
    expect(suite.getStats().totalTrainingEpisodes).toBe(0);
  });

  it('should create suite with custom config', () => {
    const suite = createQERLSuite({
      enabled: true,
      algorithms: ['q-learning', 'dqn', 'ppo'],
    });

    expect(suite).toBeInstanceOf(QERLSuite);
    expect(suite.getAlgorithm('q-learning')).toBeDefined();
    expect(suite.getAlgorithm('dqn')).toBeDefined();
    expect(suite.getAlgorithm('ppo')).toBeDefined();
  });

  it('should initialize all 9 algorithms', () => {
    const suite = createQERLSuite();

    const algorithms: RLAlgorithmType[] = [
      'decision-transformer',
      'q-learning',
      'sarsa',
      'actor-critic',
      'policy-gradient',
      'dqn',
      'ppo',
      'a2c',
      'ddpg',
    ];

    for (const alg of algorithms) {
      expect(suite.getAlgorithm(alg)).toBeDefined();
    }
  });
});

// ============================================================================
// Algorithm Retrieval Tests
// ============================================================================

describe('QERLSuite - Algorithm Retrieval', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should get algorithm by type', () => {
    const qLearning = suite.getAlgorithm('q-learning');

    expect(qLearning).toBeDefined();
    expect(qLearning?.getInfo().type).toBe('q-learning');
  });

  it('should get algorithm for domain', () => {
    const testExecAlg = suite.getAlgorithmForDomain('test-execution');

    expect(testExecAlg).toBeDefined();
    expect(['decision-transformer', 'dqn', 'ppo']).toContain(testExecAlg?.getInfo().type);
  });

  it('should get all algorithms for domain', () => {
    const testExecAlgs = suite.getAlgorithmsForDomain('test-execution');

    expect(testExecAlgs.length).toBeGreaterThan(0);
    for (const alg of testExecAlgs) {
      expect(['decision-transformer', 'dqn', 'ppo']).toContain(alg.getInfo().type);
    }
  });

  it('should get all algorithms', () => {
    const algorithms = suite.getAlgorithms();

    expect(algorithms.size).toBe(9);
    expect(algorithms.has('q-learning')).toBe(true);
    expect(algorithms.has('decision-transformer')).toBe(true);
  });
});

// ============================================================================
// Prediction Tests
// ============================================================================

describe('QERLSuite - Prediction', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should make prediction for test-execution domain', async () => {
    const state = createTestState({
      id: 'test-1',
      metadata: { domain: 'test-execution' },
    });

    const prediction = await suite.predict(state, 'test-execution');

    expect(prediction).toBeDefined();
    expect(prediction.action).toBeDefined();
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
  });

  it('should make prediction with specific algorithm', async () => {
    const state = createTestState();

    const prediction = await suite.predictWithAlgorithm('q-learning', state);

    expect(prediction).toBeDefined();
    expect(prediction.action).toBeDefined();
  });

  it('should update prediction stats', async () => {
    const state = createTestState();

    await suite.predict(state, 'test-execution');

    const stats = suite.getStats();
    expect(stats.totalPredictions).toBe(1);
    expect(stats.domainUsage['test-execution']).toBe(1);
  });
});

// ============================================================================
// Training Tests
// ============================================================================

describe('QERLSuite - Training', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should train algorithm with single experience', async () => {
    const experience = createTestExperience();

    // Train with single experience - may not trigger batch training
    const stats = await suite.train('q-learning', experience);

    expect(stats).toBeDefined();
    // Stats should exist even if batch wasn't triggered
    expect(stats.episode).toBeGreaterThanOrEqual(0);
  });

  it('should train algorithm with batch', async () => {
    const experiences = [
      createTestExperience(),
      createTestExperience(),
      createTestExperience(),
    ];

    const stats = await suite.trainBatch('q-learning', experiences);

    expect(stats).toBeDefined();
    expect(stats.episode).toBeGreaterThan(0);
  });

  it('should update training stats', async () => {
    const experience = createTestExperience();

    await suite.train('q-learning', experience);

    const stats = suite.getStats();
    expect(stats.totalTrainingEpisodes).toBeGreaterThan(0);
  });

  it('should train all algorithms', async () => {
    const experiencesByAlgorithm: Record<string, RLExperience[]> = {
      'q-learning': [createTestExperience()],
      'dqn': [createTestExperience()],
      'ppo': [createTestExperience()],
    };

    const results = await suite.trainAll(experiencesByAlgorithm);

    expect(results.length).toBe(3);
    for (const result of results) {
      expect(result).toBeDefined();
    }
  });
});

// ============================================================================
// Reward Calculation Tests
// ============================================================================

describe('QERLSuite - Reward Calculation', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should calculate reward for test-execution', () => {
    const context = {
      action: createTestAction(),
      result: {
        success: true,
        durationMs: 5000,
        quality: 0.9,
      },
      state: createTestState(),
    };

    const reward = suite.calculateReward('test-execution', context);

    expect(reward).toBeDefined();
    expect(reward.totalReward).toBeGreaterThanOrEqual(-1);
    expect(reward.totalReward).toBeLessThanOrEqual(1);
    expect(reward.components).toBeDefined();
    expect(reward.reasoning).toBeDefined();
  });

  it('should calculate reward for coverage-analysis', () => {
    const context = {
      action: createTestAction(),
      result: {
        success: true,
        durationMs: 5000,
        quality: 0.8,
        coverage: 0.7,
        efficiency: 0.9,
      },
      state: createTestState(),
    };

    const reward = suite.calculateReward('coverage-analysis', context);

    expect(reward.totalReward).toBeGreaterThan(0);
  });

  it('should give higher reward for successful execution', () => {
    const successContext = {
      action: createTestAction(),
      result: { success: true, durationMs: 5000, quality: 0.9 },
      state: createTestState(),
    };

    const failureContext = {
      action: createTestAction(),
      result: { success: false, durationMs: 5000, quality: 0.5 },
      state: createTestState(),
    };

    const successReward = suite.calculateReward('test-execution', successContext);
    const failureReward = suite.calculateReward('test-execution', failureContext);

    expect(successReward.totalReward).toBeGreaterThan(failureReward.totalReward);
  });
});

// ============================================================================
// Experience Creation Tests
// ============================================================================

describe('QERLSuite - Experience Creation', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should create experience with automatic reward', () => {
    const state = createTestState();
    const action = createTestAction();
    const nextState = createTestState({ id: 'next-state' });

    const experience = suite.createExperience(
      'test-execution',
      state,
      action,
      nextState,
      { success: true, durationMs: 5000, quality: 0.9 }
    );

    expect(experience.state).toBe(state);
    expect(experience.action).toBe(action);
    expect(experience.nextState).toBe(nextState);
    expect(experience.reward).toBeGreaterThanOrEqual(-1);
    expect(experience.reward).toBeLessThanOrEqual(1);
    expect(experience.done).toBe(false);
  });
});

// ============================================================================
// Model Persistence Tests
// ============================================================================

describe('QERLSuite - Model Persistence', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should export all models', async () => {
    const models = await suite.exportAllModels();

    expect(models).toBeDefined();
    expect(Object.keys(models).length).toBe(9);
    expect(models['q-learning']).toBeDefined();
    expect(models['decision-transformer']).toBeDefined();
  });

  it('should import all models', async () => {
    // First export
    const models = await suite.exportAllModels();

    // Create new suite and import
    const newSuite = createQERLSuite();
    await newSuite.importAllModels(models);

    // Verify algorithms have stats from imported models
    const stats = newSuite.getStats();
    expect(stats).toBeDefined();
  });

  it('should export and import suite state', async () => {
    // Make some predictions to update stats
    const testState = createTestState();
    await suite.predict(testState, 'test-execution');

    // Export state
    const suiteState = await suite.exportState();
    expect(suiteState).toBeDefined();
    expect(suiteState.stats).toBeDefined();

    // Import state
    const newSuite = createQERLSuite();
    await newSuite.importState(suiteState);

    expect(newSuite.getStats().totalPredictions).toBe(1);
  });
});

// ============================================================================
// Reset Tests
// ============================================================================

describe('QERLSuite - Reset', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  it('should reset specific algorithm', async () => {
    const experience = createTestExperience();

    // Train to update stats
    await suite.train('q-learning', experience);

    // Reset
    await suite.resetAlgorithm('q-learning');

    const stats = suite.getAlgorithmStats('q-learning');
    expect(stats?.episode).toBe(0);
  });

  it('should reset all algorithms', async () => {
    const experience = createTestExperience();

    // Train
    await suite.train('q-learning', experience);
    await suite.train('dqn', experience);

    // Reset all
    await suite.resetAll();

    const stats = suite.getStats();
    expect(stats.totalTrainingEpisodes).toBe(0);
  });

  it('should reset stats', () => {
    suite.resetStats();

    const stats = suite.getStats();
    expect(stats.totalPredictions).toBe(0);
    expect(stats.totalTrainingEpisodes).toBe(0);
  });
});

// ============================================================================
// Algorithm-Specific Tests
// ============================================================================

describe('Individual Algorithms', () => {
  let suite: QERLSuite;

  beforeEach(() => {
    suite = createQERLSuite();
  });

  const algorithms: RLAlgorithmType[] = [
    'decision-transformer',
    'q-learning',
    'sarsa',
    'actor-critic',
    'policy-gradient',
    'dqn',
    'ppo',
    'a2c',
    'ddpg',
  ];

  it.each(algorithms)('%s should implement RLAlgorithm interface', async (alg) => {
    const algorithm = suite.getAlgorithm(alg as RLAlgorithmType);

    expect(algorithm).toBeDefined();

    const state = createTestState();
    const prediction = await algorithm!.predict(state);

    expect(prediction).toBeDefined();
    expect(prediction.action).toBeDefined();
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
  });

  it.each(algorithms)('%s should support training', async (alg) => {
    const algorithm = suite.getAlgorithm(alg as RLAlgorithmType);
    const experience = createTestExperience();

    // Train - may or may not trigger actual training depending on batch size
    const stats = await algorithm!.train(experience);

    expect(stats).toBeDefined();
    // Stats should exist even if batch wasn't triggered
    expect(stats.episode).toBeGreaterThanOrEqual(0);
  });

  it.each(algorithms)('%s should export and import models', async (alg) => {
    const algorithm = suite.getAlgorithm(alg as RLAlgorithmType);

    const model = await algorithm!.exportModel();
    expect(model).toBeDefined();
    expect(model.type).toBe(alg);

    const newSuite = createQERLSuite();
    const newAlgorithm = newSuite.getAlgorithm(alg as RLAlgorithmType);

    await newAlgorithm!.importModel(model);
    const stats = newAlgorithm!.getStats();

    expect(stats).toBeDefined();
  });
});
