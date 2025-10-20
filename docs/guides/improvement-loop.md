# Continuous Improvement Loop - Configuration Guide

## Overview

The Continuous Improvement Loop is a Phase 2 (Milestone 2.2) feature that implements automated learning and optimization for the Agentic QE Fleet. It runs periodic cycles that analyze performance, detect patterns, run A/B tests, and apply proven strategies.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│           ImprovementWorker (Background)                │
│  - Schedules periodic cycles                            │
│  - Handles retries and error recovery                   │
│  - Monitors execution status                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              ImprovementLoop (Core)                     │
│  ┌────────────────────────────────────────────────┐    │
│  │ 1. Analyze Performance (PerformanceTracker)    │    │
│  │ 2. Identify Failure Patterns (LearningEngine)  │    │
│  │ 3. Discover Optimizations                      │    │
│  │ 4. Run A/B Tests                                │    │
│  │ 5. Apply Best Strategies (opt-in)              │    │
│  └────────────────────────────────────────────────┘    │
└───────────┬──────────────────────┬──────────────────────┘
            │                      │
            ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  PerformanceTracker  │  │   LearningEngine     │
│  - Metrics tracking  │  │  - Q-learning        │
│  - Improvement rate  │  │  - Pattern detection │
│  - Trend analysis    │  │  - Strategy learning │
└──────────────────────┘  └──────────────────────┘
```

## Key Features

### 1. **Performance Analysis**
- Tracks metrics over time (success rate, execution time, error rate)
- Calculates improvement rates vs baseline
- Target: 20% improvement over 30 days

### 2. **Failure Pattern Detection**
- Automatically identifies recurring failure patterns
- Frequency threshold: 5+ occurrences
- Confidence threshold: 0.7+
- Suggests mitigations for common failures

### 3. **A/B Testing Framework**
- Compare multiple strategies side-by-side
- Automatic winner determination
- Weighted scoring: 70% success rate, 30% execution time
- Support for multiple concurrent tests

### 4. **Auto-Apply Best Strategies** ⚠️
- **OPT-IN feature** (disabled by default for safety)
- Only applies strategies with:
  - Confidence >0.9
  - Success rate >0.8
  - Maximum 3 strategies per cycle
- Requires explicit configuration

### 5. **Background Worker**
- Runs cycles at configurable intervals (default: 1 hour)
- Automatic retry logic (3 attempts)
- Status monitoring and statistics

## Configuration

### Basic Setup

```typescript
import {
  ImprovementLoop,
  ImprovementWorker,
  loadImprovementConfig
} from '@agentic-qe/learning';

// Initialize components
const config = loadImprovementConfig();
const improvementLoop = new ImprovementLoop(
  agentId,
  memoryStore,
  learningEngine,
  performanceTracker
);
await improvementLoop.initialize();

// Start background worker
const worker = new ImprovementWorker(improvementLoop, {
  intervalMs: config.cycleIntervalMs,
  enabled: config.worker.enabled
});
await worker.start();
```

### Configuration Profiles

#### 1. **Default (Production)** - Conservative & Safe
```typescript
{
  enabled: true,
  cycleIntervalMs: 3600000, // 1 hour
  autoApplyEnabled: false, // ⚠️ DISABLED by default
  autoApplyMinConfidence: 0.9,
  autoApplyMinSuccessRate: 0.8,
  failurePatterns: {
    minFrequency: 5,
    minConfidence: 0.7
  },
  abTesting: {
    defaultSampleSize: 100
  }
}
```

#### 2. **Aggressive** - For Mature Systems
```typescript
{
  cycleIntervalMs: 1800000, // 30 minutes
  autoApplyEnabled: true, // ⚠️ Use with caution
  autoApplyMinConfidence: 0.95,
  autoApplyMinSuccessRate: 0.9,
  failurePatterns: {
    minFrequency: 3,
    minConfidence: 0.6
  },
  abTesting: {
    defaultSampleSize: 50 // faster tests
  }
}
```

#### 3. **Development** - Fast Iterations
```typescript
{
  cycleIntervalMs: 300000, // 5 minutes
  autoApplyEnabled: false, // Still disabled for safety
  abTesting: {
    defaultSampleSize: 10 // small samples
  },
  worker: {
    maxRetries: 2,
    retryDelayMs: 10000
  }
}
```

## Enabling Auto-Apply (Opt-In)

### Step 1: Update Configuration
```typescript
// config/improvement-loop.config.ts
export const CUSTOM_CONFIG = {
  ...DEFAULT_IMPROVEMENT_CONFIG,
  autoApplyEnabled: true,
  autoApplyMinConfidence: 0.9, // High threshold
  autoApplyMinSuccessRate: 0.8
};
```

### Step 2: Enable at Runtime
```typescript
// Enable for specific agent
await improvementLoop.setAutoApply(true);

