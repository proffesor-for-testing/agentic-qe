# CI/CD Documentation

## Overview

This directory contains comprehensive documentation for all CI/CD workflows and processes in the Agentic QE project.

## Available Documentation

### Workflows

- [**Benchmark Workflow**](benchmark-workflow.md) - Automated performance regression detection for every PR
  - Baseline comparison
  - Regression thresholds (5% warning, 10% failure)
  - Automatic PR comments
  - Historical trend analysis

### Quick Links

- GitHub Actions Workflows: `/.github/workflows/`
- Benchmark Suite: `/benchmarks/suite.ts`
- Local Benchmark Script: `/scripts/run-benchmarks.sh`

## CI/CD Architecture

```
┌─────────────────────────────────────────────────┐
│            Pull Request Trigger                 │
└───────────┬─────────────────────────────────────┘
            │
            ├─────────────────┬──────────────────┬──────────────────┐
            │                 │                  │                  │
            ▼                 ▼                  ▼                  ▼
    ┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │   Fast Tests  │ │ Benchmarks   │ │Infrastructure│ │   Coverage   │
    │   (Journey +  │ │ (Regression  │ │    Tests     │ │   Analysis   │
    │   Contract)   │ │  Detection)  │ │              │ │              │
    └───────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
            │                 │                 │                 │
            └─────────────────┴─────────────────┴─────────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │   Dashboard   │
                            │  (Summary &   │
                            │  PR Comment)  │
                            └───────────────┘
```

## Workflow Status

| Workflow | Status | Purpose |
|----------|--------|---------|
| Optimized CI | ✅ Active | Fast journey + contract tests |
| Benchmark | ✅ Active | Performance regression detection |
| Quality Gate | ✅ Active | Code quality checks |
| Learning Integration | ✅ Active | ML model validation |
| Migration Validation | ✅ Active | Schema migration tests |

## Common Tasks

### Running Benchmarks Locally

```bash
# Run all benchmarks
npm run benchmark:local

# Compare with baseline
npm run benchmark:local -- --baseline=v2.3.5

# Run specific benchmark
npm run benchmark:local -- --filter=agent

# Multiple runs for stability
npm run benchmark:local -- --runs=5
```

### Updating Baselines

Baselines are automatically updated when code is merged to `main`. To manually update:

```bash
# Run benchmarks and save results
npm run benchmark -- --output=benchmarks/baselines/v2.3.6.json

# Commit the new baseline
git add benchmarks/baselines/v2.3.6.json
git commit -m "chore(benchmarks): update baseline to v2.3.6"
```

### Debugging CI Failures

1. **Check GitHub Actions logs**: View detailed output for each step
2. **Run locally**: Use the same commands as CI to reproduce issues
3. **Check artifacts**: Download uploaded artifacts for detailed analysis
4. **Review PR comments**: Automated comments provide summaries and actionable insights

## Performance Thresholds

### Benchmark Regression Thresholds

| Threshold | Change | Status | Action |
|-----------|--------|--------|--------|
| < 5% | Performance degradation | ✅ Pass | No action required |
| 5-10% | Minor regression | ⚠️ Warning | Review and justify |
| > 10% | Major regression | ❌ Fail | Must fix before merge |
| < -5% | Performance improvement | ✅ Pass | Celebrate! |

### Test Coverage Thresholds

| Metric | Threshold | Status |
|--------|-----------|--------|
| Line Coverage | 80% | Required |
| Branch Coverage | 75% | Target |
| Function Coverage | 85% | Target |

## Best Practices

### For Contributors

1. **Run benchmarks before submitting PR**
   ```bash
   npm run benchmark:local -- --baseline=v2.3.5
   ```

2. **Keep test execution under 5 minutes**
   - Use `npm run test:fast` for quick validation
   - Full test suite runs in CI

3. **Write performance-conscious code**
   - Avoid unnecessary allocations
   - Use caching when appropriate
   - Profile critical paths

4. **Document performance changes**
   - Add comments explaining optimizations
   - Link to related issues/PRs
   - Provide before/after metrics

### For Reviewers

1. **Check benchmark results in PR comments**
   - Review automated performance analysis
   - Question regressions > 3%

2. **Verify test coverage**
   - Ensure new code has tests
   - Check for gaps in critical paths

3. **Review CI status**
   - All checks must pass
   - Investigate flaky tests
   - Verify no skipped tests

## Troubleshooting

### Common Issues

#### Benchmark Failures

**Symptom**: Benchmarks fail with OOM errors

**Solution**:
```bash
# Increase memory limit (local)
NODE_OPTIONS='--max-old-space-size=4096' npm run benchmark

# Check for memory leaks
npm run benchmark:local -- --verbose
```

#### Flaky Tests

**Symptom**: Tests pass/fail intermittently

**Solution**:
1. Run multiple times to confirm: `npm run test:fast -- --runs=5`
2. Check for timing issues (async/await)
3. Isolate test dependencies
4. Use proper cleanup in afterEach/afterAll

#### Baseline Not Found

**Symptom**: Warning about missing baseline

**Solution**:
```bash
# Create baseline from current main branch
git checkout main
npm run benchmark -- --output=benchmarks/baselines/v2.3.5.json
git add benchmarks/baselines/v2.3.5.json
git commit -m "chore(benchmarks): add baseline for v2.3.5"
```

## Configuration

### GitHub Actions Settings

Required permissions for workflows:
```yaml
permissions:
  contents: read        # Read repository files
  pull-requests: write  # Comment on PRs
  checks: write        # Update check status
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_OPTIONS` | Node.js memory/GC settings | `--max-old-space-size=2048` |
| `GITHUB_SHA` | Commit hash for tracking | Auto-set by GitHub |
| `GITHUB_REF` | Branch reference | Auto-set by GitHub |

## Metrics and Monitoring

### Key Performance Indicators (KPIs)

- **CI Execution Time**: Target < 2 minutes for fast tests
- **Benchmark Execution Time**: Target < 10 minutes
- **Test Success Rate**: Target > 99%
- **Flaky Test Rate**: Target < 1%
- **Coverage Trend**: Target steady increase

### Dashboards

- **GitHub Actions**: View workflow runs and trends
- **Test Dashboard**: Generated by dashboard job
- **Performance Dashboard**: Coming soon (Phase 2)

## Future Enhancements

### Planned Features

1. **Performance Budgets**
   - Per-feature performance budgets
   - Automatic budget enforcement
   - Budget violation alerts

2. **Advanced Analytics**
   - Historical trend analysis
   - Regression prediction
   - Optimization recommendations

3. **Cross-Platform Benchmarks**
   - Test on multiple OS/platforms
   - Compare platform performance
   - Detect platform-specific issues

4. **Distributed Testing**
   - Parallel test execution
   - Sharded test runs
   - Faster CI feedback

## Support and Resources

### Documentation

- [Benchmark Workflow](benchmark-workflow.md) - Detailed benchmark documentation
- [GitHub Actions Docs](https://docs.github.com/en/actions) - Official GitHub Actions documentation
- [Performance Testing Guide](../testing/performance.md) - Performance testing best practices

### Contact

- **Issues**: https://github.com/proffesor-for-testing/agentic-qe/issues
- **Discussions**: https://github.com/proffesor-for-testing/agentic-qe/discussions
- **CI/CD Team**: ci-team@example.com

---

**Last Updated**: 2025-12-12
**Version**: 1.0.0
**Maintainers**: CI/CD Team, Performance Engineering Team
