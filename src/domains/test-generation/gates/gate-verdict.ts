/**
 * #1355: one verdict for "is this generated test real?", shared by the CLI
 * (`aqe test generate`) and the MCP tool (`test_generate_enhanced`).
 *
 * A generated test counts only when the test quality gate passed it. A test
 * the gate did not pass (or never ran on) is scaffolding: a `test.skip` stub,
 * a file with no executable assertion, or one that never imports the source.
 */
import type { TestQualityGateResult } from './test-quality-gate.js';

export interface GateCheckedTest {
  sourceFile?: string;
  qualityGateResult?: Pick<TestQualityGateResult, 'passed'> & {
    issues?: Array<{ description?: string }>;
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
