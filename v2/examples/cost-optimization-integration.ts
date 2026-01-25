/**
 * Cost Optimization Integration Example
 *
 * Demonstrates how to use CostOptimizationStrategies with HybridRouter
 * to achieve 6-10% token savings and intelligent model right-sizing.
 *
 * Run with: npx tsx examples/cost-optimization-integration.ts
 */

import {
  CostOptimizationManager,
  PromptCompressor,
  SmartCacheStrategy,
  ModelRightSizer
} from '../src/providers/CostOptimizationStrategies';
import { LLMCompletionOptions } from '../src/providers/ILLMProvider';
import { TaskComplexity, BudgetStatus } from '../src/providers/HybridRouter';
import { TaskType } from '../src/routing/ModelCapabilityRegistry';

/**
 * Example 1: Prompt Compression
 */
async function demonstratePromptCompression() {
  console.log('\n=== Example 1: Prompt Compression ===\n');

  const compressor = new PromptCompressor({
    enableCompression: true,
    minCompressionRatio: 0.05
  });

  // Example prompt with redundancies
  const verbosePrompt = `
    This  is  a  very  simple  function  that  we  need  to  test.
    The  function  basically  just  adds  two  numbers  together.

    In order to  test  this  function  properly,  we  need  to  write
    unit test  cases  that  cover  all  edge  cases.

    Prior to  running  the  tests,  make  sure  the  environment  is
    configured  correctly.
  `;

  const result = compressor.compress(verbosePrompt);

  console.log('Original Prompt:');
  console.log(verbosePrompt);
  console.log('\nCompressed Prompt:');
  console.log(result.compressed);
  console.log('\nSavings:');
  console.log(`- Tokens saved: ${result.tokensSaved}`);
  console.log(`- Compression ratio: ${(result.ratio * 100).toFixed(1)}%`);
  console.log(`- Techniques applied: ${result.techniques.join(', ')}`);
  console.log(`- Estimated cost savings: $${((result.tokensSaved / 1_000_000) * 3).toFixed(6)}`);
}

/**
 * Example 2: Smart Caching Strategies
 */
async function demonstrateCachingStrategies() {
  console.log('\n=== Example 2: Smart Caching Strategies ===\n');

  const cacheStrategy = new SmartCacheStrategy({
    enableSmartCaching: true,
    defaultCacheTTL: 3600
  });

  // Different task types have different caching strategies
  const taskTypes: TaskType[] = [
    'test-generation',
    'coverage-analysis',
    'bug-detection',
    'documentation',
    'security-scanning'
  ];

  console.log('Task-Specific Cache Strategies:\n');

  taskTypes.forEach(taskType => {
    const strategy = cacheStrategy.getCacheStrategy(taskType);
    console.log(`${taskType}:`);
    console.log(`  - TTL: ${strategy.ttlSeconds}s (${(strategy.ttlSeconds / 60).toFixed(0)} min)`);
    console.log(`  - Aggressive: ${strategy.aggressive ? 'Yes' : 'No'}`);
    console.log(`  - Confidence threshold: ${(strategy.confidenceThreshold * 100).toFixed(0)}%\n`);
  });

  // Generate cache keys
  const options: LLMCompletionOptions = {
    model: 'claude-sonnet-4',
    messages: [
      { role: 'user', content: 'Generate tests for UserService.authenticate()' }
    ]
  };

  const cacheKey = cacheStrategy.generateCacheKey(options, 'test-generation');
  console.log(`Generated cache key: ${cacheKey}`);
}

/**
 * Example 3: Model Right-Sizing
 */
