import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { TaskHandler } from '../../../src/cli/handlers/task-handler.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

vi.mock('../../../src/cli/utils/progress.js', () => ({
  createTimedSpinner: () => ({ succeed: vi.fn(), fail: vi.fn(), spinner: { text: '' } }),
}));

describe('task CLI failure exit codes (#734)', () => {
  const cleanup = vi.fn(async (_code: number) => undefined as never);
  const ensure = vi.fn(async () => true);
  const submitTask = vi.fn();
  const getTaskStatus = vi.fn();
  const cancelTask = vi.fn();
  const validateTaskExecutable = vi.fn();
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensure.mockResolvedValue(true);
    submitTask.mockResolvedValue({ success: true, value: 'task-1' });
    getTaskStatus.mockReturnValue({ status: 'completed' });
    validateTaskExecutable.mockReturnValue({ success: true, value: undefined });
    program = new Command();
    new TaskHandler(cleanup, ensure).register(program, {
      queen: { submitTask, getTaskStatus, cancelTask, validateTaskExecutable },
    } as unknown as CLIContext);
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const run = (...args: string[]) => program.parseAsync(['node', 'aqe', 'task', ...args]);

  it.each(['failed', 'cancelled'])('exits nonzero for a %s task with --wait', async status => {
    getTaskStatus.mockReturnValue({ status, error: 'runner failed' });
    vi.useFakeTimers();
    const execution = run('submit', 'execute-tests', '--wait', '--timeout', '1000', '--no-progress');
    await vi.advanceTimersByTimeAsync(1000);
    await execution;
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  // #1135, #1052: a completed task whose result is incomplete or failed is not a clean run.
  it.each([
    [{ status: 'incomplete', error: '1 DAST request(s) were not answered (DAST_REQUEST_FAILED)' }, 'DAST_REQUEST_FAILED'],
    [{ status: 'failed', error: 'DAST_RATE_LIMITED: DAST rate limited (HTTP 429)' }, 'DAST_RATE_LIMITED'],
    [{ recommendations: [], incompleteChecks: ['DAST scan failed: DAST_TLS_FAILED'] }, 'DAST_TLS_FAILED'],
  ])('exits nonzero for a completed task whose result is not complete (%j)', async (result, reason) => {
    getTaskStatus.mockReturnValue({ status: 'completed', result });
    await run('submit', 'dast-scan', '--wait', '--timeout', '1000', '--no-progress');
    expect(cleanup).toHaveBeenCalledWith(1);
    const { incompleteResultReasons } = await import('../../../src/cli/handlers/task-handler.js');
    expect(incompleteResultReasons(result).join(' ')).toContain(reason);
  });

  it('does not fail a completed task whose result is complete', async () => {
    getTaskStatus.mockReturnValue({ status: 'completed', result: { status: 'complete', failedRequests: [] } });
    await run('submit', 'dast-scan', '--wait', '--timeout', '1000', '--no-progress');
    expect(cleanup).not.toHaveBeenCalledWith(1);
  });

  it('exits nonzero when a running task exceeds --timeout', async () => {
    getTaskStatus.mockReturnValue({ status: 'running' });
    vi.useFakeTimers();
    const execution = run('submit', 'execute-tests', '--wait', '--timeout', '1000', '--no-progress');
    await vi.advanceTimersByTimeAsync(1000);
    await execution;
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it('exits nonzero for rejected submissions', async () => {
    submitTask.mockResolvedValue({ success: false, error: new Error('No capacity') });
    await run('submit', 'execute-tests', '--wait', '--no-progress');
    expect(submitTask).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  // #1075: a type no domain plugin executes would sit in `running` until the
  // --timeout expired. It must be rejected before a task is submitted.
  it('rejects a task type no domain executes before submitting it', async () => {
    const errors = vi.mocked(console.error);
    validateTaskExecutable.mockReturnValue({
      success: false,
      error: new Error("No handler for task type 'index-code' in domain code-intelligence (supported: index)"),
    });
    await run('submit', 'index-code', '--wait', '--no-progress');
    expect(validateTaskExecutable).toHaveBeenCalledWith('index-code', []);
    expect(submitTask).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(errors.mock.calls.flat().join('\n')).toContain("No handler for task type 'index-code'");
  });

  it('exits nonzero when task status is not found', async () => {
    getTaskStatus.mockReturnValue(undefined);
    await run('status', 'unknown');
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it('exits nonzero when initialization fails', async () => {
    ensure.mockResolvedValue(false);
    await run('submit', 'execute-tests', '--wait');
    expect(ensure).toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(submitTask).not.toHaveBeenCalled();
  });

  it('retains a successful exit for completed work', async () => {
    await run('submit', 'execute-tests', '--wait', '--no-progress');
    expect(cleanup).not.toHaveBeenCalledWith(1);
  });

  // #734 D: an unknown --domain must be rejected before any work is accepted.
  it('rejects an unknown --domain with a nonzero exit and lists valid domains', async () => {
    const errors = vi.mocked(console.error);
    await run('submit', 'analyze-coverage', '--domain', 'no-such-domain', '--wait', '--no-progress');
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(ensure).not.toHaveBeenCalled();
    expect(submitTask).not.toHaveBeenCalled();
    const text = errors.mock.calls.flat().join('\n');
    expect(text).toContain('Unknown domain: no-such-domain');
    expect(text).toContain('coverage-analysis');
  });

  it('passes a known --domain through to the coordinator', async () => {
    await run('submit', 'analyze-coverage', '--domain', 'coverage-analysis', '--wait', '--no-progress');
    expect(submitTask).toHaveBeenCalledWith(expect.objectContaining({ targetDomains: ['coverage-analysis'] }));
    expect(cleanup).not.toHaveBeenCalledWith(1);
  });

  // #734 C: CLI tasks live only in this process, so a detached submit would
  // print an ID for work abandoned on exit. It must fail instead of succeed.
  it('refuses a detached submit (no --wait) with a nonzero exit and no submission', async () => {
    const errors = vi.mocked(console.error);
    await run('submit', 'analyze-coverage', '--domain', 'coverage-analysis', '--no-progress');
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(ensure).not.toHaveBeenCalled();
    expect(submitTask).not.toHaveBeenCalled();
    const text = errors.mock.calls.flat().join('\n');
    expect(text).toContain('not persisted');
    expect(text).toContain('--wait');
  });
});