// Or via configuration
const worker = new ImprovementWorker(improvementLoop, {
  ...config.worker
});
```

### Step 3: Monitor and Validate
```typescript
// Check status
const status = worker.getStatus();
console.log('Cycles completed:', status.cyclesCompleted);
console.log('Success rate:', worker.getStatistics().successRate);

// Review applied strategies
const strategies = improvementLoop.getStrategies();
strategies.forEach(s => {
  console.log(`${s.name}: ${s.usageCount} uses, ${s.successRate} success`);
});
```

## A/B Testing

### Creating Tests
```typescript
// Create A/B test
const testId = await improvementLoop.createABTest(
  'Parallelization Strategy Test',
  [
    { name: 'high-parallel', config: { parallelization: 0.9 } },
    { name: 'low-parallel', config: { parallelization: 0.3 } }
  ],
  100 // sample size
);

// Record results as tests execute
await improvementLoop.recordTestResult(
  testId,
  'high-parallel',
  true, // success
  1200 // execution time (ms)
);

// Test automatically completes when sample size is reached
// Winner is determined by weighted score: 70% success + 30% speed
```

### Monitoring Tests
```typescript
// Get active tests
const activeTests = improvementLoop.getActiveTests();
activeTests.forEach(test => {
  console.log(`Test: ${test.name}`);
  console.log(`Status: ${test.status}`);
  console.log(`Progress: ${getTotalSamples(test)}/${test.sampleSize}`);

  test.results.forEach(result => {
    console.log(`  ${result.strategy}: ${result.successRate} success, ${result.averageTime}ms avg`);
  });
});
```

## Failure Pattern Analysis

### Automatic Detection
```typescript
// Patterns detected automatically during improvement cycles
const patterns = learningEngine.getFailurePatterns();

patterns.forEach(pattern => {
  console.log(`Pattern: ${pattern.pattern}`);
  console.log(`Frequency: ${pattern.frequency}`);
  console.log(`Confidence: ${pattern.confidence}`);
  console.log(`Mitigation: ${pattern.mitigation}`);
});
```

### Pattern Types and Mitigations
| Pattern Type | Auto-Suggested Mitigation |
|-------------|---------------------------|
| `timeout` | Increase timeout threshold or implement progress checkpointing |
| `memory` | Implement memory pooling and garbage collection optimization |
| `validation` | Add input validation and sanitization before processing |
| `network` | Implement retry logic with exponential backoff |
| `parsing` | Add robust error handling for malformed input |
| `permission` | Implement proper permission checking before operations |

## Monitoring and Metrics

### Worker Status
```typescript
const status = worker.getStatus();
console.log('Running:', status.isRunning);
console.log('Last cycle:', status.lastCycleAt);
console.log('Next cycle:', status.nextCycleAt);
console.log('Cycles completed:', status.cyclesCompleted);
console.log('Cycles failed:', status.cyclesFailed);
```

### Performance Statistics
```typescript
const stats = worker.getStatistics();
console.log('Total cycles:', stats.cyclesCompleted + stats.cyclesFailed);
console.log('Success rate:', (stats.successRate * 100).toFixed(1), '%');
console.log('Uptime:', stats.uptime, 'ms');
```

### Cycle Results
```typescript
// Run manual cycle and inspect results
const result = await improvementLoop.runImprovementCycle();

