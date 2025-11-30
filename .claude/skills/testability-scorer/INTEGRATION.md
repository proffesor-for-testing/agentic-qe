# Testability Scorer - Integration Guide

How to integrate the testability scorer skill with the Agentic QE Fleet.

## Quick Integration

The testability scorer skill is automatically available to Claude Code and all QE agents once installed.

### Claude Code Usage

Simply mention testability scoring in your prompts:

```
"Analyze the testability of my React application at http://localhost:3000"
```

Claude will automatically:
1. Recognize the testability-scorer skill
2. Run the assessment
3. Generate reports
4. Provide recommendations

### QE Agent Usage

Spawn QE agents to use the skill:

```javascript
Task("Analyze testability", `
  Use testability-scorer skill to:
  1. Run full 10-principle assessment on http://localhost:3000
  2. Generate HTML and JSON reports
  3. Store results in memory under aqe/testability/myapp
  4. Create prioritized improvement plan
`, "qe-analyst");
```

## Integration with QE Fleet

### 1. Testability Analysis Phase

```javascript
// Phase 1: Initial assessment
Task("Testability baseline", `
  Use testability-scorer skill:
  - Run quick check on application
  - Identify critical weaknesses (score < 50)
  - Store baseline in memory (aqe/testability/baseline)
`, "qe-analyst");
```

### 2. Test Generation Phase

```javascript
// Phase 2: Generate tests based on findings
Task("Generate targeted tests", `
  Review testability results from memory.
  Generate tests for weak principles:
  - If Observability < 70: Add state verification tests
  - If Controllability < 70: Add state manipulation tests
  - If Decomposability < 70: Add integration tests
`, "qe-test-generator");
```

### 3. Code Improvement Phase

```javascript
// Phase 3: Implement improvements
Task("Improve testability", `
  Review top 3 recommendations from testability analysis.
  Refactor code to improve scores:
  1. [Recommendation 1]
  2. [Recommendation 2]
  3. [Recommendation 3]
`, "coder");
```

### 4. Validation Phase

```javascript
// Phase 4: Re-assess and validate
Task("Validate improvements", `
  Use testability-scorer skill:
  - Run full assessment
  - Compare with baseline from memory
  - Verify score improvements
  - Update memory with new results
`, "qe-analyst");
```

## Memory Integration

The skill stores results in the AQE memory namespace:

### Storing Results

```javascript
// Automatically stored by the skill
{
  "aqe/testability/myapp/baseline": {
    "overall": 71,
    "timestamp": "2025-11-30T10:00:00Z",
    "principles": { /* ... */ }
  },
  "aqe/testability/myapp/latest": {
    "overall": 86,
    "timestamp": "2025-11-30T11:30:00Z",
    "improvement": +15
  }
}
```

### Retrieving Results

```javascript
Task("Review testability", `
  Retrieve testability results from memory:
  - aqe/testability/myapp/baseline
  - aqe/testability/myapp/latest

  Calculate improvement and create summary report
`, "qe-analyst");
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/testability.yml
name: Testability Check
on: [push, pull_request]

jobs:
  testability:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: |
          cd .claude/skills/testability-scorer
          ./scripts/install.sh

      - name: Run testability assessment
        run: |
          cd .claude/skills/testability-scorer
          ./scripts/run-assessment.sh http://localhost:3000 chromium

      - name: Check threshold
        run: |
          SCORE=$(cat tests/reports/latest.json | jq '.overall')
          echo "Testability Score: $SCORE"
          if [ $SCORE -lt 70 ]; then
            echo "Score below threshold (70)"
            exit 1
          fi

      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: testability-report
          path: tests/reports/testability-report-*.html
```

### GitLab CI

```yaml
# .gitlab-ci.yml
testability:
  stage: test
  script:
    - cd .claude/skills/testability-scorer
    - ./scripts/install.sh
    - ./scripts/run-assessment.sh $APP_URL chromium
    - SCORE=$(cat tests/reports/latest.json | jq '.overall')
    - echo "Testability Score:" $SCORE
    - if [ $SCORE -lt 70 ]; then exit 1; fi
  artifacts:
    paths:
      - tests/reports/
    expire_in: 30 days
```

## Workflow Integration

### Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash

echo "Running testability quick check..."
cd .claude/skills/testability-scorer
./scripts/quick-check.sh http://localhost:3000

if [ $? -ne 0 ]; then
  echo "Testability check failed. Commit blocked."
  exit 1
fi
```

### Pre-push Hook

```bash
# .git/hooks/pre-push
#!/bin/bash

echo "Running full testability assessment..."
cd .claude/skills/testability-scorer
./scripts/run-assessment.sh http://localhost:3000

SCORE=$(cat tests/reports/latest.json | jq '.overall')
if [ $SCORE -lt 70 ]; then
  echo "Testability score $SCORE below threshold 70"
  echo "Push blocked. Improve testability first."
  exit 1
fi
```

## Skill Coordination

### Parallel Agent Execution

```javascript
// Single message with multiple agents using testability data
[
  Task("Analyze testability", "Run testability-scorer assessment", "qe-analyst"),
  Task("Analyze coverage", "Check code coverage gaps", "qe-coverage-analyzer"),
  Task("Security scan", "Run security analysis", "qe-security-scanner")
]

