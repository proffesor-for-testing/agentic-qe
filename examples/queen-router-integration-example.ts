/**
 * Queen Router Integration Example
 * ADR-026: Intelligent Model Routing
 *
 * This example demonstrates how to use the QueenRouterAdapter
 * to route tasks to optimal agent tiers based on complexity.
 */

import {
  createQueenRouterAdapter,
  type QueenRouterConfig,
  type ClassifiableTask,
} from '../src/routing/index.js';

// ============================================================================
// Example 1: Basic Usage
// ============================================================================

async function basicUsage() {
  console.log('=== Basic Usage ===\n');

  // Create router with default configuration
  const router = createQueenRouterAdapter();

  // Route a simple task
  const simpleTask: ClassifiableTask = {
    description: 'Fix typo in README',
    fileCount: 1,
    estimatedLinesAffected: 2,
    priority: 'p2',
  };

  const decision1 = await router.route(simpleTask);
  console.log('Simple task routing:');
  console.log(`  Tier: ${decision1.tier}`);
  console.log(`  Model: ${decision1.model}`);
  console.log(`  Complexity: ${decision1.complexity}`);
  console.log(`  Confidence: ${(decision1.confidence * 100).toFixed(1)}%`);
  console.log(`  Estimated cost: $${decision1.estimatedCost.toFixed(4)}`);
  console.log(`  Reasoning: ${decision1.reasoning}\n`);

  // Route a complex task
  const complexTask: ClassifiableTask = {
    description: 'Refactor authentication system with OAuth2',
    fileCount: 20,
    crossComponent: true,
    domain: 'security-compliance',
    priority: 'critical',
    estimatedLinesAffected: 500,
    requiresExternalApis: true,
    type: 'security-scan',
    requiredCapabilities: ['sast', 'owasp'],
  };

  const decision2 = await router.route(complexTask);
  console.log('Complex task routing:');
  console.log(`  Tier: ${decision2.tier}`);
  console.log(`  Model: ${decision2.model}`);
  console.log(`  Complexity: ${decision2.complexity}`);
  console.log(`  Confidence: ${(decision2.confidence * 100).toFixed(1)}%`);
  console.log(`  Fallback chain: ${decision2.fallbackTiers.join(' → ')}`);
  console.log(`  Multi-model: ${decision2.triggerMultiModel}`);
  console.log(`  Human review: ${decision2.triggerHumanReview}`);
  console.log(`  Estimated cost: $${decision2.estimatedCost.toFixed(4)}\n`);
}

// ============================================================================
// Example 2: Custom Configuration
// ============================================================================

async function customConfiguration() {
  console.log('=== Custom Configuration ===\n');

  const config: QueenRouterConfig = {
    routing: {
      confidence: {
        multiModel: 0.85, // Stricter multi-model threshold
        humanReview: 0.15, // More human reviews
        security: 0.90, // Very strict for security
        escalation: 0.65,
      },
      tierMapping: {
        trivial: ['booster', 'haiku'],
        simple: ['haiku'],
        moderate: ['sonnet'],
        complex: ['sonnet', 'opus'],
        critical: ['opus'],
      },
      costOptimization: {
        enabled: true,
        preferCheaperModels: true,
        costPerMillionTokens: {
          haiku: { input: 0.25, output: 1.25 },
          sonnet: { input: 3.0, output: 15.0 },
          opus: { input: 15.0, output: 75.0 },
        },
        dailyCostLimit: 100, // $100/day limit
        costAlertThreshold: 0.80, // Alert at 80%
      },
      fallback: {
        enabled: true,
        maxAttempts: 2,
        retryDelayMs: 1000,
        chain: {
          booster: 'haiku',
          haiku: 'sonnet',
          sonnet: 'opus',
          opus: null,
        },
      },
      verbose: true,
    },
    enableCostTracking: true,
    avgInputTokens: 3000,
    avgOutputTokens: 800,
  };

  const router = createQueenRouterAdapter(config);

  const task: ClassifiableTask = {
    description: 'Add feature with comprehensive tests',
    fileCount: 10,
    domain: 'test-generation',
    estimatedLinesAffected: 200,
    priority: 'p1',
  };

  const decision = await router.route(task);
  console.log('Routing decision:');
  console.log(`  Tier: ${decision.tier}`);
  console.log(`  Estimated cost: $${decision.estimatedCost.toFixed(4)}\n`);
}

// ============================================================================
// Example 3: Outcome Recording and Learning
// ============================================================================

