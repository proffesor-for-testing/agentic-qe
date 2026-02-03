#!/usr/bin/env npx tsx
/**
 * Generate Embeddings for Patterns
 * Cloud Sync Plan Phase 3: Generate embeddings for patterns
 *
 * Usage:
 *   npx tsx scripts/generate-embeddings.ts [options]
 *
 * Options:
 *   --force       Regenerate all embeddings (even existing ones)
 *   --table NAME  Table name (default: patterns)
 *   --verbose     Show detailed progress
 *   --search QUERY  Search for similar patterns (instead of generating)
 */

import { createSyncEmbeddingGenerator } from '../src/sync/embeddings/index.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const searchIdx = args.indexOf('--search');
  const tableIdx = args.indexOf('--table');

  const tableName = tableIdx !== -1 && args[tableIdx + 1] ? args[tableIdx + 1] : 'patterns';
  const searchQuery = searchIdx !== -1 && args[searchIdx + 1] ? args[searchIdx + 1] : null;

  console.log('=== Pattern Embedding Generator ===\n');

  const dbPath = resolve(__dirname, '../../.agentic-qe/memory.db');
  const generator = createSyncEmbeddingGenerator(dbPath);

  try {
    if (searchQuery) {
      // Search mode
      console.log(`Searching for patterns similar to: "${searchQuery}"\n`);

      const results = await generator.findSimilarPatterns(searchQuery, {
        limit: 10,
        threshold: 0.3,
        tableName,
      });

      if (results.length === 0) {
        console.log('No similar patterns found. Try a different query or lower threshold.');
        return;
      }

      console.log(`Found ${results.length} similar patterns:\n`);

      for (const { pattern, similarity } of results) {
        console.log(`---`);
        console.log(`ID: ${pattern.id}`);
        console.log(`Similarity: ${(similarity * 100).toFixed(1)}%`);
        if (pattern.pattern) {
          console.log(`Pattern: ${pattern.pattern.substring(0, 200)}...`);
        }
        if (pattern.type) {
          console.log(`Type: ${pattern.type}`);
        }
        if (pattern.domain) {
          console.log(`Domain: ${pattern.domain}`);
        }
        console.log('');
      }
    } else {
      // Generate mode
      console.log(`Database: ${dbPath}`);
      console.log(`Table: ${tableName}`);
      console.log(`Force regenerate: ${force}`);
      console.log('');

      // Generate embeddings for patterns table
      console.log('Processing patterns table...');
      const patternsStats = await generator.generateForAllPatterns('patterns', {
        force,
        verbose,
        batchSize: 50,
      });

      console.log('\n=== Patterns Table Results ===');
      console.log(`Total patterns: ${patternsStats.totalPatterns}`);
      console.log(`Already had embeddings: ${patternsStats.patternsWithEmbeddings}`);
      console.log(`Newly generated: ${patternsStats.patternsGenerated}`);
      console.log(`Skipped (errors): ${patternsStats.patternsSkipped}`);
      console.log(`Duration: ${patternsStats.durationMs}ms`);

      if (patternsStats.errors.length > 0) {
        console.log('\nErrors:');
        patternsStats.errors.slice(0, 5).forEach((e) => console.log(`  - ${e}`));
        if (patternsStats.errors.length > 5) {
          console.log(`  ... and ${patternsStats.errors.length - 5} more`);
        }
      }

      // Also process sona_patterns if they exist
      console.log('\nProcessing sona_patterns table...');
      try {
        const sonaStats = await generator.generateForAllPatterns('sona_patterns', {
          force,
          verbose,
          batchSize: 50,
        });

        console.log('\n=== SONA Patterns Table Results ===');
        console.log(`Total patterns: ${sonaStats.totalPatterns}`);
        console.log(`Already had embeddings: ${sonaStats.patternsWithEmbeddings}`);
        console.log(`Newly generated: ${sonaStats.patternsGenerated}`);
        console.log(`Skipped (errors): ${sonaStats.patternsSkipped}`);
        console.log(`Duration: ${sonaStats.durationMs}ms`);
      } catch (error) {
        // Table might not exist
        console.log('sona_patterns table not found or error processing');
      }

      // Print generator stats
      console.log('\n=== Embedding Generator Stats ===');
      const stats = generator.getStats();
      console.log(`Total embeddings: ${stats.totalEmbeddings}`);
      console.log(`Cache hit rate: ${(stats.cacheHitRate * 100).toFixed(1)}%`);
      console.log(`Avg embedding time: ${stats.avgEmbeddingTime.toFixed(2)}ms`);
    }

    console.log('\n✅ Done!');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await generator.clear();
  }
}

main().catch(console.error);
