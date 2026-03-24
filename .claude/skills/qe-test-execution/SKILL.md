---
name: "qe-test-execution"
description: "Run test suites with parallel orchestration, smart test selection, flaky test handling, and distributed execution. Use when optimizing test execution time, handling flaky tests, or setting up CI/CD test pipelines."
---

# QE Test Execution

Parallel test orchestration, smart test selection, flaky test handling, and distributed execution across environments.

## Quick Start

```bash
# Run all tests with parallelization
aqe test run --parallel --workers 4

# Run affected tests only
aqe test run --affected --since HEAD~1

# Run with retry for flaky tests
aqe test run --retry 3 --retry-delay 1000

# Run specific test types
aqe test run --type unit,integration --exclude e2e
```

## Workflow

### Step 1: Execute Tests in Parallel

```typescript
await testExecutor.runParallel({
  suites: ['unit', 'integration'],
  workers: 4,
  distribution: 'by-file',  // by-file | by-test | by-duration
  isolation: 'process',
  sharding: { enabled: true, total: 4, index: process.env.SHARD_INDEX }
});
```

**Checkpoint:** Verify all shards report back before aggregating results.

### Step 2: Smart Test Selection

```typescript
await testExecutor.runAffected({
  changes: gitChanges,
  selection: {
    direct: true,       // Tests for changed files
    transitive: true,   // Tests for dependents
    integration: true   // Integration tests touching changed code
  },
  fallback: 'full-suite'
});
```

**Checkpoint:** Confirm selected tests cover all changed modules.

### Step 3: Handle Flaky Tests

```typescript
await testExecutor.handleFlaky({
  detection: { enabled: true, threshold: 0.1, window: 100 },
  strategy: { retry: 3, quarantine: true, notify: ['#flaky-tests'] }
});
```

## CI/CD Integration

```yaml
# GitHub Actions sharded test execution
test:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      shard: [1, 2, 3, 4]
  steps:
    - uses: actions/checkout@v4
    - name: Run tests
      run: |
        aqe test run \
          --shard ${{ matrix.shard }}/4 \
          --parallel \
          --report junit
    - uses: actions/upload-artifact@v4
      with:
        name: test-results-${{ matrix.shard }}
        path: reports/
```

## Configuration

```yaml
execution:
  parallel:
    workers: auto  # CPU cores - 1
    timeout: 30000
    bail: false
  retry:
    count: 2
    delay: 1000
    only_failed: true
  reporting:
    formats: [junit, json, html]
    include_timing: true
  environments:
    - name: node-18
      image: node:18-alpine
    - name: node-20
      image: node:20-alpine
```

## Gotchas

- Full test suites may OOM in containers -- make suite lightweight, don't just add more rules
- Fewer focused agents (3-4) outperform many vague ones (6-8) -- include verification command in each prompt
- Model releases can shift agent behavior mid-sprint -- rules followed yesterday may be ignored after update
- Running all tests in parallel can mask flaky tests -- use `--workers=1` for initial diagnosis
- Session crashes lose all context -- save intermediate results to disk

## Coordination

**Primary Agents**: qe-test-executor, qe-test-selector, qe-flaky-detector
**Related Skills**: qe-test-generation, qe-coverage-analysis
