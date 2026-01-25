# Test Execution Guide

Master parallel test execution, retry logic, and real-time monitoring with AQE.

## Overview

AQE's test executor orchestrates your test suite with:
- **Parallel execution** - Run tests simultaneously across CPU cores
- **Smart retry logic** - Auto-retry flaky tests
- **Real-time reporting** - Live progress and coverage tracking
- **Framework agnostic** - Works with Jest, Mocha, Cypress, Playwright
- **CI/CD optimized** - Fast, reliable, automation-friendly

## Basic Execution

### Run All Tests

```bash
aqe run
```

**What happens:**
1. Auto-detects testing framework (Jest, Mocha, etc.)
2. Discovers all test files in `./tests`
3. Spawns parallel workers (based on CPU cores)
4. Executes tests with coverage collection
5. Reports results in real-time

**Output:**
```
🧪 Executing test suite: ./tests
📦 Auto-detected framework: jest
⚡ Using 8 parallel workers
🚀 Starting test execution...

Running tests:
  ✓ tests/unit/user-service.test.ts (12 tests, 2.3s)
  ✓ tests/unit/auth-service.test.ts (8 tests, 1.8s)
  ✓ tests/integration/api.test.ts (15 tests, 4.1s)

📊 Execution Summary:
   Total: 120
   Passed: 120
   Failed: 0
   Coverage: 94.5%
   Duration: 12.3s

✅ All tests passed!
```

### Run Specific Test Suite

```bash
aqe run tests/integration
```

Runs only tests in the `tests/integration` directory.

### Run Single Test File

```bash
aqe run tests/unit/user-service.test.ts
```

## Parallel Execution

### Auto-Scaling (Recommended)

```bash
aqe run --parallel auto
```

Automatically uses optimal worker count based on CPU cores.

### Fixed Worker Count

```bash
aqe run --parallel 4
```

Uses exactly 4 parallel workers.

**When to use:**
- **2-4 workers** - Limited CPU, small test suites
- **4-8 workers** - Standard development machines
- **8-16 workers** - CI/CD servers, large test suites
- **auto** - Let AQE decide (recommended)

### Performance Impact

**Example: 120 tests**

| Workers | Duration | Speedup |
|---------|----------|---------|
| 1       | 98s      | 1x      |
| 2       | 52s      | 1.9x    |
| 4       | 28s      | 3.5x    |
| 8       | 15s      | 6.5x    |

**Diminishing returns after 8 workers for most suites.**

## Retry Logic

### Auto-Retry Flaky Tests

```bash
aqe run --retry 2
```

**How it works:**
1. Test fails on first run
2. AQE automatically retries up to 2 more times
3. Marks test as flaky if it eventually passes
4. Records flaky test for future optimization

**Output with retries:**
```
Running tests:
  ✓ tests/unit/user-service.test.ts (12 tests)
  ⚠ tests/integration/payment.test.ts (5 tests, 1 flaky)
    └─> 'processPayment should handle timeout' passed on retry 2
```

### Disable Retries

```bash
aqe run --retry 0
```

Fail immediately on first test failure (useful for debugging).

## Coverage Collection

### Enable Coverage (Default)

```bash
aqe run --coverage
```

**Collects:**
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

**Output:**
```
📊 Coverage Report:
   Lines: 94.5% (1,260/1,334)
   Branches: 91.2% (420/461)
   Functions: 96.8% (122/126)
   Statements: 94.3% (1,248/1,324)

Coverage file: ./coverage/coverage-final.json
```

### Disable Coverage

```bash
aqe run --no-coverage
```

**Why disable?**
- Faster execution (30-50% speed improvement)
- Debugging test failures
- CI/CD optimization (when coverage not needed)

## Test Filtering

### Run Tests Matching Pattern

```bash
aqe run --filter "user.*test"
```

Runs only tests matching the regex pattern `user.*test`.

**Examples:**
```bash
# Run all user-related tests
aqe run --filter "user"

# Run only integration tests
aqe run --filter "integration"

# Run specific test suite
aqe run --filter "payment.*integration"
```

## Watch Mode (TDD)

### Enable Watch Mode

```bash
aqe run --watch
```

**What happens:**
1. Runs tests initially
2. Watches for file changes
3. Re-runs affected tests automatically
4. Shows instant feedback

**Perfect for Test-Driven Development (TDD):**
```
🔍 Watch mode active...
Watching for changes...

[File changed: src/services/user-service.ts]
Re-running affected tests...
  ✓ tests/unit/user-service.test.ts (12 tests, 1.2s)

[File changed: tests/unit/user-service.test.ts]
Re-running tests...
  ✗ tests/unit/user-service.test.ts (12 tests, 1 failed)
    └─> 'createUser should validate email' failed

Press Ctrl+C to exit
```

### Watch Mode with Bail

```bash
aqe run --watch --bail
```

Stops on first failure in watch mode (faster feedback).

## CI/CD Integration

### Optimized for CI

```bash
aqe run --reporter junit --bail --parallel 8
```

**CI/CD best practices:**
- Use JUnit reporter for pipeline integration
- Enable bail for fast failure feedback
- Disable coverage if not needed (faster)
- Use fixed parallel count (predictable)

**Example GitHub Actions:**
```yaml
- name: Run Tests
  run: |
    aqe run --reporter junit --bail --parallel 8
```

