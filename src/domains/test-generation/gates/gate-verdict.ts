/**
 * #1355: one verdict for "is this generated test real?", shared by the CLI
 * (`aqe test generate`) and the MCP tool (`test_generate_enhanced`).
 *
 * `aqe test generate` keeps only tests the full quality gate passed
 * (partitionByQualityGate). test_generate_enhanced counts by the narrower
 * isUnexecutableScaffold, because the full gate misjudges non-JS tests.
 */
import { isJavaScriptFamily, type TestQualityGateResult } from './test-quality-gate.js';

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
 * fail it. A test is treated as scaffolding only when the generator labelled it
 * so, or when the TypeScript parser found it unexecutable (a syntax error, or
 * no executable assertion) in JavaScript/TypeScript code.
 *
 * @param analysedFile - the source file the test was generated from, with its
 *   real extension (the temp file for inline sourceCode).
 */
export function isUnexecutableScaffold(
  test: GateCheckedTest & { generationMode?: string },
  analysedFile: string | undefined,
): boolean {
  if (test.generationMode === 'scaffolding') return true;
  if (!analysedFile || !isJavaScriptFamily(analysedFile)) return false;
  return (test.qualityGateResult?.issues ?? []).some(
    issue => issue.type === 'syntax-error' || issue.type === 'no-assertions',
  );
}
