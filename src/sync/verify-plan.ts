/**
 * #1384: what `aqe sync verify` counts, per cloud table.
 *
 * Several sources can write one cloud table (aqe.qlearning_patterns is
 * written by root-rl-q-values and intelligence-qlearning), and the cloud
 * count is per table, so verify compares the table once, against the sum of
 * its sources' local counts. A source can also name keys an earlier version
 * uploaded (claude-flow-memory's `entries`/`version` rows) that verify leaves
 * out on both sides.
 */
import type { DataReader, SyncSource } from './interfaces.js';
import { DEFAULT_SYNC_CONFIG } from './interfaces.js';
import { validateIdentifier } from '../shared/sql-safety.js';
import { toErrorMessage } from '../shared/error-utils.js';

export interface VerifyGroup {
  table: string;
  sources: SyncSource[];
  /** Keys (the `key` column) left out of both counts. */
  excludeKeys: string[];
  /** Default sources that also write this table but were not selected. */
  unselectedWriters: string[];
}

/** Group the selected sources by target table, in the order they appear. */
export function planVerifyGroups(
  sources: SyncSource[],
  knownSources: readonly SyncSource[] = DEFAULT_SYNC_CONFIG.sync.sources,
): VerifyGroup[] {
  const groups = new Map<string, VerifyGroup>();
  for (const source of sources) {
    let group = groups.get(source.targetTable);
    if (!group) {
      group = { table: source.targetTable, sources: [], excludeKeys: [], unselectedWriters: [] };
      groups.set(source.targetTable, group);
    }
    group.sources.push(source);
    for (const key of source.verifyExcludeKeys ?? []) {
      if (!group.excludeKeys.includes(key)) group.excludeKeys.push(key);
    }
  }
  for (const group of groups.values()) {
    const selected = new Set(group.sources.map(s => s.name));
    group.unselectedWriters = knownSources
      .filter(s => s.enabled !== false && s.targetTable === group.table && !selected.has(s.name))
      .map(s => s.name);
  }
  return [...groups.values()];
}

/** The cloud COUNT(*) for a group, scoped to the environment. */
export function cloudCountQuery(group: VerifyGroup, environment: string): { sql: string; params: unknown[] } {
  const table = validateIdentifier(group.table);
  if (group.excludeKeys.length === 0) {
    return { sql: `SELECT COUNT(*) as count FROM ${table} WHERE source_env = $1`, params: [environment] };
  }
  return {
    sql: `SELECT COUNT(*) as count FROM ${table} WHERE source_env = $1 AND key <> ALL($2)`,
    params: [environment, group.excludeKeys],
  };
}

/**
 * The local count of one source, without records whose `key` is excluded.
 * Throws "<source>: <reason>" when the source cannot be counted.
 */
export async function localCount(source: SyncSource, reader: DataReader, excludeKeys: string[]): Promise<number> {
  try {
    if (excludeKeys.length === 0) return await reader.count();
    const records = await reader.readAll() as Array<Record<string, unknown>>;
    return records.filter(r => !excludeKeys.includes(String(r.key))).length;
  } catch (error) {
    throw new Error(`${source.name}: ${toErrorMessage(error)}`);
  }
}
