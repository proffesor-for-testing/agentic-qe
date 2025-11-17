# AgentDB Schema v2.0 Documentation

## Overview

AgentDB v2.0 is a unified learning database that consolidates pattern storage from three separate databases (`agentdb.db`, `patterns.db`, `memory.db`) into a single, coherent system with enhanced test pattern support.

### Key Improvements

- **Unified Storage**: Single database for all learning data
- **Enhanced Test Patterns**: Rich metadata for test code templates
- **Performance Optimized**: < 100ms query performance with strategic indexes
- **Cross-Project Sharing**: Share successful patterns across projects
- **Reinforcement Learning**: Built-in Q-learning and experience replay
- **Semantic Search**: Vector embeddings and FTS for pattern discovery
- **Real-time Metrics**: Track agent improvement over time

### Migration Path

- **Episodes**: 1,759 existing episodes from `agentdb.db`
- **Patterns**: Schema enhanced from `patterns.db` (currently 0 patterns)
- **Learning Data**: Q-values and metrics from `memory.db`

---

## Table Reference

### Core Learning Tables

#### 1. `episodes` - Historical Learning Data

Stores every learning interaction from agent executions.

**Purpose**: Track what agents learned, how they performed, and the context of each learning episode.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Auto-incrementing primary key |
| `session_id` | TEXT | Groups related episodes together |
| `task` | TEXT | Task description agent was working on |
| `input` | TEXT | Input data provided |
| `output` | TEXT | Agent's output/result |
| `critique` | TEXT | Self-critique or feedback |
| `reward` | REAL | Success metric (0.0-1.0) |
| `success` | BOOLEAN | Binary success indicator |
| `latency_ms` | INTEGER | Execution time |
| `tokens_used` | INTEGER | LLM tokens consumed |
| **NEW v2.0 Columns** | | |
| `test_framework` | TEXT | jest, mocha, vitest, playwright |
| `test_type` | TEXT | unit, integration, e2e, performance |
| `coverage_before` | REAL | Coverage % before execution |
| `coverage_after` | REAL | Coverage % after execution |
| `test_count` | INTEGER | Number of tests in episode |
| `quality_score` | REAL | Test quality metric (0-1) |
| `pattern_ids` | TEXT | JSON array of patterns used |

**Indexes**:
```sql
idx_episodes_session      -- Fast session lookups
idx_episodes_task         -- Search by task
idx_episodes_success      -- Filter successful episodes
idx_episodes_timestamp    -- Recent episodes first
idx_episodes_framework    -- Filter by test framework
idx_episodes_coverage     -- Find high-coverage episodes
```

**Example Query**:
```sql
-- Find successful test generation episodes with high coverage
SELECT session_id, task, coverage_after, quality_score, test_count
FROM episodes
WHERE test_framework = 'jest'
  AND success = 1
  AND coverage_after >= 80.0
ORDER BY coverage_after DESC
LIMIT 10;
```

---

#### 2. `test_patterns` - Reusable Test Templates

Stores proven test code patterns that agents can reuse.

**Purpose**: Enable pattern reuse, learn from successful tests, and improve test generation quality over time.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Unique pattern identifier |
| `pattern_name` | TEXT | Human-readable name |
| `pattern_type` | TEXT | edge-case, integration, boundary, etc. |
| `framework` | TEXT | jest, mocha, vitest, playwright, etc. |
| `language` | TEXT | typescript, javascript, python |
| `category` | TEXT | authentication, api, database, etc. |
| `code_signature_hash` | TEXT | Hash for deduplication |
| `code_signature` | JSON | Structural signature |
| `test_template` | JSON | Structured template data |
| `pattern_content` | TEXT | Human-readable test code |
| `description` | TEXT | What this pattern tests |
| **Learning Metrics** | | |
| `success_rate` | REAL | Success rate (0-1) |
| `usage_count` | INTEGER | Times pattern was used |
| `coverage_delta` | REAL | Avg coverage improvement % |
| `execution_time_ms` | INTEGER | Avg execution time |
| `quality_score` | REAL | Quality metric (0-1) |
| `trend` | TEXT | improving, declining, stable |
| **Semantic Search** | | |
| `embedding` | BLOB | Vector for similarity search |

**Constraints**:
```sql
pattern_type IN ('edge-case', 'integration', 'boundary', 'error-handling',
                 'unit', 'e2e', 'performance', 'security', 'accessibility',
                 'regression', 'smoke', 'contract', 'mutation')

framework IN ('jest', 'mocha', 'cypress', 'vitest', 'playwright',
              'ava', 'tape', 'jasmine', 'qunit', 'testcafe')
```

