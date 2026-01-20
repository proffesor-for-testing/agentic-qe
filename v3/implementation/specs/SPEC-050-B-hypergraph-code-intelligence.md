# SPEC-050-B: Hypergraph Code Intelligence

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-050-B |
| **Parent ADR** | [ADR-050](../adrs/ADR-050-ruvector-neural-backbone.md) |
| **Version** | 1.0 |
| **Status** | In Progress |
| **Last Updated** | 2026-01-20 |
| **Author** | GOAP Specialist |

---

## Overview

This specification covers Actions 5-7 from the GOAP plan: Hypergraph Schema, Query Engine, and Code Intelligence Integration.

---

## Action 5: Hypergraph Schema

**Priority:** P1 (High)
**Estimated Time:** 4 hours

### Database Migration

```sql
-- Migration: 20260120_add_hypergraph_tables.sql

-- Hypergraph nodes (functions, modules, tests, etc.)
CREATE TABLE IF NOT EXISTS hypergraph_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'function', 'module', 'test', 'file', 'class'
  name TEXT NOT NULL,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  complexity REAL,
  coverage REAL,
  metadata TEXT, -- JSON
  embedding BLOB, -- Vector embedding for similarity
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Hypergraph edges (relationships)
CREATE TABLE IF NOT EXISTS hypergraph_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
  target_id TEXT NOT NULL REFERENCES hypergraph_nodes(id),
  type TEXT NOT NULL, -- 'calls', 'imports', 'tests', 'depends_on', 'covers'
  weight REAL DEFAULT 1.0,
  properties TEXT, -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, type)
);

-- Indexes for fast traversal
CREATE INDEX IF NOT EXISTS idx_hypergraph_nodes_type ON hypergraph_nodes(type);
CREATE INDEX IF NOT EXISTS idx_hypergraph_nodes_file ON hypergraph_nodes(file_path);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_source ON hypergraph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_target ON hypergraph_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_hypergraph_edges_type ON hypergraph_edges(type);
```

### Requirements

- [x] UnifiedPersistenceManager available
- [x] SQLite schema management in place
- [ ] Hypergraph tables created in `memory.db`
- [ ] Support for nodes, edges, properties

---

## Action 6: Hypergraph Query Engine

**Priority:** P2 (Medium)
**Estimated Time:** 16 hours

### Implementation

```typescript
// File: v3/src/integrations/ruvector/hypergraph-engine.ts
export interface HypergraphNode {
  id: string;
  type: 'function' | 'module' | 'test' | 'file' | 'class';
  name: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  complexity?: number;
  coverage?: number;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface HypergraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'calls' | 'imports' | 'tests' | 'depends_on' | 'covers';
  weight: number;
  properties?: Record<string, unknown>;
}

export interface HypergraphResult {
  nodes: HypergraphNode[];
  edges: HypergraphEdge[];
  executionTimeMs: number;
}

export class HypergraphEngine {
  private persistence: UnifiedPersistenceManager;
  private gnnIndex: QEGNNEmbeddingIndex;

  /**
   * Execute a Cypher-like query
   * Simplified syntax for QE use cases
   */
  async query(cypher: string, params?: Record<string, unknown>): Promise<HypergraphResult>;

  /**
   * Find functions not covered by tests
   */
  async findUntestedFunctions(): Promise<HypergraphNode[]> {
    return this.query(`
      MATCH (f:Function)
      WHERE NOT (f)<-[:COVERS]-(:Test)
      RETURN f ORDER BY f.complexity DESC
    `);
  }

  /**
   * Impact analysis: what tests cover changed functions?
   */
  async findImpactedTests(changedFiles: string[]): Promise<HypergraphNode[]> {
    return this.query(`
      MATCH (f:Function)-[:DEFINED_IN]->(file:File)
      WHERE file.path IN $changedFiles
      MATCH (t:Test)-[:COVERS]->(f)
      RETURN DISTINCT t
    `, { changedFiles });
  }

  /**
   * Find high-complexity untested code
   */
  async findRiskyCode(minComplexity: number = 10): Promise<HypergraphNode[]> {
    return this.query(`
      MATCH (f:Function)
      WHERE f.complexity >= $minComplexity
        AND NOT (f)<-[:COVERS]-(:Test)
      RETURN f ORDER BY f.complexity DESC
    `, { minComplexity });
  }

  /**
   * Build graph from indexed code
   */
  async buildFromIndex(indexResult: IndexResult): Promise<void>;
}
```

### Cypher-Like Query Support

The engine supports a simplified Cypher syntax:

| Pattern | Description |
|---------|-------------|
| `MATCH (n:Type)` | Find nodes of type |
| `WHERE condition` | Filter results |
| `(a)-[:REL]->(b)` | Traverse relationship |
| `NOT (a)<-[:REL]-(b)` | Negative pattern |
| `RETURN n` | Select output |
| `ORDER BY field` | Sort results |
| `$param` | Parameter substitution |

### Requirements

- [ ] Cypher-like query interface available
- [ ] Pattern matching for code relationships
- [ ] Integration with existing KnowledgeGraphService

---

## Action 7: Code Intelligence Integration

**Priority:** P2 (Medium)
**Estimated Time:** 10 hours

### Modified Coordinator

```typescript
// File: v3/src/domains/code-intelligence/coordinator.ts (modified)
export class CodeIntelligenceCoordinator {
  private hypergraph?: HypergraphEngine;

  async initialize(): Promise<void> {
    // ... existing initialization ...

    // Add hypergraph integration
    if (this.config.enableHypergraph) {
      this.hypergraph = new HypergraphEngine(this.persistence);
      await this.hypergraph.initialize();
    }
  }

  async analyzeImpact(request: ImpactRequest): Promise<ImpactAnalysis> {
    // Use hypergraph for intelligent impact analysis
    if (this.hypergraph) {
      const impactedTests = await this.hypergraph.findImpactedTests(request.changedFiles);
      // Merge with existing impact analysis
    }
  }

  async findCoverageGaps(): Promise<CoverageGap[]> {
    if (this.hypergraph) {
      const untested = await this.hypergraph.findUntestedFunctions();
      return untested.map(node => ({
        function: node.name,
        file: node.filePath,
        complexity: node.complexity,
        risk: this.calculateRisk(node),
      }));
    }
  }
}
```

### Requirements

- [ ] Impact analysis uses hypergraph queries
- [ ] Coverage gaps identified via graph traversal
- [ ] Test prioritization based on code relationships

---

## Architecture Recommendation: Hybrid Upgrade

The hypergraph is an **upgrade** to existing code intelligence, not a replacement:

| Aspect | Current KnowledgeGraphService | Proposed Hypergraph |
|--------|------------------------------|---------------------|
| Storage | In-memory | SQLite (persistent) |
| Query Language | Custom methods | Cypher-like syntax |
| Embedding Integration | Via GNN index | Native in nodes |
| Cross-Session | No | Yes |
| Performance | Fast (memory) | Indexed (disk) |

### Sync Strategy

1. **On Index Completion**: Memory graph → Hypergraph (persist)
2. **On Session Start**: Hypergraph → Memory graph (restore)
3. **On Query**: Use hypergraph for complex traversals, memory for simple lookups

---

## Agent Assignments

| Action | Agent | Phase |
|--------|-------|-------|
| Action 5 | qe-kg-builder | Phase 1 |
| Action 6 | qe-kg-builder, qe-coverage-specialist | Phase 3 |
| Action 7 | qe-test-architect | Phase 4 |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-20 | GOAP Specialist | Initial specification |
