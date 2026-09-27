import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';

vi.mock('../../../../src/cli/utils/workflow-parser.js', () => ({
  parsePipelineFile: () => ({
    success: true, errors: [],
    workflow: { id: 'example', name: 'Example', description: '', version: '1', steps: [{}] },
  }),
  validatePipeline: vi.fn(),
  describeCronSchedule: vi.fn(),
}));

import { createPipelineCommand } from '../../../../src/cli/commands/pipeline.js';
import { createWorkflowCommand } from '../../../../src/cli/commands/workflow.js';

afterEach(() => vi.restoreAllMocks());

describe('waited workflow command exit status', () => {
  it.each(['failed', 'cancelled'] as const)('pipeline run --wait exits unsuccessfully on %s', async status => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const exit = vi.fn(async () => undefined) as unknown as (code: number) => Promise<never>;
    const context = {
      workflowOrchestrator: {
        executeWorkflow: async () => ({ success: true, value: 'execution-1' }),
        getWorkflowStatus: () => ({ status, completedSteps: [], failedSteps: [], skippedSteps: [] }),
      },
    } as unknown as CLIContext;
    await createPipelineCommand(context, exit, async () => true).parseAsync(
      ['run', 'example', '--wait'], { from: 'user' },
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('workflow run --watch exits unsuccessfully when the run fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.fn(async () => undefined) as unknown as (code: number) => Promise<never>;
    const context = {
      workflowOrchestrator: {
        getWorkflow: () => ({}),
        executeWorkflow: async () => ({ success: true, value: 'execution-1' }),
        getWorkflowStatus: () => ({
          status: 'failed', progress: 0, currentSteps: [], completedSteps: [],
          failedSteps: ['first'], skippedSteps: [], error: 'parallel_output_conflict',
          startedAt: new Date(),
        }),
      },
    } as unknown as CLIContext;
    await createWorkflowCommand(context, exit, async () => true).parseAsync(
      ['run', 'example.yaml', '--watch'], { from: 'user' },
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
