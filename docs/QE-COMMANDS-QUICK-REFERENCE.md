# QE Slash Commands - Quick Reference Guide

**Version:** 2.0.0
**Date:** 2025-09-30
**Audience:** Developers and QE Engineers

---

## Command Cheat Sheet

| Command | Purpose | Quick Syntax | Time |
|---------|---------|--------------|------|
| `/qe-generate` | Generate tests | `/qe-generate <path>` | ~10s |
| `/qe-execute` | Run tests | `/qe-execute [suite]` | ~30s |
| `/qe-analyze` | Analyze coverage | `/qe-analyze [type]` | ~5s |
| `/qe-optimize` | Optimize suite | `/qe-optimize <target>` | ~15s |
| `/qe-report` | Generate reports | `/qe-report [type]` | ~3s |
| `/qe-fleet-status` | Fleet health | `/qe-fleet-status` | ~1s |
| `/qe-chaos` | Chaos testing | `/qe-chaos <scenario>` | Varies |
| `/qe-benchmark` | Benchmarking | `/qe-benchmark <target>` | Varies |

---

## Common Use Cases

### 1. Generate Tests for New Feature

```bash
# Basic generation
/qe-generate src/features/user-auth.ts

# With specific coverage target
/qe-generate src/features/user-auth.ts --coverage 98

# Property-based testing
/qe-generate src/utils/validators.ts --property-based --framework jest

# E2E tests from API spec
/qe-generate src/api --type e2e --swagger api-spec.yaml --framework cypress
```

**Expected Output:**
- Test files in `./tests/<type>/`
- Coverage projection
- Generation metrics

---

### 2. Run Test Suite

```bash
# Run all tests
/qe-execute

# Run specific suite
/qe-execute tests/unit

# Parallel execution with coverage
/qe-execute --parallel 8 --coverage

# Watch mode (TDD)
/qe-execute --watch --bail

# CI/CD mode
/qe-execute --reporter junit --bail --no-coverage
```

**Expected Output:**
- Pass/fail status
- Coverage percentage
- Execution time
- Failure details (if any)

---

### 3. Analyze Coverage

```bash
# Basic coverage analysis
/qe-analyze coverage

# Identify coverage gaps
/qe-analyze gaps --threshold 95

# Compare with baseline
/qe-analyze trends --baseline coverage-baseline.json --diff

# Risk assessment
/qe-analyze risk --format html --output risk-report.html
```

**Expected Output:**
- Coverage percentage
- Gap identification
- Recommendations
- Trend analysis (if applicable)

---

### 4. Optimize Test Suite

```bash
# Optimize for coverage efficiency
/qe-optimize suite --objective coverage-per-test

# Reduce execution time
/qe-optimize performance --budget 300

# Remove flaky tests (dry-run)
/qe-optimize flakiness --dry-run

# Aggressive optimization
/qe-optimize suite --aggressive --algorithm sublinear
```

**Expected Output:**
- Test count reduction
- Coverage delta
- Time savings
- Optimization metrics

---

### 5. Generate Reports

```bash
# Summary report
/qe-report summary

# Detailed HTML report
/qe-report detailed --format html --output qe-report.html

# Executive summary
/qe-report executive --format pdf --output exec-summary.pdf

# Trend analysis
/qe-report trend --period last-30-days --charts
```

**Expected Output:**
- Report file (markdown/html/pdf)
- Coverage metrics
- Quality trends
- Recommendations

---

### 6. Monitor Fleet Health

```bash
# Basic status
/qe-fleet-status

# Detailed metrics
/qe-fleet-status --detailed

# JSON output for automation
/qe-fleet-status --json

# Continuous monitoring
/qe-fleet-status --watch
```

**Expected Output:**
- Fleet ID and status
- Active agents
- Recent activity
- Health metrics

---

### 7. Chaos Testing

```bash
# Simulate latency
/qe-chaos latency --duration 60 --intensity medium

# Test failure scenarios
/qe-chaos failure --target api-gateway

# Resource exhaustion
/qe-chaos resource-exhaustion --intensity high

# Network partition
/qe-chaos network-partition --duration 120 --recovery-check
```

**Expected Output:**
- Chaos test results
- System resilience metrics
- Recovery time
- Failure analysis

---

### 8. Performance Benchmarking

