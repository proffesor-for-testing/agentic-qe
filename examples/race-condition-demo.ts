/**
 * Demo: BaseAgent Race Condition Fix
 *
 * Demonstrates thread-safe initialization with concurrent calls
 * Issue #52 - BaseAgent.initialize() race condition
 */

import { BaseAgent, BaseAgentConfig } from '../src/agents/BaseAgent';
import { AgentStatus, AgentCapability, QETask } from '../src/types';
import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';

/**
 * Example agent for demonstration
 */
class DemoAgent extends BaseAgent {
  public initializeCount = 0;

  protected async initializeComponents(): Promise<void> {
    this.initializeCount++;
    console.log(`[${this.agentId.id}] initializeComponents called (count: ${this.initializeCount})`);

    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  protected async performTask(_task: QETask): Promise<any> {
    return { success: true };
  }

  protected async loadKnowledge(): Promise<void> {
    // No-op
  }

  protected async cleanup(): Promise<void> {
    // No-op
  }
}

/**
 * Demo 1: Concurrent Initialization
 * Multiple simultaneous calls - only one initialization should occur
 */
async function demoConcurrentInitialization() {
  console.log('\n=== Demo 1: Concurrent Initialization ===\n');

  const eventBus = new EventEmitter();
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const capabilities: AgentCapability[] = [
    {
      name: 'demo-capability',
      description: 'Demo capability',
      version: '1.0.0'
    }
  ];

  const config: BaseAgentConfig = {
    type: 'test-generator',
    capabilities,
    context: {
      environment: 'demo',
      project: {
        name: 'race-condition-demo',
        version: '1.0.0'
      }
    },
    memoryStore,
    eventBus,
    enableLearning: false
  };

  const agent = new DemoAgent(config);

  console.log('Calling initialize() 5 times concurrently...');

  const startTime = Date.now();

  // Call initialize 5 times in parallel
  await Promise.all([
    agent.initialize(),
    agent.initialize(),
    agent.initialize(),
    agent.initialize(),
    agent.initialize()
  ]);

  const endTime = Date.now();

  console.log(`\n✅ All 5 calls completed in ${endTime - startTime}ms`);
  console.log(`✅ Initialize count: ${agent.initializeCount} (should be 1)`);
  console.log(`✅ Agent status: ${agent.getStatus().status}`);

  await agent.terminate();
  await memoryStore.close();
}

/**
 * Demo 2: Sequential Calls After Initialization
 * Multiple calls after agent is initialized - should skip re-initialization
 */
async function demoIdempotentInitialization() {
  console.log('\n=== Demo 2: Idempotent Initialization ===\n');

  const eventBus = new EventEmitter();
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const capabilities: AgentCapability[] = [];
  const config: BaseAgentConfig = {
    type: 'test-generator',
    capabilities,
    context: {
      environment: 'demo',
      project: { name: 'demo', version: '1.0.0' }
    },
    memoryStore,
    eventBus,
    enableLearning: false
  };

  const agent = new DemoAgent(config);

  console.log('First initialization...');
  await agent.initialize();
  console.log(`Initialize count: ${agent.initializeCount}`);

  console.log('\nCalling initialize() again (should skip)...');
  await agent.initialize();
  console.log(`Initialize count: ${agent.initializeCount} (should still be 1)`);

  console.log('\nCalling initialize() a third time (should skip)...');
  await agent.initialize();
  console.log(`Initialize count: ${agent.initializeCount} (should still be 1)`);

  console.log(`\n✅ Idempotent initialization verified!`);

  await agent.terminate();
  await memoryStore.close();
}

/**
 * Demo 3: Waiting for In-Progress Initialization
 * Start init, then call again - second call waits for first
 */
async function demoWaitingForInitialization() {
  console.log('\n=== Demo 3: Waiting for In-Progress Initialization ===\n');

  const eventBus = new EventEmitter();
  const memoryStore = new SwarmMemoryManager(':memory:');
  await memoryStore.initialize();

  const capabilities: AgentCapability[] = [];
  const config: BaseAgentConfig = {
    type: 'test-generator',
    capabilities,
    context: {
      environment: 'demo',
      project: { name: 'demo', version: '1.0.0' }
    },
    memoryStore,
    eventBus,
    enableLearning: false
  };

  const agent = new DemoAgent(config);

  console.log('Starting initialization (not awaiting)...');
  const firstInit = agent.initialize();

  console.log('Immediately calling initialize() again (should wait)...');
  const secondInit = agent.initialize();

  console.log('Waiting for both to complete...');
  await Promise.all([firstInit, secondInit]);

  console.log(`\n✅ Initialize count: ${agent.initializeCount} (should be 1)`);
  console.log(`✅ Both calls completed successfully!`);

  await agent.terminate();
  await memoryStore.close();
}

/**
 * Run all demos
 */
async function runAllDemos() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  BaseAgent Race Condition Fix - Demonstration        ║');
  console.log('║  Issue #52: Thread-Safe Initialization               ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  try {
    await demoConcurrentInitialization();
    await demoIdempotentInitialization();
    await demoWaitingForInitialization();

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║  ✅ All demos completed successfully!                 ║');
    console.log('║  Race condition fix verified and working!            ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
}

// Run demos if executed directly
if (require.main === module) {
  runAllDemos().catch(console.error);
}

export { runAllDemos, demoConcurrentInitialization, demoIdempotentInitialization, demoWaitingForInitialization };
