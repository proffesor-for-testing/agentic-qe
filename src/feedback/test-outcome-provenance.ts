/**
 * Agentic QE v3 - Provenance of test_outcomes rows (#1374)
 *
 * Up to #1372 the MCP handler factory wrote a test_outcomes row for every
 * GENERATED test (generated_by `qe-test-generation`), with `passed = 1`
 * although the test had never run. Those rows are not execution evidence.
 *
 * Readers ignore them instead of deleting them (no data is destroyed; they
 * age out of the readers' 7-day windows and the tracker's retention). Rows of
 * other writers (e.g. the post-command hook, `cli-hook-post-command`, which
 * records a real test command's result) are unaffected.
 */

/** The generated_by of the never-run rows the MCP handler factory wrote. */
export const GENERATED_TEST_OUTCOME_SOURCE = 'qe-test-generation';

/** SQL predicate (no parameters) selecting test_outcomes rows from executed tests. */
export const EXECUTED_TEST_OUTCOME_SQL = `generated_by != '${GENERATED_TEST_OUTCOME_SOURCE}'`;
