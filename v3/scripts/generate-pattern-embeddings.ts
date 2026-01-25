/**
 * Generate embeddings for migrated V2 patterns
 * This script generates embeddings for all patterns in the database
 * and stores them in the qe_pattern_embeddings table for HNSW search
 */

import { createSQLitePatternStore } from '../src/learning/sqlite-persistence.js';
import { computeRealEmbedding } from '../src/learning/real-embeddings.js';
import type { QEPattern } from '../src/learning/qe-patterns.js';

async function main() {
  console.log('=== Generating Embeddings for Migrated Patterns ===\n');

  // Initialize SQLite Pattern Store
  console.log('1. Initializing Pattern Store...');
  const patternStore = createSQLitePatternStore({
    dbPath: '.agentic-qe/qe-patterns.db',
  });
  await patternStore.initialize();
  console.log('   Initialized');

  // Get all patterns
  console.log('\n2. Loading all patterns...');
  const allPatterns = patternStore.getPatterns({ limit: 10000 });
  console.log('   Loaded', allPatterns.length, 'patterns');

  // Check existing embeddings
  const existingEmbeddings = patternStore.getAllEmbeddings();
  console.log('   Existing embeddings:', existingEmbeddings.length);

  const patternsToEmbed = allPatterns.filter(p =>
    !existingEmbeddings.some(e => e.patternId === p.id)
  );
  console.log('   Patterns needing embeddings:', patternsToEmbed.length);

  if (patternsToEmbed.length === 0) {
    console.log('\n   All patterns already have embeddings!');
    await patternStore.close();
    return;
  }

  // Generate embeddings in batches
  console.log('\n3. Generating embeddings...');
  console.log('   Loading embedding model...');

  let successCount = 0;
  let errorCount = 0;
  const batchSize = 10;

  for (let i = 0; i < patternsToEmbed.length; i += batchSize) {
    const batch = patternsToEmbed.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(patternsToEmbed.length / batchSize);

    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} patterns)...`);

    for (const pattern of batch) {
      try {
        // Generate embedding from pattern name + description
        const textToEmbed = [
          pattern.name,
          pattern.description || '',
          pattern.domain || '',
        ].filter(Boolean).join('. ');

        const embedding = await computeRealEmbedding(textToEmbed, {
          model: 'Xenova/all-MiniLM-L6-v2',
        });

        // Store embedding
        patternStore.storePatternEmbedding(pattern.id, embedding);

        successCount++;

        // Show progress every 25 patterns
        if (successCount % 25 === 0) {
          console.log(`   Progress: ${successCount}/${patternsToEmbed.length} (${((successCount / patternsToEmbed.length) * 100).toFixed(1)}%)`);
        }
      } catch (error) {
        errorCount++;
        console.warn(`   Failed to embed pattern ${pattern.id}:`, error);
      }
    }
  }

  console.log('\n4. Results:');
  console.log('   Successful embeddings:', successCount);
  console.log('   Failed embeddings:', errorCount);

  // Verify embeddings
  console.log('\n5. Verifying embeddings...');
  const finalEmbeddings = patternStore.getAllEmbeddings();
  console.log('   Total embeddings in database:', finalEmbeddings.length);

  await patternStore.close();
  console.log('\n=== Embedding Generation Complete ===');
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
