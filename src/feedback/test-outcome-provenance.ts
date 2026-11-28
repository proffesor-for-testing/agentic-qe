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
 * evidence.
 *
 * #1501: the post-command hook wrote its rows with generated_by
 * `cli-hook-post-command` and `passed` from the installed hook's constant
 * `--success true`: every test command "passed", whatever happened. Those
 * rows are not evidence either and are ignored the same way. post-command
 * now writes a row only for an observed `--outcome`, with generated_by
 * `cli-hook-post-command-observed`.
 */

import { LEGACY_HOOK_COMMAND_SOURCE } from '../learning/hook-outcome-provenance.js';

/** The generated_by of the never-run rows the MCP handler factory wrote. */
export const GENERATED_TEST_OUTCOME_SOURCE = 'qe-test-generation';

/** The domain those rows carried. */
export const GENERATED_TEST_OUTCOME_DOMAIN = 'test-generation';

/** SQL predicate (no parameters) selecting test_outcomes rows that are execution evidence. */
export const EXECUTED_TEST_OUTCOME_SQL =
  `(NOT (generated_by = '${GENERATED_TEST_OUTCOME_SOURCE}' AND domain = '${GENERATED_TEST_OUTCOME_DOMAIN}')` +
  ` AND COALESCE(generated_by, '') <> '${LEGACY_HOOK_COMMAND_SOURCE}')`;

/** JS form of {@link EXECUTED_TEST_OUTCOME_SQL}, for outcomes already in memory. */
export function isExecutedTestOutcome(outcome: { generatedBy?: string; domain?: string }): boolean {
  if (outcome.generatedBy === LEGACY_HOOK_COMMAND_SOURCE) return false;
  return !(outcome.generatedBy === GENERATED_TEST_OUTCOME_SOURCE && outcome.domain === GENERATED_TEST_OUTCOME_DOMAIN);
}
