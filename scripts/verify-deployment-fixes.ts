#!/usr/bin/env ts-node
/**
 * Verification Script - Verify Deployment Fixes
 *
 * Queries SwarmMemoryManager to retrieve all task statuses,
 * events, and learned patterns from the deployment fixes.
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function main() {
  console.log('🔍 Verifying Deployment Fixes...\n');

  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();

  try {
    // Retrieve all deployment task statuses
    console.log('📋 TASK STATUSES:\n');
    const taskIds = ['DEPLOY-002', 'DEPLOY-003', 'DEPLOY-004', 'DEPLOY-005', 'DEPLOY-006'];

    for (const taskId of taskIds) {
      const status = await memoryStore.retrieve(`tasks/${taskId}/status`, {
        partition: 'coordination'
      });

      if (status) {
        console.log(`✅ ${taskId}:`);
        console.log(`   Status: ${status.status}`);
        console.log(`   Files Modified: ${status.filesModified.length}`);
        status.filesModified.forEach((file: string) => {
          console.log(`     - ${file}`);
        });
        console.log(`   Timestamp: ${new Date(status.timestamp).toISOString()}`);
        console.log();
      } else {
        console.log(`❌ ${taskId}: Not found\n`);
      }
    }

    // Query events
    console.log('\n📡 EVENTS:\n');
    const startedEvents = await memoryStore.queryEvents('task.started');
    const completedEvents = await memoryStore.queryEvents('task.completed');
    const failedEvents = await memoryStore.queryEvents('task.failed');

    console.log(`Task Started: ${startedEvents.length}`);
    console.log(`Task Completed: ${completedEvents.length}`);
    console.log(`Task Failed: ${failedEvents.length}`);

    // Query learned patterns
    console.log('\n🧠 LEARNED PATTERNS:\n');
    const patterns = await memoryStore.queryPatternsByConfidence(0.8);

    patterns.forEach(pattern => {
      console.log(`✓ ${pattern.pattern}`);
      console.log(`  Confidence: ${(pattern.confidence * 100).toFixed(0)}%`);
      console.log(`  Usage Count: ${pattern.usageCount}`);
      if (pattern.metadata) {
        console.log(`  Category: ${pattern.metadata.category || 'N/A'}`);
      }
      console.log();
    });

    // Get memory statistics
    console.log('\n📊 MEMORY STATISTICS:\n');
    const stats = await memoryStore.stats();
    console.log(`Total Entries: ${stats.totalEntries}`);
    console.log(`Total Events: ${stats.totalEvents}`);
    console.log(`Total Patterns: ${stats.totalPatterns}`);
    console.log(`Partitions: ${stats.partitions.join(', ')}`);
    console.log('\nAccess Levels:');
    Object.entries(stats.accessLevels).forEach(([level, count]) => {
      console.log(`  ${level}: ${count}`);
    });

    console.log('\n✅ Verification complete!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await memoryStore.close();
  }
}

if (require.main === module) {
  main().catch(console.error);
}
