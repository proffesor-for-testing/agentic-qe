-- ============================================================================
-- AgentDB Schema v2.0 - Unified Learning System
-- ============================================================================
-- Purpose: Consolidate pattern storage from multiple databases into one
--          unified system with enhanced test pattern support
-- Date: 2025-11-16
-- Migration: See migration-v1-to-v2.md for upgrade path
-- ============================================================================

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL,
    description TEXT NOT NULL,
    migration_notes TEXT
);

INSERT OR REPLACE INTO schema_version VALUES
    ('2.0.0', strftime('%s', 'now'), 'Consolidated learning system with enhanced test pattern support', 'Initial v2.0 release');

-- ============================================================================
-- CORE LEARNING TABLES
-- ============================================================================

-- Episodes: Historical learning data from agent interactions
-- Migrated from: agentdb.db (1,759 existing episodes)
CREATE TABLE IF NOT EXISTS episodes (
    -- Primary identity
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    session_id TEXT NOT NULL,

    -- Task context
    task TEXT NOT NULL,
    input TEXT,
    output TEXT,
    critique TEXT,

    -- Performance metrics
    reward REAL DEFAULT 0.0,
    success BOOLEAN DEFAULT 0,
    latency_ms INTEGER,
    tokens_used INTEGER,

    -- NEW: Test-specific context (v2.0)
    test_framework TEXT,                    -- jest, mocha, vitest, playwright
    test_type TEXT,                          -- unit, integration, e2e, performance
    coverage_before REAL,                    -- Coverage % before test execution
    coverage_after REAL,                     -- Coverage % after test execution
    test_count INTEGER,                      -- Number of tests in episode
    quality_score REAL,                      -- Test quality metric (0-1)
    pattern_ids TEXT,                        -- JSON array of pattern IDs used

    -- Categorization
    tags TEXT,                               -- JSON array of tags
    metadata JSON,                           -- Flexible metadata storage

    -- Timestamps
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    -- Constraints
    CHECK(reward >= 0.0 AND reward <= 1.0),
    CHECK(success IN (0, 1)),
    CHECK(coverage_before >= 0.0 AND coverage_before <= 100.0),
    CHECK(coverage_after >= 0.0 AND coverage_after <= 100.0),
    CHECK(quality_score >= 0.0 AND quality_score <= 1.0)
);

