/**
 * Multi-Model Router Usage Example
 * Demonstrates cost optimization with the AdaptiveModelRouter
 */

import {
  AdaptiveModelRouter,
  AIModel,
  TaskComplexity,
  DEFAULT_ROUTER_CONFIG,
  createRoutingEnabledFleetManager,
  taskToQETask,
} from '../src/core/routing';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import { EventBus } from '../src/core/events/EventBus';
import { FleetManager } from '../src/core/FleetManager';
import { Task } from '../src/core/Task';

/**
 * Example 1: Basic Router Setup
 */
async function example1_BasicSetup() {
  console.log('=== Example 1: Basic Router Setup ===\n');

  // Initialize dependencies
  const memoryStore = new SwarmMemoryManager();
  const eventBus = new EventBus();

  // Create router with default config (disabled by default)
  const router = new AdaptiveModelRouter(memoryStore, eventBus);

  console.log('Router created with config:', DEFAULT_ROUTER_CONFIG);
  console.log('✓ Router initialized successfully\n');

  return { router, memoryStore, eventBus };
}

/**
 * Example 2: Enable Routing and Select Models
 */
async function example2_ModelSelection() {
  console.log('=== Example 2: Model Selection ===\n');

  const { router } = await example1_BasicSetup();

  // Enable routing (feature flag)
  router.setEnabled(true);
  console.log('✓ Routing enabled\n');

  // Create different tasks with varying complexity
  const tasks = [
    {
      id: 'task-1',
      type: 'qe-test-generator',
      description: 'Generate unit tests for getter methods',
      context: { framework: 'jest' },
    },
    {
      id: 'task-2',
      type: 'qe-test-generator',
      description: 'Generate integration tests for REST API endpoints',
      context: { framework: 'jest' },
    },
    {
      id: 'task-3',
      type: 'qe-test-generator',
      description: 'Generate property-based tests for complex algorithm with edge cases',
      context: { framework: 'fast-check' },
    },
    {
      id: 'task-4',
      type: 'qe-security-scanner',
      description: 'Security analysis for authentication and encryption modules',
      context: { criticalPath: true },
    },
  ];

  // Select models for each task
  for (const task of tasks) {
    const selection = await router.selectModel(task);
    console.log(`Task: ${task.description}`);
    console.log(`├─ Complexity: ${selection.complexity}`);
    console.log(`├─ Model: ${selection.model}`);
    console.log(`├─ Estimated Cost: $${selection.estimatedCost.toFixed(4)}`);
    console.log(`├─ Confidence: ${(selection.confidence * 100).toFixed(0)}%`);
    console.log(`└─ Reasoning: ${selection.reasoning}\n`);
  }
}

/**
 * Example 3: Cost Tracking
 */
async function example3_CostTracking() {
  console.log('=== Example 3: Cost Tracking ===\n');

  const { router } = await example1_BasicSetup();
  router.setEnabled(true);

  // Simulate task executions with different models
  const executions = [
    { model: AIModel.GPT_3_5_TURBO, tokens: 1200 },
    { model: AIModel.GPT_3_5_TURBO, tokens: 1100 },
    { model: AIModel.CLAUDE_HAIKU, tokens: 2500 },
    { model: AIModel.CLAUDE_HAIKU, tokens: 2300 },
    { model: AIModel.GPT_4, tokens: 3500 },
    { model: AIModel.CLAUDE_SONNET_4_5, tokens: 4000 },
  ];

  console.log('Tracking costs for executions...\n');
  for (const exec of executions) {
    await router.trackCost(exec.model, exec.tokens);
  }

  // Get statistics
  const stats = await router.getStats();
  console.log('Cost Statistics:');
  console.log(`├─ Total Requests: ${stats.totalRequests}`);
  console.log(`├─ Total Cost: $${stats.totalCost.toFixed(4)}`);
  console.log(`├─ Cost Savings: $${stats.costSavings.toFixed(4)}`);
  console.log(`├─ Savings %: ${((stats.costSavings / (stats.totalCost + stats.costSavings)) * 100).toFixed(2)}%`);
  console.log(`├─ Avg Cost/Task: $${stats.avgCostPerTask.toFixed(4)}`);
  console.log(`└─ Avg Cost/Test: $${stats.avgCostPerTest.toFixed(4)}\n`);

  // Export cost dashboard
  const dashboard = await router.exportCostDashboard();
  console.log('Cost Dashboard:');
  console.log(JSON.stringify(dashboard, null, 2));
  console.log();
}

/**
 * Example 4: Fallback Handling
 */
async function example4_FallbackHandling() {
  console.log('=== Example 4: Fallback Handling ===\n');

  const { router } = await example1_BasicSetup();
  router.setEnabled(true);

  const task = {
    id: 'task-fallback',
    type: 'qe-test-generator',
    description: 'Generate tests for complex algorithm',
    context: {},
  };

  // Primary selection
  const selection = await router.selectModel(task);
  console.log(`Primary Model: ${selection.model}`);

  // Simulate failure and get fallback
  const fallback = router.getFallbackModel(selection.model, task);
  console.log(`Fallback Model: ${fallback}`);

  // Show full fallback chain
  console.log(`Fallback Chain: ${selection.fallbackModels.join(' → ')}\n`);
}

