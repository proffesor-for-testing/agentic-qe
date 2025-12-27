# Benchmark Suite Strategy

**Version**: 1.0.0
**Date**: 2025-12-12
**Status**: Design Phase
**Baseline**: v2.3.5

## Executive Summary

This document defines the automated benchmark suite for the Agentic QE Fleet, designed to prevent performance regressions and maintain quality standards across releases. The suite uses **tinybench** for accurate performance measurement, establishes baseline metrics from v2.3.5, and enforces a **10% regression threshold** in CI/CD pipelines.

**Key Goals**:
- Detect performance regressions automatically in CI
- Establish reproducible baseline metrics
- Provide statistical confidence in performance measurements
- Visualize performance trends across releases
- Prevent degradation in critical paths

## 1. Benchmark Targets

### 1.1 Critical Path Performance Metrics

The following targets represent the most performance-sensitive operations in the AQE Fleet:

| Target | Description | Current Baseline (v2.3.5) | Target | P95 | P99 | Regression Threshold |
|--------|-------------|---------------------------|--------|-----|-----|----------------------|
| **agent:spawn** | Agent spawning latency | 80ms | <100ms | <120ms | <150ms | 88ms (10% above baseline) |
| **pattern:match** | Pattern matching via AgentDB | 32ms | <50ms | <40ms | <50ms | 35.2ms (10% above baseline) |
| **memory:query** | Memory store query time | 8ms | <10ms | <12ms | <15ms | 8.8ms (10% above baseline) |
| **learning:iteration** | Q-value update cycle | 68ms | <100ms | <85ms | <100ms | 74.8ms (10% above baseline) |
| **cache:load** | Binary cache loading | N/A | <5ms | <8ms | <10ms | 5.5ms (10% above baseline) |
| **test:discovery** | Test discovery via analysis | 500ms | <600ms | <700ms | <800ms | 550ms (10% above baseline) |

### 1.2 Throughput Metrics

| Target | Description | Current Baseline | Target | Regression Threshold |
|--------|-------------|------------------|--------|----------------------|
| **pattern:qps** | Pattern searches per second | ~185 QPS | >150 QPS | 166.5 QPS (10% below baseline) |
| **test:generation** | Tests generated per minute | ~1000 tests/min | >800 tests/min | 900 tests/min (10% below baseline) |
| **event:write** | Visualization events per second | 185/sec | >100/sec | 166.5/sec (10% below baseline) |

### 1.3 Resource Metrics

| Target | Description | Current Baseline | Target | Regression Threshold |
|--------|-------------|------------------|--------|----------------------|
| **agent:memory** | Memory per agent instance | 85MB | <100MB | 93.5MB (10% above baseline) |
| **learning:memory** | Learning engine memory footprint | <100KB | <200KB | 110KB (10% above baseline) |
| **pool:utilization** | Memory pool utilization rate | ~50% | 30-70% | >80% (inefficient) |

### 1.4 Complexity Verification

| Target | Description | Current Baseline | Expected Complexity | Verification |
|--------|-------------|------------------|---------------------|--------------|
| **sublinear:test-selector** | Test selection algorithm | R²=0.85 | O(log n) | R² > 0.7, sublinear growth |
| **sublinear:coverage** | Coverage optimization | R²=0.82 | O(log n) | R² > 0.7, sublinear growth |
| **sublinear:matrix-solver** | Matrix solver performance | R²=0.79 | O(log n) | R² > 0.7, sublinear growth |
| **sublinear:temporal** | Temporal prediction | R²=0.88 | O(log n) | R² > 0.7, sublinear growth |

## 2. Baseline Collection Strategy

### 2.1 Baseline Establishment Process

1. **Environment Standardization**
   - Use GitHub Actions `ubuntu-latest` runner
   - Node.js 20.x
   - 2 CPU cores, 7GB RAM (standard GitHub runner)
   - Clean environment (no cached data)

