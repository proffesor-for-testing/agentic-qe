#!/usr/bin/env node
/**
 * Test Real AgentDB Integration
 * Verifies that real AgentDB works with our adapter
 */

const { createRealAgentDBAdapter } = require('../dist/core/memory/RealAgentDBAdapter');
const fs = require('fs');
const path = require('path');

async function testRealAgentDB() {
  console.log('🧪 Testing Real AgentDB Integration\n');
  console.log('='.repeat(60));

  const testDir = path.join(process.cwd(), '.test-real-agentdb');
  const dbPath = path.join(testDir, 'test-vectors.db');

  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  try {
    // Step 1: Create adapter
    console.log('\n📦 Step 1: Creating real AgentDB adapter...');
    const adapter = createRealAgentDBAdapter({
      dbPath: dbPath,
      dimension: 384
    });

    await adapter.initialize();
    console.log('✅ Real AgentDB initialized');

    // Step 2: Store some patterns
    console.log('\n💾 Step 2: Storing patterns...');
    const pattern1 = {
      id: 'pattern-001',
      type: 'test-pattern',
      data: { description: 'Unit test pattern' },
      embedding: Array.from({ length: 384 }, () => Math.random()),
      confidence: 0.95
    };

    const pattern2 = {
      id: 'pattern-002',
      type: 'test-pattern',
      data: { description: 'Integration test pattern' },
      embedding: Array.from({ length: 384 }, () => Math.random()),
      confidence: 0.90
    };

    const id1 = await adapter.store(pattern1);
    const id2 = await adapter.store(pattern2);
    console.log(`✅ Stored pattern1: ${id1}`);
    console.log(`✅ Stored pattern2: ${id2}`);

    // Step 3: Batch insert
    console.log('\n📦 Step 3: Batch inserting patterns...');
    const batchPatterns = Array.from({ length: 10 }, (_, i) => ({
      id: `batch-pattern-${i}`,
      type: 'batch-test',
      data: { index: i },
      embedding: Array.from({ length: 384 }, () => Math.random()),
      confidence: 0.85
    }));

    const batchIds = await adapter.storeBatch(batchPatterns);
    console.log(`✅ Batch inserted ${batchIds.length} patterns`);

    // Step 4: Search
    console.log('\n🔍 Step 4: Searching for similar patterns...');
    const queryEmbedding = Array.from({ length: 384 }, () => Math.random());
    const searchResults = await adapter.retrieveWithReasoning(queryEmbedding, {
      topK: 5,
      threshold: 0.0
    });

    console.log(`✅ Found ${searchResults.patterns.length} similar patterns`);
    console.log('   Top results:');
    searchResults.patterns.slice(0, 3).forEach(p => {
      console.log(`     - ${p.id}: similarity=${p.metadata.similarity.toFixed(4)}, confidence=${p.confidence}`);
    });

    // Step 5: Get statistics
    console.log('\n📊 Step 5: Getting database statistics...');
    const stats = await adapter.getStats();
    console.log(`   Total vectors: ${stats.totalVectors}`);
    console.log(`   Dimension: ${stats.dimension}`);
    console.log(`   Mode: ${stats.mode}`);
    console.log(`   Memory usage: ${(stats.memoryUsageBytes / 1024 / 1024).toFixed(2)} MB`);
    if (stats.performance) {
      console.log(`   Avg search latency: ${stats.performance.avgSearchLatencyUs.toFixed(0)} μs`);
    }

    // Step 6: Verify database file
    console.log('\n📁 Step 6: Verifying database file...');
    if (fs.existsSync(dbPath)) {
      const fileSize = fs.statSync(dbPath).size;
      console.log(`✅ Database file exists: ${(fileSize / 1024).toFixed(2)} KB`);
    } else {
      console.log('⚠️  Database file not found');
    }

    // Cleanup
    await adapter.close();
    console.log('\n✅ Adapter closed');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Real AgentDB Integration Test PASSED\n');

    console.log('📊 Summary:');
    console.log(`   ✅ Initialized: PASS`);
    console.log(`   ✅ Single insert: PASS`);
    console.log(`   ✅ Batch insert: PASS (${batchIds.length} patterns)`);
    console.log(`   ✅ Vector search: PASS (${searchResults.patterns.length} results)`);
    console.log(`   ✅ Statistics: PASS`);
    console.log(`   ✅ Database file: PASS (${(fs.statSync(dbPath).size / 1024).toFixed(2)} KB)`);
    console.log('\n🎉 Real AgentDB is working!\n');

  } catch (error) {
    console.error('\n❌ Test Failed:', error);
    console.error('\n📋 Error details:');
    console.error('   Message:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  } finally {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  }
}

// Run test
testRealAgentDB().catch(console.error);