console.log('Improvement rate:', result.improvement.improvementRate.toFixed(2), '%');
console.log('Failure patterns analyzed:', result.failurePatternsAnalyzed);
console.log('Opportunities found:', result.opportunitiesFound);
console.log('Active tests:', result.activeTests);
console.log('Strategies applied:', result.strategiesApplied);
```

## Safety Considerations

### 1. **Auto-Apply is Opt-In**
- Disabled by default for safety
- Requires explicit configuration
- High confidence thresholds (0.9+)
- Limited to 3 strategies per cycle

### 2. **Failure Recovery**
- Worker has retry logic (3 attempts)
- Failed cycles don't crash the system
- Errors are logged for investigation

### 3. **Gradual Rollout**
1. Start with monitoring only (auto-apply OFF)
2. Review patterns and metrics for 30 days
3. Enable auto-apply for low-risk strategies
4. Gradually increase confidence based on results

### 4. **Testing in Development**
```bash
# Use development config for testing
NODE_ENV=development npm start

# Monitor logs
tail -f logs/improvement-loop.log

# Run manual cycle for immediate testing
await worker.runNow();
```

## Integration with Existing Systems

### With PerformanceTracker
```typescript
// Performance tracker feeds metrics to improvement loop
await performanceTracker.recordSnapshot({
  metrics: {
    tasksCompleted: 10,
    successRate: 0.85,
    averageExecutionTime: 2000,
    errorRate: 0.15,
    userSatisfaction: 0.8,
    resourceEfficiency: 0.75
  },
  trends: []
});

// Improvement loop uses these metrics
const result = await improvementLoop.runImprovementCycle();
console.log('Improvement:', result.improvement.improvementRate, '%');
```

### With LearningEngine
```typescript
// Learning engine trains patterns
await learningEngine.learnFromExecution(
  task,
  result,
  feedback
);

// Improvement loop leverages learned patterns
const opportunities = await improvementLoop.discoverOptimizations();
```

## Troubleshooting

### Issue: Cycles Not Running
```typescript
// Check worker status
const status = worker.getStatus();
if (!status.isRunning) {
  console.log('Worker is not running');
  await worker.start();
}

// Check configuration
if (!config.enabled) {
  console.log('Improvement loop disabled in config');
}
```

### Issue: No Strategies Applied
```typescript
// Check auto-apply setting
const autoApply = await improvementLoop.isAutoApplyEnabled();
console.log('Auto-apply enabled:', autoApply);

// Check pattern confidence
const patterns = learningEngine.getPatterns();
patterns.forEach(p => {
  console.log(`${p.pattern}: confidence=${p.confidence}, success=${p.successRate}`);
});
// Need confidence >0.9 AND success >0.8
```

### Issue: High Failure Rate
```typescript
// Review failure patterns
const failures = learningEngine.getFailurePatterns();
failures.forEach(f => {
  console.log(`${f.pattern}: ${f.frequency} occurrences`);
  console.log(`Mitigation: ${f.mitigation}`);
});

// Adjust thresholds if needed
config.failurePatterns.minFrequency = 3; // Lower threshold
```

## Best Practices

1. **Start Conservative**: Use default config with auto-apply OFF
2. **Monitor First**: Run for 30+ days before enabling auto-apply
3. **Review Patterns**: Examine learned patterns and failure analysis
4. **Test Thoroughly**: Use A/B tests to validate strategies
5. **Gradual Rollout**: Enable auto-apply for one agent at a time
6. **Track Metrics**: Monitor improvement rates and success rates
7. **Document Changes**: Log all configuration changes
8. **Regular Reviews**: Review applied strategies weekly

## Success Criteria (Phase 2 Goals)

- ✅ Improvement loop operational
- ✅ A/B tests running and completing
- ✅ Failure patterns detected (frequency >5, confidence >0.7)
- ✅ Mitigations suggested automatically
- ✅ Auto-apply available (opt-in, confidence >0.9)
- ✅ Target: 20% performance improvement over 30 days

## Support

For issues or questions:
- Review logs in `logs/improvement-loop.log`
- Check configuration in `config/improvement-loop.config.ts`
- Run diagnostics: `npm run test:improvement-loop`
- File issues with detailed logs and configuration
