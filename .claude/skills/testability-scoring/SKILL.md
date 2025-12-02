---
name: "Testability Scoring"
description: "AI-powered testability assessment using 10 principles of intrinsic testability with Playwright. Evaluates web applications against Observability, Controllability, Algorithmic Simplicity, Algorithmic Transparency, Algorithmic Stability, Explainability, Unbugginess, Smallness, Decomposability, and Similarity. Use when assessing software testability, evaluating test readiness, identifying testability improvements, or generating testability reports for web applications."
---

# Testability Scoring

## What This Skill Does

Performs comprehensive AI-powered testability assessments of web applications using Playwright and the 10 Principles of Intrinsic Testability framework developed by James Bach and Michael Bolton. Generates detailed scoring reports with visual charts, metrics breakdowns, and actionable AI-driven recommendations for improving testability.

### Core Capabilities

- **10-Principle Analysis**: Complete assessment across all intrinsic testability dimensions
- **Quantitative Scoring**: 0-100 scale with letter grades (A-F) for each principle
- **AI-Enhanced Insights**: Intelligent recommendations powered by advanced analysis
- **Interactive HTML Reports**: Beautiful visual reports with Chart.js radar visualizations
- **Multi-User Comparison**: Side-by-side testability analysis across user types
- **Historical Tracking**: Progress measurement and improvement validation
- **Automated Analysis**: Hands-free assessment with error-resilient execution

## The 10 Principles of Intrinsic Testability

### 1. **Observability** (15% weight)
Can we see what's happening in the system?
- State visibility and capture
- Event logging and monitoring
- Network request tracking
- Error visibility
- Visual state inspection

### 2. **Controllability** (15% weight)
Can we control the application precisely?
- Direct input control
- State manipulation
- API accessibility
- Test data injection
- Deterministic behavior

### 3. **Algorithmic Simplicity** (10% weight)
Are behaviors simple and predictable?
- Clear input-output relationships
- Operation complexity
- Interaction patterns
- Behavior predictability

### 4. **Algorithmic Transparency** (10% weight)
Can we understand what the system does?
- Behavior visibility
- Process understanding
- Black box reduction
- Code readability indicators

### 5. **Algorithmic Stability** (10% weight)
Does behavior remain consistent?
- Change resilience
- Test maintainability
- Behavior consistency
- Version stability

### 6. **Explainability** (10% weight)
Can users and developers understand the interface?
- Documentation quality
- Code clarity
- Semantic structure
- Help text and guidance
- Error message clarity

### 7. **Unbugginess** (10% weight)
How error-free is the application?
- Console error tracking
- Page error monitoring
- Warning analysis
- Runtime stability

### 8. **Smallness** (10% weight)
Are components appropriately sized?
- Page complexity
- Element count
- Script/style bloat
- Component granularity

### 9. **Decomposability** (5% weight)
Can we test parts in isolation?
- Component separation
- Isolated testing capability
- Modular design
- Feature independence

### 10. **Similarity** (5% weight)
How familiar is the technology stack?
- Standard frameworks
- Common patterns
- Known platforms
- Familiar conventions

## Quick Start

### Method 1: Shell Script (Recommended)
```bash
# Run assessment on any URL (runtime override)
TEST_URL='https://example.com/' npx playwright test tests/testability-scoring/testability-scoring.spec.js --project=chromium --workers=1

# Or use the shell script wrapper
.claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/

# With specific browser
.claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/ firefox
```

### Method 2: Update Config File (Persistent)
```bash
# Update config for repeated runs
echo 'module.exports = { baseURL: "https://example.com/", ... };' > tests/testability-scoring/config.js

# Run assessment
npx playwright test tests/testability-scoring/testability-scoring.spec.js --project=chromium --workers=1
```

### Method 3: Generate HTML Report Only
```bash
# From existing JSON results
AUTO_OPEN=false node .claude/skills/testability-scoring/scripts/generate-html-report.js tests/reports/testability-results-*.json
```

## Complete Usage Guide

### Assessment Workflow

