/**
 * Unit tests for approval gate step type (Imp-9)
 *
 * Tests the approval gate functionality in the WorkflowOrchestrator:
 * - Step pauses at approval gate
 * - approveStep() resumes execution
 * - rejectStep() fails the step
 * - No action runs before explicit approval
 * - Timeout rejects without invoking the action
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
      expiresAfter: 0, // wait for explicit approval
      message: 'Please approve',
    });
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
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
    expect(status!.stepResults.get('approval-step')?.status).toBe('awaiting_approval');
    expect(action).not.toHaveBeenCalled();

    // Approve the step
    const approved = orchestrator.approveStep(executionId, 'approval-step');
    expect(approved).toBe(true);

    // Wait for workflow to complete
    await new Promise((r) => setTimeout(r, 100));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('completed');
    expect(finalStatus!.completedSteps).toContain('approval-step');
    expect(action).toHaveBeenCalledOnce();
  });

  it('should fail step on reject', async () => {
    const workflow = makeApprovalWorkflow({
      expiresAfter: 0,
      message: 'Please approve',
    });
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
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
    expect(finalStatus!.stepResults.get('approval-step')?.output).toBeUndefined();
    expect(finalStatus!.context.results['approval-step']).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
  });

  it('expires without executing an unapproved action', async () => {
    const workflow = makeApprovalWorkflow({
      autoApproveAfter: 300, // legacy field now means expiry
      message: 'Approval expiry test',
    });
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.stepResults.get('approval-step')?.status)
        .toBe('awaiting_approval');
    });
    expect(action).not.toHaveBeenCalled();
    const approvalEvent = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls
      .map((call: unknown[]) => call[0] as { type: string; payload: Record<string, unknown> })
      .find((event) => event.type === 'workflow.StepAwaitingApproval');
    expect(approvalEvent?.payload.expiresAfter).toBe(300);
    expect(approvalEvent?.payload).not.toHaveProperty('autoApproveAfter');

    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.status).toBe('failed');
    });

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus?.failedSteps).toContain('approval-step');
    expect(finalStatus?.stepResults.get('approval-step')?.error).toMatch(/expir/i);
    expect(action).not.toHaveBeenCalled();
    expect(orchestrator.approveStep(executionId, 'approval-step')).toBe(false);
  });

  it('should return false for approve on unknown execution', () => {
    const result = orchestrator.approveStep('nonexistent', 'step1');
    expect(result).toBe(false);
  });

  it('rejects invalid approval expiry in directly registered workflows', () => {
    for (const approval of [
      { expiresAfter: -1 },
      { autoApproveAfter: Number.POSITIVE_INFINITY },
      { expiresAfter: 2_147_483_648 },
      { expiresAfter: 10, autoApproveAfter: 20 },
    ]) {
      expect(orchestrator.registerWorkflow(makeApprovalWorkflow(approval)).success).toBe(false);
    }
  });

  it('should return false for reject on unknown execution', () => {
    const result = orchestrator.rejectStep('nonexistent', 'step1');
    expect(result).toBe(false);
  });

  it('should work with simple boolean approval (expiry default 5min)', async () => {
    // With approval: true, an unanswered request expires after 300000ms.
    // We just verify the workflow enters the gate. We approve manually
    // to avoid a long wait.
    const workflow = makeApprovalWorkflow(true);
    orchestrator.registerWorkflow(workflow);

    const execResult = await orchestrator.executeWorkflow('approval-test', {});
    expect(execResult.success).toBe(true);
    const executionId = execResult.value;

    await new Promise((r) => setTimeout(r, 100));

    const approvalEvent = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls
      .map((call: unknown[]) => call[0] as { type: string; payload: { expiresAfter?: number } })
      .find((event) => event.type === 'workflow.StepAwaitingApproval');
    expect(approvalEvent?.payload.expiresAfter).toBe(300000);

    // Approve manually
    orchestrator.approveStep(executionId, 'approval-step');
    await new Promise((r) => setTimeout(r, 100));

    const finalStatus = orchestrator.getWorkflowStatus(executionId);
    expect(finalStatus).toBeDefined();
    expect(finalStatus!.status).toBe('completed');
  });

  it('should emit StepAwaitingApproval event', async () => {
    const workflow = makeApprovalWorkflow({
      expiresAfter: 0,
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

  it('accepts approval delivered synchronously by the approval event consumer', async () => {
    const workflow = makeApprovalWorkflow({ expiresAfter: 0 });
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
    orchestrator.registerWorkflow(workflow);

    (eventBus.publish as ReturnType<typeof vi.fn>).mockImplementation(async (event: {
      type: string; payload: { executionId: string; stepId: string }
    }) => {
      if (event.type === 'workflow.StepAwaitingApproval') {
        expect(orchestrator.approveStep(event.payload.executionId, event.payload.stepId)).toBe(true);
      }
    });

    const executionId = (await orchestrator.executeWorkflow('approval-test', {})).value;
    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.status).toBe('completed');
    });
    expect(action).toHaveBeenCalledOnce();
  });

  it('does not dispatch an action when the workflow is cancelled at its gate', async () => {
    const workflow = makeApprovalWorkflow({ expiresAfter: 0 });
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
    orchestrator.registerWorkflow(workflow);

    const executionId = (await orchestrator.executeWorkflow('approval-test', {})).value;
    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.stepResults.get('approval-step')?.status)
        .toBe('awaiting_approval');
    });
    await orchestrator.cancelWorkflow(executionId);
    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.status).toBe('cancelled');
      expect(orchestrator.getWorkflowStatus(executionId)?.stepResults.get('approval-step')?.status)
        .toBe('failed');
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('closes an indefinite gate when the workflow times out', async () => {
    const workflow = makeApprovalWorkflow({ expiresAfter: 0 });
    workflow.timeout = 250;
    workflow.steps[1].action = 'privileged-action';
    const action = vi.fn(async () => ok({ changed: true }));
    orchestrator.registerAction('quality-assessment', 'privileged-action', action);
    orchestrator.registerWorkflow(workflow);

    const executionId = (await orchestrator.executeWorkflow('approval-test', {})).value;
    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.stepResults.get('approval-step')?.status)
        .toBe('awaiting_approval');
    });
    await vi.waitFor(() => {
      expect(orchestrator.getWorkflowStatus(executionId)?.status).toBe('failed');
    });
    expect(orchestrator.approveStep(executionId, 'approval-step')).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });
});
