---
name: coverage-guard
description: "Use when you want to prevent coverage regressions during development. Activate with /coverage-guard to warn when coverage drops below threshold after code changes."
user-invocable: true
---

# Coverage Guard Mode

When activated, checks coverage after test runs and warns if it drops below the configured threshold.

## What It Does

After any test execution (via Bash tool), compares coverage to the threshold in config.json. Warns (doesn't block) if coverage decreased.

## Activation

```
/coverage-guard
```

## Configuration

Edit `config.json` in this skill directory to set thresholds:

```json
{
  "thresholds": {
    "statements": 80,
    "branches": 70,
    "functions": 75,
    "lines": 80
  },
  "coverageCommand": "npx jest --coverage --coverageReporters=json-summary",
  "coverageFile": "coverage/coverage-summary.json"
}
```

## Hook Configuration

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hook": ".claude/skills/coverage-guard/scripts/check-coverage.sh",
        "condition": "command contains 'jest' OR command contains 'vitest' OR command contains 'npm test'"
      }
    ]
  }
}
```

## Enforcement Logic

```bash
#!/bin/bash
# check-coverage.sh
COVERAGE_FILE="coverage/coverage-summary.json"
THRESHOLD=80

if [ -f "$COVERAGE_FILE" ]; then
  STATEMENTS=$(jq '.total.statements.pct' "$COVERAGE_FILE")
  BRANCHES=$(jq '.total.branches.pct' "$COVERAGE_FILE")

  if (( $(echo "$STATEMENTS < $THRESHOLD" | bc -l) )); then
    echo "WARNING: Statement coverage ($STATEMENTS%) below threshold ($THRESHOLD%)"
    echo "Coverage dropped — check which files lost coverage."
  fi

  if (( $(echo "$BRANCHES < 70" | bc -l) )); then
    echo "WARNING: Branch coverage ($BRANCHES%) below 70%"
  fi
fi
```

## Gotchas

- Coverage check runs AFTER the test command — if tests crash, no coverage report is generated
- Coverage-summary.json must be configured as a reporter — default Jest config may not include it
- Threshold comparisons use floating point — `79.999%` will trigger below `80%` threshold
- Branch coverage is typically 10-15% lower than line coverage — set thresholds accordingly
