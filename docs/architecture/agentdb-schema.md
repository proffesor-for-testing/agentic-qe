# AgentDB Schema Documentation

## Overview

The AgentDB database (`.agentic-qe/agentdb.db`) serves as the consolidated learning and pattern storage system for all 18 QE agents in the Agentic QE Fleet.

**Version:** 1.1.0
**Schema Type:** SQLite with WAL mode
**Location:** `.agentic-qe/agentdb.db`

## Schema Architecture

### Design Principles

1. **Single Source of Truth**: All QE learning data consolidated in one database
2. **Performance Optimized**: HNSW vector indexing for 150x faster similarity search
3. **Framework Agnostic**: Support for Jest, Mocha, Cypress, Vitest, Playwright, AVA, Jasmine
4. **Cross-Project Learning**: Pattern sharing across different projects and frameworks
5. **Graceful Degradation**: FTS5 falls back to regular indexed tables when unavailable

## Database Tables

### 1. `patterns` (Base AgentDB Table)
**Purpose**: Core vector embeddings storage for AgentDB

```sql
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  embedding BLOB,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
)
```

**Indexes:**
- `idx_patterns_type` on `type`

**Used By:** AgentDB core, all reasoning agents

---

### 2. `test_patterns` (QE Learning Core)
**Purpose**: Store test patterns with code signatures for deduplication

```sql
CREATE TABLE test_patterns (
  id TEXT PRIMARY KEY NOT NULL,
  pattern_type TEXT NOT NULL,  -- edge-case, integration, boundary, etc.
  framework TEXT NOT NULL,      -- jest, mocha, cypress, vitest, etc.
  language TEXT NOT NULL DEFAULT 'typescript',
  code_signature_hash TEXT NOT NULL,
  code_signature TEXT NOT NULL,
  test_template TEXT NOT NULL,
  metadata TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK(pattern_type IN ('edge-case', 'integration', 'boundary',
                         'error-handling', 'unit', 'e2e',
                         'performance', 'security')),
  CHECK(framework IN ('jest', 'mocha', 'cypress', 'vitest',
                      'playwright', 'ava', 'jasmine'))
)
```

**Indexes:**
- `idx_patterns_framework_type` on `(framework, pattern_type)`
- `idx_patterns_signature_hash` on `code_signature_hash`
- `idx_patterns_dedup` UNIQUE on `(code_signature_hash, framework)`

**Used By:** TestGeneratorAgent, CoverageAnalyzerAgent, all pattern-based agents

---

### 3. `pattern_usage` (Quality Metrics)
**Purpose**: Track pattern usage, success rates, and quality metrics per project

```sql
CREATE TABLE pattern_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  avg_execution_time REAL NOT NULL DEFAULT 0.0,
  avg_coverage_gain REAL NOT NULL DEFAULT 0.0,
  flaky_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0.0,
  first_used INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
  UNIQUE(pattern_id, project_id)
)
```

**Indexes:**
- `idx_usage_pattern` on `pattern_id`
- `idx_usage_quality` on `quality_score DESC`

**Used By:** Pattern quality scoring, improvement loop, analytics

---

### 4. `cross_project_mappings` (Framework Translation)
**Purpose**: Enable pattern sharing across different testing frameworks

```sql
CREATE TABLE cross_project_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_id TEXT NOT NULL,
  source_framework TEXT NOT NULL,
  target_framework TEXT NOT NULL,
  transformation_rules TEXT NOT NULL,
  compatibility_score REAL NOT NULL DEFAULT 1.0,
  project_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0.0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
  UNIQUE(pattern_id, source_framework, target_framework)
)
```

**Use Cases:**
- Jest → Vitest migrations
- Cypress → Playwright conversions
- Cross-framework pattern reuse

**Used By:** Framework migration tools, pattern adapters

---

### 5. `pattern_similarity_index` (Fast Similarity Queries)
**Purpose**: Pre-computed similarity scores for O(1) pattern similarity queries

```sql
CREATE TABLE pattern_similarity_index (
  pattern_a TEXT NOT NULL,
  pattern_b TEXT NOT NULL,
  similarity_score REAL NOT NULL,
  structure_similarity REAL NOT NULL,
  identifier_similarity REAL NOT NULL,
  metadata_similarity REAL NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
  last_computed INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (pattern_a, pattern_b),
  FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
  FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE
)
```

**Indexes:**
- `idx_similarity_score` on `similarity_score DESC`

**Used By:** Pattern recommendations, duplicate detection, clustering

---

### 6. `pattern_fts` (Full-Text Search)
**Purpose**: Fast full-text search across pattern metadata

**FTS5 Version** (when available):
```sql
CREATE VIRTUAL TABLE pattern_fts USING fts5(
  pattern_id UNINDEXED,
  pattern_name,
  description,
  tags,
  framework,
  pattern_type,
  content='',
  tokenize='porter ascii'
)
```

