---
name: regression-testing
description: Strategic regression testing with test selection, impact analysis, and continuous regression management. Use when verifying fixes don't break existing functionality, planning regression suites, or optimizing test execution for faster feedback.
---

# Regression Testing

## Core Principle

**Every fix is a risk. Every change can break something.**

Regression testing ensures that new changes don't break existing functionality. It's not about testing everything - it's about smartly testing what matters when changes occur.

## What is Regression Testing?

**Regression:** Re-running tests after changes to verify existing functionality still works.

**Why needed:**
- Bug fixes can introduce new bugs
- New features can break old features
- Refactoring can change behavior
- Dependency updates can cause failures
- Environmental changes affect functionality

**Goal:** Catch unintended side effects early and cheaply.

## Types of Regression Testing

### 1. Corrective Regression (No Code Change)

**When:** No changes to code, just re-running existing tests

**Use case:**
- Environment change (new database version)
- Configuration change
- Infrastructure update
- Verifying test stability

**Strategy:** Re-run full existing test suite

**Example:**
```bash
# After upgrading Node.js from 18 to 20
npm test  # Run all tests to ensure nothing broke
```

### 2. Progressive Regression (New Features)

**When:** New features added, existing tests still valid

**Strategy:**
- Run existing regression suite
- Add new tests for new features
- Focus on integration points with existing code

**Example:**
```
New Feature: Social login
Regression Focus:
✓ Existing email login still works
✓ User profile creation unchanged
✓ Session management compatible
✓ New social login tests added
```

### 3. Selective Regression (Targeted Testing)

**When:** Specific modules changed, test only impacted areas

**Strategy:**
- Analyze code changes
- Identify dependent modules
- Run tests for changed + dependent code
- Skip unrelated tests

**Benefits:**
- Faster feedback (minutes vs hours)
- Resource efficient
- Scales to large codebases

**Example:**
```typescript
// Payment module changed
// Run tests for:
- payment.test.ts ✓
- checkout.test.ts ✓ (depends on payment)
- order-confirmation.test.ts ✓ (depends on payment)
// Skip unrelated:
- user-profile.test.ts ✗ (no dependency)
- search.test.ts ✗ (no dependency)
```

### 4. Complete Regression (Full Suite)

**When:**
- Major refactoring
- Before release
- After significant changes
- Periodic confidence check

**Strategy:** Run every test in the suite

**Timing:**
- Nightly builds
- Weekly full regression
- Pre-release validation

### 5. Partial Regression (Risk-Based)

**When:** Time-constrained, need quick validation

**Strategy:**
- Run critical path tests
- Run high-risk area tests
- Run frequently failing tests
- Skip low-priority tests

**Example:**
```
High Priority (always run):
✓ Login/authentication
✓ Payment processing
✓ Data integrity checks

Medium Priority (run if time):
✓ User profile management
✓ Search functionality

Low Priority (skip in quick regression):
✗ Admin panel features
✗ Reporting dashboards
```

## Test Selection Strategies

### Strategy 1: Change-Based Selection

**Analyze what changed, test accordingly**

```typescript
// PR changes:
- src/services/payment.ts
- src/utils/currency.ts

// Select tests covering:
- payment.test.ts ✓
- currency.test.ts ✓
- integration/checkout.test.ts ✓ (uses payment)
- e2e/purchase-flow.test.ts ✓ (exercises payment)
```

**Tools:**
- Git diff analysis
- Code coverage mapping
- Dependency graphs

**Benefits:**
- Fast feedback (5-10 min vs 2 hours)
- 70-90% defect detection
- Scalable to large suites

### Strategy 2: Risk-Based Selection

**Prioritize based on failure risk and impact**

```typescript
Risk Score = Probability of Failure × Impact

High Risk:
- Payment processing (critical + complex)
- Authentication (critical + frequently changed)
- Data migration (high impact)

Medium Risk:
- User profile (moderate impact)
- Search (stable code)

Low Risk:
- Help documentation (low impact + stable)
```

### Strategy 3: Historical Failure Analysis

**Test what breaks frequently**

