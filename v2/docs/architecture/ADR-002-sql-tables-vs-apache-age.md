# ADR-002: SQL Tables vs Apache AGE for Code Intelligence Graph

**Status:** Accepted
**Date:** 2025-12-21
**Decision Makers:** Architecture Team
**Supersedes:** N/A
**Related:** Issue #158, code-intelligence-system-v2-goap.md

---

## Context

The Code Intelligence System v2.0 requires a graph storage mechanism to model relationships between code entities (IMPORTS, CALLS, TESTS, EXTENDS, IMPLEMENTS, DEFINES, REFERENCES).

During the planning phase, two approaches were evaluated:

1. **Apache AGE** - PostgreSQL extension providing native Cypher graph queries
2. **SQL Tables** - Standard PostgreSQL tables with foreign key relationships

The original GOAP planning documents specified Apache AGE, but the architecture comparison recommended SQL tables.

---

## Decision

**We will use SQL tables (entity_relationships) for v1, deferring Apache AGE to v2 if complex graph traversals become necessary.**

---

## Rationale

### Factors Considered

| Factor | SQL Tables | Apache AGE | Winner |
|--------|-----------|------------|--------|
| **Implementation Complexity** | Low | Medium | SQL |
| **Additional Dependencies** | None | AGE extension required | SQL |
| **Query Syntax** | Familiar SQL | Cypher (new learning curve) | SQL |
| **Team Familiarity** | High | Low | SQL |
| **1-hop Query Performance** | <5ms | <5ms | Tie |
| **3-hop Query Performance** | <50ms (recursive CTE) | <10ms (native) | AGE |
| **v1 Scope Appropriateness** | Excellent | Overkill | SQL |
| **Operational Overhead** | None | Extension management | SQL |

### Key Arguments FOR SQL Tables

1. **Zero New Dependencies**: Reuses existing PostgreSQL infrastructure
2. **Team Expertise**: All developers know SQL; Cypher requires training
3. **Sufficient for v1**: Most queries are 1-2 hop traversals (imports, tests)
4. **Simpler Debugging**: Standard SQL tools work without modification
5. **Faster Implementation**: No extension installation, configuration, or testing
6. **Fallback Compatibility**: If AGE has issues, SQL continues to work

### Key Arguments FOR Apache AGE (Deferred)

1. **Native Graph Performance**: 5-10x faster for 3+ hop traversals
2. **Expressive Queries**: Cypher is more readable for complex patterns
3. **Graph Algorithms**: Built-in PageRank, centrality, community detection
4. **Future Scale**: Better suited for large codebases (>1M entities)

### Why We Chose SQL for v1

The Code Intelligence System v1.0 primarily needs:
- Find what a file imports (1-hop)
- Find what tests cover a function (1-hop)
- Find callers of a function (1-hop)
- Find transitive dependencies (2-3 hops, occasional)

SQL with recursive CTEs handles all these efficiently. Apache AGE's advantages (complex graph algorithms, 5+ hop traversals) are not required for v1.

---

## Implementation

### Schema Design

```sql
-- Entity storage
CREATE TABLE code_entities (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  name TEXT NOT NULL,
  signature TEXT,
  line_start INTEGER,
  line_end INTEGER,
  language VARCHAR(20),
  parent_id TEXT REFERENCES code_entities(id),
  metadata JSONB DEFAULT '{}'
);

-- Relationship storage (graph edges)
CREATE TABLE entity_relationships (
  id SERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_type VARCHAR(50) NOT NULL,  -- IMPORTS, TESTS, CALLS, etc.
  confidence REAL DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  UNIQUE(source_id, target_id, relationship_type)
);

-- Indices for efficient traversal
CREATE INDEX idx_rel_source ON entity_relationships(source_id);
CREATE INDEX idx_rel_target ON entity_relationships(target_id);
CREATE INDEX idx_rel_source_type ON entity_relationships(source_id, relationship_type);
```

### Query Examples

