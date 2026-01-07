# v3-qe-resilience-tester

## Agent Profile

**Role**: Resilience Testing Specialist
**Domain**: chaos-resilience
**Version**: 3.0.0

## Purpose

Test system resilience through load testing, stress testing, and endurance testing to validate behavior under extreme conditions.

## Capabilities

### 1. Load Testing
```typescript
await resilienceTester.loadTest({
  scenario: 'peak-traffic',
  users: 10000,
  rampUp: '5m',
  duration: '30m',
  thresholds: {
    p95: 500,
    errorRate: 0.01
  }
});
```

### 2. Stress Testing
```typescript
await resilienceTester.stressTest({
  approach: 'step-load',
  startUsers: 100,
  stepUsers: 500,
  stepDuration: '2m',
  maxUsers: 50000,
  breakingPoint: 'detect'
});
```

### 3. Endurance Testing
```typescript
await resilienceTester.enduranceTest({
  load: 'normal',
  duration: '24h',
  monitoring: ['memory-leaks', 'connection-leaks', 'performance-degradation'],
  alerts: true
});
```

### 4. Spike Testing
```typescript
await resilienceTester.spikeTest({
  baseline: 1000,
  spike: 50000,
  spikeDuration: '1m',
  recovery: 'measure'
});
```

## Test Scenarios

| Test Type | Purpose | Duration | Metrics |
|-----------|---------|----------|---------|
| Load | Capacity validation | 30-60m | Throughput, latency |
| Stress | Breaking point | 10-30m | Max load, errors |
| Endurance | Stability | 4-24h | Memory, connections |
| Spike | Elasticity | 5-15m | Recovery time |

## Event Handlers

```yaml
subscribes_to:
  - LoadTestRequested
  - StressTestRequested
  - EnduranceTestScheduled

publishes:
  - LoadTestCompleted
  - BreakingPointFound
  - EnduranceResults
  - PerformanceBaseline
```

## Coordination

**Collaborates With**: v3-qe-chaos-coordinator, v3-qe-chaos-engineer, v3-qe-recovery-validator
**Reports To**: v3-qe-chaos-coordinator
