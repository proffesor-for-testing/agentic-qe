# Learning System - Practical Examples

Complete examples for enabling continuous improvement through A/B testing, performance tracking, and automatic strategy optimization.

## Table of Contents

- [Quick Start](#quick-start)
- [A/B Testing](#ab-testing)
- [Performance Tracking](#performance-tracking)
- [Improvement Loops](#improvement-loops)
- [Strategy Selection](#strategy-selection)
- [Advanced Scenarios](#advanced-scenarios)

---

## Quick Start

### Enable Learning for an Agent

```typescript
import { LearningEngine, SwarmMemoryManager } from 'agentic-qe';

// Initialize memory and learning engine
const memory = SwarmMemoryManager.getInstance();
const engine = new LearningEngine({
  memoryStore: memory,
  minSampleSize: 10,
  confidenceLevel: 0.95
});

await engine.initialize();

// Enable learning for test-generator agent
await engine.enableLearning('test-generator', {
  strategies: [
    'property-based',
    'example-based',
    'mutation-based'
  ],
  metrics: ['coverage', 'quality', 'speed'],
  improvementThreshold: 0.05  // 5% improvement to accept new strategy
});

console.log('✅ Learning enabled for test-generator');
```

### CLI Usage

```bash
# Enable learning
aqe learning enable --agent test-generator

# Check learning status
aqe learning status --agent test-generator

# Run A/B test
aqe learning ab-test --agent test-generator --strategy-a property --strategy-b mutation
```

---

## A/B Testing

### Example 1: Basic A/B Test

Compare two test generation strategies:

```typescript
import { LearningEngine } from 'agentic-qe';

const engine = new LearningEngine({
  memoryStore: memory,
  minSampleSize: 10,
  confidenceLevel: 0.95
});

await engine.initialize();

// Run A/B test: Property-based vs Mutation-based
const result = await engine.runABTest('test-generator', {
  strategyA: 'property-based',
  strategyB: 'mutation-based',
  metric: 'coverage',
  sampleSize: 20
});

console.log(`\n🔬 A/B Test Results\n`);
console.log(`Strategy A (property-based):`);
console.log(`  Coverage: ${(result.strategyA.mean * 100).toFixed(1)}%`);
console.log(`  StdDev: ${(result.strategyA.stdDev * 100).toFixed(1)}%`);
console.log(`  Samples: ${result.strategyA.samples}`);

console.log(`\nStrategy B (mutation-based):`);
console.log(`  Coverage: ${(result.strategyB.mean * 100).toFixed(1)}%`);
console.log(`  StdDev: ${(result.strategyB.stdDev * 100).toFixed(1)}%`);
console.log(`  Samples: ${result.strategyB.samples}`);

console.log(`\n📊 Conclusion:`);
console.log(`  Winner: ${result.winner}`);
console.log(`  Improvement: ${(result.improvement * 100).toFixed(1)}%`);
console.log(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`);
console.log(`  P-value: ${result.pValue.toFixed(4)}`);
console.log(`  Statistically Significant: ${result.significant ? 'Yes ✅' : 'No ❌'}`);
```

**Expected Output**:
```
🔬 A/B Test Results

Strategy A (property-based):
  Coverage: 87.5%
  StdDev: 3.2%
  Samples: 20

Strategy B (mutation-based):
  Coverage: 82.1%
  StdDev: 4.1%
  Samples: 20

📊 Conclusion:
  Winner: property-based
  Improvement: 5.4%
  Confidence: 98.7%
  P-value: 0.0023
  Statistically Significant: Yes ✅
```

### Example 2: Multi-Metric A/B Test

Compare strategies across multiple metrics:

```typescript
// Test across coverage, quality, and speed
const metrics = ['coverage', 'quality', 'speed'];
const results = [];

for (const metric of metrics) {
  const result = await engine.runABTest('test-generator', {
    strategyA: 'property-based',
    strategyB: 'mutation-based',
    metric: metric,
    sampleSize: 15
  });

  results.push({
    metric,
    winner: result.winner,
    improvement: result.improvement,
    confidence: result.confidence
  });
}

console.log('\n📊 Multi-Metric A/B Test Results\n');

results.forEach(r => {
  console.log(`${r.metric}:`);
  console.log(`  Winner: ${r.winner}`);
  console.log(`  Improvement: ${(r.improvement * 100).toFixed(1)}%`);
  console.log(`  Confidence: ${(r.confidence * 100).toFixed(1)}%`);
  console.log();
});

// Overall best strategy
const overallWinner = results.reduce((acc, r) => {
  acc[r.winner] = (acc[r.winner] || 0) + 1;
  return acc;
}, {});

const bestStrategy = Object.entries(overallWinner)
  .sort((a, b) => b[1] - a[1])[0][0];

console.log(`🏆 Overall Best Strategy: ${bestStrategy}`);
```

### Example 3: Sequential A/B Testing

Test multiple strategies sequentially:

```typescript
const strategies = [
  'property-based',
  'example-based',
  'mutation-based',
  'hybrid'
];

// Test each strategy against the current best
let currentBest = strategies[0];
let currentBestScore = 0;

for (let i = 1; i < strategies.length; i++) {
  console.log(`\n🔬 Testing ${currentBest} vs ${strategies[i]}`);

  const result = await engine.runABTest('test-generator', {
    strategyA: currentBest,
    strategyB: strategies[i],
    metric: 'coverage',
    sampleSize: 15
  });

  if (result.winner === strategies[i] && result.significant) {
    console.log(`✅ ${strategies[i]} is better! (${(result.improvement * 100).toFixed(1)}% improvement)`);
    currentBest = strategies[i];
    currentBestScore = result.strategyB.mean;
  } else {
    console.log(`❌ ${currentBest} remains the best`);
  }
}

console.log(`\n🏆 Final Best Strategy: ${currentBest}`);
console.log(`   Coverage: ${(currentBestScore * 100).toFixed(1)}%`);
```

---

## Performance Tracking

### Example 1: Track Agent Performance Over Time

```typescript
import { PerformanceTracker, LearningEngine } from 'agentic-qe';

const tracker = new PerformanceTracker({
  memoryStore: memory,
  trackingWindow: 7 * 24 * 60 * 60 * 1000  // 7 days
});

await tracker.initialize();

// Record performance data
await tracker.recordPerformance('test-generator', {
  strategy: 'property-based',
  coverage: 0.89,
  quality: 0.92,
  speed: 145,  // milliseconds
  timestamp: Date.now()
});

// Get performance over time
const performance = await engine.getAgentPerformance('test-generator', {
  timeRange: '7d',
  metrics: ['coverage', 'quality', 'speed']
});

console.log(`\n📈 Agent Performance (Last 7 Days)\n`);

Object.keys(performance.metrics).forEach(metric => {
  const stats = performance.metrics[metric];
  const trend = performance.trends[metric];

  console.log(`${metric}:`);
  console.log(`  Mean: ${(stats.mean * 100).toFixed(1)}%`);
  console.log(`  Min: ${(stats.min * 100).toFixed(1)}%`);
  console.log(`  Max: ${(stats.max * 100).toFixed(1)}%`);
  console.log(`  StdDev: ${(stats.stdDev * 100).toFixed(1)}%`);
  console.log(`  Trend: ${trend} ${trend === 'rising' ? '📈' : trend === 'declining' ? '📉' : '➡️'}`);
  console.log();
});
```

**Expected Output**:
```
📈 Agent Performance (Last 7 Days)

coverage:
  Mean: 87.5%
  Min: 82.1%
  Max: 92.3%
  StdDev: 2.8%
  Trend: rising 📈

quality:
  Mean: 91.2%
  Min: 87.5%
  Max: 95.1%
  StdDev: 2.1%
  Trend: rising 📈

speed:
  Mean: 145ms
  Min: 120ms
  Max: 180ms
  StdDev: 15ms
  Trend: stable ➡️
```

### Example 2: Compare Performance Across Strategies

```typescript
// Get performance for each strategy
const strategies = ['property-based', 'mutation-based', 'example-based'];
const comparison = [];

for (const strategy of strategies) {
  const perf = await tracker.getStrategyPerformance('test-generator', strategy, {
    timeRange: '7d'
  });

  comparison.push({
    strategy,
    coverage: perf.coverage.mean,
    quality: perf.quality.mean,
    speed: perf.speed.mean,
    samples: perf.samples
  });
}

// Sort by coverage
comparison.sort((a, b) => b.coverage - a.coverage);

console.log('\n📊 Strategy Comparison\n');
console.log('Strategy          Coverage  Quality   Speed    Samples');
console.log('─'.repeat(60));

comparison.forEach(s => {
  console.log(
    `${s.strategy.padEnd(18)} ${(s.coverage * 100).toFixed(1)}%    ` +
    `${(s.quality * 100).toFixed(1)}%    ${s.speed.toFixed(0)}ms    ${s.samples}`
  );
});
```

### Example 3: Performance Alerts

```typescript
// Set up performance monitoring with alerts
const monitor = new PerformanceMonitor({
  thresholds: {
    coverage: { min: 0.80, max: 1.0 },
    quality: { min: 0.85, max: 1.0 },
    speed: { min: 0, max: 200 }
  },
  alertCallback: async (alert) => {
    console.log(`\n⚠️  Performance Alert: ${alert.metric}`);
    console.log(`   Agent: ${alert.agentId}`);
    console.log(`   Current: ${alert.current}`);
    console.log(`   Threshold: ${alert.threshold}`);
    console.log(`   Severity: ${alert.severity}`);

    // Take action
    if (alert.severity === 'critical') {
      // Revert to known good strategy
      await engine.revertToBestStrategy(alert.agentId, alert.metric);
    }
  }
});

await monitor.start();
```

---

## Improvement Loops

### Example 1: Continuous Improvement Loop

Set up automatic improvement based on performance:

```typescript
import { ImprovementLoop, LearningEngine } from 'agentic-qe';

const loop = new ImprovementLoop({
  memoryStore: memory,
  checkInterval: 3600000,  // Check every hour
  minSampleSize: 20,
  improvementThreshold: 0.05  // 5% improvement required
});

await loop.initialize();

// Start improvement loop for test-generator
await loop.startLoop('test-generator', {
  strategies: ['property-based', 'mutation-based', 'example-based'],
  metric: 'coverage',
  onImprovement: async (improvement) => {
    console.log(`\n✨ Improvement Detected!`);
    console.log(`   Strategy: ${improvement.newStrategy}`);
    console.log(`   Improvement: ${(improvement.improvement * 100).toFixed(1)}%`);
    console.log(`   Old: ${(improvement.oldPerformance * 100).toFixed(1)}%`);
    console.log(`   New: ${(improvement.newPerformance * 100).toFixed(1)}%`);
  },
  onStagnation: async (stagnation) => {
    console.log(`\n⚠️  Performance Stagnation Detected`);
    console.log(`   Duration: ${stagnation.duration}ms`);
    console.log(`   Trying new strategies...`);
  }
});

console.log('✅ Improvement loop started');

// Loop runs in background, checking performance every hour
// and automatically switching to better strategies
```

### Example 2: Manual Improvement Cycle

```typescript
// Manual improvement cycle
async function improvementCycle(agentId: string) {
  console.log(`\n🔄 Starting improvement cycle for ${agentId}\n`);

  // 1. Get current performance
  const currentPerf = await engine.getAgentPerformance(agentId, {
    timeRange: '24h'
  });

  console.log(`Current Performance:`);
  console.log(`  Coverage: ${(currentPerf.metrics.coverage.mean * 100).toFixed(1)}%`);
  console.log(`  Trend: ${currentPerf.trends.coverage}`);

  // 2. If declining, try new strategies
  if (currentPerf.trends.coverage === 'declining') {
    console.log(`\n⚠️  Declining performance - testing alternatives`);

    const currentStrategy = await engine.getCurrentStrategy(agentId);
    const alternatives = await engine.getAlternativeStrategies(agentId, currentStrategy);

    for (const alt of alternatives) {
      const result = await engine.runABTest(agentId, {
        strategyA: currentStrategy,
        strategyB: alt,
        metric: 'coverage',
        sampleSize: 15
      });

      if (result.winner === alt && result.significant) {
        console.log(`\n✅ Found better strategy: ${alt}`);
        await engine.switchStrategy(agentId, alt);
        return;
      }
    }
  }

  // 3. If rising, continue current strategy
  else if (currentPerf.trends.coverage === 'rising') {
    console.log(`\n✅ Performance is improving - continuing current strategy`);
  }

  // 4. If stable, explore new options
  else {
    console.log(`\n➡️  Performance is stable - exploring new strategies`);

    const newStrategy = await engine.suggestNewStrategy(agentId, {
      based On: 'exploration',
      diversity: 0.7
    });

    console.log(`   Trying: ${newStrategy}`);
    await engine.testStrategy(agentId, newStrategy, { samples: 10 });
  }
}

// Run improvement cycle every 6 hours
setInterval(() => improvementCycle('test-generator'), 6 * 60 * 60 * 1000);
```

### Example 3: Feedback-Driven Learning

```typescript
// Learn from explicit feedback
async function recordFeedback(agentId: string, feedback: any) {
  await engine.recordFeedback(agentId, {
    strategy: feedback.strategy,
    rating: feedback.rating,  // 1-5
    comments: feedback.comments,
    context: {
      testFile: feedback.testFile,
      coverage: feedback.coverage,
      issues: feedback.issues
    },
    timestamp: Date.now()
  });

  console.log(`✅ Feedback recorded for ${agentId}`);

  // Analyze feedback trends
  const feedbackAnalysis = await engine.analyzeFeedback(agentId, {
    timeRange: '30d'
  });

  console.log(`\n📊 Feedback Analysis (30 days)`);
  console.log(`   Average Rating: ${feedbackAnalysis.avgRating.toFixed(1)}/5`);
  console.log(`   Total Feedback: ${feedbackAnalysis.total}`);
  console.log(`   Positive: ${feedbackAnalysis.positive} (${(feedbackAnalysis.positiveRate * 100).toFixed(1)}%)`);
  console.log(`   Negative: ${feedbackAnalysis.negative} (${(feedbackAnalysis.negativeRate * 100).toFixed(1)}%)`);

  // Adjust strategy based on feedback
  if (feedbackAnalysis.positiveRate < 0.6) {
    console.log(`\n⚠️  Low positive feedback - switching strategy`);
    await engine.switchToHighestRatedStrategy(agentId);
  }
}

// Example usage
await recordFeedback('test-generator', {
  strategy: 'property-based',
  rating: 4,
  comments: 'Good coverage but slow',
  testFile: 'user-service.test.ts',
  coverage: 0.92,
  issues: ['performance']
});
```

---

## Strategy Selection

### Example 1: Automatic Best Strategy Selection

```typescript
// Automatically select best strategy for each metric
const bestStrategies = await engine.selectBestStrategies('test-generator', {
  metrics: ['coverage', 'quality', 'speed'],
  confidenceLevel: 0.95
});

console.log('\n🏆 Best Strategies per Metric\n');

Object.keys(bestStrategies).forEach(metric => {
  const best = bestStrategies[metric];
  console.log(`${metric}:`);
  console.log(`  Strategy: ${best.strategy}`);
  console.log(`  Performance: ${(best.performance * 100).toFixed(1)}%`);
  console.log(`  Confidence: ${(best.confidence * 100).toFixed(1)}%`);
  console.log(`  Samples: ${best.samples}`);
  console.log();
});

// Use composite strategy (best for each metric)
await engine.enableCompositeStrategy('test-generator', {
  coverage: bestStrategies.coverage.strategy,
  quality: bestStrategies.quality.strategy,
  speed: bestStrategies.speed.strategy
});
```

### Example 2: Context-Aware Strategy Selection

```typescript
// Select strategy based on context
async function selectStrategyForContext(context: any) {
  const recommendation = await engine.recommendStrategy('test-generator', {
    fileType: context.fileType,
    complexity: context.complexity,
    priority: context.priority,
    deadline: context.deadline
  });

  console.log(`\n💡 Strategy Recommendation for Context\n`);
  console.log(`File Type: ${context.fileType}`);
  console.log(`Complexity: ${context.complexity}`);
  console.log(`Priority: ${context.priority}`);
  console.log(`\nRecommended Strategy: ${recommendation.strategy}`);
  console.log(`Reason: ${recommendation.reason}`);
  console.log(`Expected Coverage: ${(recommendation.expectedCoverage * 100).toFixed(1)}%`);
  console.log(`Expected Duration: ${recommendation.expectedDuration}ms`);

  return recommendation.strategy;
}

// Usage
const strategy = await selectStrategyForContext({
  fileType: 'service',
  complexity: 'high',
  priority: 'critical',
  deadline: '1h'
});
```

### Example 3: Ensemble Strategy

```typescript
// Use multiple strategies together
const ensembleStrategy = await engine.createEnsembleStrategy('test-generator', {
  strategies: [
    { name: 'property-based', weight: 0.4 },
    { name: 'mutation-based', weight: 0.3 },
    { name: 'example-based', weight: 0.3 }
  ],
  combineMethod: 'weighted-average'
});

// Apply ensemble
const result = await engine.applyStrategy('test-generator', ensembleStrategy, {
  sourceFile: 'user-service.ts'
});

console.log(`\n🎯 Ensemble Strategy Results\n`);
console.log(`Coverage: ${(result.coverage * 100).toFixed(1)}%`);
console.log(`Quality: ${(result.quality * 100).toFixed(1)}%`);
console.log(`Tests Generated: ${result.testsGenerated}`);
console.log(`\nContributions:`);

result.contributions.forEach(c => {
  console.log(`  ${c.strategy}: ${c.testsGenerated} tests (${(c.weight * 100).toFixed(0)}%)`);
});
```

---

## Advanced Scenarios

### Example 1: Multi-Agent Learning Coordination

```typescript
// Coordinate learning across multiple agents
const agents = ['test-generator', 'coverage-analyzer', 'quality-gate'];

// Share learning insights across agents
for (const agent of agents) {
  await engine.enableLearning(agent, {
    strategies: await engine.getSuggestedStrategies(agent),
    metrics: ['coverage', 'quality', 'speed'],
    shareInsights: true  // Share with other agents
  });
}

// Cross-agent learning
const insights = await engine.getCrossAgentInsights(agents);

console.log('\n🔗 Cross-Agent Learning Insights\n');

insights.forEach(insight => {
  console.log(`${insight.type}:`);
  console.log(`  Source: ${insight.sourceAgent}`);
  console.log(`  Applicable To: ${insight.applicableAgents.join(', ')}`);
  console.log(`  Insight: ${insight.description}`);
  console.log(`  Impact: ${insight.estimatedImpact}`);
  console.log();
});
```

### Example 2: Learning Dashboard

```typescript
// Generate learning dashboard
const dashboard = await engine.generateDashboard({
  agents: ['test-generator', 'coverage-analyzer'],
  timeRange: '7d',
  metrics: ['coverage', 'quality', 'speed']
});

console.log('\n📊 Learning Dashboard (Last 7 Days)\n');
console.log('═'.repeat(60));

dashboard.agents.forEach(agent => {
  console.log(`\n${agent.name}:`);
  console.log(`  Current Strategy: ${agent.currentStrategy}`);
  console.log(`  Performance: ${(agent.performance.mean * 100).toFixed(1)}%`);
  console.log(`  Trend: ${agent.trend} ${agent.trend === 'rising' ? '📈' : agent.trend === 'declining' ? '📉' : '➡️'}`);
  console.log(`  A/B Tests: ${agent.abTests.completed}/${agent.abTests.total}`);
  console.log(`  Improvements: ${agent.improvements.count} (+${(agent.improvements.totalGain * 100).toFixed(1)}%)`);
});

console.log('\n' + '═'.repeat(60));
console.log(`\nOverall System Performance:`);
console.log(`  Average Coverage: ${(dashboard.overall.coverage * 100).toFixed(1)}%`);
console.log(`  Average Quality: ${(dashboard.overall.quality * 100).toFixed(1)}%`);
console.log(`  Total Improvements: ${dashboard.overall.improvements}`);
```

### Example 3: Export Learning Report

```typescript
// Generate comprehensive learning report
const report = await engine.generateReport('test-generator', {
  timeRange: '30d',
  includeCharts: true,
  includeRecommendations: true,
  format: 'html'
});

// Save report
await fs.writeFile('learning-report.html', report.html);

console.log('✅ Learning report saved to learning-report.html');

// Also get summary
console.log(`\n📈 30-Day Learning Summary\n`);
console.log(`Total A/B Tests: ${report.summary.abTests}`);
console.log(`Improvements Found: ${report.summary.improvements}`);
console.log(`Average Improvement: ${(report.summary.avgImprovement * 100).toFixed(1)}%`);
console.log(`Best Strategy: ${report.summary.bestStrategy}`);
console.log(`\nRecommendations:`);

report.recommendations.forEach((rec, idx) => {
  console.log(`  ${idx + 1}. ${rec.title}`);
  console.log(`     ${rec.description}`);
  console.log(`     Impact: ${rec.estimatedImpact}`);
});
```

---

## CLI Reference

### Enable/Disable Learning

```bash
# Enable learning
aqe learning enable --agent test-generator

# Disable learning
aqe learning disable --agent test-generator

# List agents with learning enabled
aqe learning list
```

### A/B Testing

```bash
# Run A/B test
aqe learning ab-test --agent test-generator --strategy-a property --strategy-b mutation

# Run multi-metric A/B test
aqe learning ab-test --agent test-generator --strategy-a property --strategy-b mutation --metrics coverage,quality,speed

# View A/B test history
aqe learning ab-test-history --agent test-generator
```

### Performance Tracking

```bash
# View agent performance
aqe learning performance --agent test-generator --time-range 7d

# Compare strategies
aqe learning compare --agent test-generator --strategies property,mutation,example

# Export performance data
aqe learning export --agent test-generator --format csv --output performance.csv
```

### Reports

```bash
# Generate learning report
aqe learning report --agent test-generator --format html --output report.html

# View dashboard
aqe learning dashboard --agents test-generator,coverage-analyzer

# Get insights
aqe learning insights --time-range 30d
```

---

## Best Practices

### 1. A/B Testing

**DO:**
- ✅ Use sufficient sample sizes (min 10-20)
- ✅ Test one variable at a time
- ✅ Wait for statistical significance
- ✅ Document test context and results

**DON'T:**
- ❌ Compare incompatible strategies
- ❌ Change strategies too frequently
- ❌ Ignore confidence levels
- ❌ Test without clear metrics

### 2. Performance Tracking

**DO:**
- ✅ Track multiple metrics
- ✅ Set realistic baselines
- ✅ Monitor trends over time
- ✅ Alert on significant changes

**DON'T:**
- ❌ Optimize for single metric
- ❌ Ignore context (file type, complexity)
- ❌ Compare across different environments
- ❌ Over-react to short-term fluctuations

### 3. Improvement Loops

**DO:**
- ✅ Start with small improvement thresholds (3-5%)
- ✅ Review improvements regularly
- ✅ Balance exploration vs exploitation
- ✅ Keep human in the loop for major changes

**DON'T:**
- ❌ Auto-apply without validation
- ❌ Run too many concurrent experiments
- ❌ Forget to document what worked
- ❌ Disable learning after finding good strategy

---

## Troubleshooting

### Issue: A/B Tests Never Reach Significance

**Solutions**:
```typescript
// Reduce confidence level
const result = await engine.runABTest('agent', {
  strategyA: 'a',
  strategyB: 'b',
  confidenceLevel: 0.90  // Down from 0.95
});

// Increase sample size
const result = await engine.runABTest('agent', {
  strategyA: 'a',
  strategyB: 'b',
  sampleSize: 30  // Up from 20
});

// Try different metrics
const result = await engine.runABTest('agent', {
  strategyA: 'a',
  strategyB: 'b',
  metric: 'quality'  // Instead of coverage
});
```

### Issue: Performance Not Improving

**Solutions**:
```typescript
// Check if learning is enabled
const status = await engine.getLearningStatus('test-generator');
console.log(`Learning enabled: ${status.enabled}`);

// Review strategy pool
const strategies = await engine.getAvailableStrategies('test-generator');
console.log(`Available strategies: ${strategies.join(', ')}`);

// Try manual strategy switch
await engine.switchStrategy('test-generator', 'mutation-based');

// Reset learning data
await engine.resetLearning('test-generator');
```

---

## Next Steps

- [Flaky Detection ML Examples](FLAKY-DETECTION-ML-EXAMPLES.md)
- [Reasoning Bank Examples](REASONING-BANK-EXAMPLES.md)
- [Complete API Reference](../API-REFERENCE-V1.1.md)
- [Phase 2 User Guide](../PHASE2-USER-GUIDE.md)

---

**Learning System Examples** | [Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)
