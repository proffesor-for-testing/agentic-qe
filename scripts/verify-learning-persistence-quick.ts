#!/usr/bin/env ts-node
/**
 * Quick Learning Persistence Verification
 *
 * Verifies that learning data persists to database without running full integration suite.
 * Safe to run in memory-constrained environments.
 */

import { LearningEngine } from '../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import Database from 'better-sqlite3';
import * as fs from 'fs-extra';
import * as path from 'path';

const TEST_DB = '/tmp/learning-verify-quick.db';
const AGENT_ID = 'test-verify-agent';

async function main() {
  console.log('🔍 Quick Learning Persistence Verification\n');

  // Cleanup
  await fs.remove(TEST_DB);

  try {
    // 1. Initialize
    console.log('1️⃣  Initializing SwarmMemoryManager and LearningEngine...');
    const memoryStore = new SwarmMemoryManager(TEST_DB);
    await memoryStore.initialize();

    const learningEngine = new LearningEngine(AGENT_ID, memoryStore, {
      enabled: true,
      learningRate: 0.1,
      updateFrequency: 5 // Snapshot every 5 tasks for faster testing
    });
    await learningEngine.initialize();
    console.log('   ✅ Initialized\n');

    // 2. Execute tasks
    console.log('2️⃣  Executing 7 learning tasks...');
    for (let i = 0; i < 7; i++) {
      await learningEngine.learnFromExecution(
        { id: `task-${i}`, type: 'test-generation' },
        { success: i % 2 === 0, coverage: 0.85 + (i * 0.01) }
      );
    }
    console.log('   ✅ Executed 7 tasks\n');

    // 3. Verify database directly
    console.log('3️⃣  Verifying database persistence...');
    const db = new Database(TEST_DB);

    // Check learning_experiences
    const experiences = db.prepare(
      'SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?'
    ).get(AGENT_ID) as { count: number };
    console.log(`   📊 learning_experiences: ${experiences.count} records`);

    if (experiences.count !== 7) {
      throw new Error(`Expected 7 experiences, got ${experiences.count}`);
    }

    // Check q_values
    const qValues = db.prepare(
      'SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?'
    ).get(AGENT_ID) as { count: number };
    console.log(`   📊 q_values: ${qValues.count} records`);

    if (qValues.count === 0) {
      throw new Error('No Q-values stored!');
    }

    // Check learning_history (should have 1 snapshot at task 5)
    const history = db.prepare(
      'SELECT COUNT(*) as count FROM learning_history WHERE agent_id = ?'
    ).get(AGENT_ID) as { count: number };
    console.log(`   📊 learning_history: ${history.count} snapshots`);

    if (history.count !== 1) {
      throw new Error(`Expected 1 snapshot (at task 5), got ${history.count}`);
    }

    db.close();
    console.log('   ✅ All database tables verified\n');

    // 4. Test cross-session persistence
    console.log('4️⃣  Testing cross-session Q-value persistence...');
    const qValuesSession1 = await memoryStore.getAllQValues(AGENT_ID);
    console.log(`   📊 Session 1 Q-values: ${qValuesSession1.length}`);

    await learningEngine.dispose();
    await memoryStore.close();

    // Session 2
    const memoryStore2 = new SwarmMemoryManager(TEST_DB);
    await memoryStore2.initialize();

    const learningEngine2 = new LearningEngine(AGENT_ID, memoryStore2);
    await learningEngine2.initialize();

    const qValuesSession2 = await memoryStore2.getAllQValues(AGENT_ID);
    console.log(`   📊 Session 2 Q-values: ${qValuesSession2.length}`);

    if (qValuesSession2.length !== qValuesSession1.length) {
      throw new Error(`Q-values not restored! Session1: ${qValuesSession1.length}, Session2: ${qValuesSession2.length}`);
    }

    await learningEngine2.dispose();
    await memoryStore2.close();
    console.log('   ✅ Cross-session persistence verified\n');

    // 5. Summary
    console.log('✅ VERIFICATION PASSED\n');
    console.log('Summary:');
    console.log(`  • Learning experiences: ${experiences.count} ✅`);
    console.log(`  • Q-values persisted: ${qValues.count} ✅`);
    console.log(`  • Snapshots stored: ${history.count} ✅`);
    console.log(`  • Cross-session restore: ✅`);
    console.log('\n🎉 Learning persistence is working correctly!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED\n');
    console.error('Error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await fs.remove(TEST_DB);
  }
}

main();
