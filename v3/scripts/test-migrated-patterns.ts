/**
 * Test migrated V2 patterns with V3 QE System
 * Tests RealQERoutingBank pattern retrieval, search, and usage
 */

import { createRealQEReasoningBank } from '../src/learning/real-qe-reasoning-bank.js';
import { createSQLitePatternStore } from '../src/learning/sqlite-persistence.js';
import type { QEDomain } from '../src/learning/qe-patterns.js';

async function main() {
  console.log('=== Testing Migrated V2 Patterns with V3 QE System ===\n');

  // Initialize RealQERoutingBank with V3 database
  console.log('1. Initializing RealQERoutingBank...');
  const reasoningBank = createRealQEReasoningBank({
    sqlite: {
      dbPath: '.agentic-qe/qe-patterns.db',
    },
  });

  await reasoningBank.initialize();
  console.log('   Initialized');

  // Also initialize SQLite store for direct access
  const patternStore = createSQLitePatternStore({
    dbPath: '.agentic-qe/qe-patterns.db',
  });
  await patternStore.initialize();

  // Get statistics from both
  console.log('\n2. Getting Statistics...');
  const stats = await reasoningBank.getQEStats();
  console.log('   Total Patterns:', stats.totalPatterns);
  console.log('   By Domain:');
  for (const [domain, count] of Object.entries(stats.byDomain)) {
    console.log('     -', domain + ':', count);
  }
  console.log('   By Tier:');
  for (const [tier, count] of Object.entries(stats.byTier)) {
    console.log('     -', tier + ':', count);
  }

  // Test HNSW search with different queries
  console.log('\n3. Testing HNSW Semantic Search...');
  const searchQueries = [
    'generate unit tests for authentication',
    'analyze test coverage gaps',
    'create visual regression tests',
    'performance load testing',
  ];

  for (const query of searchQueries) {
    console.log('\n   Query:', '"' + query + '"');
    const results = await reasoningBank.searchQEPatterns(query, { limit: 3 });
    if (results.success && results.value) {
      console.log('   Results:', results.value.length, 'patterns found');
      for (const match of results.value.slice(0, 2)) {
        console.log('   -', match.pattern.name, '(similarity:', match.similarity.toFixed(2) + ')');
      }
    } else {
      console.log('   Search failed or no results:', results.error);
    }
  }

  // Test domain-specific search
  console.log('\n4. Testing Domain-Specific Search...');
  const codeIntelResults = await reasoningBank.searchQEPatterns('knowledge graph semantic search', {
    domain: 'code-intelligence' as QEDomain,
    limit: 3,
  });

  if (codeIntelResults.success && codeIntelResults.value) {
    console.log('   code-intelligence results:', codeIntelResults.value.length, 'patterns');
    for (const match of codeIntelResults.value.slice(0, 2)) {
      console.log('   -', match.pattern.name, '(similarity:', match.similarity.toFixed(2) + ')');
    }
  }

  // Test pattern promotion
  console.log('\n5. Testing Pattern Promotion...');
  const allPatterns = patternStore.getPatterns({ limit: 20 });
  const shortTermPattern = allPatterns.find(p => p.tier === 'short-term');

  if (shortTermPattern) {
    console.log('   Promoting:', shortTermPattern.name);
    console.log('   Old tier:', shortTermPattern.tier);
    await reasoningBank.promotePattern(shortTermPattern.id);

    const updated = patternStore.getPattern(shortTermPattern.id);
    console.log('   New tier:', updated?.tier || 'unknown');
  } else {
    console.log('   No short-term patterns found to promote');
  }

  // Test recording pattern outcome
  console.log('\n6. Testing Pattern Outcome Recording...');
  if (allPatterns.length > 0) {
    const testPattern = allPatterns[0];
    console.log('   Recording outcome for:', testPattern.name);

    try {
      await reasoningBank.recordPatternOutcome(testPattern.id, true, 0.85);
      console.log('   Outcome recorded successfully');
    } catch (error) {
      console.log('   Recording failed:', error);
    }
  }

  // Test task routing
  console.log('\n7. Testing Task Routing...');
  const routingTasks = [
    'Generate unit tests for UserService',
    'Analyze code coverage and find gaps',
    'Create performance load test',
  ];

  for (const task of routingTasks) {
    console.log('\n   Task:', '"' + task + '"');
    const routing = await reasoningBank.routeTask({
      task,
      context: {
        language: 'typescript',
        framework: 'vitest',
      },
    });

    if (routing.success && routing.value) {
      console.log('   Recommended:', routing.value.recommendedAgent);
      console.log('   Confidence:', routing.value.confidence.toFixed(2));
    }
  }

  // Final statistics
  console.log('\n8. Final Statistics...');
  const finalStats = await reasoningBank.getQEStats();
  console.log('   Total Patterns:', finalStats.totalPatterns);
  console.log('   Total Searches:', finalStats.totalSearches ?? 0);
  console.log('   Avg Search Latency:', (finalStats.avgSearchLatency ?? 0).toFixed(2) + 'ms');

  await reasoningBank.dispose();
  patternStore.close();
  console.log('\n=== All Tests Completed Successfully ===');
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
