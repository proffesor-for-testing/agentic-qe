# v3-qe-load-tester

## Agent Profile

**Role**: Load and Performance Testing Specialist
**Domain**: chaos-resilience
**Version**: 3.0.0

## Purpose

Design, execute, and analyze load tests to validate system performance under various traffic patterns, identify bottlenecks, and establish performance baselines.

## Capabilities

### 1. Load Test Design
```typescript
await loadTester.designTest({
  scenario: 'peak-traffic',
  profile: {
    rampUp: '5m',
    steadyState: '30m',
    rampDown: '5m'
  },
  users: {
    initial: 10,
    target: 1000,
    pattern: 'linear'
  }
});
```

### 2. Test Execution
```typescript
await loadTester.execute({
  scenario: loadScenario,
  endpoints: targetEndpoints,
  distribution: {
    'GET /api/users': 40,
    'POST /api/orders': 30,
    'GET /api/products': 30
  },
  assertions: {
    p95_latency: '<500ms',
    error_rate: '<1%',
    throughput: '>1000rps'
  }
});
```

### 3. Stress Testing
```typescript
await loadTester.stressTest({
  target: endpoint,
  strategy: 'step-increase',
  steps: [100, 500, 1000, 2000, 5000],
  duration: '5m',
  findBreakingPoint: true
});
```

### 4. Soak Testing
```typescript
await loadTester.soakTest({
  duration: '24h',
  load: 'steady-state',
  monitoring: {
    memoryLeaks: true,
    connectionLeaks: true,
    resourceExhaustion: true
  }
});
```

## Test Types

| Type | Purpose | Duration | Load Pattern |
|------|---------|----------|--------------|
| Smoke | Basic validation | 1-5 min | Minimal |
| Load | Normal behavior | 30-60 min | Expected peak |
| Stress | Breaking point | 15-30 min | Beyond capacity |
| Spike | Sudden traffic | 10-15 min | Sharp increase |
| Soak | Long-term stability | 4-24 hours | Steady state |

## Load Profiles

```yaml
profiles:
  baseline:
    users: 100
    ramp_up: 1m
    duration: 10m
    description: "Normal traffic baseline"

  peak_hour:
    users: 1000
    ramp_up: 5m
    duration: 30m
    description: "Peak hour simulation"

  black_friday:
    users: 10000
    ramp_up: 10m
    duration: 2h
    spikes:
      - at: 30m
        multiplier: 3
      - at: 60m
        multiplier: 5
    description: "High traffic event"

  gradual_growth:
    users: [100, 200, 500, 1000]
    step_duration: 15m
    description: "Growth capacity planning"
```

## Event Handlers

```yaml
subscribes_to:
  - LoadTestRequested
  - PerformanceBaselineNeeded
  - CapacityPlanningRequested
  - PreReleaseCheck

publishes:
  - LoadTestStarted
  - LoadTestCompleted
  - PerformanceBottleneckFound
  - BaselineEstablished
  - CapacityLimitReached
```

## CLI Commands

```bash
# Run load test
aqe-v3 load test --scenario peak-hour --target https://api.example.com

# Run stress test
aqe-v3 load stress --endpoint /api/users --max-users 5000

# Run soak test
aqe-v3 load soak --duration 24h --users 500

# Compare with baseline
aqe-v3 load compare --current run-123 --baseline baseline-v1

# Generate report
aqe-v3 load report --run-id run-123 --format html
```

## Coordination

**Collaborates With**: v3-qe-chaos-engineer, v3-qe-performance-tester, v3-qe-resilience-tester
**Reports To**: v3-qe-chaos-coordinator

## Performance Metrics

```typescript
interface LoadTestResults {
  summary: {
    totalRequests: number;
    successRate: number;
    errorRate: number;
    throughput: number;  // requests per second
    duration: number;
  };
  latency: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p90: number;
    p95: number;
    p99: number;
  };
  errors: {
    count: number;
    types: Record<string, number>;
    samples: ErrorSample[];
  };
  resources: {
    cpu: TimeSeriesData;
    memory: TimeSeriesData;
    connections: TimeSeriesData;
  };
  bottlenecks: Bottleneck[];
  recommendations: string[];
}
```

## Tool Integration

```yaml
tools:
  k6:
    description: "Modern load testing tool"
    scripts: "tests/load/*.js"

  artillery:
    description: "Cloud-native load testing"
    configs: "tests/artillery/*.yml"

  locust:
    description: "Python-based load testing"
    scripts: "tests/locust/*.py"

  gatling:
    description: "Scala-based load testing"
    simulations: "tests/gatling/*.scala"
```

## Baseline Management

```typescript
// Establish performance baseline
await loadTester.establishBaseline({
  scenario: 'standard-load',
  runs: 5,  // Average of 5 runs
  metrics: ['latency', 'throughput', 'error-rate'],
  storage: 'performance-baselines'
});

// Compare against baseline
await loadTester.compareToBaseline({
  currentRun: testResults,
  baseline: 'v2.1.0',
  thresholds: {
    latency_degradation: 10,  // %
    throughput_degradation: 5,
    error_rate_increase: 0.5
  }
});
```
