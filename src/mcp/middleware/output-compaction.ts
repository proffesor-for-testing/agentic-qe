/**
 * Agentic QE v3 - Output Compaction Middleware
 *
 * Compacts MCP tool output to fit within OpenCode's context window.
 * Default limit: 35,000 tokens (headroom under typical 40k window).
 *
 * Strategies:
 * - String results: truncate with pointer to full result in memory
 * - Object results: summarize arrays (first 5 + count), truncate long strings
 * - Coverage/test reports: extract summary stats, store full report in memory
 */

// ============================================================================
// Token Estimation
// ============================================================================

/** Default max tokens for compacted output */
const DEFAULT_MAX_TOKENS = 35_000;

/** Rough chars-per-token ratio (conservative estimate for mixed content) */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from a string.
 * Uses a rough heuristic: ~4 characters per token.
 *
 * @param text - Input text
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate the character budget for a given token limit.
 */
function tokenBudgetToChars(maxTokens: number): number {
  return maxTokens * CHARS_PER_TOKEN;
}

// ============================================================================
// Memory Store Interface (optional dependency)
// ============================================================================

/**
 * Callback to store full results in memory when output is truncated.
 * If not provided, truncated results will include a note but no memory key.
 */
export type MemoryStoreFn = (key: string, value: unknown) => Promise<void>;

let memoryStoreFn: MemoryStoreFn | null = null;

/**
 * Set the memory store function for persisting full results.
 * Call this during server initialization to enable memory-backed truncation.
 */
export function setMemoryStore(fn: MemoryStoreFn): void {
  memoryStoreFn = fn;
}

// ============================================================================
// Compaction Logic
// ============================================================================

/**
 * Compact a tool output to fit within a token budget.
 *
 * @param result - Raw tool output (string, object, or array)
 * @param toolName - Name of the tool that produced this output
 * @param maxTokens - Maximum token budget (default: 35,000)
 * @returns Compacted result that fits within the budget
 *
 * @example
 * ```ts
 * const raw = await someTool.execute(params);
 * const compacted = await compactToolOutput(raw, 'coverage_analyze_sublinear');
 * ```
 */
export async function compactToolOutput(
  result: unknown,
  toolName: string = 'unknown',
  maxTokens: number = DEFAULT_MAX_TOKENS
): Promise<unknown> {
  // Null/undefined pass through
  if (result === null || result === undefined) {
    return result;
  }

  const serialized = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const estimatedTokens = estimateTokens(serialized);

  // If within budget, return as-is
  if (estimatedTokens <= maxTokens) {
    return result;
  }

  const charBudget = tokenBudgetToChars(maxTokens);
  const timestamp = Date.now();
  const memoryKey = `opencode/results/${toolName}/${timestamp}`;

  // Store full result in memory if available
  if (memoryStoreFn) {
    try {
      await memoryStoreFn(memoryKey, result);
    } catch {
      // Non-fatal: compaction still works, just without memory persistence
    }
  }

  // String results: truncate with pointer
  if (typeof result === 'string') {
    return compactString(result, charBudget, memoryKey);
  }

  // Object/array results: structural compaction
  if (typeof result === 'object') {
    return compactObject(result, charBudget, toolName, memoryKey);
  }

  // Primitives pass through (numbers, booleans)
  return result;
}

/**
 * Truncate a string result with a memory pointer.
 */
function compactString(text: string, charBudget: number, memoryKey: string): string {
  const suffix = memoryStoreFn
    ? `\n... [truncated, full result stored in memory key: ${memoryKey}]`
    : '\n... [truncated — output exceeded token budget]';

  const availableChars = charBudget - suffix.length;
  if (availableChars <= 0) {
    return suffix.trim();
  }

  return text.substring(0, availableChars) + suffix;
}

/**
 * Compact an object or array result using structural summarization.
 */
function compactObject(
  obj: unknown,
  charBudget: number,
  toolName: string,
  memoryKey: string
): unknown {
  // Handle arrays: show first 5 items + count
  if (Array.isArray(obj)) {
    return compactArray(obj, charBudget, memoryKey);
  }

  const record = obj as Record<string, unknown>;

  // Special handling for coverage/test reports
  if (isCoverageReport(record, toolName)) {
    return compactCoverageReport(record, memoryKey);
  }

  if (isTestReport(record, toolName)) {
    return compactTestReport(record, memoryKey);
  }

  // General object compaction: keep structure, truncate large values
  return compactGenericObject(record, charBudget, memoryKey);
}

/**
 * Compact an array: show first 5 items + total count.
 */