**Fallback Version** (sql.js WASM without FTS5):
```sql
CREATE TABLE pattern_fts (
  pattern_id TEXT PRIMARY KEY,
  pattern_name TEXT,
  description TEXT,
  tags TEXT,
  framework TEXT,
  pattern_type TEXT
)
```

**Indexes (Fallback):**
- `idx_fts_pattern_name` on `pattern_name`
- `idx_fts_framework` on `framework`
- `idx_fts_pattern_type` on `pattern_type`

**Used By:** Pattern search CLI, pattern discovery

---

### 7. `schema_version` (Migration Tracking)
**Purpose**: Track applied schema versions for safe migrations

```sql
CREATE TABLE schema_version (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch()),
  description TEXT
)
```

**Current Version:** 1.1.0 - "Initial QE ReasoningBank schema"

**Used By:** Database migration system, version compatibility checks

---

## Performance Characteristics

| Operation | Performance | Technology |
|-----------|-------------|------------|
| Vector Search | <100µs | HNSW indexing (150x faster) |
| Pattern Retrieval | <1ms | In-memory cache |
| Batch Insert | 2ms/100 | WAL mode + transactions |
| Similarity Query | O(1) | Pre-computed index |
| Full-Text Search | <10ms | FTS5 (or indexed fallback) |

## Storage Estimates

| Table | Typical Size | Max Size |
|-------|-------------|----------|
| patterns | 10-100 MB | 1 GB |
| test_patterns | 50-500 MB | 5 GB |
| pattern_usage | 1-10 MB | 100 MB |
| cross_project_mappings | 100 KB - 10 MB | 100 MB |
| pattern_similarity_index | 10-100 MB | 1 GB |
| pattern_fts | 5-50 MB | 500 MB |
| **Total** | **~100 MB - 1 GB** | **~10 GB** |

## Initialization

Tables are automatically created during `aqe init` via:

**File:** `src/core/memory/RealAgentDBAdapter.ts`
**Method:** `createQELearningTables()`
**Process:**
1. Enable WAL mode for concurrent access
2. Create `test_patterns` with indexes
3. Create `pattern_usage` with foreign keys
4. Create `cross_project_mappings`
5. Create `pattern_similarity_index`
6. Create `pattern_fts` (with FTS5 fallback)
7. Create `schema_version` and insert v1.1.0

## Maintenance

### Vacuum and Optimization
```bash
# Vacuum database (reclaim space)
sqlite3 .agentic-qe/agentdb.db "VACUUM;"

# Analyze for query optimization
sqlite3 .agentic-qe/agentdb.db "ANALYZE;"
```

### Backup
```bash
# Create backup
sqlite3 .agentic-qe/agentdb.db ".backup .agentic-qe/agentdb.backup.db"

# Restore from backup
cp .agentic-qe/agentdb.backup.db .agentic-qe/agentdb.db
```

### Statistics
```bash
# Table row counts
sqlite3 .agentic-qe/agentdb.db "
  SELECT 'patterns' as table_name, COUNT(*) as rows FROM patterns
  UNION ALL
  SELECT 'test_patterns', COUNT(*) FROM test_patterns
  UNION ALL
  SELECT 'pattern_usage', COUNT(*) FROM pattern_usage
  UNION ALL
  SELECT 'cross_project_mappings', COUNT(*) FROM cross_project_mappings
  UNION ALL
  SELECT 'pattern_similarity_index', COUNT(*) FROM pattern_similarity_index
  UNION ALL
  SELECT 'pattern_fts', COUNT(*) FROM pattern_fts;
"
```

## Migration History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2025-01 | Initial QE ReasoningBank schema with all 7 tables |

## Related Documentation

- [AgentDB Integration Guide](./AgentDB-integration.md)
- [Learning System Architecture](./learning-system.md)
- [Pattern Management Guide](../guides/PATTERN-MANAGEMENT-USER-GUIDE.md)
- [Adapter Architecture](./adapters.md)

## Security

- **SQL Injection Protection**: All queries use parameterized statements
- **Data Validation**: CHECK constraints on pattern types and frameworks
- **Foreign Key Enforcement**: CASCADE deletes maintain referential integrity
- **Access Control**: File-based permissions via `.agentic-qe/` directory

## Troubleshooting

### FTS5 Not Available
**Symptom:** Warning "FTS5 not available, using regular table"
**Cause:** sql.js WASM build doesn't include FTS5
**Impact:** Reduced full-text search performance (still functional)
**Solution:** Use native SQLite for production, or accept indexed fallback

### Database Locked
**Symptom:** "database is locked" errors
**Cause:** Concurrent write access without WAL mode
**Solution:** WAL mode is enabled automatically; check file permissions

### Large Database Size
**Symptom:** agentdb.db exceeds 1GB
**Cause:** Many patterns or high similarity index density
**Solution:** Run VACUUM, or archive old patterns

---

**Generated:** 2025-01-18
**Schema Version:** 1.1.0
**Maintained By:** Agentic QE Fleet Team
