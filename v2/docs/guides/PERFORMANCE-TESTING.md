# Performance Testing Guide

Learn how to test performance, detect bottlenecks, and validate system resilience with load testing and chaos engineering.

## Overview

AQE's performance testing capabilities help you:

- **Load test** your applications with k6, JMeter, and custom tools
- **Detect bottlenecks** automatically using AI analysis
- **Monitor performance** trends over time
- **Run chaos tests** to validate resilience
- **Generate performance reports** with actionable insights

**Key Features:**
- Multi-tool support (k6, JMeter, Artillery, custom)
- Real-time performance monitoring
- Bottleneck detection with AI
- Chaos engineering scenarios
- Performance regression detection

## Basic Performance Testing

### Run Performance Benchmark

```bash
aqe benchmark
```

**What it does:**
1. Discovers performance-critical endpoints
2. Generates load test scenarios
3. Executes tests with increasing load
4. Monitors response times and throughput
5. Identifies bottlenecks automatically

**Output:**
```
⚡ Running Performance Benchmark...

Test Configuration:
  Duration: 60s
  Virtual Users: 1 → 100 (ramp-up)
  Tool: k6

Running tests:
  [00:15] 25 VUs  | Avg: 45ms  | P95: 120ms  | P99: 250ms  | RPS: 250
  [00:30] 50 VUs  | Avg: 52ms  | P95: 145ms  | P99: 310ms  | RPS: 480
  [00:45] 75 VUs  | Avg: 68ms  | P95: 180ms  | P99: 420ms  | RPS: 650
  [00:60] 100 VUs | Avg: 95ms  | P95: 280ms  | P99: 650ms  | RPS: 750

📊 Performance Results:
   Max Throughput: 750 RPS
   Avg Response Time: 95ms
   P95 Response Time: 280ms
   P99 Response Time: 650ms
   Error Rate: 0.2%

✅ Performance benchmark completed!
```

## Load Testing

### Using k6 (Recommended)

k6 is a modern load testing tool with excellent scripting capabilities.

**Install k6:**
```bash
npm install -g k6
```

**Generate k6 test script:**
```bash
aqe generate --type performance --framework k6 --target http://localhost:3000/api
```

**Generated script:**
```javascript
// tests/performance/api-load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp-up to 20 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% requests < 500ms
    http_req_failed: ['rate<0.01'],   // Error rate < 1%
  },
};

export default function () {
  const res = http.get('http://localhost:3000/api/users');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Run k6 test:**
```bash
k6 run tests/performance/api-load-test.js
```

### Using JMeter

JMeter is a Java-based load testing tool with GUI.

**Generate JMeter test plan:**
```bash
aqe generate --type performance --framework jmeter --target http://localhost:3000/api
```

**Generated:** `tests/performance/api-load-test.jmx`

**Run JMeter test:**
```bash
jmeter -n -t tests/performance/api-load-test.jmx -l results.jtl
```

### Using Artillery

Artillery is a modern, developer-friendly load testing tool.

**Install Artillery:**
```bash
npm install -g artillery
```

**Generate Artillery test:**
```bash
aqe generate --type performance --framework artillery --target http://localhost:3000/api
```

**Generated script:**
```yaml
# tests/performance/api-load-test.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      rampTo: 50
  defaults:
    headers:
      Content-Type: 'application/json'

scenarios:
  - name: 'Load test API'
    flow:
      - get:
          url: '/api/users'
          expect:
            - statusCode: 200
            - contentType: json
```

**Run Artillery test:**
```bash
artillery run tests/performance/api-load-test.yml
```

## Bottleneck Detection

### Auto-Detect Bottlenecks

```bash
aqe analyze bottlenecks
```

**What it analyzes:**
1. Database query performance
2. API endpoint response times
3. Memory usage patterns
4. CPU utilization
5. Network latency
6. External service dependencies

**Output:**
```
🔍 Analyzing Performance Bottlenecks...

Bottlenecks Detected (3):

CRITICAL:
  1. Database Query: getUserOrders()
     └─> Location: src/services/order-service.ts:45
     └─> Issue: N+1 query problem
     └─> Impact: 850ms avg query time
     └─> Recommendation: Use JOIN or eager loading

