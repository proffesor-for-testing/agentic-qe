/** Record a brain import without grafting another store's witness history. */
import type Database from 'better-sqlite3';
import {
  GENESIS_PREV_HASH,
  hashWith,
  serializeEntry,
  type WitnessEntry,
} from '../../audit/witness-chain.js';

interface BrainImportAuditDetails {
  sourceChecksum: string;
  sourceWitnessRows: number;
  importedRecords: number;
  skippedRecords: number;
  conflicts: number;
}

/**
 * Call inside the import transaction, after merging all non-witness tables.
 *
 * Reuses WitnessChain's own hashing/serialization so the link format cannot
 * drift from what WitnessChain.verify() checks. The row is intentionally left
 * unsigned: the target DB may belong to a different project than the CWD, so
 * the process-default signing key is not necessarily the target's key.
 */
export function appendBrainImportWitness(
  db: Database.Database,
  details: BrainImportAuditDetails,
): void {
  const algo = 'shake256';
  const actionData = JSON.stringify(details);
  const last = db.prepare('SELECT * FROM witness_chain ORDER BY id DESC LIMIT 1')
    .get() as WitnessEntry | undefined;
  const previousHash = last ? hashWith(algo, serializeEntry(last)) : GENESIS_PREV_HASH;
  db.prepare(`
    INSERT INTO witness_chain
      (prev_hash, action_hash, action_type, action_data, timestamp, actor, hash_algo)
    VALUES (?, ?, 'BRAIN_IMPORT', ?, ?, 'brain-import', ?)
  `).run(previousHash, hashWith(algo, actionData), actionData, new Date().toISOString(), algo);
}
