import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createFleetCommand } from '../../../src/cli/commands/fleet.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

const progress = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), addAgent: vi.fn(), updateAgent: vi.fn(), completeAgent: vi.fn() }));
vi.mock('../../../src/cli/utils/progress.js', () => ({
  FleetProgressManager: class { constructor() { return progress; } },
  createTimedSpinner: vi.fn(),
}));

describe('fleet run execution verdicts', () => {
  const cleanup = vi.fn(async (_code: number) => undefined as never);
  const ensure = vi.fn(async () => true);
  const submitTask = vi.fn();
  const getTaskStatus = vi.fn();
  let program: Command;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensure.mockResolvedValue(true);
    submitTask.mockResolvedValue({ success: true, value: 'task-1' });
    getTaskStatus.mockReturnValue({ status: 'completed' });
    program = new Command().addCommand(createFleetCommand(
      { queen: { submitTask, getTaskStatus } } as unknown as CLIContext,
      cleanup, ensure, () => {},
    ));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function run() {
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'test', '--parallel', '1']);
    await vi.advanceTimersByTimeAsync(65000);
    await execution;
  }

  it.each(['failed', 'cancelled'])('does not count an accepted but %s task as successful', async status => {
    getTaskStatus.mockReturnValue({ status, error: 'domain execution failed' });
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(progress.completeAgent).toHaveBeenCalledWith('test-agent-1', false);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successful: 0'));
  });

  it('waits for a running task to actually finish', async () => {
    getTaskStatus.mockReturnValue({ status: 'running' });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'test', '--parallel', '1']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(cleanup).not.toHaveBeenCalled();
    expect(progress.completeAgent).not.toHaveBeenCalled();
    getTaskStatus.mockReturnValue({ status: 'completed' });
    await vi.advanceTimersByTimeAsync(500);
    await execution;
    expect(cleanup).toHaveBeenCalledWith(0);
    expect(progress.completeAgent).toHaveBeenCalledWith('test-agent-1', true);
  });

  it('does not count an indefinitely running task as successful', async () => {
    getTaskStatus.mockReturnValue({ status: 'running' });
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(progress.completeAgent).toHaveBeenCalledWith('test-agent-1', false);
  });

  it('does not count an unavailable task as successful', async () => {
    getTaskStatus.mockReturnValue(undefined);
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it.each([['unknown', '1'], ['test', '0'], ['test', '-1'], ['test', '1.5'], ['test', 'NaN']])('rejects operation %s with parallel count %s before submitting', async (operation, count) => {
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', operation, '--parallel', count]);
    await vi.advanceTimersByTimeAsync(65000);
    await execution;
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(submitTask).not.toHaveBeenCalled();
  });

  it('returns failure when initialization is unavailable', async () => {
    ensure.mockResolvedValue(false);
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(submitTask).not.toHaveBeenCalled();
  });

  it('retains rejection and completion verdicts', async () => {
    submitTask.mockResolvedValue({ success: false, error: new Error('rejected') });
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(getTaskStatus).not.toHaveBeenCalled();
  });
});
