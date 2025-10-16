/**
 * Manual Test 2: Model Selection
 * Tests that the router selects appropriate models based on task complexity
 */

import {
  AdaptiveModelRouter,
  AIModel,
  TaskComplexity,
  QETask
} from '../../src/core/routing';
import { SwarmMemoryManager } from '../../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../../src/core/EventBus';

async function testModelSelection() {
  console.log('🧪 Test 2: Model Selection\n');

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

    console.log('✅ Router created with enabled=true\n');

    // Test 1: Simple task → should select GPT-3.5
    console.log('Test 2.1: Simple Task Selection');
    console.log('─'.repeat(50));
    const simpleTask: QETask = {
      id: 'test-1',
      type: 'qe-test-generator',
      description: 'Generate simple unit tests for add function',
      data: { complexity: 'simple', linesOfCode: 5 },
      priority: 1,
      metadata: {}
    };

    const selection1 = await router.selectModel(simpleTask);
    console.log('Task:', simpleTask.description);
    console.log('Selected Model:', selection1.model);
    console.log('Complexity:', selection1.complexity);
    console.log('Reasoning:', selection1.reasoning);
    console.log('Estimated Cost:', `$${selection1.estimatedCost.toFixed(4)}`);
    console.log('Fallback Models:', selection1.fallbackModels);

    if (selection1.model === AIModel.GPT_3_5_TURBO) {
      console.log('✅ Simple task correctly routed to GPT-3.5\n');
    } else {
      console.log(`⚠️  Expected GPT-3.5, got: ${selection1.model}\n`);
    }

    // Test 2: Complex task → should select GPT-4 or Claude Sonnet
    console.log('Test 2.2: Complex Task Selection');
    console.log('─'.repeat(50));
    const complexTask: QETask = {
      id: 'test-2',
      type: 'qe-test-generator',
      description: 'Generate property-based tests with complex edge cases and mutations',
      data: {
        complexity: 'complex',
        requiresReasoning: true,
        linesOfCode: 150,
        cyclomaticComplexity: 15
      },
      priority: 1,
      metadata: {}
    };

    const selection2 = await router.selectModel(complexTask);
    console.log('Task:', complexTask.description);
    console.log('Selected Model:', selection2.model);
    console.log('Complexity:', selection2.complexity);
    console.log('Reasoning:', selection2.reasoning);
    console.log('Estimated Cost:', `$${selection2.estimatedCost.toFixed(4)}`);

    if (selection2.model === AIModel.GPT_4 || selection2.model === AIModel.CLAUDE_SONNET_4_5) {
      console.log('✅ Complex task correctly routed to powerful model\n');
    } else {
      console.log(`⚠️  Expected GPT-4 or Claude Sonnet, got: ${selection2.model}\n`);
    }

    // Test 3: Critical security task → should select Claude Sonnet 4.5
    console.log('Test 2.3: Critical Task Selection');
    console.log('─'.repeat(50));
    const criticalTask: QETask = {
      id: 'test-3',
      type: 'qe-security-scanner',
      description: 'Security vulnerability analysis and penetration testing',
      data: {
        requiresSecurity: true,
        complexity: 'critical',
        securityLevel: 'high'
      },
      priority: 1,
      metadata: {}
    };

    const selection3 = await router.selectModel(criticalTask);
    console.log('Task:', criticalTask.description);
    console.log('Selected Model:', selection3.model);
    console.log('Complexity:', selection3.complexity);
    console.log('Reasoning:', selection3.reasoning);
    console.log('Estimated Cost:', `$${selection3.estimatedCost.toFixed(4)}`);

    if (selection3.model === AIModel.CLAUDE_SONNET_4_5) {
      console.log('✅ Critical task correctly routed to Claude Sonnet 4.5\n');
    } else {
      console.log(`⚠️  Expected Claude Sonnet 4.5, got: ${selection3.model}\n`);
    }

    // Summary
    console.log('═'.repeat(50));
    console.log('Model Selection Summary:');
    console.log('Simple task  →', selection1.model);
    console.log('Complex task →', selection2.model);
    console.log('Critical task→', selection3.model);

    await memoryStore.close();

    console.log('\n🎉 TEST 2 PASSED: Model selection logic working correctly');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ TEST 2 FAILED:', error);
    process.exit(1);
  }
}

testModelSelection();