```typescript
// Track test failures over last 30 days
const flakyTests = [
  'checkout.test.ts - 15 failures',
  'auth.test.ts - 12 failures',
  'api-integration.test.ts - 8 failures'
];

// Always include in regression
```

### Strategy 4: Code Coverage-Based

**Test code with poor existing coverage**

```typescript
// Coverage analysis
payment.ts: 45% coverage → High priority for regression
checkout.ts: 85% coverage → Medium priority
utils.ts: 95% coverage → Low priority

// Focus regression on under-tested code
```

### Strategy 5: Time-Budget Selection

**Fixed time window, maximize value**

```typescript
// You have 15 minutes
const testPriority = [
  { test: 'critical-paths', time: '5 min', value: 'high' },
  { test: 'payment-flows', time: '3 min', value: 'high' },
  { test: 'auth-flows', time: '2 min', value: 'high' },
  { test: 'search', time: '2 min', value: 'medium' },
  { test: 'profiles', time: '3 min', value: 'medium' }
];

// Run until time budget exhausted
// Total: 15 min, covering all high-value tests
```

## Building a Regression Suite

### Phase 1: Seed with Critical Tests

Start with smoke tests - does basic functionality work?

```javascript
// Smoke test suite (5-10 min)
describe('Smoke Tests', () => {
  test('App starts without errors', () => {
    expect(app.isRunning()).toBe(true);
  });

  test('Database connection works', () => {
    expect(db.isConnected()).toBe(true);
  });

  test('Critical API endpoints respond', () => {
    expect(api.health()).toBe('OK');
  });

  test('User can login', () => {
    login('test@example.com', 'password');
    expect(session.isActive()).toBe(true);
  });
});
```

### Phase 2: Add Happy Path Tests

Cover main user workflows end-to-end.

```javascript
// Happy path suite (20-30 min)
describe('Core User Journeys', () => {
  test('User can sign up and verify email', async () => {
    await signup('new@example.com', 'SecurePass123!');
    const email = await getLatestEmail('new@example.com');
    await verifyEmail(email.verificationLink);
    expect(user.isVerified()).toBe(true);
  });

  test('User can complete purchase', async () => {
    await login();
    await addToCart(product);
    await checkout();
    await submitPayment(validCard);
    expect(order.status()).toBe('completed');
  });
});
```

### Phase 3: Add Edge Cases and Error Scenarios

```javascript
// Edge case suite (30-45 min)
describe('Edge Cases', () => {
  test('Handles expired credit card', async () => {
    await checkout();
    await submitPayment(expiredCard);
    expect(error.message()).toContain('Card expired');
  });

  test('Handles concurrent checkout attempts', async () => {
    const promises = [
      checkout(user1),
      checkout(user1) // Same user, same time
    ];
    const results = await Promise.all(promises);
    expect(results.filter(r => r.success).length).toBe(1);
  });
});
```

### Phase 4: Add Integration Tests

```javascript
// Integration suite (45-60 min)
describe('System Integration', () => {
  test('Payment gateway integration works', async () => {
    const result = await paymentGateway.charge(card, amount);
    expect(result.status).toBe('succeeded');
    expect(db.transaction).toHaveBeenRecorded();
    expect(email.receipt).toHaveBeenSent();
  });

  test('Inventory sync with warehouse', async () => {
    await purchaseProduct(product);
    const inventory = await warehouse.checkStock(product.id);
    expect(inventory.quantity).toBe(originalQuantity - 1);
  });
});
```

### Regression Suite Pyramid

```
         /\
        /  \  Full Regression (weekly)
       /    \  - All tests (2-4 hours)
      /------\
     /        \  Extended Regression (nightly)
    /          \  - All unit + integration + critical E2E (30-60 min)
   /------------\
  /              \  Quick Regression (per commit)
 /________________\  - Changed code tests + smoke tests (5-10 min)
```

## Test Impact Analysis

### Mapping Tests to Code

**Build dependency graph:**

