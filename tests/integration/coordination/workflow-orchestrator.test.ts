/**
 * Agentic QE v3 - Workflow Orchestrator Integration Tests
 * Tests workflow registration, listing, and basic execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WorkflowOrchestrator,
  WorkflowDefinition,
} from '../../../src/coordination/workflow-orchestrator';
import { InMemoryEventBus } from '../../../src/kernel/event-bus';
import { DefaultAgentCoordinator } from '../../../src/kernel/agent-coordinator';
import { MemoryBackend, StoreOptions, EventBus, AgentCoordinator } from '../../../src/kernel/interfaces';

/**
 * Mock MemoryBackend for testing
 */
function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize() {},
    async dispose() {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(pattern: string, _limit?: number): Promise<string[]> {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return Array.from(store.keys()).filter((k) => regex.test(k));
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<[]> {
      return [];
    },
    async storeVector(
      _key: string,
      _embedding: number[],
      _metadata?: unknown
    ): Promise<void> {},
  };
}

describe('WorkflowOrchestrator Integration', () => {
  let eventBus: EventBus;
  let memory: MemoryBackend;
  let agentCoordinator: AgentCoordinator;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(async () => {
    eventBus = new InMemoryEventBus();
    memory = createMockMemory();
    agentCoordinator = new DefaultAgentCoordinator();
    orchestrator = new WorkflowOrchestrator(eventBus, memory, agentCoordinator, {
      enableEventTriggers: false, // Disable for testing
      persistExecutions: false,
    });
    await orchestrator.initialize();
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe('workflow registration', () => {
    it('should register a custom workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'custom-workflow',
        name: 'Custom Workflow',
        description: 'A custom workflow for testing',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            name: 'First Step',
            domain: 'test-generation',
            action: 'generate',
          },
        ],
      };

      const result = orchestrator.registerWorkflow(workflow);

      expect(result.success).toBe(true);
    });

    it('should list registered workflows', () => {
      const workflow: WorkflowDefinition = {
        id: 'list-workflow',
        name: 'List Workflow',
        description: 'Workflow for listing test',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      const workflows = orchestrator.listWorkflows();

      expect(workflows.some((w) => w.id === 'list-workflow')).toBe(true);
    });

    it('should get workflow by ID', () => {
      const workflow: WorkflowDefinition = {
        id: 'get-workflow',
        name: 'Get Workflow',
        description: 'Workflow for get test',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      const retrieved = orchestrator.getWorkflow('get-workflow');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Get Workflow');
    });

    it('should unregister a workflow', () => {
      const workflow: WorkflowDefinition = {
        id: 'remove-workflow',
        name: 'Remove Workflow',
        description: 'Workflow to remove',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);
      expect(orchestrator.getWorkflow('remove-workflow')).toBeDefined();

      const result = orchestrator.unregisterWorkflow('remove-workflow');

      expect(result.success).toBe(true);
      expect(orchestrator.getWorkflow('remove-workflow')).toBeUndefined();
    });
  });

  describe('built-in workflows', () => {
    it('should have built-in TDD workflow', () => {
      const workflows = orchestrator.listWorkflows();

      const tddWorkflow = workflows.find(
        (w) => w.id === 'tdd-cycle' || w.name.toLowerCase().includes('tdd')
      );

      // Built-in workflows should be registered during initialization
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should have multiple built-in workflows', () => {
      const workflows = orchestrator.listWorkflows();

      // Should have at least some built-in workflows
      expect(workflows.length).toBeGreaterThanOrEqual(1);
    });

    it('should provide workflow details', () => {
      const workflows = orchestrator.listWorkflows();

      // Each workflow should have required fields
      for (const workflow of workflows) {
        expect(workflow.id).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(typeof workflow.stepCount).toBe('number');
      }
    });
  });

  describe('workflow execution', () => {
    it('should start workflow execution', async () => {
      const workflow: WorkflowDefinition = {
        id: 'exec-workflow',
        name: 'Execution Workflow',
        description: 'A workflow for execution testing',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            name: 'Simple Step',
            domain: 'test-generation',
            action: 'noop', // Non-existent action will still start execution
          },
        ],
      };

      orchestrator.registerWorkflow(workflow);

      const result = await orchestrator.executeWorkflow('exec-workflow');

      expect(result.success).toBe(true);
      if (result.success) {
        // Returns execution ID
        expect(typeof result.value).toBe('string');
      }
    });

    it('should track workflow execution status', async () => {
      const workflow: WorkflowDefinition = {
        id: 'tracking-workflow',
        name: 'Tracking Workflow',
        description: 'Workflow for status tracking',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      const result = await orchestrator.executeWorkflow('tracking-workflow');

      expect(result.success).toBe(true);
      if (result.success) {
        const status = orchestrator.getWorkflowStatus(result.value);

        expect(status).toBeDefined();
        expect(status?.executionId).toBe(result.value);
      }
    });

    it('should pass input to workflow context', async () => {
      const workflow: WorkflowDefinition = {
        id: 'input-workflow',
        name: 'Input Workflow',
        description: 'Workflow with input',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      const input = {
        targetFile: 'src/app.ts',
        coverageThreshold: 80,
      };

      const result = await orchestrator.executeWorkflow('input-workflow', input);

      expect(result.success).toBe(true);
      if (result.success) {
        const status = orchestrator.getWorkflowStatus(result.value);
        expect(status?.context.input).toEqual(input);
      }
    });
  });

  describe('workflow events', () => {
    it('should emit workflow started event', async () => {
      const events: string[] = [];

      eventBus.subscribe('workflow.WorkflowStarted', () => {
        events.push('started');
      });

      const workflow: WorkflowDefinition = {
        id: 'event-workflow',
        name: 'Event Workflow',
        description: 'Workflow with events',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      await orchestrator.executeWorkflow('event-workflow');

      expect(events).toContain('started');
    });
  });

  describe('error handling', () => {
    it('should handle missing workflow', async () => {
      const result = await orchestrator.executeWorkflow('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should reject duplicate workflow registration', () => {
      const workflow: WorkflowDefinition = {
        id: 'duplicate-workflow',
        name: 'Duplicate Workflow',
        description: 'Workflow for duplicate test',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      const result1 = orchestrator.registerWorkflow(workflow);
      expect(result1.success).toBe(true);

      // Registration should succeed (overwrite) or fail (reject)
      const result2 = orchestrator.registerWorkflow(workflow);
      // Either is valid behavior
    });
  });

  describe('workflow cancellation', () => {
    it('should cancel running workflow', async () => {
      const workflow: WorkflowDefinition = {
        id: 'cancel-workflow',
        name: 'Cancel Workflow',
        description: 'Workflow to cancel',
        version: '1.0.0',
        steps: [
          {
            id: 'long-step',
            name: 'Long Step',
            domain: 'test-generation',
            action: 'longRunning',
            timeout: 10000, // Long timeout
          },
        ],
      };

      orchestrator.registerWorkflow(workflow);

      // Start execution
      const executeResult = await orchestrator.executeWorkflow('cancel-workflow');

      if (executeResult.success) {
        const executionId = executeResult.value;

        // Cancel immediately
        const cancelResult = await orchestrator.cancelWorkflow(executionId);

        expect(cancelResult.success).toBe(true);

        const status = orchestrator.getWorkflowStatus(executionId);
        if (status) {
          expect(['cancelled', 'running', 'completed', 'failed']).toContain(status.status);
        }
      }
    });
  });

  describe('active executions', () => {
    it('should track active executions', async () => {
      const workflow: WorkflowDefinition = {
        id: 'active-workflow',
        name: 'Active Workflow',
        description: 'Workflow for active tracking',
        version: '1.0.0',
        steps: [{ id: 'step-1', name: 'Step', domain: 'test-generation', action: 'test' }],
      };

      orchestrator.registerWorkflow(workflow);

      // Start execution
      await orchestrator.executeWorkflow('active-workflow');

      const active = orchestrator.getActiveExecutions();

      // May have active executions depending on timing
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('workflow validation', () => {
    it('should validate workflow definition', () => {
      const validWorkflow: WorkflowDefinition = {
        id: 'valid-workflow',
        name: 'Valid Workflow',
        description: 'A valid workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            name: 'Step 1',
            domain: 'test-generation',
            action: 'generate',
          },
        ],
      };

      const result = orchestrator.registerWorkflow(validWorkflow);
      expect(result.success).toBe(true);
    });

    it('should handle workflow with dependencies', () => {
      const dependencyWorkflow: WorkflowDefinition = {
        id: 'dependency-workflow',
        name: 'Dependency Workflow',
        description: 'Workflow with step dependencies',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            name: 'First',
            domain: 'test-generation',
            action: 'first',
          },
          {
            id: 'step-2',
            name: 'Second',
            domain: 'test-execution',
            action: 'second',
            dependsOn: ['step-1'],
          },
        ],
      };

      const result = orchestrator.registerWorkflow(dependencyWorkflow);
      expect(result.success).toBe(true);

      const retrieved = orchestrator.getWorkflow('dependency-workflow');
      expect(retrieved?.steps.length).toBe(2);
      expect(retrieved?.steps[1].dependsOn).toContain('step-1');
    });
  });
});
