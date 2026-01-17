#!/usr/bin/env ts-node
/**
 * Query Validation Status - Check stabilization progress from SwarmMemoryManager
 */

import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as path from 'path';

async function queryStatus() {
  const dbPath = path.join(process.cwd(), '.swarm/memory.db');
  const memory = new SwarmMemoryManager(dbPath);

  try {
    await memory.initialize();

    console.log('🔍 Stabilization Status Query\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Query all checkpoints
    console.log('📊 Checkpoints:');
    for (let i = 1; i <= 10; i++) {
      const checkpoint = await memory.retrieve(`aqe/stabilization/checkpoint-${i}`, {
        partition: 'coordination'
      });

      if (checkpoint) {
        console.log(`\n✓ Checkpoint #${i}:`);
        console.log(`  Pass Rate: ${checkpoint.passRate.toFixed(1)}%`);
        console.log(`  Tests: ${checkpoint.testsPassing}/${checkpoint.testsTotal}`);
        console.log(`  Suites: ${checkpoint.suitesPassing}/${checkpoint.suitesTotal}`);
        console.log(`  Time: ${checkpoint.executionTime.toFixed(1)}s`);
        console.log(`  Tier 1 Progress: ${calculateProgress(checkpoint)}%`);
      }
    }

    // Query agent progress
    console.log('\n\n🤖 Agent Status:');
    const agents = ['TEST-CLEANUP', 'JEST-ENV-FIX', 'CORE-TEST-STABILIZATION'];
    for (const agent of agents) {
      const status = await memory.retrieve(`tasks/${agent}/status`, { partition: 'coordination' });
      console.log(`\n  ${agent}:`);
      if (status) {
        console.log(`    Status: ${status.status || 'unknown'}`);
        if (status.progress) console.log(`    Progress: ${status.progress}`);
        if (status.timestamp) console.log(`    Last Update: ${new Date(status.timestamp).toISOString()}`);
      } else {
        console.log('    No data yet');
      }
    }

    // Query Tier 1 check
    console.log('\n\n🎯 Tier 1 Status:');
    const tier1Check = await memory.retrieve('aqe/stabilization/tier1-check', {
      partition: 'coordination'
    });

    if (tier1Check) {
      console.log(`  Pass Rate (50%+): ${tier1Check.passRate ? '✅' : '❌'}`);
      console.log(`  Suites Stable (30+): ${tier1Check.suitesStable ? '✅' : '❌'}`);
      console.log(`  Execution Fast (<30s): ${tier1Check.executionFast ? '✅' : '❌'}`);
      console.log(`  Overall: ${tier1Check.met ? '🎉 MET' : '⏳ PENDING'}`);
    } else {
      console.log('  No Tier 1 check data yet');
    }

    // Query final decision
    console.log('\n\n📋 Final Decision:');
    const finalDecision = await memory.retrieve('aqe/stabilization/final-decision', {
      partition: 'coordination'
    });

    if (finalDecision) {
      console.log(`  Decision: ${finalDecision.decision}`);
      console.log(`  Pass Rate: ${finalDecision.passRate.toFixed(1)}%`);
      console.log(`  Recommendation: ${finalDecision.recommendation}`);
      console.log(`  Next Steps: ${finalDecision.nextSteps}`);
    } else {
      console.log('  No final decision yet - validation in progress');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await memory.close();
  } catch (error) {
    console.error('❌ Error querying status:', error);
    await memory.close();
    process.exit(1);
  }
}

function calculateProgress(checkpoint: any): string {
  let score = 0;
  if (checkpoint.tier1Criteria.passRate50) score += 33.33;
  if (checkpoint.tier1Criteria.suitesStable) score += 33.33;
  if (checkpoint.tier1Criteria.executionFast) score += 33.34;
  return score.toFixed(1);
}

queryStatus().catch(console.error);
