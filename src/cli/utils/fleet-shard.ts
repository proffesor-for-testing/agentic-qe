/**
 * Agentic QE v3 - `aqe fleet run` work split (#1146)
 *
 * `--parallel N` used to submit the same payload N times, so every worker did
 * the whole job again. Now the target's files are split across the workers:
 *   - scan -> each worker scans its own share of the files
 *   - test -> each worker generates tests for its own share of the source files
 *   - analyze -> one coverage report is judged as a whole, so it runs as one task
 * The shard results are then combined into one result for the verdict. Only
 * figures the workers returned are combined; nothing is estimated.
 */

import type { FleetOperation } from './fleet-operation.js';

/** Workers used when --parallel is not given. */
export const DEFAULT_FLEET_WORKERS = 4;

/** The payload field each splittable operation's files are in. */
const SHARD_FIELD: Partial<Record<FleetOperation, string>> = { scan: 'files', test: 'sourceFiles' };

export interface FleetShardPlan {
  /** One payload per worker. */
  payloads: Array<Record<string, unknown>>;
  /** Files given to each worker (empty for an operation that is not split). */
  files: string[][];
  /** Why fewer workers run than were asked for, if they do. */
  note?: string;
}

/** Split `items` into at most `parts` contiguous chunks whose sizes differ by at most one. */
export function splitEvenly<T>(items: readonly T[], parts: number): T[][] {
  const count = Math.max(1, Math.min(parts, items.length));
  const base = Math.floor(items.length / count);
  const extra = items.length % count;
  const chunks: T[][] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    chunks.push(items.slice(start, start + size));
    start += size;
  }
  return chunks;
}

/**
 * Split an operation's payload across workers. `requested` is the --parallel
 * value, or undefined when the flag was not given.
 */
export function shardFleetPayload(
  operation: FleetOperation,
  payload: Record<string, unknown>,
  requested: number | undefined,
): FleetShardPlan {
  const field = SHARD_FIELD[operation];
  if (!field) {
    const note = requested !== undefined && requested > 1
      ? `${operation} judges one coverage report as a whole, so it runs as one task; --parallel ${requested} does not apply.`
      : undefined;
    return { payloads: [payload], files: [[]], ...(note ? { note } : {}) };
  }
  const files = Array.isArray(payload[field]) ? payload[field] as string[] : [];
  const wanted = requested ?? DEFAULT_FLEET_WORKERS;
  const chunks = splitEvenly(files, wanted);
  const note = requested !== undefined && chunks.length < requested
    ? `--parallel ${requested} asks for more workers than there are files (${files.length}); ${chunks.length} run.`
    : undefined;
  return {
    payloads: chunks.map(chunk => ({ ...payload, [field]: chunk })),
    files: chunks,
    ...(note ? { note } : {}),
  };
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

const SCAN_COUNTS = ['critical', 'high', 'medium', 'low', 'informational', 'totalFiles'] as const;

function sum(records: Array<Record<string, unknown> | undefined>, key: string): number | undefined {
  const values = records.map(r => r?.[key]);
  return values.every(v => typeof v === 'number') ? (values as number[]).reduce((a, b) => a + b, 0) : undefined;
}

function combineScans(results: Array<Record<string, unknown>>): Record<string, unknown> | undefined {
  if (!results.every(r => asRecord(r.summary) && Array.isArray(r.vulnerabilities))) return undefined;
  const summaries = results.map(r => asRecord(r.summary));
  const summary: Record<string, number> = {};
  for (const key of SCAN_COUNTS) {
    const total = sum(summaries, key);
    if (total !== undefined) summary[key] = total;
  }
  const coverages = results.map(r => asRecord(r.coverage));
  const filesScanned = sum(coverages, 'filesScanned');
  const linesScanned = sum(coverages, 'linesScanned');
  // Complete only when every shard says so; a shard without evidence leaves it unknown.
  const completeness = results.map(r => asRecord(r.evidence)?.completeness);
  const combinedCompleteness = !completeness.every(c => typeof c === 'string') ? undefined
    : completeness.every(c => c === 'complete') ? 'complete'
    : completeness.every(c => c === 'none') ? 'none' : 'partial';
  return {
    vulnerabilities: results.flatMap(r => r.vulnerabilities as unknown[]),
    summary,
    ...(filesScanned !== undefined || linesScanned !== undefined
      ? { coverage: { ...(filesScanned !== undefined ? { filesScanned } : {}), ...(linesScanned !== undefined ? { linesScanned } : {}) } }
      : {}),
    ...(combinedCompleteness ? { evidence: { completeness: combinedCompleteness } } : {}),
  };
}

/**
 * Combine the results of the workers that completed into one result of the
 * operation's shape. Returns undefined when a result cannot be read, so the
 * verdict fails as unreadable instead of passing on part of the results.
 */
export function combineFleetResults(operation: FleetOperation, results: readonly unknown[]): unknown {
  if (results.length === 0) return undefined;
  if (results.length === 1) return results[0];
  const records = results.map(asRecord);
  if (records.some(r => !r)) return undefined;
  const valid = records as Array<Record<string, unknown>>;
  switch (operation) {
    case 'scan': return combineScans(valid);
    case 'test':
      return valid.every(r => Array.isArray(r.tests)) ? { tests: valid.flatMap(r => r.tests as unknown[]) } : undefined;
    case 'analyze':
      // Never split, so several results mean duplicated work; none is preferred.
      return undefined;
  }
}