```bash
# API endpoint benchmark
/qe-benchmark api --target /api/users --iterations 1000

# Database query benchmark
/qe-benchmark database --target user-queries --concurrency 10

# Function benchmark
/qe-benchmark function --target calculateTotal

# Compare with baseline
/qe-benchmark api --target /api/orders --baseline baseline.json
```

**Expected Output:**
- Mean/median response time
- P95/P99 latency
- Throughput (req/s)
- Comparison with baseline

---

## Workflow Examples

### Workflow 1: New Feature Development (TDD)

```bash
# Step 1: Generate test skeleton
/qe-generate src/features/payment-processing.ts --type unit --framework jest

# Step 2: Implement feature (manual coding)

# Step 3: Run tests in watch mode
/qe-execute tests/unit/payment-processing.test.ts --watch

# Step 4: Verify coverage
/qe-analyze coverage --path src/features/payment-processing.ts

# Step 5: Optimize if needed
/qe-optimize suite --path tests/unit/payment-processing.test.ts
```

---

### Workflow 2: Pre-Commit Quality Gate

```bash
# Step 1: Run all tests
/qe-execute --bail

# Step 2: Check coverage threshold
/qe-analyze coverage --threshold 95

# Step 3: Generate quality report
/qe-report summary --format markdown

# Step 4: If all pass, commit
git add . && git commit -m "feat: implement new feature"
```

---

### Workflow 3: CI/CD Pipeline

```bash
# Step 1: Initialize fleet
aqe init

# Step 2: Run tests with coverage
/qe-execute --parallel auto --coverage --reporter junit

# Step 3: Analyze coverage and enforce gate
/qe-analyze coverage --threshold 90

# Step 4: Generate reports
/qe-report detailed --format html --output ci-report.html

# Step 5: Archive artifacts
# (Test results, coverage reports, QE reports)
```

---

### Workflow 4: Performance Regression Testing

```bash
# Step 1: Establish baseline
/qe-benchmark api --target /api/search --iterations 5000 > baseline.json

# Step 2: After changes, re-benchmark
/qe-benchmark api --target /api/search --baseline baseline.json

# Step 3: Analyze regression
/qe-analyze trends --period last-7-days

# Step 4: Generate performance report
/qe-report detailed --include performance --format html
```

---

### Workflow 5: Comprehensive Quality Audit

```bash
# Step 1: Generate comprehensive test suite
/qe-generate src/ --type unit --coverage 95 --property-based

# Step 2: Execute all tests
/qe-execute --parallel auto --coverage

# Step 3: Analyze coverage and gaps
/qe-analyze gaps --threshold 95 --format html

# Step 4: Optimize test suite
/qe-optimize suite --objective coverage-per-test

# Step 5: Run chaos tests
/qe-chaos failure --duration 300 --intensity medium

# Step 6: Performance benchmarks
/qe-benchmark system --iterations 1000

# Step 7: Generate executive report
/qe-report executive --format pdf --period all-time
```

---

## Memory Key Reference

Quick lookup for memory operations in custom scripts:

| Category | Key Pattern | Example |
|----------|-------------|---------|
| Fleet | `aqe/fleet/*` | `aqe/fleet/id` |
| Agents | `aqe/agents/{name}/*` | `aqe/agents/qe-test-generator/status` |
| Generation | `aqe/test-generation/*` | `aqe/test-generation/results/{id}` |
| Execution | `aqe/test-execution/*` | `aqe/test-execution/results/{id}` |
| Coverage | `aqe/coverage/*` | `aqe/coverage/current` |
| Optimization | `aqe/optimization/*` | `aqe/optimization/results/{id}` |
| Coordination | `aqe/coordination/*` | `aqe/coordination/active-tasks` |

**Memory Operations:**
```bash
# Store
npx claude-flow@alpha memory store --key "aqe/custom/key" --value '{"data": "value"}'

# Retrieve
npx claude-flow@alpha memory retrieve --key "aqe/custom/key"

# List keys
npx claude-flow@alpha memory list --prefix "aqe/"
```

---

## Agent Reference

| Agent | Purpose | Capabilities |
|-------|---------|--------------|
| `qe-test-generator` | Test generation | AI generation, property-based, boundary analysis |
| `qe-test-executor` | Test execution | Parallel exec, retry logic, real-time reporting |
| `qe-coverage-analyzer` | Coverage analysis | Gap detection, sublinear optimization, trends |
| `qe-quality-gate` | Quality validation | Threshold checks, go/no-go, risk assessment |
| `qe-performance-tester` | Performance testing | Load testing, bottleneck detection, SLA validation |
| `qe-security-scanner` | Security testing | SAST/DAST, vulnerability detection, compliance |

