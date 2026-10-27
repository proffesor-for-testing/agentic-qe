/**
 * #1228 (and #1146): `aqe task submit --wait` prints what a completed task returned,
 * and a result that is not, or only partly, measured is not reported as a clean run.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { TaskHandler, incompleteResultReasons } from '../../../src/cli/handlers/task-handler.js';
import { taskResultLines } from '../../../src/cli/utils/task-result.js';
import type { CLIContext } from '../../../src/cli/handlers/interfaces.js';

vi.mock('../../../src/cli/utils/progress.js', () => ({
  createTimedSpinner: () => ({ succeed: vi.fn(), fail: vi.fn(), spinner: { text: '' } }),
}));

/** A run-accessibility-audit result where one of two URLs was not measured. */
const partialAudit = {
  totalUrls: 2, passingUrls: 0, totalViolations: 1, criticalViolations: 0, averageScore: 96,
  reports: [], topIssues: [],
  status: 'partial', measuredUrls: 1,
  notMeasured: [{ url: 'https://example.invalid/', reason: 'net::ERR_NAME_NOT_RESOLVED' }],
  message: 'Accessibility NOT MEASURED for 1 of 2 URL(s); https://example.invalid/: net::ERR_NAME_NOT_RESOLVED',
};

describe('task submit --wait prints the task result (#1228)', () => {
  const cleanup = vi.fn(async (_code: number) => undefined as never);
  const getTaskStatus = vi.fn();
  let logged: string[];
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    logged = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    program = new Command();
    new TaskHandler(cleanup, vi.fn(async () => true)).register(program, {
      queen: {
        submitTask: vi.fn().mockResolvedValue({ success: true, value: 'task-1' }),
        getTaskStatus,
        cancelTask: vi.fn(),
        validateTaskExecutable: vi.fn().mockReturnValue({ success: true, value: undefined }),
      },
    } as unknown as CLIContext);
  });
  afterEach(() => vi.restoreAllMocks());

  const submit = (type: string) =>
    program.parseAsync(['node', 'aqe', 'task', 'submit', type, '--wait', '--timeout', '1000', '--no-progress']);

  it('prints status, not-measured URLs and message of a partly measured audit, and exits nonzero', async () => {
    getTaskStatus.mockReturnValue({ status: 'completed', result: partialAudit });

    await submit('run-accessibility-audit');

    const out = logged.join('\n');
    expect(out).toContain('status: partial');
    expect(out).toContain('message: Accessibility NOT MEASURED for 1 of 2 URL(s)');
    expect(out).toContain('"url": "https://example.invalid/"');
    expect(cleanup).toHaveBeenCalledWith(1);
  });

  it('prints the result of any completed task type', async () => {
    getTaskStatus.mockReturnValue({ status: 'completed', result: { tests: [{ name: 'adds numbers' }] } });

    await submit('generate-tests');

    expect(logged.join('\n')).toContain('"name": "adds numbers"');
    expect(cleanup).not.toHaveBeenCalledWith(1);
  });
});

describe('incompleteResultReasons treats unmeasured results as incomplete (#1228)', () => {
  it.each([
    [partialAudit, 'NOT MEASURED for 1 of 2'],
    [{ status: 'not-measured', message: 'Accessibility NOT MEASURED for 1 of 1 URL(s)' }, 'NOT MEASURED for 1 of 1'],
    [{ status: 'partial' }, 'result status is partial'],
  ])('%j', (result, reason) => {
    expect(incompleteResultReasons(result).join(' ')).toContain(reason);
  });

  it('does not flag a measured result', () => {
    expect(incompleteResultReasons({ status: 'measured', measuredUrls: 1, notMeasured: [] })).toEqual([]);
  });

  it('does not flag analyze-coverage of caller-supplied data, which it marks measured: false', () => {
    // analyze-coverage analyzed the numbers it was given; measured: false only
    // means they were not instrumented by AQE and are not stored as evidence (#1008).
    expect(incompleteResultReasons({ measured: false, summary: { line: 80 }, gaps: [] })).toEqual([]);
  });
});

describe('taskResultLines', () => {
  it('cuts a long result and says how to get all of it', () => {
    const lines = taskResultLines({ items: Array.from({ length: 50 }, (_, i) => i) }, 10);

    expect(lines.filter((l) => l.startsWith('  '))).toHaveLength(11);
    expect(lines.at(-1)).toMatch(/more line\(s\); --output <file> writes the full result/);
  });

  it('says when a task returned no result', () => {
    expect(taskResultLines(undefined)).toEqual(['Result: none (the task returned no result)']);
  });
});
