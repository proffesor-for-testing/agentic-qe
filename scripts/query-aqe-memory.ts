#!/usr/bin/env ts-node
//
// Query AQE Hooks Data from SwarmMemoryManager
//
// Shows all data stored by agents during Sprint 1 implementation:
// - Memory entries with deploy keys
// - Events emitted
// - Patterns learned
// - Performance metrics

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function queryAQEMemory() {
  console.log('🔍 Querying AQE Hooks Data...\n');

  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memory = new SwarmMemoryManager(dbPath);

  try {
    await memory.initialize();
    console.log('✅ Connected to:', dbPath);
    console.log('📊 Database size: 1.5MB (+ 3.5MB WAL)\n');

    // Get overall stats
    console.log('=== DATABASE STATISTICS ===');
    const stats = await memory.stats();
    console.log(JSON.stringify(stats, null, 2));
    console.log('');

    // Query deployment status entries
    console.log('=== DEPLOYMENT STATUS (Sprint 1) ===');
    try {
      const deployEntries = await memory.query('deploy%', { partition: 'default' });
      if (deployEntries.length > 0) {
        deployEntries.forEach((entry, i) => {
          console.log(`${i + 1}. Key: ${entry.key}`);
          console.log(`   Value: ${JSON.stringify(entry.value).substring(0, 100)}...`);
          console.log(`   Created: ${entry.createdAt ? new Date(entry.createdAt).toISOString() : 'unknown'}`);
          console.log('');
        });
      } else {
        console.log('No deploy entries found');
        console.log('Note: Agents may store data in coordination partition or different keys\n');
      }
    } catch (err) {
      console.log('No deployment entries yet\n');
    }

    // Query all partitions
    console.log('=== ALL PARTITIONS ===');
    console.log('Partitions:', stats.partitions.join(', ') || 'none');
    console.log('');

    // Query coordination partition
    if (stats.partitions.includes('coordination')) {
      console.log('=== COORDINATION DATA ===');
      const coordEntries = await memory.query('%', { partition: 'coordination' });
      coordEntries.slice(0, 5).forEach((entry, i) => {
        console.log(`${i + 1}. Key: ${entry.key}`);
        console.log(`   Value: ${JSON.stringify(entry.value).substring(0, 80)}...`);
        console.log('');
      });
      if (coordEntries.length > 5) {
        console.log(`... and ${coordEntries.length - 5} more entries\n`);
      }
    }

    // Query events
    console.log('=== RECENT EVENTS (Last 10) ===');
    if (stats.totalEvents > 0) {
      try {
        // Query all event types
        const allEvents = await memory.queryEvents('task.completed');
        if (allEvents.length > 0) {
          allEvents.slice(0, 10).forEach((event, i) => {
            console.log(`${i + 1}. Type: ${event.type}`);
            console.log(`   Source: ${event.source}`);
            console.log(`   Time: ${event.timestamp ? new Date(event.timestamp).toISOString() : 'unknown'}`);
            console.log('');
          });
        } else {
          console.log('No events of type "task.completed"');
        }
      } catch (err) {
        console.log('No events found\n');
      }
    } else {
      console.log('No events stored yet');
      console.log('Events are emitted via EventBus during agent execution\n');
    }

    // Query patterns
    console.log('=== LEARNED PATTERNS ===');
    if (stats.totalPatterns > 0) {
      try {
        const patterns = await memory.queryPatternsByConfidence(0.0);
        patterns.forEach((pattern, i) => {
          console.log(`${i + 1}. Pattern: ${pattern.pattern}`);
          console.log(`   Confidence: ${pattern.confidence}`);
          console.log(`   Usage: ${pattern.usageCount} times`);
          console.log('');
        });
      } catch (err) {
        console.log('No patterns found\n');
      }
    } else {
      console.log('No patterns stored yet');
      console.log('Patterns are stored when agents learn reusable solutions\n');
    }

    // Query performance metrics
    console.log('=== PERFORMANCE METRICS ===');
    if (stats.totalMetrics > 0) {
      try {
        const metrics = await memory.queryPerformanceMetrics('hook_execution_time');
        if (metrics.length > 0) {
          console.log('Hook Execution Times:');
          metrics.slice(0, 5).forEach((metric) => {
            console.log(`  - ${metric.value}${metric.unit} (Agent: ${metric.agentId})`);
          });
          console.log('');
        }
      } catch (err) {
        console.log('No performance metrics yet\n');
      }
    } else {
      console.log('No metrics stored yet');
      console.log('Metrics track: hook_execution_time, memory_operation_time, event_emission_time\n');
    }

    // Agent registry
    console.log('=== AGENT REGISTRY ===');
    if (stats.totalAgents > 0) {
      try {
        const activeAgents = await memory.queryAgentsByStatus('active');
        console.log(`Active agents: ${activeAgents.length}`);
        activeAgents.forEach((agent) => {
          console.log(`  - ${agent.id} (Type: ${agent.type})`);
          console.log(`    Capabilities: ${agent.capabilities.join(', ')}`);
          console.log('');
        });
      } catch (err) {
        console.log('No agents registered yet\n');
      }
    } else {
      console.log('No agents registered yet');
      console.log('Agents are registered when spawned via SwarmMemoryManager\n');
    }

    await memory.close();

    // Show documentation locations
    console.log('=== DOCUMENTATION LOCATIONS ===');
    console.log('📋 Reports: docs/reports/');
    console.log('   - SPRINT-1-IMPLEMENTATION-SUMMARY.md');
    console.log('   - DEPLOY-005-completion-report.md');
    console.log('   - TEST-001-RESOLUTION-SUMMARY.md');
    console.log('');
    console.log('📁 Patterns: docs/patterns/');
    console.log('   - eventbus-timing-fixes.md (reusable async patterns)');
    console.log('');
    console.log('📖 Guide: docs/guides/');
    console.log('   - HOW-TO-VIEW-AQE-HOOKS-DATA.md (comprehensive guide)');
    console.log('');

    console.log('✅ Query complete!');
    console.log('For more details, see: docs/guides/HOW-TO-VIEW-AQE-HOOKS-DATA.md');

  } catch (error) {
    console.error('❌ Error querying database:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  queryAQEMemory().catch(console.error);
}

export { queryAQEMemory };
