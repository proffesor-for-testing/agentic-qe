---
name: regression-testing
description: "Strategic regression testing with test selection, impact analysis, and continuous regression management. Use when verifying fixes don't break existing functionality, planning regression suites, or optimizing test execution for faster feedback."
category: specialized-testing
priority: high
tokenEstimate: 1000
agents: [qe-regression-risk-analyzer, qe-test-executor, qe-coverage-analyzer]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [regression, test-selection, impact-analysis, ci-cd, change-based, risk-based]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/regression-testing.yaml
---

# Regression Testing

<default_to_action>
When verifying changes don't break existing functionality:
1. ANALYZE what changed (git diff, impact analysis)
2. SELECT tests based on change + risk (not everything)
3. RUN in priority order (smoke → selective → full)
4. OPTIMIZE execution (parallel, sharding)
5. MONITOR suite health (flakiness, execution time)

**Quick Regression Strategy:**
- Per-commit: Smoke + changed code tests (5-10 min)
- Nightly: Extended regression (30-60 min)
- Pre-release: Full regression (2-4 hours)

**Critical Success Factors:**
- Smart selection catches 90% of regressions in 10% of time
- Flaky tests waste more time than they save
- Every production bug becomes a regression test
</default_to_action>

## Quick Reference Card

### When to Use
- After any code change
- Before release
- After dependency updates
- After environment changes

### Test Selection Strategies
| Strategy | How | Reduction |
|----------|-----|-----------|
| **Change-based** | Git diff analysis | 70-90% |
| **Risk-based** | Priority by impact | 50-70% |
| **Historical** | Frequently failing | 40-60% |
| **Time-budget** | Fixed time window | Variable |

---

## Change-Based Test Selection

```typescript
// Analyze changed files and select impacted tests
function selectTests(changedFiles: string[]): string[] {
  const testsToRun = new Set<string>();

  for (const file of changedFiles) {
    // Direct tests
    testsToRun.add(`${file.replace('.ts', '.test.ts')}`);

    // Dependent tests (via coverage mapping)
    const dependentTests = testCoverage[file] || [];
    dependentTests.forEach(t => testsToRun.add(t));
  }

  return Array.from(testsToRun);
}

// Example: payment.ts changed
// Runs: payment.test.ts, checkout.integration.test.ts, e2e/purchase.test.ts
```

---

## CI/CD Integration

```yaml
# .github/workflows/regression.yml
jobs:
  quick-regression:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Analyze changes
        id: changes
        uses: dorny/paths-filter@v2
        with:
          filters: |
            payment:
              - 'src/payment/**'
            auth:
              - 'src/auth/**'

      - name: Run affected tests
        run: npm run test:affected

      - name: Smoke tests (always)
        run: npm run test:smoke

  nightly-regression:
    if: github.event_name == 'schedule'
    timeout-minutes: 120
    steps:
      - run: npm test -- --coverage
```

---

## Agent-Driven Regression

```typescript
// Smart test selection
await Task("Regression Analysis", {
  pr: 1234,
  strategy: 'change-based-with-risk',
  timeBudget: '15min'
}, "qe-regression-risk-analyzer");

// Returns:
// {
//   mustRun: ['payment.test.ts', 'checkout.integration.test.ts'],
//   shouldRun: ['order.test.ts'],
//   canSkip: ['profile.test.ts', 'search.test.ts'],
//   estimatedTime: '12 min',
//   riskCoverage: 0.94
// }

// Generate regression test from production bug
await Task("Bug Regression Test", {
  bug: { id: 'BUG-567', description: 'Checkout fails > 100 items' },
  preventRecurrence: true
}, "qe-test-generator");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/regression-testing/
├── test-selection/*     - Impact analysis results
├── suite-health/*       - Flakiness, timing trends
├── coverage-maps/*      - Test-to-code mapping
└── bug-regressions/*    - Tests from production bugs
```

### Fleet Coordination
```typescript
const regressionFleet = await FleetManager.coordinate({
  strategy: 'comprehensive-regression',
  agents: [
    'qe-regression-risk-analyzer',  // Analyze changes, select tests
    'qe-test-executor',             // Execute selected tests
    'qe-coverage-analyzer',         // Analyze coverage gaps
    'qe-quality-gate'               // Go/no-go decision
  ],
  topology: 'sequential'
});
```

---

## Related Skills
- [risk-based-testing](../risk-based-testing/) - Risk-based prioritization
- [test-automation-strategy](../test-automation-strategy/) - Automation pyramid
- [continuous-testing-shift-left](../continuous-testing-shift-left/) - CI/CD integration

---

## Remember

**With Agents:** `qe-regression-risk-analyzer` provides intelligent test selection achieving 90% defect detection in 10% of execution time. Agents generate regression tests from production bugs automatically.

## Skill Composition

- **Test failing?** → Use `/test-failure-investigator` to diagnose root cause
- **File a bug** → Use `/bug-reporting-excellence` for proper bug reporting
- **Test selection** → Use `/risk-based-testing` for risk-based prioritization

## Gotchas

- Agent defaults to "run everything" despite being told to select — explicitly constrain with `--affected` or file list
- Change-based selection misses transitive dependencies — a model change can break a controller test 3 hops away
- Flaky tests in regression suites erode trust faster than missing tests — quarantine immediately, don't skip
- Agent may report "0 regressions" when tests simply weren't run — verify test count in output, not just pass/fail
- Running full regression in containers often OOMs — use `--workers=2` and `--shard` for CI environments
