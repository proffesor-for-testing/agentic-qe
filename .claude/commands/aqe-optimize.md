---
name: aqe-optimize
description: Optimize test suites using sublinear algorithms to maximize coverage while minimizing test count and execution time
---

# AQE Optimize Test Suite

Optimize test suites using sublinear algorithms to maximize coverage while minimizing test count and execution time.

## Usage

```bash
aqe optimize <target> [options]
# or
/aqe-optimize <target> [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | string | **required** | Optimization target: suite, coverage, performance, flakiness |
| `--path` | path | `./tests` | Test suite path |
| `--algorithm` | string | `sublinear` | Algorithm: sublinear, genetic, greedy, heuristic |
| `--objective` | string | `coverage-per-test` | Objective: coverage-per-test, execution-time, reliability |
| `--budget` | number | - | Time/test budget constraint (seconds) |
| `--aggressive` | boolean | `false` | Aggressive optimization (may remove tests) |
| `--dry-run` | boolean | `false` | Preview optimization without applying |

## Examples

### Optimize Test Suite

```bash
aqe optimize suite --path tests/unit --algorithm sublinear
```

Optimizes test suite using sublinear algorithms for maximum efficiency.

### Maximize Coverage Efficiency

```bash
aqe optimize coverage --objective coverage-per-test --aggressive
```

Aggressively optimizes for maximum coverage per test ratio.

### Reduce Execution Time

```bash
aqe optimize performance --budget 300 --algorithm genetic
```

Optimizes to meet 300-second execution budget using genetic algorithm.

### Remove Flaky Tests

```bash
aqe optimize flakiness --dry-run
```

Identifies and previews removal of flaky tests without modifying suite.

### Multi-Objective Optimization

```bash
aqe optimize suite --objective coverage-per-test --budget 180
```

Optimizes for both coverage efficiency and time budget.

## Integration with Claude Code

### Spawning Optimizer Agent

```javascript
// Use Claude Code's Task tool to spawn the optimizer agent
Task("Optimize test suite for efficiency", `
  Perform comprehensive test suite optimization:
  - Use sublinear algorithms for O(log n) performance
  - Maximize coverage while minimizing test count
  - Target: Reduce execution time by 30%
  - Maintain 95% coverage threshold

  Store optimization results: aqe/optimization/results
  Coordinate with test executor to validate optimized suite.
`, "qe-coverage-analyzer")
```

### Coordinated Optimization Workflow

```javascript
// Optimize suite and validate results
[Single Message]:
  Task("Optimize test suite", "Use sublinear algorithms to reduce redundancy", "qe-coverage-analyzer")
  Task("Validate optimized suite", "Ensure coverage maintained after optimization", "qe-test-executor")

  TodoWrite({ todos: [
    {content: "Analyze test redundancy", status: "in_progress", activeForm: "Analyzing redundancy"},
    {content: "Apply sublinear optimization", status: "in_progress", activeForm: "Optimizing suite"},
    {content: "Validate optimized suite", status: "pending", activeForm: "Validating optimization"},
    {content: "Measure performance improvement", status: "pending", activeForm: "Measuring improvement"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-coverage-analyzer**: Main agent with optimization module

### Supporting Agents
- **qe-test-executor**: Validates optimized suite
- **qe-performance-tester**: Measures performance impact

### Coordination Flow

```
1. Pre-Task Hook
   ├─> Retrieve test suite metadata
   ├─> Retrieve coverage matrix
   ├─> Retrieve execution history
   └─> Load optimization parameters

2. Optimization Process
   ├─> Build test-coverage matrix
   ├─> Apply sublinear optimization algorithm
   ├─> Calculate minimal test set for target coverage
   ├─> Identify redundant tests
   └─> Generate optimized suite

3. Validation Phase
   ├─> Execute optimized suite
   ├─> Verify coverage maintained
   ├─> Measure performance improvement
   └─> Compare metrics before/after

4. Post-Task Hook
   ├─> Store optimization results
   ├─> Update test suite metadata
   ├─> Train neural patterns
   └─> Notify fleet of improvements
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve test suite metadata
npx claude-flow@alpha memory retrieve --key "aqe/test-suite/${suite}"

# Retrieve coverage matrix
npx claude-flow@alpha memory retrieve --key "aqe/coverage-matrix"

# Retrieve execution history
npx claude-flow@alpha memory retrieve --key "aqe/execution-history"
```

### Output Memory Keys

```bash
# Store optimization results
npx claude-flow@alpha memory store \
  --key "aqe/optimization/results" \
  --value '{"testsBefore": 120, "testsAfter": 85, "coverageDelta": 0.2}'

# Store optimized suite
npx claude-flow@alpha memory store \
  --key "aqe/optimized-suite" \
  --value '{"tests": ["test1.ts", "test2.ts"], "metadata": {}}'

# Store optimization metrics
npx claude-flow@alpha memory store \
  --key "aqe/optimization-metrics" \
  --value '{"timeSaved": 45, "testsRemoved": 35}'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task \
  --description "Optimize ${target} with ${algorithm}" \
  --agent "qe-coverage-analyzer"
```

### Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${OPT_ID}" \
  --results "${OPT_RESULTS}"
```

### Notify Fleet

```bash
npx claude-flow@alpha hooks notify \
  --message "Optimization: ${TEST_REDUCTION}% fewer tests, ${TIME_SAVED}s saved"
```

## Expected Outputs

### Success Output

```
⚡ Optimizing suite...
🧮 Running sublinear optimization algorithm...

📊 Optimization Results:
   Algorithm: sublinear
   Objective: coverage-per-test

   Tests Before: 120
   Tests After: 85
   Reduction: 29.2%

   Coverage Before: 93.5%
   Coverage After: 93.7%
   Delta: +0.2%

   Time Saved: 45s per run

✅ Optimization successful! Fewer tests with improved coverage.
```

### Dry-Run Output

```
🔍 Optimization Preview (Dry Run):

Would remove 35 tests:
  ✓ 15 redundant tests (duplicate coverage)
  ✓ 12 low-value tests (minimal coverage gain)
  ✓ 8 flaky tests (unreliable)

Projected outcome:
  • Tests: 120 → 85 (-29.2%)
  • Coverage: 93.5% → 93.7% (+0.2%)
  • Execution time: 180s → 135s (-25%)

Run without --dry-run to apply changes.
```

### Optimization Report

```json
{
  "optimizationId": "qe-opt-1727683200-12345",
  "algorithm": "sublinear",
  "objective": "coverage-per-test",
  "before": {
    "testCount": 120,
    "coverage": 93.5,
    "executionTime": 180,
    "redundantTests": 15
  },
  "after": {
    "testCount": 85,
    "coverage": 93.7,
    "executionTime": 135,
    "redundantTests": 0
  },
  "metrics": {
    "testReduction": 29.2,
    "coverageDelta": 0.2,
    "timeSaved": 45,
    "testsRemoved": [
      "tests/unit/duplicate-user-test.ts",
      "tests/unit/redundant-auth-test.ts"
    ]
  },
  "recommendations": [
    "Consider merging similar test cases",
    "Review remaining flaky tests",
    "Monitor coverage after optimization"
  ],
  "timestamp": "2025-09-30T10:15:00Z"
}
```

## Error Handling

### Optimization Would Reduce Coverage

```bash
⚠️  Warning: Optimization would reduce coverage by 2.5%
   Current: 95.0% → Optimized: 92.5%

💡 Options:
   1. Adjust optimization parameters
   2. Use less aggressive settings
   3. Set minimum coverage constraint
```

**Solution:** Use `--objective coverage-per-test` to prioritize coverage.

### No Redundant Tests Found

```bash
ℹ️  No optimization opportunities found
   Suite is already optimal

Metrics:
   • All tests provide unique coverage
   • No flaky tests detected
   • Execution time within budget
```

**Solution:** Suite is already optimized, no action needed.

### Time Budget Cannot Be Met

```bash
❌ Error: Cannot meet time budget of 60s
   Minimum execution time: 85s (with optimal suite)

💡 Suggestions:
   1. Increase budget to 90s
   2. Reduce test scope
   3. Improve test performance
```

**Solution:** Adjust budget or optimize individual test performance.

## Performance Characteristics

- **Time Complexity**: O(log n) using sublinear algorithms
- **Target Time**: <15s for 500 tests
- **Memory Usage**: ~512MB peak
- **Parallel Support**: Yes (analysis phase)

## Optimization Algorithms

### Sublinear (Default)
- **Complexity**: O(log n)
- **Best for**: Large test suites (>100 tests)
- **Approach**: Minimal set cover with logarithmic search

### Genetic
- **Complexity**: O(n × generations)
- **Best for**: Multi-objective optimization
- **Approach**: Evolutionary algorithm with fitness function

### Greedy
- **Complexity**: O(n²)
- **Best for**: Quick optimization
- **Approach**: Iterative test removal by coverage impact

### Heuristic
- **Complexity**: O(n)
- **Best for**: Simple redundancy removal
- **Approach**: Rule-based test filtering

## See Also

- `/aqe-analyze` - Analyze coverage gaps
- `/aqe-execute` - Execute optimized suite
- `/aqe-report` - Generate optimization reports
- `/aqe-benchmark` - Measure performance improvements