---
name: test-automation-strategy
description: "Design and implement effective test automation with proper pyramid, patterns, and CI/CD integration. Use when building automation frameworks or improving test efficiency."
category: testing-methodologies
priority: high
tokenEstimate: 1000
agents: [qe-test-generator, qe-test-executor, qe-coverage-analyzer, qe-flaky-test-hunter, qe-regression-risk-analyzer]
implementation_status: optimized
optimization_version: 1.0
last_optimized: 2025-12-02
dependencies: []
quick_reference_card: true
tags: [automation, test-pyramid, page-object, first-principles, ci-cd, flaky-tests]
trust_tier: 3
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
  eval_path: evals/test-automation-strategy.yaml
---

# Test Automation Strategy

<default_to_action>
When designing or improving test automation:
1. DETECT anti-patterns: Ice cream cone? Slow suite? Flaky tests?
2. USE patterns: Page Object Model, Builder pattern, Factory pattern
3. INTEGRATE in CI/CD: Every commit runs tests, fail fast
4. MANAGE flaky tests: Quarantine, fix, or delete - never ignore

**Quick Anti-Pattern Detection:**
- Ice cream cone (many E2E, few unit) → Invert to pyramid
- Slow tests (> 10 min suite) → Parallelize, mock external deps
- Flaky tests → Fix timing, isolate data, or quarantine
- Brittle selectors → Use data-testid, semantic locators
</default_to_action>

## Quick Reference Card

### When to Use
- Building new automation framework
- Improving existing test efficiency
- Reducing flaky test burden
- Optimizing CI/CD pipeline speed

### Anti-Patterns to Detect
| Problem | Symptom | Fix |
|---------|---------|-----|
| Ice cream cone | 80% E2E, 10% unit | Invert pyramid |
| Slow suite | 30+ min CI | Parallelize, prune |
| Flaky tests | Random failures | Quarantine, fix timing |
| Coupled tests | Order-dependent | Isolate data |
| Brittle selectors | Break on CSS change | Use data-testid |

---

## CI/CD Integration

```yaml
name: Test Pipeline
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:unit -- --coverage
        timeout-minutes: 5
      - uses: codecov/codecov-action@v3

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
    steps:
      - run: npm run test:integration
        timeout-minutes: 10

  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright test
        timeout-minutes: 15
```

---

## Flaky Test Management

```typescript
// Quarantine flaky tests
describe.skip('Quarantined - INC-123', () => {
  test('flaky test awaiting fix', () => { /* ... */ });
});

// Agent-assisted stabilization
await Task("Fix Flaky Tests", {
  tests: quarantinedTests,
  analysis: ['timing-issues', 'data-isolation', 'race-conditions'],
  strategies: ['add-waits', 'isolate-fixtures', 'mock-externals']
}, "qe-flaky-test-hunter");
```

---

## Agent-Assisted Automation

```typescript
// Generate tests following pyramid
await Task("Generate Test Suite", {
  sourceCode: 'src/',
  pyramid: { unit: 70, integration: 20, e2e: 10 },
  patterns: ['page-object', 'builder', 'factory'],
  framework: 'jest'
}, "qe-test-generator");

// Optimize test execution
await Task("Optimize Suite", {
  algorithm: 'johnson-lindenstrauss',
  targetReduction: 0.3,
  maintainCoverage: 0.95
}, "qe-regression-risk-analyzer");

// Analyze flaky patterns
await Task("Flaky Analysis", {
  testHistory: 'last-30-days',
  detectPatterns: ['timing', 'data', 'environment'],
  recommend: 'stabilization-strategy'
}, "qe-flaky-test-hunter");
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/automation/
├── test-pyramid/*        - Coverage by layer
├── page-objects/*        - Shared page objects
├── flaky-registry/*      - Quarantined tests
└── execution-metrics/*   - Suite performance data
```

### Fleet Coordination
```typescript
const automationFleet = await FleetManager.coordinate({
  strategy: 'test-automation',
  agents: [
    'qe-test-generator',         // Generate pyramid-compliant tests
    'qe-test-executor',          // Parallel execution
    'qe-coverage-analyzer',      // Coverage gaps
    'qe-flaky-test-hunter',      // Flaky detection
    'qe-regression-risk-analyzer' // Smart selection
  ],
  topology: 'hierarchical'
});
```

---

## Related Skills
- [tdd-london-chicago](../tdd-london-chicago/) - TDD for unit tests
- [api-testing-patterns](../api-testing-patterns/) - Integration patterns
- [cicd-pipeline-qe-orchestrator](../cicd-pipeline-qe-orchestrator/) - Pipeline integration
- [shift-left-testing](../shift-left-testing/) - Early automation

---

## Remember

**With Agents:** Agents generate pyramid-compliant tests, detect flaky patterns, optimize execution time, and maintain test infrastructure. Use agents to scale automation quality.

## Gotchas

- Agent generates 80% E2E tests and 20% unit tests (inverted pyramid) — explicitly enforce 70/20/10 ratio
- Page Object Model tests become brittle when selectors change — prefer data-testid attributes over CSS selectors
- Flaky tests quarantined but never fixed is technical debt — set a 2-week SLA to fix or delete
- Agent treats test code as second-class — test code needs the same review standards as production code
- Parallel test execution requires test isolation — shared state between tests causes non-deterministic failures
