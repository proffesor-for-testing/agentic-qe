# Testability Scorer - Example Usage

Complete examples demonstrating how to use the testability scorer skill in real-world scenarios.

---

## Example 1: Quick Assessment of a React App

### Scenario
You have a React todo application and want a rapid testability check.

### Commands
```bash
# Navigate to skill directory
cd .claude/skills/testability-scorer

# Run quick 5-principle assessment
./scripts/quick-check.sh https://todomvc.com/examples/react
```

### Expected Output
```
⚡ Running Quick Testability Check (5 principles)...
   URL: https://todomvc.com/examples/react
   Estimated time: 2 minutes

Running 5 of 5 tests

  ✓ 1. Observability Assessment (3s)
    - Console logging: Present ✓
    - Network visibility: Good ✓
    - State inspection: Limited ⚠️
    Score: 68/100 (D)

  ✗ 2. Controllability Assessment (2s)
    - Direct API access: Not found ✗
    - State manipulation: Not available ✗
    - Test data injection: Not supported ✗
    Score: 45/100 (F) ⚠️

  ✓ 3. Algorithmic Simplicity Assessment (2s)
    - Logic complexity: Low ✓
    - Interaction patterns: Simple ✓
    - Data flow: Clear ✓
    Score: 82/100 (B)

  ✗ 4. Explainability Assessment (3s)
    - Documentation: Minimal ⚠️
    - Error messages: Generic ⚠️
    - Code comments: Sparse ⚠️
    Score: 51/100 (F)

  ✓ 5. Decomposability Assessment (2s)
    - Component isolation: Good ✓
    - Module separation: Clear ✓
    - Test boundaries: Defined ✓
    Score: 74/100 (C)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 QUICK TESTABILITY SCORE: 64/100 (D)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Critical Issues:
  • Controllability: 45/100 - Add test APIs
  • Explainability: 51/100 - Improve documentation

💡 Quick Wins (+23 points potential):
  1. Add window.testAPI for state control (+15)
  2. Add JSDoc comments (+8)

✅ Quick check complete!

For comprehensive 10-principle analysis:
   ./scripts/run-assessment.sh https://todomvc.com/examples/react
```

---

## Example 2: Full Assessment with Report

### Scenario
Comprehensive testability analysis with detailed HTML report.

### Commands
```bash
# Run full 10-principle assessment
./scripts/run-assessment.sh https://www.saucedemo.com chromium
```

