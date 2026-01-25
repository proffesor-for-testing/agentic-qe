#!/usr/bin/env ts-node
/**
 * Verification Script for Issue #79 Fix
 *
 * Tests that learning data (patterns, Q-values, experiences) are
 * properly persisted to SQLite database.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { LearningStorePatternHandler } from '../src/mcp/handlers/learning/learning-store-pattern';
import { LearningStoreExperienceHandler } from '../src/mcp/handlers/learning/learning-store-experience';
import { LearningStoreQValueHandler } from '../src/mcp/handlers/learning/learning-store-qvalue';
import { LearningQueryHandler } from '../src/mcp/handlers/learning/learning-query';

const TEST_DB_PATH = '/tmp/test-issue-79-fix.db';

async function runVerification() {
  console.log('🔍 Verifying Issue #79 Fix: Learning Persistence\n');

  // Clean up any existing test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  let passed = 0;
  let failed = 0;

  // Initialize memory manager
  console.log('1️⃣  Initializing SwarmMemoryManager...');
  const memoryManager = new SwarmMemoryManager(TEST_DB_PATH);
  await memoryManager.initialize();
  console.log('   ✅ Memory manager initialized\n');

  // Test 1: Store and retrieve pattern
  console.log('2️⃣  Testing Pattern Persistence...');
  try {
    const patternHandler = new LearningStorePatternHandler(undefined, undefined, memoryManager);

    // Store a pattern
    const storeResult = await patternHandler.handle({
      agentId: 'test-agent-1',
      pattern: 'Always validate inputs before processing',
      confidence: 0.95,
      domain: 'validation',
      successRate: 0.98,
      metadata: { source: 'issue-79-test' }
    });

    if (!storeResult.success) {
      throw new Error(`Pattern store failed: ${JSON.stringify(storeResult)}`);
    }

    // Query the pattern
    const queryHandler = new LearningQueryHandler(undefined, undefined, memoryManager);
    const queryResult = await queryHandler.handle({
      agentId: 'test-agent-1',
      queryType: 'patterns',
      limit: 10
    });

    if (!queryResult.success || !queryResult.data?.patterns || queryResult.data.patterns.length === 0) {
      throw new Error(`Pattern query returned empty: ${JSON.stringify(queryResult)}`);
    }

    const storedPattern = queryResult.data.patterns[0];
    if (storedPattern.pattern !== 'Always validate inputs before processing') {
      throw new Error(`Pattern content mismatch`);
    }

    console.log('   ✅ Pattern stored and retrieved successfully');
    console.log(`   📝 Pattern ID: ${storeResult.data?.patternId}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ Pattern test failed: ${error}`);
    failed++;
  }

  // Test 2: Store and retrieve Q-value
  console.log('\n3️⃣  Testing Q-Value Persistence...');
  try {
    const qvalueHandler = new LearningStoreQValueHandler(undefined, undefined, memoryManager);

    // Store a Q-value
    const storeResult = await qvalueHandler.handle({
      agentId: 'test-agent-1',
      stateKey: 'state:test_execution',
      actionKey: 'action:parallel_run',
      qValue: 0.85,
      metadata: { source: 'issue-79-test' }
    });

    if (!storeResult.success) {
      throw new Error(`Q-value store failed: ${JSON.stringify(storeResult)}`);
    }

    // Query Q-values
    const queryHandler = new LearningQueryHandler(undefined, undefined, memoryManager);
    const queryResult = await queryHandler.handle({
      agentId: 'test-agent-1',
      queryType: 'qvalues',
      limit: 10
    });

    if (!queryResult.success || !queryResult.data?.qValues || queryResult.data.qValues.length === 0) {
      throw new Error(`Q-value query returned empty: ${JSON.stringify(queryResult)}`);
    }

    console.log('   ✅ Q-value stored and retrieved successfully');
    console.log(`   📝 Q-Value ID: ${storeResult.data?.qValueId}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ Q-value test failed: ${error}`);
    failed++;
  }

  // Test 3: Store and retrieve learning experience
  console.log('\n4️⃣  Testing Experience Persistence...');
  try {
    const experienceHandler = new LearningStoreExperienceHandler(undefined, undefined, memoryManager);

    // Store an experience
    const storeResult = await experienceHandler.handle({
      agentId: 'test-agent-1',
      taskType: 'test_generation',
      reward: 0.9,
      outcome: { tests_generated: 5, coverage_increase: 0.15 },
      metadata: { source: 'issue-79-test' }
    });

    if (!storeResult.success) {
      throw new Error(`Experience store failed: ${JSON.stringify(storeResult)}`);
    }

    // Query experiences
    const queryHandler = new LearningQueryHandler(undefined, undefined, memoryManager);
    const queryResult = await queryHandler.handle({
      agentId: 'test-agent-1',
      queryType: 'experiences',
      limit: 10
    });

    if (!queryResult.success || !queryResult.data?.experiences || queryResult.data.experiences.length === 0) {
      throw new Error(`Experience query returned empty: ${JSON.stringify(queryResult)}`);
    }

    console.log('   ✅ Experience stored and retrieved successfully');
    console.log(`   📝 Experience ID: ${storeResult.data?.experienceId}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ Experience test failed: ${error}`);
    failed++;
  }

  // Test 4: Verify persistence survives reconnection
  console.log('\n5️⃣  Testing Persistence Across Reconnection...');
  try {
    // Close the connection
    await memoryManager.close();

    // Open a new connection
    const memoryManager2 = new SwarmMemoryManager(TEST_DB_PATH);
    await memoryManager2.initialize();

    // Query for the previously stored pattern
    const queryHandler = new LearningQueryHandler(undefined, undefined, memoryManager2);
    const queryResult = await queryHandler.handle({
      agentId: 'test-agent-1',
      queryType: 'all',
      limit: 10
    });

    if (!queryResult.success) {
      throw new Error(`Reconnection query failed: ${JSON.stringify(queryResult)}`);
    }

    const { patterns, qValues, experiences } = queryResult.data;

    if (!patterns || patterns.length === 0) {
      throw new Error('Patterns not persisted across reconnection');
    }
    if (!qValues || qValues.length === 0) {
      throw new Error('Q-values not persisted across reconnection');
    }
    if (!experiences || experiences.length === 0) {
      throw new Error('Experiences not persisted across reconnection');
    }

    console.log('   ✅ All data persisted across database reconnection');
    console.log(`   📊 Found: ${patterns.length} patterns, ${qValues.length} Q-values, ${experiences.length} experiences`);

    await memoryManager2.close();
    passed++;
  } catch (error) {
    console.log(`   ❌ Reconnection test failed: ${error}`);
    failed++;
  }

  // Test 5: Verify database file was actually modified
  console.log('\n6️⃣  Testing Database File Modification...');
  try {
    const stats = fs.statSync(TEST_DB_PATH);
    const sizeMB = (stats.size / 1024).toFixed(2);

    if (stats.size < 1000) {
      throw new Error(`Database file too small: ${stats.size} bytes`);
    }

    console.log('   ✅ Database file verified');
    console.log(`   📁 File size: ${sizeMB} KB`);
    console.log(`   📅 Last modified: ${stats.mtime.toISOString()}`);
    passed++;
  } catch (error) {
    console.log(`   ❌ Database file test failed: ${error}`);
    failed++;
  }

  // Cleanup
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log('='.repeat(50));

  if (failed === 0) {
    console.log('\n🎉 Issue #79 Fix VERIFIED: Learning persistence is working correctly!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Issue #79 Fix has failures. Please review.\n');
    process.exit(1);
  }
}

runVerification().catch(error => {
  console.error('Verification failed with error:', error);
  process.exit(1);
});