**Indexes**:
```sql
idx_patterns_framework_type    -- Filter by framework + type
idx_patterns_signature_hash    -- Fast deduplication
idx_patterns_success_rate      -- Find best patterns
idx_patterns_usage             -- Most popular patterns
idx_patterns_quality           -- Highest quality patterns
idx_patterns_category          -- Search by category
idx_patterns_trend             -- Find improving patterns
idx_patterns_dedup (UNIQUE)    -- Prevent duplicates
```

**Example Query**:
```sql
-- Find high-performing Jest unit test patterns
SELECT
    pattern_name,
    success_rate,
    usage_count,
    quality_score,
    coverage_delta,
    trend
FROM test_patterns
WHERE framework = 'jest'
  AND pattern_type = 'unit'
  AND success_rate >= 0.8
  AND usage_count >= 5
ORDER BY (success_rate * 0.4 + quality_score * 0.4 + (usage_count/100.0) * 0.2) DESC
LIMIT 20;
```

---

#### 3. `pattern_usage` - Pattern Usage Tracking

Tracks every time a pattern is used to update learning metrics.

**Purpose**: Monitor pattern effectiveness, calculate success rates, and identify which patterns work best in which contexts.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `pattern_id` | TEXT | Reference to test_patterns |
| `session_id` | TEXT | Session where pattern was used |
| `agent_type` | TEXT | Which agent used it |
| `usage_timestamp` | INTEGER | When it was used |
| `success` | BOOLEAN | Was usage successful? |
| `coverage_improvement` | REAL | Coverage delta |
| `execution_time_ms` | INTEGER | How long it took |
| `context` | TEXT | JSON context data |

**Indexes**:
```sql
idx_usage_pattern    -- Track pattern performance
idx_usage_session    -- Session analysis
idx_usage_agent      -- Agent-specific metrics
idx_usage_success    -- Filter successful uses
```

**Example Query**:
```sql
-- Calculate rolling 30-day success rate for a pattern
SELECT
    pattern_id,
    COUNT(*) as total_uses,
    AVG(CAST(success AS REAL)) as success_rate,
    AVG(coverage_improvement) as avg_coverage_gain
FROM pattern_usage
WHERE usage_timestamp >= (strftime('%s', 'now') - 2592000)
GROUP BY pattern_id
HAVING total_uses >= 5;
```

---

#### 4. `learning_metrics` - Improvement Tracking

Tracks agent improvement over time.

**Purpose**: Measure learning progress, identify bottlenecks, and validate that agents are actually improving.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT | Specific agent instance |
| `agent_type` | TEXT | qe-test-generator, etc. |
| `metric_type` | TEXT | coverage, quality, latency, etc. |
| `metric_value` | REAL | Current metric value |
| `baseline_value` | REAL | Starting baseline |
| `improvement_percentage` | REAL | % improvement |
| `test_framework` | TEXT | Framework being tested |
| `coverage_percent` | REAL | Current coverage % |
| `test_pass_rate` | REAL | Pass rate (0-1) |
| `patterns_used` | INTEGER | Patterns reused |
| `iteration` | INTEGER | Training iteration |

**Metric Types**:
```sql
metric_type IN ('coverage', 'quality', 'latency', 'success_rate',
                'improvement', 'accuracy', 'test_count',
                'pattern_reuse', 'code_quality')
```

**Indexes**:
```sql
idx_metrics_agent          -- Agent timeline
idx_metrics_type           -- By metric type
idx_metrics_improvement    -- Best improvements
idx_metrics_framework      -- Framework-specific
```

**Example Query**:
```sql
-- Track coverage improvement over time for an agent
SELECT
    timestamp,
    coverage_percent,
    improvement_percentage,
    patterns_used,
    iteration
FROM learning_metrics
WHERE agent_type = 'qe-test-generator'
  AND metric_type = 'coverage'
  AND test_framework = 'jest'
ORDER BY timestamp ASC;
```

---

### Reinforcement Learning Tables

#### 5. `q_values` - Q-Learning State-Action Values

Stores Q-learning values for reinforcement learning agents.

**Purpose**: Enable agents to learn optimal actions for different states through Q-learning.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT | Agent identifier |
| `state_key` | TEXT | State representation |
| `action_key` | TEXT | Action taken |
| `q_value` | REAL | Learned Q-value |
| `update_count` | INTEGER | Times updated |
| `metadata` | TEXT | JSON metadata |

**Example Query**:
```sql
-- Find best action for a given state
SELECT action_key, q_value, update_count
FROM q_values
WHERE agent_id = 'test-gen-001'
  AND state_key = 'high_complexity_api'
ORDER BY q_value DESC
LIMIT 5;
```

---

#### 6. `learning_experiences` - Experience Replay Buffer

Stores state-action-reward-next_state tuples for experience replay.

