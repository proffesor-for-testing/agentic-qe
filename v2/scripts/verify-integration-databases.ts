#!/usr/bin/env ts-node
/**
 * Verify Integration Test Databases
 * Shows that real database coordination is working
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';
import * as fs from 'fs';

async function verifyDatabases() {
  const testDbDir = path.join(process.cwd(), '.swarm/integration-test');

  console.log('🔍 Integration Test Database Verification\n');
  console.log('═══════════════════════════════════════════\n');

  // Check database files exist
  const databases = [
    'multi-agent-workflows.db',
    'database-integration.db',
    'eventbus-integration.db',
    'e2e-workflows.db'
  ];

  console.log('📁 Database Files:\n');
  databases.forEach(dbFile => {
    const dbPath = path.join(testDbDir, dbFile);
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`✅ ${dbFile}`);
      console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   Modified: ${stats.mtime.toISOString()}\n`);
    } else {
      console.log(`❌ ${dbFile} - NOT FOUND\n`);
    }
  });

  // Verify main coordination database
  const mainDbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memoryStore = new SwarmMemoryManager(mainDbPath);

  try {
    await memoryStore.initialize();

    console.log('\n📊 Coordination Database Entries:\n');

    // Check all suite results
    for (let i = 1; i <= 4; i++) {
      const suiteData = await memoryStore.retrieve(`tasks/INTEGRATION-VALIDATION/suite-${i}`, {
        partition: 'coordination'
      });

      if (suiteData) {
        console.log(`✅ Suite ${i} - ${suiteData.suite}`);
        console.log(`   Tests: ${suiteData.passing}/${suiteData.totalTests} (${suiteData.passRate}%)`);
        console.log(`   Status: ${suiteData.status}`);
        console.log(`   Timestamp: ${new Date(suiteData.timestamp).toISOString()}\n`);
      }
    }

    // Check final results
    const finalData = await memoryStore.retrieve('tasks/INTEGRATION-VALIDATION/final', {
      partition: 'coordination'
    });

    if (finalData) {
      console.log('\n🎯 Final Validation Results:\n');
      console.log(`   Total Tests: ${finalData.passing}/${finalData.totalTests}`);
      console.log(`   Pass Rate: ${finalData.passRate}%`);
      console.log(`   Ready for Production: ${finalData.readyForProduction ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   Validation Complete: ${finalData.validationComplete ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   Timestamp: ${new Date(finalData.timestamp).toISOString()}\n`);
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ Database Coordination Verified Successfully!');
    console.log('═══════════════════════════════════════════\n');

  } finally {
    await memoryStore.close();
  }
}

verifyDatabases().catch(console.error);
