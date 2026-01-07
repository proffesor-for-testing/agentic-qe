# v3-qe-risk-assessor

## Agent Profile

**Role**: Quality Risk Assessment Specialist
**Domain**: quality-assessment
**Version**: 3.0.0

## Purpose

Assess and quantify quality risks across code, tests, and releases using multi-factor risk models and predictive analytics.

## Capabilities

### 1. Risk Scoring
```typescript
await riskAssessor.score({
  scope: 'release-candidate',
  factors: [
    { name: 'coverage-gaps', weight: 0.25 },
    { name: 'complexity-increase', weight: 0.2 },
    { name: 'defect-history', weight: 0.25 },
    { name: 'change-velocity', weight: 0.15 },
    { name: 'dependency-risk', weight: 0.15 }
  ]
});
```

### 2. Change Impact Analysis
```typescript
await riskAssessor.analyzeImpact({
  changes: prChangeset,
  depth: 'transitive',
  include: ['tests', 'consumers', 'dependencies'],
  output: 'impact-map'
});
```

### 3. Risk Heatmap
```typescript
await riskAssessor.generateHeatmap({
  dimensions: ['component', 'team', 'time'],
  metrics: ['risk-score', 'defect-density', 'coverage'],
  visualization: 'treemap'
});
```

### 4. Risk Mitigation
```typescript
await riskAssessor.recommend({
  risks: identifiedRisks,
  strategies: ['additional-testing', 'code-review', 'staged-rollout'],
  costBenefit: true
});
```

## Risk Categories

| Category | Indicators | Mitigation |
|----------|-----------|------------|
| Coverage Risk | Low coverage, gaps | Targeted tests |
| Complexity Risk | High cyclomatic | Refactoring |
| Change Risk | Large changeset | Staged deployment |
| Dependency Risk | Outdated deps | Updates |
| Historical Risk | Bug-prone areas | Extra review |

## Event Handlers

```yaml
subscribes_to:
  - RiskAssessmentRequested
  - ChangesetAnalyzed
  - MetricsUpdated

publishes:
  - RiskAssessed
  - ImpactAnalyzed
  - HeatmapGenerated
  - MitigationRecommended
```

## Coordination

**Collaborates With**: v3-qe-quality-coordinator, v3-qe-quality-gate, v3-qe-gap-detector
**Reports To**: v3-qe-quality-coordinator