**Agent Spawning:**
```bash
# Via Claude Code Task tool
Task("Generate tests", "Create test suite for user service", "qe-test-generator")

# Via MCP
mcp__agentic_qe__agent_spawn --type "test-generator" --config '{"framework": "jest"}'
```

---

## Troubleshooting

### Issue: Command Not Found

```bash
# Check if commands are installed
ls -la .claude/commands/

# Make commands executable
chmod +x .claude/commands/*.sh

# Verify AQE installation
aqe --version
```

---

### Issue: Tests Not Generated

```bash
# Check target path exists
ls -la src/module.ts

# Verify agent registered
cat .claude/agents/qe-test-generator.md

# Check logs
cat .agentic-qe/logs/qe-generate.log
```

---

### Issue: Coverage Below Threshold

```bash
# Identify gaps
/qe-analyze gaps --threshold 95

# Generate missing tests
/qe-generate <path-from-gaps> --type unit

# Re-run tests
/qe-execute --coverage

# Verify improvement
/qe-analyze coverage
```

---

### Issue: Slow Test Execution

```bash
# Optimize test suite
/qe-optimize performance --budget 300

# Increase parallelism
/qe-execute --parallel 16

# Benchmark performance
/qe-benchmark system --iterations 100
```

---

### Issue: Flaky Tests

```bash
# Identify flaky tests
/qe-analyze quality --path tests/

# Run with retry logic
/qe-execute --retry 3

# Optimize to remove flaky tests
/qe-optimize flakiness --dry-run
```

---

### Issue: Fleet Not Responding

```bash
# Check fleet status
/qe-fleet-status

# Check agent status
for agent in qe-test-generator qe-test-executor qe-coverage-analyzer; do
  cat .claude/agents/${agent}.md | grep "Status:"
done

# Restart fleet
aqe init --force
```

---

## Command Options Quick Reference

### Common Options (All Commands)

| Option | Description | Default |
|--------|-------------|---------|
| `--help`, `-h` | Show help | - |
| `--version`, `-v` | Show version | - |
| `--verbose` | Verbose logging | `false` |
| `--dry-run` | Preview without executing | `false` |
| `--output`, `-o` | Output path | `stdout` |

### `/qe-generate` Options

| Option | Description | Default |
|--------|-------------|---------|
| `--type` | Test type | `unit` |
| `--framework` | Test framework | `jest` |
| `--coverage` | Coverage target % | `95` |
| `--property-based` | Property-based tests | `false` |
| `--mutation` | Mutation testing | `false` |
| `--parallel` | Parallel generation | `true` |

### `/qe-execute` Options

| Option | Description | Default |
|--------|-------------|---------|
| `--framework` | Test framework | `auto-detect` |
| `--parallel` | Parallel workers | `auto` |
| `--coverage` | Collect coverage | `true` |
| `--retry` | Retry count | `2` |
| `--timeout` | Test timeout (ms) | `30000` |
| `--bail` | Stop on first failure | `false` |
| `--watch` | Watch mode | `false` |

### `/qe-analyze` Options

| Option | Description | Default |
|--------|-------------|---------|
| `--path` | Source path | `./src` |
| `--baseline` | Baseline file | - |
| `--threshold` | Min coverage % | `95` |
| `--sublinear` | Use sublinear algos | `true` |
| `--format` | Output format | `text` |
| `--diff` | Show diff | `false` |

### `/qe-optimize` Options

| Option | Description | Default |
|--------|-------------|---------|
| `--algorithm` | Optimization algo | `sublinear` |
| `--objective` | Optimization goal | `coverage-per-test` |
| `--budget` | Time/test budget | - |
| `--aggressive` | Aggressive mode | `false` |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AQE_DIR` | AQE data directory | `.agentic-qe` |
| `AQE_LOG_LEVEL` | Log level | `info` |
| `AQE_PARALLEL_WORKERS` | Parallel workers | CPU cores |
| `AQE_COVERAGE_THRESHOLD` | Default threshold | `95` |
| `AQE_FRAMEWORK` | Default framework | `jest` |
| `CLAUDE_FLOW_ENDPOINT` | Claude Flow API | `https://api.claude-flow.com` |

**Usage:**
```bash
export AQE_COVERAGE_THRESHOLD=98
/qe-analyze coverage  # Uses 98% threshold
```

