# Coverage Analysis Guide

Learn how to analyze test coverage, find gaps, and optimize your testing strategy with O(log n) algorithms.

## Overview

AQE's coverage analyzer uses AI and sublinear algorithms to:
- **Identify coverage gaps** in seconds, not minutes
- **Prioritize gaps** by risk and impact
- **Track trends** over time
- **Generate recommendations** automatically
- **Optimize testing strategy** with minimal effort

**Key Features:**
- O(log n) performance (analyze 100K LOC in ~5 seconds)
- Real-time gap detection during test execution
- AI-powered risk assessment
- Trend analysis and forecasting

## Basic Coverage Analysis

### Check Current Coverage

```bash
aqe analyze coverage
```

**Output:**
```
📊 Analyzing coverage...
🔍 Running sublinear coverage analysis...

📈 Coverage Analysis Results:
   Current Coverage: 93.5%
   Threshold: 95%
   Total Gaps: 12
   Critical Gaps: 3

✅ Coverage analysis completed successfully!
```

**What it analyzes:**
- Line coverage (which lines are executed)
- Branch coverage (which if/else paths are taken)
- Function coverage (which functions are called)
- Statement coverage (which statements execute)

### Detailed Coverage Report

```bash
aqe analyze coverage --format html --output coverage-report.html
```

Opens an interactive HTML report showing:
- File-by-file coverage breakdown
- Highlighted uncovered lines
- Branch coverage visualization
- Trend graphs

## Gap Identification

### Find Coverage Gaps

```bash
aqe analyze gaps
```

**Output:**
```
📊 Analyzing coverage gaps...
🔍 Using sublinear algorithms for O(log n) performance...

🎯 Top Coverage Gaps:

CRITICAL (3):
  1. src/services/auth.ts:45-60
     └─> Authentication flow - 15 uncovered lines
     └─> Risk: HIGH | Impact: HIGH | Complexity: 5

  2. src/services/payment.ts:120-135
     └─> Payment validation - 12 uncovered lines
     └─> Risk: HIGH | Impact: HIGH | Complexity: 4

  3. src/utils/validators.ts:78-85
     └─> Email validation - 8 uncovered lines
     └─> Risk: MEDIUM | Impact: HIGH | Complexity: 2

HIGH (5):
  4. src/api/users.ts:102-115 (error handling)
  5. src/services/notification.ts:45-58 (retry logic)
  ...

💡 Recommendations:
   1. Generate 5 tests for authentication flow
   2. Add boundary tests for payment validation
   3. Improve error handling coverage

✅ Found 12 gaps (3 critical, 5 high priority)
```

### Gap Analysis with Threshold

```bash
aqe analyze gaps --threshold 98
```

Finds gaps preventing you from reaching 98% coverage.

### Gap Analysis for Specific Path

```bash
aqe analyze gaps --path src/services
```

Analyzes only the `src/services` directory.

## Priority Ranking

### How Gaps Are Prioritized

AQE ranks gaps using multiple factors:

1. **Risk Level** - How likely is this code path to have bugs?
   - Critical: Authentication, payment, security
   - High: Data validation, error handling
   - Medium: Business logic
   - Low: Logging, formatting

2. **Impact** - What happens if this code fails?
   - High: Data loss, security breach, system crash
   - Medium: Feature degradation
   - Low: Cosmetic issues

3. **Complexity** - How complex is the uncovered code?
   - Based on cyclomatic complexity
   - Higher complexity = higher priority

4. **Change Frequency** - How often is this code modified?
   - Frequently changed code needs better tests

**Priority Formula:**
```
Priority = (Risk × 3) + (Impact × 2) + (Complexity × 1)
```

## Trend Analysis

### Analyze Coverage Trends

```bash
aqe analyze trends
```

**Output:**
```
📊 Coverage Trends (Last 7 Days):

   Date       Coverage   Change
   ─────────────────────────────
   Sep 24     91.2%      +0.0%
   Sep 25     92.1%      +0.9%
   Sep 26     92.5%      +0.4%
   Sep 27     93.0%      +0.5%
   Sep 28     93.2%      +0.2%
   Sep 29     93.5%      +0.3%
   Sep 30     93.5%      +0.0%

📈 Trend: Improving (+2.3% over 7 days)
🎯 Projected: 95% coverage in 4 days
💡 Velocity: +0.33% per day (average)
```

