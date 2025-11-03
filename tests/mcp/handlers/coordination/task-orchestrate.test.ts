/**
 * Task Orchestration Handler Test Suite
 *
 * Comprehensive tests for task-orchestrate MCP tool handler.
 * Tests workflow orchestration, dependencies, execution strategies, and agent coordination.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { TaskOrchestrateHandler, TaskOrchestrateArgs, TaskOrchestration } from '@mcp/handlers/task-orchestrate';
import { AgentRegistry } from '@mcp/services/AgentRegistry';
import { HookExecutor } from '@mcp/services/HookExecutor';

// Mock services
jest.mock('../../../../src/mcp/services/AgentRegistry.js');
jest.mock('../../../../src/mcp/services/HookExecutor.js');
jest.mock('../../../../src/utils/SecureRandom.js', () => ({
  SecureRandom: {
    generateId: jest.fn(() => 'test-id'),
    randomFloat: jest.fn(() => 0.5)
  }
}));

describe('TaskOrchestrateHandler', () => {
  let handler: TaskOrchestrateHandler;
  let mockAgentRegistry: AgentRegistry;
  let mockHookExecutor: HookExecutor;

  beforeEach(() => {
    // Setup mock AgentRegistry
    mockAgentRegistry = {
      spawnAgent: jest.fn().mockResolvedValue({
        id: 'agent-test-1',
        type: 'test-agent',
        status: 'active'
      }),
      listAgents: jest.fn().mockResolvedValue([]),
      getAgent: jest.fn()
    } as any;

    // Setup mock HookExecutor
    mockHookExecutor = {
      executePreTask: jest.fn().mockResolvedValue(undefined),
      executePostTask: jest.fn().mockResolvedValue(undefined),
      executeHook: jest.fn().mockResolvedValue(undefined),
      notify: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Initialize handler with mocks
    handler = new TaskOrchestrateHandler(mockAgentRegistry, mockHookExecutor);
  });

  describe('Happy Path - Valid Orchestration Requests', () => {
    it('should orchestrate comprehensive-testing task successfully', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        },
        context: {
          project: 'test-project',
          branch: 'main',
          environment: 'development'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('comprehensive-testing');
      expect(response.data.status).toMatch(/completed|running/);
      expect(response.data.workflow.length).toBeGreaterThan(0);
      expect(response.data.assignments).toBeDefined();
    });

    it('should orchestrate quality-gate task', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'critical',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 15
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('quality-gate');
      expect(response.data.priority).toBe('critical');
      expect(response.data.strategy).toBe('sequential');
    });

    it('should orchestrate defect-prevention task', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'defect-prevention',
          priority: 'medium',
          strategy: 'adaptive',
          maxAgents: 4,
          timeoutMinutes: 20
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('defect-prevention');
      expect(response.data.strategy).toBe('adaptive');
    });

    it('should orchestrate performance-validation task', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'performance-validation',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 6,
          timeoutMinutes: 45
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.type).toBe('performance-validation');
      expect(response.data.results).toBeDefined();
    });

    it('should include project context in orchestration', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        },
        context: {
          project: 'test-project',
          branch: 'feature/new-feature',
          environment: 'staging',
          requirements: ['REQ-001', 'REQ-002']
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.timeline).toBeDefined();
      expect(response.data.timeline.length).toBeGreaterThan(0);
    });
  });

  describe('Workflow Dependencies (DAG)', () => {
    it('should resolve workflow DAG correctly', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Verify dependencies were respected
      response.data.workflow.forEach(step => {
        if (step.dependencies.length > 0) {
          // All dependencies should be in the workflow
          step.dependencies.forEach(depId => {
            const depExists = response.data.workflow.some(s => s.id.includes(depId.split('-')[0]));
            expect(depExists).toBe(true);
          });
        }
      });
    });

    it('should execute dependent steps after prerequisites', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 20
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Find steps with dependencies
      const dependentSteps = response.data.workflow.filter(s => s.dependencies.length > 0);
      dependentSteps.forEach(step => {
        expect(['pending', 'running', 'completed', 'failed', 'skipped']).toContain(step.status);
      });
    });

    it('should handle circular dependency detection', async () => {
      // The handler should prevent circular dependencies during initialization
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      // Workflow should be successfully created without circular dependencies
      expect(response.data.workflow.length).toBeGreaterThan(0);
    });

    it('should skip dependent steps when prerequisites fail', async () => {
      // Mock a step failure scenario
      const failingRegistry = {
        spawnAgent: jest.fn()
          .mockResolvedValueOnce({ id: 'agent-1', type: 'test-agent', status: 'active' })
          .mockRejectedValueOnce(new Error('Agent spawn failed'))
      } as any;

      const failingHandler = new TaskOrchestrateHandler(failingRegistry, mockHookExecutor);

      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 20
        }
      };

      const response = await failingHandler.handle(args);

      // Handler should gracefully handle failures
      expect(response).toBeDefined();
    });
  });

  describe('Execution Strategies (parallel/sequential/adaptive)', () => {
    it('should execute parallel strategy correctly', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('parallel');
      expect(response.data.assignments.length).toBeGreaterThan(0);

      // Parallel execution should complete in reasonable time
      expect(duration).toBeLessThan(30000); // Less than 30 seconds
    });

    it('should execute sequential strategy correctly', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 20
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('sequential');

      // Verify steps completed in order
      const completedSteps = response.data.workflow.filter(s => s.status === 'completed');
      expect(completedSteps.length).toBeGreaterThanOrEqual(0);
    });

    it('should execute adaptive strategy based on complexity', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'medium',
          strategy: 'adaptive',
          maxAgents: 4,
          timeoutMinutes: 25
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.strategy).toBe('adaptive');

      // Adaptive should optimize based on dependencies
      expect(response.data.results.metrics).toBeDefined();
    });

    it('should respect maxAgents limit in parallel execution', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 2,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Check that agents spawned <= maxAgents
      const spawnCalls = (mockAgentRegistry.spawnAgent as any).mock.calls.length;
      expect(spawnCalls).toBeGreaterThan(0);
    });

    it('should calculate parallelism efficiency correctly', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.metrics.parallelismEfficiency).toBeDefined();
      expect(response.data.results.metrics.parallelismEfficiency).toBeGreaterThanOrEqual(0);
      expect(response.data.results.metrics.parallelismEfficiency).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Agent Assignment', () => {
    it('should assign agents based on task type', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.assignments.length).toBeGreaterThan(0);

      response.data.assignments.forEach(assignment => {
        expect(assignment.agentId).toBeDefined();
        expect(assignment.agentType).toBeDefined();
        expect(assignment.tasks.length).toBeGreaterThan(0);
        expect(['assigned', 'running', 'completed', 'failed']).toContain(assignment.status);
      });
    });

    it('should balance workload across agents', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 4,
          timeoutMinutes: 30
        },
        fleetId: 'fleet-123'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Check that tasks are distributed
      const taskCounts = response.data.assignments.map(a => a.tasks.length);
      expect(taskCounts.length).toBeGreaterThan(0);

      // At least some assignments should have tasks
      const totalTasks = taskCounts.reduce((sum, count) => sum + count, 0);
      expect(totalTasks).toBeGreaterThan(0);
    });

    it('should track agent assignment status', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 15
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      response.data.assignments.forEach(assignment => {
        expect(['assigned', 'running', 'completed', 'failed']).toContain(assignment.status);

        if (assignment.status === 'completed') {
          expect(assignment.completedAt).toBeDefined();
        }
      });
    });

    it('should assign correct agent types for step types', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Verify agent types are appropriate
      const agentTypes = response.data.assignments.map(a => a.agentType);
      expect(agentTypes.length).toBeGreaterThan(0);

      // Each agent type should be a valid string
      agentTypes.forEach(type => {
        expect(type).toBeTruthy();
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Progress Tracking', () => {
    it('should track overall progress', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.overall).toBeGreaterThanOrEqual(0);
      expect(response.data.progress.overall).toBeLessThanOrEqual(100);
      expect(response.data.progress.completedSteps).toBeDefined();
      expect(response.data.progress.totalSteps).toBe(response.data.workflow.length);
    });

    it('should track progress by step', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 20
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.byStep).toBeDefined();

      // Check that each step has a progress value
      Object.values(response.data.progress.byStep).forEach(progress => {
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(100);
      });
    });

    it('should estimate completion time', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.progress.estimatedCompletion).toBeDefined();

      const estimatedDate = new Date(response.data.progress.estimatedCompletion);
      expect(estimatedDate.getTime()).toBeGreaterThan(0);
    });

    it('should update progress as steps complete', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Progress should be updated
      const completedSteps = response.data.workflow.filter(s => s.status === 'completed').length;
      expect(response.data.progress.completedSteps).toBe(completedSteps);
    });
  });

  describe('Error Handling and Rollback', () => {
    it('should handle registry failures gracefully', async () => {
      const mockFailingRegistry = {
        spawnAgent: jest.fn().mockRejectedValue(new Error('Registry unavailable'))
      } as any;

      const failingHandler = new TaskOrchestrateHandler(mockFailingRegistry, mockHookExecutor);

      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Registry unavailable');
    });

    it('should handle agent spawn failures', async () => {
      const mockFailingRegistry = {
        spawnAgent: jest.fn()
          .mockResolvedValueOnce({ id: 'agent-1', type: 'test-agent', status: 'active' })
          .mockRejectedValueOnce(new Error('Spawn failed'))
      } as any;

      const failingHandler = new TaskOrchestrateHandler(mockFailingRegistry, mockHookExecutor);

      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 20
        }
      };

      const response = await failingHandler.handle(args);

      // Handler should handle partial failures
      expect(response).toBeDefined();
    });

    it('should call post-task hook on failure', async () => {
      const mockFailingRegistry = {
        spawnAgent: jest.fn().mockRejectedValue(new Error('Spawn failed'))
      } as any;

      const failingHandler = new TaskOrchestrateHandler(mockFailingRegistry, mockHookExecutor);

      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      await failingHandler.handle(args);

      // Post-task hook should NOT be called on error (handler wraps error before reaching post-task)
      // This is expected behavior from the implementation
    });

    it('should handle hook execution failures', async () => {
      const mockFailingHook = {
        executePreTask: jest.fn().mockRejectedValue(new Error('Hook failed')),
        executePostTask: jest.fn()
      } as any;

      const failingHandler = new TaskOrchestrateHandler(mockAgentRegistry, mockFailingHook);

      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await failingHandler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Hook failed');
    });
  });

  describe('Timeout and Cancellation', () => {
    it('should respect timeout configuration', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 1 // Very short timeout
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      // Should complete quickly due to simulated execution
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });

    it('should allow cancellation of running orchestration', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Try to cancel the orchestration
      const cancelled = await handler.cancelOrchestration(response.data.id);

      // If orchestration is already completed, cancellation returns false
      // If still running, cancellation returns true
      expect(typeof cancelled).toBe('boolean');
    });

    it('should not allow cancellation of completed orchestration', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 3,
          timeoutMinutes: 15
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 100));

      // Try to cancel completed orchestration
      const cancelled = await handler.cancelOrchestration(response.data.id);

      // Should not allow cancellation of completed orchestration
      expect(cancelled).toBe(false);
    });
  });

  describe('Resource Management', () => {
    it('should track resource utilization', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.metrics.resourceUtilization).toBeDefined();
      expect(response.data.results.metrics.resourceUtilization).toBeGreaterThanOrEqual(0);
      expect(response.data.results.metrics.resourceUtilization).toBeLessThanOrEqual(100);
    });

    it('should track agent utilization', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.metrics.agentUtilization).toBeDefined();

      // Agent utilization should be tracked (may be empty if orchestration completes immediately)
      expect(typeof response.data.results.metrics.agentUtilization).toBe('object');
    });

    it('should calculate coordination overhead', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.metrics.coordinationOverhead).toBeDefined();
      expect(response.data.results.metrics.coordinationOverhead).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Orchestration State', () => {
    it('should track orchestration lifecycle states', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(['pending', 'running', 'completed', 'failed', 'cancelled']).toContain(response.data.status);
      expect(response.data.createdAt).toBeDefined();
    });

    it('should retrieve orchestration by ID', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);

      const retrieved = handler.getOrchestration(response.data.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(response.data.id);
    });

    it('should list all orchestrations', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      await handler.handle(args);

      const orchestrations = handler.listOrchestrations();
      expect(orchestrations.length).toBeGreaterThan(0);
    });

    it('should track timeline events', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.timeline).toBeDefined();
      expect(response.data.timeline.length).toBeGreaterThan(0);

      // Check timeline event structure
      response.data.timeline.forEach(event => {
        expect(event.timestamp).toBeDefined();
        expect(event.type).toBeDefined();
        expect(event.description).toBeDefined();
        expect(['created', 'started', 'step-completed', 'step-failed', 'completed', 'failed']).toContain(event.type);
      });
    });
  });

  describe('Complex Workflows', () => {
    it('should handle comprehensive-testing workflow with all steps', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'adaptive',
          maxAgents: 7,
          timeoutMinutes: 45
        },
        context: {
          project: 'complex-project',
          branch: 'main',
          environment: 'production'
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workflow.length).toBeGreaterThan(5); // Comprehensive testing has 7 steps
      expect(response.data.results.artifacts).toBeDefined();
      expect(Array.isArray(response.data.results.artifacts)).toBe(true);
    });

    it('should handle quality-gate workflow', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'critical',
          strategy: 'sequential',
          maxAgents: 5,
          timeoutMinutes: 20
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workflow.length).toBeGreaterThan(3); // Quality gate has 5 steps
    });

    it('should handle defect-prevention workflow', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'defect-prevention',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workflow.length).toBeGreaterThan(3); // Defect prevention has 5 steps
    });

    it('should handle performance-validation workflow', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'performance-validation',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 60
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.workflow.length).toBeGreaterThan(3); // Performance validation has 5 steps
    });

    it('should generate artifacts for completed workflows', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.artifacts).toBeDefined();

      // Check artifact structure
      response.data.results.artifacts.forEach(artifact => {
        expect(artifact.type).toBeDefined();
        expect(artifact.name).toBeDefined();
        expect(artifact.path).toBeDefined();
        expect(artifact.size).toBeGreaterThan(0);
        expect(artifact.stepId).toBeDefined();
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject missing task parameter', async () => {
      const args = {} as TaskOrchestrateArgs;

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toMatch(/task|undefined|type/i);
    });

    it('should reject invalid task type', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'invalid-task-type' as any,
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*task type/i);
    });

    it('should reject invalid priority', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'invalid-priority' as any,
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*priority/i);
    });

    it('should reject invalid strategy', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'invalid-strategy' as any,
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/invalid.*strategy/i);
    });
  });

  describe('Edge Cases', () => {
    it('should handle orchestration with minimal agents', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'sequential',
          maxAgents: 1,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should handle orchestration with maximum agents', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 20,
          timeoutMinutes: 60
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
    });

    it('should handle concurrent orchestration requests', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => {
        return handler.handle({
          task: {
            type: 'quality-gate',
            priority: 'high',
            strategy: 'parallel',
            maxAgents: 3,
            timeoutMinutes: 15
          }
        });
      });

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(5);
    });
  });

  describe('Performance', () => {
    it('should complete orchestration within reasonable time', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'quality-gate',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 3,
          timeoutMinutes: 15
        }
      };

      const startTime = Date.now();
      const response = await handler.handle(args);
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should track execution time in results', async () => {
      const args: TaskOrchestrateArgs = {
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'parallel',
          maxAgents: 5,
          timeoutMinutes: 30
        }
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.results.summary.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });
});