async function outcomeRecording() {
  console.log('=== Outcome Recording and Learning ===\n');

  const router = createQueenRouterAdapter();

  // Route multiple tasks and record outcomes
  const tasks = [
    { description: 'Task 1', fileCount: 2 },
    { description: 'Task 2', fileCount: 5 },
    { description: 'Task 3', fileCount: 15, crossComponent: true },
  ];

  for (const taskData of tasks) {
    const task: ClassifiableTask = { ...taskData, priority: 'p1' };
    const decision = await router.route(task);

    // Simulate task execution
    const success = Math.random() > 0.2; // 80% success rate
    const qualityScore = success ? 0.85 + Math.random() * 0.15 : 0.4;
    const durationMs = 1000 + Math.random() * 4000;
    const fallbackAttempts = success ? 0 : Math.floor(Math.random() * 2);

    // Record outcome
    router.recordOutcome(
      task,
      decision,
      decision.tier,
      success,
      qualityScore,
      durationMs,
      fallbackAttempts
    );
  }

  // Get statistics
  const successRates = router.getSuccessRateByTier();
  console.log('Success rates by tier:');
  console.log(`  Booster: ${(successRates.booster * 100).toFixed(1)}%`);
  console.log(`  Haiku: ${(successRates.haiku * 100).toFixed(1)}%`);
  console.log(`  Sonnet: ${(successRates.sonnet * 100).toFixed(1)}%`);
  console.log(`  Opus: ${(successRates.opus * 100).toFixed(1)}%\n`);

  const fallbackStats = router.getFallbackStats();
  console.log('Fallback statistics:');
  console.log(`  Total with fallback: ${fallbackStats.totalWithFallback}`);
  console.log(`  Avg fallback attempts: ${fallbackStats.avgFallbackAttempts.toFixed(2)}`);
  console.log(`  Fallback success rate: ${(fallbackStats.fallbackSuccessRate * 100).toFixed(1)}%\n`);

  const costStats = router.getCostStats();
  console.log('Cost statistics:');
  console.log(`  Total cost: $${costStats.totalCost.toFixed(2)}`);
  console.log(`  Total tasks: ${costStats.totalTasks}`);
  console.log(`  Avg cost/task: $${costStats.avgCostPerTask.toFixed(4)}`);
  console.log(`  Daily cost: $${costStats.dailyCost.toFixed(2)}\n`);
}

// ============================================================================
// Example 4: Dynamic Configuration Adjustment
// ============================================================================

async function dynamicConfiguration() {
  console.log('=== Dynamic Configuration Adjustment ===\n');

  const router = createQueenRouterAdapter();

  // Initial task
  const task: ClassifiableTask = {
    description: 'Moderate complexity task',
    fileCount: 8,
    domain: 'test-generation',
    priority: 'p1',
  };

  const decision1 = await router.route(task);
  console.log('Before threshold adjustment:');
  console.log(`  Tier: ${decision1.tier}`);
  console.log(`  Multi-model triggered: ${decision1.triggerMultiModel}\n`);

  // Adjust confidence thresholds
  router.updateConfidenceThresholds({
    multiModel: 0.95, // Very high threshold
    security: 0.98,
  });

  const decision2 = await router.route(task);
  console.log('After threshold adjustment:');
  console.log(`  Tier: ${decision2.tier}`);
  console.log(`  Multi-model triggered: ${decision2.triggerMultiModel}\n`);
}

// ============================================================================
// Example 5: Environment Variable Configuration
// ============================================================================

async function environmentConfiguration() {
  console.log('=== Environment Variable Configuration ===\n');

  // These environment variables can be set to override defaults:
  // - ROUTING_CONFIDENCE_MULTI_MODEL=0.85
  // - ROUTING_CONFIDENCE_HUMAN_REVIEW=0.20
  // - ROUTING_CONFIDENCE_SECURITY=0.90
  // - ROUTING_COST_DAILY_LIMIT=50
  // - ROUTING_COST_PREFER_CHEAPER=true
  // - ROUTING_FALLBACK_ENABLED=true
  // - ROUTING_VERBOSE=true

  console.log('Environment variables for configuration:');
  console.log('  ROUTING_CONFIDENCE_MULTI_MODEL: Threshold for multi-model (0-1)');
  console.log('  ROUTING_CONFIDENCE_SECURITY: Threshold for security tasks (0-1)');
  console.log('  ROUTING_COST_DAILY_LIMIT: Daily cost limit in USD');
  console.log('  ROUTING_COST_PREFER_CHEAPER: Prefer cheaper models (true/false)');
  console.log('  ROUTING_FALLBACK_ENABLED: Enable fallback (true/false)');
  console.log('  ROUTING_VERBOSE: Enable verbose logging (true/false)\n');
}

// ============================================================================
// Run Examples
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       Queen Router Integration Examples (ADR-026)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  await basicUsage();
  await customConfiguration();
  await outcomeRecording();
  await dynamicConfiguration();
  await environmentConfiguration();

  console.log('Examples complete!');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