### Expected Output
```
🔍 Running Full Testability Assessment...
   URL: https://www.saucedemo.com
   Browser: chromium

📊 Analyzing all 10 principles...

[chromium] › testability-scorer.spec.js:12:1

  ✓ 1/10 Observability Assessment (5.2s)
    ├─ Console logs: 12 messages ✓
    ├─ Network requests: 8 tracked ✓
    ├─ State visibility: Partial ⚠️
    ├─ Error reporting: Good ✓
    └─ Debug mode: Available ✓
    Score: 76/100 (C)

  ✗ 2/10 Controllability Assessment (3.8s)
    ├─ Direct API: Not available ✗
    ├─ State manipulation: UI-only ✗
    ├─ Test data: No injection ✗
    ├─ Environment config: Limited ⚠️
    └─ Feature toggles: None ✗
    Score: 26/100 (F) ⚠️

  ✓ 3/10 Algorithmic Simplicity (4.1s)
    ├─ Workflow steps: 3-5 average ✓
    ├─ Logic branches: Moderate ✓
    ├─ Data transforms: Clear ✓
    └─ Business logic: Transparent ✓
    Score: 62/100 (D)

  ✓ 4/10 Algorithmic Transparency (3.5s)
    ├─ Code readability: Good ✓
    ├─ Naming: Descriptive ✓
    ├─ Data flow: Visible ✓
    └─ Calculations: Clear ✓
    Score: 71/100 (C)

  ✗ 5/10 Explainability (4.2s)
    ├─ API docs: Minimal ⚠️
    ├─ Code comments: Sparse ⚠️
    ├─ User guides: Basic ⚠️
    └─ Error messages: Generic ⚠️
    Score: 34/100 (F) ⚠️

  ✓ 6/10 Similarity to Known Tech (2.8s)
    ├─ Framework: React (standard) ✓
    ├─ Patterns: Common ✓
    ├─ Architecture: Familiar ✓
    └─ Tech stack: Mature ✓
    Score: 89/100 (B)

  ✓ 7/10 Algorithmic Stability (3.9s)
    ├─ API versioning: Present ✓
    ├─ Breaking changes: Infrequent ✓
    ├─ Regression tests: Partial ⚠️
    └─ Feature flags: Some ✓
    Score: 64/100 (D)

  ✓ 8/10 Unbugginess (4.5s)
    ├─ Console errors: 2 found ⚠️
    ├─ Failed requests: 0 ✓
    ├─ UI glitches: Minor ⚠️
    └─ Test stability: Good ✓
    Score: 77/100 (C)

  ✓ 9/10 Smallness (2.1s)
    ├─ Page size: 850KB ✓
    ├─ JS bundle: 420KB ✓
    ├─ Dependencies: 23 ✓
    └─ Complexity: Low ✓
    Score: 85/100 (B)

  ✓ 10/10 Decomposability (3.2s)
    ├─ Components: 18 isolated ✓
    ├─ Services: 5 separated ✓
    ├─ Test units: Clear ✓
    └─ Interfaces: Defined ✓
    Score: 61/100 (D)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 OVERALL TESTABILITY SCORE: 52/100 (F)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Grade Distribution:
   A (90-100): 0 principles
   B (80-89):  2 principles ✓ (Similarity, Smallness)
   C (70-79):  3 principles ✓ (Observability, Transparency, Unbugginess)
   D (60-69):  3 principles ⚠️ (Simplicity, Stability, Decomposability)
   F (0-59):   2 principles ✗ (Controllability, Explainability)

🚨 Critical Failures (F grade):
   1. Controllability: 26/100 - Cannot manipulate state directly
   2. Explainability: 34/100 - Poor documentation and error messages

📊 Generating reports...
   ✓ HTML report: tests/reports/testability-report-1732992000.html
   ✓ JSON report: tests/reports/testability-report-1732992000.json
   ✓ Text summary: tests/reports/testability-report-1732992000.txt

🤖 AI-Powered Recommendations (Top 5):

   1. 🔴 CRITICAL: Add Test Mode API
      Principle: Controllability
      Impact: +40 points (26 → 66)
      Effort: Medium (4-8 hours)

      Code Example:
      ```javascript
      // In your app initialization
      if (process.env.NODE_ENV === 'test') {
        window.testAPI = {
          getState: () => store.getState(),
          setState: (state) => store.setState(state),
          clearData: () => store.reset(),
          addUser: (user) => store.dispatch(addUser(user))
        };
      }
      ```

   2. 🔴 HIGH: Improve API Documentation
      Principle: Explainability
      Impact: +25 points (34 → 59)
      Effort: Low (2-4 hours)

      Add JSDoc comments, OpenAPI spec, and README

   3. 🟡 MEDIUM: Add State Logging
      Principle: Observability
      Impact: +15 points (76 → 91)
      Effort: Low (1-2 hours)

      Integrate Redux DevTools or custom logger

   4. 🟡 MEDIUM: Implement Feature Flags
      Principle: Algorithmic Stability
      Impact: +12 points (64 → 76)
      Effort: Medium (4-6 hours)

   5. 🟢 LOW: Add Error Context
      Principle: Explainability
      Impact: +8 points (34 → 42)
      Effort: Low (1-2 hours)

      Include helpful error messages with action steps

💰 Total Potential Improvement: +100 points → Score: 152/100
📊 Realistic Improvement (Top 3): +52 points → Score: 104/100
🎯 Achievable Target (6-12 hours): Score: 90/100 (A)

✅ Assessment complete!

📄 View full report:
   open tests/reports/testability-report-1732992000.html

📈 Track improvements:
   node scripts/view-trends.js
```

---

## Example 3: Using with Claude Code (Natural Language)

### Scenario
Ask Claude to analyze testability using natural language.

### Prompt
```
"Analyze the testability of the SauceDemo application and tell me what improvements would have the biggest impact"
```

