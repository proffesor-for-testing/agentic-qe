# Agent Learning System - Phase 2 (Milestone 2.2)

## Overview

The Agent Learning System implements reinforcement learning for continuous performance improvement of AQE agents. It uses Q-learning algorithms to optimize task execution strategies and achieve a target of **20% performance improvement over 30 days**.

## Architecture

### Components

1. **LearningEngine** - Core reinforcement learning implementation
   - Q-learning algorithm for strategy optimization
   - Experience replay and batch updates
   - Pattern recognition and failure detection
   - Automatic exploration/exploitation balancing

2. **PerformanceTracker** - Performance metrics tracking
   - Real-time performance monitoring
   - Baseline comparison and trend analysis
   - 20% improvement target tracking
   - Comprehensive reporting

3. **ImprovementLoop** - Continuous improvement automation
   - Automatic learning cycle execution
   - A/B testing framework
   - Failure pattern analysis
   - Strategy optimization

## Features

### Reinforcement Learning

**Q-Learning Algorithm:**
```typescript
Q(s,a) = Q(s,a) + α * [r + γ * max(Q(s',a')) - Q(s,a)]
```

Where:
- `α` = learning rate (default: 0.1)
- `γ` = discount factor (default: 0.95)
- `r` = reward from task execution
- `s,a` = current state-action pair
- `s',a'` = next state-action pair

**Reward Calculation:**
- Success/failure: ±1.0
- Execution time: up to +0.5 (faster is better)
- Error penalty: -0.1 per error
- User feedback: ±2.0 (based on rating)
- Coverage bonus: up to +2.0 (above 80%)

### Performance Tracking

**Metrics Tracked:**
- Tasks completed
- Success rate
- Average execution time
- Error rate
- User satisfaction
- Resource efficiency

**Composite Performance Score:**
```typescript
score = successRate * 0.30 +
        userSatisfaction * 0.25 +
        normalizedTime * 0.20 +
        (1 - errorRate) * 0.15 +
        resourceEfficiency * 0.10
```

### Continuous Improvement

**Improvement Cycle (runs hourly):**
1. Analyze current performance vs baseline
2. Identify failure patterns
3. Discover optimization opportunities
4. Update active A/B tests
5. Apply best-performing strategies

**A/B Testing:**
- Compare multiple strategies in parallel
- Statistical significance testing
- Automatic winner selection
- Strategy application

## Usage

### Basic Integration

```typescript
import { LearningAgent } from './agents/LearningAgent';
import { SwarmMemoryManager } from './core/memory/SwarmMemoryManager';
import { EventBus } from './core/EventBus';

// Initialize memory and event bus
const memoryStore = new SwarmMemoryManager('./data/memory.db');
await memoryStore.initialize();

const eventBus = new EventBus();
await eventBus.initialize();

// Create learning agent
const agent = new LearningAgent({
  type: 'test-generator',
  capabilities: [
    { name: 'test-generation', version: '1.0.0', enabled: true }
  ],
  context: { projectRoot: './project' },
  memoryStore,
  eventBus,
  learningEnabled: true,
  learningRate: 0.1
});

// Initialize and start
await agent.initialize();

// Execute tasks - agent learns automatically
await agent.assignTask({
  id: 'task-1',
  type: 'generate-tests',
  description: 'Generate unit tests for UserService',
  requirements: {
    capabilities: ['test-generation']
  }
});

// Check learning status
const status = await agent.getLearningStatus();
console.log(`Learning status:`, status);
// Output:
// {
//   enabled: true,
//   totalExperiences: 42,
//   patterns: 8,
//   improvement: {
//     improvementRate: 15.2,
//     daysElapsed: 21,
//     targetAchieved: false
//   },
//   activeTests: 1
// }

// Get performance report
const report = await agent.getPerformanceReport();
console.log(report.summary);
// Output: "Agent test-generator-xxx performance: 15.2% improvement over 21 days.
//          4.8% improvement needed to reach 20% target."
```

### Manual Learning Control

```typescript
import { LearningEngine } from './learning/LearningEngine';
import { PerformanceTracker } from './learning/PerformanceTracker';

// Create learning engine
const learningEngine = new LearningEngine(
  'agent-id',
  memoryStore,
  {
    enabled: true,
    learningRate: 0.1,
    explorationRate: 0.3
  }
);

await learningEngine.initialize();

// Learn from task execution
const outcome = await learningEngine.learnFromExecution(
  task,
  result,
  userFeedback
);

if (outcome.improved) {
  console.log(`Performance improved by ${outcome.improvementRate}%`);
}

// Get strategy recommendation
const recommendation = await learningEngine.recommendStrategy(currentState);
console.log(`Recommended strategy: ${recommendation.strategy}`);
console.log(`Confidence: ${recommendation.confidence}`);
console.log(`Expected improvement: ${recommendation.expectedImprovement}%`);
```

### A/B Testing

```typescript
import { ImprovementLoop } from './learning/ImprovementLoop';

// Create improvement loop
const improvementLoop = new ImprovementLoop(
  'agent-id',
  memoryStore,
  learningEngine,
  performanceTracker
);

await improvementLoop.initialize();

// Create A/B test
const testId = await improvementLoop.createABTest(
  'Parallel vs Sequential Execution',
  [
    { name: 'parallel', config: { parallelization: 0.8 } },
    { name: 'sequential', config: { parallelization: 0.0 } }
  ],
  sampleSize: 100
);

// Record test results (happens automatically during task execution)
await improvementLoop.recordTestResult(
  testId,
  'parallel',
  true, // success
  1250  // execution time in ms
);

// Get active tests
const activeTests = improvementLoop.getActiveTests();
console.log(`Active tests: ${activeTests.length}`);
```

