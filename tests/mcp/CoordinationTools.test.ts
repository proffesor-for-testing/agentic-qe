/**
 * Coordination Tools Tests
 *
 * Tests for the 8 coordination MCP tools implementing:
 * - GOAP (Goal-Oriented Action Planning)
 * - OODA (Observe-Orient-Decide-Act) loops
 * - Blackboard pattern
 * - Consensus-based gating
 * - Event-driven coordination
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgenticQEMCPServer } from '../../src/mcp/server.js';
import { TOOL_NAMES } from '../../src/mcp/tools.js';

describe('Coordination Tools', () => {
  let server: AgenticQEMCPServer;

  beforeEach(async () => {
    server = new AgenticQEMCPServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('task_orchestrate - GOAP Integration', () => {
    it('should orchestrate task with GOAP planning', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);

      const result = await handler.handle({
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'adaptive',
          maxAgents: 5,
          timeoutMinutes: 30
        },
        context: {
          project: 'test-project',
          branch: 'main',
          environment: 'staging'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('type', 'comprehensive-testing');
      expect(result.data).toHaveProperty('workflow');
      expect(result.data.workflow).toBeInstanceOf(Array);
      expect(result.data).toHaveProperty('assignments');
    });

    it('should use GOAP for action planning', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);

      const result = await handler.handle({
        task: {
          type: 'quality-gate',
          priority: 'critical',
          strategy: 'parallel'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.workflow.length).toBeGreaterThan(0);
      // Verify GOAP planning creates proper action sequences
      expect(result.data.workflow.every((step: any) =>
        step.dependencies && Array.isArray(step.dependencies)
      )).toBe(true);
    });

    it('should validate task specifications', async () => {
      const handler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);

      const result = await handler.handle({
        task: {
          type: 'invalid-type',
          priority: 'high',
          strategy: 'adaptive'
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid task type');
    });
  });

  describe('workflow_create', () => {
    it('should create workflow with steps and dependencies', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');

      const result = await handler.handle({
        name: 'Integration Test Workflow',
        description: 'Full integration testing workflow',
        steps: [
          {
            id: 'setup',
            name: 'Setup Test Environment',
            type: 'setup',
            dependencies: []
          },
          {
            id: 'execute',
            name: 'Execute Tests',
            type: 'execution',
            dependencies: ['setup']
          },
          {
            id: 'teardown',
            name: 'Cleanup',
            type: 'cleanup',
            dependencies: ['execute']
          }
        ],
        checkpoints: {
          enabled: true,
          frequency: 'after-each-step'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('workflowId');
      expect(result.data).toHaveProperty('name', 'Integration Test Workflow');
      expect(result.data.steps).toHaveLength(3);
      expect(result.data).toHaveProperty('checkpoints');
    });

    it('should validate workflow structure', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');

      const result = await handler.handle({
        name: 'Invalid Workflow',
        steps: [] // Empty steps
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one step');
    });

    it('should detect circular dependencies', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');

      const result = await handler.handle({
        name: 'Circular Workflow',
        steps: [
          {
            id: 'step1',
            name: 'Step 1',
            type: 'test',
            dependencies: ['step2']
          },
          {
            id: 'step2',
            name: 'Step 2',
            type: 'test',
            dependencies: ['step1']
          }
        ]
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('circular dependency');
    });
  });

  describe('workflow_execute - OODA Loop Integration', () => {
    it('should execute workflow with OODA loops', async () => {
      // First create a workflow
      const createHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');
      const createResult = await createHandler.handle({
        name: 'Test Workflow',
        steps: [
          {
            id: 'test-step',
            name: 'Test Step',
            type: 'test',
            dependencies: []
          }
        ]
      });

      const workflowId = createResult.data.workflowId;

      // Execute the workflow
      const executeHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_execute');
      const result = await executeHandler.handle({
        workflowId,
        context: {
          environment: 'test',
          dryRun: false
        },
        oodaEnabled: true
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('executionId');
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('oodaCycles');
      expect(result.data.oodaCycles).toBeInstanceOf(Array);
    });

    it('should track OODA cycle phases', async () => {
      const createHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');
      const createResult = await createHandler.handle({
        name: 'OODA Test',
        steps: [{ id: 'test', name: 'Test', type: 'test', dependencies: [] }]
      });

      const executeHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_execute');
      const result = await executeHandler.handle({
        workflowId: createResult.data.workflowId,
        oodaEnabled: true
      });

      expect(result.success).toBe(true);
      if (result.data.oodaCycles && result.data.oodaCycles.length > 0) {
        const cycle = result.data.oodaCycles[0];
        expect(cycle).toHaveProperty('observations');
        expect(cycle).toHaveProperty('orientation');
        expect(cycle).toHaveProperty('decision');
        expect(cycle).toHaveProperty('action');
      }
    });
  });

  describe('workflow_checkpoint', () => {
    it('should create workflow checkpoint', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_checkpoint');

      const result = await handler.handle({
        executionId: 'exec-123',
        reason: 'Manual checkpoint before critical step'
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('checkpointId');
      expect(result.data).toHaveProperty('executionId', 'exec-123');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('state');
    });

    it('should capture complete workflow state', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_checkpoint');

      const result = await handler.handle({
        executionId: 'exec-456'
      });

      expect(result.success).toBe(true);
      expect(result.data.state).toHaveProperty('completedSteps');
      expect(result.data.state).toHaveProperty('currentStep');
      expect(result.data.state).toHaveProperty('variables');
    });
  });

  describe('workflow_resume', () => {
    it('should resume workflow from checkpoint', async () => {
      // Create checkpoint first
      const checkpointHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_checkpoint');
      const checkpointResult = await checkpointHandler.handle({
        executionId: 'exec-789'
      });

      const checkpointId = checkpointResult.data.checkpointId;

      // Resume from checkpoint
      const resumeHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_resume');
      const result = await resumeHandler.handle({
        checkpointId,
        context: {
          skipFailedSteps: false
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('executionId');
      expect(result.data).toHaveProperty('resumedFrom', checkpointId);
      expect(result.data).toHaveProperty('status');
    });

    it('should validate checkpoint exists before resume', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__workflow_resume');

      const result = await handler.handle({
        checkpointId: 'non-existent-checkpoint'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Checkpoint not found');
    });
  });

  describe('task_status', () => {
    it('should return status of orchestration', async () => {
      // First create an orchestration
      const orchestrateHandler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);
      const orchestration = await orchestrateHandler.handle({
        task: {
          type: 'quality-gate',
          priority: 'medium',
          strategy: 'sequential'
        }
      });

      const orchestrationId = orchestration.data.id;

      // Get status
      const statusHandler = (server as any).handlers.get('mcp__agentic_qe__task_status');
      const result = await statusHandler.handle({
        taskId: orchestrationId
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('taskId', orchestrationId);
      expect(result.data).toHaveProperty('status');
      expect(result.data).toHaveProperty('progress');
      expect(result.data).toHaveProperty('timeline');
    });

    it('should return detailed progress information', async () => {
      const orchestrateHandler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);
      const orchestration = await orchestrateHandler.handle({
        task: {
          type: 'defect-prevention',
          priority: 'high',
          strategy: 'adaptive'
        }
      });

      const statusHandler = (server as any).handlers.get('mcp__agentic_qe__task_status');
      const result = await statusHandler.handle({
        taskId: orchestration.data.id,
        includeDetails: true
      });

      expect(result.success).toBe(true);
      expect(result.data.progress).toHaveProperty('overall');
      expect(result.data.progress).toHaveProperty('byStep');
      expect(result.data.progress).toHaveProperty('completedSteps');
      expect(result.data.progress).toHaveProperty('totalSteps');
    });

    it('should handle non-existent task gracefully', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__task_status');

      const result = await handler.handle({
        taskId: 'non-existent-task'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Task not found');
    });
  });

  describe('event_emit - Event Bus Integration', () => {
    it('should emit coordination event', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_emit');

      const result = await handler.handle({
        event: 'test:started',
        data: {
          testId: 'test-001',
          suite: 'integration',
          testCount: 50
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('eventId');
      expect(result.data).toHaveProperty('event', 'test:started');
      expect(result.data).toHaveProperty('timestamp');
      expect(result.data).toHaveProperty('delivered');
    });

    it('should support custom event types', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_emit');

      const result = await handler.handle({
        event: 'custom:coordination:checkpoint',
        data: {
          checkpointId: 'cp-123',
          reason: 'Before critical operation'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.event).toBe('custom:coordination:checkpoint');
    });

    it('should add timestamp automatically', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_emit');

      const result = await handler.handle({
        event: 'agent:ready',
        data: {
          agentId: 'agent-001',
          status: 'ready'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data.data).toHaveProperty('timestamp');
      expect(typeof result.data.data.timestamp).toBe('number');
    });
  });

  describe('event_subscribe - Event Stream Integration', () => {
    it('should subscribe to event stream', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_subscribe');

      const result = await handler.handle({
        events: ['test:progress', 'test:completed'],
        filter: {
          testId: 'test-001'
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('subscriptionId');
      expect(result.data).toHaveProperty('events');
      expect(result.data.events).toEqual(['test:progress', 'test:completed']);
      expect(result.data).toHaveProperty('filter');
    });

    it('should support wildcard subscriptions', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_subscribe');

      const result = await handler.handle({
        events: ['agent:*'],
        filter: {}
      });

      expect(result.success).toBe(true);
      expect(result.data.events).toContain('agent:*');
    });

    it('should allow unsubscribe', async () => {
      const subscribeHandler = (server as any).handlers.get('mcp__agentic_qe__event_subscribe');
      const subscribeResult = await subscribeHandler.handle({
        events: ['test:started']
      });

      const subscriptionId = subscribeResult.data.subscriptionId;

      const result = await subscribeHandler.handle({
        action: 'unsubscribe',
        subscriptionId
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('unsubscribed', true);
    });

    it('should validate event names', async () => {
      const handler = (server as any).handlers.get('mcp__agentic_qe__event_subscribe');

      const result = await handler.handle({
        events: [] // Empty events array
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least one event');
    });
  });

  describe('Integration: Complete Coordination Flow', () => {
    it('should coordinate workflow with all patterns', async () => {
      // 1. Create workflow
      const createHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_create');
      const workflow = await createHandler.handle({
        name: 'Complete Test Flow',
        steps: [
          { id: 'init', name: 'Initialize', type: 'setup', dependencies: [] },
          { id: 'test', name: 'Test', type: 'execution', dependencies: ['init'] },
          { id: 'verify', name: 'Verify', type: 'validation', dependencies: ['test'] }
        ]
      });

      expect(workflow.success).toBe(true);
      const workflowId = workflow.data.workflowId;

      // 2. Subscribe to events
      const subscribeHandler = (server as any).handlers.get('mcp__agentic_qe__event_subscribe');
      const subscription = await subscribeHandler.handle({
        events: ['workflow:*']
      });

      expect(subscription.success).toBe(true);

      // 3. Execute workflow with OODA
      const executeHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_execute');
      const execution = await executeHandler.handle({
        workflowId,
        oodaEnabled: true
      });

      expect(execution.success).toBe(true);
      const executionId = execution.data.executionId;

      // 4. Create checkpoint
      const checkpointHandler = (server as any).handlers.get('mcp__agentic_qe__workflow_checkpoint');
      const checkpoint = await checkpointHandler.handle({
        executionId,
        reason: 'Integration test checkpoint'
      });

      expect(checkpoint.success).toBe(true);

      // 5. Check status
      const statusHandler = (server as any).handlers.get('mcp__agentic_qe__task_status');
      const status = await statusHandler.handle({
        taskId: executionId
      });

      expect(status.success).toBe(true);
      expect(status.data).toHaveProperty('status');
    });
  });

  describe('Blackboard Pattern Integration', () => {
    it('should use blackboard for agent coordination', async () => {
      const orchestrateHandler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);

      const result = await orchestrateHandler.handle({
        task: {
          type: 'comprehensive-testing',
          priority: 'high',
          strategy: 'adaptive'
        },
        context: {
          useBlackboard: true,
          blackboardKey: 'aqe/test-coordination'
        }
      });

      expect(result.success).toBe(true);
      // Verify blackboard hints are created for coordination
      expect(result.data).toHaveProperty('coordination');
    });
  });

  describe('Consensus Gating Integration', () => {
    it('should require consensus for quality gates', async () => {
      const orchestrateHandler = (server as any).handlers.get(TOOL_NAMES.TASK_ORCHESTRATE);

      const result = await orchestrateHandler.handle({
        task: {
          type: 'quality-gate',
          priority: 'critical',
          strategy: 'sequential'
        },
        context: {
          requireConsensus: true,
          quorum: 2
        }
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('consensus');
    });
  });
});