### Compare with Baseline

```bash
aqe analyze trends --baseline coverage-baseline.json --diff
```

**Output:**
```
📊 Coverage Comparison:

   Category      Baseline   Current    Change
   ────────────────────────────────────────────
   Total         91.2%      93.5%      +2.3%
   Lines         90.5%      93.0%      +2.5%
   Branches      89.8%      92.1%      +2.3%
   Functions     94.2%      96.8%      +2.6%

Improved:
  ✓ src/services/user.ts (+8.5%)
  ✓ src/utils/validators.ts (+12.3%)
  ✓ src/api/auth.ts (+5.8%)

Degraded:
  ✗ src/services/payment.ts (-2.1%)
```

## Risk Assessment

### Analyze Coverage Risk

```bash
aqe analyze risk
```

**Output:**
```
🎲 Coverage Risk Assessment:

Risk Score: 42/100 (Medium)

HIGH RISK AREAS (3):
  1. src/services/auth.ts
     └─> Coverage: 78%
     └─> Risk: Authentication bypass
     └─> Recommendation: Add security tests

  2. src/services/payment.ts
     └─> Coverage: 82%
     └─> Risk: Payment processing errors
     └─> Recommendation: Add integration tests

  3. src/utils/validators.ts
     └─> Coverage: 85%
     └─> Risk: Invalid data acceptance
     └─> Recommendation: Add property-based tests

MEDIUM RISK AREAS (8):
  4. src/api/users.ts (88% coverage)
  5. src/services/notification.ts (89% coverage)
  ...

💡 Recommendations:
   - Focus on high-risk areas first
   - Improve coverage to 95% to reduce risk score to 20/100
   - Add security and integration tests for critical paths
```

### Generate Risk Report

```bash
aqe analyze risk --format html --output risk-report.html
```

Creates comprehensive risk assessment report.

## Sublinear Algorithms

### Why O(log n) Matters

**Traditional Coverage Analysis:**
- Time: O(n) - linear with codebase size
- 10K LOC: ~30 seconds
- 100K LOC: ~5 minutes
- 1M LOC: ~50 minutes

**AQE Sublinear Analysis:**
- Time: O(log n) - logarithmic
- 10K LOC: ~0.5 seconds
- 100K LOC: ~5 seconds
- 1M LOC: ~30 seconds

**300x faster on large codebases!**

### Enable/Disable Sublinear

```bash
# Enabled by default (recommended)
aqe analyze coverage --sublinear

# Disable for debugging
aqe analyze coverage --no-sublinear
```

### How It Works

AQE uses:
1. **Sparse matrix representation** - Only stores covered/uncovered regions
2. **Binary search** - Finds gaps in O(log n) time
3. **Sampling** - Analyzes representative code sections
4. **Caching** - Reuses analysis for unchanged files

## Quality Analysis

### Analyze Test Quality

```bash
aqe analyze quality --path tests/
```

**Output:**
```
📊 Test Quality Analysis:

Overall Score: 78/100 (Good)

Metrics:
  ✓ Coverage: 93.5% (Excellent)
  ⚠ Flakiness: 3 flaky tests detected (Fair)
  ✓ Reliability: 98.3% pass rate (Excellent)
  ⚠ Execution time: 45s (Fair, target: <30s)

Flaky Tests (3):
  1. tests/integration/payment.test.ts:45
     └─> Flakiness: 15% (passes 85% of time)
     └─> Recommendation: Add explicit waits

  2. tests/e2e/checkout.test.ts:120
     └─> Flakiness: 8% (timing issues)
     └─> Recommendation: Stabilize test data

Issues Detected:
  - 5 tests with no assertions
  - 12 tests exceeding 10s execution time
  - 3 tests with random failures

💡 Recommendations:
   1. Fix or remove 3 flaky tests
   2. Add assertions to 5 tests
   3. Optimize 12 slow tests
```

## Practical Workflows

### Workflow 1: Achieve 95% Coverage

**Step 1: Check current coverage**
```bash
aqe analyze coverage
# Current: 88.5%
```

**Step 2: Find gaps**
```bash
aqe analyze gaps --threshold 95
# Shows gaps preventing 95% coverage
```

**Step 3: Generate tests for gaps**
```bash
# Generate tests for top 3 critical gaps
aqe generate src/services/auth.ts --coverage 95
aqe generate src/services/payment.ts --coverage 95
aqe generate src/utils/validators.ts --coverage 95
```

