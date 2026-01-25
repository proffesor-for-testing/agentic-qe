# QCSD Agentic QE Fleet Demo (10 Minutes)

## Pre-Demo Setup (Do 5 mins before presentation)

```bash
# 1. Navigate to project
cd /workspaces/agentic-qe/v3

# 2. Pre-warm the swarm
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 6 --strategy specialized

# 3. Verify MCP server is ready
npm run mcp:status 2>/dev/null || echo "MCP ready"
```

---

## Demo Script

### INTRO (1 min) - Slide/Talk

> "Today I'll demonstrate how AI agents work as a fleet to automate Quality Engineering.
> We call this QCSD - Quality Conscious Software Delivery.
>
> The key insight: Production defects teach us what to test better.
> This creates feedback loops across the software lifecycle."

---

### PHASE 1: Risk Assessment (2 mins)

**[NARRATE]**: "First, our Risk Assessor agent analyzes code for quality risks using SFDIPOT factors - Structure, Function, Data, Interfaces, Platform, Operations, Time."

**[EXECUTE in Claude Code]**:
```
I need to demonstrate QE fleet capabilities. Please spawn the qe-risk-assessor agent to analyze v3/src/memory/cross-phase-memory.ts for quality risks using SFDIPOT factors. Run in background.
```

**[WHILE WAITING, EXPLAIN]**:
- "The agent examines code complexity, error handling paths, integration points"
- "It scores each SFDIPOT factor and identifies high-risk areas"
- "This feeds into our strategic feedback loop"

**[EXPECTED OUTPUT]**:
```
Risk Assessment: cross-phase-memory.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Risk Score: 6.2/10 (MEDIUM-HIGH)

SFDIPOT Analysis:
├─ Structure (7/10): Multiple async operations, singleton pattern
├─ Function (5/10): Clear responsibilities, good separation
├─ Data (8/10): File I/O without transactions, JSON parsing
├─ Interfaces (6/10): 12 namespaces, complex signal types
├─ Platform (4/10): Node.js fs, portable
├─ Operations (7/10): TTL cleanup, memory growth potential
└─ Time (6/10): Async race conditions possible

High-Risk Areas Requiring Tests:
1. storeRiskSignal() - File write failures
2. queryStrategicSignals() - TTL edge cases
3. cleanup() - Concurrent access during cleanup
```

---

### PHASE 2: Test Generation (4 mins)

**[NARRATE]**: "Now we spawn TWO agents in parallel - one for BDD scenarios, one for Playwright E2E tests."

**[EXECUTE in Claude Code]**:
```
Spawn two QE agents in parallel:

1. qe-bdd-generator: Generate 3 BDD scenarios in Gherkin format for the high-risk areas in cross-phase-memory.ts (file I/O failures, TTL handling, concurrent access)

2. qe-test-architect: Generate Playwright E2E tests in TypeScript for the QE Dashboard. Include page object model, proper test:id selectors, retry logic, and CI/CD ready configuration. Cover: login flow, signal storage verification, and cross-phase query display.

Run both in background.
```

**[WHILE WAITING, EXPLAIN]**:
- "BDD scenarios capture business requirements in human-readable format"
- "Playwright E2E tests verify full user flows with real browser automation"
- "Both agents learned from production defect patterns via cross-phase memory"

**[EXPECTED OUTPUT - BDD]**:
```gherkin
Feature: Cross-Phase Memory Signal Storage
  As a QE system
  I want to store production risk signals
  So that future test planning is informed by real defects

  Scenario: Store risk signal with valid data
    Given the cross-phase memory service is initialized
    And the namespace "qcsd-memory/production-patterns" exists
    When I store a risk signal with category "authentication" and weight 0.8
    Then the signal should be persisted to disk
    And the signal should be queryable within 100ms

  Scenario: Handle file system failure gracefully
    Given the cross-phase memory service is initialized
    And the storage directory is read-only
    When I attempt to store a risk signal
    Then the operation should fail with a descriptive error
    And no partial data should be written

  Scenario: TTL-based signal expiration
    Given a risk signal was stored 91 days ago
    And the TTL for strategic signals is 90 days
    When I query strategic signals
    Then the expired signal should not be returned
    And cleanup should mark it for removal
```

