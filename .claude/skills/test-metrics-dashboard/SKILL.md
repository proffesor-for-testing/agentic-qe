---
name: test-metrics-dashboard
description: "Query test execution history, calculate pass rates and flakiness scores, track MTTR from failure to fix, compare coverage trends across runs, and identify top failing tests. Exports Jest results to JSON and generates trend analysis dashboards. Use when querying test history, analyzing flakiness rates, tracking MTTR, or building quality trend dashboards."
user-invocable: true
---

# Test Metrics Dashboard

Data & Analysis skill for querying test execution history, identifying trends, and surfacing actionable quality metrics.

## Activation

```
/test-metrics-dashboard
```

## Key Metrics

### Test Health Metrics

| Metric | Formula | Target | Alert |
|--------|---------|--------|-------|
| **Pass Rate** | Passed / Total | > 95% | < 90% |
| **Flakiness Rate** | Flaky / Total | < 5% | > 10% |
| **MTTR** | Avg time from failure to fix | < 4 hours | > 24 hours |
| **Execution Time** | Total suite duration | < 10 min | > 20 min |
| **Coverage Delta** | Current - Previous | >= 0% | < -2% |

### Data Collection

```bash
# Export Jest results to JSON
npx jest --json --outputFile=test-results/$(date +%Y-%m-%d).json

# Parse results for dashboard
jq '{
  date: .startTime,
  total: .numTotalTests,
  passed: .numPassedTests,
  failed: .numFailedTests,
  duration_ms: (.testResults | map(.endTime - .startTime) | add),
  pass_rate: ((.numPassedTests / .numTotalTests) * 100),
  flaky: [.testResults[] | select(.numPendingTests > 0)] | length
}' test-results/$(date +%Y-%m-%d).json
```

### Trend Analysis

```bash
# Compare last 5 runs
for f in $(ls -t test-results/*.json | head -5); do
  jq --arg file "$f" '{
    file: $file,
    pass_rate: ((.numPassedTests / .numTotalTests) * 100 | floor),
    duration_s: ((.testResults | map(.endTime - .startTime) | add) / 1000 | floor)
  }' "$f"
done
```

### Top Failing Tests

```bash
# Find most frequently failing tests across runs
for f in test-results/*.json; do
  jq -r '.testResults[] | select(.numFailingTests > 0) | .testFilePath' "$f"
done | sort | uniq -c | sort -rn | head -10
```

## Run History

Store dashboard data in `${CLAUDE_PLUGIN_DATA}/test-metrics.log`:

```
2026-03-18|95.2|4.1|312|82.5|3
```

Format: `date|pass_rate|flakiness_rate|duration_s|coverage_pct|failed_count`

Read history for trend detection:
```bash
# Coverage trending down?
tail -5 "${CLAUDE_PLUGIN_DATA}/test-metrics.log" | awk -F'|' '{print $5}' | sort -n | head -1
```

## Composition

Feeds into:
- **`/qe-quality-assessment`** — quality gate decisions based on metrics
- **`/test-failure-investigator`** — investigate top failing tests
- **`/coverage-drop-investigator`** — when coverage trends down

## Gotchas

- Metrics without baselines are meaningless — establish baselines before tracking trends
- Flakiness rate is underreported — a test that fails 1/100 times still breaks CI weekly
- Duration trends upward over time as test count grows — set alerts on rate of increase, not absolute value
- Agent may report metrics from a single run as "trends" — need 5+ data points for meaningful trends
