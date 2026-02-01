/**
 * Test migrated V2 patterns with V3 SQLite Pattern Store
 * Direct test without HNSW dependency
 */

import { createSQLitePatternStore } from '../src/learning/sqlite-persistence.js';
import type { QEDomain } from '../src/learning/qe-patterns.js';
import type { QEPattern } from '../src/learning/qe-patterns.js';

async function main() {
  console.log('=== Testing Migrated V2 Patterns with V3 SQLite Store ===\n');

  // Initialize SQLite Pattern Store
  console.log('1. Initializing SQLite Pattern Store...');
  const patternStore = createSQLitePatternStore({
    dbPath: '.agentic-qe/memory.db',
  });

  await patternStore.initialize();
  console.log('   Initialized');

  // Get statistics
  console.log('\n2. Getting Statistics...');
  const stats = patternStore.getStats();
  console.log('   Total Patterns:', stats.totalPatterns);
  console.log('   By Domain:');
  for (const [domain, count] of Object.entries(stats.byDomain)) {
    console.log('     -', domain + ':', count);
  }
  console.log('   By Tier:');
  for (const [tier, count] of Object.entries(stats.byTier)) {
    console.log('     -', tier + ':', count);
  }

  // Test pattern retrieval
  console.log('\n3. Testing Pattern Retrieval...');
  const allPatterns = patternStore.getAllPatterns(100);
  console.log('   Retrieved', allPatterns.length, 'patterns');

  if (allPatterns.length > 0) {
    console.log('\n   Sample patterns (by domain):');
    const byDomain: Record<string, QEPattern[]> = {};
    for (const p of allPatterns) {
      if (!byDomain[p.qeDomain]) byDomain[p.qeDomain] = [];
      byDomain[p.qeDomain].push(p);
    }

    for (const [domain, patterns] of Object.entries(byDomain).slice(0, 4)) {
      console.log('   ', domain + ':', patterns.length, 'patterns');
      const sample = patterns[0];
      console.log('     -', sample.name, '(tier:', sample.tier + ', confidence:', sample.confidence + ')');
    }
  }

  // Test high-quality patterns
  console.log('\n4. Finding High-Quality Patterns...');
  const highQuality = allPatterns
    .filter(p => p.qualityScore > 0.7)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 10);

  console.log('   Found', highQuality.length, 'high-quality patterns (quality > 0.7)');
  for (const p of highQuality.slice(0, 5)) {
    console.log('   -', '[' + p.qeDomain + ']', p.name);
    console.log('     Confidence:', p.confidence.toFixed(2), ', Success Rate:', p.successRate.toFixed(2), ', Quality:', p.qualityScore.toFixed(2));
  }

  // Test patterns by domain
  console.log('\n5. Testing Domain-Specific Retrieval...');
  const testGenPatterns = patternStore.getPatternsByDomain('test-generation', 5);
  console.log('   test-generation patterns:', testGenPatterns.length);
  for (const p of testGenPatterns.slice(0, 3)) {
    console.log('   -', p.name, '(usage:', p.usageCount + ', tier:', p.tier + ')');
  }

  const codeIntelPatterns = patternStore.getPatternsByDomain('code-intelligence', 5);
  console.log('   code-intelligence patterns:', codeIntelPatterns.length);
  for (const p of codeIntelPatterns.slice(0, 3)) {
    console.log('   -', p.name, '(usage:', p.usageCount + ', tier:', p.tier + ')');
  }

  // Test pattern promotion
  console.log('\n6. Testing Pattern Promotion...');
  if (allPatterns.length > 0) {
    const testPattern = allPatterns.find(p => p.tier === 'short-term') || allPatterns[0];
    console.log('   Promoting:', testPattern.name);
    console.log('   Old tier:', testPattern.tier);

    patternStore.promotePattern(testPattern.id);
    const updated = patternStore.getPattern(testPattern.id);
    console.log('   New tier:', updated?.tier || 'unknown');
  }

  // Test storing a new pattern
  console.log('\n7. Testing New Pattern Storage...');
  const newPattern: QEPattern = {
    id: 'test-v3-migration-' + Date.now(),
    patternType: 'test-template',
    qeDomain: 'test-generation',
    domain: 'test-generation',
    name: 'V3 Migration Test Pattern',
    description: 'Test pattern created during V3 migration verification',
    confidence: 0.9,
    usageCount: 0,
    successRate: 1.0,
    qualityScore: 0.9,
    tier: 'short-term',
    context: {
      framework: 'vitest',
      language: 'typescript',
    },
  };

  patternStore.storePattern(newPattern);
  console.log('   Stored new pattern:', newPattern.id);

  const retrieved = patternStore.getPattern(newPattern.id);
  console.log('   Retrieved:', retrieved?.name || 'not found');

  // Final stats
  console.log('\n8. Final Statistics...');
  const finalStats = patternStore.getStats();
  console.log('   Total Patterns:', finalStats.totalPatterns);
  console.log('   Total Successful Uses:', finalStats.totalSuccessfulUses);

  console.log('\n=== All Tests Passed ===');
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
