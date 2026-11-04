/**
 * #1355: one verdict for "is this generated test real?", shared by the CLI
 * (`aqe test generate`) and the MCP tool (`test_generate_enhanced`).
 *
 * `aqe test generate` keeps only tests the full quality gate passed
 * (partitionByQualityGate). test_generate_enhanced counts by the narrower
 * isUnexecutableScaffold, because the full gate misjudges non-JS tests.
 */
import { isJavaScriptFamily, type TestQualityGateResult } from './test-quality-gate.js';
import { unexecutableTestReason } from './test-substance.js';

export interface GateCheckedTest {
  sourceFile?: string;
  qualityGateResult?: Pick<TestQualityGateResult, 'passed'> & {
    issues?: Array<{ type?: string; description?: string }>;
  };
}

/** True only when the test quality gate ran and passed this test. */
export function passedQualityGate(test: GateCheckedTest): boolean {
  return test.qualityGateResult?.passed === true;
}

/** Split generated tests into gate-passed tests and rejected scaffolding. */
export function partitionByQualityGate<T extends GateCheckedTest>(tests: readonly T[]): {
  passed: T[];
  rejected: T[];
} {
  const passed: T[] = [];
  const rejected: T[] = [];
  for (const test of tests) (passedQualityGate(test) ? passed : rejected).push(test);
  return { passed, rejected };
}

/** The gate's reasons for rejecting a test, joined for display. */
export function describeGateRejection(test: GateCheckedTest): string {
  return test.qualityGateResult?.issues
    ?.map(issue => issue.description)
    .filter(Boolean)
    .join('; ') || 'missing passing quality evidence';
}

/**
 * #1355: the narrower verdict test_generate_enhanced counts by. The full gate
 * cannot judge every language: its assertion check for non-JS code is a regex
 * and its import check reads only quoted ES/CJS specifiers, so valid pytest,
 * Go and JUnit tests, and TS tests importing a path alias or a directory index,
 * fail it. The import check is never used here (#1371).
 *
 * Returns why the test cannot fail, or undefined to keep it:
 * - the generator labelled it scaffolding;
 * - JS/TS the TypeScript parser found unexecutable (syntax error, no
 *   executable assertion);
 * - no test that can fail (unexecutableTestReason: all skipped, empty or
 *   tautological in JS/TS; no assertion token or all skipped elsewhere).
 *
 * @param analysedFile - the source file the test was generated from, with its
 *   real extension (the temp file for inline sourceCode).
 */
export function unexecutableReason(
  test: GateCheckedTest & { generationMode?: string; testCode?: string },
  analysedFile: string | undefined,
): string | undefined {
  const parserIssues = analysedFile && isJavaScriptFamily(analysedFile)
    ? (test.qualityGateResult?.issues ?? []).filter(i => i.type === 'syntax-error' || i.type === 'no-assertions')
    : [];
  if (parserIssues.length > 0) return describeGateRejection({ qualityGateResult: { passed: false, issues: parserIssues } });
  const reason = unexecutableTestReason(test.testCode, analysedFile);
  if (reason) return reason;
  if (test.generationMode === 'scaffolding') return 'The generator produced scaffolding only.';
  return undefined;
}

/** True when unexecutableReason finds no test that can fail. */
export function isUnexecutableScaffold(
  test: GateCheckedTest & { generationMode?: string; testCode?: string },
  analysedFile: string | undefined,
): boolean {
  return unexecutableReason(test, analysedFile) !== undefined;
}
