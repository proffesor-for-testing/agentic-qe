# Knowledge Graph Architecture Comparison
## Graph Database Approaches & Trade-offs

**Version:** 1.0.0
**Date:** 2025-12-21
**Purpose:** Evaluate architectural options for project knowledge graph

---

## Executive Summary

We evaluated four architectural approaches for building a project knowledge graph:

| Approach | Complexity | Cost | Performance | Verdict |
|----------|-----------|------|-------------|---------|
| **PostgreSQL + pgvector** | Low | Low | High | ✅ **RECOMMENDED** |
| **Neo4j Graph Database** | Medium | High | Very High | ⚠️ Overkill for v1 |
| **AgentDB Hybrid** | Medium | Medium | High | 🔄 Future consideration |
| **SQLite + In-Memory** | Low | Very Low | Medium | ❌ Doesn't scale |

**Recommendation**: Proceed with **PostgreSQL + pgvector** for v1, evaluate **AgentDB Hybrid** for v2.

---

## Approach 1: PostgreSQL + pgvector (Recommended)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL Database                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ code_entities (Table)                                │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ id TEXT PRIMARY KEY                                  │  │
│  │ type VARCHAR(50)  -- 'function', 'class', etc.       │  │
│  │ name TEXT                                            │  │
│  │ file_path TEXT                                       │  │
│  │ embedding ruvector(768)  -- pgvector extension       │  │
│  │ content TEXT                                         │  │
│  │ signature TEXT                                       │  │
│  │ metadata JSONB                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ entity_relationships (Table)                         │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ id SERIAL PRIMARY KEY                                │  │
│  │ source_id TEXT REFERENCES code_entities(id)          │  │
│  │ target_id TEXT REFERENCES code_entities(id)          │  │
│  │ relationship_type VARCHAR(50)  -- 'IMPORTS', etc.    │  │
│  │ confidence REAL                                      │  │
│  │ metadata JSONB                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Strengths ✅

1. **Proven Infrastructure**: Already using RuVector PostgreSQL
2. **Zero Additional Dependencies**: No new databases to manage
3. **SQL Familiarity**: Team knows PostgreSQL well
4. **Flexible Schema**: JSONB for metadata evolution
5. **Vector Search**: pgvector provides <1ms similarity search
6. **Graph Queries**: Recursive CTEs handle graph traversal
7. **Transactions**: ACID guarantees for data integrity
8. **Backup/Recovery**: Standard PostgreSQL tools
9. **Cost**: Free (open source)

### Weaknesses ❌

1. **Graph Query Complexity**: Recursive CTEs more verbose than Cypher
2. **No Visual Query Builder**: Must write SQL manually
3. **Limited Graph Algorithms**: No built-in PageRank, centrality, etc.
4. **Performance**: Graph traversal slower than native graph DB at scale

### Performance Characteristics

| Operation | Latency | Scalability | Notes |
|-----------|---------|-------------|-------|
| **Vector Search** | <1ms | Excellent (HNSW) | 192K QPS proven |
| **1-hop Traversal** | <5ms | Good | Simple JOIN |
| **3-hop Traversal** | <50ms | Fair | Recursive CTE |
| **Full Graph Scan** | Varies | Poor | Not recommended |
| **Insert** | <2ms | Excellent | Batched inserts |
| **Update** | <2ms | Good | Indexed by ID |

### SQL Example: Find Dependencies

```sql
-- Find all modules that UserService imports (1-hop)
SELECT ce.*
FROM code_entities ce
JOIN entity_relationships er ON ce.id = er.target_id
WHERE er.source_id = 'UserService'
  AND er.relationship_type = 'IMPORTS';

-- Find transitive dependencies (3-hop with recursive CTE)
WITH RECURSIVE deps AS (
  -- Base case: direct dependencies
  SELECT target_id AS dep_id, 1 AS depth
  FROM entity_relationships
  WHERE source_id = 'UserService'
    AND relationship_type = 'IMPORTS'

  UNION

  -- Recursive case: dependencies of dependencies
  SELECT er.target_id, d.depth + 1
  FROM deps d
  JOIN entity_relationships er ON d.dep_id = er.source_id
  WHERE er.relationship_type = 'IMPORTS'
    AND d.depth < 3  -- Max depth
)
SELECT DISTINCT ce.*
FROM deps d
JOIN code_entities ce ON d.dep_id = ce.id;
```

### Cost Analysis

| Component | Setup | Monthly | Annual |
|-----------|-------|---------|--------|
| PostgreSQL | Free | $0 | $0 |
| pgvector Extension | Free | $0 | $0 |
| Storage (100GB) | - | $10 | $120 |
| Developer Time | $5K | - | - |
| **Total** | **$5K** | **$10** | **$120** |

