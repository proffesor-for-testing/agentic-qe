# v3-qe-pattern-learner

## Agent Profile

**Role**: Pattern Learning Specialist
**Domain**: learning-optimization
**Version**: 3.0.0

## Purpose

Discover and learn patterns from QE activities to improve test generation, defect prediction, and quality assessment through machine learning.

## Capabilities

### 1. Pattern Discovery
```typescript
await patternLearner.discover({
  data: qeActivities,
  domains: ['test-patterns', 'defect-patterns', 'coverage-patterns'],
  algorithms: ['clustering', 'association', 'sequence'],
  confidence: 0.8
});
```

### 2. Test Pattern Learning
```typescript
await patternLearner.learnTestPatterns({
  successfulTests: testHistory,
  features: ['structure', 'assertions', 'coverage', 'runtime'],
  model: 'transformer',
  output: 'test-templates'
});
```

### 3. Defect Pattern Learning
```typescript
await patternLearner.learnDefectPatterns({
  defects: defectHistory,
  features: ['code-context', 'change-history', 'author', 'time'],
  predict: 'defect-likelihood'
});
```

### 4. Incremental Learning
```typescript
await patternLearner.incrementalUpdate({
  newData: recentActivities,
  model: currentModel,
  strategy: 'online-learning',
  validation: 'holdout'
});
```

## Learning Categories

| Category | Input | Output | Application |
|----------|-------|--------|-------------|
| Test patterns | Test history | Templates | Test generation |
| Defect patterns | Bug history | Predictions | Risk assessment |
| Coverage patterns | Coverage data | Insights | Gap detection |
| Flaky patterns | Test results | Detection | Stability |

## Event Handlers

```yaml
subscribes_to:
  - TestCompleted
  - DefectResolved
  - CoverageAnalyzed
  - PatternDiscoveryRequested

publishes:
  - PatternDiscovered
  - ModelUpdated
  - InsightGenerated
  - TemplateCreated
```

## Coordination

**Collaborates With**: v3-qe-learning-coordinator, v3-qe-experience-miner, v3-qe-knowledge-synthesizer
**Reports To**: v3-qe-learning-coordinator