1. **Run Assessment**: Execute tests against target URL
2. **JSON Generation**: Automated results saved to `tests/reports/`
3. **HTML Report**: Interactive report with charts automatically generated
4. **Browser Opening**: Report opens automatically (configurable)
5. **Analysis**: Review scores, charts, and recommendations

### Configuration

#### Runtime URL Override (Recommended)
Use the `TEST_URL` environment variable for one-time assessments:
```bash
TEST_URL='https://example.com/' npx playwright test tests/testability-scoring/testability-scoring.spec.js --project=chromium --workers=1
```

#### Config File Location
`tests/testability-scoring/config.js`

```javascript
module.exports = {
  // Runtime URL override via TEST_URL environment variable
  baseURL: process.env.TEST_URL || 'https://your-application.com/',
  timeout: 60000,        // 60 second timeout
  networkTimeout: 15000  // 15 second network idle timeout
};
```

#### Playwright Configuration
Located in `playwright.config.js`:
- Timeout: 60s per test
- Workers: 1 (serial execution)
- Launch args: `--no-sandbox`, `--disable-dev-shm-usage`
- Viewport: 1280x720
- ignoreHTTPSErrors: true

### Environment Variables

```bash
# Disable automatic browser opening
AUTO_OPEN=false .claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/

# With custom timeout
timeout 180 .claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/
```

## Assessment Script Architecture

### Error Handling Strategy

The assessment script uses **progressive fallback** strategy:

```javascript
// Navigation with multi-level fallback
async function navigateToPage(page) {
  try {
    // Level 1: domcontentloaded
    await page.goto(baseURL, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    // Level 2: networkidle with timeout
    await page.waitForLoadState('networkidle', {
      timeout: 15000
    }).catch(() => console.log('[NAV] Continuing without networkidle'));

    return true;
  } catch (error) {
    // Level 3: commit fallback
    await page.goto(baseURL, {
      waitUntil: 'commit',
      timeout: 45000
    });
    return true;
  }
}
```

### Default Scoring

All principles initialized with default scores (50/F) before testing:
```javascript
function initializeDefaultScores() {
  testabilityScores.principles = {
    observability: { score: 50, grade: 'F', weight: 15 },
    controllability: { score: 50, grade: 'F', weight: 15 },
    algorithmicSimplicity: { score: 50, grade: 'F', weight: 10 },
    algorithmicTransparency: { score: 50, grade: 'F', weight: 10 },
    algorithmicStability: { score: 50, grade: 'F', weight: 10 },
    explainability: { score: 50, grade: 'F', weight: 10 },
    unbugginess: { score: 50, grade: 'F', weight: 10 },
    smallness: { score: 50, grade: 'F', weight: 10 },
    decomposability: { score: 50, grade: 'F', weight: 5 },
    similarity: { score: 50, grade: 'F', weight: 5 }
  };
}
```

### Test Execution Pattern

Each principle test follows this pattern:
```javascript
test('1. Observability Assessment', async ({ page }) => {
  try {
    const loaded = await navigateToPage(page);
    if (!loaded) throw new Error('Failed to load page');

    // Principle-specific analysis
    let score = 0;
    // ... scoring logic ...

    testabilityScores.principles.observability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.observability
    };

    // Generate recommendations if score is low
    if (score < 70) {
      testabilityScores.recommendations.push({
        principle: 'Observability',
        severity: 'medium',
        recommendation: 'Implement detailed event logging...',
        impact: 15,
        effort: 'Low (4-6 hours)'
      });
    }
  } catch (error) {
    console.error('Observability assessment failed:', error.message);
    // Fallback to default score
    testabilityScores.principles.observability = {
      score: 50,
      grade: 'F',
      weight: config.weights.observability
    };
  }
});
```

## HTML Report Features

### Interactive Elements

- **Radar Chart**: Visual representation of all 10 principles
- **Score Cards**: Color-coded principle scores with grades
- **Detailed Breakdowns**: Expandable sections for each principle
- **Recommendations**: Prioritized improvement suggestions
- **Metadata**: URL, browser, version, duration, timestamp

### Chart.js Integration

