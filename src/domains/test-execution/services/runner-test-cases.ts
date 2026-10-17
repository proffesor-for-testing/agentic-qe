/**
 * #1110: per-test results read from a Vitest/Jest JSON report.
 *
 * Both runners emit `testResults[].assertionResults[]`. Each entry becomes one
 * test case with the runner's own name, status and duration; nothing is
 * derived from aggregate counts.
 */

import type { ITestCaseResult } from '../interfaces';

const SKIPPED_STATUSES = new Set(['skipped', 'pending', 'todo']);

interface RunnerAssertion {
  status?: unknown;
  fullName?: unknown;
  title?: unknown;
  duration?: unknown;
}

interface RunnerFileResult {
  name?: unknown;
  assertionResults?: RunnerAssertion[];
}

function toStatus(status: unknown): ITestCaseResult['status'] | undefined {
  if (status === 'passed' || status === 'failed') return status;
  return typeof status === 'string' && SKIPPED_STATUSES.has(status) ? 'skipped' : undefined;
}

/**
 * Test cases listed in a runner JSON report, or undefined when the report
 * has no per-test entries.
 */
export function testCasesFromRunnerReport(
  report: { testResults?: unknown },
  fallbackFile: string
): ITestCaseResult[] | undefined {
  if (!Array.isArray(report.testResults)) return undefined;
  const cases: ITestCaseResult[] = [];
  for (const fileResult of report.testResults as RunnerFileResult[]) {
    const file = typeof fileResult?.name === 'string' ? fileResult.name : fallbackFile;
    for (const assertion of fileResult?.assertionResults ?? []) {
      const status = toStatus(assertion.status);
      if (!status) continue;
      const name = typeof assertion.fullName === 'string' && assertion.fullName
        ? assertion.fullName
        : typeof assertion.title === 'string' ? assertion.title : '';
      if (!name) continue;
      const duration = typeof assertion.duration === 'number' && Number.isFinite(assertion.duration)
        ? assertion.duration
        : undefined;
      cases.push({ name, file, status, ...(duration !== undefined ? { duration } : {}) });
    }
  }
  return cases.length > 0 ? cases : undefined;
}

/** Concatenate per-run test cases; undefined unless every run listed its tests. */
export function mergeTestCases(
  runs: ReadonlyArray<{ testCases?: ITestCaseResult[]; total: number }>
): ITestCaseResult[] | undefined {
  if (runs.length === 0 || runs.some(run => run.total > 0 && !run.testCases)) return undefined;
  const merged = runs.flatMap(run => run.testCases ?? []);
  return merged.length > 0 ? merged : undefined;
}