2. **Measurement Methodology**
   - Each benchmark runs for minimum **5 seconds** (tinybench default)
   - Warmup phase: 5 iterations before measurement
   - Statistical analysis: Mean, Median, P95, P99, Standard Deviation
   - Outlier removal: Remove measurements >3σ from mean

3. **Baseline Collection Schedule**
   - **Major releases**: New baseline established
   - **Minor releases**: Compare against current major version baseline
   - **Patch releases**: Compare against minor version baseline
   - **Pre-release**: Compare against previous stable release

4. **Baseline Storage**
   - Format: JSON
   - Location: `/benchmarks/baselines/vX.X.X.json`
   - Version control: Committed to repository
   - Metadata: Environment, date, commit SHA, Node version

### 2.2 Baseline Data Structure

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
      "unit": "ms",
      "samples": 150
    },
    "pattern:match": {
      "mean": 32.1,
      "median": 31.5,
      "p95": 38.2,
      "p99": 45.8,
      "stdDev": 4.5,
      "unit": "ms",
      "samples": 200
    }
  }
}
```

## 3. Regression Threshold Definition

### 3.1 Threshold Rules

**Primary Rule**: **10% performance degradation** from baseline triggers CI failure

**Calculation**:
```
Regression Threshold = Baseline Mean × 1.10 (for latency metrics)
Regression Threshold = Baseline Mean × 0.90 (for throughput metrics)
```

**Example**:
- Baseline: `agent:spawn = 80ms`
- Threshold: `80ms × 1.10 = 88ms`
- CI fails if: `Current Mean > 88ms`

### 3.2 Statistical Confidence

To avoid false positives from noise:

1. **Multiple Samples**: Minimum 100 samples per benchmark
2. **Statistical Test**: Two-sample t-test comparing current vs baseline
3. **Confidence Level**: 95% confidence (p-value < 0.05)
4. **Threshold Application**: Regression only if:
   - Mean exceeds threshold AND
   - Statistical test shows significant difference

### 3.3 Threshold Exceptions

Some benchmarks may require custom thresholds:

| Benchmark | Custom Threshold | Reason |
|-----------|------------------|--------|
| **first:agent:spawn** | 20% (96ms) | First spawn includes initialization overhead |
| **cache:cold-start** | 30% (6.5ms) | Cold cache has expected variance |
| **learning:first-iteration** | 15% (78.2ms) | First iteration includes model loading |

### 3.4 Warning vs Failure

- **Warning**: 5-10% regression (informational, doesn't fail CI)
- **Failure**: >10% regression (fails CI, blocks merge)

## 4. Statistical Analysis Approach

### 4.1 Metrics Collected

For each benchmark run:

1. **Central Tendency**
   - Mean: Average of all samples
   - Median: Middle value (resistant to outliers)
   - Mode: Most common value (for discrete metrics)

2. **Spread**
   - Standard Deviation: Measure of variance
   - Interquartile Range (IQR): Middle 50% of data
   - Range: Min to Max

3. **Percentiles**
   - P50 (Median): 50th percentile
   - P95: 95% of samples faster than this
   - P99: 99% of samples faster than this
   - P99.9: Maximum realistic latency

4. **Statistical Tests**
   - Two-sample t-test: Compare current vs baseline
   - Effect size (Cohen's d): Magnitude of difference
   - Confidence intervals: 95% CI for mean

### 4.2 Outlier Detection

Using **Tukey's Fences** method:

```
Q1 = 25th percentile
Q3 = 75th percentile
IQR = Q3 - Q1

Lower Fence = Q1 - 1.5 × IQR
Upper Fence = Q3 + 1.5 × IQR

