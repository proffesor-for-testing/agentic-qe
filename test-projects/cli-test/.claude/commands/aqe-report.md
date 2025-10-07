---
name: aqe-report
description: Generate comprehensive quality engineering reports with metrics, trends, and actionable insights
---

# AQE Generate Reports

Generate comprehensive quality engineering reports with metrics, trends, and actionable insights.

## Usage

```bash
aqe report [type] [options]
# or
/aqe-report [type] [options]
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | `summary` | Report type: summary, detailed, trend, executive, custom |
| `--format` | string | `markdown` | Format: markdown, html, pdf, json |
| `--output` | path | `stdout` | Output file path |
| `--period` | string | `last-7-days` | Time period: last-24h, last-7-days, last-30-days, all-time |
| `--include` | string[] | `all` | Sections: coverage, performance, quality, trends, recommendations |
| `--charts` | boolean | `true` | Include charts and visualizations |

## Examples

### Summary Report

```bash
aqe report summary
```

Generates a quick summary report in markdown format.

### Detailed HTML Report

```bash
aqe report detailed --format html --output qe-report.html --charts
```

Generates comprehensive HTML report with charts and visualizations.

### Executive Summary

```bash
aqe report executive --format pdf --output exec-summary.pdf
```

Generates high-level executive summary in PDF format.

### Trend Analysis Report

```bash
aqe report trend --period last-30-days --format markdown
```

Generates 30-day trend analysis report.

### Custom Report

```bash
aqe report custom --include coverage,performance --format json --output metrics.json
```

Generates custom report with specific sections in JSON format.

## Integration with Claude Code

### Spawning Reporter Agent

```javascript
// Use Claude Code's Task tool to spawn the reporter agent
Task("Generate comprehensive QE report", `
  Create detailed quality engineering report:
  - Include all metrics from last 30 days
  - Generate charts for coverage trends
  - Add actionable recommendations
  - Format: HTML with embedded charts

  Store report metadata: aqe/reports/{report-id}
  Notify stakeholders of report availability.
`, "qe-quality-gate")
```

### Automated Reporting Workflow

```javascript
// Generate multiple report formats in parallel
[Single Message]:
  Task("Generate HTML report", "Create detailed HTML report for team", "qe-quality-gate")
  Task("Generate PDF summary", "Create executive PDF summary", "qe-quality-gate")
  Task("Generate JSON metrics", "Export metrics for dashboard", "qe-quality-gate")

  TodoWrite({ todos: [
    {content: "Collect metrics data", status: "in_progress", activeForm: "Collecting metrics"},
    {content: "Generate HTML report", status: "in_progress", activeForm: "Generating HTML"},
    {content: "Generate PDF summary", status: "in_progress", activeForm: "Generating PDF"},
    {content: "Export JSON metrics", status: "pending", activeForm: "Exporting metrics"}
  ]})
```

## Agent Coordination

### Primary Agent
- **qe-quality-gate**: Main agent with reporting module

### Supporting Agents
- **qe-coverage-analyzer**: Provides coverage metrics
- **qe-test-executor**: Provides execution metrics
- **qe-performance-tester**: Provides performance metrics

### Coordination Flow

```
1. Pre-Task Hook
   ├─> Retrieve coverage data
   ├─> Retrieve execution history
   ├─> Retrieve performance metrics
   └─> Retrieve optimization results

2. Report Generation
   ├─> Aggregate metrics from all sources
   ├─> Generate charts and visualizations
   ├─> Calculate trends and projections
   ├─> Generate recommendations
   └─> Format report in target format

3. Post-Task Hook
   ├─> Store report metadata
   ├─> Update report history
   ├─> Notify fleet of completion
   └─> Archive report
```

## Memory Operations

### Input Memory Keys

```bash
# Retrieve coverage data
npx claude-flow@alpha memory retrieve --key "aqe/coverage/current"

# Retrieve execution history
npx claude-flow@alpha memory retrieve --key "aqe/execution/history"

# Retrieve performance metrics
npx claude-flow@alpha memory retrieve --key "aqe/performance/metrics"

# Retrieve optimization results
npx claude-flow@alpha memory retrieve --key "aqe/optimization/results"
```

### Output Memory Keys

```bash
# Store report metadata
npx claude-flow@alpha memory store \
  --key "aqe/reports/${report_id}" \
  --value '{"type": "detailed", "format": "html", "timestamp": "2025-09-30T10:20:00Z"}'

# Store report history
npx claude-flow@alpha memory store \
  --key "aqe/reports/history" \
  --value '[{"id": "report-123", "date": "2025-09-30"}]'
```

## Hooks and Coordination

### Pre-Task Hook

```bash
npx claude-flow@alpha hooks pre-task \
  --description "Generate ${report_type} report" \
  --agent "qe-quality-gate"
```

### Post-Task Hook

```bash
npx claude-flow@alpha hooks post-task \
  --task-id "${REPORT_ID}" \
  --results "${REPORT_META}"