async function demonstrateModelRightSizing() {
  console.log('\n=== Example 3: Model Right-Sizing ===\n');

  const rightSizer = new ModelRightSizer();

  // Scenario 1: Healthy budget
  const healthyBudget: BudgetStatus = {
    dailySpent: 5,
    dailyRemaining: 95,
    monthlySpent: 50,
    monthlyRemaining: 950,
    utilizationPercentage: 5,
    isOverBudget: false,
    alertTriggered: false
  };

  console.log('Scenario 1: Healthy Budget (5% utilization)');
  const result1 = rightSizer.shouldDowngradeModel(TaskComplexity.SIMPLE, healthyBudget);
  console.log(`  Should downgrade: ${result1.shouldDowngrade}`);
  console.log(`  Reason: ${result1.reason}\n`);

  // Scenario 2: High budget pressure
  const highPressureBudget: BudgetStatus = {
    dailySpent: 85,
    dailyRemaining: 15,
    monthlySpent: 850,
    monthlyRemaining: 150,
    utilizationPercentage: 85,
    isOverBudget: false,
    alertTriggered: true
  };

  console.log('Scenario 2: High Budget Pressure (85% utilization)');
  const result2 = rightSizer.shouldDowngradeModel(TaskComplexity.SIMPLE, highPressureBudget);
  console.log(`  Should downgrade: ${result2.shouldDowngrade}`);
  console.log(`  Recommended model: ${result2.recommendedModel}`);
  console.log(`  Quality impact: ${(result2.qualityImpact * 100).toFixed(0)}%`);
  console.log(`  Estimated savings: $${result2.estimatedSavings?.toFixed(4)}`);
  console.log(`  Reason: ${result2.reason}\n`);

  // Scenario 3: Over budget
  const overBudget: BudgetStatus = {
    dailySpent: 110,
    dailyRemaining: -10,
    monthlySpent: 1100,
    monthlyRemaining: -100,
    utilizationPercentage: 110,
    isOverBudget: true,
    alertTriggered: true
  };

  console.log('Scenario 3: Over Budget (110% utilization)');
  const result3Simple = rightSizer.shouldDowngradeModel(TaskComplexity.SIMPLE, overBudget);
  const result3Complex = rightSizer.shouldDowngradeModel(TaskComplexity.COMPLEX, overBudget);

  console.log('  Simple task:');
  console.log(`    Should downgrade: ${result3Simple.shouldDowngrade}`);
  console.log(`    Recommended model: ${result3Simple.recommendedModel}`);
  console.log(`    Estimated savings: $${result3Simple.estimatedSavings?.toFixed(4)}`);

  console.log('  Complex task:');
  console.log(`    Should downgrade: ${result3Complex.shouldDowngrade}`);
  console.log(`    Recommended model: ${result3Complex.recommendedModel}`);
  console.log(`    Estimated savings: $${result3Complex.estimatedSavings?.toFixed(4)}\n`);
}

/**
 * Example 4: Complete Optimization Pipeline
 */