```typescript
// Track which tests cover which code
const testCoverage = {
  'payment.ts': [
    'payment.test.ts',
    'checkout.integration.test.ts',
    'e2e/purchase.test.ts'
  ],
  'user.ts': [
    'user.test.ts',
    'auth.integration.test.ts',
    'e2e/signup.test.ts'
  ]
};

// When payment.ts changes, run all related tests
function selectTests(changedFiles) {
  const testsToRun = new Set();
  changedFiles.forEach(file => {
    testCoverage[file]?.forEach(test => testsToRun.add(test));
  });
  return Array.from(testsToRun);
}
```

### Transitive Dependencies

**Account for indirect dependencies:**

```typescript
// Direct dependency
payment.ts → uses → currency.ts

// Transitive dependency
checkout.ts → uses → payment.ts → uses → currency.ts

// When currency.ts changes, test:
- currency.test.ts (direct)
- payment.test.ts (direct dependency on currency)
- checkout.test.ts (transitive dependency)
```

### Static Analysis for Test Selection

```typescript
// Analyze imports to build dependency graph
import ts from 'typescript';

function findDependencies(sourceFile: string): string[] {
  const program = ts.createProgram([sourceFile], {});
  const checker = program.getTypeChecker();

  // Extract all imports
  const dependencies = [];
  const sourceFileObj = program.getSourceFile(sourceFile);

  ts.forEachChild(sourceFileObj, node => {
    if (ts.isImportDeclaration(node)) {
      dependencies.push(node.moduleSpecifier.text);
    }
  });

  return dependencies;
}
```

## Regression Test Optimization

### Technique 1: Test Parallelization

**Run tests concurrently for faster feedback**

```javascript
// Sequential: 60 min
test1(); // 20 min
test2(); // 20 min
test3(); // 20 min

// Parallel: 20 min
Promise.all([
  test1(), // 20 min
  test2(), // 20 min
  test3()  // 20 min
]);

// Jest configuration
module.exports = {
  maxWorkers: '50%', // Use half CPU cores
  testTimeout: 30000
};
```

### Technique 2: Test Sharding

**Distribute tests across multiple machines**

```yaml
# CI pipeline with 4 workers
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: npm test -- --shard=${{ matrix.shard }}/4

# Each worker runs 25% of tests
# Total time: 60 min / 4 = 15 min
```

### Technique 3: Incremental Testing

**Test only what changed since last run**

```typescript
// Track test results
const lastRun = {
  timestamp: '2025-10-24T10:00:00Z',
  passed: ['test1', 'test2', 'test3'],
  failed: []
};

// Current run
const currentChanges = ['payment.ts', 'checkout.ts'];

// Run:
// 1. Tests for changed code (payment, checkout)
// 2. Tests that failed last time (if any)
// Skip tests that passed last time for unchanged code
```

### Technique 4: Smoke Test Fast Fail

**Run fastest, most critical tests first**

```yaml
# CI Pipeline
stages:
  - smoke-test:     # 2 min
      - critical-paths
      - fail-fast: true  # Stop if smoke fails

  - quick-regression: # 10 min
      - changed-code-tests
      - fail-fast: true

  - full-regression:  # 60 min
      - all-tests
      - fail-fast: false  # Run all to find all issues
```

### Technique 5: Test Flakiness Removal

**Eliminate unreliable tests**

```typescript
// Track test stability over 100 runs
const testStability = {
  'reliable-test': { runs: 100, passes: 100, passRate: 1.00 },
  'flaky-test': { runs: 100, passes: 87, passRate: 0.87 },
  'unstable-test': { runs: 100, passes: 64, passRate: 0.64 }
};

// Strategy:
// passRate >= 0.98 → Keep in regression suite
// passRate 0.90-0.98 → Fix flakiness
// passRate < 0.90 → Quarantine until fixed

// Flaky tests waste time and reduce confidence
```

## Continuous Regression Testing

### Regression in CI/CD Pipeline

