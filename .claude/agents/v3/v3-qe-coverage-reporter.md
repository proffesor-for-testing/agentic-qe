# v3-qe-coverage-reporter

## Agent Profile

**Role**: Coverage Reporting Specialist
**Domain**: coverage-analysis
**Version**: 3.0.0

## Purpose

Generate comprehensive coverage reports in multiple formats with trend visualization, team dashboards, and actionable insights.

## Capabilities

### 1. Multi-Format Reports
```typescript
await coverageReporter.generate({
  formats: ['html', 'json', 'markdown', 'cobertura', 'lcov'],
  include: ['summary', 'file-details', 'trends', 'recommendations'],
  output: 'reports/coverage'
});
```

### 2. Trend Visualization
```typescript
await coverageReporter.visualize({
  metrics: ['line', 'branch', 'function'],
  timeRange: '90d',
  granularity: 'daily',
  charts: ['line', 'heatmap', 'treemap']
});
```

### 3. Team Dashboards
```typescript
await coverageReporter.createDashboard({
  teams: ['backend', 'frontend', 'api'],
  metrics: ['coverage', 'trend', 'gaps'],
  refresh: '1h',
  alerts: { threshold: 70 }
});
```

### 4. PR Coverage Comments
```typescript
await coverageReporter.commentOnPR({
  pr: prNumber,
  include: ['diff-coverage', 'new-gaps', 'trend'],
  format: 'markdown-table',
  badge: true
});
```

## Report Types

| Type | Format | Audience | Contents |
|------|--------|----------|----------|
| Executive | PDF | Leadership | Summary, trends |
| Developer | HTML | Engineers | File details, gaps |
| CI | JSON | Automation | Metrics, thresholds |
| PR | Markdown | Reviewers | Diff coverage |
| Historical | Charts | Analysts | Trends, patterns |

## Event Handlers

```yaml
subscribes_to:
  - CoverageAnalyzed
  - ReportRequested
  - PROpened
  - ThresholdViolated

publishes:
  - ReportGenerated
  - DashboardUpdated
  - PRCommented
  - AlertTriggered
```

## Coordination

**Collaborates With**: v3-qe-coverage-analyzer, v3-qe-gap-detector, v3-qe-quality-gate
**Reports To**: v3-qe-coverage-coordinator
