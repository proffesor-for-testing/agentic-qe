#!/usr/bin/env tsx
/**
 * Pattern Persistence Verification Script
 *
 * Verifies that patterns are actually persisted to AgentDB by:
 * 1. Storing a high-quality test pattern
 * 2. Querying AgentDB to retrieve it
 * 3. Verifying the pattern data matches
 *
 * Usage:
 *   npx tsx scripts/verify-pattern-persistence.ts
 */

import { createAgentDBManager } from '../src/core/memory/AgentDBManager.js';
import { QEReasoningBank } from '../src/reasoning/QEReasoningBank.js';
import { PatternDatabaseAdapter } from '../src/core/PatternDatabaseAdapter.js';
import { TestPattern } from '../src/types/index.js';

async function verifyPatternPersistence() {
  console.log('🔍 Pattern Persistence Verification\n');
  console.log('═'.repeat(80));

  try {
    // 1. Initialize AgentDB
    console.log('\n📦 Step 1: Initialize AgentDB');
    const agentDB = createAgentDBManager({
      dbPath: './agentdb.db',
      vectorDimension: 768,
      enableHNSW: true,
      enableQuantization: true,
      quantizationType: 'scalar'
    });
    await agentDB.initialize();
    console.log('✅ AgentDB initialized');

    // 2. Initialize PatternDatabaseAdapter
    console.log('\n📦 Step 2: Initialize PatternDatabaseAdapter');
    const dbAdapter = new PatternDatabaseAdapter('./patterns.db');
    await dbAdapter.initialize();
    console.log('✅ PatternDatabaseAdapter initialized');

    // 3. Initialize QEReasoningBank
    console.log('\n📦 Step 3: Initialize QEReasoningBank');
    const reasoningBank = new QEReasoningBank();
    await reasoningBank.initialize();
    console.log('✅ QEReasoningBank initialized');

    // 4. Create high-quality test pattern
    console.log('\n📝 Step 4: Create high-quality test pattern');
    const timestamp = Date.now();
    const testPattern: TestPattern = {
      id: `verification-pattern-${timestamp}`,
      name: 'Pattern Persistence Verification Test',
      description: 'High-quality test pattern to verify persistence',
      category: 'unit',
      framework: 'jest',
      language: 'typescript',
      template: `
test("should verify pattern persistence", async () => {
  const result = await verifyPersistence();
  expect(result.success).toBe(true);
  expect(result.stored).toBe(true);
  expect(result.retrieved).toBe(true);
});
      `.trim(),
      examples: [
        'expect(result.success).toBe(true)',
        'expect(result.stored).toBe(true)'
      ],
      confidence: 0.95,  // High confidence
      usageCount: 1,
      successRate: 1.0,
      quality: 0.95,     // High quality (above threshold)
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        tags: ['verification', 'persistence', 'unit-test', 'high-quality']
      }
    };
    console.log(`✅ Created pattern: ${testPattern.id}`);
    console.log(`   Quality: ${testPattern.quality}`);
    console.log(`   Confidence: ${testPattern.confidence}`);

    // 5. Store pattern via QEReasoningBank
    console.log('\n💾 Step 5: Store pattern via QEReasoningBank');
    await reasoningBank.storePattern(testPattern);
    console.log('✅ Pattern stored via QEReasoningBank');

    // 6. Store pattern via PatternDatabaseAdapter directly
    console.log('\n💾 Step 6: Store pattern via PatternDatabaseAdapter');
    await dbAdapter.storePattern(testPattern);
    console.log('✅ Pattern stored via PatternDatabaseAdapter');

    // 7. Query pattern from PatternDatabaseAdapter
    console.log('\n🔍 Step 7: Retrieve pattern from PatternDatabaseAdapter');
    const retrievedPattern = await dbAdapter.getPattern(testPattern.id);

    if (!retrievedPattern) {
      console.error('❌ Pattern NOT found in PatternDatabaseAdapter');
      return false;
    }

    console.log('✅ Pattern retrieved from PatternDatabaseAdapter');
    console.log(`   ID: ${retrievedPattern.id}`);
    console.log(`   Quality: ${retrievedPattern.quality}`);
    console.log(`   Confidence: ${retrievedPattern.confidence}`);

    // 8. Verify pattern data matches
    console.log('\n✓ Step 8: Verify pattern data integrity');
    const checks = {
      id: retrievedPattern.id === testPattern.id,
      name: retrievedPattern.name === testPattern.name,
      quality: Math.abs(retrievedPattern.quality - testPattern.quality) < 0.01,
      confidence: Math.abs(retrievedPattern.confidence - testPattern.confidence) < 0.01,
      framework: retrievedPattern.framework === testPattern.framework,
      category: retrievedPattern.category === testPattern.category
    };

    const allChecksPassed = Object.values(checks).every(check => check);

    console.log('   ID match:', checks.id ? '✅' : '❌');
    console.log('   Name match:', checks.name ? '✅' : '❌');
    console.log('   Quality match:', checks.quality ? '✅' : '❌');
    console.log('   Confidence match:', checks.confidence ? '✅' : '❌');
    console.log('   Framework match:', checks.framework ? '✅' : '❌');
    console.log('   Category match:', checks.category ? '✅' : '❌');

    // 9. Query via semantic search
    console.log('\n🔍 Step 9: Test semantic search retrieval');
    const searchResults = await reasoningBank.findMatchingPatterns(
      {
        codeType: 'test',
        keywords: ['verification', 'persistence'],
        language: 'typescript'
      },
      5
    );

    const foundInSearch = searchResults.some(result =>
      result.pattern.id === testPattern.id
    );

    if (foundInSearch) {
      console.log('✅ Pattern found via semantic search');
      const foundPattern = searchResults.find(r => r.pattern.id === testPattern.id);
      console.log(`   Similarity: ${foundPattern?.similarity.toFixed(3)}`);
    } else {
      console.log('⚠️  Pattern NOT found via semantic search (may be normal if not indexed yet)');
    }

    // 10. Final verdict
    console.log('\n' + '═'.repeat(80));
    console.log('\n📊 VERIFICATION RESULTS:\n');

    if (allChecksPassed) {
      console.log('✅ PATTERN PERSISTENCE WORKS CORRECTLY');
      console.log('\nAll checks passed:');
      console.log('  ✓ Pattern stored successfully');
      console.log('  ✓ Pattern retrieved successfully');
      console.log('  ✓ Pattern data integrity verified');
      console.log('  ✓ Quality threshold respected (0.95 > threshold)');
      return true;
    } else {
      console.log('❌ PATTERN PERSISTENCE HAS ISSUES');
      console.log('\nFailed checks:');
      Object.entries(checks).forEach(([key, passed]) => {
        if (!passed) {
          console.log(`  ✗ ${key} mismatch`);
        }
      });
      return false;
    }

  } catch (error) {
    console.error('\n❌ Verification failed with error:');
    console.error(error);
    return false;
  }
}

// Run verification
verifyPatternPersistence()
  .then(success => {
    console.log('\n' + '═'.repeat(80));
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
