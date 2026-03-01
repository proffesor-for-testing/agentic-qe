/**
 * Test script for V2 to V3 migration
 */

import { migrateV2ToV3 } from '../src/learning/v2-to-v3-migration.js';

async function main() {
  console.log('=== V2 to V3 Migration Test ===\n');

  const result = await migrateV2ToV3(
    '../.agentic-qe/memory.db',     // V2 database (parent directory)
    '.agentic-qe/memory.db', // V3 database
    (progress) => {
      console.log(`[${progress.stage}] ${progress.message}`);
      if (progress.table) {
        console.log(`  Table: ${progress.table} (${progress.current}/${progress.total})`);
      }
    }
  );

  console.log('\n=== Migration Results ===');
  console.log(`Success: ${result.success}`);
  console.log(`Tables migrated: ${result.tablesMigrated.join(', ')}`);
  console.log('Counts:');
  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table}: ${count}`);
  }
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  // Verify the results
  console.log('\n=== Verification ===');
  const Database = await import('better-sqlite3');
  const db = new Database.default('.agentic-qe/memory.db');

  const patternCount = db.prepare('SELECT COUNT(*) as count FROM qe_patterns').get() as { count: number };
  const embeddingCount = db.prepare('SELECT COUNT(*) as count FROM qe_pattern_embeddings').get() as { count: number };
  const usageCount = db.prepare('SELECT COUNT(*) as count FROM qe_pattern_usage').get() as { count: number };

  console.log(`Patterns in V3: ${patternCount.count}`);
  console.log(`Embeddings in V3: ${embeddingCount.count}`);
  console.log(`Usage records in V3: ${usageCount.count}`);

  // Show some sample patterns
  const samplePatterns = db.prepare('SELECT * FROM qe_patterns LIMIT 5').all();
  console.log('\n=== Sample Patterns ===');
  for (const pattern of samplePatterns as any[]) {
    console.log(`- [${pattern.qe_domain}] ${pattern.name}`);
    console.log(`  Type: ${pattern.pattern_type}, Confidence: ${pattern.confidence}, Tier: ${pattern.tier}`);
  }

  db.close();
}

main().catch(console.error);