```yaml
# .github/workflows/regression.yml
name: Regression Testing

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Nightly at 2 AM

jobs:
  quick-regression:
    name: Quick Regression (per PR)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v3
      - name: Changed file analysis
        id: changes
        uses: dorny/paths-filter@v2
        with:
          filters: |
            payment:
              - 'src/payment/**'
            auth:
              - 'src/auth/**'

      - name: Run affected tests
        run: |
          npm run test:payment
          npm run test:auth
        if: steps.changes.outputs.payment == 'true' || steps.changes.outputs.auth == 'true'

      - name: Smoke tests (always)
        run: npm run test:smoke

  nightly-regression:
    name: Nightly Full Regression
    runs-on: ubuntu-latest
    timeout-minutes: 120
    if: github.event_name == 'schedule'
    steps:
      - name: Run all tests
        run: npm test

      - name: Coverage report
        run: npm run coverage

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: regression-results
          path: test-results/
```

### Pre-Commit Regression

**Local regression before committing**

```bash
# .git/hooks/pre-commit
#!/bin/bash

echo "Running quick regression tests..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep ".ts$")

if [ -z "$STAGED_FILES" ]; then
  echo "No TypeScript files changed, skipping tests"
  exit 0
fi

# Run tests for changed files
npm run test:changed -- $STAGED_FILES

if [ $? -ne 0 ]; then
  echo "❌ Regression tests failed. Commit aborted."
  exit 1
fi

echo "✅ Regression tests passed"
exit 0
```

### Pre-Deployment Regression

**Final validation before production**

```yaml
# Deployment pipeline
deploy:
  steps:
    - name: Production smoke tests
      run: npm run test:smoke:production
      env:
        API_URL: https://staging.example.com

    - name: Critical path regression
      run: npm run test:critical-paths

    - name: Security regression
      run: npm run test:security

    - name: Performance baseline check
      run: npm run test:performance

    - name: Deploy to production
      if: success()
      run: ./deploy.sh production
```

## Regression Test Maintenance

### Anti-Pattern: Test Rot

**Problem:** Tests become outdated, irrelevant, or broken

```javascript
// BAD: Outdated test
test('User can pay with PayPal', () => {
  // PayPal integration removed 6 months ago
  // Test still exists but is meaningless
});

// GOOD: Remove obsolete tests
// Delete test when feature is removed
```

### Strategy: Regular Test Review

```markdown
## Quarterly Test Audit

Review each test:
- [ ] Is feature still in product?
- [ ] Does test provide value?
- [ ] Is test reliable (not flaky)?
- [ ] Is test documented/understandable?
- [ ] Execution time acceptable?

Actions:
- Delete: Obsolete tests
- Fix: Flaky tests
- Optimize: Slow tests
- Document: Unclear tests
- Consolidate: Duplicate tests
```

### Strategy: Test Suite Metrics

```typescript
interface TestSuiteHealth {
  totalTests: number;
  executionTime: string;
  passRate: number;
  flakiness: number;
  coverage: number;
  lastUpdated: Date;
}

const regressionHealth: TestSuiteHealth = {
  totalTests: 1247,
  executionTime: '18 min',
  passRate: 0.987,        // 98.7% pass rate
  flakiness: 0.013,       // 1.3% flaky tests (target: <2%)
  coverage: 0.82,         // 82% code coverage
  lastUpdated: new Date('2025-10-24')
};

// Track over time
// Trend: execution time ↑ → need optimization
// Trend: flakiness ↑ → need stabilization
// Trend: coverage ↓ → add tests for new code
```

### Strategy: Test Ownership

```typescript
// tests/payment/checkout.test.ts
/**
 * @owner team-payments
 * @created 2025-06-15
 * @criticality high
 * @executionTime 45s
 * @lastReview 2025-09-20
 *
 * Tests the complete checkout flow including:
 * - Cart validation
 * - Payment processing
 * - Order confirmation
 * - Email receipt
 */

// Benefits:
// - Clear responsibility for maintenance
// - Context for why test exists
// - Trigger for regular review
```

## Regression Testing Best Practices

### ✅ DO: Automate Regression Tests

**Manual regression doesn't scale**

```typescript
// Automated regression runs on every PR
// Catches issues in minutes, not days
```

### ✅ DO: Use Descriptive Test Names

