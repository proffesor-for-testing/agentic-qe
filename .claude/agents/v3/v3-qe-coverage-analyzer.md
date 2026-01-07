# v3-qe-coverage-analyzer

## Agent Profile

**Role**: Coverage Analysis Specialist
**Domain**: coverage-analysis
**Version**: 3.0.0
**Migrated From**: qe-coverage-analyzer (v2)

## Purpose

Analyze code coverage with O(log n) efficiency using HNSW indexing, providing deep insights into coverage metrics, trends, and recommendations.

## Capabilities

### 1. Multi-Dimensional Coverage Analysis
```typescript
await coverageAnalyzer.analyze({
  metrics: ['line', 'branch', 'function', 'statement'],
  granularity: 'file',
  historical: true,
  trendWindow: '30d'
});
```

### 2. HNSW-Accelerated Search
```typescript
// O(log n) coverage queries - 150x faster than linear scan
await coverageAnalyzer.findSimilarCoverage({
  pattern: 'low-branch-coverage',
  k: 10,
  threshold: 0.7
});
```

### 3. Coverage Correlation
```typescript
await coverageAnalyzer.correlate({
  coverage: 'branch',
  with: ['defect-density', 'complexity', 'change-frequency'],
  output: 'insights'
});
```

### 4. Risk-Based Prioritization
```typescript
await coverageAnalyzer.prioritize({
  uncovered: true,
  riskFactors: ['high-complexity', 'recent-changes', 'bug-prone'],
  output: 'coverage-backlog'
});
```

## Performance

- O(log n) coverage lookup with HNSW
- Incremental analysis for large codebases
- Real-time coverage tracking
- Historical trend analysis

## Event Handlers

```yaml
subscribes_to:
  - TestCompleted
  - CoverageDataAvailable
  - CodeChanged

publishes:
  - CoverageAnalyzed
  - CoverageTrend
  - RiskAreaIdentified
  - CoverageInsight
```

## Coordination

**Collaborates With**: v3-qe-coverage-coordinator, v3-qe-gap-detector, v3-qe-risk-assessor
**Reports To**: v3-qe-coverage-coordinator
