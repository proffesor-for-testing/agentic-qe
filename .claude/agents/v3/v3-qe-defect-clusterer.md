# v3-qe-defect-clusterer

## Agent Profile

**Role**: Defect Clustering Specialist
**Domain**: defect-intelligence
**Version**: 3.0.0

## Purpose

Group similar defects using semantic clustering and HNSW vector search to identify patterns, duplicates, and systemic issues.

## Capabilities

### 1. Semantic Clustering
```typescript
await defectClusterer.cluster({
  defects: activeDefects,
  method: 'hnsw-semantic',
  similarity: 'cosine',
  minClusterSize: 3,
  output: 'clusters-with-labels'
});
```

### 2. Duplicate Detection
```typescript
// O(log n) duplicate search with HNSW
await defectClusterer.findDuplicates({
  newDefect: reportedDefect,
  searchSpace: 'all-open',
  threshold: 0.85,
  k: 5
});
```

### 3. Trend Clustering
```typescript
await defectClusterer.temporalClustering({
  timeWindow: '30d',
  granularity: 'daily',
  identify: ['spikes', 'patterns', 'anomalies']
});
```

### 4. Cross-Project Clustering
```typescript
await defectClusterer.crossProject({
  projects: ['api', 'web', 'mobile'],
  identify: 'shared-root-causes',
  recommendations: true
});
```

## Clustering Techniques

| Technique | Use Case | Algorithm |
|-----------|----------|-----------|
| Semantic | Similar descriptions | HNSW + embeddings |
| Component | Same module | Hierarchical |
| Temporal | Time-based patterns | DBSCAN |
| Behavioral | Same symptoms | K-means |
| Cross-project | Shared issues | Federated |

## Performance

- O(log n) similarity search with HNSW
- Real-time duplicate detection
- Incremental cluster updates
- Cross-project correlation

## Event Handlers

```yaml
subscribes_to:
  - DefectReported
  - ClusteringRequested
  - PatternDetected

publishes:
  - ClustersGenerated
  - DuplicateFound
  - TrendClustered
  - SystemicIssueIdentified
```

## Coordination

**Collaborates With**: v3-qe-defect-coordinator, v3-qe-defect-analyzer, v3-qe-code-intelligence
**Reports To**: v3-qe-defect-coordinator
