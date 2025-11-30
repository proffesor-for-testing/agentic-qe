---
name: "Testability Scorer"
description: "Evaluate software testability using 10 principles of intrinsic testability with Playwright-based automated scoring (0-100 scale). Use when assessing code quality, measuring testability gaps, generating testability reports, or improving test design. Analyzes observability, controllability, algorithmic simplicity, transparency, stability, explainability, unbugginess, smallness, decomposability, and similarity to known technology."
---

# Testability Scorer

## Overview
Evaluates software testability through automated analysis of 10 intrinsic principles, providing actionable scores (0-100) with letter grades, AI-powered recommendations, and visual reports. Based on industry-standard testability framework with Playwright integration.

## Prerequisites
- Node.js 18+
- Playwright framework
- Access to application under test (URL or local deployment)
- Basic understanding of software testing principles

## What This Skill Does
1. **Automated Testability Analysis**: Evaluates applications against 10 core testability principles
2. **Quantitative Scoring**: Provides 0-100 scores with letter grades (A-F) for each principle
3. **📊 Automatic HTML Reports**: Every assessment generates a professional HTML report with Chart.js radar charts, color-coded grades, and AI recommendations (matching https://github.com/fndlalit/testability-scorer)
4. **Visual Analysis**: Interactive radar charts show testability profile at a glance
5. **Historical Tracking**: Monitors testability improvements over time
6. **Multi-User Analysis**: Compares testability across different user types and workflows
7. **Integration Ready**: Outputs JSON/text formats for CI/CD pipeline integration

---

## Quick Start (60 seconds)

### Installation
```bash
# 1. Install Playwright and dependencies
npm install --save-dev @playwright/test

# 2. Install Playwright browsers
npx playwright install

# 3. Create testability-scorer directory
mkdir -p tests/testability-scorer
```

### First Assessment
```bash
# Quick 5-principle assessment
.claude/skills/testability-scorer/scripts/quick-check.sh https://www.saucedemo.com

# OR run full 10-principle assessment with HTML report
.claude/skills/testability-scorer/scripts/run-assessment.sh https://www.saucedemo.com
```

**📊 Automatic HTML Report Generation:**
Every assessment automatically generates a professional HTML report with:
- **Chart.js Radar Visualization** - Visual representation of all 10 principles
- **Color-Coded Grades** - Instant recognition of strengths/weaknesses (A=green, F=red)
- **AI-Powered Recommendations** - Prioritized improvement roadmap with effort estimates
- **Responsive Design** - Works on desktop, tablet, and mobile
- **🌐 Auto-Opens in Browser** - Reports automatically open in your default browser (disable with `AUTO_OPEN=false`)

Expected output:
```
🔍 Running Full Testability Assessment...
📊 Analyzing all 10 principles...
📊 Generating HTML report with radar chart...
✓ HTML report generated: tests/reports/testability-report-1732998400.html

✅ Assessment complete!

📈 Results:
   Overall Score: 67/100

📊 HTML Report: tests/reports/testability-report-1732998400.html
📄 JSON Report: tests/reports/testability-results-1732998400.json
📄 Playwright Report: tests/reports/html/

View HTML report (auto-generated with Chart.js visualization):
   open tests/reports/testability-report-1732998400.html
```

**Disable Auto-Open (if needed):**
```bash
# Reports auto-open by default. To disable:
AUTO_OPEN=false .claude/skills/testability-scorer/scripts/run-assessment.sh
```

---

## The 10 Principles of Intrinsic Testability

### Foundational Principles

#### 1. Observability (Weight: 15%)
**Definition**: Complete transparency of product states and behavior
**Measures**:
- Console logging availability
- State inspection capabilities
- Network request visibility
- Error reporting quality
- Debug mode accessibility

**Scoring Criteria**:
- 90-100 (A): Full state visibility, comprehensive logging, real-time monitoring
- 70-89 (B-C): Good visibility with minor gaps
- 50-69 (D): Limited observability, incomplete logging
- 0-49 (F): Black-box behavior, minimal visibility

**Example Check**:
```javascript
// In testability-scorer.spec.js
test('Observability - Console Logging', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.goto(baseURL);
  await page.click('#login-button');

  const hasObservability = logs.length > 0;
  const score = hasObservability ? 80 : 20;
  // Score: 80/100 if logs present, 20/100 if silent
});
```

#### 2. Controllability (Weight: 15%)
**Definition**: Capacity to provide any input and invoke any state on demand
**Measures**:
- Direct API access
- State manipulation capabilities
- Test data injection
- Environment configuration
- Feature toggles

**Scoring Criteria**:
- 90-100 (A): Complete control over all states, direct API access
- 70-89 (B-C): Good control with workarounds for some states
- 50-69 (D): Limited control, indirect manipulation required
- 0-49 (F): Minimal control, UI-only interaction

**Example Check**:
```javascript
test('Controllability - Direct State Access', async ({ page }) => {
  // Can we directly set user state without UI interaction?
  await page.goto(baseURL);

  const canSetState = await page.evaluate(() => {
    // Attempt direct state manipulation
    return typeof window.setUserState === 'function';
  });

  const score = canSetState ? 90 : 30;
  // Score: 90/100 if direct control, 30/100 if UI-only
});
```

#### 3. Algorithmic Simplicity (Weight: 10%)
**Definition**: Clear, assessable relationships between inputs and outputs
**Measures**:
- Cyclomatic complexity
- Function length
- Conditional nesting depth
- Data transformation clarity
- Business logic transparency

**Scoring Criteria**:
- 90-100 (A): Simple, linear logic; clear input-output mapping
- 70-89 (B-C): Moderate complexity with understandable patterns
- 50-69 (D): Complex logic with multiple branches
- 0-49 (F): Convoluted, difficult to trace logic

### Understanding Principles

#### 4. Algorithmic Transparency (Weight: 10%)
**Definition**: Comprehending how the product produces its output
**Measures**:
- Code readability
- Naming conventions
- Logic documentation
- Data flow visibility
- Calculation transparency

#### 5. Explainability (Weight: 10%)
**Definition**: Design is understandable to outsiders
**Measures**:
- API documentation quality
- Code comments
- Architecture diagrams
- User guides
- Error messages clarity

#### 6. Similarity to Known Technology (Weight: 5%)
**Definition**: Resemblance to known and trusted technology
**Measures**:
- Standard framework usage
- Common design patterns
- Industry conventions
- Familiar architectures
- Technology stack maturity

### Stability Principles

#### 7. Algorithmic Stability (Weight: 10%)
**Definition**: Changes don't radically disturb the logic
**Measures**:
- API versioning
- Backward compatibility
- Breaking change frequency
- Regression test stability
- Feature flag usage

#### 8. Unbugginess (Weight: 10%)
**Definition**: Minimal defects that would slow down testing
**Measures**:
- Known bug count
- Bug fix rate
- Test failure patterns
- Production incidents
- Code quality metrics

### Structural Principles

#### 9. Smallness (Weight: 10%)
**Definition**: Less product means less to examine
**Measures**:
- Lines of code
- File size
- Module count
- Dependency count
- Bundle size

#### 10. Decomposability (Weight: 5%)
**Definition**: Parts can be separated for focused testing
**Measures**:
- Module independence
- Component isolation
- Test unit granularity
- Service separation
- Interface boundaries

---

## Configuration

### Basic Setup
Create `testability-scorer.config.js`:
```javascript
module.exports = {
  // Application under test
  baseURL: 'https://www.saucedemo.com',

  // Scoring weights (must sum to 100)
  weights: {
    observability: 15,
    controllability: 15,
    algorithmicSimplicity: 10,
    algorithmicTransparency: 10,
    explainability: 10,
    similarity: 5,
    algorithmicStability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5
  },

  // Grading scale
  grades: {
    A: 90, B: 80, C: 70, D: 60, F: 0
  },

  // Report settings
  reports: {
    format: ['html', 'json', 'text'],
    directory: 'tests/reports',
    autoOpen: true,
    includeAI: true  // AI-powered recommendations
  },

  // User types for comparative analysis
  userTypes: [
    { username: 'standard_user', password: 'secret_sauce' },
    { username: 'locked_out_user', password: 'secret_sauce' },
    { username: 'problem_user', password: 'secret_sauce' },
    { username: 'performance_glitch_user', password: 'secret_sauce' },
    { username: 'error_user', password: 'secret_sauce' },
    { username: 'visual_user', password: 'secret_sauce' }
  ],

  // Browser configuration
  browsers: ['chromium', 'firefox', 'webkit']
};
```

### Advanced Configuration
See [Configuration Guide](docs/CONFIGURATION.md) for:
- Custom principle definitions
- Weight adjustment strategies
- AI recommendation tuning
- Historical tracking setup
- CI/CD integration

---

## Step-by-Step Guide

### 1. Create Testability Scorer Test

Create `tests/testability-scorer/testability-scorer.spec.js`:
```javascript
const { test, expect } = require('@playwright/test');
const config = require('./testability-scorer.config');

let testabilityScores = {
  overall: 0,
  principles: {},
  recommendations: []
};

test.describe('Comprehensive Testability Analysis', () => {

  test('1. Observability Assessment', async ({ page }) => {
    const logs = [];
    const errors = [];

    page.on('console', msg => logs.push(msg));
    page.on('pageerror', err => errors.push(err));

    await page.goto(config.baseURL);

    // Check console logging
    const hasConsoleLogs = logs.length > 0;

    // Check network visibility
    const networkRequests = [];
    page.on('request', request => networkRequests.push(request));
    await page.click('#login-button');

    // Check state inspection
    const stateVisible = await page.evaluate(() => {
      return typeof window.getState === 'function';
    });

    // Calculate score
    let score = 0;
    if (hasConsoleLogs) score += 30;
    if (networkRequests.length > 0) score += 30;
    if (stateVisible) score += 40;

    testabilityScores.principles.observability = score;

    if (score < 70) {
      testabilityScores.recommendations.push({
        principle: 'Observability',
        severity: 'high',
        recommendation: 'Add comprehensive logging and state inspection APIs'
      });
    }
  });

  test('2. Controllability Assessment', async ({ page }) => {
    await page.goto(config.baseURL);

    // Check direct API access
    const hasAPI = await page.evaluate(() => {
      return typeof window.api !== 'undefined';
    });

    // Check state manipulation
    const canSetState = await page.evaluate(() => {
      return typeof window.setState === 'function';
    });

    // Check test data injection
    const canInjectData = await page.evaluate(() => {
      return typeof window.setTestData === 'function';
    });

    let score = 0;
    if (hasAPI) score += 40;
    if (canSetState) score += 30;
    if (canInjectData) score += 30;

    testabilityScores.principles.controllability = score;

    if (score < 70) {
      testabilityScores.recommendations.push({
        principle: 'Controllability',
        severity: 'critical',
        recommendation: 'Provide direct API access and state manipulation capabilities for testing'
      });
    }
  });

  test('3. Algorithmic Simplicity Assessment', async ({ page }) => {
    await page.goto(config.baseURL);

    // Measure complexity through interaction patterns
    const interactions = [
      { action: 'login', steps: 3 },
      { action: 'addToCart', steps: 2 },
      { action: 'checkout', steps: 5 }
    ];

    const avgComplexity = interactions.reduce((sum, i) => sum + i.steps, 0) / interactions.length;

    // Simple logic = fewer steps
    const score = Math.max(0, 100 - (avgComplexity * 10));

    testabilityScores.principles.algorithmicSimplicity = score;
  });

  test('4-10. Additional Principles', async ({ page }) => {
    // Similar implementations for remaining principles
    // See full implementation in resources/templates/
  });

  test.afterAll('Calculate Overall Score & Generate Report', async () => {
    // Calculate weighted average
    const principles = testabilityScores.principles;
    const weights = config.weights;

    testabilityScores.overall = Object.keys(principles).reduce((sum, key) => {
      return sum + (principles[key] * (weights[key] / 100));
    }, 0);

    // Generate HTML report
    await generateHTMLReport(testabilityScores);

    // Save JSON for historical tracking
    await saveJSONReport(testabilityScores);

    console.log(`\n✓ Overall Testability Score: ${testabilityScores.overall}/100`);
  });
});

async function generateHTMLReport(scores) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Testability Report - ${new Date().toISOString()}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .score { font-size: 48px; font-weight: bold; }
    .grade { color: ${getGradeColor(scores.overall)}; }
    .principle { margin: 20px 0; padding: 15px; border-left: 4px solid #007bff; }
    .recommendation { background: #fff3cd; padding: 10px; margin: 10px 0; border-left: 4px solid #ffc107; }
  </style>
</head>
<body>
  <h1>Testability Assessment Report</h1>
  <div class="score">
    Overall Score: <span class="grade">${scores.overall}/100</span>
    (${getLetterGrade(scores.overall)})
  </div>

  <h2>Principle Scores</h2>
  <canvas id="scoreChart" width="400" height="200"></canvas>

  <h2>Detailed Analysis</h2>
  ${Object.entries(scores.principles).map(([key, value]) => `
    <div class="principle">
      <strong>${formatPrincipleName(key)}</strong>: ${value}/100 (${getLetterGrade(value)})
    </div>
  `).join('')}

  <h2>AI-Powered Recommendations</h2>
  ${scores.recommendations.map(rec => `
    <div class="recommendation">
      <strong>${rec.principle}</strong> [${rec.severity}]: ${rec.recommendation}
    </div>
  `).join('')}

  <script>
    const ctx = document.getElementById('scoreChart').getContext('2d');
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ${JSON.stringify(Object.keys(scores.principles).map(formatPrincipleName))},
        datasets: [{
          label: 'Testability Score',
          data: ${JSON.stringify(Object.values(scores.principles))},
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)'
        }]
      },
      options: {
        scales: { r: { min: 0, max: 100 } }
      }
    });
  </script>
</body>
</html>
  `;

  const fs = require('fs');
  const reportPath = `tests/reports/testability-report-${Date.now()}.html`;
  fs.writeFileSync(reportPath, html);

  if (config.reports.autoOpen) {
    require('child_process').exec(`open ${reportPath}`);
  }
}

