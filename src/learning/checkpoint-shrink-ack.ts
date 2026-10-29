/**
 * Deliberate-shrink acknowledgement for the brain checkpoint (#1251).
 *
 * The Stop-hook checkpoint (`.claude/helpers/brain-checkpoint.cjs export`)
 * refuses to replace `aqe.rvf` with an export that has lost most of a table,
 * so a memory.db recreated from seed data cannot overwrite a richer mirror.
 * A deliberate shrink (`aqe learning prune --apply`, dream retention) is not
 * that case. It leaves this acknowledgement next to memory.db, and the hook
 * replaces the checkpoint once, without the guard, then deletes it.
 */

import { lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RetentionStepResult } from './learning-retention.js';

/** Read by the checkpoint hook in `.agentic-qe/`; keep the name in sync with it. */
export const CHECKPOINT_SHRINK_ACK_FILE = 'brain-checkpoint.accept-shrink.json';

/** True when a step that ran for real left fewer rows in some table. */
export function removedRows(results: readonly RetentionStepResult[]): boolean {
  return results.some((r) => !r.dryRun && r.tables.some((t) => t.after < t.before));
}

/**
 * Write the acknowledgement next to `dbPath`. Best-effort: returns its path,
 * or undefined when there is no database file (in-memory) or it failed.
 */
export function acknowledgeCheckpointShrink(dbPath: string, reason: string): string | undefined {
  if (!dbPath || dbPath === ':memory:') return undefined;
  const dir = path.dirname(path.resolve(dbPath));
  try {
    // Same rule as the hook: never write into a symlinked directory.
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return undefined;
    const ackPath = path.join(dir, CHECKPOINT_SHRINK_ACK_FILE);
    // Unlink, then 'wx': never write through a planted symlink (#970).
    try { unlinkSync(ackPath); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    writeFileSync(ackPath, JSON.stringify({ at: new Date().toISOString(), reason }) + '\n', { flag: 'wx' });
    return ackPath;
  } catch {
    return undefined;
  }
}