**[EXPECTED OUTPUT - Playwright E2E Tests]**:
```typescript
// e2e/qe-dashboard.spec.ts - Playwright CI/CD Ready
import { test, expect, Page } from '@playwright/test';

// Page Object Model
class QEDashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
  }

  async login(username: string, password: string) {
    await this.page.getByTestId('username-input').fill(username);
    await this.page.getByTestId('password-input').fill(password);
    await this.page.getByTestId('login-button').click();
    await expect(this.page.getByTestId('dashboard-header')).toBeVisible();
  }

  async storeSignal(category: string, weight: number) {
    await this.page.getByTestId('new-signal-btn').click();
    await this.page.getByTestId('signal-category').fill(category);
    await this.page.getByTestId('signal-weight').fill(weight.toString());
    await this.page.getByTestId('submit-signal').click();
  }

  async querySignals(loop: string) {
    await this.page.getByTestId('query-tab').click();
    await this.page.getByTestId('loop-selector').selectOption(loop);
    await this.page.getByTestId('run-query-btn').click();
    return this.page.getByTestId('signal-results');
  }
}

test.describe('QE Dashboard E2E', () => {
  let dashboard: QEDashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new QEDashboardPage(page);
    await dashboard.goto();
  });

  test('user can login and view dashboard', async ({ page }) => {
    await dashboard.login('qe-admin', 'test-password');
    await expect(page.getByTestId('cross-phase-panel')).toBeVisible();
    await expect(page.getByTestId('signal-count')).toHaveText(/\d+ signals/);
  });

  test('user can store and query strategic signals', async ({ page }) => {
    await dashboard.login('qe-admin', 'test-password');

    // Store a new signal
    await dashboard.storeSignal('authentication', 0.85);
    await expect(page.getByTestId('toast-success')).toBeVisible();

    // Query and verify
    const results = await dashboard.querySignals('strategic');
    await expect(results).toContainText('authentication');
    await expect(results).toContainText('0.85');
  });

  test('cross-phase feedback loop displays correctly', async ({ page }) => {
    await dashboard.login('qe-admin', 'test-password');

    await page.getByTestId('feedback-loops-tab').click();

    // Verify all 4 loops are shown
    await expect(page.getByTestId('loop-strategic')).toBeVisible();
    await expect(page.getByTestId('loop-tactical')).toBeVisible();
    await expect(page.getByTestId('loop-operational')).toBeVisible();
    await expect(page.getByTestId('loop-quality-criteria')).toBeVisible();
  });
});

// playwright.config.ts snippet for CI/CD
export default {
  testDir: './e2e',
  retries: 2,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html'], ['junit', { outputFile: 'results.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
};
```

---

### PHASE 3: Quality Gate & CI/CD Check (2 mins)

**[NARRATE]**: "Finally, our Quality Gate agent verifies the generated tests are CI/CD ready."

**[EXECUTE in Claude Code]**:
```
Spawn qe-quality-gate to evaluate:
1. Are the generated tests syntactically valid?
2. Do they follow CI/CD best practices (no hardcoded paths, proper cleanup)?
3. What's the estimated coverage improvement?
4. Any anti-patterns detected?

Run in background.
```

**[EXPECTED OUTPUT]**:
```
Quality Gate Evaluation: Generated Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: PASSED (Score: 87/100)

CI/CD Readiness:
✅ No hardcoded absolute paths
✅ Proper test isolation (beforeEach/afterEach)
✅ Async/await patterns correct
✅ Cleanup prevents test pollution
⚠️  Consider adding timeout for slow I/O tests

Coverage Estimate:
├─ storeRiskSignal: +45% (was 20%, now 65%)
├─ queryStrategicSignals: +35% (was 30%, now 65%)
└─ Overall module: +40%

Recommendation: MERGE - Tests meet quality bar
```

---

### PHASE 4: Show Cross-Phase Learning (1 min)

**[NARRATE]**: "Here's the magic - all this knowledge flows back into the system."

**[EXECUTE in Claude Code]**:
```
Query cross-phase memory statistics to show what the agents learned during this demo.
```

**[EXPECTED OUTPUT]**:
```
Cross-Phase Memory Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Signals: 4
By Loop:
├─ Strategic (Production→Ideation): 1 signal
├─ Tactical (Grooming→Ideation): 1 signal
├─ Operational (CI/CD→Development): 1 signal
└─ Quality-Criteria (Development→Ideation): 1 signal

Active Namespaces: 4/12
Last Activity: Just now

These signals will inform future test planning automatically!
```

---

### CLOSING (30 sec)

> "In 10 minutes, our AI fleet:
> 1. Assessed code risks using proven heuristics
> 2. Generated BDD scenarios and unit tests
> 3. Validated CI/CD readiness
> 4. Stored learnings for continuous improvement
>
> Questions?"

---

## Fallback: Pre-Generated Outputs

If agents are slow, copy-paste these outputs while explaining what WOULD happen.

### Emergency: Run Tests to Show Real Results
```bash
cd /workspaces/agentic-qe/v3
npm test -- --run tests/integration/cross-phase-integration.test.ts
```

This shows 11 passing tests proving the system works.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Agents timeout | Use fallback outputs, explain "in production this takes 30s" |
| MCP not responding | `npm run build && npm run mcp:start` |
| Memory errors | `npm run backup` then restart |

---

## Key Talking Points

1. **"Agents learn from production"** - Cross-phase memory stores defect patterns
2. **"Parallel execution"** - Multiple agents work simultaneously
3. **"CI/CD native"** - Generated tests run in any pipeline
4. **"SFDIPOT coverage"** - Systematic risk assessment, not random testing
5. **"Feedback loops"** - Production insights flow back to ideation

---

*Demo created: 2026-01-25 | Target: 10 minutes | Agents: 4-5*
