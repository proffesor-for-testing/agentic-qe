/**
 * Boundary validation for caller-supplied behavior examples (#787 / #795).
 *
 * Shared by the MCP handlers, the CLI `--behavior-examples` path and the
 * domain service so every entry point rejects the same malformed input with
 * the same message. Failures are `CallerInputError`s: they are the caller's
 * problem, not a sign of an unhealthy test-generation domain, and must never
 * count toward its circuit breaker.
 *
 * Only the shape is checked here. Whether `functionName` exists in the source
 * and whether `args` matches its arity can only be decided against the parsed
 * source (see behavior-examples.ts), which also throws `CallerInputError`.
 *
 * Kept free of heavy imports (no `typescript`) so boundary layers can use it.
 */

import { CallerInputError } from '../../../shared/error-utils.js';
import type { BehaviorExample } from '../interfaces.js';

const SHAPE_HINT = 'expected [{ "functionName": "add", "args": [2, 3], "expected": 5 }]';

/**
 * JSON Schema for one `behaviorExamples` element. Single source of truth for
 * every tool definition that advertises `behaviorExamples` (protocol server
 * `test_generate_enhanced` and `qe/tests/generate`).
 */
export const BEHAVIOR_EXAMPLE_ITEM_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'One caller-owned specification example',
  properties: {
    functionName: { type: 'string', description: 'Named export of the source file to call' },
    args: { type: 'array', description: 'Positional JSON arguments; length must equal the function arity', items: {} },
    expected: { description: 'Expected JSON return value (use null for a null result)' },
  },
  required: ['functionName', 'args', 'expected'],
};

/**
 * Throw unless `value` is plain JSON data that can be emitted as a literal:
 * finite numbers (no -0), strings, booleans, null, arrays and plain objects,
 * without cycles.
 */
export function assertBehaviorJsonValue(value: unknown, label = 'Behavior example value'): void {
  const visit = (v: unknown, seen: Set<unknown>): void => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return;
    if (typeof v !== 'object' || seen.has(v)) {
      throw new CallerInputError(`${label} must be finite JSON data (no undefined, functions, NaN/Infinity, cycles, or negative zero)`);
    }
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
      throw new CallerInputError(`${label} must contain only plain JSON objects`);
    }
    seen.add(v);
    for (const item of Array.isArray(v) ? Array.from(v) : Object.values(v)) visit(item, seen);
    seen.delete(v);
  };
  visit(value, new Set());
}

/**
 * Validate the shape of `behaviorExamples` at a system boundary.
 *
 * @returns the examples typed as `BehaviorExample[]`, or `undefined` when omitted
 * @throws CallerInputError describing the first invalid entry
 */
export function validateBehaviorExamples(value: unknown): BehaviorExample[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new CallerInputError(`behaviorExamples must be an array; ${SHAPE_HINT}`);
  }
  value.forEach((example: unknown, index) => {
    const at = `behaviorExamples[${index}]`;
    if (typeof example !== 'object' || example === null || Array.isArray(example)) {
      throw new CallerInputError(`${at} must be an object; ${SHAPE_HINT}`);
    }
    const record = example as Record<string, unknown>;
    if (typeof record.functionName !== 'string' || record.functionName.trim() === '') {
      throw new CallerInputError(`${at}.functionName must be a non-empty string`);
    }
    if (!Array.isArray(record.args)) {
      throw new CallerInputError(`${at}.args must be an array of arguments`);
    }
    if (!Object.prototype.hasOwnProperty.call(record, 'expected')) {
      throw new CallerInputError(`${at}.expected is required (use null for a null result)`);
    }
    assertBehaviorJsonValue(record.args, `${at}.args`);
    assertBehaviorJsonValue(record.expected, `${at}.expected`);
  });
  return value as BehaviorExample[];
}