### Claude's Response
```
I'll analyze the testability of the SauceDemo application using the testability-scorer skill.

[Claude automatically recognizes the testability-scorer skill and uses it]

I've completed a comprehensive testability assessment of SauceDemo. Here are the key findings:

**Overall Score: 52/100 (F)**

**Critical Issues:**

1. **Controllability: 26/100 (F) - CRITICAL**
   - The application lacks direct API access for testing
   - Cannot manipulate state without going through UI
   - No test data injection capabilities

   **Impact of fixing: +40 points**

   Recommendation: Add a test mode API:
   ```javascript
   if (process.env.NODE_ENV === 'test') {
     window.testAPI = {
       login: (username) => { /* direct login */ },
       addToCart: (items) => { /* skip UI navigation */ },
       getCartState: () => { /* read cart directly */ }
     };
   }
   ```

2. **Explainability: 34/100 (F) - HIGH PRIORITY**
   - Minimal API documentation
   - Generic error messages
   - Sparse code comments

   **Impact of fixing: +25 points**

   Recommendation: Add JSDoc comments and improve error messages

**Quick Wins (Highest ROI):**

1. **Add test API** (4-8 hours) → +40 points
2. **Document API endpoints** (2-4 hours) → +25 points
3. **Add state logging** (1-2 hours) → +15 points

**Projected improvement:** From 52/100 (F) to 132/100 → realistically 90/100 (A) with top 3 fixes

Would you like me to:
1. Generate tests focusing on the weak areas?
2. Implement the test API recommendation?
3. Create a detailed improvement roadmap?
```

---

## Example 4: Using with QE Agents

### Scenario
Spawn a QE agent to analyze testability and create an action plan.

### Command (In Claude Code)
```javascript
Task("Analyze and improve testability", `
  Use the testability-scorer skill to:
  1. Run full assessment on https://www.saucedemo.com
  2. Analyze results and identify top 3 critical issues
  3. Store results in memory under aqe/testability/saucedemo
  4. Create a prioritized improvement roadmap with effort estimates
  5. Generate code examples for top recommendation
`, "qe-analyst");
```

### Agent Output
```
🤖 QE Analyst Agent

Task: Analyze and improve testability

Step 1: Running testability assessment...
✓ Completed assessment in 42 seconds

Step 2: Analyzing results...
✓ Overall score: 52/100 (F)
✓ Identified 2 critical failures
✓ Identified 3 high-priority improvements

Step 3: Storing in memory...
✓ Stored at aqe/testability/saucedemo/baseline
✓ Stored at aqe/testability/saucedemo/latest
✓ Stored at aqe/testability/saucedemo/recommendations

Step 4: Creating improvement roadmap...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 TESTABILITY IMPROVEMENT ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase 1 (Week 1): Critical Fixes [+65 points]

  1.1 Add Test Mode API
      Principle: Controllability (26 → 86)
      Effort: 6-8 hours
      Priority: CRITICAL

      Tasks:
      - Create window.testAPI object
      - Add state getters/setters
      - Add data injection methods
      - Document API usage

      Success Criteria:
      - Can set any app state directly
      - Can inject test data via API
      - Controllability score > 70

  1.2 Improve Documentation
      Principle: Explainability (34 → 59)
      Effort: 4-6 hours
      Priority: HIGH

      Tasks:
      - Add JSDoc to all public methods
      - Create API reference doc
      - Document error codes
      - Add usage examples

      Success Criteria:
      - All APIs documented
      - Error messages include help text
      - Explainability score > 50

Phase 2 (Week 2): High-Impact Improvements [+23 points]

  2.1 Add State Logging
      Principle: Observability (76 → 91)
      Effort: 2-3 hours
      Priority: MEDIUM

      Tasks:
      - Add Redux DevTools integration
      - Implement state change logging
      - Add performance monitoring

  2.2 Implement Feature Flags
      Principle: Algorithmic Stability (64 → 76)
      Effort: 4-6 hours
      Priority: MEDIUM

Phase 3 (Week 3): Polish [+12 points]

  3.1 Improve Error Messages
  3.2 Add Integration Tests
  3.3 Document Architecture

Expected Results:
  Current:  52/100 (F)
  Phase 1:  117/100 → capped at 100/100 (A)

  Minimum viable: Phase 1 only (2 weeks)
  Recommended: Phase 1 + Phase 2 (3 weeks)

Step 5: Generating code examples...

Example: Test Mode API Implementation

```javascript
// src/utils/testMode.js
export function initializeTestMode() {
  if (process.env.NODE_ENV !== 'test') {
    return;
  }

  window.testAPI = {
    // Authentication
    login: (username) => {
      const user = getUserByName(username);
      store.dispatch(loginSuccess(user));
      return user;
    },

    logout: () => {
      store.dispatch(logoutUser());
    },

    // State management
    getState: () => {
      return store.getState();
    },

    setState: (state) => {
      store.replaceState(state);
    },

    // Cart operations
    addToCart: (items) => {
      items.forEach(item => {
        store.dispatch(addItem(item));
      });
    },

    clearCart: () => {
      store.dispatch(clearCart());
    },

    getCart: () => {
      return store.getState().cart;
    },

    // Data injection
    setProducts: (products) => {
      store.dispatch(loadProducts(products));
    },

    // Utilities
    reset: () => {
      store.dispatch(resetApp());
      localStorage.clear();
    }
  };

  console.log('✓ Test API initialized');
  console.log('Available methods:', Object.keys(window.testAPI));
}
```

Usage in tests:
```javascript
// tests/cart.spec.js
test('Add items to cart via API', async ({ page }) => {
  await page.goto('https://www.saucedemo.com');

  // Use test API instead of UI navigation
  await page.evaluate(() => {
    window.testAPI.login('standard_user');
    window.testAPI.addToCart([
      { id: 1, name: 'Sauce Labs Backpack', price: 29.99 },
      { id: 2, name: 'Sauce Labs Bike Light', price: 9.99 }
    ]);
  });

  const cart = await page.evaluate(() => window.testAPI.getCart());
  expect(cart.items.length).toBe(2);
  expect(cart.total).toBe(39.98);
});
```

✅ Task complete!

Next steps:
1. Review roadmap and approve phases
2. Implement Phase 1 (critical fixes)
3. Re-run assessment to validate improvements
4. Generate tests using improved testability
```