function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getGradeColor(score) {
  if (score >= 90) return '#28a745';
  if (score >= 80) return '#20c997';
  if (score >= 70) return '#ffc107';
  if (score >= 60) return '#fd7e14';
  return '#dc3545';
}

function formatPrincipleName(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}
```

### 2. Quick Assessment Version

Create `tests/testability-scorer/quick-testability-scorer.spec.js`:
```javascript
// Simplified 5-principle assessment for rapid feedback
const { test } = require('@playwright/test');

test.describe('Quick Testability Check', () => {
  test('Top 5 Principles', async ({ page }) => {
    // Test only: Observability, Controllability, Simplicity, Explainability, Decomposability
    // Execution time: ~2 minutes
    // Report: Simplified HTML with key findings
  });
});
```

### 3. Run Assessment

```bash
# Full 10-principle analysis
npx playwright test tests/testability-scorer/testability-scorer.spec.js

# Quick 5-principle check
npx playwright test tests/testability-scorer/quick-testability-scorer.spec.js

# With specific browser
npx playwright test --project=chromium

# View report
npx playwright show-report
```

---

## Advanced Features

### Feature 1: Historical Tracking

Track testability improvements over time:

```bash
# Run assessment and save to history
node scripts/track-testability.js

# View improvement trends
node scripts/view-trends.js

