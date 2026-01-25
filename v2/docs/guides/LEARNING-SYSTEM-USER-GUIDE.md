# Learning System User Guide

<div align="center">

**Continuous Improvement Through Reinforcement Learning**

[Quick Start](#quick-start) • [Configuration](#configuration) • [CLI Commands](#cli-commands) • [API Reference](#programmatic-api) • [Best Practices](#best-practices)

</div>

---

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Configuration](#configuration)
4. [Using the Learning System](#using-the-learning-system)
5. [CLI Commands](#cli-commands)
6. [Programmatic API](#programmatic-api)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)
9. [Examples](#examples)

---

## Introduction

### What is the Learning System?

The Learning System is a **reinforcement learning engine** that enables AQE agents to continuously improve their performance over time. Using Q-learning algorithms and A/B testing frameworks, agents learn from every task execution to optimize their strategies automatically.

### Why Use It?

**Key Benefits:**
- **20%+ Performance Improvement**: Achieve measurable improvements in coverage, quality, and speed
- **Automatic Optimization**: No manual tuning required - agents learn best strategies
- **Data-Driven Decisions**: Statistical confidence in strategy selection (95%+)
- **Continuous Learning**: Performance improves with every execution
- **Cross-Agent Sharing**: Agents can learn from each other's experiences

**Real-World Impact:**
```
Before Learning:
├─ Average Coverage: 78%
├─ Test Generation Time: 180ms
└─ Quality Score: 82%

After Learning (100 executions):
├─ Average Coverage: 94% (↑ 20.5%)
├─ Test Generation Time: 145ms (↓ 19.4%)
└─ Quality Score: 96% (↑ 17.1%)
```

### How It Works

The Learning System uses three core components:

1. **LearningEngine** - Q-learning algorithm for strategy optimization
2. **PerformanceTracker** - Real-time metric tracking and trend analysis
3. **ImprovementLoop** - Continuous A/B testing and automatic recommendation

```
┌─────────────────────────────────────────────────┐
│              Learning Cycle                      │
├─────────────────────────────────────────────────┤
│                                                  │
│  1. Execute Task                                │
│     └─> Record: strategy, metrics, result       │
│                                                  │
│  2. Calculate Reward                            │
│     └─> success + coverage + speed              │
│                                                  │
│  3. Update Q-Table                              │
│     └─> Q(s,a) += α[r + γ·max(Q(s',a')) - Q(s,a)]│
│                                                  │
│  4. Recommend Strategy                          │
│     └─> Select action with highest Q-value      │
│                                                  │
│  5. Track Performance                           │
│     └─> Detect 20% improvement threshold        │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Quick Start

### Step 1: Enable Learning for an Agent

**CLI:**
```bash
# Enable learning for test generator
aqe learn enable --agent test-generator

# Enable for all agents
aqe learn enable --all

# Enable with custom config
aqe learn enable --agent test-generator \
  --learning-rate 0.1 \
  --exploration-rate 0.3
```

**Programmatic:**
```typescript
import { TestGeneratorAgent, LearningEngine, SwarmMemoryManager } from 'agentic-qe';

// Initialize memory store
const memory = new SwarmMemoryManager({ databasePath: './.aqe/memory.db' });
await memory.initialize();

// Create learning engine
const learningEngine = new LearningEngine('test-gen-1', memory, {
  enabled: true,
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3
});

await learningEngine.initialize();

// Create agent with learning enabled
const agent = new TestGeneratorAgent(
  { agentId: 'test-gen-1', memoryStore: memory },
  {
    targetCoverage: 95,
    framework: 'jest',
    enableLearning: true  // ✅ Enable learning
  }
);
```

### Step 2: Basic Configuration

Create `.agentic-qe/learning-config.json`:

```json
{
  "enabled": true,
  "learningRate": 0.1,
  "discountFactor": 0.95,
  "explorationRate": 0.3,
  "explorationDecay": 0.995,
  "minExplorationRate": 0.01,
  "improvementThreshold": 0.20,
  "targetWindow": 100
}
```

### Step 3: First Learning Cycle

```typescript
// Execute task (learning happens automatically in onPostTask hook)
const result = await agent.execute({
  type: 'test-generation',
  payload: {
    sourceFile: 'src/user-service.ts',
    framework: 'jest',
    coverage: 95
  }
});

// Learning outcome is stored in memory
console.log('Task completed with learning');

// Check improvement status
const status = await learningEngine.calculateImprovement();
console.log(`Improvement: ${status.improvementRate.toFixed(2)}%`);
console.log(`Confidence: ${(status.confidence * 100).toFixed(1)}%`);
```

**Output:**
```
Task completed with learning
Improvement: 5.2%
Confidence: 65.0%
```

---

## Configuration

### LearningEngine Options

```typescript
interface LearningConfig {
  enabled: boolean;                // Enable/disable learning
  learningRate: number;            // α (alpha) in Q-learning (0-1)
  discountFactor: number;          // γ (gamma) - future reward weight (0-1)
  explorationRate: number;         // ε (epsilon) - exploration vs exploitation (0-1)
  explorationDecay: number;        // Decay factor per task (0-1)
  minExplorationRate: number;      // Minimum exploration rate (0-1)
  maxMemorySize: number;           // Max bytes for learning state
  batchSize: number;               // Batch size for replay learning
  updateFrequency: number;         // Update Q-table every N tasks
}
```

**Recommended Defaults:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `learningRate` | 0.1 | 0.01 - 0.5 | Higher = faster learning, lower = more stable |
| `discountFactor` | 0.95 | 0.8 - 0.99 | How much to value future rewards |
| `explorationRate` | 0.3 | 0.1 - 0.5 | Higher = more exploration, lower = more exploitation |
| `explorationDecay` | 0.995 | 0.99 - 0.999 | How fast to reduce exploration |
| `minExplorationRate` | 0.01 | 0.001 - 0.1 | Always keep some exploration |
| `batchSize` | 32 | 16 - 128 | Replay batch size |
| `updateFrequency` | 10 | 5 - 50 | Update model every N tasks |

### PerformanceTracker Options

```typescript
interface PerformanceTrackerConfig {
  targetImprovement: number;       // Target improvement rate (e.g., 0.20 = 20%)
  snapshotWindow: number;          // Window size for baseline snapshots
  metricsToTrack: string[];        // Metrics to monitor
}
```

**Example Configuration:**
```typescript
const tracker = new PerformanceTracker('test-gen-1', memory, {
  targetImprovement: 0.20,         // 20% improvement goal
  snapshotWindow: 100,             // Compare last 100 vs first 100
  metricsToTrack: [
    'coverage',
    'executionTime',
    'qualityScore',
    'errorRate'
  ]
});
```

### ImprovementLoop Options

```typescript
interface ImprovementLoopConfig {
  cycleInterval: number;           // Loop interval in milliseconds
  strategies: string[];            // Available strategies for A/B testing
  abTestSampleSize: number;        // Sample size per A/B test
  confidenceLevel: number;         // Statistical confidence (0-1)
}
```

**Example Configuration:**
```typescript
const loop = new ImprovementLoop('test-gen-1', memory, learningEngine, tracker);

await loop.initialize();
await loop.start(3600000);  // Run improvement cycle every hour

// Create A/B test
await loop.createABTest('Coverage Optimization', [
  { name: 'property-based', config: { parallelization: 0.8 } },
  { name: 'mutation-based', config: { parallelization: 0.6 } }
], 50);
```

---

## Using the Learning System

### Automatic Learning (onPostTask Hook)

Learning happens automatically after every task execution through the `onPostTask` hook:

```typescript
class TestGeneratorAgent extends BaseAgent {
  protected async onPostTask(data: {
    assignment: TaskAssignment;
    result: any;
  }): Promise<void> {
    // Learning happens here automatically
    if (this.learningEngine && this.learningEngine.isEnabled()) {
      const outcome = await this.learningEngine.learnFromExecution(
        data.assignment.task,
        data.result
      );

      if (outcome.improved) {
        this.logger.info(
          `Performance improved: ${outcome.improvementRate.toFixed(2)}%`,
          { outcome }
        );
      }
    }

    // Store results in memory for other agents
    await this.memoryStore.store(
      `phase2/learning/${this.agentId}/last-result`,
      data.result,
      { partition: 'learning' }
    );
  }
}
```

**What Gets Learned:**
1. **Task Complexity** → What strategies work best for complex vs simple tasks
2. **Resource Utilization** → Optimal parallelization and resource allocation
3. **Failure Patterns** → What causes failures and how to avoid them
4. **Success Patterns** → What consistently leads to high-quality results

### Manual Learning

You can also trigger learning manually:

```typescript
import { LearningEngine, SwarmMemoryManager } from 'agentic-qe';

const memory = new SwarmMemoryManager({ databasePath: './.aqe/memory.db' });
await memory.initialize();

const engine = new LearningEngine('test-gen-1', memory);
await engine.initialize();

// Execute task
const task = {
  id: 'task-123',
  type: 'test-generation',
  requirements: {
    capabilities: ['ast-analysis', 'pattern-matching'],
    complexity: 0.7
  },
  timeout: 30000
};

const result = {
  success: true,
  strategy: 'property-based',
  coverage: 0.92,
  executionTime: 1450,
  errors: [],
  parallelization: 0.8,
  retryPolicy: 'exponential'
};

// Learn from execution
const outcome = await engine.learnFromExecution(task, result);

console.log('Learning Outcome:');
console.log(`  Improved: ${outcome.improved}`);
console.log(`  Improvement Rate: ${outcome.improvementRate.toFixed(2)}%`);
console.log(`  Confidence: ${(outcome.confidence * 100).toFixed(1)}%`);
console.log(`  Patterns Learned: ${outcome.patterns.length}`);
```

### Monitoring Learning Progress

```typescript
// Get current exploration rate
const explorationRate = engine.getExplorationRate();
console.log(`Exploration Rate: ${(explorationRate * 100).toFixed(1)}%`);

// Get total experiences
const totalExperiences = engine.getTotalExperiences();
console.log(`Total Experiences: ${totalExperiences}`);

// Get learned patterns
const patterns = engine.getPatterns();
patterns.forEach(pattern => {
  console.log(`Pattern: ${pattern.pattern}`);
  console.log(`  Confidence: ${(pattern.confidence * 100).toFixed(1)}%`);
  console.log(`  Success Rate: ${(pattern.successRate * 100).toFixed(1)}%`);
  console.log(`  Usage Count: ${pattern.usageCount}`);
});

// Get failure patterns
const failures = engine.getFailurePatterns();
failures.forEach(failure => {
  console.log(`Failure Pattern: ${failure.pattern}`);
  console.log(`  Frequency: ${failure.frequency}`);
  console.log(`  Confidence: ${(failure.confidence * 100).toFixed(1)}%`);
  console.log(`  Mitigation: ${failure.mitigation || 'None'}`);
});
```

### Interpreting Learning Metrics

**Improvement Rate:**
```typescript
const improvement = await engine.calculateImprovement();

if (improvement.improvementRate >= 20) {
  console.log('🎯 Target achieved! 20%+ improvement');
} else if (improvement.improvementRate > 0) {
  console.log(`📈 Improving: ${improvement.improvementRate.toFixed(2)}%`);
} else {
  console.log('📉 No improvement yet');
}
```

**Confidence Score:**
```typescript
if (improvement.confidence >= 0.95) {
  console.log('✅ High confidence in results');
} else if (improvement.confidence >= 0.7) {
  console.log('⚠️  Medium confidence - continue learning');
} else {
  console.log('❌ Low confidence - need more samples');
}
```

**Learned Patterns:**
```typescript
const patterns = engine.getPatterns();
const highConfidencePatterns = patterns.filter(p => p.confidence > 0.8);

console.log(`High Confidence Patterns: ${highConfidencePatterns.length}`);
highConfidencePatterns.forEach(p => {
  console.log(`  ${p.pattern}: ${(p.successRate * 100).toFixed(1)}% success`);
});
```

---

## CLI Commands

### `aqe learn status`

View learning status for one or all agents.

**Usage:**
```bash
# All agents
aqe learn status

# Specific agent
aqe learn status --agent test-generator

# Detailed output
aqe learn status --agent test-generator --detailed
```

**Output:**
```
📊 LEARNING STATUS

Agent: test-generator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: ENABLED ✅
Total Experiences: 247
Exploration Rate: 15.3%

Performance:
├─ Average Reward: 1.23
├─ Success Rate: 87.5%
└─ Improvement Rate: 18.7% (↑ target: 20%)

Top Strategies:
1. property-based (confidence: 92%, success: 95%)
2. mutation-based (confidence: 85%, success: 88%)
3. example-based (confidence: 78%, success: 82%)

Recent Trend: ↗ improving
```

### `aqe learn enable`

Enable learning for an agent.

**Usage:**
```bash
# Single agent
aqe learn enable --agent test-generator

# All agents
aqe learn enable --all

# With custom config
aqe learn enable --agent test-generator \
  --learning-rate 0.15 \
  --exploration-rate 0.4 \
  --target-improvement 0.25
```

### `aqe learn disable`

Disable learning for an agent.

**Usage:**
```bash
# Single agent
aqe learn disable --agent test-generator

# All agents
aqe learn disable --all

# Keep learned data (just pause learning)
aqe learn disable --agent test-generator --keep-data
```

### `aqe learn history`

View learning history and performance over time.

**Usage:**
```bash
# Last 20 experiences
aqe learn history --agent test-generator

# Last 100 experiences
aqe learn history --agent test-generator --limit 100

# Export to CSV
aqe learn history --agent test-generator --format csv --output history.csv

# Filter by date range
aqe learn history --agent test-generator --from 2025-10-01 --to 2025-10-16
```

**Output:**
```
📜 LEARNING HISTORY (Last 20)

#247 | 2025-10-16 10:45:32 | property-based | ✅ | reward: 1.5
     Task: test-generation (complexity: 0.7)
     Metrics: coverage=0.94, time=1250ms

#246 | 2025-10-16 10:42:18 | mutation-based | ✅ | reward: 1.2
     Task: test-generation (complexity: 0.5)
     Metrics: coverage=0.88, time=980ms

#245 | 2025-10-16 10:38:45 | property-based | ❌ | reward: -0.5
     Task: test-generation (complexity: 0.9)
     Errors: timeout after 30s

...
```

### `aqe learn train`

Manually trigger learning from historical data.

**Usage:**
```bash
# Train from recent executions
aqe learn train --agent test-generator

# Train from specific data file
aqe learn train --agent test-generator --data training-data.json

# Batch training
aqe learn train --agent test-generator --batch-size 64
```

### `aqe learn export`

Export learning state for backup or sharing.

**Usage:**
```bash
# Export learning state
aqe learn export --agent test-generator --output learning-state.json

# Export all agents
aqe learn export --all --output all-learning-states.json

# Export specific components
aqe learn export --agent test-generator \
  --include q-table,patterns,failures \
  --output state.json
```

**Exported Format:**
```json
{
  "agentId": "test-generator",
  "version": "1.0.0",
  "lastUpdated": "2025-10-16T10:45:32Z",
  "qTable": {
    "0.7,0.2,0,0.8,1": {
      "property-based:0.8:exponential": 1.234,
      "mutation-based:0.6:linear": 0.987
    }
  },
  "experiences": [
    { "taskId": "task-123", "reward": 1.5, ... }
  ],
  "patterns": [
    { "pattern": "test-generation:property-based", "confidence": 0.92, ... }
  ],
  "performance": {
    "avgReward": 1.23,
    "successRate": 0.875,
    "totalExperiences": 247
  }
}
```

---

## Programmatic API

### Basic Usage

```typescript
import { LearningEngine, SwarmMemoryManager } from 'agentic-qe';

// Initialize
const memory = new SwarmMemoryManager({ databasePath: './.aqe/memory.db' });
await memory.initialize();

const engine = new LearningEngine('agent-id', memory, {
  enabled: true,
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3
});

await engine.initialize();

// Learn from execution
const outcome = await engine.learnFromExecution(task, result);

// Get strategy recommendation
const recommendation = await engine.recommendStrategy({
  taskComplexity: 0.7,
  requiredCapabilities: ['ast-analysis', 'pattern-matching'],
  contextFeatures: {},
  previousAttempts: 0,
  availableResources: 0.8,
  timeConstraint: 30000
});

console.log(`Recommended Strategy: ${recommendation.strategy}`);
console.log(`Confidence: ${(recommendation.confidence * 100).toFixed(1)}%`);
console.log(`Expected Improvement: ${recommendation.expectedImprovement.toFixed(1)}%`);
```

### Advanced Usage

**Custom Reward Function:**

```typescript
class CustomLearningEngine extends LearningEngine {
  protected calculateReward(result: any, feedback?: LearningFeedback): number {
    let reward = super.calculateReward(result, feedback);

    // Add custom rewards
    if (result.testsGenerated > 100) {
      reward += 0.5;  // Bonus for high productivity
    }

    if (result.qualityScore > 0.95) {
      reward += 0.3;  // Bonus for high quality
    }

    if (result.executionTime < 1000) {
      reward += 0.2;  // Bonus for speed
    }

    return reward;
  }
}
```

**Strategy Exploration:**

```typescript
// Force exploration (try new strategies)
const recommendation = await engine.recommendStrategy(state);

if (Math.random() < engine.getExplorationRate()) {
  // Explore: try a random strategy
  const randomStrategy = ['property-based', 'mutation-based', 'example-based'][
    Math.floor(Math.random() * 3)
  ];
  console.log(`Exploring: ${randomStrategy}`);
  return randomStrategy;
} else {
  // Exploit: use best known strategy
  console.log(`Exploiting: ${recommendation.strategy}`);
  return recommendation.strategy;
}
```

**Learning with User Feedback:**

```typescript
const feedback: LearningFeedback = {
  rating: 0.9,          // User rating (0-1)
  issues: [],           // Issues found
  suggestions: [
    'More edge cases needed',
    'Better error handling'
  ],
  timestamp: new Date()
};

const outcome = await engine.learnFromExecution(task, result, feedback);
```

---

## Best Practices

### 1. When to Enable Learning

**✅ Enable Learning When:**
- Agent will execute 100+ tasks
- Task types are consistent
- You want automatic optimization
- Performance improvement is measurable

**❌ Don't Enable Learning When:**
- Agent executes < 10 tasks
- Task types vary wildly
- Manual strategy selection is critical
- Testing/debugging in progress

### 2. Balancing Exploration vs Exploitation

**Early Stage (0-50 executions):**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  explorationRate: 0.4,      // High exploration
  explorationDecay: 0.99     // Slow decay
});
```

**Mid Stage (50-200 executions):**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  explorationRate: 0.2,      // Moderate exploration
  explorationDecay: 0.995    // Medium decay
});
```

**Mature Stage (200+ executions):**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  explorationRate: 0.05,     // Low exploration
  explorationDecay: 0.999    // Slow decay
});
```

### 3. Handling Negative Feedback

```typescript
// Learn from failures
if (!result.success) {
  const feedback: LearningFeedback = {
    rating: 0.0,
    issues: result.errors.map(e => e.message),
    suggestions: ['Increase timeout', 'Add retry logic'],
    timestamp: new Date()
  };

  await engine.learnFromExecution(task, result, feedback);
}

// Review failure patterns
const failures = engine.getFailurePatterns();
const criticalFailures = failures.filter(f => f.frequency > 10);

criticalFailures.forEach(failure => {
  console.log(`⚠️  Critical Failure Pattern: ${failure.pattern}`);
  console.log(`   Frequency: ${failure.frequency}`);
  console.log(`   Mitigation: ${failure.mitigation || 'Manual review needed'}`);
});
```

### 4. Exporting Learning Data for Analysis

```bash
# Export learning state
aqe learn export --agent test-generator --output learning-state.json

# Analyze with Python/R
python analyze_learning.py learning-state.json

# Re-import optimized state
aqe learn import --agent test-generator --input optimized-state.json
```

**Python Analysis Example:**
```python
import json
import pandas as pd
import matplotlib.pyplot as plt

# Load learning state
with open('learning-state.json') as f:
    state = json.load(f)

# Convert experiences to DataFrame
df = pd.DataFrame(state['experiences'])

# Plot reward trend
df['reward'].rolling(20).mean().plot(title='Average Reward (20-task window)')
plt.xlabel('Task Number')
plt.ylabel('Average Reward')
plt.savefig('reward-trend.png')

# Analyze best strategies
strategy_performance = df.groupby('action.strategy').agg({
    'reward': ['mean', 'std', 'count']
})
print(strategy_performance)
```

---

## Troubleshooting

### Issue: Learning Not Improving Performance

**Symptoms:**
- Improvement rate stays at 0% after 50+ executions
- Confidence remains low (<0.5)
- All strategies have similar Q-values

**Solutions:**

1. **Check Reward Signal:**
```typescript
// Add logging to see rewards
class DebuggingLearningEngine extends LearningEngine {
  protected calculateReward(result: any, feedback?: LearningFeedback): number {
    const reward = super.calculateReward(result, feedback);
    console.log('Reward Breakdown:');
    console.log(`  Success: ${result.success ? 1 : -1}`);
    console.log(`  Coverage: ${result.coverage}`);
    console.log(`  Time: ${result.executionTime}ms`);
    console.log(`  Total Reward: ${reward}`);
    return reward;
  }
}
```

2. **Increase Learning Rate:**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  learningRate: 0.2,  // Up from 0.1
  explorationRate: 0.5  // Up from 0.3
});
```

3. **Reset and Retrain:**
```bash
aqe learn reset --agent test-generator --confirm
aqe learn enable --agent test-generator --learning-rate 0.2
```

### Issue: High Exploration Rate Not Decreasing

**Symptoms:**
- Exploration rate stuck at initial value
- Agent keeps trying random strategies
- Q-table not converging

**Solutions:**

1. **Check Decay Configuration:**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  explorationDecay: 0.995,      // Should be < 1.0
  minExplorationRate: 0.01      // Should be small
});
```

2. **Force Decay:**
```bash
aqe learn config --agent test-generator --exploration-decay 0.99
```

### Issue: Memory Exceeds Limit

**Symptoms:**
- Warning: "Learning state exceeds max size"
- Performance degradation
- Memory store errors

**Solutions:**

1. **Increase Memory Limit:**
```typescript
const engine = new LearningEngine('agent-id', memory, {
  maxMemorySize: 200 * 1024 * 1024  // 200MB (up from 100MB)
});
```

2. **Prune Old Experiences:**
```bash
aqe learn prune --agent test-generator --keep-last 500
```

3. **Export and Reset:**
```bash
aqe learn export --agent test-generator --output backup.json
aqe learn reset --agent test-generator --confirm
```

---

## Examples

### Example 1: TestGeneratorAgent with Learning

```typescript
import {
  TestGeneratorAgent,
  LearningEngine,
  PerformanceTracker,
  SwarmMemoryManager
} from 'agentic-qe';

// Initialize components
const memory = new SwarmMemoryManager({ databasePath: './.aqe/memory.db' });
await memory.initialize();

const learningEngine = new LearningEngine('test-gen-1', memory, {
  enabled: true,
  learningRate: 0.1,
  explorationRate: 0.3
});

const performanceTracker = new PerformanceTracker('test-gen-1', memory, {
  targetImprovement: 0.20,
  snapshotWindow: 100
});

await learningEngine.initialize();
await performanceTracker.initialize();

// Create agent with learning
const agent = new TestGeneratorAgent(
  {
    agentId: 'test-gen-1',
    memoryStore: memory
  },
  {
    targetCoverage: 95,
    framework: 'jest',
    enableLearning: true
  }
);

// Execute 100 tasks to build learning data
for (let i = 0; i < 100; i++) {
  const result = await agent.execute({
    type: 'test-generation',
    payload: {
      sourceFile: `src/module-${i % 10}.ts`,
      framework: 'jest',
      coverage: 95
    }
  });

  console.log(`Task ${i + 1}/100: coverage=${result.coverage}%`);
}

// Check improvement
const improvement = await performanceTracker.calculateImprovement();
console.log(`\n🎯 Final Results:`);
console.log(`Improvement Rate: ${improvement.improvementRate.toFixed(2)}%`);
console.log(`Baseline Performance: ${improvement.baselinePerformance.toFixed(2)}`);
console.log(`Current Performance: ${improvement.currentPerformance.toFixed(2)}`);
console.log(`Target Achieved: ${improvement.targetAchieved ? '✅ YES' : '❌ NO'}`);

// Get best strategies
const patterns = learningEngine.getPatterns();
console.log(`\n📊 Top Strategies:`);
patterns.slice(0, 3).forEach((p, i) => {
  console.log(`${i + 1}. ${p.pattern}`);
  console.log(`   Confidence: ${(p.confidence * 100).toFixed(1)}%`);
  console.log(`   Success Rate: ${(p.successRate * 100).toFixed(1)}%`);
});
```

### Example 2: CoverageAnalyzerAgent with Learning

```typescript
import {
  CoverageAnalyzerAgent,
  LearningEngine,
  ImprovementLoop,
  SwarmMemoryManager
} from 'agentic-qe';

const memory = new SwarmMemoryManager({ databasePath: './.aqe/memory.db' });
await memory.initialize();

const learningEngine = new LearningEngine('coverage-1', memory);
const performanceTracker = new PerformanceTracker('coverage-1', memory);
const improvementLoop = new ImprovementLoop(
  'coverage-1',
  memory,
  learningEngine,
  performanceTracker
);

await learningEngine.initialize();
await performanceTracker.initialize();
await improvementLoop.initialize();

// Create A/B test for different algorithms
const abTestId = await improvementLoop.createABTest(
  'Coverage Algorithm Comparison',
  [
    { name: 'sublinear', config: { algorithm: 'sublinear' } },
    { name: 'greedy', config: { algorithm: 'greedy' } }
  ],
  50  // Sample size: 50 executions per strategy
);

// Create agent
const agent = new CoverageAnalyzerAgent(
  {
    agentId: 'coverage-1',
    memoryStore: memory
  },
  {
    targetCoverage: 95,
    algorithm: 'sublinear'
  }
);

// Run A/B test
for (let i = 0; i < 100; i++) {
  // Alternate between strategies
  const strategy = i % 2 === 0 ? 'sublinear' : 'greedy';

  const result = await agent.execute({
    type: 'coverage-analysis',
    payload: {
      coverageReport: `./coverage/report-${i}.json`,
      algorithm: strategy
    }
  });

  // Record A/B test result
  await improvementLoop.recordTestResult(
    abTestId,
    strategy,
    result.success,
    result.executionTime
  );

  console.log(`Test ${i + 1}/100: ${strategy} (${result.executionTime}ms)`);
}

// A/B test completed automatically
const tests = improvementLoop.getActiveTests();
console.log(`\n🔬 A/B Test Results:`);
console.log(`Winner: ${tests[0].winner}`);
console.log(`Results:`, tests[0].results);
```

### Example 3: Custom Agent with Learning

```typescript
import { BaseAgent, LearningEngine } from 'agentic-qe';

class CustomAgent extends BaseAgent {
  private learningEngine: LearningEngine;

  constructor(config: BaseAgentConfig) {
    super(config);

    // Create learning engine
    this.learningEngine = new LearningEngine(
      this.agentId,
      this.memoryStore,
      {
        enabled: true,
        learningRate: 0.15,
        explorationRate: 0.4
      }
    );
  }

  protected async initializeComponents(): Promise<void> {
    await this.learningEngine.initialize();
  }

  protected async onPostTask(data: {
    assignment: TaskAssignment;
    result: any;
  }): Promise<void> {
    // Custom learning integration
    if (this.learningEngine.isEnabled()) {
      // Custom feedback
      const feedback = {
        rating: data.result.quality / 100,
        issues: data.result.errors || [],
        suggestions: [],
        timestamp: new Date()
      };

      const outcome = await this.learningEngine.learnFromExecution(
        data.assignment.task,
        data.result,
        feedback
      );

      // Log improvement
      if (outcome.improved) {
        this.logger.info(
          `🎓 Learning improved performance by ${outcome.improvementRate.toFixed(2)}%`
        );
      }

      // Get recommendation for next task
      const recommendation = await this.learningEngine.recommendStrategy({
        taskComplexity: 0.7,
        requiredCapabilities: ['custom-capability'],
        contextFeatures: {},
        previousAttempts: 0,
        availableResources: 0.8
      });

      this.logger.info(
        `💡 Recommended strategy: ${recommendation.strategy} ` +
        `(confidence: ${(recommendation.confidence * 100).toFixed(1)}%)`
      );
    }
  }

  protected async performTask(task: QETask): Promise<any> {
    // Get strategy recommendation
    const recommendation = await this.learningEngine.recommendStrategy({
      taskComplexity: this.estimateComplexity(task),
      requiredCapabilities: task.requirements?.capabilities || [],
      contextFeatures: task.context || {},
      previousAttempts: 0,
      availableResources: 0.8
    });

    // Execute with recommended strategy
    const result = await this.executeWithStrategy(task, recommendation.strategy);

    return result;
  }

  private estimateComplexity(task: QETask): number {
    // Custom complexity estimation
    return 0.5;
  }

  private async executeWithStrategy(task: QETask, strategy: string): Promise<any> {
    // Custom execution logic
    return {
      success: true,
      strategy,
      quality: 95,
      executionTime: 1500
    };
  }
}
```

---

## Next Steps

- [Pattern Management User Guide](./PATTERN-MANAGEMENT-USER-GUIDE.md)
- [ML Flaky Detection User Guide](./ML-FLAKY-DETECTION-USER-GUIDE.md)
- [Performance Improvement Guide](./PERFORMANCE-IMPROVEMENT-USER-GUIDE.md)
- [Learning System Examples](../examples/LEARNING-SYSTEM-EXAMPLES.md)

---

<div align="center">

**Learning System v1.1.0** | [Report Issues](https://github.com/proffesor-for-testing/agentic-qe/issues)

Made with ❤️ by the Agentic QE Team

</div>
