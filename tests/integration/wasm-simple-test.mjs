/**
 * Simple WASM integration test to diagnose issues
 */

import {
  wasmLoader,
  createCoherenceService,
} from '../../dist/integrations/coherence/index.js';

async function test() {
  console.log('=== WASM Simple Integration Test ===\n');

  // Step 1: Check WASM availability
  console.log('Step 1: Checking WASM availability...');
  const isAvailable = await wasmLoader.isAvailable();
  console.log('  isAvailable:', isAvailable);

  // Step 2: Load WASM module
  console.log('\nStep 2: Loading WASM module...');
  try {
    const module = await wasmLoader.load();
    console.log('  Loaded successfully');
    console.log('  CohomologyEngine available:', !!module.CohomologyEngine);
    console.log('  SpectralEngine available:', !!module.SpectralEngine);
  } catch (e) {
    console.log('  FAILED:', e.message);
    process.exit(1);
  }

  // Step 3: Create coherence service
  console.log('\nStep 3: Creating CoherenceService...');
  let coherenceService;
  try {
    coherenceService = await createCoherenceService(wasmLoader, {
      fallbackEnabled: false,
    });
    console.log('  Created successfully');
    console.log('  isInitialized:', coherenceService.isInitialized());
  } catch (e) {
    console.log('  FAILED:', e.message);
    console.log('  Stack:', e.stack);
    process.exit(1);
  }

  // Step 4: Check stats
  console.log('\nStep 4: Checking stats...');
  const stats = coherenceService.getStats();
  console.log('  wasmAvailable:', stats.wasmAvailable);
  console.log('  fallbackCount:', stats.fallbackCount);

  // Step 4b: Check adapter status
  console.log('\nStep 4b: Checking adapter status...');
  // Use internal check - the service doesn't expose adapters directly
  // But we can check via the WASM check path
  console.log('  (Adapters are internal, checking via coherence flow)');

  // Step 5: Try a coherence check
  console.log('\nStep 5: Running coherence check...');
  const nodes = [
    {
      id: 'node-1',
      content: 'Test content 1',
      embedding: Array(128).fill(0).map(() => Math.random() - 0.5),
    },
    {
      id: 'node-2',
      content: 'Test content 2',
      embedding: Array(128).fill(0).map(() => Math.random() - 0.5),
    },
  ];
  console.log('  nodes[0].embedding length:', nodes[0].embedding.length);
  console.log('  nodes[0].embedding sample:', nodes[0].embedding.slice(0, 5));

  try {
    const result = await coherenceService.checkCoherence(nodes);
    console.log('  energy:', result.energy);
    console.log('  isCoherent:', result.isCoherent);
    console.log('  lane:', result.lane);
    console.log('  usedFallback:', result.usedFallback);
    console.log('  durationMs:', result.durationMs);

    if (result.usedFallback) {
      console.log('\n  ⚠️ WARNING: Fallback was used!');
      console.log('  Full result:', JSON.stringify(result, null, 2));
    } else {
      console.log('\n  ✅ WASM engines used successfully!');
    }
  } catch (e) {
    console.log('  FAILED:', e.message);
    console.log('  Stack:', e.stack);
    process.exit(1);
  }

  // Step 6: Check final stats
  console.log('\nStep 6: Final stats...');
  const finalStats = coherenceService.getStats();
  console.log('  totalChecks:', finalStats.totalChecks);
  console.log('  fallbackCount:', finalStats.fallbackCount);

  // Cleanup
  wasmLoader.reset();
  console.log('\n=== Test Complete ===');
}

test().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