Reports use Chart.js for beautiful visualizations:
```javascript
new Chart(ctx, {
  type: 'radar',
  data: {
    labels: [
      'Observability', 'Controllability', 'Simplicity',
      'Transparency', 'Explainability', 'Similarity',
      'Stability', 'Unbugginess', 'Smallness', 'Decomposability'
    ],
    datasets: [{
      label: 'Testability Scores',
      data: [92, 20, 75, 60, 75, 85, 70, 85, 95, 70],
      backgroundColor: 'rgba(74, 144, 226, 0.2)',
      borderColor: 'rgba(74, 144, 226, 1)',
      pointBackgroundColor: 'rgba(74, 144, 226, 1)'
    }]
  }
});
```

### Report Sections

1. **Executive Summary**: Overall score, grade, and quick stats
2. **Principle Scores**: Detailed breakdown with grades
3. **Visual Analysis**: Radar chart and score distribution
4. **Recommendations**: Actionable improvements prioritized by impact
5. **Metadata**: Assessment details and context

## Scoring Methodology

### Grade Scale
- **90-100 (A)**: Excellent testability
- **80-89 (B)**: Good testability
- **70-79 (C)**: Adequate testability
- **60-69 (D)**: Below average testability
- **0-59 (F)**: Poor testability

### Weighted Calculation

Overall score uses weighted average:
```javascript
function calculateOverallScore(principles) {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const [principle, data] of Object.entries(principles)) {
    totalWeightedScore += data.score * data.weight;
    totalWeight += data.weight;
  }

  return Math.round(totalWeightedScore / totalWeight);
}
```

### Letter Grade Assignment
```javascript
function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
```

## File Structure

```
.claude/skills/testability-scoring/
├── SKILL.md                              # This file
├── README.md                             # Quick reference
├── scripts/
│   ├── run-assessment.sh                 # Main assessment runner
│   └── generate-html-report.js           # HTML report generator
└── resources/
    └── templates/
        └── testability-scoring.spec.template.js  # Test template

tests/testability-scoring/
├── testability-scoring.spec.js           # Main test file
├── config.js                             # Runtime configuration
└── playwright.config.js                  # (optional) Test-specific config

tests/reports/
├── testability-results-<timestamp>.json  # JSON results
├── testability-report-<timestamp>.html   # HTML reports
└── latest.json                           # Symlink to latest results
```

## Example Assessments

### Example 1: High Testability Site
```bash
$ .claude/skills/testability-scoring/scripts/run-assessment.sh https://talesoftesting.com/

Results:
Overall Score: 71/100 (C)
- Observability: 92 (A)
- Controllability: 20 (F)
- Algorithmic Simplicity: 75 (C)
- Algorithmic Transparency: 60 (D)
- Explainability: 75 (C)
- Similarity: 85 (B)
- Algorithmic Stability: 70 (C)
- Unbugginess: 85 (B)
- Smallness: 95 (A)
- Decomposability: 70 (C)
```

### Example 2: E-Commerce Site
```bash
$ .claude/skills/testability-scoring/scripts/run-assessment.sh https://www.saucedemo.com/

Results:
Overall Score: 69/100 (D)
- Observability: 92 (A) - Excellent
- Controllability: 20 (F) - Critical Issue
- Smallness: 100 (A) - Perfect
- Similarity: 85 (B)
- Unbugginess: 85 (B)
- Algorithmic Simplicity: 75 (C)
- Algorithmic Stability: 70 (C)
- Algorithmic Transparency: 60 (D)
- Explainability: 60 (D)
- Decomposability: 50 (F)
```

## Integration Examples

### CI/CD Integration
```yaml
# GitHub Actions
- name: Testability Assessment
  run: |
    timeout 180 .claude/skills/testability-scoring/scripts/run-assessment.sh ${{ env.APP_URL }}

- name: Upload Reports
  uses: actions/upload-artifact@v3
  with:
    name: testability-reports
    path: tests/reports/testability-*.html
```

### Programmatic Usage
```javascript
const { spawn } = require('child_process');

function runTestabilityAssessment(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('.claude/skills/testability-scoring/scripts/run-assessment.sh', [url]);

    let output = '';
    proc.stdout.on('data', data => output += data);

    proc.on('close', code => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Assessment failed with code ${code}`));
      }
    });
  });
}

