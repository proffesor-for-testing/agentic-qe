/**
 * Unit tests for Task MCP Handlers
 * Tests task submit, list, status, cancel, orchestrate, and routing operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  handleTaskSubmit,
  handleTaskList,
  handleTaskStatus,
  handleTaskCancel,
  handleTaskOrchestrate,
  handleModelRoute,
  handleRoutingMetrics,
} from '../../../../src/mcp/handlers/task-handlers';
import {
  handleFleetInit,
  disposeFleet,
} from '../../../../src/mcp/handlers/core-handlers';
import { resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence';
import type {
  TaskSubmitParams,
  TaskListParams,
  TaskStatusParams,
  TaskCancelParams,
} from '../../../../src/mcp/types';

// ============================================================================
// Tests
// ============================================================================

describe('Task Handlers', () => {
  // Initialize fleet before each test (in-memory to avoid touching live DB)
  beforeEach(async () => {
    await handleFleetInit({ memoryBackend: 'memory' });
  });

  // Clean up after each test
  afterEach(async () => {
    await disposeFleet();
    resetUnifiedPersistence();
  });

  // --------------------------------------------------------------------------
  // handleTaskSubmit
  // --------------------------------------------------------------------------

  describe('handleTaskSubmit', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTaskSubmit({
        type: 'generate-tests',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should submit task with required type', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.type).toBe('generate-tests');
      expect(['pending', 'queued']).toContain(result.data!.status);
    });

    it('should use default priority when not specified', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
      });

      expect(result.success).toBe(true);
      expect(result.data!.priority).toBe('p1');
    });

    it('should respect custom priority parameter', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
        priority: 'p0',
      });

      expect(result.success).toBe(true);
      expect(result.data!.priority).toBe('p0');
    });

    it('should handle targetDomains parameter', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
        targetDomains: ['test-generation'],
      });

      expect(result.success).toBe(true);
      // May be assigned to specified domain
    });

    it('should handle payload parameter', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
        payload: {
          sourceCode: 'const x = 1;',
          language: 'typescript',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should handle timeout parameter', async () => {
      const result = await handleTaskSubmit({
        type: 'generate-tests',
        timeout: 60000,
      });

      expect(result.success).toBe(true);
    });

    it('should generate unique task IDs', async () => {
      const result1 = await handleTaskSubmit({ type: 'generate-tests' });
      const result2 = await handleTaskSubmit({ type: 'execute-tests' });

      expect(result1.data!.taskId).not.toBe(result2.data!.taskId);
    });

    it('should submit various task types', async () => {
      const taskTypes = [
        'generate-tests',
        'execute-tests',
        'analyze-coverage',
        'assess-quality',
        'scan-security',
      ] as const;

      const results = await Promise.all(
        taskTypes.map(type => handleTaskSubmit({ type }))
      );

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.data!.type).toBe(taskTypes[i]);
      });
    });
  });

  // --------------------------------------------------------------------------
  // handleTaskList
  // --------------------------------------------------------------------------

  describe('handleTaskList', () => {
    beforeEach(async () => {
      // Submit some tasks for testing
      await handleTaskSubmit({ type: 'generate-tests', priority: 'p0' });
      await handleTaskSubmit({ type: 'execute-tests', priority: 'p1' });
      await handleTaskSubmit({ type: 'analyze-coverage', priority: 'p2' });
    });

    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTaskList({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should list all tasks', async () => {
      const result = await handleTaskList({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data!.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter tasks by status', async () => {
      const result = await handleTaskList({ status: 'queued' });

      expect(result.success).toBe(true);
      result.data!.forEach(task => {
        expect(['queued', 'assigned']).toContain(task.status);
      });
    });

    it('should filter tasks by priority', async () => {
      const result = await handleTaskList({ priority: 'p0' });

      expect(result.success).toBe(true);
      result.data!.forEach(task => {
        expect(task.priority).toBe('p0');
      });
    });

    it('should apply limit parameter', async () => {
      const result = await handleTaskList({ limit: 2 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBeLessThanOrEqual(2);
    });

    it('should return task details', async () => {
      const result = await handleTaskList({});

      expect(result.success).toBe(true);
      if (result.data!.length > 0) {
        const task = result.data![0];
        expect(task.taskId).toBeDefined();
        expect(task.type).toBeDefined();
        expect(task.status).toBeDefined();
        expect(task.priority).toBeDefined();
        expect(task.createdAt).toBeDefined();
      }
    });

    it('should handle empty result', async () => {
      const result = await handleTaskList({ status: 'completed' });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // handleTaskStatus
  // --------------------------------------------------------------------------

  describe('handleTaskStatus', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTaskStatus({ taskId: 'task-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return error for non-existent task', async () => {
      const result = await handleTaskStatus({ taskId: 'nonexistent-task' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });

    it('should return task status for valid task', async () => {
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      const result = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBe(submitResult.data!.taskId);
      expect(result.data!.type).toBe('generate-tests');
      expect(result.data!.status).toBeDefined();
    });

    it('should return detailed result when detailed is true', async () => {
      const submitResult = await handleTaskSubmit({
        type: 'generate-tests',
        payload: { test: 'data' },
      });
      const result = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
        detailed: true,
      });

      expect(result.success).toBe(true);
      // When detailed=true, result field should be included if available
    });

    it('should include timing information', async () => {
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      const result = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.createdAt).toBeDefined();
    });

    it('should include assignedAgents array', async () => {
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      const result = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
      });

      expect(result.success).toBe(true);
      expect(result.data!.assignedAgents).toBeDefined();
      expect(Array.isArray(result.data!.assignedAgents)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // handleTaskCancel
  // --------------------------------------------------------------------------

  describe('handleTaskCancel', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTaskCancel({ taskId: 'task-1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should return error for non-existent task', async () => {
      const result = await handleTaskCancel({ taskId: 'nonexistent-task' });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle cancel request for task', async () => {
      // Note: Tasks execute synchronously/immediately, so cancel may not succeed
      // if task has already completed or failed. This tests the cancel API works.
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      const result = await handleTaskCancel({
        taskId: submitResult.data!.taskId,
      });

      // Cancel returns success with cancelled=true if task was pending,
      // or success=false with error if task already finished
      if (result.success) {
        expect(result.data!.taskId).toBe(submitResult.data!.taskId);
        expect(result.data!.cancelled).toBe(true);
      } else {
        // Task already completed/failed before cancel was processed
        expect(result.error).toContain('already finished');
      }
    });

    it('should report task status after cancel attempt', async () => {
      // Note: Tasks execute synchronously, so status may be completed/failed/cancelled
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      await handleTaskCancel({ taskId: submitResult.data!.taskId });

      const statusResult = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
      });

      expect(statusResult.success).toBe(true);
      // Status could be 'cancelled' (if cancel succeeded), 'completed', or 'failed'
      expect(['cancelled', 'completed', 'failed']).toContain(statusResult.data!.status);
    });
  });

  // --------------------------------------------------------------------------
  // handleTaskOrchestrate
  // --------------------------------------------------------------------------

  describe('handleTaskOrchestrate', () => {
    it('should return error when fleet is not initialized', async () => {
      await disposeFleet();
      const result = await handleTaskOrchestrate({
        task: 'Generate unit tests for auth module',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Fleet not initialized. Call fleet_init first.');
    });

    it('should orchestrate task from description', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Generate unit tests for the authentication module',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.taskId).toBeDefined();
      expect(result.data!.type).toBe('generate-tests');
      expect(result.data!.status).toBe('submitted');
    }, 30000);

    it('should infer test execution type', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Run all integration tests',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('execute-tests');
    }, 30000);

    it('should infer coverage analysis type', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Analyze test coverage for the project',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('analyze-coverage');
    }, 30000);

    it('should infer security scan type', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Scan for security vulnerabilities',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('scan-security');
    }, 30000);

    it('should respect strategy parameter', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Generate tests',
        strategy: 'parallel',
      });

      expect(result.success).toBe(true);
      expect(result.data!.strategy).toBe('parallel');
    }, 30000);

    it('should map priority to internal format', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Critical security scan',
        priority: 'critical',
      });

      expect(result.success).toBe(true);
      expect(result.data!.priority).toBe('p0');
    }, 30000);

    it('should include routing information (ADR-051)', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Generate unit tests',
      });

      expect(result.success).toBe(true);
      expect(result.data!.routing).toBeDefined();
      expect(result.data!.routing.tier).toBeDefined();
      expect(result.data!.routing.tierName).toBeDefined();
      expect(result.data!.routing.modelId).toBeDefined();
      expect(result.data!.routing.confidence).toBeGreaterThan(0);
    }, 30000);

    it('should handle context parameter', async () => {
      const result = await handleTaskOrchestrate({
        task: 'Generate tests',
        context: {
          project: 'my-project',
          branch: 'feature/test',
          environment: 'development',
        },
      });

      expect(result.success).toBe(true);
    }, 30000);

    it('should infer domain from task description when context.project is missing (Fix #282)', async () => {
      // Security task should infer security-compliance domain
      const secResult = await handleTaskOrchestrate({
        task: 'Scan for security vulnerabilities and XSS issues',
      });
      expect(secResult.success).toBe(true);
      expect(secResult.data!.routing).toBeDefined();

      // Coverage task should infer coverage-analysis domain
      const covResult = await handleTaskOrchestrate({
        task: 'Analyze test coverage gaps in the project',
      });
      expect(covResult.success).toBe(true);
      expect(covResult.data!.routing).toBeDefined();
    }, 30000);
  });

  // --------------------------------------------------------------------------
  // handleModelRoute (ADR-051)
  // --------------------------------------------------------------------------

  describe('handleModelRoute', () => {
    it('should route task without requiring fleet initialization', async () => {
      // Model routing can work independently of fleet
      const result = await handleModelRoute({
        task: 'Fix a simple typo in documentation',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.tier).toBeDefined();
      expect(result.data!.tierName).toBeDefined();
      expect(result.data!.modelId).toBeDefined();
    });

    it('should return complexity analysis', async () => {
      const result = await handleModelRoute({
        task: 'Implement a complex authentication system with OAuth2',
      });

      expect(result.success).toBe(true);
      expect(result.data!.complexity).toBeDefined();
      expect(result.data!.complexity.overall).toBeGreaterThanOrEqual(0);
      expect(result.data!.complexity.code).toBeGreaterThanOrEqual(0);
      expect(result.data!.complexity.reasoning).toBeGreaterThanOrEqual(0);
      expect(result.data!.complexity.scope).toBeGreaterThanOrEqual(0);
    });

    it('should return confidence score', async () => {
      const result = await handleModelRoute({
        task: 'Add a comment to code',
      });

      expect(result.success).toBe(true);
      expect(result.data!.confidence).toBeGreaterThan(0);
      expect(result.data!.confidence).toBeLessThanOrEqual(1);
    });

    it('should return rationale', async () => {
      const result = await handleModelRoute({
        task: 'Generate comprehensive test suite',
      });

      expect(result.success).toBe(true);
      expect(result.data!.rationale).toBeDefined();
      expect(typeof result.data!.rationale).toBe('string');
    });

    it('should include budget information', async () => {
      const result = await handleModelRoute({
        task: 'Simple code review',
      });

      expect(result.success).toBe(true);
      expect(result.data!.budget).toBeDefined();
      expect(typeof result.data!.budget.allowed).toBe('boolean');
      expect(result.data!.budget.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });

    it('should respect manualTier override', async () => {
      const result = await handleModelRoute({
        task: 'Simple task',
        manualTier: 3, // Force tier 3
      });

      expect(result.success).toBe(true);
      expect(result.data!.tier).toBe(3);
    });

    it('should handle critical task flag', async () => {
      const result = await handleModelRoute({
        task: 'Critical security vulnerability fix',
        isCritical: true,
      });

      expect(result.success).toBe(true);
      // Critical tasks may get higher tier
    });

    it('should return decision time', async () => {
      const result = await handleModelRoute({
        task: 'Any task',
      });

      expect(result.success).toBe(true);
      expect(result.data!.decisionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // --------------------------------------------------------------------------
  // handleRoutingMetrics (ADR-051)
  // --------------------------------------------------------------------------

  describe('handleRoutingMetrics', () => {
    it('should return routing statistics', async () => {
      // First make some routing decisions
      await handleModelRoute({ task: 'task 1' });
      await handleModelRoute({ task: 'task 2' });

      const result = await handleRoutingMetrics({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.stats).toBeDefined();
    });

    it('should include model router metrics', async () => {
      const result = await handleRoutingMetrics({});

      expect(result.success).toBe(true);
      expect(result.data!.modelRouterMetrics).toBeDefined();
      expect(result.data!.modelRouterMetrics.totalDecisions).toBeGreaterThanOrEqual(0);
      expect(result.data!.modelRouterMetrics.avgDecisionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include agent booster stats', async () => {
      const result = await handleRoutingMetrics({});

      expect(result.success).toBe(true);
      expect(result.data!.modelRouterMetrics.agentBoosterStats).toBeDefined();
      expect(result.data!.modelRouterMetrics.agentBoosterStats.eligible).toBeGreaterThanOrEqual(0);
    });

    it('should never report negative fallbackToLLM (Fix #282)', async () => {
      // Route some tasks first to populate metrics
      await handleModelRoute({ task: 'Fix a typo' });
      await handleModelRoute({ task: 'Refactor auth module' });

      const result = await handleRoutingMetrics({});
      expect(result.success).toBe(true);

      const stats = result.data!.modelRouterMetrics.agentBoosterStats;
      expect(stats.fallbackToLLM).toBeGreaterThanOrEqual(0);
    });

    it('should include budget stats', async () => {
      const result = await handleRoutingMetrics({});

      expect(result.success).toBe(true);
      expect(result.data!.modelRouterMetrics.budgetStats).toBeDefined();
      expect(result.data!.modelRouterMetrics.budgetStats.totalSpentUsd).toBeGreaterThanOrEqual(0);
    });

    it('should include log when requested', async () => {
      const result = await handleRoutingMetrics({ includeLog: true });

      expect(result.success).toBe(true);
      expect(result.data!.log).toBeDefined();
      expect(Array.isArray(result.data!.log)).toBe(true);
    });

    it('should respect logLimit parameter', async () => {
      // Make several routing decisions
      for (let i = 0; i < 5; i++) {
        await handleModelRoute({ task: `task ${i}` });
      }

      const result = await handleRoutingMetrics({
        includeLog: true,
        logLimit: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data!.log!.length).toBeLessThanOrEqual(3);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases and Error Handling
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle concurrent task submissions', async () => {
      const results = await Promise.all([
        handleTaskSubmit({ type: 'generate-tests' }),
        handleTaskSubmit({ type: 'execute-tests' }),
        handleTaskSubmit({ type: 'analyze-coverage' }),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // All task IDs should be unique
      const ids = results.map(r => r.data!.taskId);
      expect(new Set(ids).size).toBe(3);
    });

    it('should handle task status check immediately after submit', async () => {
      const submitResult = await handleTaskSubmit({ type: 'generate-tests' });
      const statusResult = await handleTaskStatus({
        taskId: submitResult.data!.taskId,
      });

      expect(statusResult.success).toBe(true);
      expect(statusResult.data!.taskId).toBe(submitResult.data!.taskId);
    });

    it('should handle limit of 0 for task list', async () => {
      await handleTaskSubmit({ type: 'generate-tests' });

      const result = await handleTaskList({ limit: 0 });

      expect(result.success).toBe(true);
      expect(result.data!.length).toBe(0);
    });

    it('should handle large limit for task list', async () => {
      await handleTaskSubmit({ type: 'generate-tests' });

      const result = await handleTaskList({ limit: 10000 });

      expect(result.success).toBe(true);
    });

    it('should handle empty task description for orchestrate', async () => {
      const result = await handleTaskOrchestrate({ task: '' });

      expect(result.success).toBe(true);
      // Should default to generate-tests
      expect(result.data!.type).toBe('generate-tests');
    }, 30000);

    it('should handle very long task description', async () => {
      const longDescription = 'Generate tests for ' + 'module '.repeat(100);

      const result = await handleTaskOrchestrate({ task: longDescription });

      expect(result.success).toBe(true);
    }, 30000);
  });
});