**Example GitLab CI:**
```yaml
test:
  script:
    - aqe run --reporter junit --bail
  artifacts:
    reports:
      junit: test-results/junit.xml
```

## Framework-Specific Execution

### Jest

```bash
aqe run --framework jest
```

Auto-detected if `jest.config.js` exists.

### Mocha

```bash
aqe run --framework mocha
```

Auto-detected if `.mocharc.json` exists.

### Cypress

```bash
aqe run --framework cypress
```

Requires Cypress installed and configured.

### Playwright

```bash
aqe run --framework playwright
```

Runs Playwright tests in parallel.

## Reporters

### Default Reporter

```bash
aqe run --reporter default
```

Human-readable console output.

### JSON Reporter

```bash
aqe run --reporter json
```

Outputs JSON for programmatic parsing.

**Output: `test-results.json`**
```json
{
  "numTotalTests": 120,
  "numPassedTests": 120,
  "numFailedTests": 0,
  "coverage": { "total": { "pct": 94.5 } },
  "duration": 12300
}
```

### HTML Reporter

```bash
aqe run --reporter html
```

Generates interactive HTML report.

**Output: `test-results/index.html`**

### JUnit Reporter

```bash
aqe run --reporter junit
```

Generates JUnit XML (CI/CD standard).

**Output: `test-results/junit.xml`**

## Timeouts

### Set Test Timeout

```bash
aqe run --timeout 60000
```

Sets timeout to 60 seconds (default: 30 seconds).

**When to increase:**
- Integration tests with external APIs
- E2E tests with slow UI interactions
- Database operations

**When to decrease:**
- Fast unit tests
- Catching infinite loops quickly

## Bail Strategies

### Stop on First Failure

```bash
aqe run --bail
```

**Use cases:**
- Fast feedback in TDD
- Pre-commit hooks
- Debugging specific failures

### Run All Tests

```bash
aqe run --no-bail
```

**Use cases:**
- Full test suite validation
- CI/CD (see all failures)
- Coverage collection

## Real-Time Monitoring

### Live Progress

During execution, AQE shows:
```
🚀 Progress: 45/120 tests (37.5%)
   ✓ Passed: 44
   ✗ Failed: 1
   ⏱  Elapsed: 8.2s
   📊 Coverage: 42.3% (partial)
```

### Agent Coordination

Tests run with coordination:
```
[10:05:12] qe-test-executor: Starting suite execution
[10:05:15] qe-coverage-analyzer: Tracking coverage in real-time
[10:05:23] qe-test-executor: Test failure detected, retrying...
[10:05:25] qe-test-executor: Retry successful, marking as flaky
```

## Advanced Examples

### Example 1: Full CI/CD Pipeline

```bash
#!/bin/bash
# ci-test.sh

# Run tests with full reporting
aqe run \
  --parallel 8 \
  --reporter junit \
  --coverage \
  --bail \
  --timeout 45000

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ All tests passed"
  exit 0
else
  echo "❌ Tests failed"
  exit 1
fi
```

### Example 2: TDD Workflow

```bash
# Terminal 1: Watch mode
aqe run --watch --bail --filter "user-service"

# Terminal 2: Edit code
vim src/services/user-service.ts

# Tests re-run automatically on save
```

### Example 3: Performance Testing

```bash
# Run with timing analysis
aqe run --parallel 8 --reporter json

# Analyze slow tests
cat test-results.json | jq '.tests[] | select(.duration > 1000)'
```

## Troubleshooting

### Tests Timeout

**Problem:** Tests exceed timeout

**Solutions:**
```bash
# Increase timeout
aqe run --timeout 60000

# Check for async issues in tests
# Ensure promises are awaited
# Verify no hanging connections
```

### Parallel Execution Issues

**Problem:** Tests fail only in parallel mode

**Solutions:**
```bash
# Run serially to debug
aqe run --parallel 1

# Check for shared state issues
# Ensure tests are isolated
# Use unique test data per test
```

### Coverage Lower Than Expected

**Problem:** Coverage drops during execution

**Solutions:**
```bash
# Generate missing tests
aqe analyze gaps
aqe generate src/services/uncovered-file.ts

# Re-run with coverage
aqe run --coverage
```

### Flaky Tests

**Problem:** Tests fail randomly

**Solutions:**
```bash
# Enable retry to identify
aqe run --retry 3

# Analyze flaky tests
aqe analyze quality --path tests/

# Fix or remove flaky tests
aqe optimize flakiness --dry-run
```

## Performance Tips

1. **Use parallel execution** - Always use `--parallel` for faster runs
2. **Disable coverage for debugging** - Use `--no-coverage` when not needed
3. **Filter tests during development** - Use `--filter` to run subset
4. **Enable watch mode for TDD** - Use `--watch` for instant feedback
5. **Optimize worker count** - Experiment with worker count for your machine

## Next Steps

- **Analyze your coverage** → [COVERAGE-ANALYSIS.md](./COVERAGE-ANALYSIS.md)
- **Set up quality gates** → [QUALITY-GATES.md](./QUALITY-GATES.md)
- **Optimize your suite** → See `aqe optimize` command

## Related Commands

```bash
aqe run --help          # Full command reference
aqe status              # Check executor agent status
aqe analyze coverage    # Analyze test coverage
aqe optimize suite      # Optimize test execution
```