async function demonstrateFullOptimization() {
  console.log('\n=== Example 4: Complete Optimization Pipeline ===\n');

  const optimizer = new CostOptimizationManager({
    enableCompression: true,
    enableBatching: true,
    enableSmartCaching: true,
    minCompressionRatio: 0.05
  });

  // Create a verbose request
  const options: LLMCompletionOptions = {
    model: 'claude-opus-4',
    temperature: 0.7,
    maxTokens: 2000,
    messages: [
      {
        role: 'user',
        content: `
          This  is  a  very  important  function  that  we  really  need  to  test.
          The  function  basically  authenticates  users  in  our  application.

          In order to  test  this  properly,  we  need  comprehensive  unit test
          coverage  that  actually  validates  all  the  edge  cases.

          Please  generate  test  cases  for  the  following  function:

          \`\`\`typescript
          function authenticate(username: string, password: string): boolean {
            // Authentication logic here
            return true;
          }
          \`\`\`
        `
      }
    ]
  };

  // Simulate budget pressure
  const budgetStatus: BudgetStatus = {
    dailySpent: 90,
    dailyRemaining: 10,
    monthlySpent: 900,
    monthlyRemaining: 100,
    utilizationPercentage: 90,
    isOverBudget: false,
    alertTriggered: true
  };

  // Apply all optimizations
  const result = optimizer.optimizeRequest(options, {
    taskType: 'test-generation',
    complexity: TaskComplexity.MODERATE,
    budgetStatus
  });

  console.log('Original Request:');
  console.log(`  Model: ${options.model}`);
  console.log(`  Content length: ${JSON.stringify(options).length} chars`);
  console.log(`  Estimated tokens: ${Math.ceil(JSON.stringify(options).length / 4)}`);

  console.log('\nOptimized Request:');
  console.log(`  Model: ${result.optimizedOptions.model}`);
  console.log(`  Content length: ${JSON.stringify(result.optimizedOptions).length} chars`);
  console.log(`  Estimated tokens: ${Math.ceil(JSON.stringify(result.optimizedOptions).length / 4)}`);

  console.log('\nOptimization Results:');

  if (result.compressionResult) {
    console.log('  Compression:');
    console.log(`    - Tokens saved: ${result.compressionResult.tokensSaved}`);
    console.log(`    - Compression ratio: ${(result.compressionResult.ratio * 100).toFixed(1)}%`);
    console.log(`    - Techniques: ${result.compressionResult.techniques.join(', ')}`);
  }

  if (result.modelDowngrade?.shouldDowngrade) {
    console.log('  Model Downgrade:');
    console.log(`    - Original: ${options.model}`);
    console.log(`    - New: ${result.modelDowngrade.recommendedModel}`);
    console.log(`    - Quality impact: ${(result.modelDowngrade.qualityImpact * 100).toFixed(0)}%`);
    console.log(`    - Reason: ${result.modelDowngrade.reason}`);
  }

  console.log('\nTotal Estimated Savings:');
  console.log(`  $${result.estimatedSavings.toFixed(6)} per request`);
  console.log(`  $${(result.estimatedSavings * 1000).toFixed(2)} per 1,000 requests`);
  console.log(`  $${(result.estimatedSavings * 1000000).toFixed(2)} per 1,000,000 requests`);
}

/**
 * Example 5: Integration with HybridRouter
 */
async function demonstrateHybridRouterIntegration() {
  console.log('\n=== Example 5: HybridRouter Integration ===\n');

  console.log('HybridRouter integration workflow:');
  console.log('');
  console.log('1. User makes request to HybridRouter');
  console.log('2. HybridRouter checks budget status');
  console.log('3. If budget pressured, apply optimizations:');
  console.log('   a. Compress prompt (6-10% token savings)');
  console.log('   b. Check model right-sizing (downgrade if needed)');
  console.log('   c. Generate cache key for result caching');
  console.log('4. Route to appropriate provider (local/cloud)');
  console.log('5. Cache successful responses with task-specific TTL');
  console.log('6. Track actual savings vs. estimated');
  console.log('');
  console.log('Example code:');
  console.log('');
  console.log('```typescript');
  console.log('const optimizer = new CostOptimizationManager();');
  console.log('const budgetStatus = router.getBudgetStatus();');
  console.log('');
  console.log('// Optimize request before routing');
  console.log('const { optimizedOptions, estimatedSavings } = optimizer.optimizeRequest(');
  console.log('  options,');
  console.log('  { complexity, budgetStatus, taskType }');
  console.log(');');
  console.log('');
  console.log('// Route with optimized options');
  console.log('const response = await router.complete(optimizedOptions);');
  console.log('');
  console.log('// Cache if appropriate');
  console.log('if (optimizer.getCacheStrategy().shouldCache(optimizedOptions, response)) {');
  console.log('  const cacheKey = optimizer.getCacheStrategy().generateCacheKey(');
  console.log('    optimizedOptions,');
  console.log('    taskType');
  console.log('  );');
  console.log('  await cache.set(cacheKey, response, ttl);');
  console.log('}');
  console.log('```');
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Cost Optimization Strategies - Integration Examples   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await demonstratePromptCompression();
    await demonstrateCachingStrategies();
    await demonstrateModelRightSizing();
    await demonstrateFullOptimization();
    await demonstrateHybridRouterIntegration();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  demonstratePromptCompression,
  demonstrateCachingStrategies,
  demonstrateModelRightSizing,
  demonstrateFullOptimization,
  demonstrateHybridRouterIntegration
};
