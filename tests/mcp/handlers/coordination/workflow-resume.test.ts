/**
 * coordination/workflow-resume Test Suite
 *
 * Tests for workflow resumption from checkpoint.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowResumeHandler, WorkflowResumeArgs, ResumedExecution } from '@mcp/handlers/coordination/workflow-resume';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { HookExecutor } from '@mcp/services/HookExecutor';

describe('WorkflowResumeHandler', () => {
  let handler: WorkflowResumeHandler;
  let mockMemory: jest.Mocked<SwarmMemoryManager>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;

  beforeEach(() => {
    mockMemory = {
      retrieve: jest.fn(),
      store: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      postHint: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn()
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined)
    } as any;

    handler = new WorkflowResumeHandler(mockMemory, mockHookExecutor);
  });

  describe('Happy Path', () => {
    it('should resume workflow from checkpoint successfully', async () => {
      const checkpointId = 'cp-1234-abc';
      const executionId = 'exec-original-123';

      const mockCheckpoint = {
        checkpointId,
        executionId,
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init', 'build'],
          currentStep: 'test',
          failedSteps: [],
          variables: {
            buildNumber: '42',
            environment: 'staging'
          },
          context: {
            projectName: 'test-project'
          }
        },
        metadata: {}
      };

      const mockExecution = {
        executionId,
        workflowId: 'workflow-123',
        status: 'running',
        completedSteps: ['init', 'build'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const args: WorkflowResumeArgs = {
        checkpointId
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.executionId).toMatch(/^exec-resumed-\d+-[a-zA-Z0-9]+$/);
      expect(response.data.resumedFrom).toBe(checkpointId);
      expect(response.data.status).toBe('completed');
      expect(response.data.restoredState.completedSteps).toEqual(['init', 'build']);
      expect(response.data.restoredState.variables.buildNumber).toBe('42');
    });

    it('should resume workflow with remaining steps', async () => {
      const checkpointId = 'cp-steps-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-steps',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          currentStep: 'test',
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-steps',
        workflowId: 'workflow-steps',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({
        checkpointId
      });

      expect(response.success).toBe(true);
      expect(response.data.remainingSteps).toBeDefined();
      expect(response.data.remainingSteps.length).toBeGreaterThan(0);
      expect(response.data.remainingSteps).not.toContain('init');
    });

    it('should resume workflow with skipFailedSteps option', async () => {
      const checkpointId = 'cp-skip-failed';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-failed',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init', 'build'],
          currentStep: 'test',
          failedSteps: ['integration-test', 'e2e-test'],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-failed',
        workflowId: 'workflow-failed',
        status: 'failed',
        completedSteps: ['init', 'build'],
        failedSteps: ['integration-test', 'e2e-test'],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({
        checkpointId,
        context: {
          skipFailedSteps: true
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.remainingSteps).not.toContain('integration-test');
      expect(response.data.remainingSteps).not.toContain('e2e-test');
      expect(response.data.restoredState.failedSteps).toEqual(['integration-test', 'e2e-test']);
    });

    it('should resume workflow with overridden variables', async () => {
      const checkpointId = 'cp-override-vars';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-override',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          currentStep: 'test',
          failedSteps: [],
          variables: {
            environment: 'staging',
            buildNumber: '42'
          },
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-override',
        workflowId: 'workflow-override',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({
        checkpointId,
        context: {
          overrideVariables: {
            environment: 'production',
            deploymentStrategy: 'blue-green'
          }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.restoredState.variables.environment).toBe('production');
      expect(response.data.restoredState.variables.buildNumber).toBe('42');
      expect(response.data.restoredState.variables.deploymentStrategy).toBe('blue-green');
    });

    it('should store resumed execution in memory', async () => {
      const checkpointId = 'cp-memory-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-memory',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-memory',
        workflowId: 'workflow-memory',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      await handler.handle({ checkpointId });

      expect(mockMemory.store).toHaveBeenCalledWith(
        expect.stringMatching(/^workflow:execution:exec-resumed-/),
        expect.objectContaining({
          resumedFrom: checkpointId,
          status: expect.any(String)
        }),
        expect.objectContaining({
          partition: 'workflow_executions',
          ttl: 86400
        })
      );
    });

    it('should return expected data structure with all fields', async () => {
      const checkpointId = 'cp-structure-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-structure',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-structure',
        workflowId: 'workflow-structure',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');

      const resumed: ResumedExecution = response.data;
      expect(resumed).toHaveProperty('executionId');
      expect(resumed).toHaveProperty('resumedFrom');
      expect(resumed).toHaveProperty('status');
      expect(resumed).toHaveProperty('resumedAt');
      expect(resumed).toHaveProperty('remainingSteps');
      expect(resumed).toHaveProperty('restoredState');
      expect(resumed).toHaveProperty('results');

      expect(resumed.restoredState).toHaveProperty('completedSteps');
      expect(resumed.restoredState).toHaveProperty('failedSteps');
      expect(resumed.restoredState).toHaveProperty('variables');
    });

    it('should complete resumed execution with results', async () => {
      const checkpointId = 'cp-results-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-results',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-results',
        workflowId: 'workflow-results',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
      expect(response.data.results?.success).toBe(true);
      expect(response.data.results?.resumedStepsCompleted).toBeGreaterThanOrEqual(0);
      expect(response.data.results?.totalDuration).toBeDefined();
    });

    it('should execute hooks during resumption', async () => {
      const checkpointId = 'cp-hooks-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-hooks',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-hooks',
        workflowId: 'workflow-hooks',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      await handler.handle({ checkpointId });

      expect(mockHookExecutor.executePreTask).toHaveBeenCalledWith({
        description: `Resume workflow from checkpoint ${checkpointId}`,
        agentType: 'workflow-resume-handler'
      });

      expect(mockHookExecutor.executePostTask).toHaveBeenCalled();
    });
  });

  describe('Input Validation', () => {
    it('should reject resumption without checkpointId', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('checkpointId');
    });

    it('should reject resumption with null checkpointId', async () => {
      const response = await handler.handle({ checkpointId: null } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should accept resumption with minimal context', async () => {
      const checkpointId = 'cp-minimal';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-minimal',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: [],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-minimal',
        workflowId: 'workflow-minimal',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle checkpoint not found gracefully', async () => {
      mockMemory.retrieve.mockResolvedValue(null);

      const response = await handler.handle({
        checkpointId: 'non-existent-checkpoint'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Checkpoint not found');
    });

    it('should handle execution not found gracefully', async () => {
      const checkpointId = 'cp-orphaned';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-orphaned',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: [],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return null;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Execution not found');
    });

    it('should handle memory retrieve failure gracefully', async () => {
      mockMemory.retrieve.mockRejectedValue(new Error('Database connection failed'));

      const response = await handler.handle({
        checkpointId: 'cp-db-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle memory store failure gracefully', async () => {
      const checkpointId = 'cp-store-error';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-store-error',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: [],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-store-error',
        workflowId: 'workflow-store-error',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      mockMemory.store.mockRejectedValue(new Error('Storage failed'));

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      mockMemory.retrieve.mockResolvedValue(null);

      const response = await handler.handle({
        checkpointId: 'missing-checkpoint-123'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
      expect(response.error).toContain('missing-checkpoint-123');
    });

    it('should handle pre-task hook failure gracefully', async () => {
      mockHookExecutor.executePreTask.mockRejectedValue(new Error('Pre-task hook failed'));

      const response = await handler.handle({
        checkpointId: 'cp-hook-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle post-task hook failure gracefully', async () => {
      const checkpointId = 'cp-post-hook-error';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-post-hook',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: [],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-post-hook',
        workflowId: 'workflow-post-hook',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      mockHookExecutor.executePostTask.mockRejectedValue(new Error('Post-task hook failed'));

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Post-task hook failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle resumption with no remaining steps', async () => {
      const checkpointId = 'cp-all-complete';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-all-complete',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init', 'test', 'verify', 'deploy'],
          currentStep: undefined,
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-all-complete',
        workflowId: 'workflow-all-complete',
        status: 'completed',
        completedSteps: ['init', 'test', 'verify', 'deploy'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.remainingSteps).toEqual([]);
    });

    it('should handle resumption with large variable set', async () => {
      const largeVariables: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeVariables[`var${i}`] = `value${i}`;
      }

      const checkpointId = 'cp-large-vars';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-large-vars',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: largeVariables,
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-large-vars',
        workflowId: 'workflow-large-vars',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(Object.keys(response.data.restoredState.variables).length).toBe(1000);
    });

    it('should handle resumption with nested variables', async () => {
      const checkpointId = 'cp-nested-vars';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-nested',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {
            config: {
              database: {
                host: 'localhost',
                credentials: {
                  user: 'admin'
                }
              }
            }
          },
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-nested',
        workflowId: 'workflow-nested',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.restoredState.variables.config.database.host).toBe('localhost');
    });

    it('should handle concurrent resumption requests', async () => {
      const createMockData = (index: number) => ({
        checkpoint: {
          checkpointId: `cp-concurrent-${index}`,
          executionId: `exec-concurrent-${index}`,
          timestamp: '2025-11-03T10:00:00.000Z',
          state: {
            completedSteps: ['init'],
            failedSteps: [],
            variables: { index },
            context: {}
          },
          metadata: {}
        },
        execution: {
          executionId: `exec-concurrent-${index}`,
          workflowId: `workflow-concurrent-${index}`,
          status: 'running',
          completedSteps: ['init'],
          failedSteps: [],
          context: {}
        }
      });

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        const match = key.match(/cp-concurrent-(\d+)/);
        if (match) {
          const index = parseInt(match[1]);
          const data = createMockData(index);
          return key.includes('checkpoint') ? data.checkpoint : data.execution;
        }
        return null;
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({ checkpointId: `cp-concurrent-${i}` })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.resumedFrom).toBe(`cp-concurrent-${index}`);
      });

      // All execution IDs should be unique
      const executionIds = results.map(r => r.data.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle resumption with special characters in variables', async () => {
      const checkpointId = 'cp-special-chars';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-special',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {
            message: 'Test with special: <>&"\'',
            unicode: 'Unicode: 你好 🚀'
          },
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-special',
        workflowId: 'workflow-special',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.restoredState.variables.message).toContain('<>&"\'');
      expect(response.data.restoredState.variables.unicode).toContain('🚀');
    });

    it('should handle resumption with empty completed steps', async () => {
      const checkpointId = 'cp-empty-steps';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-empty',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: [],
          currentStep: 'init',
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-empty',
        workflowId: 'workflow-empty',
        status: 'running',
        completedSteps: [],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.restoredState.completedSteps).toEqual([]);
    });

    it('should handle resumption tracking timing accurately', async () => {
      const checkpointId = 'cp-timing-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-timing',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-timing',
        workflowId: 'workflow-timing',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({ checkpointId });

      expect(response.success).toBe(true);
      expect(response.data.resumedAt).toBeDefined();
      const resumedTime = new Date(response.data.resumedAt).getTime();
      expect(resumedTime).toBeGreaterThan(0);
    });

    it('should handle variable override merging correctly', async () => {
      const checkpointId = 'cp-merge-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-merge',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {
            original1: 'value1',
            original2: 'value2',
            toOverride: 'old-value'
          },
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-merge',
        workflowId: 'workflow-merge',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const response = await handler.handle({
        checkpointId,
        context: {
          overrideVariables: {
            toOverride: 'new-value',
            newVariable: 'added-value'
          }
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.restoredState.variables.original1).toBe('value1');
      expect(response.data.restoredState.variables.original2).toBe('value2');
      expect(response.data.restoredState.variables.toOverride).toBe('new-value');
      expect(response.data.restoredState.variables.newVariable).toBe('added-value');
    });
  });

  describe('Performance', () => {
    it('should complete resumption within reasonable time', async () => {
      const checkpointId = 'cp-perf-test';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-perf',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-perf',
        workflowId: 'workflow-perf',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const startTime = Date.now();
      await handler.handle({ checkpointId });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should handle rapid sequential resumptions', async () => {
      const createMockData = (index: number) => ({
        checkpoint: {
          checkpointId: `cp-rapid-${index}`,
          executionId: `exec-rapid-${index}`,
          timestamp: '2025-11-03T10:00:00.000Z',
          state: {
            completedSteps: ['init'],
            failedSteps: [],
            variables: {},
            context: {}
          },
          metadata: {}
        },
        execution: {
          executionId: `exec-rapid-${index}`,
          workflowId: `workflow-rapid-${index}`,
          status: 'running',
          completedSteps: ['init'],
          failedSteps: [],
          context: {}
        }
      });

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        const match = key.match(/cp-rapid-(\d+)/);
        if (match) {
          const index = parseInt(match[1]);
          const data = createMockData(index);
          return key.includes('checkpoint') ? data.checkpoint : data.execution;
        }
        return null;
      });

      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        await handler.handle({ checkpointId: `cp-rapid-${i}` });
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 20;

      expect(avgTime).toBeLessThan(200);
    });
  });

  describe('Execution Retrieval', () => {
    it('should retrieve resumed execution by ID', async () => {
      const checkpointId = 'cp-retrievable';
      const mockCheckpoint = {
        checkpointId,
        executionId: 'exec-retrievable',
        timestamp: '2025-11-03T10:00:00.000Z',
        state: {
          completedSteps: ['init'],
          failedSteps: [],
          variables: {},
          context: {}
        },
        metadata: {}
      };

      const mockExecution = {
        executionId: 'exec-retrievable',
        workflowId: 'workflow-retrievable',
        status: 'running',
        completedSteps: ['init'],
        failedSteps: [],
        context: {}
      };

      mockMemory.retrieve.mockImplementation(async (key: string) => {
        if (key.includes('checkpoint')) return mockCheckpoint;
        if (key.includes('execution')) return mockExecution;
        return null;
      });

      const createResponse = await handler.handle({ checkpointId });

      const execution = handler.getResumedExecution(createResponse.data.executionId);

      expect(execution).toBeDefined();
      expect(execution?.executionId).toBe(createResponse.data.executionId);
      expect(execution?.resumedFrom).toBe(checkpointId);
    });

    it('should return undefined for non-existent resumed execution', async () => {
      const execution = handler.getResumedExecution('non-existent-resumed-exec');

      expect(execution).toBeUndefined();
    });
  });
});