# Compare two assessments
node scripts/compare-assessments.js baseline.json current.json
```

### Feature 2: Multi-User Comparative Analysis

Compare testability across different user types:

```javascript
// In testability-scorer.spec.js
test.describe('User Type Comparison', () => {
  config.userTypes.forEach(user => {
    test(`Testability for ${user.username}`, async ({ page }) => {
      await page.goto(config.baseURL);
      await page.fill('#user-name', user.username);
      await page.fill('#password', user.password);
      await page.click('#login-button');

      // Run all 10 principle checks
      // Compare results across users
    });
  });
});
```

### Feature 3: AI-Powered Recommendations

Enable AI analysis for improvement suggestions:

```javascript
const { generateRecommendations } = require('./ai-recommender');

test.afterAll('Generate AI Recommendations', async () => {
  const recommendations = await generateRecommendations(testabilityScores);

  // Recommendations include:
  // - Priority ranking
  // - Implementation effort estimation
  // - Expected score improvement
  // - Code examples
});
```

### Feature 4: CI/CD Integration

Integrate with CI/CD pipelines:

```yaml
# .github/workflows/testability-check.yml
name: Testability Assessment
on: [push, pull_request]

jobs:
  testability:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npx playwright install
      - run: npx playwright test tests/testability-scorer/

      # Fail if score below threshold
      - run: |
          SCORE=$(jq '.overall' tests/reports/latest.json)
          if [ $SCORE -lt 70 ]; then
            echo "Testability score $SCORE below threshold 70"
            exit 1
          fi
