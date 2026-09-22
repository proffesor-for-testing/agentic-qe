/** A runner or suite error is not an assertion result. */
export class TestRunnerExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestRunnerExecutionError';
  }
}

interface RunnerCounts {
  passed: number;
  failed: number;
  skipped: number;
}

interface RunnerReport {
  success?: boolean;
  numFailedTestSuites?: number;
  numRuntimeErrorTestSuites?: number;
  testResults?: Array<{
    status?: string;
    message?: string;
    assertionResults?: Array<{ status?: string }>;
  }>;
}

/**
 * Preserve ordinary assertion failures, but reject incomplete/failed execution
 * that assertion counts cannot represent. Process status is authoritative even
 * when a runner emits success=true (for example, Vitest unhandled rejections).
 */
export function getTestRunnerExecutionError(
  runner: string,
  files: string,
  exitCode: number | null,
  counts: RunnerCounts,
  output: string,
  report?: RunnerReport,
): TestRunnerExecutionError | undefined {
  const suites = report?.testResults ?? [];
  const suiteErrors = suites.filter(suite => suite.status === 'failed' && (
    // Jest also uses message for ordinary assertion failures; Vitest reserves
    // it for suite errors such as collection and afterAll failures.
    (runner === 'vitest' && suite.message)
    || !suite.assertionResults?.some(assertion => assertion.status === 'failed')
  ));
  let reason: string | undefined;

  if (exitCode === null) {
    reason = 'terminated without an exit code';
  } else if (counts.passed + counts.failed + counts.skipped === 0) {
    reason = 'reported zero tests';
  } else if (suiteErrors.length > 0 || (report?.numRuntimeErrorTestSuites ?? 0) > 0
    || ((report?.numFailedTestSuites ?? 0) > 0 && counts.failed === 0)) {
    reason = 'reported a suite execution error';
  } else if ((exitCode !== 0 || report?.success === false) && counts.failed === 0) {
    reason = 'failed without a failed assertion';
  }

  if (!reason) return undefined;
  const diagnostics = [
    ...suiteErrors.map(suite => suite.message).filter(Boolean),
    output.trim(),
  ].filter(Boolean).join('\n').slice(0, 4000);
  return new TestRunnerExecutionError(
    `${runner} ${reason} for ${files} (exit code ${exitCode ?? 'unknown'}).` +
    (diagnostics ? `\n${diagnostics}` : ''),
  );
}
