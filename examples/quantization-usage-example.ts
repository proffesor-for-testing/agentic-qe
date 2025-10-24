/**
 * Vector Quantization Usage Examples
 * Demonstrates how to use QuantizationManager with AQE Fleet agents
 */

import { QuantizationManager, type AgentProfile } from '../src/core/quantization';
import { TestGeneratorAgent } from '../src/agents/TestGeneratorAgent';
import { CoverageAnalyzerAgent } from '../src/agents/CoverageAnalyzerAgent';
import { FlakyTestHunterAgent } from '../src/agents/FlakyTestHunterAgent';

/**
 * Example 1: Get Recommendation for Your Use Case
 */
function example1_getRecommendation() {
  console.log('\n=== Example 1: Get Quantization Recommendation ===\n');

  // Define your agent profile
  const profile: AgentProfile = {
    vectorCount: 50000,           // Expected number of vectors
    memoryConstraint: 'medium',   // Memory availability
    accuracyPriority: 'high',     // Accuracy requirement
    speedPriority: 'medium',      // Speed requirement
    deployment: 'cloud'           // Deployment target
  };

  // Get recommendation
  const recommendation = QuantizationManager.getRecommendation(profile);

  console.log('Profile:', profile);
  console.log('\nRecommendation:', recommendation.type);
  console.log('Reason:', recommendation.reason);
  console.log('\nExpected Benefits:');
  console.log('  Memory Reduction:', recommendation.expectedBenefits.memoryReduction);
  console.log('  Speed Increase:', recommendation.expectedBenefits.speedIncrease);
  console.log('  Accuracy Impact:', recommendation.expectedBenefits.accuracyImpact);
  console.log('\nUse Case:', recommendation.useCase);
}

/**
 * Example 2: Calculate Memory Usage
 */
function example2_calculateMemory() {
  console.log('\n=== Example 2: Calculate Memory Usage ===\n');

  const vectorCount = 100000;
  const dimensions = 768;

  console.log(`Configuration: ${vectorCount.toLocaleString()} vectors, ${dimensions}D\n`);

  // Compare all quantization types
  const types: Array<'none' | 'scalar' | 'binary' | 'product'> = ['none', 'scalar', 'binary', 'product'];

  types.forEach(type => {
    const result = QuantizationManager.calculateMemoryUsage(vectorCount, dimensions, type);
    console.log(`${type.toUpperCase()}:`);
    console.log(`  Bytes/Vector: ${result.bytesPerVector.toLocaleString()}`);
    console.log(`  Total Memory: ${result.totalMB.toFixed(2)} MB`);
    console.log(`  Reduction: ${result.reduction}`);
    console.log('');
  });
}

/**
 * Example 3: Compare Quantization Types
 */
function example3_compareTypes() {
  console.log('\n=== Example 3: Compare Quantization Types ===\n');

  const vectorCount = 50000;
  const comparison = QuantizationManager.compareQuantizationTypes(vectorCount);

  console.log(`Comparison for ${vectorCount.toLocaleString()} vectors:\n`);

  comparison.forEach(item => {
    const marker = item.recommended ? '⭐' : '  ';
    console.log(`${marker} ${item.type.toUpperCase()}`);
    console.log(`   Memory: ${item.memoryMB.toFixed(2)} MB`);
    console.log(`   Reduction: ${item.reduction}`);
    console.log(`   Speed: ${item.speedMultiplier}`);
    console.log(`   Accuracy Loss: ${item.accuracyLoss}`);
    if (item.recommended) {
      console.log('   ⭐ RECOMMENDED');
    }
    console.log('');
  });
}

/**
 * Example 4: Configure Agent with Quantization
 */
async function example4_configureAgent() {
  console.log('\n=== Example 4: Configure Agent with Quantization ===\n');

  // Get recommendation for test generator use case
  const profile: AgentProfile = {
    vectorCount: 30000,
    deployment: 'cloud',
    accuracyPriority: 'high'
  };

  const recommendation = QuantizationManager.getRecommendation(profile);

  console.log('Recommended quantization for TestGeneratorAgent:', recommendation.type);

  // Configure agent with recommended quantization
  const agentConfig = {
    id: 'test-generator-1',
    type: 'test-generator' as const,
    capabilities: [
      { name: 'unit-test-generation', level: 'expert', description: 'Generate unit tests' }
    ],
    context: {
      environment: 'production',
      testFramework: 'jest'
    },
    memoryStore: null as any, // Would be real memory store
    eventBus: null as any,    // Would be real event bus
    quantizationType: recommendation.type as 'scalar' | 'binary' | 'product' | 'none',
    agentDBPath: '.agentdb/test-generator.db',
    enableLearning: true
  };

  console.log('\nAgent Configuration:');
  console.log('  quantizationType:', agentConfig.quantizationType);
  console.log('  agentDBPath:', agentConfig.agentDBPath);
  console.log('  enableLearning:', agentConfig.enableLearning);
}

/**
 * Example 5: Monitor Quantization Metrics
 */
