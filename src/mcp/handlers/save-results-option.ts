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

/** Directory (relative to the project) that ResultSaver writes under. */
export const RESULTS_DIR = '.agentic-qe/results/';

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
