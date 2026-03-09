#!/usr/bin/env node
/**
 * Backfill real all-MiniLM-L6-v2 embeddings for patterns missing them.
 * Skips bench/test patterns. Uses @xenova/transformers ONNX inference.
 */

import { SQLitePatternStore } from '../dist/learning/sqlite-persistence.js';

const store = new SQLitePatternStore({ dbPath: '.agentic-qe/memory.db', useUnified: false });
await store.initialize();

console.log('[Backfill] Starting embedding backfill with all-MiniLM-L6-v2...');
const startTime = performance.now();

try {
  const result = await store.backfillEmbeddings(32);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  console.log('\n[Backfill] === Results ===');
  console.log(`  Method:      ${result.method}`);
  console.log(`  Processed:   ${result.processed}`);
  console.log(`  Skipped:     ${result.skipped}`);
  console.log(`  Errors:      ${result.errors}`);
  console.log(`  Already had: ${result.alreadyHad}`);
  console.log(`  Duration:    ${elapsed}s`);

  store.close();
  process.exit(result.errors > 0 ? 1 : 0);
} catch (e) {
  console.error('[Backfill] Fatal error:', e);
  store.close();
  process.exit(2);
}
