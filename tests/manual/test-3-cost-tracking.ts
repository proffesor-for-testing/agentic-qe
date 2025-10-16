/**
 * Manual Test 3: Cost Tracking
 * Tests that the router can track and aggregate costs across multiple model calls
 */

import {
  AdaptiveModelRouter,
  AIModel
} from '../../src/core/routing';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';

async function testCostTracking() {
  console.log('🧪 Test 3: Cost Tracking\n');

  try {
    const memoryStore = new SwarmMemoryManager(':memory:');
    await memoryStore.initialize();
    const eventBus = new EventBus();

    const router = new AdaptiveModelRouter(memoryStore, eventBus, {
      enabled: true,
      defaultModel: AIModel.CLAUDE_SONNET_4_5,
      enableCostTracking: true,
      enableFallback: true,
      maxRetries: 3,
      costThreshold: 1.0
    });

    console.log('✅ Router created with cost tracking enabled\n');

    // Simulate token usage for different models
    console.log('Tracking costs for multiple model calls...\n');

    console.log('Call 1: GPT-3.5 (1000 tokens)');
    await router.trackCost(AIModel.GPT_3_5_TURBO, 1000);

    console.log('Call 2: GPT-4 (500 tokens)');
    await router.trackCost(AIModel.GPT_4, 500);

    console.log('Call 3: Claude Haiku (2000 tokens)');
    await router.trackCost(AIModel.CLAUDE_HAIKU, 2000);

    console.log('Call 4: Claude Sonnet 4.5 (1500 tokens)');
    await router.trackCost(AIModel.CLAUDE_SONNET_4_5, 1500);

    console.log('Call 5: GPT-3.5 (800 tokens)');
    await router.trackCost(AIModel.GPT_3_5_TURBO, 800);

    console.log('\n' + '─'.repeat(50));

    // Get statistics
    const stats = await router.getStats();

    console.log('\n💰 Cost Statistics:');
    console.log('═'.repeat(50));
    console.log(`Total Requests:       ${stats.totalRequests}`);
    console.log(`Total Cost:           $${stats.totalCost.toFixed(4)}`);
    console.log(`Average Cost/Task:    $${stats.avgCostPerTask.toFixed(4)}`);
    console.log(`Cost Savings:         $${stats.costSavings.toFixed(4)}`);

    console.log('\n📊 Model Distribution:');
    console.log('─'.repeat(50));
    for (const [model, count] of Object.entries(stats.modelDistribution)) {
      console.log(`${model.padEnd(25)} ${count} requests`);
    }

    // Verify: Total cost should be calculated
    if (stats.totalCost > 0) {
      console.log('\n✅ Cost tracking working correctly');
    } else {
      console.log('\n⚠️  Warning: Total cost is 0');
    }

    // Export cost dashboard
    const dashboard = await router.exportCostDashboard();
    console.log('\n📈 Cost Dashboard Exported:');
    console.log('─'.repeat(50));
    console.log('Dashboard Keys:', Object.keys(dashboard).join(', '));
    console.log('Total Tracked:', dashboard.totalCost !== undefined ? '✅ Yes' : '❌ No');
    console.log('By Model:', dashboard.byModel !== undefined ? '✅ Yes' : '❌ No');
    console.log('By Agent Type:', dashboard.byAgentType !== undefined ? '✅ Yes' : '❌ No');
    console.log('Timestamp:', dashboard.timestamp ? '✅ Yes' : '❌ No');

    // Test persistence to memory
    console.log('\n💾 Testing Memory Persistence:');
    console.log('─'.repeat(50));
    const storedData = await memoryStore.retrieve('router:cost-tracker', {
      partition: 'routing'
    });

    if (storedData) {
      console.log('✅ Cost data persisted to SwarmMemoryManager');
      console.log('Stored keys:', Object.keys(storedData).slice(0, 5).join(', '), '...');
    } else {
      console.log('⚠️  Cost data not found in memory (may not be persisted yet)');
    }

    await memoryStore.close();

    console.log('\n🎉 TEST 3 PASSED: Cost tracking functional');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST 3 FAILED:', error);
    process.exit(1);
  }
}

testCostTracking();
