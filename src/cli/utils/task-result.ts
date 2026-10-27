/**
 * Agentic QE v3 - Printing a completed task's result (#1228, #1146)
 *
 * `aqe task submit --wait` reported only "Task completed", so a CLI user never
 * saw what the task found, nor that part of it was not measured. These lines
 * show the result: its status / measured / message fields first, then the
 * whole result as JSON (cut after a line limit; --output writes all of it).
 */

import { toJSON } from './ci-output.js';

export const MAX_RESULT_LINES = 200;

/** Top-level fields that say whether, and how much of, the result was measured. */
const HEADLINE_FIELDS = ['status', 'measured', 'message', 'note', 'notMeasuredReason', 'notMeasured', 'warning', 'error', 'incompleteChecks'];

export function taskResultLines(result: unknown, maxLines = MAX_RESULT_LINES): string[] {
  if (result === undefined || result === null) return ['Result: none (the task returned no result)'];

  const lines: string[] = [];
  if (typeof result === 'object' && !Array.isArray(result)) {
    const record = result as Record<string, unknown>;
    for (const field of HEADLINE_FIELDS) {
      if (record[field] !== undefined) lines.push(`${field}: ${headline(record[field])}`);
    }
  }

  const json = toJSON(result).split('\n');
  lines.push('Result:');
  lines.push(...json.slice(0, maxLines).map((line) => `  ${line}`));
  if (json.length > maxLines) {
    lines.push(`  … ${json.length - maxLines} more line(s); --output <file> writes the full result`);
  }
  return lines;
}

function headline(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 0) return '[]';
  return JSON.stringify(value);
}
