/**
 * Task Status Handler Test Suite
 *
 * Comprehensive tests for task status checking and progress tracking.
 * Tests progress calculation, timeline tracking, metrics, and multi-step workflows.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TaskStatusHandler, TaskStatusArgs, TaskStatus } from '@mcp/handlers/coordination/task-status';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

// Mock SecureRandom for deterministic tests
jest.mock('../../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-status-id'),
    randomFloat: jest.fn(() => 0.5)
  }
}));

describe('TaskStatusHandler', () => {
  let handler: TaskStatusHandler;
  let mockMemory: SwarmMemoryManager;

  beforeEach(async () => {
    mockMemory = new SwarmMemoryManager();
    handler = new TaskStatusHandler(mockMemory);

    // Pre-populate memory with mock tasks
    await mockMemory.store('orchestration:task-123', {
      id: 'task-123',
      type: 'comprehensive-testing',
      status: 'running',
      priority: 'high',
      strategy: 'parallel',
      startedAt: new Date(Date.now() - 3600000).toISOString(),
      completedSteps: ['init', 'analyze'],
      workflow: [
        { id: 'init', name: 'Initialize', status: 'completed', estimatedDuration: 30 },
        { id: 'analyze', name: 'Analyze', status: 'completed', estimatedDuration: 60 },
        { id: 'test', name: 'Test', status: 'running', estimatedDuration: 120 },
        { id: 'report', name: 'Report', status: 'pending', estimatedDuration: 45 }
      ],
      assignments: [
        { agentId: 'agent-1', agentType: 'test-executor', status: 'running', tasks: ['test'] }
      ],
      timeline: [
        { timestamp: new Date().toISOString(), type: 'created', description: 'Task created' },
        { timestamp: new Date().toISOString(), type: 'started', description: 'Execution started' }
      ]
    }, { partition: 'orchestrations' });

    await mockMemory.store('workflow:execution:exec-456', {
      id: 'exec-456',
      status: 'completed',
      priority: 'medium',
      strategy: 'sequential',
      startedAt: new Date(Date.now() - 7200000).toISOString(),
      completedAt: new Date().toISOString(),
      completedSteps: ['step-1', 'step-2', 'step-3'],
      steps: [
        { id: 'step-1', name: 'Step 1', status: 'completed' },
        { id: 'step-2', name: 'Step 2', status: 'completed' },
        { id: 'step-3', name: 'Step 3', status: 'completed' }
      ],
      results: {
        metrics: {
          resourceUtilization: 75,
          parallelismEfficiency: 0.85,
          coordinationOverhead: 120
        }
      }
    }, { partition: 'workflow_executions' });
  });

  describe('Section 1: Basic Status Retrieval', () => {
    it('should retrieve running task status', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.taskId).toBe('task-123');
      expect(response.data.status).toBe('running');
      expect(response.data.progress).toBeDefined();
    });

    it('should retrieve completed task status', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.taskId).toBe('exec-456');
      expect(response.data.status).toBe('completed');
    });

    it('should return status without details by default', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeDetails: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details).toBeUndefined();
    });

    it('should return status without timeline by default', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeTimeline: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.timeline).toBeUndefined();
    });
  });

  describe('Section 2: Progress Calculation', () => {
    it('should calculate overall progress percentage', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.overall).toBeGreaterThanOrEqual(0);
      expect(response.data.progress.overall).toBeLessThanOrEqual(100);
    });

    it('should track completed vs total steps', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.completedSteps).toBe(2);
      expect(response.data.progress.totalSteps).toBe(4);
    });

    it('should calculate progress by step', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.byStep).toBeDefined();
      expect(response.data.progress.byStep['init']).toBe(100);
      expect(response.data.progress.byStep['analyze']).toBe(100);
      expect(response.data.progress.byStep['test']).toBe(50);
      expect(response.data.progress.byStep['report']).toBe(0);
    });

    it('should calculate 100% progress for completed tasks', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.overall).toBe(100);
      expect(response.data.progress.completedSteps).toBe(3);
      expect(response.data.progress.totalSteps).toBe(3);
    });

    it('should estimate completion time for running tasks', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      if (response.data.progress.estimatedCompletion) {
        const estimatedDate = new Date(response.data.progress.estimatedCompletion);
        expect(estimatedDate.getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should not estimate completion for completed tasks', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.estimatedCompletion).toBeUndefined();
    });
  });

  describe('Section 3: Detailed Status Information', () => {
    it('should include task details when requested', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details).toBeDefined();
      expect(response.data.details?.type).toBe('comprehensive-testing');
      expect(response.data.details?.priority).toBe('high');
      expect(response.data.details?.strategy).toBe('parallel');
    });

    it('should include start and completion times in details', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details?.startedAt).toBeDefined();
      expect(response.data.details?.completedAt).toBeDefined();
      expect(response.data.details?.duration).toBeGreaterThan(0);
    });

    it('should include agent assignments in details', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details?.assignments).toBeDefined();
      expect(response.data.details?.assignments?.length).toBeGreaterThan(0);
      expect(response.data.details?.assignments?.[0].agentId).toBe('agent-1');
      expect(response.data.details?.assignments?.[0].agentType).toBe('test-executor');
    });

    it('should include workflow step status in details', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details?.workflow).toBeDefined();
      expect(response.data.details?.workflow?.length).toBe(4);
      expect(response.data.details?.workflow?.[0].status).toBe('completed');
      expect(response.data.details?.workflow?.[2].status).toBe('running');
    });

    it('should calculate task duration', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details?.duration).toBeDefined();
      expect(response.data.details?.duration).toBeGreaterThan(0);
    });
  });

  describe('Section 4: Timeline Tracking', () => {
    it('should include timeline when requested', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeTimeline: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.timeline).toBeDefined();
      expect(response.data.timeline?.length).toBeGreaterThan(0);
    });

    it('should track timeline event types', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeTimeline: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const eventTypes = response.data.timeline?.map(e => e.type) || [];
      expect(eventTypes).toContain('created');
      expect(eventTypes).toContain('started');
    });

    it('should include timestamps in timeline events', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeTimeline: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.timeline?.forEach(event => {
        expect(event.timestamp).toBeDefined();
        expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
      });
    });

    it('should include descriptions in timeline events', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeTimeline: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      response.data.timeline?.forEach(event => {
        expect(event.description).toBeDefined();
        expect(typeof event.description).toBe('string');
        expect(event.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Section 5: Metrics and Performance', () => {
    it('should include metrics when details requested', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metrics).toBeDefined();
      expect(response.data.metrics?.resourceUtilization).toBe(75);
      expect(response.data.metrics?.parallelismEfficiency).toBe(0.85);
      expect(response.data.metrics?.coordinationOverhead).toBe(120);
    });

    it('should track resource utilization', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metrics?.resourceUtilization).toBeGreaterThanOrEqual(0);
      expect(response.data.metrics?.resourceUtilization).toBeLessThanOrEqual(100);
    });

    it('should track parallelism efficiency', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metrics?.parallelismEfficiency).toBeGreaterThanOrEqual(0);
      expect(response.data.metrics?.parallelismEfficiency).toBeLessThanOrEqual(1.0);
    });

    it('should track coordination overhead', async () => {
      const args: TaskStatusArgs = {
        taskId: 'exec-456',
        includeDetails: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.metrics?.coordinationOverhead).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Section 6: Task Status Types', () => {
    it('should handle pending task status', async () => {
      await mockMemory.store('orchestration:task-pending', {
        id: 'task-pending',
        status: 'pending',
        completedSteps: [],
        workflow: [{ id: 'step-1', status: 'pending' }]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({ taskId: 'task-pending' });

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('pending');
      expect(response.data.progress.overall).toBe(0);
    });

    it('should handle failed task status', async () => {
      await mockMemory.store('orchestration:task-failed', {
        id: 'task-failed',
        status: 'failed',
        completedSteps: ['step-1'],
        workflow: [
          { id: 'step-1', status: 'completed' },
          { id: 'step-2', status: 'failed' }
        ]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({ taskId: 'task-failed' });

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('failed');
    });

    it('should handle cancelled task status', async () => {
      await mockMemory.store('orchestration:task-cancelled', {
        id: 'task-cancelled',
        status: 'cancelled',
        completedSteps: [],
        workflow: [{ id: 'step-1', status: 'cancelled' }]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({ taskId: 'task-cancelled' });

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('cancelled');
    });
  });

  describe('Section 7: Input Validation', () => {
    it('should reject missing taskId', async () => {
      const args = {} as any;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toMatch(/taskId/i);
    });

    it('should reject empty taskId', async () => {
      const args: TaskStatusArgs = {
        taskId: ''
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle non-existent task', async () => {
      const args: TaskStatusArgs = {
        taskId: 'non-existent-task'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/not found/i);
    });

    it('should accept valid boolean flags', async () => {
      const args: TaskStatusArgs = {
        taskId: 'task-123',
        includeDetails: true,
        includeTimeline: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.details).toBeDefined();
      expect(response.data.timeline).toBeDefined();
    });
  });

  describe('Section 8: Edge Cases', () => {
    it('should handle task with no steps', async () => {
      await mockMemory.store('orchestration:task-no-steps', {
        id: 'task-no-steps',
        status: 'running',
        completedSteps: [],
        workflow: []
      }, { partition: 'orchestrations' });

      const response = await handler.handle({ taskId: 'task-no-steps' });

      expect(response.success).toBe(true);
      expect(response.data.progress.totalSteps).toBe(0);
    });

    it('should handle task with missing completion time', async () => {
      await mockMemory.store('orchestration:task-no-complete-time', {
        id: 'task-no-complete-time',
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedSteps: ['step-1'],
        workflow: [{ id: 'step-1', status: 'completed' }]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({
        taskId: 'task-no-complete-time',
        includeDetails: true
      });

      expect(response.success).toBe(true);
      expect(response.data.details?.duration).toBeUndefined();
    });

    it('should handle task with missing timeline', async () => {
      await mockMemory.store('orchestration:task-no-timeline', {
        id: 'task-no-timeline',
        status: 'running',
        completedSteps: [],
        workflow: [{ id: 'step-1', status: 'running' }]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({
        taskId: 'task-no-timeline',
        includeTimeline: true
      });

      expect(response.success).toBe(true);
      // Timeline should be empty or undefined
      if (response.data.timeline) {
        expect(Array.isArray(response.data.timeline)).toBe(true);
      }
    });

    it('should handle task with very long duration', async () => {
      await mockMemory.store('orchestration:task-long-duration', {
        id: 'task-long-duration',
        status: 'running',
        startedAt: new Date(Date.now() - 86400000 * 30).toISOString(), // 30 days ago
        completedSteps: ['step-1'],
        workflow: [
          { id: 'step-1', status: 'completed' },
          { id: 'step-2', status: 'running' }
        ]
      }, { partition: 'orchestrations' });

      const response = await handler.handle({
        taskId: 'task-long-duration',
        includeDetails: true
      });

      expect(response.success).toBe(true);
      expect(response.data.details?.duration).toBeGreaterThan(86400000 * 29);
    });
  });

  describe('Section 9: Concurrent Status Checks', () => {
    it('should handle concurrent status requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        handler.handle({ taskId: 'task-123' })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.taskId).toBe('task-123');
      });
    });

    it('should handle mixed status requests for different tasks', async () => {
      const promises = [
        handler.handle({ taskId: 'task-123' }),
        handler.handle({ taskId: 'exec-456' }),
        handler.handle({ taskId: 'task-123', includeDetails: true }),
        handler.handle({ taskId: 'exec-456', includeTimeline: true })
      ];

      const results = await Promise.all(promises);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
      expect(results[3].success).toBe(true);
    });
  });

  describe('Section 10: Performance', () => {
    it('should complete status check within reasonable time', async () => {
      const startTime = Date.now();
      const response = await handler.handle({ taskId: 'task-123' });
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it('should track execution time', async () => {
      const response = await handler.handle({ taskId: 'task-123' });

      expect(response.success).toBe(true);
      expect(response.executionTime).toBeDefined();
      expect(response.executionTime).toBeGreaterThan(0);
    });

    it('should handle rapid sequential status checks', async () => {
      const results = [];

      for (let i = 0; i < 10; i++) {
        const result = await handler.handle({ taskId: 'task-123' });
        results.push(result);
      }

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Section 11: Error Handling', () => {
    it('should handle errors gracefully', async () => {
      const args = {
        taskId: null
      } as any;

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const args = {} as any;

      const response = await handler.handle(args);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error.length).toBeGreaterThan(0);
      }
    });

    it('should handle corrupted task data', async () => {
      await mockMemory.store('orchestration:task-corrupted', {
        id: 'task-corrupted',
        // Missing critical fields
      }, { partition: 'orchestrations' });

      const response = await handler.handle({ taskId: 'task-corrupted' });

      // Should either handle gracefully or report error
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });
  });
});
