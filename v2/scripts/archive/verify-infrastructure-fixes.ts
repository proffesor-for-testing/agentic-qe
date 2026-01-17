#!/usr/bin/env ts-node
/**
 * Verify Infrastructure Fixes
 *
 * This script verifies that all infrastructure fixes are properly stored
 * and retrieves them from SwarmMemoryManager.
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function main() {
  console.log('🔍 Verifying infrastructure fixes from SwarmMemoryManager...\n');

  // Initialize SwarmMemoryManager
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();

  // ============================================================================
  // Verify Individual Fixes
  // ============================================================================

  const fixes = ['INFRA-FIX-001', 'INFRA-FIX-002', 'INFRA-FIX-003'];

  for (const fixId of fixes) {
    console.log(`📋 ${fixId}:`);

    const fixData = await memoryStore.retrieve(`tasks/${fixId}/status`, {
      partition: 'coordination'
    });

    if (fixData) {
      console.log(`  ✅ Status: ${fixData.status}`);
      console.log(`  📝 Type: ${fixData.fixType}`);
      console.log(`  📄 Files: ${fixData.filesModified.length}`);
      console.log(`  🧪 Tests Fixed: ${fixData.testsFixed}`);
      console.log(`  ⚠️  Priority: ${fixData.priority}`);
      console.log(`  📅 Timestamp: ${new Date(fixData.timestamp).toISOString()}`);
    } else {
      console.log(`  ❌ Not found in memory`);
    }
    console.log();
  }

  // ============================================================================
  // Verify Patterns
  // ============================================================================

  console.log('📊 Patterns:');

  const patterns = [
    'eventbus-initialization-fix',
    'database-auto-initialization',
    'test-setup-global-initialization'
  ];

  for (const patternName of patterns) {
    try {
      const pattern = await memoryStore.getPattern(patternName);
      console.log(`  ✅ ${patternName}:`);
      console.log(`     Confidence: ${pattern.confidence}`);
      console.log(`     Usage: ${pattern.usageCount}`);
    } catch (error) {
      console.log(`  ❌ ${patternName}: Not found`);
    }
  }
  console.log();

  // ============================================================================
  // Verify Summary
  // ============================================================================

  console.log('📈 Summary:');

  const summary = await memoryStore.retrieve('infrastructure/fixes/summary', {
    partition: 'coordination'
  });

  if (summary) {
    console.log(`  Total Fixes: ${summary.totalFixes}`);
    console.log(`  Total Files Modified: ${summary.totalFilesModified}`);
    console.log(`  Total Tests Fixed: ${summary.totalTestsFixed}`);
    console.log(`  Patterns Learned: ${summary.patterns.length}`);
    console.log(`  Timestamp: ${new Date(summary.timestamp).toISOString()}`);
  } else {
    console.log('  ❌ Summary not found');
  }
  console.log();

  // ============================================================================
  // Verify Events
  // ============================================================================

  console.log('📡 Events:');

  const taskEvents = await memoryStore.queryEvents('task.completed');
  console.log(`  Task Completed Events: ${taskEvents.length}`);

  const infraEvents = await memoryStore.queryEvents('infrastructure.fixed');
  console.log(`  Infrastructure Fixed Events: ${infraEvents.length}`);
  console.log();

  // ============================================================================
  // Verify Metrics
  // ============================================================================

  console.log('📊 Metrics:');

  const metrics = await memoryStore.queryPerformanceMetrics('infrastructure-fixes-completed');
  console.log(`  Infrastructure Fixes Metric: ${metrics.length > 0 ? metrics[0].value : 0}`);
  console.log();

  // ============================================================================
  // Overall Stats
  // ============================================================================

  const stats = await memoryStore.stats();

  console.log('📈 Overall SwarmMemoryManager Stats:');
  console.log(`  Total Entries: ${stats.totalEntries}`);
  console.log(`  Total Patterns: ${stats.totalPatterns}`);
  console.log(`  Total Events: ${stats.totalEvents}`);
  console.log(`  Total Metrics: ${stats.totalMetrics}`);
  console.log(`  Partitions: ${stats.partitions.join(', ')}`);

  // Cleanup
  await memoryStore.close();

  console.log('\n✅ Verification complete!');
}

main().catch((error) => {
  console.error('❌ Error verifying infrastructure fixes:', error);
  process.exit(1);
});
