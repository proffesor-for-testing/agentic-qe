/**
 * GOAP Types Unit Tests
 *
 * Tests for type definitions, default values, and type guards
 * in the GOAP planning system.
 *
 * Coverage target: 95%+
 *
 * Test scenarios:
 * 1. DEFAULT_WORLD_STATE structure and values
 * 2. Type compatibility and constraints
 * 3. Interface completeness
 *
 * @module tests/unit/planning/types.test
 * @version 1.0.0
 */

import { describe, it, expect } from '@jest/globals';
import {
  WorldState,
  ConditionOperators,
  EffectOperators,
  GOAPAction,
  GOAPGoal,
  GOAPPlan,
  PlanConstraints,
  PlanNode,
  ExecutedAction,
  ExecutionStep,
  ExecutionResult,
  DEFAULT_WORLD_STATE,
  StateConditions,
  ActionEffects,
  GOAPActionRecord,
  GOAPGoalRecord,
  GOAPPlanRecord,
  GOAPExecutionStepRecord
} from '../../../src/planning/types';

describe('GOAP Types', () => {
  // ============================================================
  // DEFAULT_WORLD_STATE TESTS
  // ============================================================
  describe('DEFAULT_WORLD_STATE', () => {
    it('should have all required top-level properties', () => {
      // Assert
      expect(DEFAULT_WORLD_STATE).toHaveProperty('coverage');
      expect(DEFAULT_WORLD_STATE).toHaveProperty('quality');
      expect(DEFAULT_WORLD_STATE).toHaveProperty('fleet');
      expect(DEFAULT_WORLD_STATE).toHaveProperty('resources');
      expect(DEFAULT_WORLD_STATE).toHaveProperty('context');
    });

    describe('coverage defaults', () => {
      it('should have all coverage properties initialized', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.coverage.line).toBe(0);
        expect(DEFAULT_WORLD_STATE.coverage.branch).toBe(0);
        expect(DEFAULT_WORLD_STATE.coverage.function).toBe(0);
        expect(DEFAULT_WORLD_STATE.coverage.target).toBe(80);
        expect(DEFAULT_WORLD_STATE.coverage.measured).toBe(false);
      });

      it('should have coverage values within valid range', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.coverage.line).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_WORLD_STATE.coverage.line).toBeLessThanOrEqual(100);
        expect(DEFAULT_WORLD_STATE.coverage.target).toBeGreaterThan(0);
        expect(DEFAULT_WORLD_STATE.coverage.target).toBeLessThanOrEqual(100);
      });
    });

    describe('quality defaults', () => {
      it('should have all quality properties initialized', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.quality.testsPassing).toBe(0);
        expect(DEFAULT_WORLD_STATE.quality.securityScore).toBe(100);
        expect(DEFAULT_WORLD_STATE.quality.performanceScore).toBe(100);
        expect(DEFAULT_WORLD_STATE.quality.technicalDebt).toBe(0);
        expect(DEFAULT_WORLD_STATE.quality.gateStatus).toBe('pending');
      });

      it('should have all measurement flags set to false', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.quality.testsMeasured).toBe(false);
        expect(DEFAULT_WORLD_STATE.quality.integrationTested).toBe(false);
        expect(DEFAULT_WORLD_STATE.quality.securityMeasured).toBe(false);
        expect(DEFAULT_WORLD_STATE.quality.performanceMeasured).toBe(false);
        expect(DEFAULT_WORLD_STATE.quality.complexityMeasured).toBe(false);
        expect(DEFAULT_WORLD_STATE.quality.gateEvaluated).toBe(false);
      });

      it('should have valid gate status', () => {
        // Assert
        const validStatuses = ['pending', 'passed', 'failed', 'exception_requested', 'deferred'];
        expect(validStatuses).toContain(DEFAULT_WORLD_STATE.quality.gateStatus);
      });
    });

    describe('fleet defaults', () => {
      it('should have all fleet properties initialized', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.fleet.activeAgents).toBe(0);
        expect(DEFAULT_WORLD_STATE.fleet.availableAgents).toEqual([]);
        expect(DEFAULT_WORLD_STATE.fleet.busyAgents).toEqual([]);
        expect(DEFAULT_WORLD_STATE.fleet.agentTypes).toEqual({});
        expect(DEFAULT_WORLD_STATE.fleet.topologyOptimized).toBe(false);
      });

      it('should have arrays as empty', () => {
        // Assert
        expect(Array.isArray(DEFAULT_WORLD_STATE.fleet.availableAgents)).toBe(true);
        expect(Array.isArray(DEFAULT_WORLD_STATE.fleet.busyAgents)).toBe(true);
        expect(DEFAULT_WORLD_STATE.fleet.availableAgents).toHaveLength(0);
        expect(DEFAULT_WORLD_STATE.fleet.busyAgents).toHaveLength(0);
      });
    });

    describe('resources defaults', () => {
      it('should have all resource properties initialized', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.resources.timeRemaining).toBe(3600);
        expect(DEFAULT_WORLD_STATE.resources.memoryAvailable).toBe(4096);
        expect(DEFAULT_WORLD_STATE.resources.parallelSlots).toBe(4);
      });

      it('should have positive resource values', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.resources.timeRemaining).toBeGreaterThan(0);
        expect(DEFAULT_WORLD_STATE.resources.memoryAvailable).toBeGreaterThan(0);
        expect(DEFAULT_WORLD_STATE.resources.parallelSlots).toBeGreaterThan(0);
      });
    });

    describe('context defaults', () => {
      it('should have all context properties initialized', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.context.environment).toBe('development');
        expect(DEFAULT_WORLD_STATE.context.changeSize).toBe('medium');
        expect(DEFAULT_WORLD_STATE.context.riskLevel).toBe('medium');
        expect(DEFAULT_WORLD_STATE.context.previousFailures).toBe(0);
      });

      it('should have analysis flags set to false', () => {
        // Assert
        expect(DEFAULT_WORLD_STATE.context.impactAnalyzed).toBe(false);
        expect(DEFAULT_WORLD_STATE.context.coverageGapsAnalyzed).toBe(false);
        expect(DEFAULT_WORLD_STATE.context.bddGenerated).toBe(false);
      });

      it('should have valid environment value', () => {
        // Assert
        const validEnvironments = ['development', 'staging', 'production'];
        expect(validEnvironments).toContain(DEFAULT_WORLD_STATE.context.environment);
      });

      it('should have valid change size', () => {
        // Assert
        const validSizes = ['small', 'medium', 'large'];
        expect(validSizes).toContain(DEFAULT_WORLD_STATE.context.changeSize);
      });

      it('should have valid risk level', () => {
        // Assert
        const validRiskLevels = ['low', 'medium', 'high', 'critical'];
        expect(validRiskLevels).toContain(DEFAULT_WORLD_STATE.context.riskLevel);
      });
    });
  });

  // ============================================================
  // TYPE STRUCTURE TESTS
  // ============================================================
  describe('Type Structure Validation', () => {
    describe('WorldState', () => {
      it('should allow creation of valid WorldState objects', () => {
        // Arrange
        const state: WorldState = {
          coverage: { line: 80, branch: 75, function: 85, target: 80, measured: true },
          quality: {
            testsPassing: 95,
            securityScore: 100,
            performanceScore: 90,
            technicalDebt: 5,
            gateStatus: 'passed',
            testsMeasured: true,
            integrationTested: true,
            securityMeasured: true,
            performanceMeasured: true,
            complexityMeasured: true,
            gateEvaluated: true
          },
          fleet: {
            activeAgents: 5,
            availableAgents: ['agent-1'],
            busyAgents: ['agent-2'],
            agentTypes: { 'test-gen': 3 },
            topologyOptimized: true
          },
          resources: { timeRemaining: 1800, memoryAvailable: 2048, parallelSlots: 2 },
          context: {
            environment: 'production',
            changeSize: 'small',
            riskLevel: 'high',
            previousFailures: 1,
            impactAnalyzed: true,
            coverageGapsAnalyzed: true,
            bddGenerated: true
          }
        };

        // Assert
        expect(state.coverage.line).toBe(80);
        expect(state.quality.gateStatus).toBe('passed');
      });
    });

    describe('ConditionOperators', () => {
      it('should support all comparison operators', () => {
        // Arrange
        const conditions: ConditionOperators[] = [
          { gte: 80 },
          { gt: 79 },
          { lte: 100 },
          { lt: 101 },
          { eq: 'passed' },
          { ne: 'failed' },
          { contains: 'agent-1' },
          { exists: true },
          { in: ['a', 'b', 'c'] }
        ];

        // Assert
        expect(conditions[0].gte).toBe(80);
        expect(conditions[4].eq).toBe('passed');
        expect(conditions[8].in).toContain('a');
      });

      it('should allow multiple operators in single condition', () => {
        // Arrange
        const rangeCondition: ConditionOperators = {
          gte: 0,
          lte: 100
        };

        // Assert
        expect(rangeCondition.gte).toBe(0);
        expect(rangeCondition.lte).toBe(100);
      });
    });

    describe('EffectOperators', () => {
      it('should support all effect operators', () => {
        // Arrange
        const effects: EffectOperators[] = [
          { set: 'passed' },
          { increase: 10 },
          { decrease: 5 },
          { increment: 1 },
          { decrement: 1 },
          { add: 'item' },
          { remove: 'item' }
        ];

        // Assert
        expect(effects[0].set).toBe('passed');
        expect(effects[1].increase).toBe(10);
        expect(effects[5].add).toBe('item');
      });
    });

    describe('GOAPAction', () => {
      it('should have all required properties', () => {
        // Arrange
        const action: GOAPAction = {
          id: 'test-action',
          name: 'Test Action',
          description: 'A test action',
          agentType: 'test-agent',
          preconditions: { 'coverage.measured': { eq: true } },
          effects: { 'coverage.line': { increase: 10 } },
          cost: 1.5,
          durationEstimate: 5000,
          successRate: 0.95,
          executionCount: 100,
          category: 'test'
        };

        // Assert
        expect(action.id).toBe('test-action');
        expect(action.category).toBe('test');
        expect(action.cost).toBe(1.5);
      });

      it('should have valid category values', () => {
        // Arrange
        const validCategories: GOAPAction['category'][] = [
          'test', 'security', 'performance', 'process', 'fleet', 'analysis', 'coverage'
        ];

        // Assert
        validCategories.forEach(category => {
          const action: GOAPAction = {
            id: `${category}-action`,
            name: `${category} Action`,
            agentType: 'agent',
            preconditions: {},
            effects: {},
            cost: 1,
            category
          };
          expect(action.category).toBe(category);
        });
      });
    });

    describe('GOAPGoal', () => {
      it('should have all required properties', () => {
        // Arrange
        const goal: GOAPGoal = {
          id: 'coverage-goal',
          name: 'Achieve 80% Coverage',
          description: 'Reach 80% line coverage',
          conditions: { 'coverage.line': { gte: 80 } },
          priority: 4,
          costWeight: 1.5,
          deadlineSeconds: 3600
        };

        // Assert
        expect(goal.id).toBe('coverage-goal');
        expect(goal.priority).toBe(4);
        expect(goal.deadlineSeconds).toBe(3600);
      });
    });

    describe('GOAPPlan', () => {
      it('should have all required properties', () => {
        // Arrange
        const action: GOAPAction = {
          id: 'a1',
          name: 'Action 1',
          agentType: 'agent',
          preconditions: {},
          effects: {},
          cost: 1,
          category: 'test'
        };

        const plan: GOAPPlan = {
          id: 'plan-1',
          goalId: 'goal-1',
          actions: [action],
          totalCost: 5,
          estimatedDuration: 10000,
          goalConditions: { 'coverage.line': { gte: 80 } },
          status: 'pending'
        };

        // Assert
        expect(plan.id).toBe('plan-1');
        expect(plan.actions).toHaveLength(1);
        expect(plan.status).toBe('pending');
      });

      it('should have valid status values', () => {
        // Assert
        const validStatuses: GOAPPlan['status'][] = [
          'pending', 'executing', 'completed', 'failed', 'replanned'
        ];
        validStatuses.forEach(status => {
          expect(['pending', 'executing', 'completed', 'failed', 'replanned']).toContain(status);
        });
      });
    });

    describe('PlanConstraints', () => {
      it('should support all constraint options', () => {
        // Arrange
        const constraints: PlanConstraints = {
          maxIterations: 5000,
          timeoutMs: 3000,
          allowedCategories: ['test', 'coverage'],
          excludedActions: ['action-to-skip'],
          maxPlanLength: 10,
          preferredAgentTypes: ['test-generator']
        };

        // Assert
        expect(constraints.maxIterations).toBe(5000);
        expect(constraints.allowedCategories).toContain('test');
        expect(constraints.excludedActions).toContain('action-to-skip');
      });
    });

    describe('PlanNode', () => {
      it('should have all A* search properties', () => {
        // Arrange
        const node: PlanNode = {
          state: DEFAULT_WORLD_STATE,
          gCost: 5,
          hCost: 3,
          fCost: 8,
          action: null,
          parent: null,
          depth: 2
        };

        // Assert
        expect(node.gCost).toBe(5);
        expect(node.hCost).toBe(3);
        expect(node.fCost).toBe(8);
        expect(node.depth).toBe(2);
      });
    });

    describe('ExecutedAction', () => {
      it('should capture action execution details', () => {
        // Arrange
        const action: GOAPAction = {
          id: 'executed',
          name: 'Executed Action',
          agentType: 'agent',
          preconditions: {},
          effects: {},
          cost: 1,
          category: 'test'
        };

        const executed: ExecutedAction = {
          action,
          success: true,
          result: { testsRun: 50 },
          stateBefore: DEFAULT_WORLD_STATE,
          stateAfter: { ...DEFAULT_WORLD_STATE, coverage: { ...DEFAULT_WORLD_STATE.coverage, line: 80 } },
          executionTimeMs: 1500,
          agentId: 'agent-123'
        };

        // Assert
        expect(executed.success).toBe(true);
        expect(executed.executionTimeMs).toBe(1500);
        expect(executed.agentId).toBe('agent-123');
      });
    });

    describe('ExecutionStep', () => {
      it('should have all step types', () => {
        // Arrange
        const steps: ExecutionStep[] = [
          { type: 'action-started', actionId: 'a1', progress: 0.1 },
          { type: 'action-completed', actionId: 'a1', progress: 0.5 },
          { type: 'action-failed', failedActionId: 'a2', progress: 0.5, message: 'Error occurred' },
          { type: 'replanning', newPlanLength: 3, progress: 0.5 },
          { type: 'plan-completed', progress: 1.0 }
        ];

        // Assert
        expect(steps[0].type).toBe('action-started');
        expect(steps[2].failedActionId).toBe('a2');
        expect(steps[3].newPlanLength).toBe(3);
      });
    });

    describe('ExecutionResult', () => {
      it('should capture full execution result', () => {
        // Arrange
        const result: ExecutionResult = {
          success: false,
          executedActions: [],
          finalState: DEFAULT_WORLD_STATE,
          failedAtAction: 'action-3',
          reason: 'Precondition not met',
          totalExecutionTimeMs: 5000,
          replannedCount: 2
        };

        // Assert
        expect(result.success).toBe(false);
        expect(result.failedAtAction).toBe('action-3');
        expect(result.replannedCount).toBe(2);
      });
    });
  });

  // ============================================================
  // DATABASE RECORD TYPES TESTS
  // ============================================================
  describe('Database Record Types', () => {
    describe('GOAPActionRecord', () => {
      it('should have all database column fields', () => {
        // Arrange
        const record: GOAPActionRecord = {
          id: 'action-1',
          name: 'Test Action',
          description: 'A test action',
          agent_type: 'test-agent',
          preconditions: '{}',
          effects: '{}',
          cost: 1.0,
          duration_estimate: 5000,
          success_rate: 0.95,
          execution_count: 10,
          category: 'test',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        };

        // Assert
        expect(record.id).toBe('action-1');
        expect(record.agent_type).toBe('test-agent');
        expect(typeof record.preconditions).toBe('string');
        expect(typeof record.effects).toBe('string');
      });
    });

    describe('GOAPGoalRecord', () => {
      it('should have all database column fields', () => {
        // Arrange
        const record: GOAPGoalRecord = {
          id: 'goal-1',
          name: 'Coverage Goal',
          description: 'Achieve coverage target',
          conditions: '{"coverage.line": {"gte": 80}}',
          priority: 3,
          cost_weight: 1.0,
          deadline_seconds: 3600,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        };

        // Assert
        expect(record.id).toBe('goal-1');
        expect(record.priority).toBe(3);
        expect(typeof record.conditions).toBe('string');
      });
    });

    describe('GOAPPlanRecord', () => {
      it('should have all database column fields', () => {
        // Arrange
        const record: GOAPPlanRecord = {
          id: 'plan-1',
          goal_id: 'goal-1',
          initial_state: '{}',
          goal_state: '{}',
          action_sequence: '["action-1", "action-2"]',
          total_cost: 5.0,
          estimated_duration: 10000,
          actual_duration: 9500,
          status: 'completed',
          success: 1,
          failure_reason: null,
          execution_trace: '[]',
          replanned_from: null,
          created_at: '2024-01-01T00:00:00Z',
          executed_at: '2024-01-01T00:01:00Z',
          completed_at: '2024-01-01T00:02:00Z'
        };

        // Assert
        expect(record.id).toBe('plan-1');
        expect(record.success).toBe(1);
        expect(record.status).toBe('completed');
      });
    });

    describe('GOAPExecutionStepRecord', () => {
      it('should have all database column fields', () => {
        // Arrange
        const record: GOAPExecutionStepRecord = {
          id: 'step-1',
          plan_id: 'plan-1',
          action_id: 'action-1',
          step_order: 1,
          world_state_before: '{}',
          world_state_after: '{}',
          status: 'completed',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:01:00Z',
          error_message: null,
          agent_id: 'agent-1'
        };

        // Assert
        expect(record.id).toBe('step-1');
        expect(record.step_order).toBe(1);
        expect(record.status).toBe('completed');
      });
    });
  });

  // ============================================================
  // TYPE ALIASES TESTS
  // ============================================================
  describe('Type Aliases', () => {
    describe('StateConditions', () => {
      it('should allow record of conditions', () => {
        // Arrange
        const conditions: StateConditions = {
          'coverage.line': { gte: 80 },
          'quality.testsPassing': { eq: 100 },
          'context.environment': { in: ['staging', 'production'] }
        };

        // Assert
        expect(conditions['coverage.line']).toHaveProperty('gte');
        expect(conditions['quality.testsPassing']).toHaveProperty('eq');
      });
    });

    describe('ActionEffects', () => {
      it('should allow record of effects', () => {
        // Arrange
        const effects: ActionEffects = {
          'coverage.line': { increase: 15 },
          'quality.gateStatus': { set: 'passed' },
          'fleet.availableAgents': { add: 'new-agent' }
        };

        // Assert
        expect(effects['coverage.line']).toHaveProperty('increase');
        expect(effects['quality.gateStatus']).toHaveProperty('set');
      });
    });
  });
});
