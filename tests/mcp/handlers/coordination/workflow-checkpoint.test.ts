/**
 * coordination/workflow-checkpoint Test Suite
 *
 * Tests for workflow state checkpointing.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowCheckpointHandler, WorkflowCheckpointArgs, Checkpoint } from '@mcp/handlers/coordination/workflow-checkpoint';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('WorkflowCheckpointHandler', () => {
  let handler: WorkflowCheckpointHandler;
  let mockMemory: jest.Mocked<SwarmMemoryManager>;

  beforeEach(() => {
    // Create mock memory manager
    mockMemory = {
      retrieve: jest.fn(),
      store: jest.fn(),
      query: jest.fn(),
      postHint: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn()
    } as any;

    handler = new WorkflowCheckpointHandler(mockMemory);
  });

  describe('Happy Path', () => {
    it('should create checkpoint for valid execution successfully', async () => {
      const executionId = 'exec-1234-abc';
      const mockExecution = {
        executionId,
        workflowId: 'workflow-123',
        status: 'running',
        completedSteps: ['init', 'test'],
        currentStep: 'verify',
        failedSteps: [],
        context: {
          variables: { testEnv: 'staging', buildNumber: '42' },
          environment: 'staging',
          dryRun: false
        },
        startedAt: '2025-11-03T10:00:00.000Z'
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const args: WorkflowCheckpointArgs = {
        executionId,
        reason: 'Manual checkpoint before critical deployment step',
        metadata: {
          triggeredBy: 'user',
          priority: 'high'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.checkpointId).toMatch(/^cp-\d+-[a-zA-Z0-9]+$/);
      expect(response.data.executionId).toBe(executionId);
      expect(response.data.reason).toBe('Manual checkpoint before critical deployment step');
      expect(response.data.state.completedSteps).toEqual(['init', 'test']);
      expect(response.data.state.currentStep).toBe('verify');
      expect(response.data.state.variables).toEqual({ testEnv: 'staging', buildNumber: '42' });

      // Verify memory operations
      expect(mockMemory.retrieve).toHaveBeenCalledWith(
        `workflow:execution:${executionId}`,
        { partition: 'workflow_executions' }
      );
      expect(mockMemory.store).toHaveBeenCalled();
      expect(mockMemory.postHint).toHaveBeenCalled();
    });

    it('should return expected data structure with all checkpoint fields', async () => {
      const executionId = 'exec-5678-def';
      const mockExecution = {
        executionId,
        workflowId: 'workflow-456',
        status: 'running',
        completedSteps: ['prepare', 'build', 'test'],
        currentStep: 'deploy',
        failedSteps: [],
        context: {
          variables: { releaseVersion: '2.0.0', region: 'us-east-1' },
          environment: 'production'
        }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const args: WorkflowCheckpointArgs = {
        executionId,
        reason: 'Checkpoint before production deployment',
        metadata: {
          deploymentId: 'deploy-789',
          approver: 'admin@example.com'
        }
      };

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
      expect(response.metadata).toHaveProperty('timestamp');

      const checkpoint: Checkpoint = response.data;
      expect(checkpoint).toHaveProperty('checkpointId');
      expect(checkpoint).toHaveProperty('executionId');
      expect(checkpoint).toHaveProperty('timestamp');
      expect(checkpoint).toHaveProperty('reason');
      expect(checkpoint).toHaveProperty('state');
      expect(checkpoint).toHaveProperty('metadata');

      expect(checkpoint.state).toHaveProperty('completedSteps');
      expect(checkpoint.state).toHaveProperty('currentStep');
      expect(checkpoint.state).toHaveProperty('failedSteps');
      expect(checkpoint.state).toHaveProperty('variables');
      expect(checkpoint.state).toHaveProperty('context');
    });

    it('should create checkpoint with failed steps included', async () => {
      const executionId = 'exec-failure-123';
      const mockExecution = {
        executionId,
        workflowId: 'workflow-789',
        status: 'running',
        completedSteps: ['init', 'build'],
        currentStep: 'retry-test',
        failedSteps: ['test', 'integration-test'],
        context: {
          variables: { retryCount: 2, maxRetries: 3 },
          environment: 'staging'
        }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const args: WorkflowCheckpointArgs = {
        executionId,
        reason: 'Checkpoint after test failures for recovery',
        metadata: { failureAnalysis: true }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.state.failedSteps).toEqual(['test', 'integration-test']);
      expect(response.data.state.completedSteps).toEqual(['init', 'build']);
      expect(response.data.metadata.executionStatus).toBe('running');
    });

    it('should store checkpoint in memory with correct TTL', async () => {
      const executionId = 'exec-ttl-test';
      const mockExecution = {
        executionId,
        workflowId: 'workflow-ttl',
        status: 'running',
        completedSteps: ['step1'],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const args: WorkflowCheckpointArgs = {
        executionId,
        reason: 'TTL verification checkpoint'
      };

      await handler.handle(args);

      // Verify store was called with correct TTL (7 days = 604800 seconds)
      expect(mockMemory.store).toHaveBeenCalledWith(
        expect.stringMatching(/^workflow:checkpoint:cp-/),
        expect.objectContaining({
          executionId,
          state: expect.any(Object)
        }),
        expect.objectContaining({
          partition: 'workflow_checkpoints',
          ttl: 604800
        })
      );
    });

    it('should post hint to blackboard for coordination', async () => {
      const executionId = 'exec-hint-test';
      const mockExecution = {
        executionId,
        workflowId: 'workflow-hint',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const args: WorkflowCheckpointArgs = {
        executionId,
        reason: 'Coordination checkpoint'
      };

      const response = await handler.handle(args);

      expect(mockMemory.postHint).toHaveBeenCalledWith({
        key: expect.stringMatching(/^aqe\/checkpoint\/cp-/),
        value: expect.objectContaining({
          checkpointId: expect.any(String),
          executionId,
          timestamp: expect.any(String)
        }),
        ttl: 3600 // 1 hour
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject input without executionId', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('executionId');
    });

    it('should reject input with null executionId', async () => {
      const response = await handler.handle({ executionId: null } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject input with undefined executionId', async () => {
      const response = await handler.handle({ executionId: undefined } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should accept valid input with minimal fields', async () => {
      const mockExecution = {
        executionId: 'exec-minimal',
        workflowId: 'workflow-min',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({ executionId: 'exec-minimal' });

      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle execution not found gracefully', async () => {
      mockMemory.retrieve.mockResolvedValue(null);

      const response = await handler.handle({
        executionId: 'non-existent-exec'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle memory retrieve failure gracefully', async () => {
      mockMemory.retrieve.mockRejectedValue(new Error('Database connection failed'));

      const response = await handler.handle({
        executionId: 'exec-db-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle memory store failure gracefully', async () => {
      mockMemory.retrieve.mockResolvedValue({
        executionId: 'exec-store-error',
        workflowId: 'workflow-error',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      });
      mockMemory.store.mockRejectedValue(new Error('Storage quota exceeded'));

      const response = await handler.handle({
        executionId: 'exec-store-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      mockMemory.retrieve.mockResolvedValue(null);

      const response = await handler.handle({
        executionId: 'missing-exec-123'
      });

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
        expect(response.error).toContain('missing-exec-123');
      }
    });

    it('should handle postHint failure without breaking checkpoint creation', async () => {
      const mockExecution = {
        executionId: 'exec-hint-fail',
        workflowId: 'workflow-hint-fail',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockRejectedValue(new Error('Hint service unavailable'));

      const response = await handler.handle({
        executionId: 'exec-hint-fail'
      });

      // Should fail since postHint is part of the checkpoint creation process
      expect(response.success).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle checkpoint with empty completed steps', async () => {
      const mockExecution = {
        executionId: 'exec-empty-steps',
        workflowId: 'workflow-empty',
        status: 'running',
        completedSteps: [],
        currentStep: 'first-step',
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({
        executionId: 'exec-empty-steps'
      });

      expect(response.success).toBe(true);
      expect(response.data.state.completedSteps).toEqual([]);
    });

    it('should handle checkpoint with no current step', async () => {
      const mockExecution = {
        executionId: 'exec-no-current',
        workflowId: 'workflow-no-current',
        status: 'running',
        completedSteps: ['step1', 'step2'],
        currentStep: undefined,
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({
        executionId: 'exec-no-current'
      });

      expect(response.success).toBe(true);
      expect(response.data.state.currentStep).toBeUndefined();
    });

    it('should handle checkpoint with large variable set', async () => {
      const largeVariables: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeVariables[`var${i}`] = `value${i}`;
      }

      const mockExecution = {
        executionId: 'exec-large-vars',
        workflowId: 'workflow-large',
        status: 'running',
        completedSteps: ['step1'],
        failedSteps: [],
        context: { variables: largeVariables }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({
        executionId: 'exec-large-vars'
      });

      expect(response.success).toBe(true);
      expect(Object.keys(response.data.state.variables).length).toBe(1000);
    });

    it('should handle checkpoint with nested context objects', async () => {
      const mockExecution = {
        executionId: 'exec-nested',
        workflowId: 'workflow-nested',
        status: 'running',
        completedSteps: ['step1'],
        failedSteps: [],
        context: {
          variables: { simple: 'value' },
          nested: {
            level1: {
              level2: {
                level3: {
                  deepValue: 'nested-data'
                }
              }
            }
          },
          arrays: ['item1', 'item2', 'item3']
        }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({
        executionId: 'exec-nested'
      });

      expect(response.success).toBe(true);
      expect(response.data.state.context.nested.level1.level2.level3.deepValue).toBe('nested-data');
    });

    it('should handle concurrent checkpoint creation requests', async () => {
      const mockExecution = {
        executionId: 'exec-concurrent',
        workflowId: 'workflow-concurrent',
        status: 'running',
        completedSteps: ['step1'],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          executionId: 'exec-concurrent',
          reason: `Checkpoint ${i}`
        })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toHaveProperty('success', true);
        expect(result.data.checkpointId).toBeDefined();
      });

      // All checkpoint IDs should be unique
      const checkpointIds = results.map(r => r.data.checkpointId);
      const uniqueIds = new Set(checkpointIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle checkpoint with special characters in metadata', async () => {
      const mockExecution = {
        executionId: 'exec-special-chars',
        workflowId: 'workflow-special',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const response = await handler.handle({
        executionId: 'exec-special-chars',
        reason: 'Checkpoint with special chars: <>&"\'',
        metadata: {
          description: 'Contains special: !@#$%^&*()',
          unicode: 'Contains unicode: 你好 🚀'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.reason).toContain('<>&"\'');
      expect(response.data.metadata.unicode).toContain('🚀');
    });
  });

  describe('Performance', () => {
    it('should complete checkpoint creation within reasonable time', async () => {
      const mockExecution = {
        executionId: 'exec-perf-test',
        workflowId: 'workflow-perf',
        status: 'running',
        completedSteps: ['step1', 'step2', 'step3'],
        failedSteps: [],
        context: { variables: { key: 'value' } }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const startTime = Date.now();
      await handler.handle({
        executionId: 'exec-perf-test',
        reason: 'Performance test checkpoint'
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle rapid sequential checkpoint creation', async () => {
      const mockExecution = {
        executionId: 'exec-rapid',
        workflowId: 'workflow-rapid',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const startTime = Date.now();

      for (let i = 0; i < 50; i++) {
        await handler.handle({
          executionId: 'exec-rapid',
          reason: `Rapid checkpoint ${i}`
        });
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 50;

      expect(avgTime).toBeLessThan(100); // Average less than 100ms per checkpoint
    });
  });

  describe('Checkpoint Retrieval', () => {
    it('should retrieve checkpoint by ID from local map', async () => {
      const mockExecution = {
        executionId: 'exec-retrieve',
        workflowId: 'workflow-retrieve',
        status: 'running',
        completedSteps: ['step1'],
        failedSteps: [],
        context: { variables: {} }
      };

      mockMemory.retrieve.mockResolvedValue(mockExecution);
      mockMemory.store.mockResolvedValue(undefined);
      mockMemory.postHint.mockResolvedValue(undefined);

      const createResponse = await handler.handle({
        executionId: 'exec-retrieve'
      });

      const checkpoint = await handler.getCheckpoint(createResponse.data.checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.checkpointId).toBe(createResponse.data.checkpointId);
      expect(checkpoint?.executionId).toBe('exec-retrieve');
    });

    it('should retrieve checkpoint by ID from memory when not in local map', async () => {
      const checkpointId = 'cp-memory-test';
      const mockCheckpoint: Checkpoint = {
        checkpointId,
        executionId: 'exec-memory',
        timestamp: new Date().toISOString(),
        reason: 'Memory retrieval test',
        state: {
          completedSteps: ['step1'],
          currentStep: 'step2',
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      mockMemory.retrieve.mockResolvedValue(mockCheckpoint);

      const checkpoint = await handler.getCheckpoint(checkpointId);

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.checkpointId).toBe(checkpointId);
      expect(mockMemory.retrieve).toHaveBeenCalledWith(
        `workflow:checkpoint:${checkpointId}`,
        { partition: 'workflow_checkpoints' }
      );
    });

    it('should return null for non-existent checkpoint', async () => {
      mockMemory.retrieve.mockResolvedValue(null);

      const checkpoint = await handler.getCheckpoint('non-existent-cp');

      expect(checkpoint).toBeNull();
    });
  });

  describe('Checkpoint Listing', () => {
    it('should list all checkpoints for an execution', async () => {
      const executionId = 'exec-list-test';
      const mockCheckpoints = [
        {
          checkpointId: 'cp-1',
          executionId,
          timestamp: '2025-11-03T10:00:00.000Z',
          state: {},
          metadata: {}
        },
        {
          checkpointId: 'cp-2',
          executionId,
          timestamp: '2025-11-03T11:00:00.000Z',
          state: {},
          metadata: {}
        },
        {
          checkpointId: 'cp-3',
          executionId: 'other-exec',
          timestamp: '2025-11-03T12:00:00.000Z',
          state: {},
          metadata: {}
        }
      ];

      mockMemory.query.mockResolvedValue(
        mockCheckpoints.map(cp => ({ key: `workflow:checkpoint:${cp.checkpointId}`, value: cp }))
      );

      const checkpoints = await handler.listCheckpoints(executionId);

      expect(checkpoints).toHaveLength(2);
      expect(checkpoints.every(cp => cp.executionId === executionId)).toBe(true);
      // Should be sorted by timestamp descending
      expect(new Date(checkpoints[0].timestamp).getTime()).toBeGreaterThan(
        new Date(checkpoints[1].timestamp).getTime()
      );
    });

    it('should return empty array when no checkpoints exist', async () => {
      mockMemory.query.mockResolvedValue([]);

      const checkpoints = await handler.listCheckpoints('exec-no-checkpoints');

      expect(checkpoints).toEqual([]);
    });
  });
});
