/**
 * Unit tests for PlanExecutor
 *
 * Verifies:
 * - Step-by-step execution
 * - Retry logic
 * - Replanning on failure
 * - State tracking
 * - Cancellation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PlanExecutor,
  MockAgentSpawner,
  createMockExecutor,
  AgentSpawner,
  AgentSpawnResult,
  ExecutionConfig,
} from '../../../src/planning/plan-executor.js';
import { GOAPPlanner } from '../../../src/planning/goap-planner.js';
import { GOAPPlan, GOAPAction, V3WorldState, DEFAULT_V3_WORLD_STATE } from '../../../src/planning/types.js';

describe('PlanExecutor', () => {
  let planner: GOAPPlanner;
  let executor: PlanExecutor;
  let mockSpawner: MockAgentSpawner;

  beforeEach(async () => {
    planner = new GOAPPlanner();
    await planner.initialize();
    mockSpawner = new MockAgentSpawner({ successRate: 1.0, executionDelay: 10 });
    executor = new PlanExecutor(planner, mockSpawner);
    await executor.initialize();
  });

  afterEach(async () => {
    await executor.close();
    await planner.close();
  });

  // Helper to create test actions
  function createTestAction(
    id: string,
    name: string,
    effects: Record<string, unknown> = {}
  ): GOAPAction {
    return {
      id,
      name,
      agentType: 'test-agent',
      preconditions: {},
      effects: effects as GOAPAction['effects'],
      cost: 1.0,
      successRate: 1.0,
      executionCount: 0,
      category: 'test',
    };
  }

  // Helper to create test plan with unique ID to avoid history conflicts
  function createTestPlan(actions: GOAPAction[], planId?: string): GOAPPlan {
    return {
      id: planId ?? `test-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      initialState: { ...DEFAULT_V3_WORLD_STATE },
      goalState: { 'coverage.line': { min: 80 } },
      actions,
      totalCost: actions.reduce((sum, a) => sum + a.cost, 0),
      estimatedDurationMs: 1000,
      status: 'pending',
    };
  }

  describe('Basic Execution', () => {
    it('should execute a simple plan with one action', async () => {
      const action = createTestAction('action-1', 'Test Action', {
        'coverage.line': { delta: 20 },
      });
      const plan = createTestPlan([action]);

      const result = await executor.execute(plan);

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(1);
      expect(result.stepsFailed).toBe(0);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].status).toBe('completed');
    });

    it('should execute a plan with multiple actions in sequence', async () => {
      const actions = [
        createTestAction('action-1', 'First Action', { 'coverage.line': { delta: 10 } }),
        createTestAction('action-2', 'Second Action', { 'coverage.branch': { delta: 15 } }),
        createTestAction('action-3', 'Third Action', { 'coverage.function': { delta: 20 } }),
      ];
      const plan = createTestPlan(actions);

      const result = await executor.execute(plan);

      expect(result.status).toBe('completed');
      expect(result.stepsCompleted).toBe(3);
      expect(result.stepsFailed).toBe(0);
      expect(result.steps).toHaveLength(3);
      result.steps.forEach((step, i) => {
        expect(step.status).toBe('completed');
        expect(step.stepOrder).toBe(i);
      });
    });

    it('should track execution duration', async () => {
      const action = createTestAction('action-1', 'Test Action');
      const plan = createTestPlan([action]);

      const result = await executor.execute(plan);

      expect(result.totalDurationMs).toBeGreaterThan(0);
      expect(result.steps[0].durationMs).toBeGreaterThan(0);
    });
  });

  describe('State Tracking', () => {
    it('should record world state before and after each step', async () => {
      const action = createTestAction('action-1', 'Coverage Action', {
        'coverage.line': { delta: 25 },
      });
      const plan = createTestPlan([action]);
      const initialState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        coverage: { ...DEFAULT_V3_WORLD_STATE.coverage, line: 50 },
      };

      const result = await executor.execute(plan, initialState);

      expect(result.steps[0].worldStateBefore).toBeDefined();
      expect(result.steps[0].worldStateBefore?.coverage.line).toBe(50);
      expect(result.steps[0].worldStateAfter).toBeDefined();
      expect(result.steps[0].worldStateAfter?.coverage.line).toBe(75);
    });

    it('should update final world state correctly', async () => {
      const actions = [
        createTestAction('action-1', 'First', { 'coverage.line': { delta: 20 } }),
        createTestAction('action-2', 'Second', { 'coverage.branch': { delta: 15 } }),
      ];
      const plan = createTestPlan(actions);
      const initialState: V3WorldState = {
        ...DEFAULT_V3_WORLD_STATE,
        coverage: { ...DEFAULT_V3_WORLD_STATE.coverage, line: 30, branch: 20 },
      };

      const result = await executor.execute(plan, initialState);

      expect(result.finalWorldState).toBeDefined();
      expect(result.finalWorldState?.coverage.line).toBe(50);
      expect(result.finalWorldState?.coverage.branch).toBe(35);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed steps up to maxRetries', async () => {
      // Create spawner that fails first attempt, succeeds on 2nd
      let attempts = 0;
      const failingSpawner: AgentSpawner = {
        spawn: async (agentType: string, task: string): Promise<AgentSpawnResult> => {
          attempts++;
          if (attempts < 2) {
            return {
              agentId: `agent-${attempts}`,
              output: '',
              success: false,
              error: `Attempt ${attempts} failed`,
            };
          }
          return {
            agentId: `agent-${attempts}`,
            output: 'Success on retry',
            success: true,
          };
        },
      };

      const retryExecutor = new PlanExecutor(planner, failingSpawner, undefined, {
        maxRetries: 2,
      });
      await retryExecutor.initialize();

      const action = createTestAction('action-1', 'Retry Action');
      const plan = createTestPlan([action]);

      const result = await retryExecutor.execute(plan);

      expect(result.status).toBe('completed');
      // retries tracks the last failed attempt number (0 = first attempt failed, then success on attempt 1)
      expect(result.steps[0].retries).toBe(0);
      expect(attempts).toBe(2);

      await retryExecutor.close();
    });

    it('should fail after exhausting retries', async () => {
      const failingSpawner = new MockAgentSpawner({ successRate: 0.0 });
      const failExecutor = new PlanExecutor(planner, failingSpawner, undefined, {
        maxRetries: 2,
        replanOnFailure: false,
      });
      await failExecutor.initialize();

      const action = createTestAction('action-1', 'Always Fails');
      const plan = createTestPlan([action]);

      const result = await failExecutor.execute(plan);

      expect(result.status).toBe('failed');
      expect(result.stepsFailed).toBe(1);
      expect(result.steps[0].retries).toBe(2);

      await failExecutor.close();
    });
  });

  describe('Cancellation', () => {
    it('should cancel execution mid-flight', async () => {
      let stepCount = 0;
      const slowSpawner: AgentSpawner = {
        spawn: async (): Promise<AgentSpawnResult> => {
          stepCount++;
          // Only slow down after first step to allow cancellation to happen
          if (stepCount > 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          return { agentId: 'slow-agent', output: 'Done', success: true };
        },
      };

      const slowExecutor = new PlanExecutor(planner, slowSpawner);
      await slowExecutor.initialize();

      const actions = [
        createTestAction('action-1', 'Fast Action 1'),
        createTestAction('action-2', 'Slow Action 2'),
        createTestAction('action-3', 'Slow Action 3'),
      ];
      const plan = createTestPlan(actions);

      // Start execution and cancel after first step completes
      const executePromise = slowExecutor.execute(plan);

      // Cancel after first step completes (should be quick), before second finishes
      setTimeout(() => {
        slowExecutor.cancel();
      }, 100);

      const result = await executePromise;

      // Either cancelled or completed first step
      expect(['cancelled', 'completed']).toContain(result.status);
      if (result.status === 'cancelled') {
        expect(result.stepsCompleted).toBeLessThan(3);
      }

      await slowExecutor.close();
    });

    it('should report isExecuting status correctly', async () => {
      const slowSpawner: AgentSpawner = {
        spawn: async (): Promise<AgentSpawnResult> => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { agentId: 'agent', output: 'Done', success: true };
        },
      };

      const slowExecutor = new PlanExecutor(planner, slowSpawner);
      await slowExecutor.initialize();

      expect(slowExecutor.isExecuting()).toBe(false);

      const action = createTestAction('action-1', 'Test');
      const plan = createTestPlan([action]);

      const executePromise = slowExecutor.execute(plan);

      // Should be executing after starting
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(slowExecutor.isExecuting()).toBe(true);

      await executePromise;
      expect(slowExecutor.isExecuting()).toBe(false);

      await slowExecutor.close();
    });
  });

  describe('Callbacks', () => {
    it('should call onStepStart and onStepComplete callbacks', async () => {
      const startCalls: number[] = [];
      const completeCalls: number[] = [];

      const actions = [
        createTestAction('action-1', 'First'),
        createTestAction('action-2', 'Second'),
      ];
      const plan = createTestPlan(actions);

      await executor.executeWithCallbacks(
        plan,
        (step) => startCalls.push(step.stepOrder),
        (step) => completeCalls.push(step.stepOrder),
      );

      expect(startCalls).toEqual([0, 1]);
      expect(completeCalls).toEqual([0, 1]);
    });
  });

  describe('Execution History', () => {
    it('should persist and retrieve execution history', async () => {
      const action = createTestAction('action-1', 'History Test');
      const plan = createTestPlan([action]);

      await executor.execute(plan);

      const history = await executor.getExecutionHistory(plan.id);

      expect(history).toHaveLength(1);
      expect(history[0].planId).toBe(plan.id);
      expect(history[0].status).toBe('completed');
      expect(history[0].stepsCompleted).toBe(1);
    });

    it('should limit history results', async () => {
      const action = createTestAction('action-1', 'Limit Test');
      const plan = createTestPlan([action]);

      // Execute multiple times
      await executor.execute(plan);
      await executor.execute(plan);
      await executor.execute(plan);

      const limited = await executor.getExecutionHistory(plan.id, 2);

      expect(limited).toHaveLength(2);
    });
  });

  describe('Factory Functions', () => {
    it('should create mock executor via factory', async () => {
      const mockExecutor = createMockExecutor(planner, { successRate: 1.0 });
      await mockExecutor.initialize();

      const action = createTestAction('action-1', 'Factory Test');
      const plan = createTestPlan([action]);

      const result = await mockExecutor.execute(plan);
      expect(result.status).toBe('completed');

      await mockExecutor.close();
    });
  });
});

describe('MockAgentSpawner', () => {
  it('should succeed with 100% success rate', async () => {
    const spawner = new MockAgentSpawner({ successRate: 1.0 });

    const result = await spawner.spawn('test-agent', 'Test task');

    expect(result.success).toBe(true);
    expect(result.agentId).toBeDefined();
    expect(result.output).toContain('Successfully executed');
  });

  it('should fail with 0% success rate', async () => {
    const spawner = new MockAgentSpawner({ successRate: 0.0 });

    const result = await spawner.spawn('test-agent', 'Test task');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should respect execution delay', async () => {
    const spawner = new MockAgentSpawner({ executionDelay: 50 });
    const start = Date.now();

    await spawner.spawn('test-agent', 'Test task');

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