## Configuration

### LearningConfig

```typescript
interface LearningConfig {
  enabled: boolean;              // Enable/disable learning
  learningRate: number;          // 0.0 - 1.0 (default: 0.1)
  discountFactor: number;        // Future reward discount (default: 0.95)
  explorationRate: number;       // Exploration vs exploitation (default: 0.3)
  explorationDecay: number;      // Decay rate (default: 0.995)
  minExplorationRate: number;    // Minimum exploration (default: 0.01)
  maxMemorySize: number;         // Max learning data in bytes (default: 100MB)
  batchSize: number;             // Batch update size (default: 32)
  updateFrequency: number;       // Updates per N tasks (default: 10)
}
```

### Performance Requirements

- **Storage:** < 100MB per project (configurable)
- **Improvement Target:** 20% over 30 days
- **False Positives:** Zero (all recommendations are validated)
- **User Control:** On/off toggle available

## Memory Storage

Learning data is stored in SwarmMemoryManager with the following structure:

```
phase2/learning/<agent-id>/
  ├── config              # Learning configuration
  ├── state               # Q-table, experiences, patterns
  ├── baseline            # Baseline performance metrics
  ├── snapshots/          # Performance snapshots over time
  ├── improvement         # Current improvement data
  ├── strategies/         # Available strategies
  ├── abtests/            # A/B test configurations
  ├── failure-patterns/   # Identified failure patterns
  └── cycles/             # Improvement cycle results
```

## Performance Metrics

### Tracked Metrics

1. **Task Success Rate** - Percentage of successfully completed tasks
2. **Execution Time** - Average time to complete tasks
3. **Error Rate** - Frequency of errors during execution
4. **User Satisfaction** - User feedback ratings (0.0 - 1.0)
5. **Resource Efficiency** - Efficiency of resource utilization

### Improvement Calculation

```typescript
improvementRate = ((currentScore - baselineScore) / baselineScore) * 100
```

Where score is the weighted composite of all metrics.

### Reporting

```typescript
const report = await performanceTracker.generateReport();

// report contains:
{
  summary: "Agent xxx performance: 15.2% improvement over 21 days...",
  improvement: {
    improvementRate: 15.2,
    daysElapsed: 21,
    targetAchieved: false
  },
  trends: [
    { metric: 'successRate', direction: 'up', changeRate: 12.5 },
    { metric: 'executionTime', direction: 'down', changeRate: -8.3 }
  ],
  recommendations: [
    "Focus on improving task success rate...",
    "Optimize execution time by enabling parallel processing..."
  ]
}
```

## Integration with BaseAgent

The learning system integrates seamlessly with `BaseAgent` through lifecycle hooks:

```typescript
class MyAgent extends LearningAgent {
  protected async onPostTask(data: PostTaskData): Promise<void> {
    await super.onPostTask(data); // Triggers automatic learning

    // Agent automatically:
    // 1. Learns from task execution
    // 2. Records performance metrics
    // 3. Updates strategies
    // 4. Applies improvements
  }
}
```

## Best Practices

1. **Set Appropriate Learning Rate:**
   - Start with 0.1 for stable learning
   - Increase to 0.3 for faster adaptation
   - Decrease to 0.05 for fine-tuning

2. **Monitor Exploration Rate:**
   - High exploration (0.3) early for discovery
   - Gradually decays to 0.01 for exploitation
   - Reset if performance plateaus

3. **Regular Performance Reviews:**
   - Check improvement every 7 days
   - Adjust strategies if < 5% improvement
   - Celebrate when 20% target achieved!

4. **A/B Test New Strategies:**
   - Test before full deployment
   - Use statistical significance (p < 0.05)
   - Compare at least 2 strategies

5. **Manage Memory Size:**
   - Monitor learning state size
   - Prune old experiences if > 100MB
   - Keep most recent 1000 experiences

## Troubleshooting

### Low Improvement Rate

**Symptoms:** < 5% improvement after 15 days

**Solutions:**
- Increase learning rate to 0.2
- Add more diverse experiences
- Review failure patterns
- Test new strategies via A/B testing

### Memory Size Issues

**Symptoms:** Learning state > 100MB

**Solutions:**
- Reduce batch size to 16
- Decrease max experiences to 500
- Prune old snapshots
- Increase update frequency

### Instability in Learning

**Symptoms:** Performance fluctuates wildly

**Solutions:**
- Decrease learning rate to 0.05
- Increase batch size to 64
- Review reward calculation
- Check for data quality issues

## Future Enhancements

- [ ] Deep Q-learning for complex state spaces
- [ ] Multi-agent collaborative learning
- [ ] Transfer learning across agent types
- [ ] Automated hyperparameter tuning
- [ ] Real-time dashboard for monitoring

## References

- Q-Learning: Watkins & Dayan (1992)
- Reinforcement Learning: Sutton & Barto (2018)
- A/B Testing: Kohavi et al. (2009)

---

**Phase 2 (v1.1.0) - Milestone 2.2 Complete**