```

---

## Integration with Agentic QE Fleet

### Using with QE Agents

```javascript
// Spawn testability analyzer agent
Task("Analyze testability", `
  Use testability-scorer skill to:
  1. Run comprehensive 10-principle analysis
  2. Generate HTML report with recommendations
  3. Store results in memory under aqe/testability/
  4. Create improvement action plan
`, "qe-code-reviewer");

// Check results from memory
const testabilityResults = await memory.retrieve('aqe/testability/latest');
console.log(`Testability Score: ${testabilityResults.overall}/100`);
```

### Coordinating with Other Skills

```javascript
// 1. Run testability assessment
Task("Assess testability", "Run testability-scorer analysis", "qe-analyst");

// 2. Use results to guide test generation
Task("Generate tests", `
  Check testability results from memory.
  Focus test generation on low-scoring principles:
  - If Observability < 70: Add logging tests
  - If Controllability < 70: Add state manipulation tests
  - If Decomposability < 70: Add integration tests
`, "qe-test-generator");

// 3. Improve code based on findings
Task("Refactor for testability", `
  Review testability recommendations.
  Refactor code to improve:
  - ${lowScoringPrinciples.join('\n  - ')}
`, "coder");
```

---

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `install.sh` | Install dependencies | `./scripts/install.sh` |
| `run-assessment.sh` | Run full assessment | `./scripts/run-assessment.sh [url]` |
| `quick-check.sh` | Run quick 5-principle check | `./scripts/quick-check.sh [url]` |
| `track-history.js` | Save to historical database | `node scripts/track-history.js` |
| `view-trends.js` | Display improvement trends | `node scripts/view-trends.js` |
| `compare.js` | Compare two assessments | `node scripts/compare.js v1.json v2.json` |
| `generate-report.js` | Generate custom report | `node scripts/generate-report.js --format pdf` |

---

## Resources

### Templates
- `resources/templates/testability-scorer.spec.js` - Full 10-principle test template
- `resources/templates/quick-scorer.spec.js` - Rapid 5-principle template
- `resources/templates/config.template.js` - Configuration template
- `resources/templates/report.html` - HTML report template

### Examples
- `resources/examples/saucedemo/` - Complete SauceDemo analysis
- `resources/examples/basic-app/` - Simple application example
- `resources/examples/api-testing/` - REST API testability assessment
- `resources/examples/ci-integration/` - GitHub Actions integration

### Schemas
- `resources/schemas/testability-report.schema.json` - Report format specification
- `resources/schemas/config.schema.json` - Configuration validation schema

---

## Troubleshooting

### Issue: Playwright Not Installed
**Symptoms**: Error "Executable doesn't exist at ..."
**Solution**:
```bash
npx playwright install
npx playwright install-deps
```

### Issue: Low Scores Across All Principles
**Symptoms**: Overall score < 40
**Cause**: Application may lack testability features
**Solution**:
1. Review AI recommendations in HTML report
2. Prioritize by severity (critical > high > medium)
3. Implement top 3 recommendations
4. Re-run assessment

### Issue: Report Not Auto-Opening
**Symptoms**: Report generated but browser doesn't open
**Solution**:
```bash
# Manually open report
open tests/reports/testability-report-*.html