---

## Integration Examples

### GitHub Actions

```yaml
name: QE Pipeline
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Dependencies
        run: npm ci

      - name: Initialize AQE Fleet
        run: aqe init

      - name: Generate Tests
        run: /qe-generate src/ --coverage 95

      - name: Execute Tests
        run: /qe-execute --parallel auto --coverage

      - name: Analyze Coverage
        run: /qe-analyze coverage --threshold 90

      - name: Generate Report
        run: /qe-report detailed --format html --output qe-report.html

      - name: Upload Report
        uses: actions/upload-artifact@v3
        with:
          name: qe-report
          path: qe-report.html
```

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running QE pre-commit checks..."

# Run tests
/qe-execute --bail || {
  echo "❌ Tests failed"
  exit 1
}

# Check coverage
/qe-analyze coverage --threshold 90 || {
  echo "❌ Coverage below 90%"
  exit 1
}

echo "✅ All QE checks passed"
exit 0
```

### VS Code Task

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "QE: Generate Tests",
      "type": "shell",
      "command": "/qe-generate ${file}",
      "group": "test",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    },
    {
      "label": "QE: Run Tests",
      "type": "shell",
      "command": "/qe-execute --watch",
      "group": "test",
      "isBackground": true
    }
  ]
}
```

---

## Performance Benchmarks

Expected performance on standard hardware (4 cores, 16GB RAM):

| Operation | Size | Time | Memory |
|-----------|------|------|--------|
| Generate tests | 10 files | 8s | 256MB |
| Execute tests | 100 tests | 12s | 512MB |
| Analyze coverage | 1000 LOC | 3s | 128MB |
| Optimize suite | 500 tests | 10s | 384MB |
| Generate report | All data | 2s | 64MB |

**Scaling:**
- Linear scale up to 10,000 tests
- Sublinear algorithms for >10,000 tests
- O(log n) complexity for coverage analysis

---

## Best Practices

### 1. Test Generation
- ✅ Generate tests early in development (TDD)
- ✅ Use property-based testing for algorithms
- ✅ Set realistic coverage targets (80-95%)
- ❌ Don't over-generate (focus on quality)

### 2. Test Execution
- ✅ Run tests in parallel for speed
- ✅ Use watch mode for rapid feedback
- ✅ Retry flaky tests automatically
- ❌ Don't ignore failing tests

### 3. Coverage Analysis
- ✅ Analyze coverage regularly
- ✅ Use sublinear algorithms for large codebases
- ✅ Focus on critical gaps first
- ❌ Don't chase 100% coverage blindly

### 4. Optimization
- ✅ Optimize after suite stabilizes
- ✅ Use dry-run to preview changes
- ✅ Balance coverage vs. test count
- ❌ Don't optimize prematurely

### 5. Reporting
- ✅ Generate reports for stakeholders
- ✅ Track trends over time
- ✅ Include recommendations
- ❌ Don't report vanity metrics

---

## Support and Resources

### Documentation
- Main spec: `/docs/QE-SLASH-COMMANDS-SPECIFICATION.md`
- Implementation: `/docs/QE-COMMANDS-IMPLEMENTATION-GUIDE.md`
- Architecture: `/docs/QE-COMMANDS-ARCHITECTURE-DIAGRAM.md`
- This guide: `/docs/QE-COMMANDS-QUICK-REFERENCE.md`

### Getting Help
```bash
# Command help
/qe-generate --help

# AQE CLI help
aqe help

# Fleet status
/qe-fleet-status --detailed

# Check logs
tail -f .agentic-qe/logs/*.log
```

### Reporting Issues
- Check logs: `.agentic-qe/logs/`
- Review results: `.agentic-qe/results/`
- Validate configuration: `.claude/aqe-fleet.json`
- Contact: AQE Fleet Team

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-09-30 | Initial release of QE slash commands |

---

## Glossary

- **AQE**: Agentic Quality Engineering
- **Fleet**: Collection of coordinated QE agents
- **Sublinear**: O(log n) complexity algorithms
- **Coverage**: Percentage of code executed by tests
- **Gap**: Uncovered code region
- **Flaky Test**: Test with non-deterministic results
- **Property-Based**: Generative testing approach
- **Mutation Testing**: Testing test quality by mutating code
- **Chaos Testing**: Resilience testing through failure injection

---

**Last Updated:** 2025-09-30
**Maintained By:** AQE Architecture Team