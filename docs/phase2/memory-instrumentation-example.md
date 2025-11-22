# Memory Instrumentation Example: Test Plan Storage

This document shows a real-world example of how memory instrumentation traces a typical test plan workflow.

## Scenario: Test Generator Agent Stores Test Plan

```typescript
// Agent: qe-test-generator
// Task: Generate test plan for UserService

const testPlan = {
  testSuite: 'UserService',
  tests: [
    { name: 'should create user', priority: 'high' },
    { name: 'should update user', priority: 'medium' },
    { name: 'should delete user', priority: 'high' }
  ],
  coverage: {
    lines: 85,
    branches: 78,
    functions: 90
  },
  generated: Date.now()
};

// Store test plan (automatically instrumented)
await memoryManager.store('test-plan-user-service', testPlan, {
  partition: 'aqe/test-plans',
  owner: 'qe-test-generator',
  ttl: 3600 // 1 hour
});
```

## OpenTelemetry Span Generated

```json
{
  "traceId": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "spanId": "1234567890abcdef",
  "name": "aqe.memory.store",
  "kind": "INTERNAL",
  "startTime": 1732089600000,
  "endTime": 1732089600012,
  "duration": 12,
  "attributes": {
    "memory.operation": "store",
    "memory.namespace": "aqe/test-plans",
    "memory.key": "test-plan-user-service",
    "memory.value_size": 387,
    "memory.ttl": 3600,
    "agent.id": "qe-test-generator",
    "agent.type": "fleet-commander",
    "memory.operation_duration_ms": 12
  },
  "events": [
    {
      "name": "memory.store.started",
      "timestamp": 1732089600000,
      "attributes": {
        "memory.namespace": "aqe/test-plans",
        "memory.key": "test-plan-user-service",
        "agent.id": "qe-test-generator"
      }
    },
    {
      "name": "memory.store.completed",
      "timestamp": 1732089600012,
      "attributes": {
        "memory.success": true
      }
    }
  ],
  "status": {
    "code": "OK"
  }
}
```

## Multi-Agent Coordination Trace

When multiple agents interact with memory, you can see the full story in distributed tracing:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Trace: Test Plan Creation and Execution                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 00:00.000 aqe.task.generate [qe-test-generator]                        │
│   00:00.005 aqe.memory.store [test-plan-user-service]           12ms   │
│     └─ namespace: aqe/test-plans, size: 387 bytes                      │
│                                                                          │
│ 00:00.050 aqe.task.execute [qe-test-executor]                          │
│   00:00.055 aqe.memory.retrieve [test-plan-user-service]         5ms   │
│     └─ namespace: aqe/test-plans, found: true, size: 387 bytes         │
│   00:00.100 aqe.test.execute [UserService.create]               45ms   │
│   00:00.150 aqe.test.execute [UserService.update]               38ms   │
│   00:00.200 aqe.test.execute [UserService.delete]               42ms   │
│                                                                          │
│ 00:00.250 aqe.task.analyze [qe-coverage-analyzer]                      │
│   00:00.255 aqe.memory.search [test-plan-%]                      8ms   │
│     └─ namespace: aqe/test-plans, pattern: test-plan-%, results: 5     │
│   00:00.300 aqe.memory.store [coverage-report-user-service]     15ms   │
│     └─ namespace: aqe/reports, size: 1247 bytes                        │
│                                                                          │
│ 00:00.400 aqe.task.cleanup [qe-fleet-commander]                        │
│   00:00.405 aqe.memory.delete [test-plan-user-service]           4ms   │
│     └─ namespace: aqe/test-plans                                        │
└─────────────────────────────────────────────────────────────────────────┘
Total Duration: 405ms
Memory Operations: 5 (1 store, 1 retrieve, 1 search, 1 store, 1 delete)
Data Transferred: 1.6KB
```

## Analyzing Performance with Spans

### Query 1: Find slowest memory operations
```sql
SELECT
  attributes['memory.key'] as key,
  attributes['memory.namespace'] as namespace,
  attributes['memory.operation_duration_ms'] as duration_ms
