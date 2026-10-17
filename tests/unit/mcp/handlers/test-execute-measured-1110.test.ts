/**
 * #1110 — test_execute_parallel reports only measured values.
 *
 * No baseline efficiency/loadBalance, no synthetic `test_case_N` entries with
 * 100+10·i durations: per-test results come from the runner report or are
 * left out and named in `unmeasured`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// Load order as in production (domain-handlers → configs) to resolve the module cycle.
import '../../../../src/mcp/handlers/domain-handlers';
import { testExecuteConfig } from '../../../../src/mcp/handlers/domain-handler-configs';
import { MetricsCollector } from '../../../../src/mcp/metrics';
import { mergeTestCases, testCasesFromRunnerReport } from '../../../../src/domains/test-execution/services/runner-test-cases';

const map = (data: Record<string, unknown>) =>
  testExecuteConfig.mapToResult('t', { total: 4, passed: 2, failed: 1, skipped: 1, ...data }, 40, [], {} as never);

describe('#1110 test_execute_parallel output', () => {
  beforeEach(() => MetricsCollector.reset());
  afterEach(() => MetricsCollector.reset());

  it('omits worker and retry figures nothing measured, and lists them as unmeasured', () => {
    const result = map({});

    expect(result.workerStats).toEqual({ avgExecutionTime: 10 });
    expect(result.retryStats).toBeUndefined();
    expect(result.summary).not.toHaveProperty('parallelEfficiency');
    expect(result.unmeasured).toEqual(expect.arrayContaining([
      'workerStats.workersUsed', 'workerStats.efficiency', 'workerStats.loadBalance', 'retryStats', 'results',
    ]));
    expect(Object.keys(result.unmeasuredReasons ?? {})).toEqual(result.unmeasured);
  });

  it('never synthesizes per-test results from counts', () => {
    const result = map({});

    expect(result.results).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/test_case_\d/);
  });

  it('passes the runner-reported test cases through unchanged', () => {
    const testCases = [
      { name: 'math adds', file: '/p/tests/math.test.ts', status: 'passed', duration: 1.5 },
      { name: 'math slow', file: '/p/tests/math.test.ts', status: 'passed', duration: 121 },
      { name: 'math fails', file: '/p/tests/math.test.ts', status: 'failed', duration: 3 },
      { name: 'str skipped', file: '/p/tests/str.test.ts', status: 'skipped' },
    ];
    const result = map({ testCases });

    expect(result.results).toHaveLength(4);
    expect((result.results as Array<Record<string, unknown>>).map(({ id: _id, ...rest }) => rest)).toEqual(testCases);
    expect(result.results![3]).not.toHaveProperty('duration');
    expect(result.unmeasured).not.toContain('results');
  });

  it('reports collector figures once tasks were actually recorded', () => {
    MetricsCollector.startTask('task-1', 'worker-a');
    MetricsCollector.completeTask('task-1', true);
    const result = map({});

    expect(result.workerStats).toMatchObject({ workersUsed: 1, efficiency: 1, loadBalance: 1 });
    expect(result.retryStats).toEqual({ totalRetries: 0, successfulRetries: 0, maxRetriesReached: 0 });
    expect(result.summary).toMatchObject({ parallelEfficiency: 1 });
    expect(result.unmeasured).toEqual(['results']);
  });
});

describe('#1110 testCasesFromRunnerReport', () => {
  it('reads name, file, status and duration from Vitest/Jest assertion results', () => {
    const cases = testCasesFromRunnerReport({
      testResults: [
        { name: '/p/a.test.ts', assertionResults: [
          { status: 'passed', fullName: 'a works', title: 'works', duration: 2 },
          { status: 'failed', title: 'breaks', duration: null },
          { status: 'pending', fullName: 'a later' },
          { status: 'todo', fullName: 'a todo' },
        ] },
      ],
    }, 'fallback.ts');

    expect(cases).toEqual([
      { name: 'a works', file: '/p/a.test.ts', status: 'passed', duration: 2 },
      { name: 'breaks', file: '/p/a.test.ts', status: 'failed' },
      { name: 'a later', file: '/p/a.test.ts', status: 'skipped' },
      { name: 'a todo', file: '/p/a.test.ts', status: 'skipped' },
    ]);
  });

  it('returns undefined when the report lists no tests', () => {
    expect(testCasesFromRunnerReport({}, 'x')).toBeUndefined();
    expect(testCasesFromRunnerReport({ testResults: [{ assertionResults: [] }] }, 'x')).toBeUndefined();
  });
});

describe('#1110 mergeTestCases', () => {
  const passed = { name: 'a', file: 'a.ts', status: 'passed' as const };

  it('drops the list when any run with tests lacks per-test entries (e.g. mocha or a summary-line fallback)', () => {
    expect(mergeTestCases([{ total: 1, testCases: [passed] }, { total: 2 }])).toBeUndefined();
  });

  it('concatenates complete runs and ignores empty ones', () => {
    expect(mergeTestCases([{ total: 1, testCases: [passed] }, { total: 0 }, { total: 1, testCases: [passed] }]))
      .toEqual([passed, passed]);
  });
});
