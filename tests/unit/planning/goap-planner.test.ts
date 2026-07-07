/**
 * GOAP Planner Unit Tests
 *
 * Tests for A* search algorithm and plan finding functionality.
 * Updated for unified persistence (ADR-046)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  GOAPPlanner,
  type V3WorldState,
  type GOAPAction,
  DEFAULT_V3_WORLD_STATE,
} from '../../../src/planning/index.js';
import { resetUnifiedPersistence, initializeUnifiedPersistence } from '../../../src/kernel/unified-persistence.js';

// Use system temp directory — NEVER use relative '.agentic-qe' which hits production DB
const UNIFIED_DB_DIR = path.join(os.tmpdir(), `aqe-test-goap-${process.pid}`);
const UNIFIED_DB_PATH = path.join(UNIFIED_DB_DIR, 'memory.db');

// Helper to clean up test databases
function cleanupUnifiedDb(): void {
  if (fs.existsSync(UNIFIED_DB_PATH)) {
    fs.unlinkSync(UNIFIED_DB_PATH);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-wal`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-wal`);
  }
  if (fs.existsSync(`${UNIFIED_DB_PATH}-shm`)) {
    fs.unlinkSync(`${UNIFIED_DB_PATH}-shm`);
  }
}

describe('GOAPPlanner', () => {
  let planner: GOAPPlanner;

  beforeEach(async () => {
    // Reset unified persistence for test isolation
    resetUnifiedPersistence();
    cleanupUnifiedDb();
    fs.mkdirSync(UNIFIED_DB_DIR, { recursive: true });

    // A14: getUnifiedPersistence() is a singleton that only honors config on
    // first construction — GOAPPlanner.initialize() calls it with NO config,
    // so unless the singleton is pre-configured with our isolated temp path
    // here, it resolves to the real project .agentic-qe/memory.db (this was
    // the root cause of the 45% test-fixture pollution in goap_actions).
    await initializeUnifiedPersistence({ dbPath: UNIFIED_DB_PATH });

    planner = new GOAPPlanner();
    await planner.initialize();
  });

  afterEach(async () => {
    await planner.close();
    resetUnifiedPersistence();
    cleanupUnifiedDb();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newPlanner = new GOAPPlanner();
      await newPlanner.initialize();
      await newPlanner.close();
    });

    it('should support plan reuse configuration', () => {
      expect(planner.isPlanReuseEnabled()).toBe(true);
      planner.setPlanReuseEnabled(false);
      expect(planner.isPlanReuseEnabled()).toBe(false);
    });
  });

  describe('action management', () => {
    it('should add an action', async () => {
      const actionId = await planner.addAction({
        name: 'Run Unit Tests',
        description: 'Execute all unit tests',
        agentType: 'tester',
        preconditions: {},
        effects: { 'quality.testsPassing': { delta: 20 } },
        cost: 1.0,
        estimatedDurationMs: 5000,
        successRate: 0.95,
        category: 'test',
      });

      expect(actionId).toMatch(/^action-/);
    });

    it('should get actions by category', async () => {
      await planner.addAction({
        name: 'Security Scan',
        agentType: 'security-scanner',
        preconditions: {},
        effects: { 'quality.securityScore': { delta: 10 } },
        cost: 2.0,
        successRate: 1.0,
        category: 'security',
      });

      const securityActions = await planner.getActionsByCategory('security');
      expect(securityActions.length).toBeGreaterThan(0);
      expect(securityActions[0].category).toBe('security');
    });

    it('should update action statistics', async () => {
      const actionId = await planner.addAction({
        name: 'Test Action',
        agentType: 'tester',
        preconditions: {},
        effects: {},
        cost: 1.0,
        successRate: 1.0,
        category: 'test',
      });

      await planner.updateActionStats(actionId, true, 1000);
      await planner.updateActionStats(actionId, false, 2000);

      const actions = await planner.getActionsByCategory('test');
      const action = actions.find((a) => a.id === actionId);
      expect(action).toBeDefined();
      expect(action!.executionCount).toBe(2);
      expect(action!.successRate).toBeLessThan(1);
    });

    it('A14: should persist and reload method/params/implemented bindings across a fresh load', async () => {
      const actionId = await planner.addAction({
        name: 'Real Domain Action',
        agentType: 'qe-coverage-specialist',
        preconditions: {},
        effects: { 'coverage.measured': true },
        cost: 1.0,
        successRate: 0.9,
        category: 'coverage',
        qeDomain: 'coverage-analysis',
        method: 'analyze',
        params: { includeGhost: false },
        implemented: true,
      });

      // Force a fresh reconstruction from the DB (not the in-memory cache
      // populated at addAction() time) to prove the columns round-trip.
      await planner.loadActions();

      const actions = await planner.getActionsByCategory('coverage');
      const action = actions.find((a) => a.id === actionId);
      expect(action).toBeDefined();
      expect(action!.method).toBe('analyze');
      expect(action!.params).toEqual({ includeGhost: false });
      expect(action!.implemented).toBe(true);
    });

    it('A14: should leave method/params undefined and implemented false for actions without a real binding', async () => {
      const actionId = await planner.addAction({
        name: 'Unimplemented Action',
        agentType: 'queen-coordinator',
        preconditions: {},
        effects: {},
        cost: 1.0,
        successRate: 0.9,
        category: 'fleet',
      });

      await planner.loadActions();

      const actions = await planner.getActionsByCategory('fleet');
      const action = actions.find((a) => a.id === actionId);
      expect(action).toBeDefined();
      expect(action!.method).toBeUndefined();
      expect(action!.implemented).toBe(false);
    });

    it('A14: backfillActionMethodBindings should update already-seeded rows to match the current action library', async () => {
      // The default-seeded actions (40 from qe-action-library.ts) already
      // went through backfillActionMethodBindings() during this planner's
      // initialize() — verify a known real-mappable one picked up its
      // binding, and a known not-yet-implemented one did not.
      const coverageActions = await planner.getActionsByCategory('coverage');
      const measureCoverage = coverageActions.find((a) => a.name === 'measure-coverage');
      expect(measureCoverage).toBeDefined();
      expect(measureCoverage!.method).toBe('analyze');
      expect(measureCoverage!.implemented).toBe(true);

      const mutationTesting = coverageActions.find((a) => a.name === 'run-mutation-testing');
      expect(mutationTesting).toBeDefined();
      expect(mutationTesting!.implemented).toBe(false);
    });
  });

  describe('A* search', () => {
    beforeEach(async () => {
      // Add test actions
      await planner.addAction({
        name: 'Measure Coverage',
        agentType: 'coverage-analyzer',
        preconditions: {},
        effects: {
          'coverage.measured': true,
          'coverage.line': { delta: 0 },
        },
        cost: 0.5,
        successRate: 1.0,
        category: 'coverage',
      });

      await planner.addAction({
        name: 'Generate Tests',
        agentType: 'test-generator',
        preconditions: { 'coverage.measured': true },
        effects: { 'coverage.line': { delta: 20 } },
        cost: 2.0,
        successRate: 0.9,
        category: 'test',
      });

      await planner.addAction({
        name: 'Run Tests',
        agentType: 'tester',
        preconditions: {},
        effects: { 'quality.testsPassing': { delta: 30 } },
        cost: 1.5,
        successRate: 0.95,
        category: 'test',
      });

      await planner.addAction({
        name: 'Increase Coverage',
        agentType: 'coverage-analyzer',
        preconditions: {},
        effects: { 'coverage.line': { delta: 15 } },
        cost: 1.0,
        successRate: 1.0,
        category: 'coverage',
      });
    });

    it('should find a plan for simple goal', async () => {
      const currentState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        quality: {
          ...DEFAULT_V3_WORLD_STATE.quality,
          testsPassing: 50,
        },
      };

      const plan = await planner.findPlan(currentState, {
        'quality.testsPassing': { min: 70 },
      });

      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBeGreaterThan(0);
      expect(plan!.totalCost).toBeGreaterThan(0);
    });

    it('should find optimal plan for coverage goal', async () => {
      const currentState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        coverage: {
          ...DEFAULT_V3_WORLD_STATE.coverage,
          line: 50,
          measured: false,
        },
      };

      // Disable plan reuse to test fresh A* search
      planner.setPlanReuseEnabled(false);

      const plan = await planner.findPlan(currentState, {
        'coverage.line': { min: 80 },
      });

      expect(plan).not.toBeNull();
      expect(plan!.actions.length).toBeGreaterThan(0);

      // Verify plan achieves the goal
      let simulatedCoverage = 50;
      for (const action of plan!.actions) {
        if (
          action.effects['coverage.line'] &&
          typeof action.effects['coverage.line'] === 'object'
        ) {
          const effect = action.effects['coverage.line'] as { delta?: number };
          if (effect.delta) {
            simulatedCoverage = Math.min(100, simulatedCoverage + effect.delta);
          }
        }
      }
      expect(simulatedCoverage).toBeGreaterThanOrEqual(80);
    });

    it('should return null when no plan exists', async () => {
      // Create impossible goal with no actions that can help
      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'nonexistent.property': { min: 100 },
      });

      expect(plan).toBeNull();
    }, 30000); // A* search with many seeded actions takes time

    it('should respect cost constraints', async () => {
      const plan = await planner.findPlan(
        DEFAULT_V3_WORLD_STATE,
        { 'quality.testsPassing': { min: 50 } },
        { maxCost: 0.5 } // Very low cost limit
      );

      // Should either find a cheap plan or return null
      if (plan) {
        expect(plan.totalCost).toBeLessThanOrEqual(0.5);
      }
    });

    it('should exclude specified actions', async () => {
      const actions = await planner.getActionsByCategory('test');
      const excludedId = actions[0]?.id;

      if (excludedId) {
        const plan = await planner.findPlan(
          DEFAULT_V3_WORLD_STATE,
          { 'quality.testsPassing': { min: 50 } },
          { excludedActions: [excludedId] }
        );

        if (plan) {
          const hasExcluded = plan.actions.some((a) => a.id === excludedId);
          expect(hasExcluded).toBe(false);
        }
      }
    });
  });

  describe('goal management', () => {
    it('should add and retrieve goals', async () => {
      await planner.addGoal({
        name: 'High Coverage',
        description: 'Achieve 80% line coverage',
        conditions: { 'coverage.line': { min: 80 } },
        priority: 4,
      });

      const goals = await planner.getGoals();
      expect(goals.length).toBeGreaterThan(0);
      expect(goals[0].name).toBe('High Coverage');
    });
  });

  describe('plan persistence', () => {
    it('should save and retrieve plans', async () => {
      await planner.addAction({
        name: 'Test Action',
        agentType: 'tester',
        preconditions: {},
        effects: { 'quality.testsPassing': { delta: 10 } },
        cost: 1.0,
        successRate: 1.0,
        category: 'test',
      });

      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'quality.testsPassing': { min: 10 },
      });

      expect(plan).not.toBeNull();

      await planner.savePlan(plan!);
      const retrieved = await planner.getPlan(plan!.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(plan!.id);
      expect(retrieved!.totalCost).toBe(plan!.totalCost);
    });

    it('A14: findPlan() alone (no manual savePlan call) must produce a plan retrievable via getPlan() — the "Plan not found" bug', async () => {
      planner.addAction({
        id: 'save-plan-fix-action',
        name: 'save-plan-fix-action',
        agentType: 'test-agent',
        preconditions: {},
        effects: { 'quality.testsPassing': { delta: 10 } },
        cost: 1.0,
        successRate: 1.0,
        category: 'test',
      });

      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'quality.testsPassing': { min: 10 },
      });
      expect(plan).not.toBeNull();

      // No manual savePlan() call here — this is exactly what goap_execute
      // does: call findPlan() (via goap_plan), then look the id up later.
      const retrieved = await planner.getPlan(plan!.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(plan!.id);
      expect(retrieved!.totalCost).toBe(plan!.totalCost);
    });
  });

  describe('plan reuse', () => {
    it('should find similar plans', async () => {
      await planner.addAction({
        name: 'Increase Coverage',
        agentType: 'coverage-analyzer',
        preconditions: {},
        effects: { 'coverage.line': { delta: 30 } },
        cost: 1.0,
        successRate: 1.0,
        category: 'coverage',
      });

      // Create initial plan
      const goal = { 'coverage.line': { min: 80 } };
      const initialState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        coverage: { ...DEFAULT_V3_WORLD_STATE.coverage, line: 60 },
      };

      planner.setPlanReuseEnabled(false);
      const plan1 = await planner.findPlan(initialState, goal);
      expect(plan1).not.toBeNull();
      await planner.savePlan(plan1!);

      // Enable plan reuse and try to find similar plan
      planner.setPlanReuseEnabled(true);
      const plan2 = await planner.findSimilarPlan(goal, 0.5);

      // Similar plan should be found (or null if not enough similarity)
      if (plan2) {
        expect(plan2.id).toBeDefined();
      }
    });

    it('should return plan reuse statistics', async () => {
      const stats = await planner.getPlanReuseStats();

      expect(stats).toHaveProperty('totalPlans');
      expect(stats).toHaveProperty('reusedPlans');
      expect(stats).toHaveProperty('reuseRate');
      expect(stats).toHaveProperty('avgSuccessRate');
    });

    it('A14: a plan returned via the reuse path (findPlan finding a similar plan) must also be persisted', async () => {
      await planner.addAction({
        name: 'Increase Coverage Reuse',
        agentType: 'coverage-analyzer',
        preconditions: {},
        effects: { 'coverage.line': { delta: 30 } },
        cost: 1.0,
        successRate: 1.0,
        category: 'coverage',
      });

      const goal = { 'coverage.line': { min: 80 } };
      const initialState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        coverage: { ...DEFAULT_V3_WORLD_STATE.coverage, line: 60 },
      };

      planner.setPlanReuseEnabled(true);
      const firstPlan = await planner.findPlan(initialState, goal);
      expect(firstPlan).not.toBeNull();

      // Second call with the same state/goal should hit the reuse branch
      // (findSimilarPlan) inside findPlan() itself — not findSimilarPlan()
      // called directly. That branch previously returned an unpersisted
      // plan clone, so getPlan() on its id would 404 exactly like the
      // non-reuse path did.
      const secondPlan = await planner.findPlan(initialState, goal);
      expect(secondPlan).not.toBeNull();
      // Confirms this test actually exercises the reuse branch, not just
      // two independent A* plans that happen to both persist correctly.
      expect(secondPlan!.reusedFrom).toBe(firstPlan!.id);

      const retrieved = await planner.getPlan(secondPlan!.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(secondPlan!.id);
    });
  });

  describe('edge cases', () => {
    it('should return null for unsatisfiable goals', async () => {
      // Goal that no seeded action can satisfy (impossible state key)
      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'nonexistent.impossible.goal': { min: 999 },
      });

      expect(plan).toBeNull();
    });

    it('should handle circular dependencies correctly', async () => {
      // Actions that could create cycles
      await planner.addAction({
        name: 'Action A',
        agentType: 'worker',
        preconditions: { 'state.a': true },
        effects: { 'state.b': true },
        cost: 1.0,
        successRate: 1.0,
        category: 'test',
      });

      await planner.addAction({
        name: 'Action B',
        agentType: 'worker',
        preconditions: { 'state.b': true },
        effects: { 'state.a': true },
        cost: 1.0,
        successRate: 1.0,
        category: 'test',
      });

      // Should not hang due to closed set
      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'state.c': true,
      });

      expect(plan).toBeNull(); // No action produces state.c
    });

    it('should respect max plan length', async () => {
      // Add many small-effect actions
      for (let i = 0; i < 25; i++) {
        await planner.addAction({
          name: `Small Action ${i}`,
          agentType: 'worker',
          preconditions: {},
          effects: { 'coverage.line': { delta: 1 } },
          cost: 0.1,
          successRate: 1.0,
          category: 'coverage',
        });
      }

      const plan = await planner.findPlan(DEFAULT_V3_WORLD_STATE, {
        'coverage.line': { min: 25 },
      });

      // Plan should be limited to 20 actions (default max)
      if (plan) {
        expect(plan.actions.length).toBeLessThanOrEqual(20);
      }
    }, 60000); // A* search with many actions takes time, CI is slower
  });
});
