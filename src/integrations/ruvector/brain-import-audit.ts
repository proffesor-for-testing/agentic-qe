/** Record a brain import without grafting another store's witness history. */
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

const GENESIS_PREV_HASH = '0'.repeat(64);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface WitnessLink {
  id: number;
  prev_hash: string;
  action_hash: string;
  action_type: string;
  action_data: string;
  timestamp: string;
  actor: string;
}

interface BrainImportAuditDetails {
  sourceChecksum: string;
  sourceWitnessRows: number;
  importedRecords: number;
  skippedRecords: number;
  conflicts: number;
}

function serializeLink(entry: WitnessLink): string {
  // Keep the field order used by WitnessChain.verify().
  return JSON.stringify({
    id: entry.id,
    prev_hash: entry.prev_hash,
    action_hash: entry.action_hash,
    action_type: entry.action_type,
    action_data: entry.action_data,
    timestamp: entry.timestamp,
    actor: entry.actor,
  });
}

/** Call inside the import transaction, after merging all non-witness tables. */
export function appendBrainImportWitness(
  db: Database.Database,
  details: BrainImportAuditDetails,
): void {
  const actionData = JSON.stringify(details);
  const last = db.prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1')
    .get() as WitnessLink | undefined;
  const previousHash = last ? sha256(serializeLink(last)) : GENESIS_PREV_HASH;
  db.prepare(`
    INSERT INTO witness_chain
      (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
    VALUES (?, ?, 'BRAIN_IMPORT', ?, ?, 'brain-import', 'sha256')
  `).run(previousHash, sha256(actionData), actionData, new Date().toISOString());
}
