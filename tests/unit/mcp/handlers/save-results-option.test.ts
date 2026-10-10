/**
 * #925: test_generate_enhanced (and every handler-factory domain tool) takes an
 * optional `saveResults` flag. Default true keeps writing the manifest/report;
 * false must reach the task executor so nothing is written, and the response
 * must say which of the two happened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readSaveResultsOption,
  describeSavedResults,
  RESULTS_DIR,
} from '../../../../src/mcp/handlers/save-results-option';
import { createDomainHandler, resetTaskExecutor } from '../../../../src/mcp/handlers/handler-factory';
import { testGenerateConfig } from '../../../../src/mcp/handlers/domain-handler-configs';
import * as coreHandlers from '../../../../src/mcp/handlers/core-handlers';
import * as taskRouter from '../../../../src/mcp/services/task-router';
import { createTaskExecutor } from '../../../../src/coordination/task-executor';

vi.mock('../../../../src/mcp/handlers/core-handlers', () => ({
  isFleetInitialized: vi.fn(),
  getFleetState: vi.fn(),
}));
vi.mock('../../../../src/mcp/services/task-router', () => ({ getTaskRouter: vi.fn() }));
vi.mock('../../../../src/coordination/task-executor', () => ({ createTaskExecutor: vi.fn() }));
vi.mock('../../../../src/learning/aqe-learning-engine', () => ({ createAQELearningEngine: vi.fn(() => null) }));

const SAVED = [
  '.agentic-qe/results/tests/2026-10-10T00-00-00_manifest.json',
  '.agentic-qe/results/tests/2026-10-10T00-00-00_report.md',
];

describe('readSaveResultsOption', () => {
  it('defaults to true when the option is absent', () => {
    expect(readSaveResultsOption({})).toBe(true);
    expect(readSaveResultsOption(undefined)).toBe(true);
  });

  it('returns the boolean the caller passed', () => {
    expect(readSaveResultsOption({ saveResults: true })).toBe(true);
    expect(readSaveResultsOption({ saveResults: false })).toBe(false);
  });

  it('rejects a non-boolean value instead of guessing', () => {
    expect(() => readSaveResultsOption({ saveResults: 'false' })).toThrow(/saveResults must be a boolean/);
    expect(() => readSaveResultsOption({ saveResults: 0 })).toThrow(/got number/);
  });
});

describe('describeSavedResults', () => {
  it('reports no files when the caller opted out', () => {
    expect(describeSavedResults(false, SAVED)).toEqual({
      resultsSaved: false,
      savedFiles: [],
      resultsNote: `saveResults was false: no files were written under ${RESULTS_DIR}.`,
    });
  });

  it('carries the saved paths when files were written', () => {
    const report = describeSavedResults(true, SAVED);
    expect(report.resultsSaved).toBe(true);
    expect(report.savedFiles).toEqual(SAVED);
    expect(report.resultsNote).toContain('Saved 2 result file(s)');
  });

  it('does not claim a save when the executor wrote nothing', () => {
    const report = describeSavedResults(true, undefined);
    expect(report.resultsSaved).toBe(false);
    expect(report.savedFiles).toEqual([]);
  });
});

describe('test_generate_enhanced handler with saveResults', () => {
  const queen = { submitTask: vi.fn(), getTaskStatus: vi.fn() };
  const executor = { execute: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    resetTaskExecutor();
    vi.mocked(coreHandlers.isFleetInitialized).mockReturnValue(true);
    vi.mocked(coreHandlers.getFleetState).mockReturnValue(
      { queen, kernel: { id: 'k' } } as unknown as ReturnType<typeof coreHandlers.getFleetState>
    );
    vi.mocked(taskRouter.getTaskRouter).mockResolvedValue(
      { routeTask: vi.fn().mockResolvedValue(null) } as unknown as Awaited<ReturnType<typeof taskRouter.getTaskRouter>>
    );
    vi.mocked(createTaskExecutor).mockReturnValue(executor as unknown as ReturnType<typeof createTaskExecutor>);
    queen.submitTask.mockResolvedValue({ success: true, value: 'task-925' });
    queen.getTaskStatus.mockReturnValue({ task: { id: 'task-925', type: 'generate-tests' } });
  });

  const handler = () => createDomainHandler(testGenerateConfig);
  const submittedPayload = () => queen.submitTask.mock.calls[0][0].payload as Record<string, unknown>;

  it('saveResults:false reaches the executor payload and the response says nothing was written', async () => {
    executor.execute.mockResolvedValue({ success: true, data: { testsGenerated: 1 }, duration: 5 });

    const result = await handler()({ sourceCode: 'export const a = 1;', saveResults: false });

    expect(submittedPayload().saveResults).toBe(false);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      resultsSaved: false,
      savedFiles: [],
      resultsNote: expect.stringContaining('no files were written'),
    });
  });

  it('default leaves the payload unflagged and returns the saved paths', async () => {
    executor.execute.mockResolvedValue({ success: true, data: { testsGenerated: 1 }, duration: 5, savedFiles: SAVED });

    const result = await handler()({ sourceCode: 'export const a = 1;' });

    expect(submittedPayload()).not.toHaveProperty('saveResults');
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ resultsSaved: true, savedFiles: SAVED });
  });

  it('a non-boolean saveResults fails before any task is submitted', async () => {
    const result = await handler()({ sourceCode: 'x', saveResults: 'no' as unknown as boolean });

    expect(result.success).toBe(false);
    expect(result.error).toContain('saveResults must be a boolean');
    expect(queen.submitTask).not.toHaveBeenCalled();
  });
});
