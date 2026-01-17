# Benchmark Suite

Automated performance benchmarks for the Agentic QE Fleet with regression detection.

## Overview

This benchmark suite measures critical path performance and detects regressions automatically. It uses **tinybench** for accurate measurements and compares results against established baselines.

**Baseline Version**: v2.3.5
**Regression Threshold**: 10% degradation triggers CI failure

## Benchmarks

| Benchmark | Description | Target | Baseline (v2.3.5) |
|-----------|-------------|--------|-------------------|
| **agent:spawn** | Agent spawning latency | <100ms | 80ms (mean) |
| **pattern:match** | Pattern matching via AgentDB | <50ms | 32ms (mean) |
| **memory:query** | Memory store query time | <10ms | 8ms (mean) |
| **learning:iteration** | Q-value update cycle | <100ms | 68ms (mean) |
| **cache:load** | Binary cache loading | <5ms | 3.5ms (mean) |
| **test:discovery** | Test discovery via analysis | <600ms | 500ms (mean) |

## Usage

### Running Locally

```bash
# Install dependencies first
npm install

# Run all benchmarks
npm run benchmark

# Run specific benchmark
npm run benchmark -- --filter="agent:spawn"

# Compare against specific baseline
npm run benchmark -- --baseline=v2.3.4

# Save results to custom file
npm run benchmark -- --output=my-results.json
```

### Running in CI

Benchmarks run automatically in GitHub Actions on:
- Pull requests to `main` (regression check)
- Push to `main` (record new baseline)
- Weekly schedule (trend monitoring)

## Understanding Results

### Metrics Explained

- **Mean**: Average performance across all samples (primary comparison metric)
- **Median**: Middle value (resistant to outliers)
- **P95**: 95th percentile - 95% of samples faster than this
- **P99**: 99th percentile - realistic worst-case latency
- **StdDev**: Standard deviation - measures consistency (lower is better)

### Status Indicators

| Status | Icon | Meaning |
|--------|------|---------|
| **Pass** | ✅ | Within 10% of baseline |
| **Warning** | ⚠️ | 5-10% regression (informational) |
| **Fail** | ❌ | >10% regression (blocks CI) |

### Example Output

```
📊 Benchmark Results:

agent:spawn:
  Mean:   82.5ms
  Median: 81.2ms
  P95:    98.0ms
  P99:    125.0ms
  StdDev: 9.1ms
  Samples: 150

# Performance Benchmark Report

**Baseline**: v2.3.5
**Date**: 2025-12-12T10:30:00Z

## Summary

- ✅ Passed: 5
- ⚠️ Warnings: 1
- ❌ Failed: 0

## Results

| Benchmark | Baseline | Current | Change | Status |
|-----------|----------|---------|--------|--------|
| agent:spawn | 80.25ms | 82.50ms | +2.8% | ✅ |
| pattern:match | 32.10ms | 30.00ms | -6.5% | ✅ |
| memory:query | 8.00ms | 9.00ms | +12.5% | ⚠️ |
```

## Interpreting Results

### When to Investigate

Investigate performance changes if:

1. **Mean regression > 5%** (even if not failing)
   - Could indicate gradual degradation
   - Review recent changes

2. **P95/P99 regression > 15%**
   - Tail latency degradation
   - May impact user experience

3. **StdDev increase > 30%**
   - Performance instability
   - Inconsistent execution times

### Common Causes of Regressions

1. **Algorithm changes**: New logic with higher complexity
2. **Dependency updates**: Library performance changes
3. **Resource contention**: CI runner variance
4. **Data size growth**: Larger test datasets
5. **Memory pressure**: Increased allocations

## Baseline Management

### Current Baselines

- **v2.3.5** (current) - December 2025

### Updating Baselines

Baselines should be updated when:

1. **Major version release** (e.g., v2.4.0)
2. **After intentional optimizations** (document improvements)
3. **Architecture changes** that affect benchmarks

**Process**:

