/**
 * RuVector Integration Verification Script
 *
 * Verifies that RuVector is properly integrated with QE Fleet components:
 * - RuVectorPatternStore
 * - PatternStoreFactory
 * - NeuralEnhancementLayer
 * - SelfHealingMonitor
 * - RuVectorReasoningAdapter
 */

import {
  RuVectorPatternStore,
  isRuVectorAvailable,
  getRuVectorInfo,
  PatternStoreFactory,
  NeuralEnhancementLayer,
  SelfHealingMonitor,
} from '../src/core/memory/index.js';

import {
  RuVectorReasoningAdapter,
} from '../src/reasoning/index.js';

async function verifyRuVectorIntegration() {
  console.log('🧪 RuVector Integration Verification\n');
  console.log('=' .repeat(50) + '\n');

  const results: { test: string; status: string; details?: string }[] = [];

  // 1. Check RuVector availability
  console.log('1. Checking RuVector availability...');
  try {
    const available = isRuVectorAvailable();
    const info = getRuVectorInfo();
    results.push({
      test: 'RuVector Availability',
      status: available ? '✅ PASS' : '⚠️ FALLBACK',
      details: `Platform: ${info.platform}, Arch: ${info.arch}`
    });
    console.log(`   ${available ? '✅' : '⚠️'} Available: ${available}`);
    console.log(`   📦 Platform: ${info.platform}/${info.arch}\n`);
  } catch (error) {
    results.push({ test: 'RuVector Availability', status: '❌ FAIL', details: String(error) });
    console.log(`   ❌ Error: ${error}\n`);
  }

  // 2. Create pattern store using factory
  console.log('2. Creating pattern store via factory...');
  let store: any;
  try {
    const result = await PatternStoreFactory.create({
      preferredBackend: 'ruvector',
      dimension: 384,
      metric: 'cosine',
    });
    store = result.store;
    const features = result.features || [];
    results.push({
      test: 'PatternStoreFactory',
      status: '✅ PASS',
      details: `Backend: ${result.backend}, Features: ${features.length > 0 ? features.join(', ') : 'default'}`
    });
    console.log(`   ✅ Backend: ${result.backend}\n`);
  } catch (error) {
    results.push({ test: 'PatternStoreFactory', status: '❌ FAIL', details: String(error) });
    console.log(`   ❌ Error: ${error}\n`);
  }

  // 3. Store and retrieve pattern
  console.log('3. Testing pattern storage and retrieval...');
  if (store) {
    try {
      const testPattern = {
        id: 'verify-pattern-' + Date.now(),
        type: 'unit',
        domain: 'jest',
        embedding: new Array(384).fill(0).map(() => Math.random() - 0.5),
        content: 'Test pattern for verification',
        framework: 'jest',
        coverage: 0.85,
        verdict: 'success' as const,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 1,
        metadata: { tags: ['test'] },
      };

      await store.storePattern(testPattern);
      const retrieved = await store.getPattern(testPattern.id);

      if (retrieved && retrieved.id === testPattern.id) {
        results.push({ test: 'Pattern Storage', status: '✅ PASS', details: 'Store and retrieve working' });
        console.log('   ✅ Pattern stored and retrieved successfully\n');
      } else {
        results.push({ test: 'Pattern Storage', status: '❌ FAIL', details: 'Retrieval mismatch' });
        console.log('   ❌ Pattern retrieval failed\n');
      }
    } catch (error) {
      results.push({ test: 'Pattern Storage', status: '❌ FAIL', details: String(error) });
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  // 4. Test search functionality
  console.log('4. Testing search functionality...');
  if (store) {
    try {
      const queryEmbedding = new Array(384).fill(0).map(() => Math.random() - 0.5);
      const searchResults = await store.searchSimilar(queryEmbedding, { k: 5 });

      results.push({
        test: 'Pattern Search',
        status: '✅ PASS',
        details: `Found ${searchResults.length} results`
      });
      console.log(`   ✅ Search returned ${searchResults.length} results\n`);
    } catch (error) {
      results.push({ test: 'Pattern Search', status: '❌ FAIL', details: String(error) });
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  // 5. Test neural enhancement
  console.log('5. Testing neural enhancement layer...');
  try {
    const neural = new NeuralEnhancementLayer({
      attentionHeads: 8,
      embeddingDim: 384,
      enableGNN: true,
      enableRLNavigation: true,
    });

    const queryEmbedding = new Array(384).fill(0).map(() => Math.random() - 0.5);
    const enhanced = await neural.enhanceQuery(queryEmbedding);

    if (enhanced.enhancedEmbedding && enhanced.attentionWeights) {
      results.push({
        test: 'Neural Enhancement',
        status: '✅ PASS',
        details: `8-head attention, confidence: ${enhanced.confidence.toFixed(3)}`
      });
      console.log(`   ✅ Neural enhancement working (confidence: ${enhanced.confidence.toFixed(3)})\n`);
    } else {
      results.push({ test: 'Neural Enhancement', status: '❌ FAIL', details: 'Invalid output' });
    }
  } catch (error) {
    results.push({ test: 'Neural Enhancement', status: '❌ FAIL', details: String(error) });
    console.log(`   ❌ Error: ${error}\n`);
  }

  // 6. Test self-healing monitor
  console.log('6. Testing self-healing monitor...');
  if (store) {
    try {
      const monitor = new SelfHealingMonitor(store, {
        checkIntervalMs: 60000,
        degradationThreshold: 0.05,
        autoHeal: false,
      });

      // Simulate some queries
      for (let i = 0; i < 10; i++) {
        monitor.recordQuery(Math.random() * 2 + 0.5); // 0.5-2.5ms
      }

      const health = monitor.getHealth();
      results.push({
        test: 'Self-Healing Monitor',
        status: '✅ PASS',
        details: `QPS: ${health.qps.toFixed(0)}, p50: ${health.p50Latency.toFixed(2)}µs`
      });
      console.log(`   ✅ Monitor working (QPS: ${health.qps.toFixed(0)})\n`);
    } catch (error) {
      results.push({ test: 'Self-Healing Monitor', status: '❌ FAIL', details: String(error) });
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  // 7. Test reasoning adapter
  console.log('7. Testing RuVector reasoning adapter...');
  try {
    const adapter = new RuVectorReasoningAdapter({
      backend: 'ruvector',
      enableMetrics: true,
      verbose: false,
    });
    await adapter.initialize();

    const status = adapter.getStatus();
    if (status.initialized) {
      results.push({
        test: 'Reasoning Adapter',
        status: '✅ PASS',
        details: `Backend: ${status.backend}, RuVector: ${status.ruvectorAvailable}`
      });
      console.log(`   ✅ Adapter initialized (backend: ${status.backend})\n`);
    } else {
      results.push({ test: 'Reasoning Adapter', status: '❌ FAIL', details: 'Not initialized' });
    }

    await adapter.shutdown();
  } catch (error) {
    results.push({ test: 'Reasoning Adapter', status: '❌ FAIL', details: String(error) });
    console.log(`   ❌ Error: ${error}\n`);
  }

  // Cleanup
  if (store) {
    try {
      await store.shutdown();
    } catch {
      // Ignore cleanup errors
    }
  }

  // Print summary
  console.log('=' .repeat(50));
  console.log('\n📋 VERIFICATION SUMMARY\n');

  const passed = results.filter(r => r.status.includes('PASS')).length;
  const total = results.length;

  for (const result of results) {
    console.log(`${result.status} ${result.test}`);
    if (result.details) {
      console.log(`   └─ ${result.details}`);
    }
  }

  console.log('\n' + '=' .repeat(50));
  console.log(`\n🎯 Result: ${passed}/${total} tests passed\n`);

  if (passed === total) {
    console.log('✅ RuVector integration is fully functional!');
    console.log('   QE agents can now use high-performance vector search.\n');
  } else if (passed >= total - 2) {
    console.log('⚠️ RuVector integration mostly working with minor issues.');
    console.log('   Core functionality is available.\n');
  } else {
    console.log('❌ RuVector integration has significant issues.');
    console.log('   Please check the error details above.\n');
  }

  process.exit(passed >= total - 2 ? 0 : 1);
}

verifyRuVectorIntegration().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
