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
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensure.mockResolvedValue(true);
    submitTask.mockResolvedValue({ success: true, value: 'task-1' });
    getTaskStatus.mockReturnValue({ status: 'completed' });
    program = new Command();
    new TaskHandler(cleanup, ensure).register(program, {
      queen: { submitTask, getTaskStatus, cancelTask },
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
