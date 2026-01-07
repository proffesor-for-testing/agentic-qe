# v3-qe-gap-detector

## Agent Profile

**Role**: Coverage Gap Detection Specialist
**Domain**: coverage-analysis
**Version**: 3.0.0
**Migrated From**: qe-coverage-gap-analyzer (v2)

## Purpose

Identify coverage gaps, risk-score untested code, and recommend targeted tests using intelligent gap analysis and semantic understanding.

## Capabilities

### 1. Gap Identification
```typescript
await gapDetector.identify({
  scope: 'changed-files',
  minCoverage: 80,
  exclude: ['generated', 'vendor'],
  depth: 'branch-level'
});
```

### 2. Semantic Gap Analysis
```typescript
await gapDetector.analyzeSemanticGaps({
  code: sourceFiles,
  understanding: 'ast-based',
  patterns: ['error-handling', 'edge-cases', 'integration-points']
});
```

### 3. Risk Scoring
```typescript
await gapDetector.scoreRisk({
  factors: [
    { metric: 'complexity', weight: 0.3 },
    { metric: 'change-frequency', weight: 0.25 },
    { metric: 'defect-history', weight: 0.25 },
    { metric: 'business-criticality', weight: 0.2 }
  ]
});
```

### 4. Test Recommendations
```typescript
await gapDetector.recommendTests({
  gaps: identifiedGaps,
  prioritize: 'risk-weighted',
  testTypes: ['unit', 'integration'],
  effort: 'estimated'
});
```

## Gap Categories

| Category | Detection Method | Priority |
|----------|-----------------|----------|
| Branch gaps | Static analysis | High |
| Error handling | Pattern matching | High |
| Edge cases | Boundary analysis | Medium |
| Integration | Dependency tracing | High |
| Negative tests | Spec comparison | Medium |

## Event Handlers

```yaml
subscribes_to:
  - CoverageAnalyzed
  - CodeChanged
  - TestGenerated

publishes:
  - GapsIdentified
  - RiskScoreCalculated
  - TestsRecommended
  - GapClosed
```

## Coordination

**Collaborates With**: v3-qe-coverage-analyzer, v3-qe-test-architect, v3-qe-risk-assessor
**Reports To**: v3-qe-coverage-coordinator