```sql
-- 1-hop: Find imports of UserService
SELECT ce.* FROM code_entities ce
JOIN entity_relationships er ON ce.id = er.target_id
WHERE er.source_id = 'UserService' AND er.relationship_type = 'IMPORTS';

-- 2-hop: Find tests for functions called by UserService
WITH called_functions AS (
  SELECT target_id FROM entity_relationships
  WHERE source_id = 'UserService' AND relationship_type = 'CALLS'
)
SELECT ce.* FROM code_entities ce
JOIN entity_relationships er ON ce.id = er.source_id
WHERE er.target_id IN (SELECT target_id FROM called_functions)
  AND er.relationship_type = 'TESTS';

-- 3-hop: Transitive dependencies with recursive CTE
WITH RECURSIVE deps AS (
  SELECT target_id, 1 AS depth FROM entity_relationships
  WHERE source_id = 'UserService' AND relationship_type = 'IMPORTS'
  UNION
  SELECT er.target_id, d.depth + 1
  FROM deps d
  JOIN entity_relationships er ON d.target_id = er.source_id
  WHERE er.relationship_type = 'IMPORTS' AND d.depth < 3
)
SELECT DISTINCT ce.* FROM deps
JOIN code_entities ce ON deps.target_id = ce.id;
```

---

## Consequences

### Positive

- ✅ Faster v1 delivery (no new extension to learn/deploy)
- ✅ Lower operational risk (proven PostgreSQL patterns)
- ✅ Team can contribute immediately (SQL expertise)
- ✅ Simpler CI/CD (no AGE extension in test environments)
- ✅ Clear upgrade path to AGE if needed

### Negative

- ❌ More verbose queries for complex graph patterns
- ❌ Manual implementation of graph algorithms if needed
- ❌ May need refactoring if v2 adopts Apache AGE
- ❌ Slightly slower for deep traversals (>3 hops)

### Neutral

- 📊 Performance monitoring needed to validate assumptions
- 📊 Usage patterns will inform v2 decision

---

## Migration Path to Apache AGE (v2)

If v2 requires Apache AGE, the migration path is:

1. **Install AGE Extension**
   ```sql
   CREATE EXTENSION age;
   SET search_path = ag_catalog, "$user", public;
   SELECT create_graph('code_graph');
   ```

2. **Migrate Entities to Graph Nodes**
   ```sql
   SELECT * FROM cypher('code_graph', $$
     CREATE (n:Entity {id: $id, name: $name, type: $type})
   $$) as (v agtype);
   ```

3. **Migrate Relationships to Graph Edges**
   ```sql
   SELECT * FROM cypher('code_graph', $$
     MATCH (s:Entity {id: $source_id}), (t:Entity {id: $target_id})
     CREATE (s)-[:IMPORTS]->(t)
   $$) as (e agtype);
   ```

4. **Dual-Write Period**: Write to both SQL and AGE during transition
5. **Deprecate SQL Tables**: Remove after validation

### Triggers for AGE Adoption

Consider Apache AGE for v2 if:
- [ ] >50% of queries are 3+ hop traversals
- [ ] Graph algorithms (PageRank, centrality) needed
- [ ] Entity count exceeds 1M with performance issues
- [ ] Complex pattern matching becomes common

---

## References

- [Apache AGE Documentation](https://age.apache.org/)
- [PostgreSQL Recursive CTEs](https://www.postgresql.org/docs/current/queries-with.html)
- [Knowledge Graph Architecture Comparison](../planning/knowledge-graph-architecture-comparison.md)
- [Code Intelligence System v2 GOAP](../planning/code-intelligence-system-v2-goap.md)

---

## Decision Log

| Date | Author | Change |
|------|--------|--------|
| 2025-12-21 | Architecture Team | Initial decision: SQL tables for v1 |

---

**Approved By:** Architecture Review
**Implementation Started:** 2025-12-21
**Review Date:** After Wave 4 completion (evaluate AGE need)