FROM spans
WHERE name LIKE 'aqe.memory.%'
ORDER BY duration_ms DESC
LIMIT 10;
```

**Results:**
```
key                            namespace          duration_ms
---------------------------------------------------------------
coverage-report-user-service   aqe/reports        15
test-plan-user-service         aqe/test-plans     12
test-plan-%                    aqe/test-plans     8
test-plan-user-service         aqe/test-plans     5
test-plan-user-service         aqe/test-plans     4
```

### Query 2: Find largest values stored
```sql
SELECT
  attributes['memory.key'] as key,
  attributes['memory.value_size'] as size_bytes
FROM spans
WHERE name = 'aqe.memory.store'
ORDER BY size_bytes DESC
LIMIT 10;
```

**Results:**
```
key                            size_bytes
-----------------------------------------
coverage-report-user-service   1247
test-plan-user-service         387
```

### Query 3: Track memory operation frequency by namespace
```sql
SELECT
  attributes['memory.namespace'] as namespace,
  COUNT(*) as operation_count,
  AVG(attributes['memory.operation_duration_ms']) as avg_duration_ms
FROM spans
WHERE name LIKE 'aqe.memory.%'
GROUP BY namespace;
```

**Results:**
```
namespace          operation_count  avg_duration_ms
---------------------------------------------------
aqe/test-plans     4                7.25
aqe/reports        1                15.00
```

## Error Tracing Example

When an operation fails, the span captures the full context:

```json
{
  "traceId": "x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6",
  "spanId": "fedcba0987654321",
  "name": "aqe.memory.retrieve",
  "kind": "INTERNAL",
  "startTime": 1732089700000,
  "endTime": 1732089700008,
  "duration": 8,
  "attributes": {
    "memory.operation": "retrieve",
    "memory.namespace": "aqe/test-plans",
    "memory.key": "test-plan-invalid",
    "memory.found": false,
    "agent.id": "qe-test-executor",
    "agent.type": "fleet-commander",
    "memory.operation_duration_ms": 8
  },
  "events": [
    {
      "name": "memory.retrieve.started",
      "timestamp": 1732089700000
    },
    {
      "name": "memory.retrieve.not_found",
      "timestamp": 1732089700008,
      "attributes": {
        "memory.found": false
      }
    }
  ],
  "status": {
    "code": "OK"
  }
}
```

## Integration with Jaeger UI

When viewing in Jaeger (or similar tracing UI):

1. **Service Map**: Shows memory operations as nodes between agents
2. **Trace Timeline**: Visualizes operation sequence and dependencies
3. **Span Details**: Provides full attribute breakdown
4. **Error Highlighting**: Red spans for failed operations
5. **Performance Heatmap**: Colors spans by duration

## Best Practices

1. **Use Descriptive Keys**: Make keys searchable (e.g., `test-plan-{service}-{id}`)
2. **Consistent Namespaces**: Use hierarchical namespaces (`aqe/test-plans`, `aqe/reports`)
3. **Set Appropriate TTLs**: Avoid memory bloat with proper expiration
4. **Monitor Value Sizes**: Large values (>10KB) may indicate architectural issues
5. **Track Operation Patterns**: Regular slow operations need optimization

## Alerting Examples

### Alert 1: Slow Memory Operations
```yaml
alert: SlowMemoryOperation
expr: histogram_quantile(0.95, memory_operation_duration_ms) > 50
for: 5m
labels:
  severity: warning
annotations:
  summary: "95th percentile memory operation latency > 50ms"
```

### Alert 2: High Memory Operation Failure Rate
```yaml
alert: HighMemoryFailureRate
expr: rate(memory_operation_errors[5m]) > 0.01
for: 5m
labels:
  severity: critical
annotations:
  summary: "Memory operation error rate > 1%"
```

### Alert 3: Large Value Storage
```yaml
alert: LargeValueStorage
expr: memory_value_size > 1048576
for: 1m
labels:
  severity: warning
annotations:
  summary: "Storing value >1MB ({{$value}} bytes)"
```