**Purpose**: Enable agents to learn from past experiences using experience replay (a key RL technique).

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `state` | TEXT | Current state (JSON) |
| `action` | TEXT | Action taken (JSON) |
| `reward` | REAL | Reward received |
| `next_state` | TEXT | Resulting state (JSON) |
| `done` | BOOLEAN | Episode finished? |

**Example Query**:
```sql
-- Sample experiences for training
SELECT state, action, reward, next_state, done
FROM learning_experiences
WHERE agent_id = 'test-gen-001'
ORDER BY RANDOM()
LIMIT 100;
```

---

### Pattern Discovery Tables

#### 7. `pattern_similarity_index` - Similarity Search

Pre-computed similarity scores for fast nearest-neighbor search.

**Purpose**: Find similar patterns quickly without computing embeddings on every query.

**Key Columns**:

| Column | Type | Description |
|--------|------|-------------|
| `pattern_id` | TEXT | Source pattern |
| `similar_pattern_id` | TEXT | Similar pattern |
| `similarity_score` | REAL | Cosine similarity (0-1) |
| `distance_metric` | TEXT | Distance calculation method |

**Example Query**:
```sql
-- Find patterns similar to a given pattern
SELECT
    p.pattern_name,
    p.framework,
    p.success_rate,
    si.similarity_score
FROM pattern_similarity_index si
JOIN test_patterns p ON si.similar_pattern_id = p.id
WHERE si.pattern_id = 'auth-jwt-test-001'
  AND si.similarity_score >= 0.7
ORDER BY si.similarity_score DESC
LIMIT 10;
```

---

#### 8. `pattern_fts` - Full-Text Search

Virtual FTS5 table for fast text search across patterns.

**Purpose**: Enable natural language search of test patterns.

**Searchable Fields**:
- `pattern_name`
- `description`
- `pattern_content`
- `tags`

**Example Query**:
```sql
-- Search for authentication-related patterns
SELECT
    p.id,
    p.pattern_name,
    p.description,
    bm25(pattern_fts) as relevance
FROM pattern_fts
JOIN test_patterns p ON pattern_fts.rowid = p.rowid
WHERE pattern_fts MATCH 'authentication OR auth OR jwt OR token'
ORDER BY relevance DESC
LIMIT 20;
```

---

### Utility Tables

#### 9. `cross_project_mappings` - Cross-Project Pattern Sharing

Maps patterns used across different projects.

**Purpose**: Share successful patterns between projects, track adaptation success.

**Example Query**:
```sql
-- Find patterns that work well across projects
SELECT
    p.pattern_name,
    cm.source_project,
    cm.target_project,
    cm.success_rate,
    cm.usage_count
FROM cross_project_mappings cm
JOIN test_patterns p ON cm.pattern_id = p.id
WHERE cm.success_rate >= 0.8
  AND cm.usage_count >= 3
ORDER BY cm.success_rate DESC;
```

---

#### 10. `pattern_stats_cache` - Performance Cache

Caches expensive aggregate queries.

**Purpose**: Speed up dashboard queries, reduce CPU load.

**Key Columns**:
- `cache_key`: Unique cache identifier
- `framework`: Cached framework
- `total_patterns`: Count of patterns
- `avg_success_rate`: Average success
- `expires_at`: Cache expiration

---

## Views

### `v_pattern_performance` - Pattern Performance Summary

Aggregates pattern metrics with usage statistics.

```sql
SELECT * FROM v_pattern_performance
WHERE framework = 'jest'
ORDER BY avg_coverage_improvement DESC;
```

### `v_agent_learning_progress` - Agent Progress Dashboard

Shows learning progress per agent.

```sql
SELECT * FROM v_agent_learning_progress
WHERE agent_type = 'qe-test-generator'
ORDER BY avg_improvement DESC;
```

### `v_top_patterns` - High-Performing Patterns

Pre-filtered view of best patterns.

```sql
SELECT * FROM v_top_patterns
WHERE framework = 'jest'
LIMIT 10;
```

---

## Performance Optimization

### Index Strategy

1. **Composite Indexes**: `(framework, pattern_type)` for multi-column filters
2. **Covering Indexes**: Include frequently selected columns
3. **Descending Indexes**: For `ORDER BY ... DESC` queries
4. **Unique Indexes**: Prevent duplicate patterns

### Query Performance Targets

| Query Type | Target | Strategy |
|------------|--------|----------|
| Pattern lookup by ID | < 1ms | Primary key index |
| Framework + type filter | < 10ms | Composite index |
| Similarity search | < 50ms | Pre-computed similarity index |
| Full-text search | < 100ms | FTS5 index |
| Aggregate queries | < 100ms | Stats cache + indexes |

### SQLite Settings

