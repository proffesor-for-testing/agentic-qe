/**
 * One-off script: Import Dragan's AQE RVF into memory.db
 * Run with: npx tsx scripts/rvf-import.ts
 */
import Database from 'better-sqlite3';
import {
  importBrainFromRvf,
  isRvfAvailable,
} from '../src/integrations/ruvector/brain-rvf-exporter.js';

const dbPath = '/workspaces/agentic-qe/.agentic-qe/memory.db';
const rvfPath = "/workspaces/agentic-qe/data/Dragan's aqe.rvf";

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

console.log('FK checks disabled, starting import...');
console.log('RVF available:', isRvfAvailable());

try {
  const result = importBrainFromRvf(db, rvfPath, {
    mergeStrategy: 'skip-conflicts',
    dryRun: false,
  });
  console.log('Import result:', JSON.stringify(result, null, 2));

  // Verify post-import
  const counts = {
    qe_patterns: (db.prepare('SELECT COUNT(*) as c FROM qe_patterns').get() as { c: number }).c,
    rl_q_values: (db.prepare('SELECT COUNT(*) as c FROM rl_q_values').get() as { c: number }).c,
    dream_insights: (db.prepare('SELECT COUNT(*) as c FROM dream_insights').get() as { c: number }).c,
    witness_chain: (db.prepare('SELECT COUNT(*) as c FROM witness_chain').get() as { c: number }).c,
  };
  console.log('Post-import counts:', JSON.stringify(counts, null, 2));
} finally {
  db.close();
}
