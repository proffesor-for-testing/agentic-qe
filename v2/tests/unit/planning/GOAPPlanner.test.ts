/**
 * GOAPPlanner Unit Tests
 *
 * Comprehensive tests for the Goal-Oriented Action Planning system.
 * Tests cover A* search algorithm, precondition/effect evaluation,
 * heuristic calculation, and plan reconstruction.
 *
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. Constructor initialization
 * 2. Core methods (findPlan, calculateHeuristic, goalMet, applyAction)
 * 3. Edge cases (empty actions, impossible goals, circular dependencies)
 * 4. Error handling and graceful degradation
 * 5. Database integration (action loading, persistence)
 *
 * @module tests/unit/planning/GOAPPlanner.test
 * @version 1.0.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  GOAPPlanner,
  getSharedGOAPPlanner,
  resetSharedGOAPPlanner
} from '../../../src/planning/GOAPPlanner';
import {
  WorldState,
  GOAPAction,
  StateConditions,
  DEFAULT_WORLD_STATE,
  PlanConstraints
} from '../../../src/planning/types';

// Mock Logger to avoid side effects during tests
jest.mock('../../../src/utils/Logger', () => ({
  Logger: {
    getInstance: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
}));

describe('GOAPPlanner', () => {
  let db: Database.Database;
  let planner: GOAPPlanner;

  // Test fixtures - reusable actions
  const createTestAction = (overrides: Partial<GOAPAction> = {}): GOAPAction => ({
    id: 'test-action-' + Math.random().toString(36).substring(2, 8),
    name: 'Test Action',
    description: 'A test action for unit testing',
    agentType: 'test-agent',
    preconditions: {},
    effects: {},
    cost: 1.0,
    durationEstimate: 1000,
    successRate: 1.0,
    executionCount: 0,
    category: 'test',
    ...overrides
  });

  // Create a minimal world state for testing
  const createTestWorldState = (overrides: Partial<WorldState> = {}): WorldState => {
    const base = JSON.parse(JSON.stringify(DEFAULT_WORLD_STATE));
    return {
      ...base,
      ...overrides,
      coverage: { ...base.coverage, ...overrides.coverage },
      quality: { ...base.quality, ...overrides.quality },
      fleet: { ...base.fleet, ...overrides.fleet },
      resources: { ...base.resources, ...overrides.resources },
      context: { ...base.context, ...overrides.context }
    };
  };

  beforeEach(() => {
    // Create in-memory database with required schema
    db = new Database(':memory:');

    // Create goap_actions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        agent_type TEXT NOT NULL,
        preconditions TEXT NOT NULL,
        effects TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 1.0,
        duration_estimate INTEGER,
        success_rate REAL DEFAULT 1.0,
        execution_count INTEGER DEFAULT 0,
        category TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `);

    // Create goap_plans table
    db.exec(`
      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY,
        goal_id TEXT,
        initial_state TEXT,
        goal_state TEXT,
        action_sequence TEXT,
        total_cost REAL,
        estimated_duration INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        executed_at DATETIME,
        completed_at DATETIME
      )
    `);

    planner = new GOAPPlanner(db);

    // Reset shared planner between tests
    resetSharedGOAPPlanner();
  });

  afterEach(() => {
    db.close();
  });

  // ============================================================
  // CONSTRUCTOR INITIALIZATION TESTS
  // ============================================================
  describe('Constructor Initialization', () => {
    it('should create a GOAPPlanner instance with database', () => {
      // Arrange & Act
      const newPlanner = new GOAPPlanner(db);

      // Assert
      expect(newPlanner).toBeInstanceOf(GOAPPlanner);
      expect(newPlanner.getActionLibrary()).toEqual([]);
    });

    it('should initialize with empty action library', () => {
      // Assert
      expect(planner.getActionLibrary()).toHaveLength(0);
    });

    it('should return a copy of action library (immutable)', () => {
      // Arrange
      const action = createTestAction({ id: 'immutable-test' });
      planner.addActions([action]);

      // Act
      const library1 = planner.getActionLibrary();
      const library2 = planner.getActionLibrary();

      // Assert
      expect(library1).not.toBe(library2); // Different array references
      expect(library1).toEqual(library2); // Same content
    });
  });

  // ============================================================
  // SHARED PLANNER SINGLETON TESTS
  // ============================================================
  describe('Shared Planner Singleton', () => {
    it('should return the same instance for multiple calls', () => {
      // Arrange & Act
      const planner1 = getSharedGOAPPlanner(db);
      const planner2 = getSharedGOAPPlanner(db);

      // Assert
      expect(planner1).toBe(planner2);
    });

    it('should reset shared planner correctly', () => {
      // Arrange
      const planner1 = getSharedGOAPPlanner(db);
      planner1.addActions([createTestAction()]);

      // Act
      resetSharedGOAPPlanner();
      const planner2 = getSharedGOAPPlanner(db);

      // Assert
      expect(planner2).not.toBe(planner1);
      expect(planner2.getActionLibrary()).toHaveLength(0);
    });
  });

  // ============================================================
  // ACTION MANAGEMENT TESTS
  // ============================================================
  describe('Action Management', () => {
    it('should add actions programmatically', () => {
      // Arrange
      const actions = [
        createTestAction({ id: 'action-1' }),
        createTestAction({ id: 'action-2' })
      ];

      // Act
      planner.addActions(actions);

      // Assert
      expect(planner.getActionLibrary()).toHaveLength(2);
    });

    it('should clear action library', () => {
      // Arrange
      planner.addActions([createTestAction(), createTestAction()]);

      // Act
      planner.clearActions();

      // Assert
      expect(planner.getActionLibrary()).toHaveLength(0);
    });

    it('should seed actions to database with upsert', () => {
      // Arrange
      const actions = [
        createTestAction({ id: 'seed-action-1', name: 'Seed Action 1' }),
        createTestAction({ id: 'seed-action-2', name: 'Seed Action 2' })
      ];

      // Act
      const seededCount = planner.seedActions(actions);

      // Assert
      expect(seededCount).toBe(2);
      expect(planner.getActionCountFromDatabase()).toBe(2);
    });

    it('should update existing actions on reseed (upsert)', () => {
      // Arrange
      const action = createTestAction({ id: 'upsert-test', name: 'Original Name' });
      planner.seedActions([action]);

      // Act
      const updatedAction = { ...action, name: 'Updated Name' };
      planner.seedActions([updatedAction]);

      // Assert
      expect(planner.getActionCountFromDatabase()).toBe(1);
      const result = db.prepare('SELECT name FROM goap_actions WHERE id = ?').get('upsert-test') as { name: string };
      expect(result.name).toBe('Updated Name');
    });

    it('should load actions from database', async () => {
      // Arrange
      const actions = [
        createTestAction({ id: 'db-action-1', category: 'test' }),
        createTestAction({ id: 'db-action-2', category: 'test' })
      ];
      planner.seedActions(actions);

      // Create fresh planner to test loading
      const freshPlanner = new GOAPPlanner(db);

      // Act
      await freshPlanner.loadActionsFromDatabase();

      // Assert
      expect(freshPlanner.getActionLibrary()).toHaveLength(2);
    });

    it('should not duplicate actions when loading from database multiple times', async () => {
      // Arrange
      planner.seedActions([createTestAction({ id: 'no-dupe', category: 'test' })]);

      // Act
      await planner.loadActionsFromDatabase();
      await planner.loadActionsFromDatabase();
      await planner.loadActionsFromDatabase();

      // Assert
      expect(planner.getActionLibrary()).toHaveLength(1);
    });

    it('should merge programmatic and database actions', async () => {
      // Arrange
      const programmaticAction = createTestAction({ id: 'programmatic-1' });
      planner.addActions([programmaticAction]);

      const dbAction = createTestAction({ id: 'db-action-1', category: 'test' });
      planner.seedActions([dbAction]);

      // Force reload from database (need fresh planner for this)
      const freshPlanner = new GOAPPlanner(db);
      freshPlanner.addActions([programmaticAction]);

      // Act
      await freshPlanner.loadActionsFromDatabase();

      // Assert - should have both
      const library = freshPlanner.getActionLibrary();
      expect(library).toHaveLength(2);
      expect(library.map(a => a.id)).toContain('programmatic-1');
      expect(library.map(a => a.id)).toContain('db-action-1');
    });
  });

  // ============================================================
  // HEURISTIC CALCULATION TESTS
  // ============================================================
  describe('Heuristic Calculation', () => {
    it('should return 0 when goal is already met', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 90, branch: 85, function: 92, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // We need to test private method through public behavior
      // Calculate heuristic implicitly through findPlan
      planner.addActions([
        createTestAction({
          id: 'noop',
          preconditions: {},
          effects: { 'coverage.line': { increase: 1 } }
        })
      ]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert - should find plan with 0 actions since goal is met
      expect(plan).not.toBeNull();
      expect(plan!.actions).toHaveLength(0);
    });

    it('should calculate distance for numeric conditions (gte)', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 50, branch: 50, function: 50, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const action = createTestAction({
        id: 'increase-coverage',
        preconditions: {},
        effects: { 'coverage.line': { increase: 35 } },
        cost: 1
      });

      planner.addActions([action]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert - should need at least one action to reach goal
      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle equality conditions', async () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          gateStatus: 'pending'
        }
      });
      const goal: StateConditions = {
        'quality.gateStatus': { eq: 'passed' }
      };

      const action = createTestAction({
        id: 'pass-gate',
        preconditions: {},
        effects: { 'quality.gateStatus': { set: 'passed' } },
        cost: 1
      });

      planner.addActions([action]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions).toHaveLength(1);
      expect(plan!.actions[0].id).toBe('pass-gate');
    });
  });

  // ============================================================
  // GOAL MET TESTS
  // ============================================================
  describe('Goal Met (goalMet)', () => {
    it('should return true when all conditions are satisfied', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 95, branch: 90, function: 92, target: 80, measured: true },
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          testsPassing: 100,
          securityScore: 95
        }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 },
        'quality.testsPassing': { eq: 100 },
        'quality.securityScore': { gt: 90 }
      };

      // Act
      const result = planner.goalMet(state, goal);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when any condition is not satisfied', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 75, branch: 70, function: 80, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // Act
      const result = planner.goalMet(state, goal);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle less-than conditions (lt, lte)', () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          technicalDebt: 5
        }
      });
      const goalLte: StateConditions = { 'quality.technicalDebt': { lte: 10 } };
      const goalLt: StateConditions = { 'quality.technicalDebt': { lt: 10 } };
      const goalLtFail: StateConditions = { 'quality.technicalDebt': { lt: 5 } };

      // Act & Assert
      expect(planner.goalMet(state, goalLte)).toBe(true);
      expect(planner.goalMet(state, goalLt)).toBe(true);
      expect(planner.goalMet(state, goalLtFail)).toBe(false);
    });

    it('should handle not-equal conditions (ne)', () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          gateStatus: 'failed'
        }
      });

      // Act & Assert
      expect(planner.goalMet(state, { 'quality.gateStatus': { ne: 'passed' } })).toBe(true);
      expect(planner.goalMet(state, { 'quality.gateStatus': { ne: 'failed' } })).toBe(false);
    });

    it('should handle exists conditions', () => {
      // Arrange
      const state = createTestWorldState({
        context: {
          ...DEFAULT_WORLD_STATE.context,
          projectId: 'test-project'
        }
      });

      // Act & Assert
      expect(planner.goalMet(state, { 'context.projectId': { exists: true } })).toBe(true);
      expect(planner.goalMet(state, { 'context.nonExistent': { exists: false } })).toBe(true);
      expect(planner.goalMet(state, { 'context.nonExistent': { exists: true } })).toBe(false);
    });

    it('should handle contains conditions for arrays', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          availableAgents: ['test-generator', 'coverage-analyzer', 'security-scanner']
        }
      });

      // Act & Assert
      expect(planner.goalMet(state, { 'fleet.availableAgents': { contains: 'test-generator' } })).toBe(true);
      expect(planner.goalMet(state, { 'fleet.availableAgents': { contains: 'non-existent' } })).toBe(false);
    });

    it('should handle in conditions', () => {
      // Arrange
      const state = createTestWorldState({
        context: {
          ...DEFAULT_WORLD_STATE.context,
          environment: 'production'
        }
      });

      // Act & Assert
      expect(planner.goalMet(state, {
        'context.environment': { in: ['staging', 'production'] }
      })).toBe(true);
      expect(planner.goalMet(state, {
        'context.environment': { in: ['development', 'staging'] }
      })).toBe(false);
    });
  });

  // ============================================================
  // PRECONDITIONS MET TESTS
  // ============================================================
  describe('Preconditions Met', () => {
    it('should return true for empty preconditions', () => {
      // Arrange
      const state = createTestWorldState();
      const preconditions: StateConditions = {};

      // Act
      const result = planner.preconditionsMet(state, preconditions);

      // Assert
      expect(result).toBe(true);
    });

    it('should correctly check complex preconditions', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 85, branch: 80, function: 90, target: 80, measured: true },
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          testsPassing: 100,
          testsMeasured: true
        }
      });

      const preconditions: StateConditions = {
        'coverage.line': { gte: 80 },
        'quality.testsPassing': { eq: 100 },
        'quality.testsMeasured': { eq: true }
      };

      // Act
      const result = planner.preconditionsMet(state, preconditions);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================
  // APPLY ACTION TESTS
  // ============================================================
  describe('Apply Action (applyAction)', () => {
    it('should apply set effect', () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          gateStatus: 'pending'
        }
      });
      const action = createTestAction({
        effects: { 'quality.gateStatus': { set: 'passed' } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.quality.gateStatus).toBe('passed');
      expect(state.quality.gateStatus).toBe('pending'); // Original unchanged
    });

    it('should apply increase effect with cap at 100', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 80, branch: 70, function: 85, target: 80, measured: true }
      });
      const action = createTestAction({
        effects: { 'coverage.line': { increase: 30 } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.coverage.line).toBe(100); // Capped at 100
    });

    it('should apply decrease effect with floor at 0', () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          technicalDebt: 5
        }
      });
      const action = createTestAction({
        effects: { 'quality.technicalDebt': { decrease: 10 } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.quality.technicalDebt).toBe(0); // Floored at 0
    });

    it('should apply increment effect (no cap)', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          activeAgents: 5
        }
      });
      const action = createTestAction({
        effects: { 'fleet.activeAgents': { increment: 3 } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.fleet.activeAgents).toBe(8);
    });

    it('should apply decrement effect with floor at 0', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          activeAgents: 2
        }
      });
      const action = createTestAction({
        effects: { 'fleet.activeAgents': { decrement: 5 } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.fleet.activeAgents).toBe(0);
    });

    it('should apply add effect to arrays', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          availableAgents: ['test-gen']
        }
      });
      const action = createTestAction({
        effects: { 'fleet.availableAgents': { add: 'coverage-analyzer' } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.fleet.availableAgents).toContain('coverage-analyzer');
      expect(newState.fleet.availableAgents).toContain('test-gen');
    });

    it('should not duplicate when adding existing array element', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          availableAgents: ['test-gen']
        }
      });
      const action = createTestAction({
        effects: { 'fleet.availableAgents': { add: 'test-gen' } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.fleet.availableAgents.filter(a => a === 'test-gen')).toHaveLength(1);
    });

    it('should apply remove effect from arrays', () => {
      // Arrange
      const state = createTestWorldState({
        fleet: {
          ...DEFAULT_WORLD_STATE.fleet,
          availableAgents: ['test-gen', 'coverage-analyzer']
        }
      });
      const action = createTestAction({
        effects: { 'fleet.availableAgents': { remove: 'test-gen' } }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.fleet.availableAgents).not.toContain('test-gen');
      expect(newState.fleet.availableAgents).toContain('coverage-analyzer');
    });

    it('should apply multiple effects in single action', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: false },
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          testsPassing: 80,
          testsMeasured: false
        }
      });
      const action = createTestAction({
        effects: {
          'coverage.line': { increase: 15 },
          'coverage.measured': { set: true },
          'quality.testsPassing': { increase: 10 },
          'quality.testsMeasured': { set: true }
        }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.coverage.line).toBe(85);
      expect(newState.coverage.measured).toBe(true);
      expect(newState.quality.testsPassing).toBe(90);
      expect(newState.quality.testsMeasured).toBe(true);
    });

    it('should handle nested state values correctly', () => {
      // Arrange
      const state = createTestWorldState();
      const action = createTestAction({
        effects: {
          'context.impactAnalyzed': { set: true },
          'context.riskLevel': { set: 'high' }
        }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.context.impactAnalyzed).toBe(true);
      expect(newState.context.riskLevel).toBe('high');
    });
  });

  // ============================================================
  // FIND PLAN TESTS (A* SEARCH)
  // ============================================================
  describe('Find Plan (A* Search)', () => {
    it('should find a simple one-action plan', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };
      const action = createTestAction({
        id: 'boost-coverage',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      planner.addActions([action]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions).toHaveLength(1);
      expect(plan!.actions[0].id).toBe('boost-coverage');
    });

    it('should find multi-step plan', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 50, branch: 45, function: 55, target: 80, measured: false },
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          testsMeasured: false
        }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const measureAction = createTestAction({
        id: 'measure-coverage',
        preconditions: {},
        effects: {
          'coverage.measured': { set: true },
          'coverage.line': { increase: 10 }
        },
        cost: 1
      });

      const improveAction = createTestAction({
        id: 'improve-coverage',
        preconditions: { 'coverage.measured': { eq: true } },
        effects: { 'coverage.line': { increase: 25 } },
        cost: 2
      });

      planner.addActions([measureAction, improveAction]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBeGreaterThanOrEqual(2);
      expect(plan!.actions.map(a => a.id)).toContain('measure-coverage');
    });

    it('should respect preconditions when finding plans', async () => {
      // Arrange
      const state = createTestWorldState({
        quality: {
          ...DEFAULT_WORLD_STATE.quality,
          testsMeasured: false,
          testsPassing: 50
        }
      });
      const goal: StateConditions = {
        'quality.testsPassing': { gte: 90 }
      };

      // Action that requires tests to be measured first
      const runTestsAction = createTestAction({
        id: 'run-tests',
        preconditions: {},
        effects: {
          'quality.testsMeasured': { set: true },
          'quality.testsPassing': { set: 70 }
        },
        cost: 1
      });

      const fixTestsAction = createTestAction({
        id: 'fix-failing-tests',
        preconditions: { 'quality.testsMeasured': { eq: true } },
        effects: { 'quality.testsPassing': { increase: 25 } },
        cost: 2
      });

      planner.addActions([runTestsAction, fixTestsAction]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      // run-tests must come before fix-failing-tests
      const runIndex = plan!.actions.findIndex(a => a.id === 'run-tests');
      const fixIndex = plan!.actions.findIndex(a => a.id === 'fix-failing-tests');
      expect(runIndex).toBeLessThan(fixIndex);
    });

    it('should find optimal (lowest cost) plan', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // Two ways to reach the goal - cheap and expensive
      const cheapAction = createTestAction({
        id: 'cheap-boost',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      const expensiveAction = createTestAction({
        id: 'expensive-boost',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 10
      });

      planner.addActions([expensiveAction, cheapAction]); // Add expensive first

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions[0].id).toBe('cheap-boost'); // Should pick cheaper action
    });

    it('should return null when no plan is possible', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 50, branch: 45, function: 55, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 100 },
        'quality.testsPassing': { eq: 100 } // Impossible to achieve both
      };

      // Only one action that increases coverage but doesn't help with tests
      const action = createTestAction({
        id: 'coverage-only',
        preconditions: {},
        effects: { 'coverage.line': { increase: 5 } },
        cost: 1
      });

      planner.addActions([action]);

      // Act
      const plan = await planner.findPlan(state, goal, {
        maxIterations: 100,
        timeoutMs: 1000
      });

      // Assert
      expect(plan).toBeNull();
    });

    it('should respect maxIterations constraint', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 0, branch: 0, function: 0, target: 100, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 100 }
      };

      // Add action that only increases by 1 - would need many iterations
      const tinyAction = createTestAction({
        id: 'tiny-boost',
        preconditions: {},
        effects: { 'coverage.line': { increase: 1 } },
        cost: 1
      });

      planner.addActions([tinyAction]);

      // Act
      const plan = await planner.findPlan(state, goal, {
        maxIterations: 10,
        timeoutMs: 5000
      });

      // Assert - should not find plan within iteration limit
      expect(plan).toBeNull();
    });

    it('should respect maxPlanLength constraint', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 0, branch: 0, function: 0, target: 100, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 50 }
      };

      // Action that only increases by 10
      const smallAction = createTestAction({
        id: 'small-boost',
        preconditions: {},
        effects: { 'coverage.line': { increase: 10 } },
        cost: 1
      });

      planner.addActions([smallAction]);

      // Act
      const plan = await planner.findPlan(state, goal, {
        maxPlanLength: 3,
        maxIterations: 1000
      });

      // Assert - cannot reach 50 with only 3 actions (10 * 3 = 30)
      expect(plan).toBeNull();
    });

    it('should respect allowedCategories constraint', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const testAction = createTestAction({
        id: 'test-category-action',
        category: 'test',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      const processAction = createTestAction({
        id: 'process-category-action',
        category: 'process',
        preconditions: {},
        effects: { 'coverage.line': { increase: 20 } },
        cost: 1
      });

      planner.addActions([testAction, processAction]);

      // Act
      const plan = await planner.findPlan(state, goal, {
        allowedCategories: ['test'] // Only allow test category
      });

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions.every(a => a.category === 'test')).toBe(true);
    });

    it('should respect excludedActions constraint', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const goodAction = createTestAction({
        id: 'good-action',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      const excludedAction = createTestAction({
        id: 'excluded-action',
        preconditions: {},
        effects: { 'coverage.line': { increase: 20 } },
        cost: 0.5 // Cheaper but excluded
      });

      planner.addActions([goodAction, excludedAction]);

      // Act
      const plan = await planner.findPlan(state, goal, {
        excludedActions: ['excluded-action']
      });

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions.map(a => a.id)).not.toContain('excluded-action');
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle empty action library', async () => {
      // Arrange
      const state = createTestWorldState();
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).toBeNull();
    });

    it('should handle goal already met', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 95, branch: 90, function: 92, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      planner.addActions([createTestAction()]); // Add an action just to have library

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions).toHaveLength(0);
      expect(plan!.totalCost).toBe(0);
    });

    it('should handle actions with no effects', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const noEffectAction = createTestAction({
        id: 'no-effect',
        preconditions: {},
        effects: {} // No effects
      });

      const realAction = createTestAction({
        id: 'real-action',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } }
      });

      planner.addActions([noEffectAction, realAction]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert
      expect(plan).not.toBeNull();
      expect(plan!.actions.map(a => a.id)).toContain('real-action');
    });

    it('should handle deeply nested state paths', () => {
      // Arrange
      const state = createTestWorldState();
      const action = createTestAction({
        effects: {
          'quality.gateEvaluated': { set: true }
        }
      });

      // Act
      const newState = planner.applyAction(state, action);

      // Assert
      expect(newState.quality.gateEvaluated).toBe(true);
    });

    it('should handle undefined state values gracefully', () => {
      // Arrange
      const state = createTestWorldState();

      // Act
      const value = planner.getStateValue(state, 'nonexistent.path');

      // Assert
      expect(value).toBeUndefined();
    });

    it('should handle planning timeout gracefully', async () => {
      // Arrange
      const state = createTestWorldState();
      const goal: StateConditions = {
        'coverage.line': { gte: 100 }
      };

      // Add many actions to make search expensive
      const actions = Array.from({ length: 20 }, (_, i) =>
        createTestAction({
          id: `action-${i}`,
          preconditions: { 'coverage.line': { gte: i * 5 } },
          effects: { 'coverage.line': { increase: 1 } },
          cost: 1
        })
      );

      planner.addActions(actions);

      // Act
      const plan = await planner.findPlan(state, goal, {
        timeoutMs: 1, // 1ms timeout
        maxIterations: 100000
      });

      // Assert - should timeout and return null
      expect(plan).toBeNull();
    });

    it('should adjust action cost based on success rate', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // High success rate action (effective cost = 1)
      const reliableAction = createTestAction({
        id: 'reliable',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1,
        successRate: 1.0
      });

      // Low success rate action (effective cost = 2 / 0.5 = 4)
      const unreliableAction = createTestAction({
        id: 'unreliable',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 2,
        successRate: 0.5
      });

      planner.addActions([unreliableAction, reliableAction]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert - should prefer reliable action
      expect(plan).not.toBeNull();
      expect(plan!.actions[0].id).toBe('reliable');
    });

    it('should increase cost for process actions in critical risk level', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true },
        context: {
          ...DEFAULT_WORLD_STATE.context,
          riskLevel: 'critical'
        }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const processAction = createTestAction({
        id: 'process-action',
        category: 'process',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      const testAction = createTestAction({
        id: 'test-action',
        category: 'test',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1.5 // Slightly higher base cost but no penalty
      });

      planner.addActions([processAction, testAction]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert - should prefer test action due to process penalty
      expect(plan).not.toBeNull();
      expect(plan!.actions[0].id).toBe('test-action');
    });
  });

  // ============================================================
  // DATABASE PERSISTENCE TESTS
  // ============================================================
  describe('Database Persistence', () => {
    it('should persist plan to database', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const action = createTestAction({
        id: 'persist-test-action',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      planner.addActions([action]);
      const plan = await planner.findPlan(state, goal);

      // Act
      await planner.persistPlan(plan!, state, 'test-goal');

      // Assert
      const result = db.prepare('SELECT * FROM goap_plans WHERE id = ?').get(plan!.id) as any;
      expect(result).toBeDefined();
      expect(result.goal_id).toBe('test-goal');
      expect(result.status).toBe('pending');
    });

    it('should update action success rate', async () => {
      // Arrange
      const action = createTestAction({
        id: 'success-rate-test',
        successRate: 1.0,
        executionCount: 10,
        category: 'test'
      });
      planner.seedActions([action]);
      await planner.loadActionsFromDatabase();

      // Act
      await planner.updateActionSuccessRate('success-rate-test', false);

      // Assert
      const result = db.prepare('SELECT success_rate, execution_count FROM goap_actions WHERE id = ?')
        .get('success-rate-test') as { success_rate: number; execution_count: number };

      expect(result.execution_count).toBe(11);
      expect(result.success_rate).toBeCloseTo(10 / 11); // 10 successes out of 11
    });

    it('should update in-memory library when success rate changes', async () => {
      // Arrange
      const action = createTestAction({
        id: 'memory-update-test',
        successRate: 1.0,
        executionCount: 4,
        category: 'test'
      });
      planner.seedActions([action]);
      await planner.loadActionsFromDatabase();

      // Act
      await planner.updateActionSuccessRate('memory-update-test', true);

      // Assert
      const memoryAction = planner.getActionLibrary().find(a => a.id === 'memory-update-test');
      expect(memoryAction?.successRate).toBeCloseTo(1.0); // 5/5 successes
      expect(memoryAction?.executionCount).toBe(5);
    });

    it('should handle non-existent action in updateActionSuccessRate', async () => {
      // Act & Assert - should not throw
      await expect(planner.updateActionSuccessRate('non-existent', true)).resolves.not.toThrow();
    });

    it('should ensure schema on seedActions', () => {
      // Arrange - drop execution steps table if it exists
      try {
        db.exec('DROP TABLE goap_execution_steps');
      } catch {
        // Table may not exist
      }

      // Act
      const action = createTestAction({ id: 'schema-test', category: 'test' });
      planner.seedActions([action]);

      // Assert - table should be created
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goap_execution_steps'").get();
      expect(tableInfo).toBeDefined();
    });
  });

  // ============================================================
  // ALTERNATIVE PLANS TESTS
  // ============================================================
  describe('Find Alternative Plans', () => {
    it('should find multiple alternative plans', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const action1 = createTestAction({
        id: 'alternative-1',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      const action2 = createTestAction({
        id: 'alternative-2',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 2
      });

      const action3 = createTestAction({
        id: 'alternative-3',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 3
      });

      planner.addActions([action1, action2, action3]);

      // Act
      const plans = await planner.findAlternativePlans(state, goal, undefined, 3);

      // Assert
      expect(plans.length).toBe(3);
      // Plans should be different (different first actions)
      const firstActions = plans.map(p => p.actions[0].id);
      expect(new Set(firstActions).size).toBe(3);
    });

    it('should return fewer plans if not enough alternatives exist', async () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 70, branch: 65, function: 75, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      const action = createTestAction({
        id: 'only-action',
        preconditions: {},
        effects: { 'coverage.line': { increase: 15 } },
        cost: 1
      });

      planner.addActions([action]);

      // Act
      const plans = await planner.findAlternativePlans(state, goal, undefined, 5);

      // Assert
      expect(plans.length).toBe(1);
    });
  });

  // ============================================================
  // STATE HASH AND DEDUPLICATION TESTS
  // ============================================================
  describe('State Hash and Deduplication', () => {
    it('should avoid revisiting same state', async () => {
      // Arrange - setup a scenario where same state can be reached multiple ways
      const state = createTestWorldState({
        coverage: { line: 50, branch: 50, function: 50, target: 80, measured: true }
      });
      const goal: StateConditions = {
        'coverage.line': { gte: 80 }
      };

      // Two actions that lead to same state
      const action1 = createTestAction({
        id: 'path-a',
        preconditions: {},
        effects: { 'coverage.line': { increase: 30 } },
        cost: 1
      });

      const action2 = createTestAction({
        id: 'path-b',
        preconditions: {},
        effects: { 'coverage.line': { increase: 30 } },
        cost: 2
      });

      planner.addActions([action1, action2]);

      // Act
      const plan = await planner.findPlan(state, goal);

      // Assert - should find plan efficiently
      expect(plan).not.toBeNull();
      expect(plan!.actions).toHaveLength(1);
      expect(plan!.actions[0].id).toBe('path-a'); // Cheaper path
    });
  });

  // ============================================================
  // GET STATE VALUE TESTS
  // ============================================================
  describe('Get State Value', () => {
    it('should get top-level state value', () => {
      // Arrange
      const state = createTestWorldState();

      // Act
      const coverage = planner.getStateValue(state, 'coverage');

      // Assert
      expect(coverage).toBeDefined();
      expect(coverage.line).toBeDefined();
    });

    it('should get nested state value', () => {
      // Arrange
      const state = createTestWorldState({
        coverage: { line: 85, branch: 80, function: 90, target: 80, measured: true }
      });

      // Act
      const lineValue = planner.getStateValue(state, 'coverage.line');

      // Assert
      expect(lineValue).toBe(85);
    });

    it('should return undefined for non-existent path', () => {
      // Arrange
      const state = createTestWorldState();

      // Act
      const value = planner.getStateValue(state, 'nonexistent.deep.path');

      // Assert
      expect(value).toBeUndefined();
    });
  });
});
