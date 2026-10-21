import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { createFleetCommand } from '../../../src/cli/commands/fleet.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

const progress = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), addAgent: vi.fn(), updateAgent: vi.fn(), completeAgent: vi.fn() }));
vi.mock('../../../src/cli/utils/progress.js', () => ({
  FleetProgressManager: class { constructor() { return progress; } },
  createTimedSpinner: vi.fn(),
}));

// #1125: the operation's domain task and payload come from the target on disk.
const plan = vi.hoisted(() => vi.fn());
vi.mock('../../../src/cli/utils/fleet-operation.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/cli/utils/fleet-operation.js')>(),
  planFleetOperation: plan,
}));

const cleanScan = {
  vulnerabilities: [], summary: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
  coverage: { filesScanned: 1 }, evidence: { completeness: 'complete' },
};
const passingTests = { tests: [{ name: 't', testFile: 'a.test.ts', assertions: 2, generationMode: 'behavior-examples', qualityGateResult: { passed: true } }] };

describe('fleet run execution verdicts', () => {
  const cleanup = vi.fn(async (_code: number) => undefined as never);
  const ensure = vi.fn(async () => true);
  const submitTask = vi.fn();
  const getTaskStatus = vi.fn();
  const validateTaskExecutable = vi.fn();
  let program: Command;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ensure.mockResolvedValue(true);
    submitTask.mockResolvedValue({ success: true, value: 'task-1' });
    getTaskStatus.mockReturnValue({ status: 'completed', result: passingTests });
    validateTaskExecutable.mockReturnValue({ success: true, value: undefined });
    plan.mockResolvedValue({ success: true, task: { domain: 'test-generation', type: 'generate-tests', payload: { sourceFiles: ['src/a.ts'] } } });
    program = new Command().addCommand(createFleetCommand(
      { queen: { submitTask, getTaskStatus, validateTaskExecutable } } as unknown as CLIContext,
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
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Completed: 0'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Verdict: FAILED (1 of 1 workers did not complete)'));
  });

  it('waits for a running task to actually finish', async () => {
    getTaskStatus.mockReturnValue({ status: 'running' });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'test', '--parallel', '1']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(cleanup).not.toHaveBeenCalled();
    expect(progress.completeAgent).not.toHaveBeenCalled();
    getTaskStatus.mockReturnValue({ status: 'completed', result: passingTests });
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

  // #1081: an operation whose task no domain plugin executes is refused
  // before anything is submitted.
  it('refuses an operation whose task type no domain executes, before submitting anything', async () => {
    plan.mockResolvedValue({ success: true, task: { domain: 'security-compliance', type: 'sast-scan', payload: { files: ['src/a.ts'] } } });
    validateTaskExecutable.mockReturnValue({
      success: false,
      error: new Error("No handler for task type 'sast-scan' in domain security-compliance (domain not loaded)"),
    });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'scan', '--parallel', '3']);
    await vi.advanceTimersByTimeAsync(65000);
    await execution;
    expect(validateTaskExecutable).toHaveBeenCalledWith('sast-scan', ['security-compliance']);
    expect(submitTask).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("No handler for task type 'sast-scan'"));
  });

  // #1125: the domain task runs with the payload its handler needs.
  it('submits the planned domain task with its payload to every worker', async () => {
    plan.mockResolvedValue({ success: true, task: { domain: 'security-compliance', type: 'sast-scan', payload: { files: ['src/a.ts'] } } });
    getTaskStatus.mockReturnValue({ status: 'completed', result: cleanScan });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'scan', '--target', 'src', '--parallel', '2']);
    await vi.advanceTimersByTimeAsync(1000);
    await execution;
    expect(plan).toHaveBeenCalledWith('scan', 'src');
    expect(submitTask).toHaveBeenCalledTimes(2);
    expect(submitTask).toHaveBeenCalledWith(expect.objectContaining({
      type: 'sast-scan', targetDomains: ['security-compliance'],
      payload: expect.objectContaining({ files: ['src/a.ts'], target: 'src' }),
    }));
    expect(cleanup).toHaveBeenCalledWith(0);
  });

  // #1125: without the input the handler needs, nothing is submitted.
  it('refuses an operation whose target cannot supply the handler input', async () => {
    plan.mockResolvedValue({ success: false, error: 'No coverage report for project /p, so there is no coverage to analyze.' });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'analyze', '--parallel', '1']);
    await vi.advanceTimersByTimeAsync(65000);
    await execution;
    expect(submitTask).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Operation 'analyze' cannot run: No coverage report"));
  });

  // #1125 review: a completed task is not a passed check.
  it('fails a scan that completed with a critical finding, and lists it', async () => {
    plan.mockResolvedValue({ success: true, task: { domain: 'security-compliance', type: 'sast-scan', payload: { files: ['src/a.js'] } } });
    getTaskStatus.mockReturnValue({ status: 'completed', result: {
      ...cleanScan,
      vulnerabilities: [{ severity: 'critical', title: 'Code Injection via eval()', location: { file: 'src/a.js', line: 2 } }],
      summary: { ...cleanScan.summary, critical: 1 },
    } });
    const execution = program.parseAsync(['node', 'aqe', 'fleet', 'run', 'scan', '--parallel', '2']);
    await vi.advanceTimersByTimeAsync(1000);
    await execution;
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Findings: critical 1, high 0'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[critical] Code Injection via eval() @ src/a.js:2'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Verdict: FAILED (1 critical and 0 high findings)'));
    expect(cleanup).toHaveBeenCalledWith(1);
    // #1168: the completion line must not call a failed verdict a success.
    expect(progress.stop).toHaveBeenCalledWith({ verdictFailed: true });
  });

  it('fails generated tests that failed the test quality gate', async () => {
    getTaskStatus.mockReturnValue({ status: 'completed', result: { tests: [
      { name: 't', testFile: 'a.test.ts', assertions: 0, generationMode: 'scaffolding', qualityGateResult: { passed: false } },
    ] } });
    await run();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Tests generated: 1, assertions: 0, generation mode: scaffolding'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Quality gate: failed for 1 of 1 tests'));
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it('passes a completed operation whose result passes, and says so', async () => {
    await run();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Quality gate: passed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Verdict: PASSED'));
    expect(cleanup).toHaveBeenCalledWith(0);
    expect(progress.stop).toHaveBeenCalledWith({ verdictFailed: false });
  });

  it('retains rejection and completion verdicts', async () => {
    submitTask.mockResolvedValue({ success: false, error: new Error('rejected') });
    await run();
    expect(cleanup).toHaveBeenCalledWith(1);
    expect(getTaskStatus).not.toHaveBeenCalled();
  });
});
