/**
 * Deliberate-shrink acknowledgement for the brain checkpoint (#1251).
 *
 * The Stop-hook checkpoint (`.claude/helpers/brain-checkpoint.cjs export`)
 * refuses to replace `aqe.rvf` with an export in which a table collapsed, so
 * a memory.db recreated from seed data cannot overwrite a richer mirror. A
 * deliberate shrink (`aqe learning prune --apply`, dream retention) is not
 * that case. It leaves this acknowledgement next to memory.db, with the row
 * counts it left behind. The export honours it once, within 24h, and only
 * while the brain still holds those counts (see evaluateShrinkAck).
 */

import { lstatSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  mirroredTableCounts,
  type CheckpointShrinkAck,
  type ShrinkProducer,
} from '../integrations/ruvector/brain-rvf-richness.js';
import type { RetentionStepResult } from './learning-retention.js';

/** Read by the checkpoint hook in `.agentic-qe/`; keep the name in sync with it. */
export const CHECKPOINT_SHRINK_ACK_FILE = 'brain-checkpoint.accept-shrink.json';

/** True when a step that ran for real left fewer rows in some table. */
export function removedRows(results: readonly RetentionStepResult[]): boolean {
  return results.some((r) => !r.dryRun && r.tables.some((t) => t.after < t.before));
}

/**
 * Write the acknowledgement next to the file of `db`, after the shrink and
 * while `db` is still open. Best-effort: returns its path, or undefined when
 * there is no database file (in-memory) or it failed.
 */
export function acknowledgeCheckpointShrink(db: DatabaseType, producer: ShrinkProducer): string | undefined {
  const dbPath = db.name;
  if (!dbPath || dbPath === ':memory:') return undefined;
  const dir = path.dirname(path.resolve(dbPath));
  try {
    // Same rule as the hook: never write into a symlinked directory.
    const st = lstatSync(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) return undefined;
    const ack: CheckpointShrinkAck = {
      at: new Date().toISOString(),
      producer,
      tableCounts: mirroredTableCounts(db),
    };
    const ackPath = path.join(dir, CHECKPOINT_SHRINK_ACK_FILE);
    // Unlink, then 'wx': never write through a planted symlink (#970).
    try { unlinkSync(ackPath); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    writeFileSync(ackPath, JSON.stringify(ack) + '\n', { flag: 'wx' });
    return ackPath;
  } catch {
    return undefined;
  }
}
