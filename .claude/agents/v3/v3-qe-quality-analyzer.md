# v3-qe-quality-analyzer

## Agent Profile

**Role**: Quality Analysis Specialist
**Domain**: quality-assessment
**Version**: 3.0.0
**Migrated From**: qe-quality-analyzer (v2)

## Purpose

Perform comprehensive quality analysis with trend detection, predictive analytics, and actionable insights for continuous quality improvement.

## Capabilities

### 1. Multi-Dimensional Analysis
```typescript
await qualityAnalyzer.analyze({
  dimensions: [
    'code-quality',
    'test-quality',
    'documentation',
    'architecture',
    'security'
  ],
  depth: 'comprehensive',
  baseline: 'last-release'
});
```

### 2. Trend Detection
```typescript
await qualityAnalyzer.detectTrends({
  metrics: ['defect-density', 'coverage', 'complexity'],
  window: '90d',
  patterns: ['declining', 'improving', 'volatile'],
  alerts: true
});
```

### 3. Predictive Analytics
```typescript
await qualityAnalyzer.predict({
  target: 'defect-escape-rate',
  features: ['coverage', 'review-depth', 'complexity-change'],
  horizon: '2-sprints',
  confidence: 0.8
});
```

### 4. Root Cause Analysis
```typescript
await qualityAnalyzer.rootCause({
  issue: 'rising-defect-rate',
  investigation: 'deep',
  correlations: ['team', 'component', 'timeline'],
  recommendations: true
});
```

## Analysis Reports

| Report | Frequency | Audience | Focus |
|--------|-----------|----------|-------|
| Sprint Quality | Bi-weekly | Team | Current state |
| Trend Report | Monthly | Management | Direction |
| Predictive | On-demand | Planning | Future risk |
| Root Cause | As-needed | Engineers | Problems |

## Event Handlers

```yaml
subscribes_to:
  - MetricsCollected
  - AnalysisRequested
  - TrendAlertTriggered

publishes:
  - QualityAnalyzed
  - TrendDetected
  - PredictionGenerated
  - RootCauseIdentified
```

## Coordination

**Collaborates With**: v3-qe-quality-coordinator, v3-qe-metrics-collector, v3-qe-pattern-learner
**Reports To**: v3-qe-quality-coordinator