/**
 * Example 5: Event-Driven Integration
 */
async function example5_EventDriven() {
  console.log('=== Example 5: Event-Driven Integration ===\n');

  const { router, eventBus } = await example1_BasicSetup();
  router.setEnabled(true);

  // Set up event listeners
  eventBus.on('router:model-selected', (data) => {
    console.log(`[EVENT] Model Selected: ${data.model} for task ${data.task}`);
    console.log(`        Complexity: ${data.complexity}, Cost: $${data.estimatedCost.toFixed(4)}`);
  });

  eventBus.on('router:cost-tracked', (data) => {
    console.log(`[EVENT] Cost Tracked: ${data.model}`);
    console.log(`        Tokens: ${data.tokens}, Cost: $${data.cost.toFixed(4)}, Total: $${data.totalCost.toFixed(4)}`);
  });

  eventBus.on('router:fallback-selected', (data) => {
    console.log(`[EVENT] Fallback: ${data.failedModel} → ${data.fallbackModel}`);
  });

  eventBus.on('router:cost-optimized', (data) => {
    console.log(`[EVENT] Cost Optimized: ${data.originalComplexity} → ${data.optimizedComplexity}`);
    console.log(`        Savings: $${(data.originalCost - data.optimizedCost).toFixed(4)}`);
  });

  console.log('Event listeners registered\n');

  // Trigger some operations
  const task = {
    id: 'task-event',
    type: 'qe-test-generator',
    description: 'Generate integration tests',
    context: {},
  };

  await router.selectModel(task);
  await router.trackCost(AIModel.CLAUDE_HAIKU, 2000);
  router.getFallbackModel(AIModel.GPT_4, task);

  console.log('\n✓ Events emitted successfully\n');
}

/**
 * Example 6: FleetManager Integration
 */
async function example6_FleetManagerIntegration() {
  console.log('=== Example 6: FleetManager Integration ===\n');

  // Initialize dependencies
  const memoryStore = new SwarmMemoryManager();
  const eventBus = new EventBus();

  // Create fleet manager (assuming it exists)
  const fleetConfig = {
    agents: [
      { type: 'test-generator', count: 2 },
      { type: 'test-executor', count: 4 },
      { type: 'coverage-analyzer', count: 1 },
    ],
  };

  console.log('Note: FleetManager integration requires full FleetManager setup');
  console.log('This example shows the API usage pattern:\n');

  // Example code (would work with actual FleetManager)
  console.log(`
const fleetManager = new FleetManager(fleetConfig);
await fleetManager.initialize();

// Wrap with routing capabilities
const routingFleet = createRoutingEnabledFleetManager(
  fleetManager,
  memoryStore,
  eventBus,
  { enabled: true } // Enable routing
);

// Submit tasks - routing happens automatically
const task = new Task(
  'test-generation',
  'Generate tests for UserService',
  { filePath: './src/services/UserService.ts' }
);

await fleetManager.submitTask(task);

// Get routing statistics
const stats = await routingFleet.getRouterStats();
console.log('Cost savings:', stats.costSavings);

// Export cost dashboard
const dashboard = await routingFleet.exportCostDashboard();
console.log('Dashboard:', dashboard);
  `);

  console.log('✓ Integration pattern demonstrated\n');
}

/**
 * Example 7: Custom Configuration
 */
async function example7_CustomConfiguration() {
  console.log('=== Example 7: Custom Configuration ===\n');

  const memoryStore = new SwarmMemoryManager();
  const eventBus = new EventBus();

  // Create router with custom config
  const router = new AdaptiveModelRouter(memoryStore, eventBus, {
    enabled: true,
    defaultModel: AIModel.GPT_4,
    enableCostTracking: true,
    enableFallback: true,
    maxRetries: 5,
    costThreshold: 0.25, // Lower threshold for tighter cost control
  });

  console.log('Custom Configuration:');
  console.log('├─ Enabled: true');
  console.log('├─ Default Model: GPT-4');
  console.log('├─ Cost Tracking: true');
  console.log('├─ Fallback: true');
  console.log('├─ Max Retries: 5');
  console.log('└─ Cost Threshold: $0.25\n');

  // Update config at runtime
  router.updateConfig({
    costThreshold: 0.30,
    maxRetries: 3,
  });

  console.log('✓ Configuration updated at runtime\n');
}

/**
 * Example 8: Complexity Analysis
 */
