---
name: "verification-quality"
description: "Verify agent outputs with truth scoring, validate code changes before merge, and auto-rollback failed quality checks. Use when setting up verification gates, monitoring code correctness, or integrating quality checks into CI/CD."
---

# Verification & Quality Assurance

Truth scoring, automated verification checks, auto-rollback, and CI/CD quality integration.

## Quick Start

```bash
# View truth scores
npx claude-flow@alpha truth

# Run verification
npx claude-flow@alpha verify check

# Verify specific file
npx claude-flow@alpha verify check --file src/app.js --threshold 0.98

# Rollback last failure
npx claude-flow@alpha verify rollback --last-good
```

## Truth Scoring (0.0-1.0)

| Range | Rating | Action |
|-------|--------|--------|
| 0.95-1.0 | Excellent | Production-ready |
| 0.85-0.94 | Good | Acceptable |
| 0.75-0.84 | Warning | Needs attention |
| < 0.75 | Critical | Immediate action required |

```bash
# View scores for specific agent
npx claude-flow@alpha truth --agent coder --period 24h

# JSON output for CI
npx claude-flow@alpha truth --format json

# Watch mode
npx claude-flow@alpha truth --watch

# Export metrics
npx claude-flow@alpha truth --export .claude-flow/metrics/truth-$(date +%Y%m%d).json
```

## Verification Checks

```bash
# Single file
npx claude-flow@alpha verify check --file src/app.js

# Directory
npx claude-flow@alpha verify check --directory src/

# With auto-fix
npx claude-flow@alpha verify check --file src/utils.js --auto-fix

# Batch verification
npx claude-flow@alpha verify batch --pattern "src/**/*.ts" --parallel
```

**Criteria evaluated:** Code correctness, best practices (SOLID), security (vulnerability scanning, secret detection), performance (complexity, memory), documentation (JSDoc completeness).

### CI/CD JSON Output

```bash
npx claude-flow@alpha verify check --json > verification.json
```

```json
{
  "overallScore": 0.947,
  "passed": true,
  "threshold": 0.95,
  "checks": [
    { "name": "code-correctness", "score": 0.98, "passed": true },
    { "name": "security", "score": 0.91, "passed": false, "issues": [] }
  ]
}
```

## Auto-Rollback

```bash
# Rollback to last good state
npx claude-flow@alpha verify rollback --last-good

# Selective rollback (preserve good changes)
npx claude-flow@alpha verify rollback --selective

# Dry-run preview
npx claude-flow@alpha verify rollback --dry-run
```

## GitHub Actions Integration

```yaml
name: Quality Verification
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - name: Run Verification
        run: npx claude-flow@alpha verify check --json > verification.json
      - name: Check Truth Score
        run: |
          score=$(jq '.overallScore' verification.json)
          if (( $(echo "$score < 0.95" | bc -l) )); then
            echo "Truth score too low: $score"
            exit 1
          fi
      - uses: actions/upload-artifact@v3
        with:
          name: verification-report
          path: verification.json
```

## Configuration

```json
{
  "verification": {
    "threshold": 0.95,
    "autoRollback": true,
    "hooks": { "preCommit": true, "preTask": true, "postEdit": true },
    "checks": { "codeCorrectness": true, "security": true, "performance": true, "documentation": true }
  },
  "truth": {
    "warningThreshold": 0.85,
    "criticalThreshold": 0.75,
    "autoExport": { "enabled": true, "path": ".claude-flow/metrics/truth-daily.json" }
  }
}
```

Per-environment thresholds: production 0.99, staging 0.95, development 0.90.

## Skill Composition

- **Before verification** -> Run `/qe-test-generation` and `/qe-coverage-analysis` first
- **If verification fails** -> Use `/test-failure-investigator` for root cause analysis
- **Ship decision** -> Feed into `/qe-quality-assessment` for final assessment

## Gotchas

- Verification is the HIGHEST-VALUE skill category -- worth spending a week making excellent
- Swallow passing test output, surface only errors -- avoid context window flooding
- Agent completion claims are unreliable -- always include programmatic assertions on state
- Record video of output (Playwright trace, screenshot evidence) for audit
- Hardcoded values are the #1 completion theater pattern -- grep for literals that should be dynamic

## Exit Codes

- `0`: Passed (score >= threshold)
- `1`: Failed (score < threshold)
- `2`: Error (invalid input, system error)
