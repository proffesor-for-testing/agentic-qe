/**
 * Comprehensive Tests for Q-Learning Algorithm
 * Tests Q-table updates, epsilon-greedy policy, learning rate, discount factor, and convergence
 *
 * @module tests/learning/QLearning
 */

// ===========================================================================
// Mock Types and Interfaces
// ===========================================================================

interface QTableEntry {
  state: string;
  action: string;
  qValue: number;
}

interface LearningConfig {
  learningRate: number;
  discountFactor: number;
  explorationRate: number;
  explorationDecay: number;
  minExplorationRate: number;
}

interface Experience {
  state: string;
  action: string;
  reward: number;
  nextState: string;
  done: boolean;
}

interface QLearningStats {
  totalUpdates: number;
  averageQValue: number;
  maxQValue: number;
  minQValue: number;
  stateActionPairs: number;
  explorationRate: number;
}

// ===========================================================================
// Q-Learning Implementation
// ===========================================================================

class QLearning {
  private qTable: Map<string, Map<string, number>>;
  private config: LearningConfig;
  private updateCount: number = 0;
  private availableActions: string[] = [
    'parallel', 'sequential', 'adaptive',
    'retry-aggressive', 'retry-conservative',
    'cache-heavy', 'cache-light'
  ];

  constructor(config: Partial<LearningConfig> = {}) {
    this.qTable = new Map();
    this.config = {
      learningRate: config.learningRate ?? 0.1,
      discountFactor: config.discountFactor ?? 0.95,
      explorationRate: config.explorationRate ?? 0.3,
      explorationDecay: config.explorationDecay ?? 0.995,
      minExplorationRate: config.minExplorationRate ?? 0.01
    };
  }

  /**
   * Get Q-value for state-action pair
   */
  getQValue(state: string, action: string): number {
    if (!this.qTable.has(state)) {
      return 0;
    }
    return this.qTable.get(state)!.get(action) ?? 0;
  }

