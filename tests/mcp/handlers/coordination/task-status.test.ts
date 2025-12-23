/**
 * Task Status Handler Test Suite (RED Phase)
 *
 * Tests for retrieving task status and progress information.
 * Following TDD RED phase - tests should FAIL initially.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TaskStatusHandler } from '@mcp/handlers/coordination/task-status';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('TaskStatusHandler', () => {
  let handler: TaskStatusHandler;
  let mockMemory: any;

  beforeEach(() => {
    mockMemory = {
      store: jest.fn().mockResolvedValue(true),
      retrieve: jest.fn((key: string) => {
        if (key.includes('orchestration:task-123')) {
          return Promise.resolve({
            taskId: 'task-123',
            type: 'comprehensive-testing',
            priority: 'high',
            strategy: 'parallel',
            status: 'running',
            startedAt: '2025-12-08T10:00:00Z',
            completedSteps: ['init', 'test'],
            workflow: [
              { id: 'init', name: 'Initialize', status: 'completed' },
              { id: 'test', name: 'Run Tests', status: 'completed' },
              { id: 'verify', name: 'Verify', status: 'running' },
              { id: 'report', name: 'Report', status: 'pending' }
            ],
            timeline: [
              { timestamp: '2025-12-08T10:00:00Z', type: 'started', description: 'Task started' },
              { timestamp: '2025-12-08T10:01:00Z', type: 'step-completed', description: 'Init completed', stepId: 'init' }
            ]
          });
        }
        return Promise.resolve(null);
      }),
      query: jest.fn().mockResolvedValue([])
    };

    handler = new TaskStatusHandler(mockMemory);
  });

  describe('Happy Path', () => {
    it('should retrieve status for existing task', async () => {
      // GIVEN: Valid task ID
      const args = {
        taskId: 'task-123'
      };

      // WHEN: Getting task status
      const result = await handler.handle(args);

      // THEN: Returns status with progress information
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        taskId: 'task-123',
        status: 'running',
        progress: {
          overall: expect.any(Number),
          byStep: expect.any(Object),
          completedSteps: 2,
          totalSteps: 4
        }
      });
    });

    it('should retrieve status with detailed information', async () => {
      // GIVEN: Request with details flag
      const args = {
        taskId: 'task-123',
        includeDetails: true
      };

      // WHEN: Getting detailed status
      const result = await handler.handle(args);

      // THEN: Returns status with full details
      expect(result.success).toBe(true);
      expect(result.data?.details).toBeDefined();
      expect(result.data?.details).toMatchObject({
        type: 'comprehensive-testing',
        priority: 'high',
        strategy: 'parallel',
        startedAt: '2025-12-08T10:00:00Z',
        workflow: expect.arrayContaining([
          expect.objectContaining({
            id: 'init',
            name: 'Initialize',
            status: 'completed',
            progress: 100
          })
        ])
      });
    });

    it('should retrieve status with timeline', async () => {
      // GIVEN: Request with timeline flag
      const args = {
        taskId: 'task-123',
        includeTimeline: true
      };

      // WHEN: Getting status with timeline
      const result = await handler.handle(args);

      // THEN: Returns status with timeline events
      expect(result.success).toBe(true);
      expect(result.data?.timeline).toBeDefined();
      expect(result.data?.timeline).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            timestamp: expect.any(String),
            type: 'started',
            description: 'Task started'
          })
        ])
      );
    });

    it('should calculate progress percentage correctly', async () => {
      // GIVEN: Task with 50% completion (2 of 4 steps)
      const args = {
        taskId: 'task-123'
      };

      // WHEN: Getting task status
      const result = await handler.handle(args);

      // THEN: Overall progress is 50%
      expect(result.success).toBe(true);
      expect(result.data?.progress.overall).toBe(50);
      expect(result.data?.progress.completedSteps).toBe(2);
      expect(result.data?.progress.totalSteps).toBe(4);
    });
  });

  describe('Validation', () => {
    it('should reject status request without task ID', async () => {
      // GIVEN: Request missing task ID
      const args = {} as any;

      // WHEN: Getting status without ID
      const result = await handler.handle(args);

      // THEN: Returns validation error
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/required.*taskId/i);
    });

    it('should reject status for non-existent task', async () => {
      // GIVEN: Task ID that does not exist
      mockMemory.retrieve.mockResolvedValue(null);

      const args = {
        taskId: 'task-nonexistent'
      };

      // WHEN: Getting status for missing task
      const result = await handler.handle(args);

      // THEN: Returns error for not found
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/task not found/i);
    });
  });

  describe('Progress Calculation', () => {
    it('should calculate step-by-step progress', async () => {
      // GIVEN: Task with mixed step statuses
      const args = {
        taskId: 'task-123'
      };

      // WHEN: Getting task status
      const result = await handler.handle(args);

      // THEN: Each step has progress calculated
      expect(result.success).toBe(true);
      expect(result.data?.progress.byStep).toEqual({
        init: 100,
        test: 100,
        verify: 50,
        report: 0
      });
    });

    it('should handle task with no completed steps', async () => {
      // GIVEN: Task just started
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-new',
        status: 'pending',
        completedSteps: [],
        workflow: [
          { id: 'step1', status: 'pending' },
          { id: 'step2', status: 'pending' }
        ]
      });

      const args = {
        taskId: 'task-new'
      };

      // WHEN: Getting status for new task
      const result = await handler.handle(args);

      // THEN: Progress is 0%
      expect(result.success).toBe(true);
      expect(result.data?.progress.overall).toBe(0);
      expect(result.data?.progress.completedSteps).toBe(0);
    });

    it('should handle task with all steps completed', async () => {
      // GIVEN: Completed task
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-complete',
        status: 'completed',
        completedSteps: ['step1', 'step2'],
        workflow: [
          { id: 'step1', status: 'completed' },
          { id: 'step2', status: 'completed' }
        ]
      });

      const args = {
        taskId: 'task-complete'
      };

      // WHEN: Getting status for completed task
      const result = await handler.handle(args);

      // THEN: Progress is 100%
      expect(result.success).toBe(true);
      expect(result.data?.progress.overall).toBe(100);
      expect(result.data?.progress.completedSteps).toBe(2);
    });

    it('should estimate completion time for running task', async () => {
      // GIVEN: Running task with timeline
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-estimate',
        status: 'running',
        startedAt: '2025-12-08T10:00:00Z',
        workflow: [
          { id: 'step1', status: 'completed', estimatedDuration: 60 },
          { id: 'step2', status: 'running', estimatedDuration: 120 }
        ]
      });

      const args = {
        taskId: 'task-estimate'
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: Estimated completion included
      expect(result.success).toBe(true);
      expect(result.data?.progress.estimatedCompletion).toBeDefined();
    });
  });

  describe('Task Types', () => {
    it('should retrieve workflow execution as task', async () => {
      // GIVEN: Task stored as workflow execution
      mockMemory.retrieve = jest.fn((key: string) => {
        if (key.includes('orchestration')) {
          return Promise.resolve(null);
        }
        if (key.includes('workflow:execution')) {
          return Promise.resolve({
            executionId: 'exec-123',
            status: 'running',
            completedSteps: ['init'],
            steps: [
              { id: 'init', status: 'completed' },
              { id: 'process', status: 'running' }
            ]
          });
        }
        return Promise.resolve(null);
      });

      const args = {
        taskId: 'exec-123'
      };

      // WHEN: Getting workflow execution status
      const result = await handler.handle(args);

      // THEN: Returns status from workflow partition
      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe('exec-123');
      expect(result.data?.status).toBe('running');
    });

    it('should handle orchestration task status', async () => {
      // GIVEN: Task from orchestration partition
      const args = {
        taskId: 'task-123'
      };

      // WHEN: Getting orchestration status
      const result = await handler.handle(args);

      // THEN: Returns orchestration status
      expect(result.success).toBe(true);
      expect(mockMemory.retrieve).toHaveBeenCalledWith(
        'orchestration:task-123',
        expect.objectContaining({
          partition: 'orchestrations'
        })
      );
    });
  });

  describe('Details and Metrics', () => {
    it('should include duration in detailed status', async () => {
      // GIVEN: Task with start and completion times
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-duration',
        status: 'completed',
        startedAt: '2025-12-08T10:00:00Z',
        completedAt: '2025-12-08T10:05:00Z',
        type: 'test',
        priority: 'medium',
        strategy: 'sequential'
      });

      const args = {
        taskId: 'task-duration',
        includeDetails: true
      };

      // WHEN: Getting detailed status
      const result = await handler.handle(args);

      // THEN: Duration calculated
      expect(result.success).toBe(true);
      expect(result.data?.details?.duration).toBe(300000); // 5 minutes in ms
    });

    it('should include metrics when available', async () => {
      // GIVEN: Task with performance metrics
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-metrics',
        status: 'completed',
        type: 'test',
        priority: 'high',
        strategy: 'parallel',
        results: {
          metrics: {
            resourceUtilization: 0.85,
            parallelismEfficiency: 1.2,
            coordinationOverhead: 0.05
          }
        }
      });

      const args = {
        taskId: 'task-metrics',
        includeDetails: true
      };

      // WHEN: Getting status with metrics
      const result = await handler.handle(args);

      // THEN: Metrics included in response
      expect(result.success).toBe(true);
      expect(result.data?.metrics).toEqual({
        resourceUtilization: 0.85,
        parallelismEfficiency: 1.2,
        coordinationOverhead: 0.05
      });
    });

    it('should map workflow steps to status format', async () => {
      // GIVEN: Task with workflow steps
      const args = {
        taskId: 'task-123',
        includeDetails: true
      };

      // WHEN: Getting detailed status
      const result = await handler.handle(args);

      // THEN: Steps mapped with progress
      expect(result.success).toBe(true);
      expect(result.data?.details?.workflow).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            status: expect.any(String),
            progress: expect.any(Number)
          })
        ])
      );
    });
  });

  describe('Boundary Cases', () => {
    it('should handle task with single step', async () => {
      // GIVEN: Minimal task with one step
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-single',
        status: 'running',
        completedSteps: [],
        workflow: [
          { id: 'only-step', status: 'running' }
        ]
      });

      const args = {
        taskId: 'task-single'
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: Progress calculated for single step
      expect(result.success).toBe(true);
      expect(result.data?.progress.totalSteps).toBe(1);
    });

    it('should handle task with many steps', async () => {
      // GIVEN: Task with 100 steps
      const manySteps = Array.from({ length: 100 }, (_, i) => ({
        id: `step-${i}`,
        name: `Step ${i}`,
        status: i < 50 ? 'completed' : 'pending'
      }));

      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-many',
        status: 'running',
        completedSteps: Array.from({ length: 50 }, (_, i) => `step-${i}`),
        workflow: manySteps
      });

      const args = {
        taskId: 'task-many'
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: Progress calculated correctly
      expect(result.success).toBe(true);
      expect(result.data?.progress.overall).toBe(50);
      expect(result.data?.progress.totalSteps).toBe(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle task without workflow steps', async () => {
      // GIVEN: Task with no workflow defined
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-no-workflow',
        status: 'running',
        type: 'simple-task',
        priority: 'low',
        strategy: 'sequential'
      });

      const args = {
        taskId: 'task-no-workflow'
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: Returns status with default progress
      expect(result.success).toBe(true);
      expect(result.data?.progress.totalSteps).toBe(1);
    });

    it('should not estimate completion for completed task', async () => {
      // GIVEN: Completed task
      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: 'task-done',
        status: 'completed',
        startedAt: '2025-12-08T10:00:00Z',
        completedAt: '2025-12-08T10:05:00Z',
        workflow: []
      });

      const args = {
        taskId: 'task-done'
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: No estimated completion
      expect(result.success).toBe(true);
      expect(result.data?.progress.estimatedCompletion).toBeUndefined();
    });

    it('should handle task with special characters in ID', async () => {
      // GIVEN: Task ID with special characters
      const specialId = 'task-test_123-special';

      mockMemory.retrieve = jest.fn().mockResolvedValue({
        taskId: specialId,
        status: 'running',
        workflow: []
      });

      const args = {
        taskId: specialId
      };

      // WHEN: Getting status
      const result = await handler.handle(args);

      // THEN: Status retrieved successfully
      expect(result.success).toBe(true);
      expect(result.data?.taskId).toBe(specialId);
    });
  });
});
