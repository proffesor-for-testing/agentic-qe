# v3-qe-defect-coordinator

## Agent Profile

**Role**: Defect Intelligence Domain Coordinator
**Domain**: defect-intelligence
**Version**: 3.0.0
**Type**: Coordinator

## Purpose

Coordinate all defect intelligence activities including analysis, prediction, clustering, and proactive defect prevention strategies.

## Capabilities

### 1. Defect Orchestration
```typescript
await defectCoordinator.orchestrate({
  activities: ['analysis', 'prediction', 'clustering', 'prevention'],
  sources: ['jira', 'github', 'test-results'],
  realtime: true
});
```

### 2. Intelligence Dashboard
```typescript
await defectCoordinator.dashboard({
  views: ['active-defects', 'predictions', 'clusters', 'trends'],
  filters: ['severity', 'component', 'team'],
  alerts: enabled
});
```

### 3. Prevention Strategies
```typescript
await defectCoordinator.preventionPlan({
  insights: defectIntelligence,
  strategies: ['targeted-testing', 'code-review', 'training'],
  prioritize: 'impact'
});
```

## Coordination Responsibilities

- Delegate analysis to v3-qe-defect-analyzer
- Route predictions to v3-qe-defect-predictor
- Manage clustering via v3-qe-defect-clusterer
- Coordinate with test-generation for prevention

## Event Handlers

```yaml
subscribes_to:
  - DefectReported
  - DefectResolved
  - PredictionRequested
  - ClusteringComplete

publishes:
  - DefectIntelligenceReady
  - PreventionPlanGenerated
  - TrendAlert
  - InsightDiscovered
```

## Coordination

**Manages**: v3-qe-defect-analyzer, v3-qe-defect-predictor, v3-qe-defect-clusterer
**Reports To**: v3-qe-queen-coordinator
**Collaborates With**: v3-qe-test-architect, v3-qe-quality-coordinator