function compactArray(arr: unknown[], charBudget: number, memoryKey: string): unknown {
  const MAX_PREVIEW_ITEMS = 5;

  if (arr.length <= MAX_PREVIEW_ITEMS) {
    // Small array — try to fit as-is, truncate individual items if needed
    return arr.map(item => compactValue(item, Math.floor(charBudget / arr.length)));
  }

  const preview = arr.slice(0, MAX_PREVIEW_ITEMS).map(
    item => compactValue(item, Math.floor(charBudget / (MAX_PREVIEW_ITEMS + 1)))
  );

  const summaryNote = memoryStoreFn
    ? `Showing ${MAX_PREVIEW_ITEMS} of ${arr.length} items. Full result in memory key: ${memoryKey}`
    : `Showing ${MAX_PREVIEW_ITEMS} of ${arr.length} items (output truncated)`;

  return {
    _compacted: true,
    _totalItems: arr.length,
    _note: summaryNote,
    items: preview,
  };
}

/**
 * Compact a single value (string truncation, nested object reduction).
 */
function compactValue(value: unknown, charBudget: number): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > charBudget) {
      return value.substring(0, charBudget) + '...';
    }
    return value;
  }

  if (typeof value === 'object') {
    const serialized = JSON.stringify(value);
    if (serialized.length > charBudget) {
      // For deeply nested objects, just show keys
      if (Array.isArray(value)) {
        return { _type: 'array', _length: value.length };
      }
      const keys = Object.keys(value as Record<string, unknown>);
      return { _type: 'object', _keys: keys.slice(0, 10), _totalKeys: keys.length };
    }
    return value;
  }

  return value;
}

// ============================================================================
// Report-Specific Compaction
// ============================================================================

/**
 * Detect if result looks like a coverage report.
 */
function isCoverageReport(obj: Record<string, unknown>, toolName: string): boolean {
  return (
    toolName.includes('coverage') ||
    'lineCoverage' in obj ||
    'branchCoverage' in obj ||
    'coverageByFile' in obj
  );
}

/**
 * Detect if result looks like a test execution report.
 */
function isTestReport(obj: Record<string, unknown>, toolName: string): boolean {
  return (
    toolName.includes('test_execute') ||
    'testsRun' in obj ||
    'testResults' in obj ||
    ('passed' in obj && 'failed' in obj)
  );
}

/**
 * Extract summary stats from a coverage report.
 */
function compactCoverageReport(
  report: Record<string, unknown>,
  memoryKey: string
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    _compacted: true,
    _type: 'coverage-report',
  };

  // Preserve summary-level fields
  const summaryFields = [
    'lineCoverage', 'branchCoverage', 'functionCoverage', 'statementCoverage',
    'totalFiles', 'riskScore', 'status', 'taskId', 'duration',
  ];

  for (const field of summaryFields) {
    if (field in report) {
      summary[field] = report[field];
    }
  }

  // Compact gap arrays
  if (Array.isArray(report.gaps)) {
    const gaps = report.gaps as Array<Record<string, unknown>>;
    summary.gapCount = gaps.length;
    summary.criticalGaps = gaps.filter(g => g.severity === 'critical').length;
    summary.highGaps = gaps.filter(g => g.severity === 'high').length;
    summary.topGaps = gaps.slice(0, 3).map(g => ({
      file: g.file,
      severity: g.severity,
      type: g.type,
    }));
  }

  if (memoryStoreFn) {
    summary._fullReport = `Full report stored in memory key: ${memoryKey}`;
  }

  return summary;
}

/**
 * Extract summary stats from a test execution report.
 */
function compactTestReport(
  report: Record<string, unknown>,
  memoryKey: string
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    _compacted: true,
    _type: 'test-report',
  };

  // Preserve summary-level fields
  const summaryFields = [
    'passed', 'failed', 'skipped', 'total', 'testsRun',
    'duration', 'status', 'taskId', 'retryCount',
  ];

  for (const field of summaryFields) {
    if (field in report) {
      summary[field] = report[field];
    }
  }

  // Compact test results array
  if (Array.isArray(report.testResults)) {
    const results = report.testResults as Array<Record<string, unknown>>;
    summary.totalTests = results.length;
    const failures = results.filter(r => r.status === 'failed' || r.passed === false);
    summary.failedTests = failures.slice(0, 5).map(f => ({
      name: f.name || f.testName,
      error: typeof f.error === 'string' ? f.error.substring(0, 200) : f.error,
    }));
  }

  if (memoryStoreFn) {
    summary._fullReport = `Full report stored in memory key: ${memoryKey}`;
  }

  return summary;
}

// ============================================================================
// Generic Object Compaction
// ============================================================================

/**
 * Compact a generic object by truncating large nested values.
 */
function compactGenericObject(
  obj: Record<string, unknown>,
  charBudget: number,
  memoryKey: string
): Record<string, unknown> {
  const keys = Object.keys(obj);
  const perKeyBudget = Math.floor(charBudget / Math.max(keys.length, 1));
  const compacted: Record<string, unknown> = { _compacted: true };

  for (const key of keys) {
    compacted[key] = compactValue(obj[key], perKeyBudget);
  }

  if (memoryStoreFn) {
    compacted._fullResult = `Full result stored in memory key: ${memoryKey}`;
  }

  return compacted;
}
