/**
 * Manual Test 1: Router Initialization
 * Tests that the AdaptiveModelRouter can be initialized with dependencies
 */

import {
  AdaptiveModelRouter,
  DEFAULT_ROUTER_CONFIG
} from '../../src/core/routing';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';

async function testRouterInit() {
  console.log('🧪 Test 1: Router Initialization\n');

  try {
    // 1. Create dependencies
    console.log('Creating SwarmMemoryManager...');
    const memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
    console.log('✅ SwarmMemoryManager created\n');

    console.log('Creating EventBus...');
    const eventBus = new EventBus();
    console.log('✅ EventBus created\n');

    // 2. Create router
    console.log('Creating AdaptiveModelRouter...');
    const router = new AdaptiveModelRouter(
      memoryStore,
      eventBus,
      DEFAULT_ROUTER_CONFIG
    );
    console.log('✅ Router initialized successfully\n');

    // 3. Verify configuration
    console.log('Router Configuration:');
    console.log(JSON.stringify(DEFAULT_ROUTER_CONFIG, null, 2));

    // 4. Cleanup
    await memoryStore.close();
    console.log('\n✅ Cleanup complete');

    console.log('\n🎉 TEST 1 PASSED: Router initialization successful');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST 1 FAILED:', error);
    process.exit(1);
  }
}

testRouterInit();
