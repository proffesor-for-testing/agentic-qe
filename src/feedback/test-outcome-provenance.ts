/**
 * Agentic QE v3 - Provenance of test_outcomes rows (#1374)
 *
 * Up to #1372 the MCP handler factory wrote a test_outcomes row for every
 * GENERATED test, with generated_by `qe-test-generation`, domain
 * `test-generation` and `passed = 1`, although the test had never run.
 * Those rows are not execution evidence.
 *
 * Readers ignore them; this change deletes no rows (data protection). They
 * drop out of the gate's 7-day window by age and stay in the table.
 * Only that exact pair is ignored: a row with generated_by
 * `qe-test-generation` in another domain (a real run of an AQE-generated
 * test, recorded by a writer that keeps the generator as its author) is
 * evidence. Rows of other writers (e.g. the post-command hook,
 * `cli-hook-post-command`) are unaffected.
 */

/** The generated_by of the never-run rows the MCP handler factory wrote. */
export const GENERATED_TEST_OUTCOME_SOURCE = 'qe-test-generation';

/** The domain those rows carried. */
export const GENERATED_TEST_OUTCOME_DOMAIN = 'test-generation';

/** SQL predicate (no parameters) selecting test_outcomes rows that are execution evidence. */
export const EXECUTED_TEST_OUTCOME_SQL =
  `NOT (generated_by = '${GENERATED_TEST_OUTCOME_SOURCE}' AND domain = '${GENERATED_TEST_OUTCOME_DOMAIN}')`;

/** JS form of {@link EXECUTED_TEST_OUTCOME_SQL}, for outcomes already in memory. */
export function isExecutedTestOutcome(outcome: { generatedBy?: string; domain?: string }): boolean {
  return !(outcome.generatedBy === GENERATED_TEST_OUTCOME_SOURCE && outcome.domain === GENERATED_TEST_OUTCOME_DOMAIN);
}
