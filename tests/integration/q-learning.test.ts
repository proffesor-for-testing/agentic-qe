/**
 * Q-Learning Integration Tests
 *
 * Tests Q-Learning engine integration with actual training and persistence
 * Based on CRITICAL-LEARNING-SYSTEM-ANALYSIS.md findings
 *
 * Test Coverage:
 * 1. Learning engine initialization
 * 2. Experience recording and storage
 * 3. Q-value updates and convergence
 * 4. State extraction from tasks
 * 5. Reward calculation accuracy
 * 6. Learning persistence across sessions
 * 7. Agent decision-making improvement
 *
 * **Expected Failures**: Tests document what SHOULD work but doesn't yet
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LearningEngine } from '@learning/LearningEngine';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { Database } from '@utils/Database';
import * as fs from 'fs';
import * as path from 'path';

// Mock Logger to prevent console noise
import * as LoggerModule from '@utils/Logger';
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
(LoggerModule.Logger as any).getInstance = jest.fn(() => mockLogger);

describe('Q-Learning Integration Tests', () => {
  let learningEngine: LearningEngine;
  let memoryManager: SwarmMemoryManager;
  let database: Database;
  let testDbPath: string;
  const TEST_AGENT_ID = 'q-learning-test-agent';

  beforeEach(async () => {
    // Create temporary test database
    testDbPath = path.join(__dirname, '../temp', `q-learning-${Date.now()}.db`);
    const tempDir = path.dirname(testDbPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    database = new Database(testDbPath);
    await database.initialize();

    // Create Q-learning tables
    await database.run(`
      CREATE TABLE IF NOT EXISTS q_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        action TEXT NOT NULL,
        q_value REAL NOT NULL,
        visits INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, state_hash, action)
      )
    `);

    await database.run(`
      CREATE TABLE IF NOT EXISTS experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize learning system
    memoryManager = new SwarmMemoryManager();
    await memoryManager.initialize();

    learningEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
      enabled: true,
      learningRate: 0.1,
      discountFactor: 0.95,
      explorationRate: 0.3,
      minExplorationRate: 0.05,
      explorationDecay: 0.995
    });
    await learningEngine.initialize();
  });

  afterEach(async () => {
    if (database) {
      await database.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (memoryManager) {
      await memoryManager.clear();
    }
  });

  /**
   * Test 1: Learning Engine Initialization
   */
  describe('Learning Engine Initialization', () => {
    it('should initialize with correct hyperparameters', () => {
      expect(learningEngine).toBeDefined();
      expect(learningEngine.isEnabled()).toBe(true);

      // Verify hyperparameters loaded
      const config = learningEngine.getConfig();
      expect(config.learningRate).toBe(0.1);
      expect(config.discountFactor).toBe(0.95);
      expect(config.explorationRate).toBe(0.3);
    });

    it('should load previous Q-values from database', async () => {
      // Insert some Q-values
      await database.run(`
        INSERT INTO q_values (agent_id, state_hash, action, q_value, visits)
        VALUES (?, ?, ?, ?, ?)
      `, [TEST_AGENT_ID, 'state-hash-001', 'parallel', 0.85, 10]);

      await database.run(`
        INSERT INTO q_values (agent_id, state_hash, action, q_value, visits)
        VALUES (?, ?, ?, ?, ?)
      `, [TEST_AGENT_ID, 'state-hash-001', 'sequential', 0.62, 5]);

      // Create new learning engine (simulating restart)
      const newEngine = new LearningEngine(TEST_AGENT_ID, memoryManager, {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95
      });

      // ❌ EXPECTED TO FAIL: Engine doesn't load Q-values from database
      await newEngine.loadFromDatabase(database);

      const qValue = await newEngine.getQValue('state-hash-001', 'parallel');
      expect(qValue).toBe(0.85); // Will FAIL - undefined or 0
    });
  });

  /**
   * Test 2: Experience Recording and Storage
   */
  describe('Experience Recording', () => {
    it('should record experiences to database', async () => {
      const task = {
        id: 'task-001',
        type: 'test-generation',
        previousAttempts: 0
      };

      const result = {
        success: true,
        executionTime: 2000,
        strategy: 'parallel',
        toolsUsed: ['jest'],
        parallelization: 0.8,
        retryPolicy: 'exponential',
        resourceAllocation: 0.7
      };

      // Record experience
      await learningEngine.learnFromExecution(task, result);

      // ❌ EXPECTED TO FAIL: Experience not persisted to database
      const experiences = await database.all(`
        SELECT * FROM experiences WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1
      `, [TEST_AGENT_ID]);

      expect(experiences.length).toBe(1); // Will FAIL - 0 rows
      expect(experiences[0]?.action).toBe('parallel');
      expect(experiences[0]?.reward).toBeGreaterThan(0);
    });

    it('should calculate correct rewards', async () => {
      const successfulTask = {
        id: 'task-success',
        type: 'test-execution',
        previousAttempts: 0
      };

      const successResult = {
        success: true,
        executionTime: 1500,
        strategy: 'adaptive',
        toolsUsed: ['jest'],
        parallelization: 0.9,
        retryPolicy: 'exponential',
        resourceAllocation: 0.8,
        coverage: 0.95
      };

      await learningEngine.learnFromExecution(successfulTask, successResult);

      // Verify high reward for successful execution
      const experiences = await database.all(`
        SELECT reward FROM experiences WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1
      `, [TEST_AGENT_ID]);

      expect(experiences[0]?.reward).toBeGreaterThan(0.7); // High reward for success

      // Test failed task
      const failedTask = {
        id: 'task-failed',
        type: 'test-execution',
        previousAttempts: 2
      };

      const failResult = {
        success: false,
        executionTime: 10000,
        strategy: 'sequential',
        toolsUsed: ['jest'],
        parallelization: 0.2,
        retryPolicy: 'none',
        resourceAllocation: 0.5,
        errors: ['timeout', 'memory-overflow']
      };

      await learningEngine.learnFromExecution(failedTask, failResult);

      // Verify low/negative reward for failure
      const failExperiences = await database.all(`
        SELECT reward FROM experiences WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 1
      `, [TEST_AGENT_ID]);

      expect(failExperiences[0]?.reward).toBeLessThan(0.3); // Low reward for failure
    });
  });

  /**
   * Test 3: Q-Value Updates and Convergence
   */
  describe('Q-Value Updates', () => {
    it('should update Q-values based on experience', async () => {
      const stateHash = 'test-state-001';
      const action = 'parallel';

      // Initial Q-value should be 0
      let qValue = await learningEngine.getQValue(stateHash, action);
      expect(qValue).toBe(0);

      // Simulate positive experience
      await learningEngine.updateQValue(stateHash, action, 'next-state', 0.9);

      // ❌ EXPECTED TO FAIL: Q-value not updated
      qValue = await learningEngine.getQValue(stateHash, action);
      expect(qValue).toBeGreaterThan(0); // Will FAIL - still 0

      // Verify Q-value persisted to database
      const rows = await database.all(`
        SELECT q_value FROM q_values WHERE agent_id = ? AND state_hash = ? AND action = ?
      `, [TEST_AGENT_ID, stateHash, action]);

      expect(rows[0]?.q_value).toBeGreaterThan(0); // Will FAIL
    });

    it('should converge Q-values over multiple iterations', async () => {
      const stateHash = 'convergence-state';
      const action = 'adaptive';

      // Train with consistent high rewards
      const qValues: number[] = [];
      for (let i = 0; i < 50; i++) {
        await learningEngine.updateQValue(stateHash, action, 'next-state', 0.95);
        const qValue = await learningEngine.getQValue(stateHash, action);
        qValues.push(qValue);
      }

      // ❌ EXPECTED TO FAIL: Q-values don't converge properly
      // Should see convergence (values stabilizing)
      const firstHalfAvg = qValues.slice(0, 25).reduce((a, b) => a + b, 0) / 25;
      const secondHalfAvg = qValues.slice(25).reduce((a, b) => a + b, 0) / 25;

      expect(secondHalfAvg).toBeGreaterThan(firstHalfAvg); // Values should increase
      expect(qValues[qValues.length - 1]).toBeGreaterThan(0.7); // Should converge to high value

      // Verify convergence pattern
      const variance = qValues.slice(-10).reduce((acc, val, _, arr) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return acc + Math.pow(val - mean, 2);
      }, 0) / 10;

      expect(variance).toBeLessThan(0.01); // Low variance = convergence
    });

    it('should handle multiple actions per state', async () => {
      const stateHash = 'multi-action-state';
      const actions = ['parallel', 'sequential', 'adaptive'];

      // Train each action with different rewards
      await learningEngine.updateQValue(stateHash, actions[0], 'next', 0.9); // High reward
      await learningEngine.updateQValue(stateHash, actions[1], 'next', 0.4); // Low reward
      await learningEngine.updateQValue(stateHash, actions[2], 'next', 0.7); // Medium reward

      // ❌ EXPECTED TO FAIL: Best action not identified correctly
      const bestAction = await learningEngine.selectBestAction(stateHash, actions);

      expect(bestAction).toBe('parallel'); // Should select highest Q-value
    });
  });

  /**
   * Test 4: State Extraction
   */
  describe('State Extraction', () => {
    it('should extract meaningful state features', async () => {
      const task = {
        id: 'task-001',
        type: 'integration-test',
        previousAttempts: 1,
        complexity: 0.8,
        timeout: 5000,
        requiredCapabilities: ['api', 'database']
      };

      // ❌ EXPECTED TO FAIL: extractState method doesn't exist or incomplete
      const state = await learningEngine.extractState(task);

      expect(state).toBeDefined();
      expect(state).toHaveProperty('complexity');
      expect(state).toHaveProperty('previousAttempts');
      expect(state).toHaveProperty('taskType');
    });

    it('should generate consistent state hashes', async () => {
      const task1 = {
        id: 'task-a',
        type: 'unit-test',
        complexity: 0.5
      };

      const task2 = {
        id: 'task-b',
        type: 'unit-test',
        complexity: 0.5
      };

      // Same features should produce same hash
      const hash1 = await learningEngine.hashState(task1);
      const hash2 = await learningEngine.hashState(task2);

      expect(hash1).toBe(hash2); // Will FAIL if hashing includes id
    });
  });

  /**
   * Test 5: Learning Persistence Across Sessions
   */
  describe('Learning Persistence', () => {
    it('should persist and restore complete learning state', async () => {
      // Session 1: Train the agent
      const trainingData = [
        { state: 'state-A', action: 'parallel', reward: 0.9 },
        { state: 'state-A', action: 'sequential', reward: 0.5 },
        { state: 'state-B', action: 'parallel', reward: 0.85 },
        { state: 'state-B', action: 'adaptive', reward: 0.95 }
      ];

      for (const data of trainingData) {
        await learningEngine.updateQValue(data.state, data.action, 'next', data.reward);
      }

      // Verify learning occurred
      const qValueA = await learningEngine.getQValue('state-A', 'parallel');
      const qValueB = await learningEngine.getQValue('state-B', 'adaptive');

      expect(qValueA).toBeGreaterThan(0);
      expect(qValueB).toBeGreaterThan(0);

      // ❌ EXPECTED TO FAIL: Learning state not saved
      await learningEngine.saveToDatabase(database);

      // Session 2: Create new engine and restore
      const newEngine = new LearningEngine('q-learning-test-agent', memoryManager, {
        enabled: true,
        learningRate: 0.1,
        discountFactor: 0.95
      });

      // ❌ EXPECTED TO FAIL: Learning state not restored
      await newEngine.loadFromDatabase(database);

      const restoredQValueA = await newEngine.getQValue('state-A', 'parallel');
      const restoredQValueB = await newEngine.getQValue('state-B', 'adaptive');

      expect(restoredQValueA).toBe(qValueA); // Will FAIL
      expect(restoredQValueB).toBe(qValueB); // Will FAIL
    });

    it('should maintain visit counts across restarts', async () => {
      const stateHash = 'visit-count-state';
      const action = 'parallel';

      // Train multiple times
      for (let i = 0; i < 20; i++) {
        await learningEngine.updateQValue(stateHash, action, 'next', 0.8);
      }

      // ❌ EXPECTED TO FAIL: Visit counts not tracked
      const visitCount = await learningEngine.getVisitCount(stateHash, action);
      expect(visitCount).toBe(20); // Will FAIL

      // Verify in database
      const rows = await database.all(`
        SELECT visits FROM q_values WHERE agent_id = ? AND state_hash = ? AND action = ?
      `, [TEST_AGENT_ID, stateHash, action]);

      expect(rows[0]?.visits).toBe(20);
    });
  });

  /**
   * Test 6: Agent Decision-Making Improvement
   */
  describe('Decision-Making Improvement', () => {
    it('should improve action selection over time', async () => {
      const testState = 'decision-state';
      const actions = ['parallel', 'sequential', 'adaptive'];

      // Simulate environment where 'parallel' is best (90% success)
      // and 'sequential' is worst (40% success)
      const iterations = 100;
      const actionPerformance: Record<string, number[]> = {
        parallel: [],
        sequential: [],
        adaptive: []
      };

      for (let i = 0; i < iterations; i++) {
        // Select action (explore vs exploit)
        const selectedAction = await learningEngine.selectAction(testState, actions);

        // Simulate environment feedback
        let reward: number;
        if (selectedAction === 'parallel') {
          reward = Math.random() > 0.1 ? 0.9 : 0.3; // 90% success
        } else if (selectedAction === 'sequential') {
          reward = Math.random() > 0.6 ? 0.8 : 0.2; // 40% success
        } else {
          reward = Math.random() > 0.3 ? 0.85 : 0.4; // 70% success
        }

        // Learn from experience
        await learningEngine.updateQValue(testState, selectedAction, 'next', reward);

        actionPerformance[selectedAction].push(reward);
      }

      // ❌ EXPECTED TO FAIL: Agent doesn't learn to prefer 'parallel'
      // After training, agent should mostly select 'parallel'
      const finalAction = await learningEngine.selectBestAction(testState, actions);
      expect(finalAction).toBe('parallel'); // Will FAIL if not learning

      // Verify Q-values reflect learned preferences
      const qParallel = await learningEngine.getQValue(testState, 'parallel');
      const qSequential = await learningEngine.getQValue(testState, 'sequential');

      expect(qParallel).toBeGreaterThan(qSequential); // Will FAIL
    });

    it('should balance exploration and exploitation', async () => {
      const stateHash = 'explore-exploit-state';
      const actions = ['action-A', 'action-B', 'action-C'];

      // Set high Q-value for action-A
      await learningEngine.updateQValue(stateHash, 'action-A', 'next', 0.95);
      await learningEngine.updateQValue(stateHash, 'action-B', 'next', 0.4);
      await learningEngine.updateQValue(stateHash, 'action-C', 'next', 0.3);

      // With exploration enabled, should sometimes choose suboptimal actions
      const selectedActions: string[] = [];
      for (let i = 0; i < 100; i++) {
        const action = await learningEngine.selectAction(stateHash, actions);
        selectedActions.push(action);
      }

      const actionCounts = {
        'action-A': selectedActions.filter(a => a === 'action-A').length,
        'action-B': selectedActions.filter(a => a === 'action-B').length,
        'action-C': selectedActions.filter(a => a === 'action-C').length
      };

      // ❌ EXPECTED TO FAIL: No exploration happening
      expect(actionCounts['action-A']).toBeGreaterThan(70); // Mostly exploit
      expect(actionCounts['action-B'] + actionCounts['action-C']).toBeGreaterThan(0); // Some exploration
    });

    it('should decay exploration rate over time', async () => {
      const initialExploration = learningEngine.getExplorationRate();
      expect(initialExploration).toBe(0.3);

      // Simulate many learning steps
      for (let i = 0; i < 1000; i++) {
        await learningEngine.learnFromExecution(
          { id: `task-${i}`, type: 'test', previousAttempts: 0 },
          { success: true, executionTime: 1000, strategy: 'parallel', toolsUsed: [], parallelization: 0.5, retryPolicy: 'none', resourceAllocation: 0.5 }
        );
      }

      // ❌ EXPECTED TO FAIL: Exploration rate not decaying
      const finalExploration = learningEngine.getExplorationRate();
      expect(finalExploration).toBeLessThan(initialExploration); // Will FAIL
      expect(finalExploration).toBeGreaterThanOrEqual(0.05); // Should not go below min
    });
  });

  /**
   * Test 7: Experience Replay
   */
  describe('Experience Replay', () => {
    it('should replay past experiences for better learning', async () => {
      // Record experiences
      const experiences = [
        { state: 'state-1', action: 'action-A', reward: 0.9 },
        { state: 'state-2', action: 'action-B', reward: 0.7 },
        { state: 'state-3', action: 'action-C', reward: 0.5 },
        { state: 'state-4', action: 'action-A', reward: 0.95 }
      ];

      for (const exp of experiences) {
        await learningEngine.updateQValue(exp.state, exp.action, 'next', exp.reward);
      }

      const qBefore = await learningEngine.getQValue('state-1', 'action-A');

      // ❌ EXPECTED TO FAIL: Experience replay not implemented
      await learningEngine.replayExperiences(10); // Replay 10 random experiences

      const qAfter = await learningEngine.getQValue('state-1', 'action-A');

      // Q-values should be refined after replay
      expect(qAfter).not.toBe(qBefore); // Will FAIL - no replay
    });
  });
});