  /**
   * Set Q-value for state-action pair
   */
  setQValue(state: string, action: string, value: number): void {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, new Map());
    }
    this.qTable.get(state)!.set(action, value);
  }

  /**
   * Update Q-value using Q-learning formula
   * Q(s,a) = Q(s,a) + α * [r + γ * max(Q(s',a')) - Q(s,a)]
   */
  update(experience: Experience): number {
    const { state, action, reward, nextState, done } = experience;

    // Get current Q-value
    const currentQ = this.getQValue(state, action);

    // Get max Q-value for next state
    const maxNextQ = done ? 0 : this.getMaxQValue(nextState);

    // Q-learning update
    const tdTarget = reward + this.config.discountFactor * maxNextQ;
    const tdError = tdTarget - currentQ;
    const newQ = currentQ + this.config.learningRate * tdError;

    // Update Q-table
    this.setQValue(state, action, newQ);
    this.updateCount++;

    return tdError; // Return TD error for monitoring
  }

  /**
   * Get maximum Q-value for a state across all actions
   */
  private getMaxQValue(state: string): number {
    if (!this.qTable.has(state)) {
      return 0;
    }

    const actionValues = this.qTable.get(state)!;
    if (actionValues.size === 0) {
      return 0;
    }

    return Math.max(...Array.from(actionValues.values()));
  }

  /**
   * Select action using epsilon-greedy policy
   */
  selectAction(state: string): string {
    // Exploration: random action
    if (Math.random() < this.config.explorationRate) {
      return this.availableActions[Math.floor(Math.random() * this.availableActions.length)];
    }

    // Exploitation: best known action
    return this.getBestAction(state);
  }

  /**
   * Get best action for a state (highest Q-value)
   */
  getBestAction(state: string): string {
    if (!this.qTable.has(state) || this.qTable.get(state)!.size === 0) {
      // No learned actions, return random
      return this.availableActions[Math.floor(Math.random() * this.availableActions.length)];
    }

    const actionValues = this.qTable.get(state)!;
    let bestAction = '';
    let bestValue = -Infinity;

    for (const [action, value] of actionValues.entries()) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Decay exploration rate
   */
  decayExploration(): void {
    this.config.explorationRate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * this.config.explorationDecay
    );
  }

  /**
   * Get current learning statistics
   */
  getStats(): QLearningStats {
    const allQValues: number[] = [];

    for (const actionMap of this.qTable.values()) {
      allQValues.push(...Array.from(actionMap.values()));
    }

    return {
      totalUpdates: this.updateCount,
      averageQValue: allQValues.length > 0
        ? allQValues.reduce((sum, v) => sum + v, 0) / allQValues.length
        : 0,
      maxQValue: allQValues.length > 0 ? Math.max(...allQValues) : 0,
      minQValue: allQValues.length > 0 ? Math.min(...allQValues) : 0,
      stateActionPairs: allQValues.length,
      explorationRate: this.config.explorationRate
    };
  }

  /**
   * Export Q-table for analysis
   */
  exportQTable(): QTableEntry[] {
    const entries: QTableEntry[] = [];

    for (const [state, actionMap] of this.qTable.entries()) {
      for (const [action, qValue] of actionMap.entries()) {
        entries.push({ state, action, qValue });
      }
    }

    return entries.sort((a, b) => b.qValue - a.qValue);
  }

  /**
   * Reset Q-learning state
   */
  reset(): void {
    this.qTable.clear();
    this.updateCount = 0;
    this.config.explorationRate = 0.3; // Reset to initial value
  }

  /**
   * Get learning rate
   */
  getLearningRate(): number {
    return this.config.learningRate;
  }

  /**
   * Get discount factor
   */
  getDiscountFactor(): number {
    return this.config.discountFactor;
  }

  /**
   * Get exploration rate
   */
  getExplorationRate(): number {
    return this.config.explorationRate;
  }

  /**
   * Set exploration rate manually
   */
  setExplorationRate(rate: number): void {
    this.config.explorationRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Import Q-table from external source
   */
  importQTable(entries: QTableEntry[]): void {
    this.qTable.clear();
    for (const entry of entries) {
      this.setQValue(entry.state, entry.action, entry.qValue);
    }
  }

  /**
   * Calculate policy quality (how consistent is the learned policy)
   */
  getPolicyQuality(): number {
    if (this.qTable.size === 0) return 0;

    let qualitySum = 0;
    let stateCount = 0;

    for (const actionMap of this.qTable.values()) {
      const values = Array.from(actionMap.values());
      if (values.length === 0) continue;

      const maxValue = Math.max(...values);
      const avgValue = values.reduce((sum, v) => sum + v, 0) / values.length;

      // Quality is ratio of best action value to average
      const quality = avgValue !== 0 ? maxValue / Math.abs(avgValue) : 0;
      qualitySum += quality;
      stateCount++;
    }

    return stateCount > 0 ? qualitySum / stateCount : 0;
  }
}

// ===========================================================================
// Unit Tests
// ===========================================================================

