---
name: aqe-benchmark
description: Run performance benchmarks and compare against baselines
---

# AQE Performance Benchmarking

Run performance benchmarks and compare against baselines.

## Usage

```bash
aqe benchmark <target> [options]
# or
/aqe-benchmark <target> [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | string | **required** | Benchmark target: api, database, function, system |
| `--baseline` | path | - | Baseline file for comparison |
| `--iterations` | number | `1000` | Number of benchmark iterations |
| `--warmup` | number | `100` | Warmup iterations |
| `--concurrency` | number | `1` | Concurrent requests |
| `--duration` | number | - | Duration in seconds (alternative to iterations) |
| `--method` | string | `GET` | HTTP method for API benchmarks |
| `--payload` | path | - | Request payload file |
| `--output` | path | - | Output file for results |
| `--format` | string | `text` | Output format: text, json, html |

## Examples

### API Endpoint Benchmark

```bash
aqe benchmark api --target /api/users --iterations 1000
```

Benchmarks API endpoint with 1000 requests.

### Database Query Benchmark

```bash
aqe benchmark database --target user-queries --concurrency 10
```

Benchmarks database queries with 10 concurrent connections.

### Function Benchmark

```bash
aqe benchmark function --target calculateTotal --iterations 10000
```

Benchmarks function performance with 10,000 iterations.

### Compare with Baseline

```bash
aqe benchmark api --target /api/orders --baseline baseline.json
```

Compares current performance against saved baseline.

### Load Testing

```bash
aqe benchmark api --target /api/search --concurrency 50 --duration 60
```

Load tests endpoint with 50 concurrent users for 60 seconds.

## Integration with Claude Code

### Spawning Benchmark Agent

```javascript
// Use Claude Code's Task tool to spawn the benchmark agent
Task("Execute performance benchmark", `
  Run comprehensive performance benchmarks:
  - Target: All API endpoints
  - Iterations: 5000 per endpoint
  - Concurrency: 20
  - Compare with baseline from last release

  Identify performance regressions and bottlenecks.
  Store results in memory: aqe/benchmarks/{bench-id}
`, "qe-performance-tester")
```

### Comprehensive Benchmark Workflow

```javascript
// Benchmark multiple targets in parallel
[Single Message]:
  Task("Benchmark API", "Test all API endpoints", "qe-performance-tester")
  Task("Benchmark Database", "Test critical queries", "qe-performance-tester")
  Task("Benchmark Functions", "Test core algorithms", "qe-performance-tester")

  TodoWrite({ todos: [
    {content: "Benchmark API endpoints", status: "in_progress", activeForm: "Benchmarking API"},
    {content: "Benchmark database queries", status: "in_progress", activeForm: "Benchmarking DB"},
    {content: "Benchmark core functions", status: "in_progress", activeForm: "Benchmarking functions"},
    {content: "Compare with baseline", status: "pending", activeForm: "Comparing baseline"},
    {content: "Generate performance report", status: "pending", activeForm: "Generating report"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-performance-tester**: Main agent responsible for benchmarking

### Supporting Agents
- **qe-test-executor**: Orchestrates benchmark execution
- **qe-quality-gate**: Validates against SLAs

### Coordination Flow

```
1. Pre-Benchmark Hook
   ├─> Load baseline metrics (if provided)
   ├─> Configure benchmark parameters
   ├─> Warm up system
   └─> Establish monitoring

2. Benchmark Execution
   ├─> Run warmup iterations
   ├─> Execute benchmark iterations
   ├─> Collect timing metrics
   ├─> Monitor resource usage
   └─> Detect anomalies

3. Results Analysis
   ├─> Calculate statistics (mean, median, P95, P99)
   ├─> Compare with baseline (if provided)
   ├─> Identify regressions
   ├─> Detect bottlenecks
   └─> Generate recommendations

4. Post-Benchmark Hook
   ├─> Store benchmark results
   ├─> Update performance trends
   ├─> Train neural patterns
   └─> Notify fleet of findings
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve baseline metrics
npx ruflo@3.76.0 memory retrieve --key "aqe/benchmarks/baseline"

# Retrieve SLA thresholds
npx ruflo@3.76.0 memory retrieve --key "aqe/performance/sla"

# Retrieve historical benchmarks
npx ruflo@3.76.0 memory retrieve --key "aqe/benchmarks/history"
```

### Output Memory Keys

```bash
# Store benchmark results
npx ruflo@3.76.0 memory store \
  --key "aqe/benchmarks/${bench_id}" \
  --value '{"mean": 45, "median": 42, "p95": 120, "p99": 250}'

# Update performance trends
npx ruflo@3.76.0 memory store \
  --key "aqe/performance/trends" \
  --value '[{"date": "2025-09-30", "mean": 45}]'

# Store baseline for future comparisons
npx ruflo@3.76.0 memory store \
  --key "aqe/benchmarks/baseline" \
  --value '{"mean": 45, "p95": 120, "timestamp": "2025-09-30T10:30:00Z"}'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx ruflo@3.76.0 hooks pre-task \
  --description "Benchmark: ${target}" \
  --agent "qe-performance-tester"
```

### Post-Task Hook

```bash
npx ruflo@3.76.0 hooks post-task \
  --task-id "${BENCH_ID}" \
  --results "${BENCH_RESULTS}"
```

### Notify Fleet

```bash
npx ruflo@3.76.0 hooks notify \
  --message "Benchmark ${target} completed: $(echo "${BENCH_RESULTS}" | jq -r '.mean')ms mean"
```

## Expected Outputs

### API Benchmark Output

```
⚡ Running benchmark: /api/users
   Iterations: 1000
   Concurrency: 1
   Warmup: 100

🔥 Warming up (100 requests)...
   Warmup complete (avg: 48ms)

🚀 Running benchmark...
Progress: [████████████████████] 1000/1000

📊 Benchmark Results:

   Response Times:
   • Mean:     45ms
   • Median:   42ms
   • P95:      120ms
   • P99:      250ms
   • Min:      28ms
   • Max:      580ms

   Throughput:
   • Requests/sec: 22.2
   • Total time:   45.0s

   Status Codes:
   • 200: 995 (99.5%)
   • 500: 5 (0.5%)

   Network:
   • Data sent:     245 KB
   • Data received: 2.3 MB
   • Avg bandwidth: 52.4 KB/s

✅ Benchmark completed successfully!
```

### Benchmark with Baseline Comparison

```
⚡ Running benchmark: /api/search
   Baseline: baseline.json (from 2025-09-23)

📊 Benchmark Results with Comparison:

   Metric          Current   Baseline   Change
   ──────────────────────────────────────────────
   Mean            52ms      45ms       +15.6% ⚠️
   Median          48ms      42ms       +14.3% ⚠️
   P95             135ms     120ms      +12.5% ⚠️
   P99             280ms     250ms      +12.0% ⚠️
   Throughput      19.2/s    22.2/s     -13.5% ⚠️

⚠️  Performance Regression Detected!

   Impact: Moderate
   • Response times increased by ~15%
   • Throughput decreased by ~14%

💡 Recommendations:
   1. Review recent code changes
   2. Check database query performance
   3. Analyze resource utilization
   4. Consider caching optimization
```

### Function Benchmark Output

```
⚡ Running benchmark: calculateTotal
   Iterations: 10000
   Warmup: 1000

📊 Benchmark Results:

   Execution Times:
   • Mean:     0.12ms
   • Median:   0.11ms
   • P95:      0.18ms
   • P99:      0.25ms
   • Std Dev:  0.04ms

   Performance:
   • Operations/sec: 8,333
   • Total duration: 1.2s

   Memory:
   • Avg allocation: 24 bytes/op
   • Total allocated: 240 KB

✅ Excellent performance! Function is highly optimized.
```

### Benchmark Report JSON

```json
{
  "benchmarkId": "qe-bench-1727683200-12345",
  "target": "/api/users",
  "type": "api",
  "parameters": {
    "iterations": 1000,
    "warmup": 100,
    "concurrency": 1,
    "method": "GET"
  },
  "results": {
    "responseTimes": {
      "mean": 45,
      "median": 42,
      "p95": 120,
      "p99": 250,
      "min": 28,
      "max": 580,
      "stdDev": 32
    },
    "throughput": {
      "requestsPerSecond": 22.2,
      "totalDuration": 45.0
    },
    "statusCodes": {
      "200": 995,
      "500": 5
    },
    "network": {
      "dataSent": 250880,
      "dataReceived": 2411520,
      "avgBandwidth": 53657
    }
  },
  "baseline": {
    "mean": 45,
    "median": 42,
    "p95": 120,
    "source": "baseline.json",
    "date": "2025-09-23T10:00:00Z"
  },
  "comparison": {
    "meanChange": 0,
    "medianChange": 0,
    "p95Change": 0,
    "regression": false
  },
  "timestamp": "2025-09-30T10:30:00Z"
}
```

## Benchmark Types

### API Benchmark
- **Target**: HTTP endpoints
- **Metrics**: Response time, throughput, status codes
- **Use case**: API performance testing

### Database Benchmark
- **Target**: Database queries
- **Metrics**: Query time, throughput, connection pool
- **Use case**: Database performance optimization

### Function Benchmark
- **Target**: Individual functions
- **Metrics**: Execution time, memory allocation
- **Use case**: Algorithm optimization

### System Benchmark
- **Target**: Entire system
- **Metrics**: End-to-end latency, resource usage
- **Use case**: Overall system performance

## Error Handling

### Target Not Found

```bash
❌ Error: Benchmark target '/api/invalid' not found
   Received: 404 Not Found

Verify the endpoint exists and is accessible.
```

**Solution:** Check target URL or endpoint name.

### Performance Regression

```bash
⚠️  WARNING: Performance regression detected!
   Mean latency increased by 35%

This may indicate:
   • Code performance issue
   • Database slowdown
   • Resource contention
   • Network problems

Review recent changes and investigate.
```

**Solution:** Investigate and address performance degradation.

### SLA Violation

```bash
❌ ERROR: SLA violation detected!
   P95: 450ms (SLA: 200ms)
   P99: 850ms (SLA: 500ms)

System does not meet performance requirements.
```

**Solution:** Optimize system to meet SLA requirements.

## Performance Characteristics

- **Time Complexity**: O(n) where n = iterations
- **Target Duration**: Variable (depends on iterations and concurrency)
- **Memory Usage**: ~512MB peak
- **Parallel Support**: Yes (concurrent requests)

## Statistical Metrics

### Mean (Average)
Average response time across all requests.

### Median (50th percentile)
Middle value when all response times are sorted.

### P95 (95th percentile)
95% of requests complete faster than this time.

### P99 (99th percentile)
99% of requests complete faster than this time.

### Standard Deviation
Measure of response time variance.

### Throughput
Number of requests processed per second.

## Best Practices

1. **Always warm up**: Use `--warmup` to eliminate JIT compilation effects
2. **Use realistic concurrency**: Match production traffic patterns
3. **Compare with baseline**: Track performance over time
4. **Run multiple times**: Average results across multiple runs
5. **Monitor resources**: Check CPU, memory, network during benchmarks
6. **Use representative data**: Test with realistic payloads and queries

## See Also

- `/aqe-chaos` - Chaos testing
- `/aqe-execute` - Execute tests
- `/aqe-analyze` - Analyze performance
- `/aqe-report` - Generate performance reports