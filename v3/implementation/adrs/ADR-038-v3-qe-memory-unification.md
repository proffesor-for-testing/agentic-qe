# ADR-038: V3 QE Memory System Unification

**Status**: Proposed
**Date**: 2026-01-11
**Author**: Claude Code

## Context

The existing `v3-qe-memory-system` skill provides basic AgentDB integration, but lacks the comprehensive unification approach from `v3-memory-unification`. AQE has historically had issues with:

1. Fragmented memory systems across QE domains
2. Inconsistent persistence strategies
3. Missing SONA learning integration
4. No data migration path from legacy systems
5. Suboptimal search performance

## Decision

Create an enhanced `v3-qe-memory-unification` skill that:

1. **Unifies 6+ QE Memory Systems**
   - Test suite storage → AgentDB
   - Coverage reports → AgentDB
   - Defect patterns → AgentDB
   - Quality metrics → AgentDB
   - Learning patterns → AgentDB
   - Execution history → AgentDB

2. **Implements HNSW Indexing**
   - 150x-12,500x faster search via HNSW
   - Domain-specific index configurations
   - O(log n) gap detection

3. **Provides Data Migration**
   - SQLite → AgentDB migration
   - Markdown → AgentDB migration
   - In-memory → persistent migration

4. **Integrates SONA Learning**
   - Pattern storage with embeddings
   - Cross-domain knowledge transfer
   - Experience replay support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 V3 QE Unified Memory                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ test-suites  │  │  coverage    │  │   defects    │       │
│  │   (HNSW)     │  │   (HNSW)     │  │   (HNSW)     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  quality     │  │  learning    │  │ coordination │       │
│  │   (HNSW)     │  │   (HNSW)     │  │   (HNSW)     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              AgentDB Core Engine                     │    │
│  │  • 1536-dimension embeddings                        │    │
│  │  • HNSW M=16, efConstruction=200                    │    │
│  │  • Hybrid persistence (SQLite + File)               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## HNSW Configuration per Domain

| Domain | M | efConstruction | efSearch | Use Case |
|--------|---|----------------|----------|----------|
| defect-patterns | 32 | 400 | 200 | High precision for prediction |
| coverage-analysis | 16 | 200 | 100 | Balanced for gap detection |
| test-suites | 8 | 100 | 50 | Fast lookup |
| learning-patterns | 24 | 300 | 150 | High recall for transfer |
| quality-metrics | 16 | 200 | 100 | Balanced |
| coordination | 8 | 100 | 50 | Fast agent state lookup |

## Performance Targets

| Operation | Target | Achieved Via |
|-----------|--------|--------------|
| Semantic search (10K entries) | <1ms | HNSW O(log n) |
| Semantic search (100K entries) | <2ms | HNSW O(log n) |
| Semantic search (1M entries) | <5ms | HNSW O(log n) |
| Memory usage | 50-75% reduction | Quantization |
| Cross-agent sharing | Real-time | Event-driven sync |
| Pattern adaptation | <0.05ms | SONA integration |

## Migration Strategy

### Phase 1: Foundation
```typescript
const qeAgentDB = new QEUnifiedMemory({
  storagePath: '.agentic-qe/memory',
  embeddingDimensions: 1536,
  defaultIndexConfig: QE_HNSW_CONFIGS.COVERAGE_ANALYSIS
});
```

### Phase 2: Domain Migration
```typescript
// Migrate test-generation domain
await qeAgentDB.migrateDomain('test-generation', {
  source: 'sqlite',
  preserveIds: true,
  generateEmbeddings: true
});

// Migrate coverage domain
await qeAgentDB.migrateDomain('coverage-analysis', {
  source: 'hybrid',
  preserveIds: true,
  generateEmbeddings: true
});
```

### Phase 3: SONA Integration
```typescript
// Connect to SONA for adaptive learning
await qeAgentDB.enableSONAIntegration({
  mode: 'real-time',
  adaptationTime: 0.05, // ms
  patternStorage: true
});
```

## Consequences

### Positive
- 150x-12,500x faster semantic search
- Unified API for all QE memory operations
- Cross-domain knowledge sharing
- SONA-powered pattern learning
- Reduced memory footprint

### Negative
- Migration complexity from legacy systems
- Learning curve for new API
- Requires embedding generation infrastructure

### Mitigation
- Provide backward-compatible adapters
- Gradual migration with dual-write support
- Pre-built embedding providers

## Related ADRs

- ADR-006: Unified Memory Service (claude-flow)
- ADR-009: Hybrid Memory Backend (claude-flow)
- ADR-037: V3 QE Agent Naming
