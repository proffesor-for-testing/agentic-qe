/**
 * Manual test of routing functionality
 * This bypasses Jest to verify the implementation works
 */

import { AdaptiveModelRouter } from '../src/core/routing/AdaptiveModelRouter';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/EventBus';
import { TaskComplexity, AIModel } from '../src/core/routing/types';

// Mock fetch for testing
(global as any).fetch = async (url: string) => {
  console.log(`Fetch called with: ${url}`);
  return { ok: true };
};

async function test() {
  console.log('=== Testing AdaptiveModelRouter Local Routing ===\n');

  const eventBus = new EventBus();
  const memoryStore = new SwarmMemoryManager();
  await memoryStore.initialize();

  const router = new AdaptiveModelRouter(memoryStore, eventBus, {
    enabled: true,
    preferLocal: true,
    ruvllmEndpoint: 'http://localhost:8080',
    enableCostTracking: true,
    enableFallback: true,
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log('✓ Router created\n');

  // Test routeToLocal
  const task = {
    id: 'test-1',
    type: 'qe-test-generator',
    description: 'Generate unit tests',
    data: {},
    priority: 1,
  };

  const analysis = {
    complexity: TaskComplexity.SIMPLE,
    estimatedTokens: 1000,
    requiresReasoning: false,
    requiresSecurity: false,
    requiresPerformance: false,
    confidence: 0.95,
  };

  console.log('Calling routeToLocal...');
  const selection = await router.routeToLocal(task, analysis);

  console.log('\nResult:');
  console.log('- Selection:', selection);
  console.log('- Model:', selection?.model);
  console.log('- Cost:', selection?.estimatedCost);
  console.log('- Reasoning:', selection?.reasoning);

  console.log('\n=== Test Complete ===');

  // Cleanup
  await memoryStore.shutdown();
  process.exit(selection ? 0 : 1);
}

test().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