**Step 4: Run tests and verify**
```bash
aqe run --coverage
aqe analyze coverage
# Current: 95.2% ✅
```

### Workflow 2: Monitor Coverage in CI/CD

**Step 1: Collect baseline**
```bash
# After merging to main
aqe run --coverage
aqe analyze coverage --format json --output coverage-baseline.json
```

**Step 2: Check in CI**
```bash
# In CI pipeline
aqe run --coverage
aqe analyze coverage --baseline coverage-baseline.json --diff

# Fail if coverage decreased
if [ $? -ne 0 ]; then
  echo "❌ Coverage decreased!"
  exit 1
fi
```

**Step 3: Update baseline**
```bash
# After successful merge
cp coverage-current.json coverage-baseline.json
```

### Workflow 3: Improve Coverage Over Time

**Week 1: Establish baseline**
```bash
aqe analyze coverage
# Current: 80%
```

**Week 2: Focus on critical gaps**
```bash
aqe analyze gaps
# Generate tests for critical gaps
aqe generate <critical-files>
# New coverage: 85%
```

**Week 3: Address high-priority gaps**
```bash
aqe analyze gaps --threshold 90
aqe generate <high-priority-files>
# New coverage: 90%
```

**Week 4: Reach target**
```bash
aqe analyze gaps --threshold 95
aqe generate <remaining-gaps>
# New coverage: 95% ✅
```

## Output Formats

### Text (Console)

```bash
aqe analyze coverage --format text
```

Human-readable console output (default).

### JSON

```bash
aqe analyze coverage --format json --output coverage.json
```

**Example output:**
```json
{
  "coverage": {
    "total": { "pct": 93.5, "lines": 1250, "covered": 1169 },
    "files": {
      "src/services/user.ts": { "pct": 96.5 }
    }
  },
  "gaps": [
    {
      "file": "src/services/auth.ts",
      "lines": "45-60",
      "priority": "critical"
    }
  ]
}
```

### HTML

```bash
aqe analyze coverage --format html --output report.html
```

Interactive HTML report with:
- Coverage charts
- File browser
- Line highlighting
- Trend graphs

### Markdown

```bash
aqe analyze coverage --format markdown --output coverage.md
```

Markdown report for documentation.

## Troubleshooting

### No Coverage Data

**Problem:** Coverage shows 0% or not found

**Solutions:**
```bash
# Run tests with coverage first
aqe run --coverage

# Check coverage files generated
ls coverage/

# Re-analyze
aqe analyze coverage
```

### Coverage Below Threshold

**Problem:** Coverage below 95% threshold

**Solutions:**
```bash
# Find gaps
aqe analyze gaps --threshold 95

# Generate tests for gaps
aqe generate <files-with-gaps>

# Verify improvement
aqe run --coverage
aqe analyze coverage
```

### Analysis Too Slow

**Problem:** Analysis takes too long

**Solutions:**
```bash
# Ensure sublinear algorithms enabled (default)
aqe analyze coverage --sublinear

# Analyze specific path
aqe analyze coverage --path src/services

# Check for large node_modules coverage (exclude in config)
```

## Critical Path Analysis (NEW in v2.6.5+)

AQE now integrates **MinCut analysis** for intelligent coverage gap prioritization. This uses graph-theoretic algorithms to identify code paths that are structurally critical to your application.

### How It Works

```
Coverage Gaps → Build Dependency Graph → MinCut Analysis → Prioritized Gaps
```

1. **Dependency Graph**: Builds a graph of file dependencies (imports, calls, references)
2. **MinCut Algorithm**: Uses Stoer-Wagner to find minimum cuts - critical bottleneck code
3. **Criticality Scoring**: Assigns 0-1 scores based on structural importance
4. **Gap Prioritization**: Combines coverage gaps with criticality for smarter prioritization

### Enable Critical Path Analysis

```typescript
// In agent configuration
const agent = new CoverageAnalyzerAgent({
  enableCriticalPathAnalysis: true  // Enable MinCut-based prioritization
});

// Or via CLI
aqe analyze gaps --critical-paths
```

### Understanding Critical Path Results

