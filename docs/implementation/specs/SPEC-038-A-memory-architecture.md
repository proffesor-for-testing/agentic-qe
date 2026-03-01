# SPEC-038-A: QE Unified Memory Architecture

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-038-A |
| **Parent ADR** | [ADR-038](../adrs/ADR-038-v3-qe-memory-unification.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-12 |
| **Author** | Claude Code |

---

## Overview

This specification details the unified memory architecture for V3 QE, including HNSW configurations per domain, migration strategies, and implementation patterns.

---

## Architecture Diagram

```
+---------------------------------------------------------+
|                 V3 QE Unified Memory                     |
+---------------------------------------------------------+
|                                                          |
|  +------------+  +------------+  +------------+          |
|  | test-suites|  |  coverage  |  |  defects   |          |
|  |   (HNSW)   |  |   (HNSW)   |  |   (HNSW)   |          |
|  +------------+  +------------+  +------------+          |
|                                                          |
|  +------------+  +------------+  +------------+          |
|  |  quality   |  |  learning  |  |coordination|          |
|  |   (HNSW)   |  |   (HNSW)   |  |   (HNSW)   |          |
|  +------------+  +------------+  +------------+          |
|                                                          |
|  +--------------------------------------------------+   |
|  |              AgentDB Core Engine                  |   |
|  |  - 1536-dimension embeddings                     |   |
|  |  - HNSW M=16, efConstruction=200                 |   |
|  |  - Hybrid persistence (SQLite + File)            |   |
|  +--------------------------------------------------+   |
|                                                          |
+---------------------------------------------------------+
```

---

## HNSW Configuration Per Domain

| Domain | M | efConstruction | efSearch | Dimensions | Use Case |
|--------|---|----------------|----------|------------|----------|
| test-suites | 8 | 100 | 50 | 128 | Fast lookup |
| coverage | 16 | 200 | 100 | 128 | Balanced for gap detection |
| defects | 32 | 400 | 200 | 128 | High precision for prediction |
| quality | 16 | 200 | 100 | 128 | Balanced |
| learning | 24 | 300 | 150 | 128 | High recall for transfer |
| coordination | 8 | 100 | 50 | 128 | Fast agent state lookup |

---

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
```

### Phase 3: SONA Integration
```typescript
await qeAgentDB.enableSONAIntegration({
  mode: 'real-time',
  adaptationTime: 0.05, // ms
  patternStorage: true
});
```

---

## Performance Targets

| Operation | Target | Achieved Via |
|-----------|--------|--------------|
| Semantic search (10K entries) | <1ms | HNSW O(log n) |
| Semantic search (100K entries) | <2ms | HNSW O(log n) |
| Semantic search (1M entries) | <5ms | HNSW O(log n) |
| Memory usage | 50-75% reduction | Quantization |
| Cross-agent sharing | Real-time | Event-driven sync |
| Pattern adaptation | <0.05ms | SONA integration |

---

## V2 to V3 Migration Results

**Migrated to V3 (`v3/.agentic-qe/qe-patterns.db`):**
- 910 total patterns migrated
- 180 captured experiences (as learning templates)
- 579 learning experiences (as RL data)
- 151 concept graph nodes/edges (as knowledge patterns)

**Distribution by Domain:**
| Domain | Count |
|--------|-------|
| test-generation | 696 |
| code-intelligence | 151 |
| coverage-analysis | 59 |
| security-compliance | 4 |

**Distribution by Tier:**
| Tier | Count |
|------|-------|
| short-term | 759 |
| medium-term | 148 |
| long-term | 3 |

---

## Usage Example

```typescript
import { createDefaultQEUnifiedMemory } from './learning/index.js';

// Create unified memory instance
const qeMemory = createDefaultQEUnifiedMemory({
  enableHNSW: {
    'test-suites': true,
    'coverage': true,
    'defects': true,
  },
});

// Initialize
await qeMemory.initialize();

// Store data in specific domain
await qeMemory.set('coverage', 'report-1', coverageData);

// Semantic search across all domains
const results = await qeMemory.searchAllDomains(queryEmbedding, {
  threshold: 0.7,
  maxPerDomain: 10,
});

// Get statistics
const stats = await qeMemory.getStats();
```

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `v3/src/learning/qe-unified-memory.ts` | 1224 | QEUnifiedMemory facade class |
| `v3/src/learning/v2-to-v3-migration.ts` | - | V2 to V3 migrator |
| `v3/scripts/generate-pattern-embeddings.ts` | - | Batch embedding generation |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | Claude Code | Initial specification |

---

## References

- [Parent ADR](../adrs/ADR-038-v3-qe-memory-unification.md)
- [AgentDB Documentation](https://github.com/agentdb/agentdb)
- [HNSW Algorithm Paper](https://arxiv.org/abs/1603.09320)