```javascript
// BAD
test('test1', () => { ... });

// GOOD
test('checkout fails gracefully when payment gateway is down', () => {
  mockPaymentGateway.simulateOutage();
  const result = await checkout(cart);
  expect(result.status).toBe('payment-failed');
  expect(result.userMessage).toContain('payment service unavailable');
});
```

### ✅ DO: Keep Tests Independent

```javascript
// BAD: Tests depend on execution order
test('create user', () => {
  user = createUser('test@example.com');
});

test('user can login', () => {
  login(user); // Fails if previous test didn't run
});

// GOOD: Each test independent
test('user can login', () => {
  const user = createUser('test@example.com'); // Setup in test
  login(user);
  expect(session.isActive()).toBe(true);
});
```

### ✅ DO: Use Setup/Teardown

```javascript
describe('Payment Tests', () => {
  beforeEach(async () => {
    // Clean slate for each test
    await db.clean();
    await db.seed(testData);
  });

  afterEach(async () => {
    // Cleanup
    await db.clean();
  });

  test('payment succeeds with valid card', async () => {
    // Test has clean environment
  });
});
```

### ❌ DON'T: Test Everything, Every Time

```typescript
// DON'T run 4-hour full regression on every commit
// DO run smart selection based on changes
```

### ❌ DON'T: Ignore Flaky Tests

```typescript
// DON'T keep flaky tests and ignore failures
// DO fix or quarantine flaky tests immediately
```

### ❌ DON'T: Duplicate Test Coverage

```typescript
// DON'T test same thing at multiple levels
// Unit test: currency conversion logic
// Integration test: currency conversion in payment
// E2E test: full purchase with currency conversion

// DO test each concern at appropriate level
// Unit: Conversion logic
// Integration: Payment service uses conversion correctly
// E2E: Happy path only (one currency conversion example)
```

## Using with QE Agents

### Intelligent Test Selection

**qe-regression-risk-analyzer** performs smart test selection:

```typescript
// Analyze PR for regression risk
const analysis = await agent.analyzeRegressionRisk({
  pr: 1234,
  strategy: 'change-based-with-risk',
  timebudget: '15min'
});

// Returns:
// {
//   mustRun: ['payment.test.ts', 'checkout.integration.test.ts'],
//   shouldRun: ['order.test.ts', 'inventory.test.ts'],
//   canSkip: ['profile.test.ts', 'search.test.ts'],
//   estimatedTime: '12 min',
//   riskCoverage: 0.94
// }
```

### Automated Test Generation for Regression

**qe-test-generator** creates regression tests from bugs:

```typescript
// Bug found in production
const bug = {
  id: 'BUG-567',
  description: 'Checkout fails when user has > 100 items in cart',
  severity: 'high'
};

// Agent generates regression test
await agent.generateRegressionTest({
  bug: bug,
  preventRecurrence: true
});

// Creates:
// tests/regression/BUG-567-large-cart.test.ts
test('checkout succeeds with 100+ items in cart', async () => {
  const cart = generateCart(150); // Edge case that failed
  const result = await checkout(cart);
  expect(result.status).toBe('success');
});
```

### Continuous Regression Monitoring

**qe-quality-analyzer** tracks regression suite health:

```typescript
// Monitor regression suite metrics
const health = await agent.analyzeRegressionHealth({
  suite: 'main-regression',
  period: '30d'
});

// Returns insights:
// {
//   executionTimeTrend: 'increasing', // ⚠️ Getting slower
//   flakinessRate: 0.03,              // ⚠️ Above 2% threshold
//   coverageTrend: 'stable',          // ✅ Maintaining coverage
//   recommendations: [
//     'Parallelize slow tests',
//     'Fix 12 flaky tests',
//     'Remove 5 obsolete tests'
//   ]
// }
```

### Regression Testing in CI/CD

**qe-test-executor** orchestrates regression runs:

```typescript
// Execute smart regression in CI pipeline
await agent.executeRegression({
  trigger: 'pull-request',
  strategy: 'selective',
  changedFiles: ['src/payment/stripe.ts', 'src/models/order.ts'],
  parallel: true,
  failFast: false
});

// Execution plan:
// 1. Analyze changed files
// 2. Select impacted tests (change-based)
// 3. Add critical path tests (risk-based)
// 4. Run in parallel across 4 workers
// 5. Report results with coverage metrics
```