---

## Example 5: CI/CD Pipeline Integration

### Scenario
Add testability checks to GitHub Actions pipeline.

### Workflow File
```yaml
# .github/workflows/testability.yml
name: Testability Quality Gate

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  testability-check:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd .claude/skills/testability-scorer
          chmod +x scripts/*.sh
          ./scripts/install.sh

      - name: Start application
        run: |
          npm install
          npm start &
          npx wait-on http://localhost:3000

      - name: Run testability assessment
        run: |
          cd .claude/skills/testability-scorer
          ./scripts/run-assessment.sh http://localhost:3000 chromium

      - name: Check testability threshold
        run: |
          SCORE=$(jq '.overall' tests/reports/latest.json)
          echo "Testability Score: $SCORE/100"

          if [ "$SCORE" -lt 70 ]; then
            echo "❌ Testability score $SCORE below threshold 70"
            jq -r '.recommendations[] | "- [\(.severity)] \(.principle): \(.recommendation)"' tests/reports/latest.json
            exit 1
          else
            echo "✅ Testability score $SCORE meets threshold"
          fi

      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: testability-report
          path: tests/reports/testability-report-*.html

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('tests/reports/latest.json'));

            const grade = report.grade;
            const emoji = grade === 'A' ? '🌟' : grade === 'B' ? '✅' : grade === 'C' ? '⚠️' : '❌';

            const body = `
            ## ${emoji} Testability Assessment Results

            **Overall Score:** ${report.overall}/100 (${grade})

            ### Principle Scores
            ${Object.entries(report.principles).map(([key, val]) =>
              `- **${key}**: ${val.score}/100 (${val.grade})`
            ).join('\n')}

            ### Top Recommendations
            ${report.recommendations.slice(0, 3).map((rec, i) =>
              `${i+1}. **[${rec.severity.toUpperCase()}]** ${rec.principle}: ${rec.recommendation}`
            ).join('\n')}

            [View Full Report](../artifacts/testability-report)
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### Pipeline Output
```
✓ Checkout code
✓ Setup Node.js
✓ Install dependencies
✓ Start application
✓ Run testability assessment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Testability Assessment Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Overall Score: 52/100 (F)

Critical Issues:
- [CRITICAL] Controllability: Add test mode API
- [HIGH] Explainability: Improve documentation

❌ Testability score 52 below threshold 70

Blocking deployment. Please fix critical issues.

✓ Uploaded HTML report to artifacts
✓ Posted comment on PR #123
```

---

## Example 6: Tracking Improvements Over Time

### Scenario
Run assessments periodically and track testability improvements.

### Initial Assessment (Week 1)
```bash
./scripts/run-assessment.sh https://myapp.com
# Score: 52/100 (F)
```

### After Implementing Recommendations (Week 2)
```bash
# Implement test API
git checkout -b feature/test-api
# ... make changes ...
git commit -m "feat: add test mode API for better controllability"

# Re-run assessment
./scripts/run-assessment.sh https://myapp.com
# Score: 76/100 (C) +24 points ⬆️
```

### View Improvement Trends
```bash
node scripts/view-trends.js
```

