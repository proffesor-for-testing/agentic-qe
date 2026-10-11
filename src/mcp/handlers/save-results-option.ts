/**
 * Agentic QE v3 - saveResults option (#925)
 *
 * Domain tools that run through the handler factory persist their output via
 * the task executor's ResultSaver (.agentic-qe/results/<kind>/...). This module
 * holds the boundary validation for the per-call `saveResults` opt-out and the
 * wording the tools report back, so every tool states the same thing.
 *
 * @module mcp/handlers/save-results-option
 */

import type { ToolParameter } from '../types';

/** Directory (relative to the project) that ResultSaver writes under. */
export const RESULTS_DIR = '.agentic-qe/results/';

/**
 * Every MCP tool whose handler is built by createDomainHandler, and so writes
 * through ResultSaver (#933): what it saves, and the verb for "Set false to
 * <verb> without writing...". Subdirectories match ResultSaver.save().
 */
export const RESULT_SAVING_TOOLS = {
  test_generate_enhanced: { saves: 'a manifest and report under .agentic-qe/results/tests/', verb: 'generate' },
  test_execute_parallel: { saves: 'the run results under .agentic-qe/results/other/', verb: 'run the tests' },
  coverage_analyze_sublinear: { saves: 'coverage results and a report under .agentic-qe/results/coverage/', verb: 'analyze' },
  quality_assess: { saves: 'an assessment and report under .agentic-qe/results/quality/', verb: 'assess' },
  security_scan_comprehensive: { saves: 'scan results and a report under .agentic-qe/results/security/', verb: 'scan' },
  contract_validate: { saves: 'the validation results under .agentic-qe/results/contracts/', verb: 'validate' },
  accessibility_test: { saves: 'the test results under .agentic-qe/results/accessibility/', verb: 'test' },
  chaos_test: { saves: 'the chaos run results under .agentic-qe/results/chaos/', verb: 'run' },
  defect_predict: { saves: 'the prediction under .agentic-qe/results/defects/', verb: 'predict' },
  requirements_validate: { saves: 'the validation results under .agentic-qe/results/other/', verb: 'validate' },
  code_index: { saves: 'the index results under .agentic-qe/results/code-index/', verb: 'index' },
} as const satisfies Record<string, { saves: string; verb: string }>;

export type ResultSavingTool = keyof typeof RESULT_SAVING_TOOLS;

/**
 * Short hint a result-saving tool adds to its top-level description. Tool
 * descriptions are kept short for clients that truncate them (OpenCode shows
 * about 200 characters), so the full explanation lives in the `saveResults`
 * parameter description instead.
 */
export const SAVE_RESULTS_HINT = 'Saves results (saveResults).';

/** The `saveResults` input parameter, worded the same for every tool. */
export function saveResultsParameter(tool: ResultSavingTool): ToolParameter {
  const { saves, verb } = RESULT_SAVING_TOOLS[tool];
  return {
    name: 'saveResults',
    type: 'boolean',
    description: `Save ${saves} (default true). Set false to ${verb} without writing any files under ${RESULTS_DIR}. The server state store (.agentic-qe/memory.db) is updated either way.`,
    default: true,
  };
}

/**
 * Read and validate the optional `saveResults` parameter.
 *
 * @returns true when results should be saved (the default), false to opt out.
 * @throws Error when the parameter is present but not a boolean.
 */
export function readSaveResultsOption(params: unknown): boolean {
  if (params === null || typeof params !== 'object') return true;
  const value = (params as { saveResults?: unknown }).saveResults;
  // Some clients send null for an omitted optional; treat it as unset.
  if (value === undefined || value === null) return true;
  if (typeof value !== 'boolean') {
    throw new Error(
      `saveResults must be a boolean (true or false), got ${typeof value}.`
    );
  }
  return value;
}

export interface SavedResultsReport {
  /** True when at least one result file was written. */
  resultsSaved: boolean;
  /** Paths of the files written; empty when nothing was written. */
  savedFiles: string[];
  /** Plain statement of what was written, for the caller to relay. */
  resultsNote: string;
}

/**
 * Describe what the result saver did for one call.
 *
 * @param saveResults - the validated option value
 * @param savedFiles - paths the task executor reported as written
 */
export function describeSavedResults(
  saveResults: boolean,
  savedFiles: string[] | undefined
): SavedResultsReport {
  if (!saveResults) {
    return {
      resultsSaved: false,
      savedFiles: [],
      resultsNote: `saveResults was false: no files were written under ${RESULTS_DIR}.`,
    };
  }
  const files = savedFiles ?? [];
  if (files.length === 0) {
    return {
      resultsSaved: false,
      savedFiles: [],
      resultsNote: `No result files were written under ${RESULTS_DIR} (saving is disabled or failed).`,
    };
  }
  return {
    resultsSaved: true,
    savedFiles: files,
    resultsNote: `Saved ${files.length} result file(s) under ${RESULTS_DIR}; see savedFiles. Pass saveResults: false to skip.`,
  };
}