Outliers: Any value < Lower Fence OR > Upper Fence
```

Outliers are **removed** before calculating final statistics.

### 4.3 Regression Detection Algorithm

```typescript
function detectRegression(current: BenchmarkResult, baseline: BenchmarkResult): RegressionStatus {
  // 1. Calculate threshold
  const threshold = baseline.mean * 1.10; // 10% regression for latency

  // 2. Check if mean exceeds threshold
  if (current.mean <= threshold) {
    return { status: 'pass', regression: false };
  }

  // 3. Perform statistical test
  const tTest = performTTest(current.samples, baseline.samples);

  // 4. Check statistical significance
  if (tTest.pValue < 0.05 && tTest.effectSize > 0.3) {
    const regressionPercent = ((current.mean - baseline.mean) / baseline.mean) * 100;

    if (regressionPercent > 10) {
      return {
        status: 'fail',
        regression: true,
        regressionPercent,
        message: `Performance regression of ${regressionPercent.toFixed(1)}% detected`
      };
    } else if (regressionPercent > 5) {
      return {
        status: 'warning',
        regression: true,
        regressionPercent,
        message: `Minor performance regression of ${regressionPercent.toFixed(1)}%`
      };
    }
  }

  return { status: 'pass', regression: false };
}
```

## 5. CI Integration Strategy

### 5.1 GitHub Actions Workflow

**New Workflow**: `.github/workflows/performance-benchmarks.yml`

**Trigger Events**:
- Push to `main` (record baseline)
- Pull requests to `main` (regression check)
- Scheduled: Weekly (trend monitoring)
- Manual dispatch (on-demand)

**Execution Strategy**:
```yaml
jobs:
  benchmark:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - Checkout code
      - Setup Node.js 20
      - Install dependencies (npm ci)
      - Build project
      - Run benchmark suite
      - Compare against baseline
      - Upload results as artifacts
      - Comment on PR with results
      - Fail if regression detected
```

### 5.2 Benchmark Execution Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. Load Baseline (from benchmarks/baselines/)      │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 2. Run Benchmark Suite (5-10 minutes)              │
│    - agent:spawn (100+ samples)                     │
│    - pattern:match (100+ samples)                   │
│    - memory:query (100+ samples)                    │
│    - learning:iteration (100+ samples)              │
│    - cache:load (100+ samples)                      │
│    - test:discovery (50+ samples)                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 3. Statistical Analysis                             │
│    - Calculate mean, median, P95, P99               │
│    - Remove outliers                                │
│    - Perform t-test vs baseline                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 4. Regression Detection                             │
│    - Compare vs 10% threshold                       │
│    - Check statistical significance                 │
│    - Classify: pass/warning/fail                    │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 5. Generate Report & Artifacts                      │
│    - JSON results                                   │
│    - Markdown summary                               │
│    - Performance charts (PNG)                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 6. PR Comment with Results                          │
│    - Summary table                                  │
│    - Regression warnings/failures                   │
│    - Links to artifacts                             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 7. Exit with Status Code                            │
│    - 0 (success): No regressions                    │
│    - 1 (failure): >10% regression detected          │
└─────────────────────────────────────────────────────┘
```

### 5.3 Integration with Existing CI

**Position in CI Pipeline**:
- **After**: Build, unit tests, integration tests
- **Before**: Coverage analysis, release tagging
- **Parallel to**: Infrastructure tests (non-blocking)

**Failure Handling**:
- **PR workflow**: Block merge if regression detected
- **Main workflow**: Create GitHub issue, notify team
- **Release workflow**: Mandatory pass before tagging

### 5.4 Performance Budget

To prevent CI timeout (current budget: 15 minutes):

| Benchmark Category | Time Budget | Samples |
|--------------------|-------------|---------|
| Agent operations | 3 minutes | 150 |
| Pattern matching | 2 minutes | 200 |
| Learning engine | 2 minutes | 150 |
| Memory operations | 1 minute | 200 |
| Cache operations | 1 minute | 200 |
| Test discovery | 2 minutes | 50 |
| Sublinear verification | 3 minutes | 100 |
| **Total** | **14 minutes** | **1050** |

Remaining 1 minute: Analysis, reporting, artifact upload