HIGH:
  2. API Endpoint: POST /api/orders
     └─> Response Time: P95 = 1,200ms
     └─> Issue: Synchronous external API call
     └─> Impact: Blocking request processing
     └─> Recommendation: Use async queue or background job

MEDIUM:
  3. Memory Leak: WebSocket connections
     └─> Location: src/services/websocket-service.ts:78
     └─> Issue: Connections not properly closed
     └─> Impact: Memory grows 50MB/hour
     └─> Recommendation: Add connection cleanup

💡 Recommendations:
   1. Fix N+1 query (expected 90% improvement)
   2. Move external API calls to background
   3. Implement WebSocket cleanup
```

### Analyze Specific Component

```bash
aqe analyze bottlenecks --component api-endpoint
```

**Components:**
- `api-endpoint` - API response times
- `database` - Database queries
- `memory` - Memory usage
- `cpu` - CPU utilization

## Performance Metrics

### Key Metrics Tracked

**Response Time Metrics:**
- **Average (mean)** - Typical response time
- **P50 (median)** - Middle value
- **P95** - 95th percentile (most users' experience)
- **P99** - 99th percentile (worst-case)
- **Max** - Slowest response

**Throughput Metrics:**
- **RPS** - Requests per second
- **Concurrent users** - Active users at a time
- **Total requests** - Cumulative requests

**Error Metrics:**
- **Error rate** - Percentage of failed requests
- **Timeout rate** - Percentage of timeouts
- **5xx errors** - Server errors

**Resource Metrics:**
- **CPU usage** - Processor utilization
- **Memory usage** - RAM consumption
- **Disk I/O** - Read/write operations
- **Network bandwidth** - Data transfer

## Chaos Engineering

### What is Chaos Engineering?

Chaos engineering validates that your system can handle failures gracefully by intentionally injecting faults.

**Common scenarios:**
- Network latency
- Service failures
- Resource exhaustion
- Network partitions

### Run Chaos Scenario

```bash
aqe chaos latency --duration 60 --intensity medium
```

**What happens:**
1. Establishes baseline metrics
2. Injects latency (150ms) into network calls
3. Monitors system behavior
4. Tracks error rates and response times
5. Verifies recovery after chaos stops

**Output:**
```
💥 Running chaos test: latency
   Duration: 60s
   Intensity: medium
   Target: all services

[00:00] ✓ Baseline established
        └─> Avg latency: 45ms, P95: 120ms, P99: 250ms

[00:10] ⚡ Injecting latency (150ms)
        └─> Current latency: 195ms, P95: 270ms, P99: 420ms

[00:30] ⚡ Latency active (150ms)
        └─> Current latency: 198ms, P95: 285ms, P99: 445ms
        ⚠️  3 timeouts detected

[00:60] ✓ Chaos stopped, monitoring recovery
        └─> Current latency: 52ms, P95: 130ms, P99: 260ms

[01:30] ✓ Recovery complete
        └─> Final latency: 46ms, P95: 122ms, P99: 255ms

📊 Chaos Test Results:
   Impact:
   • Timeouts: 3 (0.5% of requests)
   • Errors: 0
   • Avg latency increase: +153ms

   Recovery:
   • Recovery time: 30s
   • Data loss: None
   • Final status: ✅ Healthy

✅ Chaos test completed! System resilient.
```

### Chaos Scenarios

#### 1. Latency Injection

Tests system behavior under network delays.

```bash
# Low latency (50ms)
aqe chaos latency --intensity low --duration 60

# High latency (500ms)
aqe chaos latency --intensity high --duration 120
```

**Use cases:**
- Test timeout handling
- Validate retry logic
- Check user experience under slow networks

#### 2. Service Failures

Simulates random service failures.

```bash
aqe chaos failure --target api-gateway --duration 120 --intensity high
```

**Use cases:**
- Test circuit breakers
- Validate fallback mechanisms
- Check error handling

#### 3. Resource Exhaustion

Simulates CPU, memory, or disk pressure.

```bash
aqe chaos resource-exhaustion --intensity high --duration 180
```

**Use cases:**
- Test resource limits
- Validate auto-scaling
- Check graceful degradation

#### 4. Network Partition

Simulates network splits between services.

```bash
aqe chaos network-partition --target database --duration 120
```

**Use cases:**
- Test distributed system behavior
- Validate data consistency
- Check partition tolerance

## Performance Benchmarking

### Create Baseline

```bash
aqe benchmark --baseline
```

**Output: `performance-baseline.json`**

### Compare Against Baseline

```bash
aqe benchmark --baseline performance-baseline.json
```

**Output:**
```
📊 Performance Comparison:

