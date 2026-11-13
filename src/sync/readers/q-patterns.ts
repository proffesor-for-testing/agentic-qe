/**
 * #1384: ruvector Q-patterns for aqe.qlearning_patterns.
 *
 * `.ruvector/intelligence.json` keeps `patterns` as
 * `{"state|action": {state, action, q_value, visits, last_update}}`. ruvector
 * `hooks pretrain` (0.3.x) adds `source: 'pretrain'`, and older versions left
 * `{"<state>": {<agent>: <count>}}` entries with no action or q_value. Only
 * the cloud columns are kept, so an extra field never becomes a column the
 * cloud table lacks, and an entry that is not a Q-pattern is skipped and
 * counted instead of failing every row of the sync.
 */
import type { JSONRecord } from './json-reader.js';

/** The cloud table these patterns are written to. */
export const Q_PATTERNS_TABLE = 'aqe.qlearning_patterns';

/**
 * #1415: AQE's own Q-values (root-rl-q-values) share this table and its
 * UNIQUE(state, action, source_env). ruvector states are uploaded with this
 * prefix, so an AQE row and a ruvector row with the same (state, action)
 * never overwrite each other.
 */
export const RUVECTOR_STATE_PREFIX = 'ruvector:';

export interface QPatternRead {
  records: JSONRecord[];
  /** Entries that were not Q-patterns, or null when there were none. */
  skipped: { count: number; reason: string } | null;
}

/** Keep the Q-pattern columns of each entry; skip and count the rest. */
export function toQPatterns(entries: JSONRecord[], jsonPath: string): QPatternRead {
  const records: JSONRecord[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const { state, action, q_value: qValue, visits, last_update: lastUpdate } = entry;
    if (typeof state !== 'string' || typeof action !== 'string' ||
        typeof qValue !== 'number' || !Number.isFinite(qValue)) {
      skipped++;
      continue;
    }
    records.push({
      state: RUVECTOR_STATE_PREFIX + state, action, q_value: qValue,
      visits: typeof visits === 'number' ? visits : 0,
      last_update: typeof lastUpdate === 'number' || typeof lastUpdate === 'string' ? lastUpdate : null,
    });
  }
  return {
    records,
    skipped: skipped === 0 ? null : {
      count: skipped,
      reason: `${skipped} ${skipped === 1 ? 'entry' : 'entries'} in ${jsonPath} ` +
        `${skipped === 1 ? 'is not a Q-pattern' : 'are not Q-patterns'} ` +
        '(no string state/action or numeric q_value, e.g. legacy ruvector pretrain entries) and ' +
        `${skipped === 1 ? 'was' : 'were'} skipped`,
    },
  };
}
