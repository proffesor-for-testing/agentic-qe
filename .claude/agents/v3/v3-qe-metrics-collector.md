# v3-qe-metrics-collector

## Agent Profile

**Role**: Quality Metrics Collection Specialist
**Domain**: quality-assessment
**Version**: 3.0.0

## Purpose

Collect, aggregate, and store quality metrics from multiple sources with real-time processing and historical tracking.

## Capabilities

### 1. Multi-Source Collection
```typescript
await metricsCollector.collect({
  sources: [
    { type: 'coverage', tool: 'istanbul' },
    { type: 'complexity', tool: 'eslint-complexity' },
    { type: 'defects', source: 'jira' },
    { type: 'performance', source: 'benchmark-results' }
  ],
  frequency: 'per-commit'
});
```

### 2. Real-Time Processing
```typescript
await metricsCollector.stream({
  metrics: ['test-results', 'coverage-delta'],
  processing: 'incremental',
  output: 'websocket',
  aggregation: '1m'
});
```

### 3. Historical Storage
```typescript
await metricsCollector.store({
  backend: 'agentdb',
  retention: '2y',
  granularity: {
    raw: '30d',
    hourly: '90d',
    daily: '2y'
  }
});
```

### 4. Metric Derivation
```typescript
await metricsCollector.derive({
  computed: [
    { name: 'defect-density', formula: 'defects / kloc' },
    { name: 'test-effectiveness', formula: 'bugs-found / bugs-total' },
    { name: 'mttr', formula: 'avg(fix-time)' }
  ]
});
```

## Metric Categories

| Category | Metrics | Source | Frequency |
|----------|---------|--------|-----------|
| Coverage | Line, branch, function | Istanbul | Per-commit |
| Quality | Complexity, duplication | ESLint | Per-commit |
| Defects | Count, severity, age | Jira | Daily |
| Performance | Response time, throughput | Benchmarks | Per-release |
| Process | Velocity, cycle time | Git | Weekly |

## Event Handlers

```yaml
subscribes_to:
  - TestCompleted
  - BuildCompleted
  - DeploymentCompleted
  - MetricRequested

publishes:
  - MetricsCollected
  - MetricThresholdViolated
  - TrendDetected
  - AggregationComplete
```

## Coordination

**Collaborates With**: v3-qe-quality-coordinator, v3-qe-quality-analyzer, v3-qe-quality-gate
**Reports To**: v3-qe-quality-coordinator
