---
name: aqe-execute
description: Execute test suites with parallel orchestration, retry logic, and real-time reporting
---

# AQE Execute Tests

Execute test suites with parallel orchestration, retry logic, and real-time reporting.

## Usage

```bash
aqe run [suite] [options]
# or
/aqe-execute [suite] [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `suite` | path | `./tests` | Test suite path or pattern |
| `--framework` | string | `auto-detect` | Testing framework to use |
| `--parallel` | number | `auto` | Parallel worker count (auto = CPU cores) |
| `--coverage` | boolean | `true` | Collect coverage data |
| `--retry` | number | `2` | Retry count for flaky tests |
| `--timeout` | number | `30000` | Test timeout in milliseconds |
| `--bail` | boolean | `false` | Stop on first failure |
| `--watch` | boolean | `false` | Watch mode for continuous testing |
| `--reporter` | string | `default` | Reporter: default, json, html, junit |
| `--filter` | string | - | Test pattern filter (regex) |

## Examples

### Run All Tests

```bash
aqe run
```

Executes all tests in the default test directory with auto-detected framework.

### Run Specific Suite in Parallel

```bash
aqe run tests/integration --parallel 8 --coverage
```

Runs integration tests with 8 parallel workers and coverage collection.

### Watch Mode for TDD

```bash
aqe run tests/unit --watch --bail
```

Runs tests in watch mode, stopping on first failure for rapid TDD feedback.

### CI/CD Execution

```bash
aqe run --reporter junit --bail --no-coverage
```

Optimized for CI/CD with JUnit reporting and no coverage overhead.

### Filtered Test Execution

```bash
aqe run --filter "user.*test" --parallel 4
```

Runs only tests matching the regex pattern with parallel execution.

## Integration with Claude Code

### Spawning Test Executor Agent

```javascript
// Use Claude Code's Task tool to spawn the test executor agent
Task("Execute comprehensive test suite", `
  Run all tests with the following configuration:
  - Parallel workers: 8
  - Coverage: enabled
  - Retry flaky tests: 2 attempts
  - Reporter: JSON for CI integration

  Monitor real-time progress and report failures immediately.
  Store execution results in memory: aqe/execution/results/{run-id}
`, "qe-test-executor")
```

### Coordinated Execution Workflow

```javascript
// Execute tests and coordinate with analyzer
[Single Message]:
  Task("Execute test suite", "Run all unit tests with coverage", "qe-test-executor")
  Task("Analyze coverage", "Real-time coverage gap detection", "qe-coverage-analyzer")

  TodoWrite({ todos: [
    {content: "Execute all unit tests", status: "in_progress", activeForm: "Executing tests"},
    {content: "Monitor coverage in real-time", status: "in_progress", activeForm: "Monitoring coverage"},
    {content: "Analyze test failures", status: "pending", activeForm: "Analyzing failures"},
    {content: "Generate execution report", status: "pending", activeForm: "Generating report"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-test-executor**: Main agent responsible for test execution orchestration

### Supporting Agents
- **qe-coverage-analyzer**: Real-time coverage tracking
- **qe-performance-tester**: Performance monitoring during execution

### Coordination Flow

```
1. Pre-Task Hook
   ├─> Retrieve test suite metadata
   ├─> Retrieve flaky test data for retry logic
   ├─> Auto-detect framework if not specified
   └─> Calculate optimal worker count

2. Test Execution
   ├─> Spawn parallel workers
   ├─> Execute tests with real-time reporting
   ├─> Collect coverage data
   ├─> Retry flaky tests automatically
   └─> Track performance metrics

3. Post-Task Hook
   ├─> Store execution results
   ├─> Update coverage data
   ├─> Identify new flaky tests
   ├─> Train neural patterns
   └─> Notify fleet of completion
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve test suite metadata
npx ruflo@3.76.0 memory retrieve --key "aqe/test-suite/${suite}"

# Retrieve flaky test data
npx ruflo@3.76.0 memory retrieve --key "aqe/flaky-tests"

# Retrieve execution configuration
npx ruflo@3.76.0 memory retrieve --key "aqe/execution-config"
```

### Output Memory Keys

```bash
# Store execution results
npx ruflo@3.76.0 memory store \
  --key "aqe/execution/results/${run_id}" \
  --value '{"numTotalTests": 120, "numPassedTests": 118, "numFailedTests": 2}'

# Update current coverage
npx ruflo@3.76.0 memory store \
  --key "aqe/coverage/current" \
  --value '{"pct": 94.5}'

# Store test failures
npx ruflo@3.76.0 memory store \
  --key "aqe/test-failures" \
  --value '[{"test": "user-auth-test", "error": "timeout"}]'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx ruflo@3.76.0 hooks pre-task \
  --description "Execute test suite: ${suite}" \
  --agent "qe-test-executor"
```

### During Execution (real-time updates)

```bash
# Notify fleet of progress
npx ruflo@3.76.0 hooks notify \
  --message "Executing: ${TEST_FILE} (${CURRENT}/${TOTAL})"
```

### Post-Task Hook

```bash
npx ruflo@3.76.0 hooks post-task \
  --task-id "${RUN_ID}" \
  --results "${EXECUTION_RESULTS}"
```

## Expected Outputs

### Success Output

```
🧪 Executing test suite: ./tests
📦 Auto-detected framework: jest
⚡ Using 8 parallel workers
🚀 Starting test execution...

Running tests:
  ✓ tests/unit/user-service.test.ts (12 tests)
  ✓ tests/unit/auth-service.test.ts (8 tests)
  ✓ tests/integration/api.test.ts (15 tests)

📊 Execution Summary:
   Total: 120
   Passed: 120
   Failed: 0
   Coverage: 94.5%
   Duration: 12.3s

✅ All tests passed!
```

### Failure Output

```
🧪 Executing test suite: ./tests
🚀 Starting test execution...

Running tests:
  ✓ tests/unit/user-service.test.ts (12 tests)
  ✗ tests/unit/auth-service.test.ts (8 tests, 2 failed)
  ✓ tests/integration/api.test.ts (15 tests)

❌ Failed Tests:
   1. auth-service.test.ts:45 - Token validation fails
   2. auth-service.test.ts:78 - Session timeout not triggered

📊 Execution Summary:
   Total: 120
   Passed: 118
   Failed: 2
   Coverage: 93.2%
   Duration: 11.8s

⚠️  2 tests failed out of 120
```

### Metadata Output

```json
{
  "runId": "qe-exec-1727683200-12345",
  "numTotalTests": 120,
  "numPassedTests": 118,
  "numFailedTests": 2,
  "coverage": {
    "total": {
      "pct": 93.2,
      "lines": 1250,
      "covered": 1165
    }
  },
  "duration": 11800,
  "framework": "jest",
  "parallel": 8,
  "failedTests": [
    {
      "file": "tests/unit/auth-service.test.ts",
      "line": 45,
      "name": "Token validation",
      "error": "Expected true, received false"
    }
  ],
  "timestamp": "2025-09-30T10:05:00Z"
}
```

## Error Handling

### Test Suite Not Found

```bash
❌ Error: Test suite not found: tests/nonexistent
```

**Solution:** Verify the test suite path exists.

### Framework Not Available

```bash
⚠️  Warning: jest not installed
   Installing jest...
```

**Solution:** Framework will be auto-installed.

### Timeout Issues

```bash
⚠️  Warning: Test timeout (30000ms exceeded)
   Test: auth-service.test.ts:45
```

**Solution:** Increase timeout with `--timeout 60000` or optimize test.

## Performance Characteristics

- **Time Complexity**: O(n/p) where n=tests, p=parallel workers
- **Target Time**: <30s for 100 tests (with 8 workers)
- **Memory Usage**: ~1GB peak
- **Parallel Support**: Yes (scales with CPU cores)

## See Also

- `/aqe-generate` - Generate tests
- `/aqe-analyze` - Analyze coverage
- `/aqe-optimize` - Optimize test suite
- `/aqe-report` - Generate execution reports