## 6. Result Visualization Approach

### 6.1 Visualization Outputs

#### 6.1.1 PR Comment (Markdown)

**Example**:
```markdown
## Performance Benchmark Results

**Status**: ✅ No regressions detected
**Baseline**: v2.3.5 (87273ca3)
**Commit**: abc1234
**Duration**: 13m 45s

### Summary

| Metric | Baseline | Current | Change | Status |
|--------|----------|---------|--------|--------|
| agent:spawn | 80ms | 82ms | +2.5% | ✅ |
| pattern:match | 32ms | 30ms | -6.3% | ✅ ⚡ (improved) |
| memory:query | 8ms | 9ms | +12.5% | ⚠️ Warning |
| learning:iteration | 68ms | 67ms | -1.5% | ✅ |
| test:discovery | 500ms | 485ms | -3.0% | ✅ ⚡ (improved) |

### Details

#### ⚠️ Warning: memory:query
- **Baseline**: 8ms (mean), 12ms (p95)
- **Current**: 9ms (mean), 13.5ms (p95)
- **Regression**: 12.5% (above 10% threshold)
- **Statistical significance**: p=0.03 (significant)
- **Recommendation**: Review memory query optimizations

#### ⚡ Improvements
- **pattern:match**: 6.3% faster (32ms → 30ms)
- **test:discovery**: 3.0% faster (500ms → 485ms)

[View detailed results](artifacts/benchmark-results.json) | [View charts](artifacts/charts/)
```

#### 6.1.2 JSON Results

Stored as CI artifact for historical tracking:

```json
{
  "version": "2.3.6-dev",
  "baseline": "2.3.5",
  "commit": "abc1234",
  "timestamp": "2025-12-12T10:30:00Z",
  "duration": 825000,
  "environment": {
    "node": "20.10.0",
    "platform": "linux",
    "arch": "x64"
  },
  "results": [
    {
      "benchmark": "agent:spawn",
      "mean": 82.0,
      "median": 81.5,
      "p95": 98.0,
      "p99": 125.0,
      "stdDev": 9.1,
      "samples": 150,
      "baseline": {
        "mean": 80.25,
        "median": 79.8,
        "p95": 95.5
      },
      "regression": {
        "detected": false,
        "percent": 2.5,
        "status": "pass",
        "tTest": {
          "pValue": 0.12,
          "significant": false
        }
      }
    }
  ],
  "summary": {
    "totalBenchmarks": 6,
    "passed": 5,
    "warnings": 1,
    "failed": 0,
    "improvements": 2
  }
}
```

#### 6.1.3 Performance Charts (PNG)

Generated charts (using `chartjs-node-canvas` or similar):

1. **Latency Comparison Chart**
   - Bar chart: Current vs Baseline
   - Color coding: Green (pass), Yellow (warning), Red (fail)
   - Error bars: ±1 standard deviation

2. **Percentile Distribution**
   - Line chart: P50, P95, P99 over time
   - Historical trend (last 10 runs)

3. **Regression Heatmap**
   - Color-coded grid: All benchmarks × All metrics
   - Quick visual scan for problem areas

### 6.2 Historical Tracking

**Storage Strategy**:
- CI artifacts: 30-day retention
- Git repository: `benchmarks/history/YYYY-MM/results-COMMIT.json`
- External (optional): PostgreSQL/TimescaleDB for long-term trends

**Trend Analysis**:
- Weekly summary: Average performance across week
- Release-to-release: Compare major/minor version performance
- Anomaly detection: Flag unusual spikes/drops

### 6.3 Dashboard (Future Enhancement)

**Potential Implementation**:
- GitHub Pages dashboard
- Real-time charts from CI artifacts
- Drill-down by benchmark, commit, date range
- Comparison view: Any two commits/versions

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- ✅ Design benchmark strategy (this document)
- Create baseline JSON from v2.3.5 metrics
- Implement benchmark suite structure
- Add tinybench dependency