// Usage
const results = await runTestabilityAssessment('https://example.com/');
console.log(results);
```

## Best Practices

### 1. Baseline Establishment
- Run initial assessment to establish baseline
- Document scores before any changes
- Create historical comparison point

### 2. Focus Areas
- Prioritize principles with lowest scores
- Address "F" grades first (scores < 60)
- Target quick wins (low effort, high impact)

### 3. Iterative Improvement
- Make targeted changes
- Re-run assessment to validate
- Track progress over time

### 4. Continuous Monitoring
- Integrate into CI/CD pipeline
- Set minimum score thresholds
- Alert on score degradation

### 5. Multi-User Testing
- Test with different user personas
- Compare accessibility across roles
- Identify role-specific issues

## Troubleshooting

### Common Issues

#### Tests Timing Out
```bash
# Increase timeout
timeout 300 .claude/skills/testability-scoring/scripts/run-assessment.sh https://slow-site.com/
```

#### Partial Results (Not All 10 Principles)
- Check for JavaScript errors in console
- Verify network connectivity
- Increase timeouts in playwright.config.js
- Review navigation fallback strategy

#### HTML Report Not Opening
```bash
# Disable auto-open and open manually
AUTO_OPEN=false .claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/

# Then open manually
open tests/reports/testability-report-<timestamp>.html
```

#### Config Not Updating
```bash
# Manually update config
echo 'module.exports = { baseURL: "https://example.com/" };' > tests/testability-scoring/config.js

# Run direct playwright
npx playwright test tests/testability-scoring/testability-scoring.spec.js --project=chromium --workers=1
```

## Advanced Features

### Custom Scoring Weights

Modify weights in test spec file:
```javascript
const config = {
  weights: {
    observability: 20,        // Increased importance
    controllability: 20,      // Increased importance
    algorithmicSimplicity: 10,
    algorithmicTransparency: 5, // Decreased importance
    algorithmicStability: 5,
    explainability: 10,
    unbugginess: 10,
    smallness: 10,
    decomposability: 5,
    similarity: 5
  }
};
```

### Custom Recommendations

Add domain-specific recommendations:
```javascript
if (score < 70) {
  testabilityScores.recommendations.push({
    principle: 'Observability',
    severity: 'critical',
    recommendation: 'Implement centralized logging with Datadog',
    impact: 25,
    effort: 'Medium (1-2 days)',
    priority: 'P0'
  });
}
```

### Multi-Browser Comparison
```bash
# Run on all browsers
for browser in chromium firefox webkit; do
  .claude/skills/testability-scoring/scripts/run-assessment.sh https://example.com/ $browser
done
```

## Performance Considerations

- **Serial Execution**: Tests run with `--workers=1` for consistent results
- **Timeout Strategy**: Progressive fallback (domcontentloaded -> commit)
- **Network Handling**: 15s networkidle with graceful continuation
- **Error Resilience**: Default scores prevent incomplete reports
- **Memory Management**: Single worker prevents memory exhaustion

## Limitations

- **Client-Side Only**: Assesses UI/frontend, not backend APIs directly
- **Snapshot Assessment**: Point-in-time analysis, not continuous monitoring
- **Heuristic-Based**: Scores are estimates based on observable patterns
- **Browser-Dependent**: Results may vary slightly across browsers
- **Static Analysis**: Cannot assess dynamic runtime behaviors fully

## Credits & References

### Framework Origin
- **Heuristics for Software Testability** by James Bach and Michael Bolton
- Available at: https://www.satisfice.com/download/heuristics-of-software-testability

### Implementation
- Based on https://github.com/fndlalit/testability-scorer
- Playwright v1.49.0+ with AI capabilities
- Chart.js for visualizations

### Inspiration
- Conference workshop material by Lalit Kumar
- Interactive demonstrations for teaching testability concepts

## Support

### Resources
- [Playwright Documentation](https://playwright.dev/)
- [Intrinsic Testability Heuristics](https://www.satisfice.com/download/heuristics-of-software-testability)
- [Original Repository](https://github.com/fndlalit/testability-scorer)

---

**Version**: 1.0.0
**Last Updated**: December 2025
**Compatibility**: Claude Code 2.0+, Playwright 1.49.0+
