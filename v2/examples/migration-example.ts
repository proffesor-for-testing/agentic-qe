/**
 * Pattern Migration Examples
 *
 * Demonstrates various migration scenarios from AgentDB to RuVector.
 *
 * @module examples/migration-example
 */

import {
  PatternMigrator,
  DualWriteProxy,
  createDualWriteProxy,
  checkMigrationStatus,
  type MigrationOptions,
  type MigrationResult,
} from '../src/core/memory/MigrationTools';
import { RuVectorPatternStore } from '../src/core/memory/RuVectorPatternStore';
import { PatternStoreFactory } from '../src/core/memory/PatternStoreFactory';
import type { TestPattern } from '../src/core/memory/IPatternStore';

/**
 * Example 1: Basic Migration
 * Simple one-time migration with automatic backup
 */
async function basicMigration() {
  console.log('\n=== Example 1: Basic Migration ===\n');

  const migrator = new PatternMigrator();

  const result = await migrator.migrate({
    sourcePath: './data/agentic-qe.db',
    targetPath: './data/patterns.ruvector',
    batchSize: 1000,
    verbose: true,
  });

  console.log('\nMigration Complete!');
  console.log(`  Migrated: ${result.migratedCount} patterns`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`  Backup: ${result.backupPath}`);
}

/**
 * Example 2: Dry-Run Validation
 * Validate source database without performing migration
 */