Metric            Baseline   Current    Change
────────────────────────────────────────────────
Avg Response      45ms       52ms       +15.6% ⚠️
P95 Response      120ms      145ms      +20.8% ⚠️
P99 Response      250ms      310ms      +24.0% ⚠️
Max Throughput    750 RPS    680 RPS    -9.3% ⚠️
Error Rate        0.1%       0.3%       +200% ⚠️

⚠️  PERFORMANCE REGRESSION DETECTED

Degraded Areas:
  1. Average response time increased 15.6%
  2. P95 response time increased 20.8%
  3. Max throughput decreased 9.3%

💡 Recommendations:
   - Run bottleneck analysis
   - Check for new code introduced
   - Review database query performance
```

## Practical Examples

### Example 1: API Load Test

**Scenario:** Test REST API with 1000 concurrent users

```bash
# Generate test
aqe generate --type performance --framework k6 --target http://api.example.com

# Customize load
# Edit generated script to set stages:
# { duration: '2m', target: 1000 }

# Run test
k6 run tests/performance/api-load-test.js

# Analyze results
aqe analyze bottlenecks --component api-endpoint
```

### Example 2: Database Performance

**Scenario:** Find slow database queries

```bash
# Run tests with database profiling
aqe run --coverage

# Analyze bottlenecks
aqe analyze bottlenecks --component database

# Fix N+1 queries and re-test
# (fix code)
aqe benchmark --baseline db-baseline.json
```

### Example 3: Resilience Testing

**Scenario:** Validate system handles failures

```bash
# Test latency resilience
aqe chaos latency --duration 300 --intensity high

# Test failure resilience
aqe chaos failure --duration 300 --intensity medium

# Test resource limits
aqe chaos resource-exhaustion --duration 180

# Generate chaos report
aqe report chaos --format html --output chaos-report.html
```

## CI/CD Integration

### Performance Testing in CI

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on: [push]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Start Application
        run: |
          npm install
          npm start &
          sleep 10

      - name: Run Performance Tests
        run: aqe benchmark --baseline performance-baseline.json

      - name: Check for Regressions
        run: |
          if [ $? -ne 0 ]; then
            echo "Performance regression detected!"
            exit 1
          fi

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: performance-report
          path: performance-report.html
```

## Troubleshooting

### High Response Times

**Problem:** Slow API responses

**Solutions:**
```bash
# Detect bottlenecks
aqe analyze bottlenecks --component api-endpoint

# Check database queries
aqe analyze bottlenecks --component database

# Profile memory usage
aqe analyze bottlenecks --component memory
```

### Performance Regressions

**Problem:** Performance worse than baseline

**Solutions:**
1. Run bottleneck analysis
2. Check recent code changes
3. Review database query plans
4. Validate caching works

### Flaky Performance Tests

**Problem:** Inconsistent results

**Solutions:**
1. Increase test duration for stable averages
2. Use percentiles (P95, P99) instead of averages
3. Run multiple iterations and average
4. Isolate test environment

## Best Practices

1. **Establish baselines early** - Measure before optimizing
2. **Test realistic scenarios** - Use production-like data and load
3. **Monitor continuously** - Track performance over time
4. **Set SLOs** - Define service level objectives (e.g., P95 < 200ms)
5. **Test resilience** - Use chaos engineering regularly
6. **Automate testing** - Include in CI/CD pipeline
7. **Profile before optimizing** - Find bottlenecks first

## Next Steps

- **Set up quality gates** → [QUALITY-GATES.md](./QUALITY-GATES.md)
- **Improve test coverage** → [COVERAGE-ANALYSIS.md](./COVERAGE-ANALYSIS.md)
- **Optimize test suite** → See `aqe optimize` command

## Related Commands

```bash
aqe benchmark --help           # Full benchmark options
aqe chaos --help              # Chaos testing scenarios
aqe analyze bottlenecks --help # Bottleneck detection
aqe generate --type performance # Generate perf tests
```