```

### Notify Fleet

```bash
npx claude-flow@alpha hooks notify \
  --message "Report generated: ${REPORT_TYPE} (${REPORT_ID})"
```

## Expected Outputs

### Summary Report Output

```markdown
# Quality Engineering Summary Report

**Generated:** 2025-09-30 10:20:00
**Period:** Last 7 days

## Overview

- **Test Coverage:** 93.5% (+1.2% from last week)
- **Tests Passing:** 118/120 (98.3%)
- **Avg Execution Time:** 12.3s
- **Flaky Tests:** 2 identified

## Key Metrics

### Coverage
- Lines: 1169/1250 (93.5%)
- Branches: 456/502 (90.8%)
- Functions: 234/245 (95.5%)

### Test Execution
- Total Tests: 120
- Passed: 118
- Failed: 2
- Duration: 12.3s

### Quality Indicators
- Code Complexity: Low
- Test Reliability: 98.3%
- Performance: Good

## Recommendations

1. ✅ Generate 5 tests for authentication module (coverage gap)
2. ✅ Fix 2 failing tests in auth-service
3. ✅ Investigate 2 flaky tests for retry logic
4. ℹ️  Consider optimizing test suite (29% reduction possible)

## Trend

Coverage has improved by 1.2% over the last 7 days.
Projected to reach 95% target in 4 days.
```

### Detailed HTML Report Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>AQE Detailed Report</title>
</head>
<body>
  <h1>Quality Engineering Detailed Report</h1>

  <!-- Executive Summary -->
  <section>
    <h2>Executive Summary</h2>
    <p>Coverage: 93.5% | Tests: 120 | Pass Rate: 98.3%</p>
  </section>

  <!-- Coverage Analysis -->
  <section>
    <h2>Coverage Analysis</h2>
    <canvas id="coverage-chart"></canvas>
    <table><!-- Coverage details --></table>
  </section>

  <!-- Test Execution Results -->
  <section>
    <h2>Test Execution</h2>
    <canvas id="execution-chart"></canvas>
    <table><!-- Test results --></table>
  </section>

  <!-- Performance Metrics -->
  <section>
    <h2>Performance</h2>
    <canvas id="performance-chart"></canvas>
  </section>

  <!-- Recommendations -->
  <section>
    <h2>Recommendations</h2>
    <ul><!-- Action items --></ul>
  </section>
</body>
</html>
```

### JSON Metrics Export

```json
{
  "reportId": "qe-report-1727683200-12345",
  "type": "detailed",
  "period": "last-7-days",
  "generated": "2025-09-30T10:20:00Z",
  "metrics": {
    "coverage": {
      "total": 93.5,
      "lines": 93.5,
      "branches": 90.8,
      "functions": 95.5,
      "change": 1.2
    },
    "tests": {
      "total": 120,
      "passed": 118,
      "failed": 2,
      "flaky": 2,
      "duration": 12.3
    },
    "quality": {
      "reliability": 98.3,
      "complexity": "low",
      "performance": "good"
    }
  },
  "trends": {
    "coverage": [91.2, 92.1, 92.5, 93.0, 93.2, 93.5, 93.5],
    "tests": [115, 115, 118, 118, 120, 120, 120]
  },
  "recommendations": [
    {
      "priority": "high",
      "action": "generate-tests",
      "target": "auth module",
      "impact": "+1.8% coverage"
    }
  ]
}
```

## Error Handling

### No Data Available

```bash
⚠️  Warning: Insufficient data for period 'last-30-days'
   Available data: last 7 days

Generating report with available data...
```

**Solution:** Report generated with available data.

### Output File Exists

```bash
⚠️  Warning: Output file 'qe-report.html' already exists

Overwrite? [y/N]:
```

**Solution:** Confirm overwrite or choose different output path.

### Format Not Supported

```bash
❌ Error: PDF generation requires additional dependencies

Install with: npm install --save-dev puppeteer
```

**Solution:** Install required dependencies for PDF generation.

## Performance Characteristics

- **Time Complexity**: O(n) for data aggregation
- **Target Time**: <3s for report generation
- **Memory Usage**: ~128MB peak
- **Parallel Support**: Yes (for multiple formats)

## Report Types

### Summary
- Quick overview
- Key metrics only
- ~1 page
- Best for: Daily updates

### Detailed
- Comprehensive analysis
- All metrics and trends
- Multiple pages
- Best for: Weekly reviews

### Trend
- Historical analysis
- Trend charts
- Projections
- Best for: Monthly reports

### Executive
- High-level overview
- Business metrics
- Recommendations
- Best for: Stakeholder updates

### Custom
- User-defined sections
- Flexible format
- Targeted metrics
- Best for: Specific needs

## See Also

- `/aqe-analyze` - Analyze coverage and quality
- `/aqe-execute` - Run tests for metrics
- `/aqe-optimize` - Optimize test suite
- `/aqe-fleet-status` - Check fleet health