### Visual Regression Testing

**qe-visual-tester** catches UI regressions:

```typescript
// Detect visual changes after code update
await agent.visualRegression({
  baseline: 'main-branch',
  current: 'feature-branch',
  pages: ['checkout', 'product-detail', 'cart'],
  threshold: 0.01 // 1% pixel difference tolerance
});

// Returns:
// {
//   changed: ['checkout-page'],
//   diff: {
//     'checkout-page': {
//       pixelDifference: 234,
//       percentageChange: 0.023,
//       screenshot: 'diff-checkout.png',
//       verdict: 'review-required'
//     }
//   }
// }
```

### Fleet-Coordinated Regression

```typescript
// Multiple agents collaborate on regression testing
const regressionFleet = await FleetManager.coordinate({
  strategy: 'comprehensive-regression',
  agents: [
    'qe-regression-risk-analyzer',  // 1. Analyze changes, select tests
    'qe-test-generator',            // 2. Generate missing regression tests
    'qe-test-executor',             // 3. Execute selected tests
    'qe-coverage-analyzer',         // 4. Analyze coverage gaps
    'qe-visual-tester',             // 5. Check visual regressions
    'qe-quality-gate'               // 6. Make GO/NO-GO decision
  ],
  topology: 'sequential'
});

// Execute full regression workflow
const result = await regressionFleet.execute({
  pr: 1234,
  release: 'v3.2.0',
  riskTolerance: 'low'
});

// Returns comprehensive regression report
```

### Production Regression Detection

**qe-production-intelligence** detects regressions in production:

```typescript
// Monitor production for regression signals
await agent.detectProductionRegression({
  baseline: 'v3.1.0',
  current: 'v3.2.0',
  metrics: ['error-rate', 'latency', 'conversion'],
  alertThreshold: 0.1 // 10% degradation
});

// Alerts if:
// - Error rate increases > 10%
// - Latency degrades > 10%
// - Conversion drops > 10%

// Enables fast rollback before major impact
```

---

## Related Skills

**Core Quality Practices:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven regression orchestration
- [holistic-testing-pact](../holistic-testing-pact/) - Regression across test quadrants
- [risk-based-testing](../risk-based-testing/) - Risk-based regression prioritization

**Testing Approaches:**
- [test-automation-strategy](../test-automation-strategy/) - Building automation pyramid with regression
- [api-testing-patterns](../api-testing-patterns/) - API regression testing
- [exploratory-testing-advanced](../exploratory-testing-advanced/) - Exploratory regression sessions
- [performance-testing](../performance-testing/) - Performance regression testing
- [security-testing](../security-testing/) - Security regression scans

**Development Practices:**
- [tdd-london-chicago](../tdd-london-chicago/) - Test-first creates regression safety
- [xp-practices](../xp-practices/) - Continuous integration with regression
- [refactoring-patterns](../refactoring-patterns/) - Safe refactoring with regression coverage

**Communication:**
- [quality-metrics](../quality-metrics/) - Regression test effectiveness metrics
- [bug-reporting-excellence](../bug-reporting-excellence/) - Regression test creation from bugs

---

## Remember

**Regression testing is insurance against change.**

Every code change is a risk. Regression testing mitigates that risk by:
- Verifying existing functionality still works
- Catching unintended side effects early
- Building confidence for continuous deployment
- Enabling safe refactoring and evolution

**Good regression testing is strategic, not exhaustive.**

You cannot test everything, every time. Smart regression testing:
- Selects tests based on changes and risk
- Runs fast enough for continuous feedback
- Maintains reliability (no flaky tests)
- Evolves with the product

**Perfect regression coverage is impossible. Effective regression testing is achievable.**

**With Agents**: Agents excel at intelligent test selection, impact analysis, automated test generation from bugs, and continuous regression monitoring. Use agents to make regression testing data-driven, efficient, and scalable.
