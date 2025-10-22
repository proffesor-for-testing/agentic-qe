#!/usr/bin/env ts-node
/**
 * Verify Agent Integration Script
 *
 * This script verifies that QE agents are properly integrated with SwarmMemoryManager
 * by checking for actual database entries, events, patterns, and metrics.
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function verifyIntegration() {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memory = new SwarmMemoryManager(dbPath);

  try {
    await memory.initialize();

    console.log('🔍 Verifying SwarmMemoryManager Integration...\n');
    console.log(`📊 Database Location: ${dbPath}\n`);

    // Check for task status entries from deployment
    console.log('📋 Checking Task Entries...');
    const tasks = await memory.query('tasks/%', { partition: 'coordination' });
    console.log(`   ✅ Found ${tasks.length} task entries`);

    if (tasks.length > 0) {
      console.log('   Recent tasks:');
      const sortedTasks = tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      sortedTasks.slice(0, 5).forEach(t => {
        const timestamp = t.createdAt || 0;
        const date = new Date(timestamp);
        const value = typeof t.value === 'object' ? t.value : {};
        console.log(`      - ${t.key}: status=${value.status || 'unknown'}, date=${date.toISOString()}`);
      });
    }

    // Check for events
    console.log('\n📣 Checking Events...');
    const allEvents = await memory.queryEvents('task.completed');
    console.log(`   ✅ Found ${allEvents.length} task completion events`);
    if (allEvents.length > 0) {
      const eventTimestamp = allEvents[0].timestamp || 0;
      console.log(`   Latest: ${allEvents[0].type} at ${new Date(eventTimestamp).toISOString()}`);
    }

    // Check for patterns
    console.log('\n🧩 Checking Learned Patterns...');
    const patterns = await memory.queryPatternsByConfidence(0.0);
    console.log(`   ✅ Found ${patterns.length} learned patterns`);
    if (patterns.length > 0) {
      console.log('   Top patterns:');
      patterns.slice(0, 3).forEach(p => {
        console.log(`      - ${p.pattern}: confidence=${p.confidence}, usage=${p.usageCount}`);
      });
    }

    // Get comprehensive database statistics
    console.log('\n📊 Database Statistics:');
    const stats = await memory.stats();
    console.log(`   Total Entries:        ${stats.totalEntries}`);
    console.log(`   Total Events:         ${stats.totalEvents}`);
    console.log(`   Total Patterns:       ${stats.totalPatterns}`);
    console.log(`   Total Metrics:        ${stats.totalMetrics}`);
    console.log(`   Total Artifacts:      ${stats.totalArtifacts}`);
    console.log(`   Total Workflows:      ${stats.totalWorkflows}`);
    console.log(`   Total Agents:         ${stats.totalAgents}`);
    console.log(`   Partitions:           ${stats.partitions.join(', ')}`);

    if (Object.keys(stats.accessLevels).length > 0) {
      console.log('   Access Levels:');
      Object.entries(stats.accessLevels).forEach(([level, count]) => {
        console.log(`      - ${level}: ${count} entries`);
      });
    }

    // Check for performance metrics
    console.log('\n⚡ Checking Performance Metrics...');
    const deployMetrics = await memory.queryPerformanceMetrics('task_execution_time');
    console.log(`   ✅ Found ${deployMetrics.length} execution time metrics`);
    if (deployMetrics.length > 0) {
      const avgTime = deployMetrics.reduce((sum, m) => sum + m.value, 0) / deployMetrics.length;
      console.log(`   Average execution time: ${Math.round(avgTime / 1000)}s`);
    }

    // Integration health check
    console.log('\n🏥 Integration Health Check:');
    const hasRecentData = tasks.some(t => {
      const age = Date.now() - (t.createdAt || 0);
      return age < 24 * 60 * 60 * 1000; // Less than 24 hours old
    });

    if (hasRecentData) {
      console.log('   ✅ PASS: Recent data found (last 24 hours)');
    } else if (tasks.length > 0) {
      console.log('   ⚠️  WARN: Data found but may be older than 24 hours');
    } else {
      console.log('   ❌ FAIL: No integration data found in database');
    }

    if (stats.totalEntries > 0 || stats.totalEvents > 0 || stats.totalPatterns > 0) {
      console.log('   ✅ PASS: Database is actively used');
    } else {
      console.log('   ❌ FAIL: Database appears empty or unused');
    }

    console.log('\n✅ Verification complete!');

    await memory.close();

    // Exit with appropriate code
    process.exit(hasRecentData || stats.totalEntries > 0 ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    await memory.close();
    process.exit(1);
  }
}

// Run verification
verifyIntegration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
