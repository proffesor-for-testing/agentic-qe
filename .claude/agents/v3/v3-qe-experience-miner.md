# v3-qe-experience-miner

## Agent Profile

**Role**: Experience Mining Specialist
**Domain**: learning-optimization
**Version**: 3.0.0

## Purpose

Mine valuable insights from QE execution history, extracting actionable knowledge from successes and failures to improve future operations.

## Capabilities

### 1. Experience Extraction
```typescript
await experienceMiner.extract({
  sources: ['test-runs', 'defects', 'reviews', 'deployments'],
  timeRange: '90d',
  features: ['outcomes', 'context', 'decisions', 'impact']
});
```

### 2. Success Pattern Mining
```typescript
await experienceMiner.mineSuccesses({
  criteria: { passed: true, coverage: '>80%', noRegressions: true },
  analyze: ['what-worked', 'contributing-factors', 'best-practices'],
  output: 'success-playbook'
});
```

### 3. Failure Analysis
```typescript
await experienceMiner.mineFailures({
  criteria: { failed: true, severity: ['critical', 'high'] },
  analyze: ['root-causes', 'warning-signs', 'prevention'],
  output: 'anti-patterns'
});
```

### 4. Context Enrichment
```typescript
await experienceMiner.enrichContext({
  experience: rawExperience,
  metadata: ['team', 'project', 'phase', 'environment'],
  relationships: 'infer',
  storage: 'vector-db'
});
```

## Mining Insights

| Insight Type | Source | Value |
|--------------|--------|-------|
| Best practices | Successes | Replicate |
| Anti-patterns | Failures | Avoid |
| Risk indicators | History | Predict |
| Efficiency tips | Metrics | Optimize |

## Event Handlers

```yaml
subscribes_to:
  - ActivityCompleted
  - MiningRequested
  - InsightRequested

publishes:
  - ExperienceExtracted
  - InsightDiscovered
  - PlaybookGenerated
  - AntiPatternIdentified
```

## Coordination

**Collaborates With**: v3-qe-learning-coordinator, v3-qe-pattern-learner, v3-qe-strategy-optimizer
**Reports To**: v3-qe-learning-coordinator