describe('QLearning', () => {
  let qLearning: QLearning;

  beforeEach(() => {
    qLearning = new QLearning();
  });

  // -------------------------------------------------------------------------
  // Q-Table Updates Tests
  // -------------------------------------------------------------------------

  describe('Q-Table Updates', () => {
    it('should initialize Q-values to zero', () => {
      const qValue = qLearning.getQValue('state-1', 'parallel');
      expect(qValue).toBe(0);
    });

    it('should update Q-value correctly', () => {
      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: false
      };

      qLearning.update(experience);

      const qValue = qLearning.getQValue('state-1', 'parallel');
      expect(qValue).toBeGreaterThan(0);
    });

    it('should apply learning rate correctly', () => {
      const learningRate = 0.5;
      const qLearner = new QLearning({ learningRate });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: true // Terminal state, no future reward
      };

      qLearner.update(experience);

      // Q(s,a) = 0 + 0.5 * [1.0 + 0 - 0] = 0.5
      const qValue = qLearner.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(0.5, 5);
    });

    it('should apply discount factor correctly', () => {
      const discountFactor = 0.9;
      const qLearner = new QLearning({
        learningRate: 1.0,
        discountFactor
      });

      // Set up next state Q-value
      qLearner.setQValue('state-2', 'sequential', 10.0);

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: false
      };

      qLearner.update(experience);

      // Q(s,a) = 0 + 1.0 * [1.0 + 0.9 * 10.0 - 0] = 10.0
      const qValue = qLearner.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(10.0, 5);
    });

    it('should handle terminal states correctly', () => {
      const qLearner = new QLearning({
        learningRate: 1.0,
        discountFactor: 0.9
      });

      // Set up next state Q-value (should be ignored for terminal state)
      qLearner.setQValue('state-2', 'sequential', 100.0);

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 5.0,
        nextState: 'state-2',
        done: true // Terminal state
      };

      qLearner.update(experience);

      // Q(s,a) = 0 + 1.0 * [5.0 + 0 - 0] = 5.0 (next state value ignored)
      const qValue = qLearner.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(5.0, 5);
    });

    it('should return TD error from update', () => {
      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 2.0,
        nextState: 'state-2',
        done: true
      };

      const tdError = qLearning.update(experience);

      // TD error = reward - currentQ = 2.0 - 0 = 2.0
      expect(tdError).toBeCloseTo(2.0, 5);
    });

    it('should converge with repeated updates', () => {
      const qLearner = new QLearning({
        learningRate: 0.1,
        discountFactor: 0.9
      });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-1', // Self-loop
        done: false
      };

      const qValues: number[] = [];

      // Run many updates
      for (let i = 0; i < 100; i++) {
        qLearner.update(experience);
        qValues.push(qLearner.getQValue('state-1', 'parallel'));
      }

      // Q-value should converge
      const lastValue = qValues[qValues.length - 1];
      const secondLastValue = qValues[qValues.length - 2];

      expect(Math.abs(lastValue - secondLastValue)).toBeLessThan(0.1);
    });
  });

  // -------------------------------------------------------------------------
  // Epsilon-Greedy Policy Tests
  // -------------------------------------------------------------------------

  describe('Epsilon-Greedy Policy', () => {
    it('should select best action in exploitation mode', () => {
      // Set up Q-values with clear best action
      qLearning.setQValue('state-1', 'parallel', 10.0);
      qLearning.setQValue('state-1', 'sequential', 5.0);
      qLearning.setQValue('state-1', 'adaptive', 2.0);

      const bestAction = qLearning.getBestAction('state-1');
      expect(bestAction).toBe('parallel');
    });

    it('should explore with probability epsilon', () => {
      // Set exploration rate to 1.0 (always explore)
      qLearning.setExplorationRate(1.0);

      qLearning.setQValue('state-1', 'parallel', 100.0);

      // Run multiple selections
      const actions: string[] = [];
      for (let i = 0; i < 100; i++) {
        actions.push(qLearning.selectAction('state-1'));
      }

      // Should see variety of actions, not just 'parallel'
      const uniqueActions = new Set(actions);
      expect(uniqueActions.size).toBeGreaterThan(1);
    });

    it('should exploit with probability (1 - epsilon)', () => {
      // Set exploration rate to 0.0 (always exploit)
      qLearning.setExplorationRate(0.0);

      qLearning.setQValue('state-1', 'parallel', 100.0);
      qLearning.setQValue('state-1', 'sequential', 1.0);

      // Run multiple selections
      const actions: string[] = [];
      for (let i = 0; i < 50; i++) {
        actions.push(qLearning.selectAction('state-1'));
      }

      // Should always select 'parallel' (best action)
      expect(actions.every(a => a === 'parallel')).toBe(true);
    });

    it('should decay exploration rate over time', () => {
      const initialRate = qLearning.getExplorationRate();

      for (let i = 0; i < 100; i++) {
        qLearning.decayExploration();
      }

      const finalRate = qLearning.getExplorationRate();

      expect(finalRate).toBeLessThan(initialRate);
      expect(finalRate).toBeGreaterThanOrEqual(0.01); // Min exploration rate
    });

    it('should respect minimum exploration rate', () => {
      const minRate = 0.05;
      const qLearner = new QLearning({
        explorationRate: 0.5,
        explorationDecay: 0.9,
        minExplorationRate: minRate
      });

      // Decay many times
      for (let i = 0; i < 1000; i++) {
        qLearner.decayExploration();
      }

      expect(qLearner.getExplorationRate()).toBeCloseTo(minRate, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Learning Rate Tests
  // -------------------------------------------------------------------------

  describe('Learning Rate', () => {
    it('should control update speed', () => {
      const slowLearner = new QLearning({ learningRate: 0.01 });
      const fastLearner = new QLearning({ learningRate: 0.9 });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 10.0,
        nextState: 'state-2',
        done: true
      };

      slowLearner.update(experience);
      fastLearner.update(experience);

      const slowQ = slowLearner.getQValue('state-1', 'parallel');
      const fastQ = fastLearner.getQValue('state-1', 'parallel');

      expect(fastQ).toBeGreaterThan(slowQ);
    });

    it('should allow gradual learning with low rate', () => {
      const learner = new QLearning({ learningRate: 0.1 });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: true
      };

      const qValues: number[] = [];

      for (let i = 0; i < 10; i++) {
        learner.update(experience);
        qValues.push(learner.getQValue('state-1', 'parallel'));
      }

      // Check gradual increase
      for (let i = 1; i < qValues.length; i++) {
        expect(qValues[i]).toBeGreaterThan(qValues[i - 1]);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Discount Factor Tests
  // -------------------------------------------------------------------------

  describe('Discount Factor', () => {
    it('should value immediate rewards more with low discount', () => {
      const shortSighted = new QLearning({
        learningRate: 1.0,
        discountFactor: 0.1
      });

      shortSighted.setQValue('state-2', 'sequential', 100.0);

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: false
      };

      shortSighted.update(experience);

      // Q = 1.0 + 0.1 * 100 = 11.0
      const qValue = shortSighted.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(11.0, 5);
    });

    it('should value future rewards more with high discount', () => {
      const farSighted = new QLearning({
        learningRate: 1.0,
        discountFactor: 0.99
      });

      farSighted.setQValue('state-2', 'sequential', 100.0);

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: false
      };

      farSighted.update(experience);

      // Q = 1.0 + 0.99 * 100 = 100.0
      const qValue = farSighted.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(100.0, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Convergence Tests
  // -------------------------------------------------------------------------

  describe('Convergence', () => {
    it('should converge to optimal policy in simple environment', () => {
      const learner = new QLearning({
        learningRate: 0.1,
        discountFactor: 0.9
      });

      // Simple environment: 'parallel' always gives reward 10, 'sequential' gives 5
      const experiences: Experience[] = [
        { state: 'start', action: 'parallel', reward: 10, nextState: 'end', done: true },
        { state: 'start', action: 'sequential', reward: 5, nextState: 'end', done: true }
      ];

      // Train for many episodes
      for (let episode = 0; episode < 100; episode++) {
        for (const exp of experiences) {
          learner.update(exp);
        }
      }

      const parallelQ = learner.getQValue('start', 'parallel');
      const sequentialQ = learner.getQValue('start', 'sequential');

      expect(parallelQ).toBeGreaterThan(sequentialQ);
      expect(learner.getBestAction('start')).toBe('parallel');
    });

    it('should show decreasing TD errors over time', () => {
      const learner = new QLearning({
        learningRate: 0.1,
        discountFactor: 0.9
      });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-1',
        done: false
      };

      const tdErrors: number[] = [];

      for (let i = 0; i < 50; i++) {
        const tdError = learner.update(experience);
        tdErrors.push(Math.abs(tdError));
      }

      // TD errors should generally decrease
      const firstHalf = tdErrors.slice(0, 25).reduce((sum, e) => sum + e, 0) / 25;
      const secondHalf = tdErrors.slice(25).reduce((sum, e) => sum + e, 0) / 25;

      expect(secondHalf).toBeLessThan(firstHalf);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics Tests
  // -------------------------------------------------------------------------

  describe('Statistics', () => {
    it('should track update count', () => {
      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 1.0,
        nextState: 'state-2',
        done: true
      };

      for (let i = 0; i < 10; i++) {
        qLearning.update(experience);
      }

      const stats = qLearning.getStats();
      expect(stats.totalUpdates).toBe(10);
    });

    it('should calculate average Q-value', () => {
      qLearning.setQValue('state-1', 'parallel', 10.0);
      qLearning.setQValue('state-1', 'sequential', 20.0);
      qLearning.setQValue('state-2', 'adaptive', 30.0);

      const stats = qLearning.getStats();
      expect(stats.averageQValue).toBeCloseTo(20.0, 5);
    });

    it('should track min and max Q-values', () => {
      qLearning.setQValue('state-1', 'parallel', -5.0);
      qLearning.setQValue('state-1', 'sequential', 0.0);
      qLearning.setQValue('state-2', 'adaptive', 15.0);

      const stats = qLearning.getStats();
      expect(stats.minQValue).toBeCloseTo(-5.0, 5);
      expect(stats.maxQValue).toBeCloseTo(15.0, 5);
    });

    it('should count state-action pairs', () => {
      qLearning.setQValue('state-1', 'parallel', 1.0);
      qLearning.setQValue('state-1', 'sequential', 2.0);
      qLearning.setQValue('state-2', 'adaptive', 3.0);
      qLearning.setQValue('state-3', 'parallel', 4.0);

      const stats = qLearning.getStats();
      expect(stats.stateActionPairs).toBe(4);
    });

    it('should calculate policy quality', () => {
      // Set up good policy (clear best actions)
      qLearning.setQValue('state-1', 'parallel', 10.0);
      qLearning.setQValue('state-1', 'sequential', 2.0);
      qLearning.setQValue('state-2', 'adaptive', 15.0);
      qLearning.setQValue('state-2', 'parallel', 3.0);

      const quality = qLearning.getPolicyQuality();
      expect(quality).toBeGreaterThan(1.0); // Best action significantly better
    });
  });

  // -------------------------------------------------------------------------
  // Import/Export Tests
  // -------------------------------------------------------------------------

  describe('Import/Export', () => {
    it('should export Q-table', () => {
      qLearning.setQValue('state-1', 'parallel', 10.0);
      qLearning.setQValue('state-1', 'sequential', 5.0);
      qLearning.setQValue('state-2', 'adaptive', 8.0);

      const exported = qLearning.exportQTable();

      expect(exported).toHaveLength(3);
      expect(exported[0].qValue).toBeGreaterThanOrEqual(exported[1].qValue); // Sorted by value
    });

    it('should import Q-table', () => {
      const entries: QTableEntry[] = [
        { state: 'state-1', action: 'parallel', qValue: 10.0 },
        { state: 'state-2', action: 'sequential', qValue: 5.0 }
      ];

      qLearning.importQTable(entries);

      expect(qLearning.getQValue('state-1', 'parallel')).toBeCloseTo(10.0, 5);
      expect(qLearning.getQValue('state-2', 'sequential')).toBeCloseTo(5.0, 5);
    });

    it('should preserve Q-values through export/import', () => {
      qLearning.setQValue('state-1', 'parallel', 7.5);
      qLearning.setQValue('state-2', 'adaptive', 12.3);

      const exported = qLearning.exportQTable();

      const newLearner = new QLearning();
      newLearner.importQTable(exported);

      expect(newLearner.getQValue('state-1', 'parallel')).toBeCloseTo(7.5, 5);
      expect(newLearner.getQValue('state-2', 'adaptive')).toBeCloseTo(12.3, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle negative rewards', () => {
      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: -10.0,
        nextState: 'state-2',
        done: true
      };

      qLearning.update(experience);

      const qValue = qLearning.getQValue('state-1', 'parallel');
      expect(qValue).toBeLessThan(0);
    });

    it('should handle very large Q-values', () => {
      qLearning.setQValue('state-1', 'parallel', 1e6);

      const qValue = qLearning.getQValue('state-1', 'parallel');
      expect(qValue).toBe(1e6);
      expect(isFinite(qValue)).toBe(true);
    });

    it('should reset correctly', () => {
      qLearning.setQValue('state-1', 'parallel', 10.0);
      qLearning.update({
        state: 'state-2',
        action: 'sequential',
        reward: 5.0,
        nextState: 'state-3',
        done: true
      });

      qLearning.reset();

      const stats = qLearning.getStats();
      expect(stats.totalUpdates).toBe(0);
      expect(stats.stateActionPairs).toBe(0);
      expect(qLearning.getQValue('state-1', 'parallel')).toBe(0);
    });

    it('should handle learning rate of 0', () => {
      const noLearning = new QLearning({ learningRate: 0 });

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 100.0,
        nextState: 'state-2',
        done: true
      };

      noLearning.update(experience);

      const qValue = noLearning.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(0, 5); // No learning should occur
    });

    it('should handle discount factor of 0', () => {
      const noFuture = new QLearning({
        learningRate: 1.0,
        discountFactor: 0
      });

      noFuture.setQValue('state-2', 'sequential', 1000.0);

      const experience: Experience = {
        state: 'state-1',
        action: 'parallel',
        reward: 5.0,
        nextState: 'state-2',
        done: false
      };

      noFuture.update(experience);

      // Only immediate reward matters
      const qValue = noFuture.getQValue('state-1', 'parallel');
      expect(qValue).toBeCloseTo(5.0, 5);
    });
  });
});
