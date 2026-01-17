/**
 * Verify Test Failure Analysis Storage
 * Confirms data is stored in SwarmMemoryManager and retrieves it
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function verifyAnalysisStorage() {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();

  console.log('🔍 Verifying analysis storage...\n');

  try {
    // Retrieve stored analysis
    const analysis = await memoryStore.retrieve('aqe/test-analysis/failures', {
      partition: 'coordination'
    });

    if (!analysis) {
      console.error('❌ No analysis data found!');
      process.exit(1);
    }

    console.log('✅ Analysis data found in SwarmMemoryManager!\n');
    console.log('📊 STORED ANALYSIS SUMMARY:\n');
    console.log(`  Timestamp: ${new Date(analysis.timestamp).toISOString()}`);
    console.log(`  Agent: ${analysis.agent}`);
    console.log(`  Total Failed Files: ${analysis.totalFailedFiles}`);
    console.log(`  Total Failed Tests: ${analysis.totalFailedTests}`);
    console.log(`  Total Failure Instances: ${analysis.totalFailures}`);
    console.log(`  Categories: ${Object.keys(analysis.categories).length}\n`);

    console.log('🔥 CATEGORIES:\n');
    Object.entries(analysis.categories).forEach(([key, cat]: [string, any]) => {
      const priorityEmoji = cat.priority === 'critical' ? '🔴' :
                           cat.priority === 'high' ? '🟡' : '🟢';
      console.log(`  ${priorityEmoji} ${cat.name}`);
      console.log(`     Priority: ${cat.priority.toUpperCase()}`);
      console.log(`     Count: ${cat.count}`);
      console.log(`     Root Cause: ${cat.rootCause.substring(0, 80)}...`);
      console.log('');
    });

    console.log('✅ Verification complete!\n');
    console.log('📄 Full report: /workspaces/agentic-qe-cf/docs/reports/TEST-FAILURE-ANALYSIS.md');
    console.log('💾 Database: /workspaces/agentic-qe-cf/.swarm/memory.db');
    console.log('🔑 Memory Key: aqe/test-analysis/failures');
    console.log('📦 Partition: coordination');

    await memoryStore.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Verification failed:', error);
    await memoryStore.close();
    process.exit(1);
  }
}

verifyAnalysisStorage();
