import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ initialized: true, execution: null as unknown }));
vi.mock('../../../src/mcp/handlers/core-handlers.js', () => ({
  isFleetInitialized: () => state.initialized,
  getFleetState: () => ({ workflowOrchestrator: { getWorkflowStatus: () => state.execution } }),
}));

import { handlePipelineStatus } from '../../../src/mcp/handlers/pipeline-handlers.js';
import { MCPProtocolServer } from '../../../src/mcp/protocol-server.js';

afterEach(() => { state.initialized = true; state.execution = null; });

describe('pipeline_status composition evidence', () => {
  it('is not session-cached so polling observes status changes', () => {
    const definition = new MCPProtocolServer().getToolDefinitions()
      .find(tool => tool.name === 'pipeline_status');
    expect(definition).toBeDefined();
    expect(definition?.isConcurrencySafe).not.toBe(true);
  });

  it('allows repeated status polling and observes the terminal result', async () => {
    const server = new MCPProtocolServer();
    const call = (server as unknown as {
      handleToolsCall(params: { name: string; arguments: { executionId: string } }): Promise<{
        content: Array<{ text: string }>; isError?: boolean;
      }>;
    }).handleToolsCall.bind(server);
    const observed: string[] = [];
    for (const status of ['running', 'running', 'completed']) {
      state.execution = {
        executionId: 'exec-1', workflowId: 'pipeline-1', status, progress: 0,
        completedSteps: [], failedSteps: [], skippedSteps: [], parallelCompositionReceipts: [],
      };
      const result = await call({ name: 'pipeline_status', arguments: { executionId: 'exec-1' } });
      expect(result.isError).not.toBe(true);
      const parsed = JSON.parse(result.content[0].text) as { data: { status: string } };
      observed.push(parsed.data.status);
    }
    expect(observed).toEqual(['running', 'running', 'completed']);
  });

  it('exposes conflict receipts without publishing raw step output', async () => {
    state.execution = {
      executionId: 'exec-1', workflowId: 'pipeline-1', status: 'failed', progress: 0,
      error: 'parallel_output_conflict', completedSteps: [], failedSteps: [], skippedSteps: [],
      context: { results: { secret: 'do not echo' } },
      stepResults: new Map([['first', { output: 'do not echo' }]]),
      parallelCompositionReceipts: [{
        version: 1, workflowId: 'pipeline-1', workflowRevision: '1.0:hash',
        executionId: 'exec-1', groupId: 'first|second', steps: [],
        conflicts: [{ stepA: 'first', pathA: 'summary', stepB: 'second', pathB: 'summary', kind: 'exact' }],
        strategy: 'rejected', disposition: 'conflict',
      }],
    };

    const result = await handlePipelineStatus({ executionId: 'exec-1' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data?.parallelCompositionReceipts[0].disposition).toBe('conflict');
    expect(JSON.stringify(result.data)).not.toContain('do not echo');
    expect(result.data).not.toHaveProperty('context');
    expect(result.data).not.toHaveProperty('stepResults');
  });

  it('reports missing executions and unavailable fleet explicitly', async () => {
    expect((await handlePipelineStatus({ executionId: 'missing' })).success).toBe(false);
    state.initialized = false;
    expect((await handlePipelineStatus({ executionId: 'missing' })).success).toBe(false);
  });
});