---

## Approach 2: Neo4j Graph Database

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Neo4j Graph Database                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  (:Function {name, signature, embedding})                   │
│       │                                                      │
│       ├─[:CALLS]─> (:Function)                              │
│       ├─[:USES]──> (:Variable)                              │
│       └─[:TESTED_BY]─> (:Test)                              │
│                                                              │
│  (:Class {name, members})                                   │
│       │                                                      │
│       ├─[:IMPLEMENTS]─> (:Interface)                        │
│       ├─[:EXTENDS]────> (:Class)                            │
│       └─[:HAS_METHOD]─> (:Function)                         │
│                                                              │
│  (:Module {path, exports})                                  │
│       │                                                      │
│       ├─[:IMPORTS]────> (:Module)                           │
│       └─[:EXPORTS]────> (:Function)                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Strengths ✅

1. **Native Graph**: Built for graph traversal (10-100x faster)
2. **Cypher Query Language**: Intuitive, expressive
3. **Graph Algorithms**: Built-in PageRank, centrality, community detection
4. **Visual Browser**: Neo4j Browser for exploration
5. **Schema Flexibility**: Property graph model
6. **Pathfinding**: Shortest path, all paths, etc.
7. **Pattern Matching**: Powerful MATCH syntax

### Weaknesses ❌

1. **New Dependency**: Another database to manage
2. **Cost**: Enterprise license expensive (~$100K+/year)
3. **Learning Curve**: Team must learn Cypher
4. **Vector Search**: Plugin required (not native)
5. **Operational Overhead**: Separate backups, monitoring
6. **Overkill**: Most queries don't need graph DB performance

### Cypher Example: Find Dependencies

```cypher
// Find all modules that UserService imports (1-hop)
MATCH (u:Module {name: 'UserService'})-[:IMPORTS]->(m:Module)
RETURN m

// Find transitive dependencies (3-hop)
MATCH path = (u:Module {name: 'UserService'})-[:IMPORTS*1..3]->(m:Module)
RETURN DISTINCT m, length(path) AS depth
ORDER BY depth

// Find all tests that might be affected by a change
MATCH (f:Function {name: 'createUser'})<-[:TESTS]-(t:Test)
MATCH (f)-[:CALLS*1..2]->(dep:Function)<-[:TESTS]-(depTest:Test)
RETURN DISTINCT t.name, depTest.name
```

### Cost Analysis

| Component | Setup | Monthly | Annual |
|-----------|-------|---------|--------|
| Neo4j Community | Free | $0 | $0 |
| Neo4j Enterprise | - | $8K | $100K |
| Vector Plugin | - | $1K | $12K |
| Developer Time | $10K | - | - |
| **Total (Community)** | **$10K** | **$0** | **$0** |
| **Total (Enterprise)** | **$10K** | **$9K** | **$112K** |

### When to Consider Neo4j

Use Neo4j if:
- ✅ Need advanced graph algorithms (PageRank, centrality)
- ✅ Queries involve >3-hop traversals frequently
- ✅ Budget allows for enterprise license
- ✅ Team has graph database expertise

**For v1**: PostgreSQL sufficient, consider Neo4j for v2 if needed.

---

## Approach 3: AgentDB Hybrid (Future v2)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Hybrid Architecture                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AgentDB (Vector Store)                              │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ • HNSW indexing (150x faster search)                │   │
│  │ • In-memory + persistent                            │   │
│  │ • Quantization (4-32x compression)                  │   │
│  │ • Custom distance metrics                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                        ▲                                     │
│                        │                                     │
│                        │ Syncs vectors                       │
│                        │                                     │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │ PostgreSQL (Graph Store)                            │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ • code_entities (without embeddings)                │   │
│  │ • entity_relationships (graph structure)            │   │
│  │ • Graph queries (CTEs, JOINs)                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Strengths ✅

1. **Best of Both Worlds**: Fast vectors + flexible graph
2. **150x Faster Search**: AgentDB's HNSW outperforms pgvector
3. **Memory Efficiency**: Quantization reduces storage 4-32x
4. **Hybrid Queries**: Vector search → graph traversal
5. **Custom Metrics**: AgentDB supports custom distance functions
6. **QUIC Sync**: Fast synchronization between stores
7. **Already Integrated**: AQE already uses AgentDB

### Weaknesses ❌

1. **Complexity**: Two databases to manage and sync
2. **Sync Overhead**: Must keep vectors and graph in sync
3. **Consistency**: Eventual consistency between stores
4. **Development Effort**: 2x integration work
5. **Debugging**: Issues could be in AgentDB or PostgreSQL

### Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| **Vector Search (AgentDB)** | <0.5ms | 150x faster than pgvector |
| **Graph Traversal (PG)** | <5ms | Same as pure PostgreSQL |
| **Hybrid Query** | <10ms | Vector search + graph join |
| **Sync Overhead** | <100ms | Background sync every 5s |

### Example Query Flow

```typescript
// Step 1: Vector search in AgentDB (fast)
const semanticMatches = await agentDB.search(queryEmbedding, {
  k: 100,
  threshold: 0.6
});

// Step 2: Graph query in PostgreSQL (filtered by semantic results)
const entityIds = semanticMatches.map(m => m.id);
const dependencies = await pg.query(`
  SELECT ce.*
  FROM code_entities ce
  JOIN entity_relationships er ON ce.id = er.target_id
  WHERE er.source_id = ANY($1)
    AND er.relationship_type = 'IMPORTS'
`, [entityIds]);

// Step 3: Combine results
return {
  semanticRelevance: semanticMatches,
  graphConnections: dependencies
};
```

### When to Consider AgentDB Hybrid

Use AgentDB Hybrid if:
- ✅ Vector search becomes bottleneck (>10ms p99)
- ✅ Need custom distance metrics (e.g., weighted cosine)
- ✅ Storage costs high (quantization saves 75%+)
- ✅ Willing to manage sync complexity

**For v2**: Consider after PostgreSQL approach proven.

---

## Approach 4: SQLite + In-Memory (Not Recommended)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Local SQLite File                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  code_entities.db                                           │
│  ├── entities (table)                                       │
│  ├── relationships (table)                                  │
│  └── embeddings_cache (in-memory Map)                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Strengths ✅

1. **Zero Setup**: Single file, no server
2. **Portable**: Easy to share (just copy .db file)
3. **Simple**: No network latency
4. **Cost**: Free, no hosting

### Weaknesses ❌

1. **No Vector Search**: SQLite doesn't support pgvector
2. **Brute Force**: Must compute cosine similarity in app (slow)
3. **Scalability**: Struggles with >50K entities
4. **No Concurrency**: Single-writer bottleneck
5. **No Advanced Queries**: Limited recursive CTE support
6. **Memory**: Must load vectors into RAM

### Performance (Not Scalable)

| Operation | 1K Entities | 10K Entities | 100K Entities |
|-----------|-------------|--------------|---------------|
| Vector Search | ~10ms | ~100ms | ~1000ms |
| Graph Traversal | <5ms | <20ms | <100ms |

**Verdict**: ❌ Not suitable for production use.

---

## Architectural Decision Matrix

### Requirements Checklist

| Requirement | PostgreSQL | Neo4j | AgentDB Hybrid | SQLite |
|-------------|-----------|-------|----------------|--------|
| **Vector Search (<10ms)** | ✅ <1ms | ⚠️ Plugin | ✅ <0.5ms | ❌ >100ms |
| **Graph Traversal** | ✅ CTEs | ✅ Native | ✅ CTEs | ⚠️ Limited |
| **<500MB per 10K files** | ✅ 180MB | ✅ 150MB | ✅ 50MB | ✅ 200MB |
| **Zero New Dependencies** | ✅ | ❌ | ⚠️ (has AgentDB) | ✅ |
| **Team Expertise** | ✅ SQL | ❌ Cypher | ⚠️ Mixed | ✅ SQL |
| **Cost** | ✅ Free | ❌ $100K/yr | ✅ Free | ✅ Free |
| **Operational Complexity** | ✅ Low | ❌ High | ⚠️ Medium | ✅ Low |
| **Scalability (100K+ entities)** | ✅ | ✅ | ✅ | ❌ |

---

## Recommended Approach: Phased Evolution

### Phase 1 (v1.0): PostgreSQL + pgvector
**Timeline**: 8 weeks
**Goal**: Prove value of knowledge graph

**Rationale**:
- Leverages existing RuVector infrastructure
- Minimal risk, fast time-to-market
- Team already familiar with PostgreSQL
- Can pivot easily if approach doesn't work

**Success Criteria**:
- 70-81% LLM cost reduction
- <10ms query latency
- >50% agent adoption

---

### Phase 2 (v1.5): Optimize PostgreSQL
**Timeline**: +4 weeks after v1.0
**Goal**: Improve performance based on real usage

**Optimizations**:
- Index tuning (GIN, BRIN for metadata)
- Query plan optimization (EXPLAIN ANALYZE)
- Connection pooling (PgBouncer)
- Read replicas for query scaling
- Materialized views for hot paths

**Expected Gains**:
- Query latency: <5ms (50% improvement)
- Throughput: 2x QPS
- Storage: -20% (better compression)

---

### Phase 3 (v2.0): AgentDB Hybrid (If Needed)
**Timeline**: +8 weeks after v1.5
**Goal**: Address bottlenecks with specialized tools

