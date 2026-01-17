/**
 * Example: Using HybridRouterWithComplexity for ML-Based Routing
 *
 * This example demonstrates how to use the ML-enhanced HybridRouter
 * that learns from routing outcomes to improve classification accuracy.
 */

import {
  HybridRouterWithComplexity,
  HybridRouterWithComplexityConfig,
  ClassifierStatistics
} from '../src/providers/HybridRouterComplexityIntegration';
import { TaskComplexity } from '../src/providers/HybridRouter';
import { RoutingHistoryEntry } from '../src/routing/ComplexityClassifier';

/**
 * Example 1: Basic Setup with ML Classifier
 */
async function basicMLRoutingExample() {
  console.log('\n=== Example 1: Basic ML Routing Setup ===\n');

  // Configure router with ML classifier
  const config: HybridRouterWithComplexityConfig = {
    // Provider configurations
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY || 'sk-ant-...'
    },
    ruvllm: {
      baseUrl: process.env.RUVLLM_URL || 'http://localhost:8080'
    },

    // ML Classifier configuration
    classifier: {
      enableLearning: true,    // Enable automatic learning
      learningRate: 0.1,       // How fast to adjust weights (0-1)
      maxHistorySize: 500,     // Keep last 500 outcomes for learning
      debug: true              // Enable debug logging
    },

    // Auto-training configuration
    autoTrain: true,           // Automatically learn from each request
    minConfidence: 0.3,        // Minimum confidence threshold
    fallbackToHeuristics: false // Don't fallback to simple heuristics
  };

  const router = new HybridRouterWithComplexity(config);
  await router.initialize();

  // Make a request - ML classifier will analyze complexity
  const response = await router.complete({
    messages: [
      {
        role: 'user',
        content: 'Explain the concept of microservices architecture.'
      }
    ],
    maxTokens: 1000
  });

  console.log('Response:', response.content);

  // View classifier statistics
  const stats = router.getClassifierStats();
  console.log('\nClassifier Statistics:');
  console.log(`  Total Classifications: ${stats.totalClassifications}`);
  console.log(`  Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);

  await router.shutdown();
}

/**
 * Example 2: Manual Training with Custom Outcomes
 */
async function manualTrainingExample() {
  console.log('\n=== Example 2: Manual Training ===\n');

  const router = new HybridRouterWithComplexity({
    classifier: { enableLearning: true, learningRate: 0.05 },
    autoTrain: false // Disable auto-training for manual control
  });

  await router.initialize();

  // Manually provide training data
  const trainingData: RoutingHistoryEntry = {
    features: {
      contentLength: 5000,
      estimatedTokenCount: 1250,
      messageCount: 3,
      hasCodeBlocks: true,
      keywordComplexity: 0.7,
      promptEntropy: 0.6,
      contextWindowUsage: 0.15,
      hasMultimodal: false,
      requestedMaxTokens: 2000,
      systemPromptComplexity: 0.5
    },
    selectedComplexity: TaskComplexity.COMPLEX,
    actualOutcome: {
      success: true,
      latency: 2500,
      cost: 0.01,
      provider: 'cloud'
    },
    timestamp: new Date()
  };

  router.trainFromOutcome(trainingData);
  console.log('Training data recorded');

  // Train with multiple outcomes
  for (let i = 0; i < 10; i++) {
    router.trainFromOutcome({
      ...trainingData,
      actualOutcome: {
        ...trainingData.actualOutcome,
        latency: 2000 + i * 100
      }
    });
  }

  const stats = router.getClassifierStats();
  console.log(`\nTraining complete: ${stats.historySize} entries`);

  await router.shutdown();
}

/**
 * Example 3: Monitoring and Statistics
 */
async function monitoringExample() {
  console.log('\n=== Example 3: Monitoring Classifier Performance ===\n');

  const router = new HybridRouterWithComplexity({
    classifier: { enableLearning: true },
    autoTrain: true
  });

  await router.initialize();

  // Simulate multiple requests
  const tasks = [
    'What is 2+2?',
    'Explain object-oriented programming with examples.',
    `Design a distributed microservices architecture for an e-commerce platform.
     Include service decomposition, communication patterns, and scalability strategies.`,
    'Write a sorting algorithm in Python.'
  ];

  for (const task of tasks) {
    try {
      await router.complete({
        messages: [{ role: 'user', content: task }],
        maxTokens: 1000
      });
    } catch (error) {
      console.error(`Request failed: ${error}`);
    }
  }

  // Get comprehensive statistics
  const stats = router.getClassifierStats();

  console.log('\n📊 Classifier Performance Report:');
  console.log('─'.repeat(50));
  console.log(`Total Classifications: ${stats.totalClassifications}`);
  console.log(`Training History Size: ${stats.historySize}`);
  console.log(`Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);

  console.log('\n📈 Complexity Distribution:');
  Object.entries(stats.complexityDistribution).forEach(([complexity, count]) => {
    if (count > 0) {
      const percentage = (count / stats.totalClassifications * 100).toFixed(1);
      console.log(`  ${complexity.padEnd(15)}: ${count} (${percentage}%)`);
    }
  });

  console.log('\n⚖️  Feature Weights:');
  Object.entries(stats.featureWeights).forEach(([feature, weight]) => {
    console.log(`  ${feature.padEnd(20)}: ${(weight * 100).toFixed(1)}%`);
  });

  console.log('\n🎯 Complexity Thresholds:');
  Object.entries(stats.thresholds).forEach(([threshold, value]) => {
    console.log(`  ${threshold.padEnd(15)}: ${value.toFixed(3)}`);
  });

  await router.shutdown();
}

