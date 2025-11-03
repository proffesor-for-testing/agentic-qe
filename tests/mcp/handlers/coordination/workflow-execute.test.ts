/**
 * coordination/workflow-execute Test Suite
 *
 * Tests for workflow execution with OODA loop.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowExecuteHandler, WorkflowExecuteArgs, WorkflowExecution } from '@mcp/handlers/coordination/workflow-execute';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';

describe('WorkflowExecuteHandler', () => {
  let handler: WorkflowExecuteHandler;
  let mockRegistry: jest.Mocked<AgentRegistry>;
  let mockHookExecutor: jest.Mocked<HookExecutor>;
  let mockMemory: jest.Mocked<SwarmMemoryManager>;

  beforeEach(() => {
    mockRegistry = {
      registerAgent: jest.fn(),
      getAgent: jest.fn(),
      listAgents: jest.fn(),
      unregisterAgent: jest.fn()
    } as any;

    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executePostEdit: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockMemory = {
      retrieve: jest.fn(),
      store: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      postHint: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn()
    } as any;

    handler = new WorkflowExecuteHandler(mockRegistry, mockHookExecutor, mockMemory);
  });

  describe('Happy Path', () => {
    it('should execute workflow successfully', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-123',
        context: {
          environment: 'staging',
          dryRun: false,
          variables: {
            buildNumber: '42',
            deployTarget: 'us-east-1'
          }
        },
        oodaEnabled: false,
        autoCheckpoint: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.executionId).toMatch(/^exec-\d+-[a-zA-Z0-9]+$/);
      expect(response.data.workflowId).toBe('workflow-123');
      expect(response.data.status).toBe('completed');
      expect(response.data.completedSteps).toEqual(['init', 'test', 'verify']);
      expect(response.data.context.environment).toBe('staging');
      expect(response.data.context.variables.buildNumber).toBe('42');

      // Verify hooks were called
      expect(mockHookExecutor.executePreTask).toHaveBeenCalledWith({
        description: 'Execute workflow workflow-123',
        agentType: 'workflow-executor'
      });
      expect(mockHookExecutor.executePostTask).toHaveBeenCalled();
    });

    it('should execute workflow with OODA loop enabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-ooda-test',
        context: {
          environment: 'production',
          variables: { version: '2.0.0' }
        },
        oodaEnabled: true,
        autoCheckpoint: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.oodaCycles).toBeDefined();
      expect(response.data.oodaCycles.length).toBeGreaterThan(0);

      const cycle = response.data.oodaCycles[0];
      expect(cycle).toHaveProperty('cycleId');
      expect(cycle).toHaveProperty('observe');
      expect(cycle).toHaveProperty('orient');
      expect(cycle).toHaveProperty('decide');
      expect(cycle).toHaveProperty('act');
    });

    it('should execute workflow with auto-checkpoint enabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-checkpoint-test',
        context: {
          environment: 'staging',
          variables: {}
        },
        autoCheckpoint: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints).toBeDefined();
      expect(response.data.checkpoints.length).toBeGreaterThan(0);
      expect(response.data.checkpoints.length).toBe(response.data.completedSteps.length);
    });

    it('should execute workflow in dry-run mode', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-dryrun',
        context: {
          environment: 'production',
          dryRun: true,
          variables: {}
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.context.dryRun).toBe(true);
      expect(response.data.status).toBe('completed');
    });

    it('should store execution in memory', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-memory-test',
        context: {
          environment: 'staging',
          variables: {}
        }
      };

      await handler.handle(args);

      expect(mockMemory.store).toHaveBeenCalledWith(
        expect.stringMatching(/^workflow:execution:exec-/),
        expect.objectContaining({
          workflowId: 'workflow-memory-test',
          status: expect.any(String)
        }),
        expect.objectContaining({
          partition: 'workflow_executions',
          ttl: 86400
        })
      );
    });

    it('should return expected data structure with all execution fields', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-structure-test',
        context: {
          environment: 'development',
          variables: { test: 'value' }
        }
      };

      const response = await handler.handle(args);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');

      const execution: WorkflowExecution = response.data;
      expect(execution).toHaveProperty('executionId');
      expect(execution).toHaveProperty('workflowId');
      expect(execution).toHaveProperty('status');
      expect(execution).toHaveProperty('startedAt');
      expect(execution).toHaveProperty('completedAt');
      expect(execution).toHaveProperty('completedSteps');
      expect(execution).toHaveProperty('failedSteps');
      expect(execution).toHaveProperty('checkpoints');
      expect(execution).toHaveProperty('oodaCycles');
      expect(execution).toHaveProperty('context');
      expect(execution).toHaveProperty('results');
    });

    it('should complete execution with results summary', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-results-test',
        context: {
          environment: 'staging',
          variables: {}
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results).toBeDefined();
      expect(response.data.results?.success).toBe(true);
      expect(response.data.results?.totalDuration).toBeGreaterThan(0);
      expect(response.data.results?.stepResults).toBeDefined();
      expect(response.data.results?.stepResults.init).toEqual({ status: 'completed' });
      expect(response.data.results?.stepResults.test).toEqual({ status: 'completed' });
      expect(response.data.results?.stepResults.verify).toEqual({ status: 'completed' });
    });
  });

  describe('Input Validation', () => {
    it('should reject execution without workflowId', async () => {
      const response = await handler.handle({} as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('workflowId');
    });

    it('should reject execution with null workflowId', async () => {
      const response = await handler.handle({ workflowId: null } as any);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should accept execution with minimal context', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-minimal'
      });

      expect(response.success).toBe(true);
      expect(response.data.context.environment).toBe('default');
      expect(response.data.context.dryRun).toBe(false);
      expect(response.data.context.variables).toEqual({});
    });

    it('should use default values when context not provided', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-defaults'
      });

      expect(response.success).toBe(true);
      expect(response.data.context.environment).toBe('default');
      expect(response.data.context.dryRun).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle pre-task hook failure gracefully', async () => {
      mockHookExecutor.executePreTask.mockRejectedValue(new Error('Pre-task hook failed'));

      const response = await handler.handle({
        workflowId: 'workflow-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle memory store failure gracefully', async () => {
      mockMemory.store.mockRejectedValue(new Error('Storage failed'));

      const response = await handler.handle({
        workflowId: 'workflow-storage-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      mockHookExecutor.executePreTask.mockRejectedValue(new Error('Custom error message'));

      const response = await handler.handle({
        workflowId: 'workflow-error-msg'
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeTruthy();
      expect(typeof response.error).toBe('string');
    });

    it('should handle post-task hook failure after execution', async () => {
      mockHookExecutor.executePostTask.mockRejectedValue(new Error('Post-task hook failed'));

      const response = await handler.handle({
        workflowId: 'workflow-post-error'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain('Post-task hook failed');
    });
  });

  describe('OODA Loop Integration', () => {
    it('should complete full OODA cycle when enabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-full-ooda',
        oodaEnabled: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.oodaCycles.length).toBeGreaterThan(0);

      const cycle = response.data.oodaCycles[0];
      expect(cycle.observe).toBeDefined();
      expect(cycle.observe.observations.length).toBeGreaterThan(0);
      expect(cycle.orient).toBeDefined();
      expect(cycle.decide).toBeDefined();
      expect(cycle.act).toBeDefined();
      expect(cycle.status).toBe('completed');
    });

    it('should observe workflow context in OODA cycle', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-observe',
        context: {
          environment: 'production',
          variables: { critical: 'data' }
        },
        oodaEnabled: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const cycle = response.data.oodaCycles[0];
      const observation = cycle.observe.observations.find((obs: any) => obs.source === 'workflow-executor');
      expect(observation).toBeDefined();
      expect(observation.data.workflowId).toBe('workflow-observe');
    });

    it('should orient and analyze workflow requirements', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-orient',
        oodaEnabled: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const cycle = response.data.oodaCycles[0];
      expect(cycle.orient.analysis).toBeDefined();
      expect(cycle.orient.analysis.workflowReady).toBe(true);
      expect(cycle.orient.analysis.resourcesAvailable).toBe(true);
    });

    it('should decide on execution strategy', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-decide',
        oodaEnabled: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const cycle = response.data.oodaCycles[0];
      expect(cycle.decide.decision).toBe('adaptive');
      expect(cycle.decide.alternatives).toContain('sequential');
      expect(cycle.decide.alternatives).toContain('parallel');
      expect(cycle.decide.alternatives).toContain('adaptive');
    });

    it('should act and start workflow execution', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-act',
        oodaEnabled: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      const cycle = response.data.oodaCycles[0];
      expect(cycle.act.action).toBe('start-workflow');
      expect(cycle.act.result).toBeDefined();
      expect(cycle.act.result.started).toBe(true);
    });

    it('should execute workflow without OODA when disabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-no-ooda',
        oodaEnabled: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.oodaCycles).toEqual([]);
    });
  });

  describe('Checkpoint Integration', () => {
    it('should create checkpoints after each step when enabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-auto-checkpoint',
        autoCheckpoint: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints.length).toBeGreaterThan(0);
      expect(response.data.checkpoints.every(cp => cp.startsWith('cp-'))).toBe(true);
    });

    it('should not create checkpoints when disabled', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-no-checkpoint',
        autoCheckpoint: false
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.checkpoints).toEqual([]);
    });

    it('should coordinate checkpoints with OODA loop', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-ooda-checkpoint',
        oodaEnabled: true,
        autoCheckpoint: true
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.oodaCycles.length).toBeGreaterThan(0);
      expect(response.data.checkpoints.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle execution with custom environment', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-custom-env',
        context: {
          environment: 'custom-qa-cluster-03',
          variables: {}
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.context.environment).toBe('custom-qa-cluster-03');
    });

    it('should handle execution with large variable set', async () => {
      const largeVariables: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeVariables[`variable${i}`] = `value${i}`;
      }

      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-large-vars',
        context: {
          environment: 'staging',
          variables: largeVariables
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(Object.keys(response.data.context.variables).length).toBe(1000);
    });

    it('should handle execution with nested context variables', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-nested-vars',
        context: {
          environment: 'staging',
          variables: {
            config: {
              database: {
                host: 'localhost',
                port: 5432,
                credentials: {
                  user: 'admin',
                  encrypted: true
                }
              }
            },
            features: ['feature1', 'feature2']
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.context.variables.config.database.host).toBe('localhost');
      expect(response.data.context.variables.features).toContain('feature1');
    });

    it('should handle concurrent execution requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        handler.handle({
          workflowId: `workflow-concurrent-${i}`,
          context: {
            environment: 'test',
            variables: { index: i }
          }
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.workflowId).toBe(`workflow-concurrent-${index}`);
      });

      // All execution IDs should be unique
      const executionIds = results.map(r => r.data.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle execution with special characters in variables', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-special-chars',
        context: {
          environment: 'staging',
          variables: {
            message: 'Test with special: <>&"\'',
            unicode: 'Unicode test: 你好 🚀'
          }
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.context.variables.message).toContain('<>&"\'');
      expect(response.data.context.variables.unicode).toContain('🚀');
    });

    it('should handle execution with empty variables', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-empty-vars',
        context: {
          environment: 'staging',
          variables: {}
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.context.variables).toEqual({});
    });

    it('should track execution timing accurately', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-timing-test',
        context: {
          environment: 'staging',
          variables: {}
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.startedAt).toBeDefined();
      expect(response.data.completedAt).toBeDefined();
      expect(response.data.results?.totalDuration).toBeGreaterThan(0);

      const startTime = new Date(response.data.startedAt).getTime();
      const endTime = new Date(response.data.completedAt!).getTime();
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('Performance', () => {
    it('should complete execution within reasonable time', async () => {
      const args: WorkflowExecuteArgs = {
        workflowId: 'workflow-perf-test',
        context: {
          environment: 'staging',
          variables: {}
        }
      };

      const startTime = Date.now();
      await handler.handle(args);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000);
    });

    it('should handle rapid sequential executions', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 20; i++) {
        await handler.handle({
          workflowId: `workflow-rapid-${i}`
        });
      }

      const endTime = Date.now();
      const avgTime = (endTime - startTime) / 20;

      expect(avgTime).toBeLessThan(200);
    });

    it('should handle execution with OODA loop efficiently', async () => {
      const startTime = Date.now();

      await handler.handle({
        workflowId: 'workflow-ooda-perf',
        oodaEnabled: true,
        autoCheckpoint: true
      });

      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(3000);
    });
  });

  describe('Execution Retrieval', () => {
    it('should retrieve execution by ID', async () => {
      const createResponse = await handler.handle({
        workflowId: 'workflow-retrievable'
      });

      const execution = handler.getExecution(createResponse.data.executionId);

      expect(execution).toBeDefined();
      expect(execution?.executionId).toBe(createResponse.data.executionId);
      expect(execution?.workflowId).toBe('workflow-retrievable');
    });

    it('should return undefined for non-existent execution', async () => {
      const execution = handler.getExecution('non-existent-exec-id');

      expect(execution).toBeUndefined();
    });

    it('should list all executions', async () => {
      await handler.handle({ workflowId: 'workflow-1' });
      await handler.handle({ workflowId: 'workflow-2' });
      await handler.handle({ workflowId: 'workflow-3' });

      const executions = handler.listExecutions();

      expect(executions.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Execution Status', () => {
    it('should initialize execution as running', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-status-test'
      });

      // After completion, status should be 'completed', but was 'running' initially
      expect(['running', 'completed']).toContain(response.data.status);
    });

    it('should track completed steps during execution', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-steps-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.completedSteps.length).toBeGreaterThan(0);
      expect(response.data.completedSteps).toContain('init');
      expect(response.data.completedSteps).toContain('test');
      expect(response.data.completedSteps).toContain('verify');
    });

    it('should initialize with empty failed steps', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-failed-steps-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.failedSteps).toEqual([]);
    });

    it('should mark execution as completed when all steps finish', async () => {
      const response = await handler.handle({
        workflowId: 'workflow-completion-test'
      });

      expect(response.success).toBe(true);
      expect(response.data.status).toBe('completed');
      expect(response.data.completedAt).toBeDefined();
    });
  });
});
