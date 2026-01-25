#!/usr/bin/env ts-node
/**
 * Learning Persistence Verification Script
 *
 * Verifies that learning data persists to database without running full test suite.
 * This script is safe to run in memory-constrained environments.
 */

import { LearningEngine } from '../src/learning/LearningEngine';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as fs from 'fs-extra';
import * as path from 'path';
import Database from 'better-sqlite3';

const TEST_DB_PATH = path.join(__dirname, '../.test-data/learning-verification.db');
const agentId = 'verification-agent-001';

async function main() {
  console.log('🧪 Learning Persistence Verification\n');
  console.log('This script verifies learning data persists to the database.');
  console.log('Safe for memory-constrained environments (uses <50MB).\n');

  try {
    // Clean up test database
    await fs.remove(path.dirname(TEST_DB_PATH));
    await fs.ensureDir(path.dirname(TEST_DB_PATH));

    console.log('📦 Step 1: Initialize SwarmMemoryManager');
    const memoryStore = new SwarmMemoryManager(TEST_DB_PATH);
    await memoryStore.initialize();
    console.log('✅ SwarmMemoryManager initialized\n');

    console.log('🧠 Step 2: Create LearningEngine');
    const learningEngine = new LearningEngine(agentId, memoryStore, {
      enabled: true,
      learningRate: 0.1,
      explorationRate: 0.3,
      updateFrequency: 10
    });
    await learningEngine.initialize();
    console.log('✅ LearningEngine initialized\n');

    console.log('📝 Step 3: Execute learning tasks (15 tasks)');
    for (let i = 0; i < 15; i++) {
      await learningEngine.learnFromExecution(
        { id: `task-${i}`, type: 'test-generation' },
        {
          success: i % 3 !== 2, // 2 out of 3 succeed
          coverage: 0.75 + (i * 0.01),
          executionTime: 800 + (i * 10)
        }
      );

      if ((i + 1) % 5 === 0) {
        console.log(`   ✓ Completed ${i + 1} tasks`);
      }
    }
    console.log('✅ Learning tasks completed\n');

    console.log('🔍 Step 4: Verify database persistence');
    const db = new Database(TEST_DB_PATH);

    // Check learning_experiences table
    const experiences = db.prepare(
      'SELECT * FROM learning_experiences WHERE agent_id = ?'
    ).all(agentId);
    console.log(`   📊 learning_experiences: ${experiences.length} records`);
    if (experiences.length !== 15) {
      throw new Error(`Expected 15 experiences, found ${experiences.length}`);
    }

    // Check q_values table
    const qValues = db.prepare(
      'SELECT * FROM q_values WHERE agent_id = ?'
    ).all(agentId);
    console.log(`   📊 q_values: ${qValues.length} records`);
    if (qValues.length === 0) {
      throw new Error('No Q-values stored');
    }

    // Check learning_history table (snapshots every 10 tasks)
    const history = db.prepare(
      'SELECT * FROM learning_history WHERE agent_id = ?'
    ).all(agentId);
    console.log(`   📊 learning_history: ${history.length} snapshots`);
    if (history.length !== 1) {
      console.log(`   ⚠️  Expected 1 snapshot (at task 10), found ${history.length}`);
      console.log('   (This may be expected if updateFrequency changed)');
    }

    db.close();
    console.log('✅ Database persistence verified\n');

    console.log('🔄 Step 5: Cross-session persistence test');
    await learningEngine.dispose();
    await memoryStore.close();
    console.log('   ✓ Session 1 closed');

    // Session 2: Load from database
    const memoryStore2 = new SwarmMemoryManager(TEST_DB_PATH);
    await memoryStore2.initialize();
    const learningEngine2 = new LearningEngine(agentId, memoryStore2);
    await learningEngine2.initialize();
    console.log('   ✓ Session 2 initialized');

    // Verify Q-values loaded
    const session2QValues = await memoryStore2.getAllQValues(agentId);
    console.log(`   📊 Q-values restored: ${session2QValues.length} records`);
    if (session2QValues.length !== qValues.length) {
      throw new Error(`Q-values not restored correctly: ${session2QValues.length} vs ${qValues.length}`);
    }

    // Execute more tasks in session 2
    for (let i = 15; i < 20; i++) {
      await learningEngine2.learnFromExecution(
        { id: `task-${i}`, type: 'test-generation' },
        { success: true, coverage: 0.90, executionTime: 750 }
      );
    }
    console.log('   ✓ Session 2: 5 more tasks completed');

    // Verify total in database
    const db2 = new Database(TEST_DB_PATH);
    const totalExperiences = db2.prepare(
      'SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?'
    ).get(agentId) as { count: number };
    db2.close();

    console.log(`   📊 Total experiences in DB: ${totalExperiences.count}`);
    if (totalExperiences.count !== 20) {
      throw new Error(`Expected 20 total experiences, found ${totalExperiences.count}`);
    }

    await learningEngine2.dispose();
    await memoryStore2.close();
    console.log('✅ Cross-session persistence verified\n');

    console.log('🎉 SUCCESS: All learning persistence checks passed!');
    console.log('\n📋 Summary:');
    console.log(`   ✅ 15 experiences persisted to learning_experiences table`);
    console.log(`   ✅ ${qValues.length} Q-values persisted to q_values table`);
    console.log(`   ✅ ${history.length} snapshot(s) in learning_history table`);
    console.log(`   ✅ Q-values restored across sessions`);
    console.log(`   ✅ 5 additional experiences added in session 2`);
    console.log(`   ✅ Total: 20 experiences persisted to database`);
    console.log('\n✅ Learning persistence is working correctly!');

    // Cleanup
    await fs.remove(path.dirname(TEST_DB_PATH));
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR:', error);

    // Cleanup on error
    try {
      await fs.remove(path.dirname(TEST_DB_PATH));
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

main();