### Phase 2: Core Benchmarks (Week 2)
- Implement agent:spawn benchmark
- Implement pattern:match benchmark
- Implement memory:query benchmark
- Implement learning:iteration benchmark
- Implement cache:load benchmark
- Implement test:discovery benchmark

### Phase 3: Statistical Analysis (Week 3)
- Implement outlier detection
- Implement t-test comparison
- Implement regression detection algorithm
- Implement result formatting (JSON + Markdown)

### Phase 4: CI Integration (Week 4)
- Create GitHub Actions workflow
- Implement PR comment generation
- Implement artifact upload
- Test regression detection with synthetic data

### Phase 5: Visualization (Week 5)
- Generate performance charts
- Create historical tracking
- Implement trend analysis
- Document usage and interpretation

## 8. Usage Guide

### 8.1 Running Benchmarks Locally

```bash
# Run complete benchmark suite
npm run benchmark

# Run specific benchmark
npm run benchmark -- --filter="agent:spawn"

# Compare against specific baseline
npm run benchmark -- --baseline=v2.3.4

# Output results to file
npm run benchmark -- --output=results.json

# Generate charts
npm run benchmark -- --charts
```

### 8.2 Interpreting Results

**Understanding the Output**:

1. **Mean**: Average performance (primary comparison metric)
2. **P95**: 95% of requests faster than this (realistic worst-case)
3. **P99**: 99% of requests faster than this (tail latency)
4. **StdDev**: Lower is better (more consistent performance)

**When to Investigate**:
- Mean regression > 5% (even if not failing)
- P95/P99 regression > 15% (tail latency degradation)
- StdDev increase > 30% (performance instability)

### 8.3 Updating Baselines

**When to update**:
- Major version release (e.g., 2.3.5 → 2.4.0)
- After intentional performance optimization
- After architecture change that affects benchmarks

**How to update**:
```bash
# Run benchmarks and save as new baseline
npm run benchmark -- --save-baseline=v2.4.0

# Commit new baseline
git add benchmarks/baselines/v2.4.0.json
git commit -m "chore(benchmark): add baseline for v2.4.0"
```

## 9. Maintenance and Evolution

### 9.1 Benchmark Review Schedule

- **Quarterly**: Review benchmark relevance and thresholds
- **Per Release**: Update baselines for major versions
- **As Needed**: Add benchmarks for new critical paths

### 9.2 Threshold Tuning

If benchmarks frequently fail/pass incorrectly:

1. Analyze false positive rate over 10 runs
2. Consider adjusting threshold (e.g., 10% → 12%)
3. Review statistical test parameters
4. Check for environmental variance

### 9.3 Adding New Benchmarks

**Criteria for new benchmark**:
- Critical user-facing operation
- Performance-sensitive code path
- Frequent regression risk
- Clear baseline can be established

**Process**:
1. Define target metric and threshold
2. Implement benchmark in `/benchmarks/suite.ts`
3. Run 10+ times to establish baseline
4. Add to baseline JSON
5. Update this document

## 10. Success Criteria

This benchmark suite is successful if:

1. **Regression Prevention**: No performance regressions slip into production (100% detection rate)
2. **False Positive Rate**: <5% false positives (failed benchmarks that weren't real regressions)
3. **CI Performance**: Benchmark suite completes in <15 minutes
4. **Adoption**: Developers use benchmarks locally before submitting PRs
5. **Coverage**: All critical paths (defined in Section 1) are benchmarked

## 11. Related Documents

- [Performance Benchmarks](../PERFORMANCE.md) - Current performance metrics
- [CI/CD Pipeline](.github/workflows/optimized-ci.yml) - Existing CI configuration
- [Release Verification](../docs/policies/release-verification.md) - Release process

---

**Document Prepared By**: Performance Optimization Team
**Review Schedule**: Quarterly
**Next Review**: 2025-03-12