// Later, coordinate results
Task("Synthesize findings", `
  Combine results from memory:
  - aqe/testability/latest (testability scores)
  - aqe/coverage/latest (coverage analysis)
  - aqe/security/latest (security findings)

  Create unified quality report
`, "qe-analyst");
```

### Sequential Workflow

```javascript
// Step 1: Baseline
Task("Establish baseline", "Run testability assessment, store in memory", "qe-analyst");

// Step 2: Generate tests (depends on Step 1)
Task("Generate tests", "Use testability findings to create test suite", "qe-test-generator");

// Step 3: Implement improvements (depends on Step 1)
Task("Improve code", "Implement top 3 testability recommendations", "coder");

// Step 4: Validate (depends on Step 3)
Task("Validate improvements", "Re-run assessment, compare with baseline", "qe-analyst");
```

## Custom Integration Patterns

### Pattern 1: Continuous Monitoring

```javascript
// Run testability check on every build
setInterval(async () => {
  const result = await Task(
    "Monitor testability",
    "Run quick testability check, alert if score drops",
    "qe-analyst"
  );

  if (result.overall < 70) {
    notify("Testability score dropped to " + result.overall);
  }
}, 3600000); // Every hour
```

### Pattern 2: Feature Branch Validation

```javascript
// Before merging feature branch
Task("Validate feature testability", `
  1. Checkout feature branch
  2. Run testability assessment
  3. Compare with main branch baseline
  4. Block merge if score decreased by >10 points
`, "qe-analyst");
```

### Pattern 3: Release Gate

```javascript
// Before production release
Task("Release quality gate", `
  1. Run full testability assessment
  2. Check all principles meet minimum thresholds
  3. Verify no critical (F-grade) principles
  4. Generate release quality report

  Block release if:
  - Overall score < 80
  - Any principle scores F
  - Controllability < 70
  - Observability < 70
`, "qe-quality-gate");
```

## API Integration

### Node.js

```javascript
const { runTestabilityAssessment } = require('./.claude/skills/testability-scorer/api');

async function checkTestability() {
  const result = await runTestabilityAssessment({
    url: 'http://localhost:3000',
    browser: 'chromium',
    format: 'json'
  });

  console.log('Testability Score:', result.overall);

  if (result.overall < 70) {
    throw new Error('Testability threshold not met');
  }

  return result;
}
```

### REST API

```javascript
// Expose testability assessment via REST API
app.post('/api/testability/assess', async (req, res) => {
  const { url, browser } = req.body;

  const result = await runTestabilityAssessment({ url, browser });

  res.json({
    score: result.overall,
    grade: result.grade,
    recommendations: result.recommendations,
    reportUrl: result.reportPath
  });
});
```

## Dashboard Integration

### Grafana

```javascript
// Export metrics to Prometheus
testability_score{app="myapp"} 86
testability_observability{app="myapp"} 68
testability_controllability{app="myapp"} 75
testability_simplicity{app="myapp"} 82
```

### Custom Dashboard

```javascript
// Store historical data for charting
const history = await getTestabilityHistory();

renderChart({
  type: 'line',
  data: {
    labels: history.map(h => h.timestamp),
    datasets: [{
      label: 'Overall Score',
      data: history.map(h => h.overall)
    }]
  }
});
```

## Notification Integration

### Slack

```javascript
if (score < previousScore) {
  await slack.postMessage({
    channel: '#quality',
    text: `⚠️ Testability score dropped from ${previousScore} to ${score}`,
    attachments: [{
      title: 'Top Recommendations',
      text: recommendations.slice(0, 3).join('\n')
    }]
  });
}
```

### Email

```javascript
if (score < 70) {
  await sendEmail({
    to: 'team@example.com',
    subject: 'Testability Alert',
    body: `Testability score: ${score}/100\nReport: ${reportUrl}`
  });
}
```

## Best Practices

1. **Automate regularly** - Run assessments on every build
2. **Set thresholds** - Define clear pass/fail criteria
3. **Track trends** - Monitor improvements over time
4. **Share reports** - Make results visible to team
5. **Act on findings** - Implement top recommendations
6. **Coordinate agents** - Use with other QE skills
7. **Store in memory** - Enable agent collaboration

## Troubleshooting Integration

### Issue: Skill not detected by Claude

**Solution:**
```bash
# Verify skill location
ls -la .claude/skills/testability-scorer/SKILL.md

# Restart Claude Code
# Skill should appear in skill list
```

### Issue: Agents can't access results

**Solution:**
```javascript
// Ensure results are stored in correct memory namespace
await memory.store('aqe/testability/myapp', results);

// Verify storage
const stored = await memory.retrieve('aqe/testability/myapp');
console.log(stored);
```

### Issue: CI/CD pipeline fails

**Solution:**
```bash
# Check Playwright installation
npx playwright install --with-deps

# Verify config
node scripts/validate-config.js

# Test locally first
./scripts/run-assessment.sh http://localhost:3000
```

## Related Documentation

- [SKILL.md](SKILL.md) - Complete skill documentation
- [README.md](README.md) - Quick reference
- [CONFIGURATION.md](docs/CONFIGURATION.md) - Configuration guide
- [Basic Usage](resources/examples/basic-usage.md) - Step-by-step tutorial

## Support

For integration questions or issues:
- Check [Troubleshooting](SKILL.md#troubleshooting)
- Review [Examples](resources/examples/)
- Consult [AQE Fleet Documentation](../../README.md)