function example5_monitorMetrics() {
  console.log('\n=== Example 5: Monitor Quantization Metrics ===\n');

  // Simulate recording metrics for multiple agents
  QuantizationManager.recordMetrics('test-generator-1', {
    type: 'scalar',
    memoryReduction: 4,
    estimatedAccuracyLoss: 1.5,
    searchSpeedIncrease: 3,
    memoryUsageMB: 36.6,
    vectorCount: 50000,
    timestamp: new Date()
  });

  QuantizationManager.recordMetrics('coverage-analyzer-1', {
    type: 'scalar',
    memoryReduction: 4,
    estimatedAccuracyLoss: 1.2,
    searchSpeedIncrease: 3,
    memoryUsageMB: 29.3,
    vectorCount: 40000,
    timestamp: new Date()
  });

  QuantizationManager.recordMetrics('flaky-test-hunter-1', {
    type: 'binary',
    memoryReduction: 32,
    estimatedAccuracyLoss: 3.5,
    searchSpeedIncrease: 10,
    memoryUsageMB: 4.6,
    vectorCount: 50000,
    timestamp: new Date()
  });

  // Get aggregated metrics
  const aggregated = QuantizationManager.getAggregatedMetrics();

  console.log('Aggregated Metrics:');
  console.log('  Total Vectors:', aggregated.totalVectors.toLocaleString());
  console.log('  Total Memory:', aggregated.totalMemoryMB.toFixed(2), 'MB');
  console.log('  Avg Reduction:', aggregated.averageMemoryReduction.toFixed(1) + 'x');
  console.log('\nQuantization Distribution:');
  console.log('  None:', aggregated.quantizationTypes.none, 'agents');
  console.log('  Scalar (4x):', aggregated.quantizationTypes.scalar, 'agents');
  console.log('  Binary (32x):', aggregated.quantizationTypes.binary, 'agents');
  console.log('  Product (8-16x):', aggregated.quantizationTypes.product, 'agents');

  // Generate report
  console.log('\n' + QuantizationManager.generateReport());
}

/**
 * Example 6: Optimize for Different Scenarios
 */
function example6_scenarioOptimization() {
  console.log('\n=== Example 6: Scenario-Based Optimization ===\n');

  const scenarios = [
    {
      name: 'Mobile App (Low Memory)',
      profile: { vectorCount: 50000, memoryConstraint: 'low' as const, deployment: 'mobile' as const }
    },
    {
      name: 'Cloud Production (Balanced)',
      profile: { vectorCount: 100000, deployment: 'cloud' as const, accuracyPriority: 'high' as const }
    },
    {
      name: 'Edge Device (Fast)',
      profile: { vectorCount: 30000, deployment: 'edge' as const, speedPriority: 'critical' as const }
    },
    {
      name: 'Critical System (Max Accuracy)',
      profile: { vectorCount: 20000, accuracyPriority: 'critical' as const }
    },
    {
      name: 'Large Scale (1M+ vectors)',
      profile: { vectorCount: 1500000 }
    }
  ];

  scenarios.forEach(scenario => {
    const rec = QuantizationManager.getRecommendation(scenario.profile);
    console.log(`${scenario.name}:`);
    console.log(`  Recommended: ${rec.type}`);
    console.log(`  Reason: ${rec.reason}`);
    console.log('');
  });
}

/**
 * Example 7: Real-World Agent Configuration
 */
function example7_realWorldConfig() {
  console.log('\n=== Example 7: Real-World Agent Configurations ===\n');

  // Test Generator - Balanced performance
  console.log('Test Generator Agent:');
  console.log('  Use Case: Generate comprehensive test suites');
  console.log('  Vectors: ~30K (test patterns, code samples)');
  console.log('  Config:');
  console.log('    quantizationType: "scalar" (4x reduction)');
  console.log('    Expected Memory: ~22 MB (vs 88 MB without)');
  console.log('    Accuracy: 98-99%');

  console.log('\nCoverage Analyzer Agent:');
  console.log('  Use Case: Analyze code coverage and identify gaps');
  console.log('  Vectors: ~50K (coverage patterns)');
  console.log('  Config:');
  console.log('    quantizationType: "scalar" (4x reduction)');
  console.log('    Expected Memory: ~37 MB (vs 147 MB without)');
  console.log('    Accuracy: 98-99%');

  console.log('\nFlaky Test Hunter Agent:');
  console.log('  Use Case: Detect and analyze flaky tests');
  console.log('  Vectors: ~100K (execution patterns)');
  console.log('  Config:');
  console.log('    quantizationType: "product" (8-16x reduction)');
  console.log('    Expected Memory: ~18 MB (vs 293 MB without)');
  console.log('    Accuracy: 93-97% (acceptable for pattern matching)');

  console.log('\nSecurity Scanner Agent:');
  console.log('  Use Case: Critical security vulnerability detection');
  console.log('  Vectors: ~15K (vulnerability signatures)');
  console.log('  Config:');
  console.log('    quantizationType: "none" (no reduction)');
  console.log('    Expected Memory: ~44 MB');
  console.log('    Accuracy: 100% (critical requirement)');
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      Vector Quantization Usage Examples                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  example1_getRecommendation();
  example2_calculateMemory();
  example3_compareTypes();
  await example4_configureAgent();
  example5_monitorMetrics();
  example6_scenarioOptimization();
  example7_realWorldConfig();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      Examples Complete!                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}

export {
  example1_getRecommendation,
  example2_calculateMemory,
  example3_compareTypes,
  example4_configureAgent,
  example5_monitorMetrics,
  example6_scenarioOptimization,
  example7_realWorldConfig
};
