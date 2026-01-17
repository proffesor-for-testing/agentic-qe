/**
 * Inference Cost Tracking Example
 *
 * Demonstrates how to use InferenceCostTracker to monitor local vs cloud inference costs.
 *
 * Usage:
 * ```bash
 * npx tsx examples/inference-cost-tracking.ts
 * ```
 */

import {
  getInferenceCostTracker,
  formatCostReport,
  formatCostReportJSON,
} from '../src/core/metrics/InferenceCostTracker.js';

// Initialize the cost tracker
const tracker = getInferenceCostTracker({
  ttl: 86400000, // 24 hours
  autoPrune: true,
  baselineProvider: 'anthropic',
  baselineModel: 'claude-sonnet-4-5-20250929',
});

console.log('🎯 Inference Cost Tracking Example\n');
console.log('Simulating inference requests from different providers...\n');

// Simulate local inference requests (free)
console.log('📍 Tracking local inference requests (ruvllm)...');
for (let i = 0; i < 10; i++) {
  tracker.trackRequest({
    provider: 'ruvllm',
    model: 'meta-llama/llama-3.1-8b-instruct',
    tokens: {
      inputTokens: Math.floor(1000 + Math.random() * 2000),
      outputTokens: Math.floor(500 + Math.random() * 1000),
      totalTokens: 0, // Will be calculated
    },
    agentId: `qe-test-gen-${i.toString().padStart(3, '0')}`,
    taskId: `task-${Date.now()}-${i}`,
    metadata: {
      purpose: 'test-generation',
      framework: 'jest',
    },
  });
}
console.log('✅ Tracked 10 local inference requests\n');

// Simulate cloud inference requests (anthropic)
console.log('☁️  Tracking cloud inference requests (anthropic)...');
for (let i = 0; i < 5; i++) {
  tracker.trackRequest({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20250929',
    tokens: {
      inputTokens: Math.floor(2000 + Math.random() * 3000),
      outputTokens: Math.floor(1000 + Math.random() * 1500),
      totalTokens: 0,
      cacheReadTokens: i % 2 === 0 ? Math.floor(500 + Math.random() * 500) : undefined,
    },
    agentId: `qe-quality-gate-${i.toString().padStart(3, '0')}`,
    taskId: `task-${Date.now()}-${i}`,
    metadata: {
      purpose: 'quality-check',
      severity: 'high',
    },
  });
}
console.log('✅ Tracked 5 cloud inference requests\n');

// Simulate OpenRouter requests (cheaper cloud)
console.log('🌐 Tracking OpenRouter requests (cloud - cheaper)...');
for (let i = 0; i < 3; i++) {
  tracker.trackRequest({
    provider: 'openrouter',
    model: 'meta-llama/llama-3.1-70b-instruct',
    tokens: {
      inputTokens: Math.floor(1500 + Math.random() * 2500),
      outputTokens: Math.floor(750 + Math.random() * 1250),
      totalTokens: 0,
    },
    agentId: `qe-coverage-analyzer-${i.toString().padStart(3, '0')}`,
    taskId: `task-${Date.now()}-${i}`,
    metadata: {
      purpose: 'coverage-analysis',
    },
  });
}
console.log('✅ Tracked 3 OpenRouter requests\n');

// Run the async portion
async function displayReport() {
  // Wait a moment to ensure all timestamps are properly set
  await new Promise(resolve => setTimeout(resolve, 100));

console.log('=' .repeat(80));
console.log('📊 COST REPORT - TEXT FORMAT');
console.log('=' .repeat(80));
console.log('');

// Get and display cost report
const report = tracker.getCostReport();
const textReport = formatCostReport(report);
console.log(textReport);

console.log('\n');
console.log('=' .repeat(80));
console.log('📊 COST REPORT - JSON FORMAT');
console.log('=' .repeat(80));
console.log('');

// Display JSON format
const jsonReport = formatCostReportJSON(report);
console.log(jsonReport);

console.log('\n');
console.log('=' .repeat(80));
console.log('💡 KEY INSIGHTS');
console.log('=' .repeat(80));
console.log('');

// Display key insights
console.log(`💰 Total Cost: $${report.totalCost.toFixed(4)}`);
console.log(`💵 Savings: $${report.savings.totalSavings.toFixed(4)} (${report.savings.savingsPercentage.toFixed(1)}%)`);
console.log(`📈 Requests/Hour: ${report.requestsPerHour.toFixed(1)}`);
console.log(`💸 Cost/Hour: $${report.costPerHour.toFixed(4)}`);
console.log('');

console.log('Provider Breakdown:');
for (const [provider, metrics] of report.byProvider.entries()) {
  const icon = metrics.providerType === 'local' ? '🏠' : '☁️';
  console.log(`  ${icon} ${provider}:`);
  console.log(`     Requests: ${metrics.requestCount}`);
  console.log(`     Total Cost: $${metrics.totalCost.toFixed(4)}`);
  console.log(`     Avg Cost/Request: $${metrics.avgCostPerRequest.toFixed(6)}`);
  console.log('');
}

console.log('=' .repeat(80));
console.log('🎯 RECOMMENDATIONS');
console.log('=' .repeat(80));
console.log('');

if (report.savings.savingsPercentage > 70) {
  console.log('✅ Excellent! You are saving over 70% by using local inference.');
  console.log('   Continue routing routine tasks to local models.');
} else if (report.savings.savingsPercentage > 50) {
  console.log('👍 Good! You are saving over 50% with local inference.');
  console.log('💡 Consider migrating more workloads to local models to increase savings.');
} else if (report.savings.savingsPercentage > 30) {
  console.log('⚠️  Moderate savings. Consider increasing local inference usage.');
  console.log('💡 Identify tasks that can run on local models without quality loss.');
} else {
  console.log('❌ Low savings from local inference.');
  console.log('💡 Evaluate which tasks can be migrated to local models.');
  console.log('   Focus on: test generation, coverage analysis, simple validations.');
}

console.log('');
console.log('💡 Estimated Monthly Savings: $' + (report.savings.totalSavings * 30).toFixed(2));
console.log('💡 Estimated Annual Savings: $' + (report.savings.totalSavings * 365).toFixed(2));

console.log('');
console.log('=' .repeat(80));
console.log('✅ Example Complete!');
console.log('=' .repeat(80));

  // Cleanup
  tracker.destroy();
}

// Execute the async function
displayReport().catch(console.error);