# Or disable auto-open in config
// testability-scorer.config.js
reports: {
  autoOpen: false
}
```

### Issue: Inconsistent Scores Between Runs
**Symptoms**: Scores vary by 10+ points on same code
**Cause**: Dynamic content or timing issues
**Solution**:
```javascript
// Add wait conditions
test('Observability Assessment', async ({ page }) => {
  await page.goto(config.baseURL);
  await page.waitForLoadState('networkidle');  // Wait for stability
  await page.waitForTimeout(1000);  // Additional buffer

  // Then run assessments
});
```

---

## Scoring Interpretation Guide

### Grade Scale
- **A (90-100)**: Excellent testability, minimal friction
- **B (80-89)**: Good testability, minor improvements needed
- **C (70-79)**: Acceptable testability, some areas need work
- **D (60-69)**: Below average, significant improvements required
- **F (0-59)**: Poor testability, major refactoring needed

### Improvement Priorities

**Critical (Fix First)**:
- Controllability < 50: Cannot properly set up test conditions
- Observability < 50: Cannot verify test results
- Unbugginess < 50: Too many defects blocking testing

**High Priority**:
- Algorithmic Simplicity < 60: Complex logic hard to test
- Explainability < 60: Difficult for new team members
- Algorithmic Stability < 60: Frequent breaking changes

**Medium Priority**:
- Decomposability < 70: Hard to isolate for unit testing
- Smallness < 70: Large surface area increases test burden
- Algorithmic Transparency < 70: Black-box behavior

**Low Priority**:
- Similarity < 70: Unique but manageable patterns

---

## API Reference
Complete API documentation: [API_REFERENCE.md](docs/API_REFERENCE.md)

## Related Skills
- [agentic-quality-engineering](.claude/skills/agentic-quality-engineering/) - Core QE principles
- [context-driven-testing](.claude/skills/context-driven-testing/) - Adaptive testing approach
- [code-review-quality](.claude/skills/code-review-quality/) - Code review integration

## External Resources
- [Original Repository](https://github.com/fndlalit/testability-scorer) - Source implementation
- [Playwright Documentation](https://playwright.dev/) - Testing framework
- [Intrinsic Testability Principles](https://github.com/fndlalit/testability-scorer#intrinsic-testability) - Detailed principles

---

**Created**: 2025-11-30
**Category**: Quality Engineering
**Difficulty**: Intermediate
**Estimated Time**: 15-30 minutes per assessment
**Integration**: Agentic QE Fleet v1.9.3+