```bash
# Run benchmarks and save as new baseline
npm run benchmark -- --save-baseline=v2.4.0

# Verify results look correct
cat benchmarks/baselines/v2.4.0.json

# Commit new baseline
git add benchmarks/baselines/v2.4.0.json
git commit -m "chore(benchmark): add baseline for v2.4.0"
git push
```

### Baseline Structure

Each baseline JSON contains:

```json
{
  "version": "2.3.5",
  "date": "2025-12-12T00:00:00Z",
  "commit": "87273ca3",
  "environment": {
    "node": "20.10.0",
    "platform": "linux",
    "arch": "x64",
    "cpus": 2,
    "memory": "7GB"
  },
  "benchmarks": {
    "agent:spawn": {
      "mean": 80.25,
      "median": 79.8,
      "p95": 95.5,
      "p99": 120.3,
      "stdDev": 8.2,
      "samples": 150,
      "unit": "ms"
    }
  }
}
```

## Statistical Analysis

### Outlier Detection

Benchmarks use **Tukey's Fences** method to remove outliers:

```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1

Lower Fence = Q1 - 1.5 × IQR
Upper Fence = Q3 + 1.5 × IQR

Outliers: Any value < Lower Fence OR > Upper Fence
```

Outliers are automatically removed before calculating statistics.

### Regression Detection

Regression is detected when:

1. **Mean exceeds threshold** (10% above baseline)
2. **Statistical significance** (would be implemented with t-test)
3. **Consistent degradation** (not just noise)

## CI Integration

### GitHub Actions Workflow

Benchmark suite runs in CI with:

- **Timeout**: 15 minutes
- **Environment**: ubuntu-latest, Node.js 20
- **Trigger**: PR to main, push to main, weekly schedule
- **Artifacts**: Results JSON, performance charts

### CI Behavior

| Event | Action |
|-------|--------|
| **PR to main** | Run benchmarks, compare to baseline, comment on PR |
| **Push to main** | Run benchmarks, record results as artifact |
| **Weekly** | Run benchmarks, track trends, alert on degradation |

### Failure Handling

- **PR workflow**: Block merge if >10% regression
- **Main workflow**: Create GitHub issue if regression detected
- **Manual override**: Add `[skip-benchmark]` to commit message

## Adding New Benchmarks

To add a new benchmark:

1. **Define the metric** in `/benchmarks/suite.ts`

```typescript
this.bench.add('new:benchmark', async () => {
  // Your benchmark code here
  const result = await performOperation();
  return result;
});
```

2. **Establish baseline** by running 10+ times

```bash
npm run benchmark -- --filter="new:benchmark"
```

3. **Add to baseline JSON**

```json
"new:benchmark": {
  "mean": 50.0,
  "median": 48.5,
  "p95": 62.0,
  "p99": 75.0,
  "stdDev": 8.0,
  "samples": 150,
  "unit": "ms"
}
```

4. **Update documentation** (this README and benchmark-strategy.md)

## Troubleshooting

### Benchmark Fails Locally but Passes in CI

- **Cause**: Local environment differences (CPU, memory, background processes)
- **Solution**: Use CI results as source of truth, optimize for CI environment

### High Variance in Results

- **Cause**: System load, garbage collection, I/O contention
- **Solution**: Increase samples, run benchmarks in isolation, check for memory leaks

### Baseline Not Found

- **Cause**: Baseline file missing or wrong version specified
- **Solution**: Check `benchmarks/baselines/` directory, verify version format

### All Benchmarks Fail

- **Cause**: Build issues, dependency problems, environment misconfiguration
- **Solution**: Run `npm run build` first, check Node.js version, verify dependencies installed

## Related Documentation

- [Benchmark Strategy](../docs/design/benchmark-strategy.md) - Comprehensive design document
- [Performance Metrics](../docs/PERFORMANCE.md) - Current performance documentation
- [CI Pipeline](.github/workflows/optimized-ci.yml) - CI configuration

## Support

For questions or issues:

1. Check troubleshooting section above
2. Review benchmark strategy document
3. Create GitHub issue with benchmark results attached

---

**Last Updated**: 2025-12-12
**Baseline Version**: v2.3.5
