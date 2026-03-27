/**
 * Unit tests for approval gate step type (Imp-9)
 *
 * Tests the approval gate functionality in the WorkflowOrchestrator:
 * - Step pauses at approval gate
 * - approveStep() resumes execution
 * - rejectStep() fails the step
 * - Auto-approve works after timeout
 * - Timeout rejection works
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowOrchestrator } from '../../../src/coordination/workflow-orchestrator.js';
import type {
  WorkflowDefinition,
  WorkflowOrchestratorConfig,
} from '../../../src/coordination/workflow-types.js';
import { ok } from '../../../src/shared/types/index.js';
import type { EventBus, MemoryBackend, AgentCoordinator, Subscription } from '../../../src/kernel/interfaces.js';

// ============================================================================
// Mock Infrastructure
// ============================================================================

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() } as Subscription),
    subscribeOnce: vi.fn().mockReturnValue({ unsubscribe: vi.fn() } as Subscription),
  } as unknown as EventBus;
}

function createMockMemory(): MemoryBackend {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    search: vi.fn().mockResolvedValue([]),
    has: vi.fn().mockResolvedValue(false),
    keys: vi.fn().mockResolvedValue([]),
  } as unknown as MemoryBackend;
}

function createMockCoordinator(): AgentCoordinator {
  return {
    canSpawn: vi.fn().mockReturnValue(true),
    spawn: vi.fn().mockResolvedValue(ok('agent-1')),
    stop: vi.fn().mockResolvedValue(ok(undefined)),
    list: vi.fn().mockReturnValue([]),
    getAgent: vi.fn().mockReturnValue(undefined),
  } as unknown as AgentCoordinator;
}

const TEST_CONFIG: Partial<WorkflowOrchestratorConfig> = {
  maxConcurrentWorkflows: 5,
  defaultStepTimeout: 60000,
  defaultWorkflowTimeout: 300000,
  enableEventTriggers: false,
  persistExecutions: false,
};

// ============================================================================
// Test Workflows
// ============================================================================

function makeApprovalWorkflow(
  approval: WorkflowDefinition['steps'][0]['approval'],
): WorkflowDefinition {
  return {
    id: 'approval-test',
    name: 'Approval Test Workflow',
    description: 'Test workflow with approval gate',
    version: '1.0.0',
    steps: [
      {
        id: 'gate-check',
        name: 'Quality Gate',
        domain: 'quality-assessment',
        action: 'gate-check',
        inputMapping: {},
      },
      {
        id: 'approval-step',
        name: 'Approval Gate',
        domain: 'quality-assessment',
        action: 'gate-check',
        dependsOn: ['gate-check'],
        approval,
      },
    ],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('approval gate', () => {
  let orchestrator: WorkflowOrchestrator;
  let eventBus: EventBus;

  beforeEach(async () => {
    eventBus = createMockEventBus();
    orchestrator = new WorkflowOrchestrator(
      eventBus,
      createMockMemory(),
      createMockCoordinator(),
      TEST_CONFIG,
    );
    await orchestrator.initialize();
  });

  it('should pause at approval gate and resume on approve', async () => {
    const workflow = makeApprovalWorkflow({
      autoApproveAfter: 0, // never auto-approve
      message: 'Please approve',
    });
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    // Give the workflow time to reach the approval gate
    await new Promise((r) => setTimeout(r, 100));

    // The step should be awaiting approval
    const status = orchestrator.getWorkflowStatus(executionId);
    expect(status).toBeDefined();
    // Workflow should still be running (not completed yet)
    expect(status!.status).toBe('running');

    // Approve the step
    const approved = orchestrator.approveStep(executionId, 'approval-step');
    expect(approved).toBe(true);

    // Wait for workflow to complete
    await new Promise((r) => setTimeout(r, 100));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('completed');
    expect(finalStatus!.completedSteps).toContain('approval-step');
  });

  it('should fail step on reject', async () => {
    const workflow = makeApprovalWorkflow({
      autoApproveAfter: 0,
      message: 'Please approve',
    });
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    // Wait for approval gate
    await new Promise((r) => setTimeout(r, 100));

    // Reject the step
    const rejected = orchestrator.rejectStep(executionId, 'approval-step', 'Not ready');
    expect(rejected).toBe(true);

    // Wait for workflow to finish
    await new Promise((r) => setTimeout(r, 100));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('failed');
    expect(finalStatus!.failedSteps).toContain('approval-step');
  });

  it('should auto-approve after timeout', async () => {
    const workflow = makeApprovalWorkflow({
      autoApproveAfter: 50, // 50ms
      message: 'Auto-approve test',
    });
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    // Wait for auto-approve + execution
    await new Promise((r) => setTimeout(r, 300));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('completed');
    expect(finalStatus!.completedSteps).toContain('approval-step');
  });

  it('should return false for approve on unknown execution', () => {
    const result = orchestrator.approveStep('nonexistent', 'step1');
    expect(result).toBe(false);
  });

  it('should return false for reject on unknown execution', () => {
    const result = orchestrator.rejectStep('nonexistent', 'step1');
    expect(result).toBe(false);
  });

  it('should work with simple boolean approval (auto-approve default 5min)', async () => {
    // With approval: true, auto-approve timeout is 300000ms (5 min default).
    // We just verify the workflow enters the gate. We approve manually
    // to avoid a long wait.
    const workflow = makeApprovalWorkflow(true);
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    await new Promise((r) => setTimeout(r, 100));

    // Approve manually
    orchestrator.approveStep(executionId, 'approval-step');
    await new Promise((r) => setTimeout(r, 100));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('completed');
  });

  it('should emit StepAwaitingApproval event', async () => {
    const workflow = makeApprovalWorkflow({
      autoApproveAfter: 0,
      message: 'Event test',
    });
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    const executionId = execResult.value;

    await new Promise((r) => setTimeout(r, 100));

    // Check that publish was called with the approval event
    const publishCalls = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls;
    const approvalEvents = publishCalls.filter(
      (call: unknown[]) => (call[0] as { type: string }).type === 'workflow.StepAwaitingApproval',
    );
    expect(approvalEvents.length).toBeGreaterThan(0);

    // Clean up
    orchestrator.approveStep(executionId, 'approval-step');
    await new Promise((r) => setTimeout(r, 50));
  });
});