**Conditions for Phase 3**:
- Vector search becomes bottleneck (>10ms p99)
- Storage costs exceed budget
- Need for custom distance metrics

**Implementation**:
- Migrate embeddings to AgentDB
- Keep graph structure in PostgreSQL
- Implement sync layer (QUIC)
- Benchmark hybrid queries

**Expected Gains**:
- Vector search: <0.5ms (10x improvement)
- Storage: -75% (quantization)
- Custom metrics: Weighted cosine, learned metrics

---

## Graph Schema Design

### Entity Types

| Type | Description | Metadata Fields |
|------|-------------|-----------------|
| **Function** | Standalone functions | parameters, returnType, async, exported |
| **Class** | Class declarations | abstract, extends, implements, members |
| **Interface** | TypeScript interfaces | extends, properties, methods |
| **Module** | File-level entity | exports, imports, namespace |
| **Variable** | Module-level variables | type, const/let, exported |
| **Test** | Test functions (describe, it) | testType, assertions, coverage |
| **Documentation** | JSDoc, Markdown | docType, referencedEntities |

### Relationship Types

| Type | Source → Target | Confidence | Metadata |
|------|-----------------|-----------|----------|
| **IMPORTS** | Module → Module | 1.0 | importType (default/named/namespace) |
| **EXPORTS** | Module → Entity | 1.0 | exportType (default/named) |
| **TESTS** | Test → Function | 0.6-0.95 | testType, assertions |
| **DOCUMENTS** | Doc → Code | 0.8-1.0 | docType (jsdoc/markdown), inline |
| **CALLS** | Function → Function | 0.9-1.0 | callType (direct/indirect) |
| **USES** | Function → Variable | 1.0 | usageType (read/write) |
| **IMPLEMENTS** | Class → Interface | 1.0 | - |
| **EXTENDS** | Class → Class | 1.0 | - |
| **HAS_METHOD** | Class → Function | 1.0 | visibility (public/private/protected) |

---

## Migration Path from v1 to v2

### Database Schema Evolution

**v1 Schema** (PostgreSQL only):
```sql
code_entities (
  id, type, name, file_path,
  embedding ruvector(768),  -- Stored in PostgreSQL
  content, signature, metadata
)
```

**v2 Schema** (Hybrid):
```sql
-- PostgreSQL: Graph structure only
code_entities (
  id, type, name, file_path,
  -- embedding REMOVED (moved to AgentDB)
  content, signature, metadata
)

-- AgentDB: Vector store
db.insert({
  id: entity.id,
  vector: Float32Array(entity.embedding),
  metadata: { type, name, filePath }
})
```

### Migration Script

```typescript
async function migrateToAgentDB() {
  // Step 1: Initialize AgentDB
  const agentDB = new AgentDB({ dimension: 768 });

  // Step 2: Copy embeddings from PostgreSQL to AgentDB
  const entities = await pg.query('SELECT id, embedding FROM code_entities');

  for (const entity of entities.rows) {
    await agentDB.insert({
      id: entity.id,
      vector: parseEmbedding(entity.embedding),
      metadata: { migratedAt: Date.now() }
    });
  }

  // Step 3: Remove embeddings from PostgreSQL (saves storage)
  await pg.query('ALTER TABLE code_entities DROP COLUMN embedding');

  console.log(`Migrated ${entities.rowCount} embeddings to AgentDB`);
}
```

---

## Conclusion

**For agentic-qe v1.0, we recommend PostgreSQL + pgvector** because:

1. ✅ **Lowest Risk**: Leverages existing infrastructure
2. ✅ **Fastest Time-to-Market**: 8 weeks vs. 12+ for alternatives
3. ✅ **Proven Performance**: <1ms vector search demonstrated
4. ✅ **Zero New Dependencies**: No new databases to learn/manage
5. ✅ **Cost Effective**: $0 additional cost
6. ✅ **Scalable**: Handles 100K+ entities
7. ✅ **Flexible**: Can evolve to hybrid or graph DB later

**Future considerations**:
- Monitor performance in production
- Evaluate AgentDB hybrid if vector search becomes bottleneck
- Consider Neo4j if graph algorithms needed (PageRank, centrality)

This phased approach de-risks the investment while maximizing time-to-value.

---

**Next Steps**:
1. ✅ Approve PostgreSQL + pgvector approach
2. ✅ Begin Phase 1 implementation (Week 1)
3. ✅ Schedule architecture review after Phase 1
4. ✅ Evaluate Phase 2/3 based on metrics

---

**Document Metadata**:
- **Version**: 1.0.0
- **Last Updated**: 2025-12-21
- **Reviewers**: CTO, Lead Architect, Database Engineer
- **Decision Status**: ✅ Approved for PostgreSQL + pgvector v1
