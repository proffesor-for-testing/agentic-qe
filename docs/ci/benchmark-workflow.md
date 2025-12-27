# CI Benchmark Workflow Documentation

## Overview

The CI benchmark workflow provides automated performance regression detection for every pull request and main branch push. It compares current performance against established baselines and alerts developers when regressions exceed acceptable thresholds.

## Table of Contents

- [Architecture](#architecture)
- [Workflow Triggers](#workflow-triggers)
- [Benchmark Process](#benchmark-process)
- [Regression Detection](#regression-detection)
- [Thresholds](#thresholds)
- [Baseline Management](#baseline-management)
- [Local Development](#local-development)
- [Troubleshooting](#troubleshooting)

## Architecture

### Components

```
.github/workflows/benchmark.yml     # Main CI workflow
scripts/run-benchmarks.sh           # Local execution script
benchmarks/suite.ts                 # Benchmark suite implementation
benchmarks/baselines/               # Historical baseline data
```

### Workflow Jobs

1. **benchmark**: Executes performance benchmarks with baseline comparison
2. **baseline-comparison**: Compares against multiple historical baselines
3. **update-baseline**: Updates baseline on main branch merges

## Workflow Triggers

### Automatic Triggers

```yaml
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
```

The workflow automatically runs on:
- Every push to `main` or `develop` branches
- Every pull request targeting `main` or `develop`

### Manual Triggers

```yaml
workflow_dispatch:
  inputs:
    baseline:
      description: 'Baseline version to compare against'
      default: 'v2.3.5'
```

You can manually trigger the workflow from GitHub Actions UI with a custom baseline version.

## Benchmark Process

### Step 1: Environment Setup

```bash
# Node.js 20 with npm caching
node-version: '20'
cache: 'npm'

# Install dependencies
npm ci

# Build project
npm run build
```

### Step 2: Baseline Download

The workflow checks for the specified baseline file:

```bash
# Default baseline
BASELINE_VERSION="v2.3.5"

# Check if baseline exists
if [ -f "benchmarks/baselines/${BASELINE_VERSION}.json" ]; then
  echo "baseline_found=true"
fi
```

### Step 3: Benchmark Execution

```bash
# Run with baseline comparison
npx tsx benchmarks/suite.ts \
  --baseline="${BASELINE_VERSION}" \
  --output=benchmark-results/current.json

# Memory limits
NODE_OPTIONS='--max-old-space-size=2048'
```

### Step 4: Results Analysis

The benchmark suite generates:
- JSON results file with detailed metrics
- Comparison against baseline
- Regression detection report
- Performance summary

## Regression Detection

### Algorithm

The benchmark suite uses statistical analysis to detect regressions:

```typescript
// Calculate regression percentage
const regressionPercent = ((current.mean - baseline.mean) / baseline.mean) * 100;

// Apply thresholds
if (regressionPercent > 10) {
  return { status: 'fail', message: 'Major regression detected' };
} else if (regressionPercent > 5) {
  return { status: 'warning', message: 'Minor regression detected' };
}
```

### Outlier Removal

Uses Tukey's fences method to remove statistical outliers:

```typescript
const q1 = percentile(sorted, 25);
const q3 = percentile(sorted, 75);
const iqr = q3 - q1;

const lowerFence = q1 - 1.5 * iqr;
const upperFence = q3 + 1.5 * iqr;

// Filter outliers
return samples.filter(s => s >= lowerFence && s <= upperFence);
```

## Thresholds

### Warning Threshold: 5%

- **Status**: ⚠️ Warning
- **Action**: Comment on PR with warning
- **CI Result**: Pass (with warning)
- **Use Case**: Minor performance degradation that should be investigated

### Failure Threshold: 10%

- **Status**: ❌ Fail
- **Action**: Fail CI check
- **CI Result**: Failure
- **Use Case**: Significant regression that must be addressed before merge

### Improvement: > 5%

- **Status**: ✅ Improvement
- **Action**: Comment on PR with improvement notice
- **CI Result**: Pass
- **Use Case**: Performance optimization detection

## Baseline Management

### Baseline Storage

Baselines are stored in `benchmarks/baselines/` with version-based naming:

```
benchmarks/baselines/
├── v2.3.5.json      # Current baseline
├── v2.3.4.json      # Previous version
├── v2.3.3.json      # Older version
└── ...
```

### Baseline Format

```json
{
  "version": "v2.3.5",
  "date": "2025-12-12T10:00:00.000Z",
  "commit": "abc123",
  "environment": {
    "node": "v20.11.0",
    "platform": "linux",
    "arch": "x64",
    "cpus": 4,
    "memory": "16GB"
  },
  "benchmarks": {
    "agent:spawn": {
      "name": "agent:spawn",
      "mean": 45.23,
      "median": 44.18,
      "p95": 52.67,
      "p99": 58.12,
      "stdDev": 3.45,
      "min": 38.92,
      "max": 61.34,
      "samples": 100,
      "unit": "ms"
    }
  }
}
```

### Automatic Baseline Updates

When code is merged to `main`, the workflow automatically:

1. Downloads latest benchmark results
2. Copies results to `benchmarks/baselines/v{VERSION}.json`
3. Commits and pushes the new baseline
4. Cleans up old baselines (keeps last 10)

```bash
# Update baseline script
VERSION=$(cat package.json | jq -r '.version')
cp benchmark-results/current.json benchmarks/baselines/v${VERSION}.json

# Keep only last 10 baselines
ls -t v*.json | tail -n +11 | xargs -r rm
```

## Local Development

### Running Benchmarks Locally

Use the provided script for local execution:

```bash
# Basic usage - run all benchmarks
./scripts/run-benchmarks.sh

# Compare with baseline
./scripts/run-benchmarks.sh --baseline=v2.3.5

# Run specific benchmark
./scripts/run-benchmarks.sh --filter=agent

# Multiple runs for stability
./scripts/run-benchmarks.sh --runs=5

# CI mode (strict settings)
./scripts/run-benchmarks.sh --ci --baseline=v2.3.5
```

### Available Options

| Option | Description | Example |
|--------|-------------|---------|
| `--baseline=VERSION` | Compare against baseline version | `--baseline=v2.3.5` |
| `--output=DIR` | Output directory for results | `--output=results` |
| `--filter=NAME` | Run specific benchmark | `--filter=agent` |
| `--runs=N` | Run N times and average | `--runs=5` |
| `--ci` | CI mode with strict settings | `--ci` |
| `--verbose` | Enable verbose output | `--verbose` |
| `--no-fail` | Don't fail on regression | `--no-fail` |
| `--help` | Show help message | `--help` |

### Example Workflows

#### Before PR Submission

```bash
# Run comprehensive benchmarks
./scripts/run-benchmarks.sh --baseline=v2.3.5 --runs=3

# Check specific area of concern
./scripts/run-benchmarks.sh --filter=memory --baseline=v2.3.5
```

#### Performance Optimization

```bash
# Run multiple times for stability
./scripts/run-benchmarks.sh --runs=10 --verbose

# Compare before/after optimization
./scripts/run-benchmarks.sh --baseline=v2.3.5 --no-fail
```

## Troubleshooting

### Benchmark Failures

#### Issue: Out of Memory

```bash
# Error: JavaScript heap out of memory
```

**Solution**: The workflow uses `--max-old-space-size=2048` by default. If this fails:

1. Check for memory leaks in benchmark code
2. Reduce concurrent operations
3. Increase memory limit in workflow (max 4096 for ubuntu-latest)

#### Issue: Baseline Not Found

```bash
# Warning: Baseline v2.3.5 not found
```

**Solution**:
1. Check that baseline file exists: `benchmarks/baselines/v2.3.5.json`
2. Create baseline by running benchmarks on baseline version
3. Commit baseline file to repository

#### Issue: Flaky Benchmarks

**Symptoms**: Inconsistent results across runs

**Solution**:
1. Increase warmup iterations in `benchmarks/suite.ts`
2. Increase sample size
3. Use `--runs=5` for local testing
4. Check for system-level interference (background processes)

### PR Comments Not Appearing

#### Issue: No benchmark comment on PR

**Checklist**:
1. Verify workflow permissions: `pull-requests: write`
2. Check GitHub Actions logs for API errors
3. Ensure workflow completed successfully
4. Check that PR is from same repository (not fork)

### Baseline Updates Not Committing

#### Issue: Baseline updates not pushed to main

**Checklist**:
1. Verify workflow runs on `main` branch push
2. Check git configuration in workflow
3. Ensure no conflicting `.gitignore` rules
4. Verify GitHub token has push permissions

## Benchmark Suite Details

### Registered Benchmarks

| Benchmark | Description | Target Time |
|-----------|-------------|-------------|
| `agent:spawn` | Agent initialization and spawning | < 50ms |
| `pattern:match` | Pattern matching with AgentDB | < 100ms |
| `memory:query` | HNSW vector memory queries | < 30ms |
| `learning:iteration` | Q-learning update cycle | < 20ms |
| `cache:load` | Binary cache operations | < 10ms |
| `test:discovery` | Test file discovery | < 200ms |

### Statistical Metrics

For each benchmark, the following metrics are calculated:

- **Mean**: Average execution time
- **Median**: Middle value (50th percentile)
- **P95**: 95th percentile (95% of runs faster than this)
- **P99**: 99th percentile (99% of runs faster than this)
- **StdDev**: Standard deviation (measure of variability)
- **Min**: Fastest execution time
- **Max**: Slowest execution time
- **Samples**: Number of samples after outlier removal

## Best Practices

### For Developers

1. **Run benchmarks before PR submission**
   ```bash
   ./scripts/run-benchmarks.sh --baseline=v2.3.5
   ```

2. **Investigate warnings early**
   - Don't ignore 5-10% degradations
   - They often indicate future problems

3. **Document performance changes**
   - Add comments explaining expected performance impacts
   - Link to related optimization work

4. **Test performance-critical changes thoroughly**
   ```bash
   ./scripts/run-benchmarks.sh --runs=10 --filter=your-area
   ```

### For Reviewers

1. **Check benchmark results in PR comments**
   - Review automatically posted results
   - Question regressions > 3%

2. **Request additional benchmarks if needed**
   - Suggest specific filters for concern areas
   - Ask for multiple runs for stability

3. **Approve only with acceptable performance**
   - < 5% degradation: Generally acceptable
   - 5-10%: Requires justification
   - > 10%: Should be rejected or fixed

## Integration with CI/CD

### Workflow Dependencies

The benchmark workflow integrates with:

```yaml
# Depends on:
- Build pipeline (requires compiled code)
- Test suite (shared infrastructure)

# Used by:
- Quality gate workflow
- Release workflow
- Performance monitoring dashboard
```

### Parallel Execution

The benchmark job runs in parallel with other CI jobs:

```yaml
jobs:
  fast-tests:
    # Runs concurrently
  benchmark:
    # Runs concurrently
  infrastructure-tests:
    # Runs concurrently
```

### Conditional Execution

```yaml
# Always run on PR
if: github.event_name == 'pull_request'

# Only update baseline on main
if: github.ref == 'refs/heads/main'
```

## Future Enhancements

### Planned Features

1. **Historical Trend Analysis**
   - Track performance over time
   - Identify gradual degradation

2. **Benchmark Visualization**
   - Dashboard with performance graphs
   - Regression trend charts

3. **Adaptive Thresholds**
   - Machine learning-based threshold adjustment
   - Context-aware regression detection

4. **Distributed Benchmarking**
   - Run across multiple platforms
   - Compare cross-platform performance

5. **Performance Budgets**
   - Set per-benchmark budgets
   - Fail on budget violations

## Related Documentation

- [Benchmark Suite Implementation](/workspaces/agentic-qe-cf/benchmarks/README.md)
- [Performance Testing Guide](/workspaces/agentic-qe-cf/docs/testing/performance.md)
- [CI/CD Pipeline Overview](/workspaces/agentic-qe-cf/docs/ci/pipeline-overview.md)

## Support

For issues or questions:
- GitHub Issues: https://github.com/proffesor-for-testing/agentic-qe/issues
- CI/CD Team: ci-team@example.com
- Performance Team: perf-team@example.com

---

**Last Updated**: 2025-12-12
**Workflow Version**: 1.0.0
**Document Status**: Active