/**
 * Example 4: Comparing ML vs Heuristic Classification
 */
async function comparisonExample() {
  console.log('\n=== Example 4: ML vs Heuristic Comparison ===\n');

  const mlRouter = new HybridRouterWithComplexity({
    classifier: { enableLearning: true, learningRate: 0.1 },
    autoTrain: true,
    fallbackToHeuristics: false
  });

  await mlRouter.initialize();

  // Train with successful outcomes for code-heavy tasks
  for (let i = 0; i < 20; i++) {
    mlRouter.trainFromOutcome({
      features: {
        contentLength: 3000,
        estimatedTokenCount: 750,
        messageCount: 2,
        hasCodeBlocks: true,
        keywordComplexity: 0.6,
        promptEntropy: 0.5,
        contextWindowUsage: 0.09,
        hasMultimodal: false,
        requestedMaxTokens: 1500,
        systemPromptComplexity: 0.4
      },
      selectedComplexity: TaskComplexity.COMPLEX,
      actualOutcome: {
        success: true,
        latency: 2000,
        cost: 0.008,
        provider: 'cloud'
      },
      timestamp: new Date()
    });
  }

  console.log('ML Classifier trained with 20 successful code task outcomes');

  const mlStats = mlRouter.getClassifierStats();
  console.log('\n📊 ML Classifier Performance:');
  console.log(`  Success Rate: ${(mlStats.successRate * 100).toFixed(1)}%`);
  console.log(`  Avg Confidence: ${(mlStats.averageConfidence * 100).toFixed(1)}%`);
  console.log(`  Code Block Weight: ${(mlStats.featureWeights.codeBlocks * 100).toFixed(1)}%`);

  await mlRouter.shutdown();
}

/**
 * Example 5: Advanced - Export and Analyze Routing History
 */
async function historyAnalysisExample() {
  console.log('\n=== Example 5: Routing History Analysis ===\n');

  const router = new HybridRouterWithComplexity({
    classifier: { enableLearning: true, maxHistorySize: 100 },
    autoTrain: true
  });

  await router.initialize();

  // Simulate various outcomes
  const outcomes: Array<{
    complexity: TaskComplexity;
    success: boolean;
    latency: number;
  }> = [
    { complexity: TaskComplexity.SIMPLE, success: true, latency: 800 },
    { complexity: TaskComplexity.SIMPLE, success: true, latency: 900 },
    { complexity: TaskComplexity.MODERATE, success: true, latency: 1500 },
    { complexity: TaskComplexity.COMPLEX, success: false, latency: 8000 },
    { complexity: TaskComplexity.COMPLEX, success: true, latency: 2500 }
  ];

  outcomes.forEach((outcome, i) => {
    router.trainFromOutcome({
      features: {
        contentLength: 1000 * (i + 1),
        estimatedTokenCount: 250 * (i + 1),
        messageCount: 1,
        hasCodeBlocks: i > 2,
        keywordComplexity: 0.3 * (i + 1) / outcomes.length,
        promptEntropy: 0.5,
        contextWindowUsage: 0.1,
        hasMultimodal: false,
        requestedMaxTokens: 1000,
        systemPromptComplexity: 0.3
      },
      selectedComplexity: outcome.complexity,
      actualOutcome: {
        success: outcome.success,
        latency: outcome.latency,
        cost: outcome.latency * 0.000001,
        provider: outcome.complexity === TaskComplexity.SIMPLE ? 'local' : 'cloud'
      },
      timestamp: new Date()
    });
  });

  // Get and analyze history
  const history = router.getRoutingHistory();

  console.log(`📚 Routing History (${history.length} entries):\n`);

  history.forEach((entry, i) => {
    console.log(`Entry ${i + 1}:`);
    console.log(`  Complexity: ${entry.selectedComplexity}`);
    console.log(`  Success: ${entry.actualOutcome.success ? '✓' : '✗'}`);
    console.log(`  Latency: ${entry.actualOutcome.latency}ms`);
    console.log(`  Provider: ${entry.actualOutcome.provider || 'unknown'}`);
    console.log('');
  });

  // Calculate success rate by complexity
  const successByComplexity: Record<TaskComplexity, { total: number; success: number }> = {
    [TaskComplexity.SIMPLE]: { total: 0, success: 0 },
    [TaskComplexity.MODERATE]: { total: 0, success: 0 },
    [TaskComplexity.COMPLEX]: { total: 0, success: 0 },
    [TaskComplexity.VERY_COMPLEX]: { total: 0, success: 0 }
  };

  history.forEach(entry => {
    successByComplexity[entry.selectedComplexity].total++;
    if (entry.actualOutcome.success) {
      successByComplexity[entry.selectedComplexity].success++;
    }
  });

  console.log('📈 Success Rate by Complexity:');
  Object.entries(successByComplexity).forEach(([complexity, stats]) => {
    if (stats.total > 0) {
      const rate = (stats.success / stats.total * 100).toFixed(1);
      console.log(`  ${complexity.padEnd(15)}: ${rate}% (${stats.success}/${stats.total})`);
    }
  });

  await router.shutdown();
}

/**
 * Main function to run all examples
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   HybridRouter ML Complexity Classification Examples   ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    // Note: These examples are for demonstration
    // In production, you'd have actual API keys and running services

    // await basicMLRoutingExample();
    // await manualTrainingExample();
    await monitoringExample();
    // await comparisonExample();
    await historyAnalysisExample();

    console.log('\n✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  basicMLRoutingExample,
  manualTrainingExample,
  monitoringExample,
  comparisonExample,
  historyAnalysisExample
};