```
📊 Critical Path Analysis Results:

🔥 CRITICAL PATHS (Bottleneck Code):
  1. src/core/auth/TokenValidator.ts
     └─> Criticality: 0.92 (cut 15 dependencies)
     └─> Coverage: 72%
     └─> Impact: HIGH - blocks 23 downstream modules

  2. src/services/DataProcessor.ts
     └─> Criticality: 0.85 (cut 12 dependencies)
     └─> Coverage: 68%
     └─> Impact: HIGH - core data pipeline

🎯 PRIORITIZED COVERAGE GAPS:
  Gap                          Coverage   Criticality   Priority
  ─────────────────────────────────────────────────────────────
  auth/TokenValidator.ts       72%        0.92          🔴 CRITICAL
  services/DataProcessor.ts    68%        0.85          🔴 CRITICAL
  api/UserController.ts        81%        0.45          🟡 HIGH
  utils/StringHelpers.ts       55%        0.12          🟢 LOW
```

### Programmatic API

```typescript
import { CriticalPathDetector } from 'agentic-qe/coverage';
import { MinCutAnalyzer, GraphAdapter } from 'agentic-qe/code-intelligence';

// Create detector
const detector = new CriticalPathDetector({
  minCutThreshold: 0.3,        // Min criticality to report
  maxBottlenecks: 10,          // Max bottleneck nodes to identify
  includeGraphMetrics: true    // Include graph statistics
});

// Build input from coverage data
const input = {
  nodes: [
    { id: 'auth.ts', filePath: 'src/auth.ts', coverage: 0.72 },
    { id: 'user.ts', filePath: 'src/user.ts', coverage: 0.95 },
    // ...
  ],
  edges: [
    { source: 'auth.ts', target: 'user.ts', weight: 0.8 },
    // ...
  ]
};

// Detect critical paths
const result = await detector.detectCriticalPaths(input);

console.log(`Found ${result.criticalPaths.length} critical paths`);
console.log(`Bottleneck nodes: ${result.bottlenecks.map(b => b.id).join(', ')}`);

// Get prioritized gaps (combines coverage + criticality)
const prioritizedGaps = await detector.getPrioritizedGaps(input);

for (const gap of prioritizedGaps) {
  console.log(`${gap.filePath}: ${gap.coverage}% coverage, ${gap.criticalityScore} criticality`);
}
```

### Use Cases

**1. Identify Structural Bottlenecks**
```typescript
// Find code that, if broken, would affect many modules
const bottlenecks = result.bottlenecks.filter(b => b.cutValue > 0.7);
// These files need the most testing attention
```

**2. Prioritize Test Generation**
```typescript
// Generate tests for highest criticality gaps first
const criticalGaps = prioritizedGaps.filter(g => g.criticalityScore > 0.5);
for (const gap of criticalGaps) {
  await generateTestsFor(gap.filePath);
}
```

**3. Architecture Health Check**
```typescript
// High criticality = potential single points of failure
if (result.graphMetrics.maxCutValue > 0.9) {
  console.warn('Architecture has critical bottleneck - consider refactoring');
}
```

### Performance

| Graph Size | Analysis Time | Memory |
|------------|---------------|--------|
| 50 files   | ~5ms          | ~2MB   |
| 500 files  | ~50ms         | ~15MB  |
| 2000 files | ~500ms        | ~60MB  |

### Related

- [MinCut Analysis Guide](./mincut-analysis.md) - Detailed MinCut algorithm documentation
- [Code Intelligence Quickstart](./code-intelligence-quickstart.md) - Full code understanding setup

## Best Practices

1. **Set realistic thresholds** - 95% is excellent, 100% is often unnecessary
2. **Focus on critical code** - Authentication, payments, data handling
3. **Monitor trends** - Track coverage over time, not just absolute numbers
4. **Use risk assessment** - Prioritize high-risk gaps
5. **Integrate with CI/CD** - Fail builds if coverage decreases
6. **Review regularly** - Weekly coverage reviews help maintain quality
7. **Enable critical path analysis** - Use MinCut to find structural bottlenecks (NEW)

## Next Steps

- **Generate missing tests** → [TEST-GENERATION.md](./TEST-GENERATION.md)
- **Set up quality gates** → [QUALITY-GATES.md](./QUALITY-GATES.md)
- **Optimize test suite** → See `aqe optimize` command

## Related Commands

```bash
aqe analyze --help       # Full command reference
aqe generate <file>      # Generate tests for gaps
aqe optimize suite       # Optimize test suite
aqe run --coverage       # Collect coverage data
```