async function example8_ComplexityAnalysis() {
  console.log('=== Example 8: Complexity Analysis ===\n');

  const { router } = await example1_BasicSetup();

  const testCases = [
    {
      description: 'Simple unit test',
      task: {
        id: '1',
        type: 'qe-test-generator',
        description: 'unit test for basic getter validation mock',
        context: {},
      },
      expectedComplexity: TaskComplexity.SIMPLE,
    },
    {
      description: 'Moderate integration test',
      task: {
        id: '2',
        type: 'qe-test-generator',
        description: 'integration test for api endpoint database middleware',
        context: {},
      },
      expectedComplexity: TaskComplexity.MODERATE,
    },
    {
      description: 'Complex algorithm test',
      task: {
        id: '3',
        type: 'qe-test-generator',
        description: 'property-based test with edge cases for complex algorithm optimization',
        context: {},
      },
      expectedComplexity: TaskComplexity.COMPLEX,
    },
    {
      description: 'Critical security test',
      task: {
        id: '4',
        type: 'qe-security-scanner',
        description: 'security test for authentication encryption critical production',
        context: {},
      },
      expectedComplexity: TaskComplexity.CRITICAL,
    },
  ];

  console.log('Analyzing task complexity...\n');
  for (const testCase of testCases) {
    const complexity = await router.analyzeComplexity(testCase.task);
    const match = complexity === testCase.expectedComplexity ? '✓' : '✗';
    console.log(`${match} ${testCase.description}`);
    console.log(`  Detected: ${complexity} (Expected: ${testCase.expectedComplexity})\n`);
  }
}

/**
 * Example 9: Cost Comparison
 */
async function example9_CostComparison() {
  console.log('=== Example 9: Cost Comparison (Single vs Multi-Model) ===\n');

  const { router } = await example1_BasicSetup();

  // Simulate 100 tasks with varying complexity
  const taskDistribution = {
    [TaskComplexity.SIMPLE]: 50,
    [TaskComplexity.MODERATE]: 30,
    [TaskComplexity.COMPLEX]: 15,
    [TaskComplexity.CRITICAL]: 5,
  };

  const avgTokens = {
    [TaskComplexity.SIMPLE]: 1000,
    [TaskComplexity.MODERATE]: 2000,
    [TaskComplexity.COMPLEX]: 3500,
    [TaskComplexity.CRITICAL]: 5000,
  };

  // Calculate single model cost (Claude Sonnet 4.5)
  let singleModelCost = 0;
  Object.entries(taskDistribution).forEach(([complexity, count]) => {
    const tokens = avgTokens[complexity as TaskComplexity];
    singleModelCost += count * tokens * 0.00005; // Claude Sonnet 4.5 cost
  });

  // Calculate multi-model cost
  router.setEnabled(true);
  let multiModelCost = 0;

  for (const [complexity, count] of Object.entries(taskDistribution)) {
    const task = {
      id: 'test',
      type: 'qe-test-generator',
      description: complexity,
      context: {},
    };

    const selection = await router.selectModel({ ...task, description: complexity });
    const tokens = avgTokens[complexity as TaskComplexity];

    // Track costs
    for (let i = 0; i < count; i++) {
      await router.trackCost(selection.model, tokens);
    }

    multiModelCost += count * tokens * (selection.estimatedCost / tokens);
  }

  const stats = await router.getStats();
  const savings = singleModelCost - multiModelCost;
  const savingsPercent = (savings / singleModelCost) * 100;

  console.log('Task Distribution:');
  console.log(`├─ Simple: ${taskDistribution[TaskComplexity.SIMPLE]}`);
  console.log(`├─ Moderate: ${taskDistribution[TaskComplexity.MODERATE]}`);
  console.log(`├─ Complex: ${taskDistribution[TaskComplexity.COMPLEX]}`);
  console.log(`└─ Critical: ${taskDistribution[TaskComplexity.CRITICAL]}\n`);

  console.log('Cost Comparison:');
  console.log(`├─ Single Model (Sonnet 4.5): $${singleModelCost.toFixed(4)}`);
  console.log(`├─ Multi-Model (Adaptive): $${multiModelCost.toFixed(4)}`);
  console.log(`├─ Savings: $${savings.toFixed(4)}`);
  console.log(`└─ Savings %: ${savingsPercent.toFixed(2)}%\n`);

  console.log(`✓ Target 70% cost reduction ${savingsPercent >= 70 ? 'ACHIEVED' : 'IN PROGRESS'}\n`);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Multi-Model Router Examples                              ║');
  console.log('║   Agentic QE Fleet v1.0.5                                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    await example1_BasicSetup();
    await example2_ModelSelection();
    await example3_CostTracking();
    await example4_FallbackHandling();
    await example5_EventDriven();
    await example6_FleetManagerIntegration();
    await example7_CustomConfiguration();
    await example8_ComplexityAnalysis();
    await example9_CostComparison();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   All examples completed successfully!                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

// Export examples for testing
export {
  example1_BasicSetup,
  example2_ModelSelection,
  example3_CostTracking,
  example4_FallbackHandling,
  example5_EventDriven,
  example6_FleetManagerIntegration,
  example7_CustomConfiguration,
  example8_ComplexityAnalysis,
  example9_CostComparison,
};
