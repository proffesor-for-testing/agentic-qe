#!/usr/bin/env node
/**
 * End-to-End Learning Persistence Test
 *
 * Simulates a QE agent (qe-coverage-analyzer) using the learning MCP tools
 * to verify that learning data persists correctly to the database.
 *
 * Tests all 4 learning tools:
 * 1. learning_store_experience
 * 2. learning_store_qvalue
 * 3. learning_store_pattern
 * 4. learning_query
 */

const { AgenticQEMCPServer } = require('../dist/mcp/server.js');
const Database = require('better-sqlite3');
const fs = require('fs-extra');
const path = require('path');

const TEST_DB = '/tmp/learning-e2e-test.db';

async function testLearningE2E() {
  console.log('🧪 End-to-End Learning Persistence Test\n');
  console.log('Simulating: qe-coverage-analyzer agent using learning tools\n');

  // Cleanup
  await fs.remove(TEST_DB);

  try {
    // Step 1: Initialize MCP server
    console.log('1️⃣  Initializing MCP Server...');
    const server = new AgenticQEMCPServer();
    const handlers = server.handlers;
    console.log('   ✅ Server initialized\n');

    // Step 2: Initialize database (simulate SwarmMemoryManager initialization)
    console.log('2️⃣  Initializing test database...');
    const db = new Database(TEST_DB);

    // Create learning tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS learning_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        task_type TEXT NOT NULL,
        state TEXT,
        action TEXT,
        reward REAL,
        next_state TEXT,
        metadata TEXT,
        created_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS q_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        action_key TEXT NOT NULL,
        q_value REAL,
        update_count INTEGER DEFAULT 1,
        metadata TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        UNIQUE(agent_id, state_key, action_key)
      );

      CREATE TABLE IF NOT EXISTS test_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT,
        pattern TEXT NOT NULL,
        confidence REAL NOT NULL,
        domain TEXT,
        usage_count INTEGER DEFAULT 1,
        success_rate REAL DEFAULT 1.0,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    console.log('   ✅ Database initialized\n');

    // Step 3: Create mock memory manager with the test database
    const mockMemoryManager = { db };

    // Get handlers and inject mock memory
    const experienceHandler = handlers.get('mcp__agentic_qe__learning_store_experience');
    const qvalueHandler = handlers.get('mcp__agentic_qe__learning_store_qvalue');
    const patternHandler = handlers.get('mcp__agentic_qe__learning_store_pattern');
    const queryHandler = handlers.get('mcp__agentic_qe__learning_query');

    // Inject mock memory manager
    experienceHandler.memoryManager = mockMemoryManager;
    qvalueHandler.memoryManager = mockMemoryManager;
    patternHandler.memoryManager = mockMemoryManager;
    queryHandler.memoryManager = mockMemoryManager;

    console.log('3️⃣  Simulating agent task execution...\n');

    // Step 4: Simulate agent storing learning experience
    console.log('   📝 Agent: Storing learning experience...');
    const expResult = await experienceHandler.handle({
      agentId: 'qe-coverage-analyzer',
      taskType: 'coverage-analysis',
      reward: 0.95,
      outcome: {
        coverageAnalyzed: true,
        gapsDetected: 42,
        algorithm: 'johnson-lindenstrauss',
        executionTime: 6000,
        coverageImprovement: 0.15
      },
      metadata: {
        algorithm: 'sublinear',
        complexity: 'O(log n)',
        memoryReduction: '90%'
      }
    });

    if (!expResult.success) {
      throw new Error(`Experience storage failed: ${expResult.error}`);
    }
    console.log(`   ✅ Experience stored: ${expResult.data.experienceId}\n`);

    // Step 5: Simulate agent storing Q-values
    console.log('   📊 Agent: Storing Q-values for strategies...');
    const qval1Result = await qvalueHandler.handle({
      agentId: 'qe-coverage-analyzer',
      stateKey: 'coverage-analysis-state',
      actionKey: 'sublinear-algorithm-jl',
      qValue: 0.85,
      metadata: {
        algorithmUsed: 'johnson-lindenstrauss',
        codebaseSize: 'large',
        performanceGain: '10x'
      }
    });

    const qval2Result = await qvalueHandler.handle({
      agentId: 'qe-coverage-analyzer',
      stateKey: 'gap-detection-state',
      actionKey: 'spectral-sparsification',
      qValue: 0.92,
      metadata: {
        gapsFound: 42,
        accuracy: '94%'
      }
    });

    if (!qval1Result.success || !qval2Result.success) {
      throw new Error('Q-value storage failed');
    }
    console.log(`   ✅ Q-value 1 stored: ${qval1Result.data.qValueId}`);
    console.log(`   ✅ Q-value 2 stored: ${qval2Result.data.qValueId}\n`);

    // Step 6: Simulate agent storing pattern
    console.log('   🎯 Agent: Storing successful pattern...');
    const patternResult = await patternHandler.handle({
      agentId: 'qe-coverage-analyzer',
      pattern: 'Sublinear algorithms (Johnson-Lindenstrauss) provide 10x speedup for large codebases (>10k LOC) with 90% memory reduction',
      confidence: 0.95,
      domain: 'coverage-analysis',
      metadata: {
        algorithm: 'johnson-lindenstrauss',
        useCase: 'large-codebase-analysis',
        performanceMetrics: {
          speedup: '10x',
          memoryReduction: '90%',
          accuracyLoss: '<1%'
        }
      }
    });

    if (!patternResult.success) {
      throw new Error('Pattern storage failed');
    }
    console.log(`   ✅ Pattern stored: ${patternResult.data.patternId}\n`);

    // Step 7: Verify database persistence
    console.log('4️⃣  Verifying database persistence...\n');

    const expCount = db.prepare('SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?')
      .get('qe-coverage-analyzer').count;
    console.log(`   📊 learning_experiences: ${expCount} records`);
    if (expCount !== 1) throw new Error(`Expected 1 experience, found ${expCount}`);

    const qvalCount = db.prepare('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?')
      .get('qe-coverage-analyzer').count;
    console.log(`   📊 q_values: ${qvalCount} records`);
    if (qvalCount !== 2) throw new Error(`Expected 2 Q-values, found ${qvalCount}`);

    const patternCount = db.prepare('SELECT COUNT(*) as count FROM test_patterns WHERE agent_id = ?')
      .get('qe-coverage-analyzer').count;
    console.log(`   📊 test_patterns: ${patternCount} records`);
    if (patternCount !== 1) throw new Error(`Expected 1 pattern, found ${patternCount}`);

    console.log('\n   ✅ All learning data persisted correctly!\n');

    // Step 8: Simulate agent querying past learnings
    console.log('5️⃣  Simulating agent querying past learnings...\n');

    const queryResult = await queryHandler.handle({
      agentId: 'qe-coverage-analyzer',
      taskType: 'coverage-analysis',
      minReward: 0.8,
      queryType: 'all',
      limit: 10
    });

    if (!queryResult.success) {
      throw new Error('Query failed');
    }

    const { experiences, qValues, patterns, stats } = queryResult.data;

    console.log('   📖 Query Results:');
    console.log(`      • Experiences: ${experiences?.length || 0}`);
    console.log(`      • Q-values: ${qValues?.length || 0}`);
    console.log(`      • Patterns: ${patterns?.length || 0}`);

    if (stats) {
      console.log(`      • Total experiences: ${stats.totalExperiences}`);
      console.log(`      • Total Q-values: ${stats.totalQValues}`);
      console.log(`      • Average reward: ${stats.averageReward.toFixed(2)}`);
    }

    // Verify query results
    if (!experiences || experiences.length === 0) throw new Error('No experiences returned');
    if (!qValues || qValues.length === 0) throw new Error('No Q-values returned');
    if (!patterns || patterns.length === 0) throw new Error('No patterns returned');

    console.log('\n   ✅ Query returned all learning data!\n');

    // Step 9: Simulate finding best strategy
    console.log('6️⃣  Simulating agent using learned best strategy...\n');

    const bestStrategy = qValues
      .filter(qv => qv.state_key === 'coverage-analysis-state')
      .sort((a, b) => b.q_value - a.q_value)[0];

    console.log(`   🎯 Best strategy: ${bestStrategy.action_key}`);
    console.log(`      Q-value: ${bestStrategy.q_value}`);

    const metadata = typeof bestStrategy.metadata === 'string'
      ? JSON.parse(bestStrategy.metadata)
      : bestStrategy.metadata;
    console.log(`      Metadata: ${JSON.stringify(metadata, null, 2).split('\n').join('\n      ')}`);

    const topPattern = patterns
      .sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate)[0];

    console.log(`\n   📚 Top pattern: ${topPattern.pattern.substring(0, 60)}...`);
    console.log(`      Confidence: ${topPattern.confidence}`);
    console.log(`      Usage count: ${topPattern.usage_count}`);

    console.log('\n   ✅ Agent successfully retrieved and applied learnings!\n');

    // Step 10: Test Q-value update (weighted average)
    console.log('7️⃣  Testing Q-value weighted averaging...\n');

    console.log('   📊 Storing same Q-value again with different value...');
    const qvalUpdateResult = await qvalueHandler.handle({
      agentId: 'qe-coverage-analyzer',
      stateKey: 'coverage-analysis-state',
      actionKey: 'sublinear-algorithm-jl',
      qValue: 0.95,  // Higher than previous 0.85
      updateCount: 1
    });

    if (!qvalUpdateResult.success) throw new Error('Q-value update failed');

    const updatedQValue = db.prepare('SELECT * FROM q_values WHERE agent_id = ? AND action_key = ?')
      .get('qe-coverage-analyzer', 'sublinear-algorithm-jl');

    console.log(`   ✅ Q-value updated:`);
    console.log(`      Previous: 0.85 (count: 1)`);
    console.log(`      New contribution: 0.95 (count: 1)`);
    console.log(`      Weighted average: ${updatedQValue.q_value} (expected: 0.90)`);
    console.log(`      Update count: ${updatedQValue.update_count} (expected: 2)`);

    const expectedWeighted = 0.90;
    if (Math.abs(updatedQValue.q_value - expectedWeighted) > 0.01) {
      throw new Error(`Weighted average incorrect: expected ${expectedWeighted}, got ${updatedQValue.q_value}`);
    }
    if (updatedQValue.update_count !== 2) {
      throw new Error(`Update count incorrect: expected 2, got ${updatedQValue.update_count}`);
    }

    console.log('\n   ✅ Weighted averaging works correctly!\n');

    // Cleanup
    db.close();
    await fs.remove(TEST_DB);

    // Success summary
    console.log('═'.repeat(70));
    console.log('✅ END-TO-END TEST PASSED');
    console.log('═'.repeat(70));
    console.log('\nVerified:');
    console.log('  ✅ learning_store_experience - Stores task outcomes');
    console.log('  ✅ learning_store_qvalue - Stores and updates Q-values');
    console.log('  ✅ learning_store_pattern - Stores successful patterns');
    console.log('  ✅ learning_query - Retrieves all learning data');
    console.log('  ✅ Weighted averaging - Q-values update correctly');
    console.log('  ✅ Database persistence - Data survives across operations');
    console.log('  ✅ Agent workflow - Complete learn-query-apply cycle works\n');

    console.log('🎉 Learning persistence is fully functional!\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testLearningE2E();