-- Performance indexes for episodes
CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task);
CREATE INDEX IF NOT EXISTS idx_episodes_success ON episodes(success, reward);
CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(ts DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_framework ON episodes(test_framework, test_type);
CREATE INDEX IF NOT EXISTS idx_episodes_coverage ON episodes(coverage_after DESC);

-- ============================================================================
-- TEST PATTERN TABLES
-- ============================================================================

-- Test Patterns: Reusable test code templates with learning data
-- Enhanced from: patterns.db
CREATE TABLE IF NOT EXISTS test_patterns (
    -- Primary identity
    id TEXT PRIMARY KEY NOT NULL,
    pattern_name TEXT NOT NULL,

    -- Classification
    pattern_type TEXT NOT NULL,              -- edge-case, integration, boundary, etc.
    framework TEXT NOT NULL,                 -- jest, mocha, vitest, playwright, etc.
    language TEXT NOT NULL DEFAULT 'typescript',
    category TEXT,                           -- authentication, api, database, etc.

    -- Code signature (for deduplication)
    code_signature_hash TEXT NOT NULL,
    code_signature JSON NOT NULL,

    -- Template content
    test_template JSON NOT NULL,             -- Actual test code template
    pattern_content TEXT NOT NULL,           -- Human-readable test code
    description TEXT,

    -- Learning metrics
    success_rate REAL DEFAULT 0.0,           -- Success rate (0-1)
    usage_count INTEGER DEFAULT 0,           -- Times pattern was used
    coverage_delta REAL,                     -- Average coverage improvement %
    execution_time_ms INTEGER,               -- Average execution time
    quality_score REAL DEFAULT 0.0,          -- Quality metric (0-1)

    -- Performance tracking
    last_success_rate REAL,                  -- Rolling window success rate
    trend TEXT DEFAULT 'stable',             -- improving, declining, stable

    -- Semantic search
    embedding BLOB,                          -- Vector embedding for similarity

    -- Metadata
    tags TEXT,                               -- JSON array of tags
    metadata JSON NOT NULL,                  -- Flexible metadata

    -- Versioning
    version TEXT NOT NULL DEFAULT '1.0.0',
    parent_pattern_id TEXT,                  -- For pattern evolution tracking

    -- Timestamps
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_used INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    -- Constraints
    CHECK(pattern_type IN (
        'edge-case', 'integration', 'boundary', 'error-handling',
        'unit', 'e2e', 'performance', 'security', 'accessibility',
        'regression', 'smoke', 'contract', 'mutation'
    )),
    CHECK(framework IN (
        'jest', 'mocha', 'cypress', 'vitest', 'playwright',
        'ava', 'tape', 'jasmine', 'qunit', 'testcafe'
    )),
    CHECK(language IN ('typescript', 'javascript', 'tsx', 'jsx', 'python', 'go')),
    CHECK(success_rate >= 0.0 AND success_rate <= 1.0),
    CHECK(quality_score >= 0.0 AND quality_score <= 1.0),
    CHECK(trend IN ('improving', 'declining', 'stable', 'unknown')),
    CHECK(json_valid(code_signature)),
    CHECK(json_valid(test_template)),
    CHECK(json_valid(metadata))
);

-- Performance indexes for test_patterns
CREATE INDEX IF NOT EXISTS idx_patterns_framework_type ON test_patterns(framework, pattern_type);
CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash ON test_patterns(code_signature_hash);
CREATE INDEX IF NOT EXISTS idx_patterns_created ON test_patterns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_language ON test_patterns(language, framework);
CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON test_patterns(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_usage ON test_patterns(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_quality ON test_patterns(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_category ON test_patterns(category, framework);
CREATE INDEX IF NOT EXISTS idx_patterns_tags ON test_patterns(tags);
CREATE INDEX IF NOT EXISTS idx_patterns_trend ON test_patterns(trend, success_rate);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup ON test_patterns(code_signature_hash, framework);

-- Pattern usage tracking (from patterns.db)
CREATE TABLE IF NOT EXISTS pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    usage_timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    success BOOLEAN,
    coverage_improvement REAL,
    execution_time_ms INTEGER,
    context TEXT,                            -- JSON context data

    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_pattern ON pattern_usage(pattern_id, usage_timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_session ON pattern_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_agent ON pattern_usage(agent_type, usage_timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_success ON pattern_usage(success, coverage_improvement);

-- ============================================================================
-- LEARNING METRICS TABLES
-- ============================================================================

-- Learning Metrics: Track improvement over time
-- Enhanced from: memory.db
CREATE TABLE IF NOT EXISTS learning_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Agent context
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,               -- qe-test-generator, qe-coverage-analyzer, etc.
    session_id TEXT,

    -- Metric data
    metric_type TEXT NOT NULL,              -- coverage, quality, latency, success_rate, etc.
    metric_value REAL NOT NULL,
    baseline_value REAL,
    improvement_percentage REAL,

    -- Test-specific metrics
    test_framework TEXT,
    test_type TEXT,
    coverage_percent REAL,
    test_pass_rate REAL,
    execution_time_ms INTEGER,
    patterns_used INTEGER,
    new_patterns_created INTEGER,

    -- Iteration tracking
    iteration INTEGER,
    epoch INTEGER,

    -- Context
    context TEXT,                            -- JSON context data
    metadata TEXT,                           -- Additional metadata

    -- Timestamp
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    -- Constraints
    CHECK(metric_type IN (
        'coverage', 'quality', 'latency', 'success_rate', 'improvement',
        'accuracy', 'test_count', 'pattern_reuse', 'code_quality'
    )),
    CHECK(coverage_percent >= 0.0 AND coverage_percent <= 100.0),
    CHECK(test_pass_rate >= 0.0 AND test_pass_rate <= 1.0)
);

-- Performance indexes for learning_metrics
CREATE INDEX IF NOT EXISTS idx_metrics_agent ON learning_metrics(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON learning_metrics(metric_type, agent_type);
CREATE INDEX IF NOT EXISTS idx_metrics_session ON learning_metrics(session_id, iteration);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON learning_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_framework ON learning_metrics(test_framework, metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_improvement ON learning_metrics(improvement_percentage DESC);

-- ============================================================================
-- CROSS-PROJECT PATTERN SHARING
-- ============================================================================

-- Cross-project pattern mappings (from patterns.db)
CREATE TABLE IF NOT EXISTS cross_project_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    source_project TEXT NOT NULL,
    target_project TEXT NOT NULL,
    adaptation_notes TEXT,
    success_rate REAL,
    usage_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, target_project)
);

CREATE INDEX IF NOT EXISTS idx_cross_project_pattern ON cross_project_mappings(pattern_id);
CREATE INDEX IF NOT EXISTS idx_cross_project_target ON cross_project_mappings(target_project);
CREATE INDEX IF NOT EXISTS idx_cross_project_success ON cross_project_mappings(success_rate DESC);

-- ============================================================================
-- REINFORCEMENT LEARNING TABLES
-- ============================================================================

-- Q-Learning values (from memory.db)
CREATE TABLE IF NOT EXISTS q_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Agent context
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,

    -- State-action pairs
    state_key TEXT NOT NULL,                -- State representation
    action_key TEXT NOT NULL,               -- Action taken

    -- Q-value data
    q_value REAL NOT NULL DEFAULT 0.0,
    update_count INTEGER DEFAULT 1,

    -- Additional context
    metadata TEXT,                           -- JSON metadata

    -- Timestamps
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    -- Unique constraint
    UNIQUE(agent_id, state_key, action_key)
);

CREATE INDEX IF NOT EXISTS idx_qvalues_agent ON q_values(agent_id, state_key);
CREATE INDEX IF NOT EXISTS idx_qvalues_value ON q_values(q_value DESC);
CREATE INDEX IF NOT EXISTS idx_qvalues_updated ON q_values(last_updated DESC);

-- Learning experiences (from memory.db)
CREATE TABLE IF NOT EXISTS learning_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Agent context
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,

    -- Experience data
    state TEXT NOT NULL,                     -- State representation (JSON)
    action TEXT NOT NULL,                    -- Action taken (JSON)
    reward REAL NOT NULL,
    next_state TEXT NOT NULL,                -- Resulting state (JSON)
    done BOOLEAN DEFAULT 0,

    -- Metadata
    metadata TEXT,

    -- Timestamp
    timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    CHECK(done IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_experiences_agent ON learning_experiences(agent_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_experiences_session ON learning_experiences(session_id);
CREATE INDEX IF NOT EXISTS idx_experiences_reward ON learning_experiences(reward DESC);

-- ============================================================================
-- PATTERN SIMILARITY & SEARCH
-- ============================================================================

-- Pattern similarity index for fast nearest-neighbor search
CREATE TABLE IF NOT EXISTS pattern_similarity_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_id TEXT NOT NULL,
    similar_pattern_id TEXT NOT NULL,
    similarity_score REAL NOT NULL,         -- Cosine similarity (0-1)
    distance_metric TEXT DEFAULT 'cosine',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    FOREIGN KEY (similar_pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    CHECK(similarity_score >= 0.0 AND similarity_score <= 1.0)
);

CREATE INDEX IF NOT EXISTS idx_similarity_pattern ON pattern_similarity_index(pattern_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_similarity_score ON pattern_similarity_index(similarity_score DESC);

-- Full-text search for patterns
CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
    pattern_id UNINDEXED,
    pattern_name,
    description,
    pattern_content,
    tags,
    content='test_patterns',
    content_rowid='rowid'
);

-- Triggers to keep FTS index synchronized
CREATE TRIGGER IF NOT EXISTS patterns_ai AFTER INSERT ON test_patterns BEGIN
    INSERT INTO pattern_fts(rowid, pattern_id, pattern_name, description, pattern_content, tags)
    VALUES (new.rowid, new.id, new.pattern_name, new.description, new.pattern_content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS patterns_ad AFTER DELETE ON test_patterns BEGIN
    DELETE FROM pattern_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS patterns_au AFTER UPDATE ON test_patterns BEGIN
    UPDATE pattern_fts
    SET pattern_id = new.id,
        pattern_name = new.pattern_name,
        description = new.description,
        pattern_content = new.pattern_content,
        tags = new.tags
    WHERE rowid = new.rowid;
END;

-- ============================================================================
-- CACHING & PERFORMANCE
-- ============================================================================

-- Pattern statistics cache for expensive aggregate queries
CREATE TABLE IF NOT EXISTS pattern_stats_cache (
    cache_key TEXT PRIMARY KEY,
    framework TEXT,
    pattern_type TEXT,

    -- Cached statistics
    total_patterns INTEGER,
    avg_success_rate REAL,
    avg_quality_score REAL,
    total_usage_count INTEGER,
    avg_coverage_delta REAL,

    -- Cache metadata
    computed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL,
    version TEXT DEFAULT '2.0.0'
);

CREATE INDEX IF NOT EXISTS idx_stats_cache_expires ON pattern_stats_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_stats_cache_framework ON pattern_stats_cache(framework, pattern_type);

-- ============================================================================
-- DATA INTEGRITY VIEWS
-- ============================================================================

-- View: Pattern performance summary
CREATE VIEW IF NOT EXISTS v_pattern_performance AS
SELECT
    p.id,
    p.pattern_name,
    p.framework,
    p.pattern_type,
    p.success_rate,
    p.usage_count,
    p.quality_score,
    p.coverage_delta,
    p.trend,
    COUNT(DISTINCT pu.session_id) as session_count,
    AVG(pu.coverage_improvement) as avg_coverage_improvement,
    AVG(pu.execution_time_ms) as avg_execution_time,
    MAX(pu.usage_timestamp) as last_used_timestamp
FROM test_patterns p
LEFT JOIN pattern_usage pu ON p.id = pu.pattern_id
GROUP BY p.id;

-- View: Agent learning progress
CREATE VIEW IF NOT EXISTS v_agent_learning_progress AS
SELECT
    agent_id,
    agent_type,
    COUNT(*) as total_iterations,
    AVG(CASE WHEN metric_type = 'coverage' THEN metric_value END) as avg_coverage,
    AVG(CASE WHEN metric_type = 'quality' THEN metric_value END) as avg_quality,
    AVG(improvement_percentage) as avg_improvement,
    MAX(timestamp) as last_activity
FROM learning_metrics
GROUP BY agent_id, agent_type;

-- View: Recent high-performing patterns
CREATE VIEW IF NOT EXISTS v_top_patterns AS
SELECT
    id,
    pattern_name,
    framework,
    pattern_type,
    success_rate,
    usage_count,
    quality_score,
    coverage_delta,
    trend,
    created_at,
    last_used
FROM test_patterns
WHERE success_rate >= 0.7 AND usage_count >= 3
ORDER BY (success_rate * 0.4 + quality_score * 0.3 + (usage_count / 100.0) * 0.3) DESC
LIMIT 100;

-- ============================================================================
-- MAINTENANCE FUNCTIONS
-- ============================================================================

-- Trigger: Update pattern statistics on usage
CREATE TRIGGER IF NOT EXISTS update_pattern_stats AFTER INSERT ON pattern_usage
BEGIN
    UPDATE test_patterns
    SET
        usage_count = usage_count + 1,
        last_used = NEW.usage_timestamp,
        success_rate = (
            SELECT AVG(CAST(success AS REAL))
            FROM pattern_usage
            WHERE pattern_id = NEW.pattern_id
            AND usage_timestamp >= (strftime('%s', 'now') - 2592000)  -- Last 30 days
        ),
        updated_at = strftime('%s', 'now')
    WHERE id = NEW.pattern_id;
END;

-- Trigger: Auto-update trend based on success rate changes
CREATE TRIGGER IF NOT EXISTS update_pattern_trend AFTER UPDATE OF success_rate ON test_patterns
WHEN NEW.last_success_rate IS NOT NULL
BEGIN
    UPDATE test_patterns
    SET trend = CASE
        WHEN NEW.success_rate > OLD.last_success_rate + 0.05 THEN 'improving'
        WHEN NEW.success_rate < OLD.last_success_rate - 0.05 THEN 'declining'
        ELSE 'stable'
    END,
    last_success_rate = NEW.success_rate
    WHERE id = NEW.id;
END;

-- ============================================================================
-- PERFORMANCE TUNING SETTINGS
-- ============================================================================

-- Optimize SQLite for learning workloads
PRAGMA journal_mode = WAL;           -- Write-Ahead Logging for concurrency
PRAGMA synchronous = NORMAL;         -- Balance safety and performance
PRAGMA cache_size = -64000;          -- 64MB cache
PRAGMA temp_store = MEMORY;          -- Keep temp tables in memory
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
PRAGMA page_size = 4096;             -- Optimal page size
PRAGMA auto_vacuum = INCREMENTAL;    -- Reclaim space gradually

-- ============================================================================
-- END OF SCHEMA v2.0
-- ============================================================================