async function dryRunValidation() {
  console.log('\n=== Example 2: Dry-Run Validation ===\n');

  const migrator = new PatternMigrator();

  const result = await migrator.migrate({
    sourcePath: './data/agentic-qe.db',
    targetPath: './data/patterns.ruvector',
    dryRun: true,
    verbose: true,
  });

  console.log('\nValidation Results:');
  console.log(`  Source Valid: ${result.validation?.sourceValid}`);
  console.log(`  Total Patterns: ${result.totalPatterns}`);
  console.log(`  Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n  Error Details:');
    result.errors.forEach((err, i) => console.log(`    ${i + 1}. ${err}`));
  }
}

/**
 * Example 3: Custom Embedding Generator
 * Use custom embeddings instead of placeholder embeddings
 */
async function customEmbeddingMigration() {
  console.log('\n=== Example 3: Custom Embedding Migration ===\n');

  // Mock embedding generator (replace with real implementation)
  async function generateEmbedding(pattern: any): Promise<number[]> {
    // In real implementation:
    // 1. Combine pattern.name, pattern.template, pattern.description
    // 2. Send to embedding model (OpenAI, Cohere, local model)
    // 3. Return embedding vector

    // For demo: create deterministic embedding based on pattern ID
    const seed = pattern.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const embedding = Array.from({ length: 384 }, (_, i) => {
      return Math.sin(seed + i * 0.1);
    });

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / norm);
  }

  const migrator = new PatternMigrator();

  const result = await migrator.migrate({
    sourcePath: './data/agentic-qe.db',
    targetPath: './data/patterns-semantic.ruvector',
    generateEmbedding,
    batchSize: 500,
    verbose: true,
  });

  console.log('\nCustom Embedding Migration Complete!');
  console.log(`  Migrated: ${result.migratedCount} patterns`);
  console.log(`  With semantic embeddings`);
}

/**
 * Example 4: Dual-Write Pattern (Zero-Downtime)
 * Write to both old and new stores during transition
 */
async function dualWritePattern() {
  console.log('\n=== Example 4: Dual-Write Pattern ===\n');

  // Phase 1: Setup dual-write proxy
  console.log('Phase 1: Setting up dual-write proxy...');

  const primary = new RuVectorPatternStore({
    storagePath: './data/patterns-new.ruvector',
    dimension: 384,
  });

  const secondary = new RuVectorPatternStore({
    storagePath: './data/patterns-old.ruvector',
    dimension: 384,
  });

  const proxy = new DualWriteProxy(primary, secondary);
  await proxy.initialize();

  console.log('✅ Dual-write proxy initialized');

  // Phase 2: Use proxy for normal operations
  console.log('\nPhase 2: Writing patterns to both stores...');

  const testPattern: TestPattern = {
    id: 'dual-write-test-1',
    type: 'unit',
    domain: 'jest',
    embedding: Array(384).fill(0.1),
    content: 'Test pattern for dual-write demonstration',
    framework: 'jest',
    coverage: 0.92,
    verdict: 'success',
    usageCount: 5,
  };

  await proxy.storePattern(testPattern);
  console.log('✅ Pattern written to both stores');

  // Phase 3: Verify both stores have the pattern
  console.log('\nPhase 3: Verifying consistency...');

  const primaryPattern = await primary.getPattern('dual-write-test-1');
  const secondaryPattern = await secondary.getPattern('dual-write-test-1');

  console.log(`  Primary store: ${primaryPattern ? 'Found' : 'Not found'}`);
  console.log(`  Secondary store: ${secondaryPattern ? 'Found' : 'Not found'}`);

  // Phase 4: Search from primary (high performance)
  console.log('\nPhase 4: Searching (reads from primary)...');

  const results = await proxy.searchSimilar(testPattern.embedding, { k: 5 });
  console.log(`  Search results: ${results.length} patterns found`);

  await proxy.shutdown();
  console.log('\n✅ Dual-write demonstration complete');
}

/**
 * Example 5: Batch Migration with Progress Tracking
 * Migrate large datasets in controlled batches
 */
async function batchMigrationWithProgress() {
  console.log('\n=== Example 5: Batch Migration with Progress ===\n');

  const migrator = new PatternMigrator();

  console.log('Starting batch migration...');
  console.log('This will process patterns in batches of 500\n');

  const result = await migrator.migrate({
    sourcePath: './data/agentic-qe.db',
    targetPath: './data/patterns-batch.ruvector',
    batchSize: 500,
    verbose: true,
  });

  console.log('\nBatch Migration Summary:');
  console.log(`  Total: ${result.totalPatterns}`);
  console.log(`  Migrated: ${result.migratedCount}`);
  console.log(`  Skipped: ${result.skippedCount}`);
  console.log(`  Batches: ${Math.ceil(result.totalPatterns / 500)}`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`  Throughput: ${Math.round(result.migratedCount / (result.duration / 1000))} patterns/sec`);
}

/**
 * Example 6: Migration Status Check
 * Monitor migration progress and verify completion
 */
async function migrationStatusCheck() {
  console.log('\n=== Example 6: Migration Status Check ===\n');

  const sourcePath = './data/agentic-qe.db';
  const targetPath = './data/patterns.ruvector';

  const status = await checkMigrationStatus(sourcePath, targetPath);

  console.log('Migration Status:');
  console.log(`  Source Patterns: ${status.sourceCount.toLocaleString()}`);
  console.log(`  Target Patterns: ${status.targetCount.toLocaleString()}`);
  console.log(`  Coverage: ${(status.coverage * 100).toFixed(2)}%`);
  console.log(`  Status: ${status.migrationComplete ? '✅ COMPLETE' : '⚠️  IN PROGRESS'}`);

  if (!status.migrationComplete) {
    const remaining = status.sourceCount - status.targetCount;
    console.log(`\n  ⚠️  ${remaining.toLocaleString()} patterns remaining`);
  }
}

/**
 * Example 7: Rollback Migration
 * Restore from backup if migration fails
 */
async function rollbackMigration() {
  console.log('\n=== Example 7: Rollback Migration ===\n');

  const migrator = new PatternMigrator();

  try {
    // Attempt migration
    console.log('Running migration with backup...');
    const result = await migrator.migrate({
      sourcePath: './data/agentic-qe.db',
      targetPath: './data/patterns-test.ruvector',
      createBackup: true,
      verbose: false,
    });

    console.log(`✅ Migration completed: ${result.migratedCount} patterns`);
    console.log(`   Backup created at: ${result.backupPath}`);

    // Simulate detecting an issue
    console.log('\n❌ Simulating issue detected...');
    console.log('Rolling back migration...');

    await migrator.rollback();
    console.log('✅ Rollback completed successfully');

  } catch (error: any) {
    console.error(`Migration failed: ${error.message}`);
  }
}

/**
 * Example 8: Production Migration Workflow
 * Complete production-ready migration with all safety checks
 */
async function productionMigrationWorkflow() {
  console.log('\n=== Example 8: Production Migration Workflow ===\n');

  const migrator = new PatternMigrator();
  const sourcePath = './data/agentic-qe.db';
  const targetPath = './data/patterns-production.ruvector';

  try {
    // Step 1: Dry-run validation
    console.log('Step 1/5: Running dry-run validation...');
    const dryRunResult = await migrator.migrate({
      sourcePath,
      targetPath,
      dryRun: true,
      verbose: false,
    });

    if (!dryRunResult.validation?.sourceValid) {
      throw new Error('Source validation failed');
    }

    console.log(`✅ Validation passed: ${dryRunResult.totalPatterns} patterns found`);

    // Step 2: Create backup
    console.log('\nStep 2/5: Creating backup...');
    const backupPath = await migrator['createBackup'](sourcePath);
    console.log(`✅ Backup created: ${backupPath}`);

    // Step 3: Perform migration
    console.log('\nStep 3/5: Migrating patterns...');
    const result = await migrator.migrate({
      sourcePath,
      targetPath,
      batchSize: 1000,
      createBackup: false, // Already created
      verbose: true,
    });

    console.log(`✅ Migration completed: ${result.migratedCount}/${result.totalPatterns} patterns`);

    // Step 4: Verify migration
    console.log('\nStep 4/5: Verifying migration...');
    const status = await checkMigrationStatus(sourcePath, targetPath);

    if (!status.migrationComplete) {
      throw new Error('Migration incomplete');
    }

    console.log(`✅ Verification passed: ${status.coverage * 100}% coverage`);

    // Step 5: Validate target store
    console.log('\nStep 5/5: Validating target store...');
    const { store } = await PatternStoreFactory.create({
      preferredBackend: 'ruvector',
      storagePath: targetPath,
    });

    const validation = await PatternStoreFactory.validate(store);

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    console.log('✅ Target store validated');
    console.log('\n🎉 Production migration workflow completed successfully!');

    await store.shutdown();

  } catch (error: any) {
    console.error(`\n❌ Production migration failed: ${error.message}`);
    console.log('Rolling back...');

    try {
      await migrator.rollback();
      console.log('✅ Rollback completed');
    } catch (rollbackError: any) {
      console.error(`❌ Rollback failed: ${rollbackError.message}`);
    }
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  const examples = [
    { name: 'Basic Migration', fn: basicMigration },
    { name: 'Dry-Run Validation', fn: dryRunValidation },
    { name: 'Custom Embedding Migration', fn: customEmbeddingMigration },
    { name: 'Dual-Write Pattern', fn: dualWritePattern },
    { name: 'Batch Migration', fn: batchMigrationWithProgress },
    { name: 'Status Check', fn: migrationStatusCheck },
    { name: 'Rollback', fn: rollbackMigration },
    { name: 'Production Workflow', fn: productionMigrationWorkflow },
  ];

  console.log('Pattern Migration Examples');
  console.log('='.repeat(60));

  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    console.log(`\n[${i + 1}/${examples.length}] ${example.name}`);
    console.log('-'.repeat(60));

    try {
      await example.fn();
    } catch (error: any) {
      console.error(`\n❌ Example failed: ${error.message}`);
    }

    if (i < examples.length - 1) {
      console.log('\n' + '='.repeat(60));
    }
  }

  console.log('\n\n✅ All examples completed!');
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for use in other modules
export {
  basicMigration,
  dryRunValidation,
  customEmbeddingMigration,
  dualWritePattern,
  batchMigrationWithProgress,
  migrationStatusCheck,
  rollbackMigration,
  productionMigrationWorkflow,
};