### Output
```
📈 Testability Improvement Trends

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Assessment History (Last 30 days)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date                Score  Grade  Change    Trigger
────────────────────────────────────────────────────────────────
2025-11-23 10:00    52     F      baseline  Initial assessment
2025-11-25 14:30    62     D      +10 ⬆️    Added state logging
2025-11-27 09:15    76     C      +14 ⬆️    Implemented test API
2025-11-29 16:45    85     B      +9  ⬆️    Improved documentation
2025-11-30 11:20    92     A      +7  ⬆️    Added feature flags

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Principle Improvements
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Principle                Week 1  Week 2  Week 3  Week 4  Change
────────────────────────────────────────────────────────────────
Observability            76      82      85      90      +14 ⬆️
Controllability          26      28      85      90      +64 🚀
Algorithmic Simplicity   62      65      68      70      +8  ⬆️
Algorithmic Transparency 71      73      75      78      +7  ⬆️
Explainability           34      38      65      85      +51 🚀
Similarity               89      89      90      92      +3  ✓
Algorithmic Stability    64      68      72      88      +24 ⬆️
Unbugginess              77      79      82      88      +11 ⬆️
Smallness                85      86      87      88      +3  ✓
Decomposability          61      64      68      72      +11 ⬆️

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Key Achievements
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Went from F to A grade in 4 weeks
✓ Eliminated all F-grade principles
✓ Improved by 40 points overall (+77%)
✓ Biggest wins:
  • Controllability: +64 points (26 → 90)
  • Explainability: +51 points (34 → 85)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Remaining Opportunities
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 To reach 95/100 (A+):
  1. Algorithmic Simplicity: 70 → 85 (+15 points)
     - Reduce workflow complexity
     - Simplify business logic

  2. Decomposability: 72 → 85 (+13 points)
     - Further isolate components
     - Improve service boundaries

Estimated effort: 1-2 weeks
Projected score: 95/100 (A+)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Chart: https://myapp.com/testability-trends
📄 Detailed report: tests/reports/trends-2025-11-30.html
```

---

## Example 7: Multi-User Comparative Analysis

### Scenario
Compare testability across different user types to find role-specific issues.

### Configuration
```javascript
// tests/testability-scorer/config.js
module.exports = {
  baseURL: 'https://www.saucedemo.com',
  userTypes: [
    { username: 'standard_user', password: 'secret_sauce', role: 'standard' },
    { username: 'locked_out_user', password: 'secret_sauce', role: 'locked' },
    { username: 'problem_user', password: 'secret_sauce', role: 'problem' },
    { username: 'performance_glitch_user', password: 'secret_sauce', role: 'performance' }
  ]
};
```

### Run Comparative Analysis
```bash
npx playwright test tests/testability-scorer/multi-user-comparison.spec.js
```

### Output
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Multi-User Testability Comparison
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Type          Overall  Observ  Control  Simple  Explain
───────────────────────────────────────────────────────────────
standard_user      52 (F)   76 (C)  26 (F)   62 (D)  34 (F)
locked_out_user    45 (F)   68 (D)  20 (F)   58 (F)  30 (F)  ⚠️
problem_user       38 (F)   52 (F)  18 (F)   45 (F)  25 (F)  ⚠️
performance_user   41 (F)   60 (D)  22 (F)   51 (F)  28 (F)  ⚠️

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 Key Findings:

1. Standard User: Best testability
   - Most reliable user type for testing
   - Highest scores across all principles

2. Problem User: Worst testability (-14 points)
   - Observability issues (cart display bugs)
   - Simplicity problems (unexpected behavior)
   - Recommend: Fix user-specific bugs first

3. All Users: Controllability Critical
   - All users score F in controllability
   - Universal issue, not user-specific
   - Priority: Implement test API

4. Performance User: Timing Issues
   - Observability affected by delays
   - Consider: Add wait strategies for tests

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recommendations:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Universal Improvements (All Users):
   • Add test API → +40 points across all users
   • Improve docs → +25 points across all users

🎯 User-Specific Fixes:
   • Problem user: Fix cart display bug → +20 points
   • Performance user: Optimize load times → +15 points
   • Locked out user: Better error messaging → +10 points

Expected Impact:
   Standard user: 52 → 92 (+40 points)
   Problem user:  38 → 78 (+40 points)
```

---

These examples demonstrate the skill's versatility across different use cases - from quick CLI checks to complex CI/CD integration and AI agent coordination. The skill adapts to your workflow whether you're doing manual testing, automated assessments, or building comprehensive quality gates.

Would you like me to show more examples for specific scenarios?