```sql
PRAGMA journal_mode = WAL;        -- Concurrent reads/writes
PRAGMA synchronous = NORMAL;      -- Balanced safety/speed
PRAGMA cache_size = -64000;       -- 64MB cache
PRAGMA mmap_size = 268435456;     -- 256MB memory-mapped I/O
```

---

## Triggers

### `update_pattern_stats` - Auto-Update Pattern Metrics

Automatically updates pattern success rate and usage count when pattern is used.

### `update_pattern_trend` - Trend Detection

Automatically sets trend based on success rate changes:
- `improving`: Success rate increased > 5%
- `declining`: Success rate decreased > 5%
- `stable`: Within ±5%

### FTS Sync Triggers

Keep full-text search index synchronized with test_patterns table.

---

## Data Integrity

### Constraints

1. **Check Constraints**: Validate ranges (0-1 for rates, 0-100 for percentages)
2. **Foreign Keys**: Ensure referential integrity
3. **Unique Indexes**: Prevent duplicate patterns
4. **JSON Validation**: Validate JSON columns

### Data Types

- **Timestamps**: Unix epoch (INTEGER) for consistency
- **Rates/Scores**: REAL (0.0-1.0)
- **Percentages**: REAL (0.0-100.0)
- **JSON**: TEXT with `json_valid()` check
- **Embeddings**: BLOB for vector storage

---

## Migration Notes

See [migration-v1-to-v2.md](migration-v1-to-v2.md) for detailed migration instructions.

### Summary

1. **Episodes**: Add new columns to existing table
2. **Patterns**: Create new enhanced schema
3. **Metrics**: Migrate from memory.db
4. **Q-values**: Copy from memory.db
5. **Indexes**: Create all performance indexes
6. **Views**: Create convenience views
7. **Triggers**: Install auto-update triggers

---

## Common Queries

### Find Best Patterns for Framework

```sql
SELECT
    pattern_name,
    pattern_type,
    success_rate,
    usage_count,
    quality_score,
    coverage_delta
FROM test_patterns
WHERE framework = 'jest'
  AND success_rate >= 0.7
  AND usage_count >= 3
ORDER BY (success_rate * 0.4 + quality_score * 0.4 + (usage_count/100.0) * 0.2) DESC
LIMIT 20;
```

### Track Agent Improvement

```sql
SELECT
    DATE(timestamp, 'unixepoch') as date,
    AVG(coverage_percent) as avg_coverage,
    AVG(quality_score) as avg_quality,
    COUNT(*) as iterations
FROM learning_metrics
WHERE agent_type = 'qe-test-generator'
  AND metric_type = 'coverage'
  AND timestamp >= strftime('%s', 'now', '-30 days')
GROUP BY DATE(timestamp, 'unixepoch')
ORDER BY date ASC;
```

### Find Patterns Needing Improvement

```sql
SELECT
    pattern_name,
    framework,
    success_rate,
    usage_count,
    trend,
    last_used
FROM test_patterns
WHERE success_rate < 0.6
  AND usage_count >= 5
  AND trend = 'declining'
ORDER BY success_rate ASC;
```

### Semantic Pattern Search

```sql
-- Combine FTS search with similarity
WITH text_matches AS (
    SELECT
        p.id,
        p.pattern_name,
        bm25(pattern_fts) as text_relevance
    FROM pattern_fts
    JOIN test_patterns p ON pattern_fts.rowid = p.rowid
    WHERE pattern_fts MATCH 'authentication error handling'
    LIMIT 50
)
SELECT
    tm.pattern_name,
    tm.text_relevance,
    p.success_rate,
    p.quality_score
FROM text_matches tm
JOIN test_patterns p ON tm.id = p.id
WHERE p.success_rate >= 0.7
ORDER BY (tm.text_relevance * 0.5 + p.success_rate * 0.3 + p.quality_score * 0.2) DESC
LIMIT 10;
```

---

## Schema Version History

| Version | Date | Description |
|---------|------|-------------|
| 2.0.0 | 2025-11-16 | Consolidated learning system with enhanced test pattern support |
| 1.0.0 | 2024-xx-xx | Initial episodes-only schema |

---

## Future Enhancements (v2.1+)

- **Vector Search**: Native vector similarity using SQLite VSS extension
- **Temporal Patterns**: Time-series pattern effectiveness analysis
- **Multi-tenant**: Support for multiple projects in single database
- **Pattern Evolution**: Track pattern lineage and mutations
- **AutoML Integration**: Automatic hyperparameter tuning for learning rates
- **Distributed Learning**: Support for federated learning across agents

---

## References

- [SQLite FTS5](https://www.sqlite.org/fts5.html)
- [SQLite Performance Tuning](https://www.sqlite.org/optoverview.html)
- [Q-Learning Algorithm](https://en.wikipedia.org/wiki/Q-learning)
- [Experience Replay](https://en.wikipedia.org/wiki/Experience_replay)
