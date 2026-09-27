import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  initialized: true,
  orchestrator: {
    getWorkflowStatus: vi.fn(), approveStep: vi.fn(), rejectStep: vi.fn(),
  },
}));
vi.mock('../../../src/mcp/handlers/core-handlers.js', () => ({
  isFleetInitialized: () => state.initialized,
  getFleetState: () => ({ workflowOrchestrator: state.orchestrator }),
}));
import { handlePipelineApprove, handlePipelineReject } from '../../../src/mcp/handlers/pipeline-handlers.js';

describe('pipeline approval handler boundaries', () => {
  beforeEach(() => {
    state.initialized = true;
    vi.resetAllMocks();
    state.orchestrator.getWorkflowStatus.mockReturnValue({ status: 'running' });
    state.orchestrator.approveStep.mockReturnValue(true);
    state.orchestrator.rejectStep.mockReturnValue(true);
  });

  it('keeps paused gates pending with an actionable error', async () => {
    state.orchestrator.getWorkflowStatus.mockReturnValue({ status: 'paused' });
    const result = await handlePipelineApprove({ executionId: 'run', stepId: 'gate' });
    expect(result).toMatchObject({ success: false, error: 'Cannot approve a step while the workflow is paused.' });
    expect(state.orchestrator.approveStep).not.toHaveBeenCalled();
  });

  it('does not acknowledge missing or resolved gates', async () => {
    state.orchestrator.approveStep.mockReturnValue(false);
    expect((await handlePipelineApprove({ executionId: 'run', stepId: 'gone' })).success).toBe(false);
    state.orchestrator.getWorkflowStatus.mockReturnValue(undefined);
    expect((await handlePipelineReject({ executionId: 'gone', stepId: 'gate' })).success).toBe(false);
  });

  it('validates required identifiers and the rejection reason', async () => {
    for (const params of [
      { executionId: '', stepId: 'gate' },
      { executionId: 'run', stepId: ' ' },
      { executionId: 'run', stepId: 'gate', reason: 1 },
    ]) {
      expect((await handlePipelineReject(params as never)).success).toBe(false);
    }
    expect(state.orchestrator.rejectStep).not.toHaveBeenCalled();
  });

  it('requires an initialized fleet', async () => {
    state.initialized = false;
    expect((await handlePipelineApprove({ executionId: 'run', stepId: 'gate' })).success).toBe(false);
    expect(state.orchestrator.approveStep).not.toHaveBeenCalled();
  });
});
