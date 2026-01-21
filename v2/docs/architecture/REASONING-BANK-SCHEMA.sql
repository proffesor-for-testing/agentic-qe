-- ============================================================================
-- QE ReasoningBank Database Schema (v1.1.0)
-- ============================================================================
--
-- Purpose: Store and retrieve test patterns for cross-project reuse
-- Database: SQLite 3.35+
-- Features:
--   - Full-text search on pattern metadata
--   - Pattern similarity indexing
--   - Cross-framework pattern mapping
--   - Usage tracking and analytics
--
-- Performance:
--   - Pattern lookup: < 50ms (p95)
--   - Pattern storage: < 25ms (p95)
--   - Similarity search: < 100ms (p95)
--
-- ============================================================================

-- Enable WAL mode for better concurrent access
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;  -- 64MB cache
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456;  -- 256MB mmap

-- ============================================================================
-- Core Pattern Storage
-- ============================================================================

-- Table: test_patterns
-- Primary storage for test pattern templates
CREATE TABLE IF NOT EXISTS test_patterns (
    -- Primary Key
    id TEXT PRIMARY KEY NOT NULL,

    -- Classification
    pattern_type TEXT NOT NULL,
    framework TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'typescript',

    -- Code Signature
    code_signature_hash TEXT NOT NULL,
    code_signature JSON NOT NULL,

    -- Template
    test_template JSON NOT NULL,

    -- Metadata
    metadata JSON NOT NULL,

    -- Versioning
    version TEXT NOT NULL DEFAULT '1.0.0',

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CHECK(pattern_type IN (
        'edge-case',
        'integration',
        'boundary',
        'error-handling',
        'unit',
        'e2e',
        'performance',
        'security',
        'accessibility',
        'regression'
    )),
    CHECK(framework IN (
        'jest',
        'mocha',
        'cypress',
        'vitest',
        'playwright',
        'ava',
        'tape',
        'jasmine',
        'qunit'
    )),
    CHECK(language IN ('typescript', 'javascript', 'tsx', 'jsx')),
    CHECK(json_valid(code_signature)),
    CHECK(json_valid(test_template)),
    CHECK(json_valid(metadata))
);

-- Indexes for fast pattern lookup
CREATE INDEX IF NOT EXISTS idx_patterns_framework_type
    ON test_patterns(framework, pattern_type);

CREATE INDEX IF NOT EXISTS idx_patterns_signature_hash
    ON test_patterns(code_signature_hash);

CREATE INDEX IF NOT EXISTS idx_patterns_created
    ON test_patterns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_patterns_language
    ON test_patterns(language, framework);

-- Unique index to prevent duplicate patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_dedup
    ON test_patterns(code_signature_hash, framework);

-- ============================================================================
-- Pattern Usage Tracking
-- ============================================================================

-- Table: pattern_usage
-- Track pattern effectiveness and usage across projects
CREATE TABLE IF NOT EXISTS pattern_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- References
    pattern_id TEXT NOT NULL,
    project_id TEXT NOT NULL,

    -- Usage Statistics
    usage_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,

    -- Performance Metrics
    avg_execution_time REAL NOT NULL DEFAULT 0.0,  -- milliseconds
    avg_coverage_gain REAL NOT NULL DEFAULT 0.0,   -- 0.0 - 1.0

    -- Quality Metrics
    flaky_count INTEGER NOT NULL DEFAULT 0,
    quality_score REAL NOT NULL DEFAULT 0.0,  -- 0.0 - 1.0

    -- Timestamps
    first_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, project_id),
    CHECK(usage_count >= 0),
    CHECK(success_count >= 0),
    CHECK(failure_count >= 0),
    CHECK(flaky_count >= 0),
    CHECK(avg_coverage_gain >= 0.0 AND avg_coverage_gain <= 1.0),
    CHECK(quality_score >= 0.0 AND quality_score <= 1.0)
);

-- Indexes for usage analytics
CREATE INDEX IF NOT EXISTS idx_usage_pattern
    ON pattern_usage(pattern_id);

CREATE INDEX IF NOT EXISTS idx_usage_project
    ON pattern_usage(project_id);

CREATE INDEX IF NOT EXISTS idx_usage_last_used
    ON pattern_usage(last_used DESC);

CREATE INDEX IF NOT EXISTS idx_usage_quality
    ON pattern_usage(quality_score DESC);

-- ============================================================================
-- Cross-Project Pattern Sharing
-- ============================================================================

-- Table: cross_project_mappings
-- Enable pattern translation across frameworks
CREATE TABLE IF NOT EXISTS cross_project_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- References
    pattern_id TEXT NOT NULL,

    -- Framework Mapping
    source_framework TEXT NOT NULL,
    target_framework TEXT NOT NULL,

    -- Transformation Rules
    transformation_rules JSON NOT NULL,

    -- Compatibility
    compatibility_score REAL NOT NULL DEFAULT 1.0,  -- 0.0 - 1.0

    -- Usage
    project_count INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0.0,  -- 0.0 - 1.0

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    UNIQUE(pattern_id, source_framework, target_framework),
    CHECK(source_framework != target_framework),
    CHECK(json_valid(transformation_rules)),
    CHECK(compatibility_score >= 0.0 AND compatibility_score <= 1.0),
    CHECK(success_rate >= 0.0 AND success_rate <= 1.0),
    CHECK(project_count >= 0)
);

-- Indexes for framework translation
CREATE INDEX IF NOT EXISTS idx_mapping_pattern
    ON cross_project_mappings(pattern_id);

CREATE INDEX IF NOT EXISTS idx_mapping_frameworks
    ON cross_project_mappings(source_framework, target_framework);

CREATE INDEX IF NOT EXISTS idx_mapping_compatibility
    ON cross_project_mappings(compatibility_score DESC);

-- ============================================================================
-- Pattern Similarity Index
-- ============================================================================

-- Table: pattern_similarity_index
-- Pre-computed similarity scores for fast pattern matching
CREATE TABLE IF NOT EXISTS pattern_similarity_index (
    -- Pattern Pair (ordered: pattern_a < pattern_b)
    pattern_a TEXT NOT NULL,
    pattern_b TEXT NOT NULL,

    -- Similarity Components
    similarity_score REAL NOT NULL,
    structure_similarity REAL NOT NULL,
    identifier_similarity REAL NOT NULL,
    metadata_similarity REAL NOT NULL,

    -- Computation Metadata
    algorithm TEXT NOT NULL DEFAULT 'hybrid-tfidf',
    last_computed TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    PRIMARY KEY (pattern_a, pattern_b),
    FOREIGN KEY (pattern_a) REFERENCES test_patterns(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_b) REFERENCES test_patterns(id) ON DELETE CASCADE,
    CHECK(pattern_a < pattern_b),
    CHECK(similarity_score >= 0.0 AND similarity_score <= 1.0),
    CHECK(structure_similarity >= 0.0 AND structure_similarity <= 1.0),
    CHECK(identifier_similarity >= 0.0 AND identifier_similarity <= 1.0),
    CHECK(metadata_similarity >= 0.0 AND metadata_similarity <= 1.0)
);

-- Index for similarity-based queries
CREATE INDEX IF NOT EXISTS idx_similarity_score
    ON pattern_similarity_index(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_similarity_pattern_a
    ON pattern_similarity_index(pattern_a, similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_similarity_pattern_b
    ON pattern_similarity_index(pattern_b, similarity_score DESC);

-- ============================================================================
-- Full-Text Search
-- ============================================================================

-- Virtual table for full-text search on pattern metadata
CREATE VIRTUAL TABLE IF NOT EXISTS pattern_fts USING fts5(
    pattern_id UNINDEXED,
    pattern_name,
    description,
    tags,
    framework,
    pattern_type,
    content='',
    tokenize='porter ascii'
);

-- Trigger to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS pattern_fts_insert AFTER INSERT ON test_patterns
BEGIN
    INSERT INTO pattern_fts(
        pattern_id,
        pattern_name,
        description,
        tags,
        framework,
        pattern_type
    )
    VALUES (
        NEW.id,
        json_extract(NEW.metadata, '$.name'),
        json_extract(NEW.metadata, '$.description'),
        json_extract(NEW.metadata, '$.tags'),
        NEW.framework,
        NEW.pattern_type
    );
END;

CREATE TRIGGER IF NOT EXISTS pattern_fts_delete AFTER DELETE ON test_patterns
BEGIN
    DELETE FROM pattern_fts WHERE pattern_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS pattern_fts_update AFTER UPDATE ON test_patterns
BEGIN
    DELETE FROM pattern_fts WHERE pattern_id = OLD.id;
    INSERT INTO pattern_fts(
        pattern_id,
        pattern_name,
        description,
        tags,
        framework,
        pattern_type
    )
    VALUES (
        NEW.id,
        json_extract(NEW.metadata, '$.name'),
        json_extract(NEW.metadata, '$.description'),
        json_extract(NEW.metadata, '$.tags'),
        NEW.framework,
        NEW.pattern_type
    );
END;

-- ============================================================================
-- Analytics Views
-- ============================================================================

-- View: pattern_analytics
-- Aggregated analytics per pattern
CREATE VIEW IF NOT EXISTS pattern_analytics AS
SELECT
    p.id,
    p.pattern_type,
    p.framework,
    p.language,
    json_extract(p.metadata, '$.name') AS pattern_name,
    COALESCE(SUM(u.usage_count), 0) AS total_uses,
    COALESCE(AVG(u.quality_score), 0.0) AS avg_quality,
    COALESCE(AVG(u.avg_coverage_gain), 0.0) AS avg_coverage_gain,
    COALESCE(AVG(u.avg_execution_time), 0.0) AS avg_execution_time,
    COUNT(DISTINCT u.project_id) AS project_count,
    MAX(u.last_used) AS last_used,
    p.created_at
FROM test_patterns p
LEFT JOIN pattern_usage u ON p.id = u.pattern_id
GROUP BY p.id;

-- View: framework_stats
-- Statistics per framework
CREATE VIEW IF NOT EXISTS framework_stats AS
SELECT
    framework,
    COUNT(*) AS pattern_count,
    AVG(json_extract(metadata, '$.quality.coverage')) AS avg_coverage,
    AVG(json_extract(metadata, '$.quality.maintainability')) AS avg_maintainability,
    MIN(created_at) AS first_pattern,
    MAX(created_at) AS last_pattern
FROM test_patterns
GROUP BY framework;

-- View: pattern_quality_report
-- Quality metrics per pattern
CREATE VIEW IF NOT EXISTS pattern_quality_report AS
SELECT
    p.id,
    json_extract(p.metadata, '$.name') AS pattern_name,
    p.framework,
    p.pattern_type,
    json_extract(p.metadata, '$.quality.coverage') AS coverage,
    json_extract(p.metadata, '$.quality.maintainability') AS maintainability,
    json_extract(p.metadata, '$.quality.reliability') AS reliability,
    COALESCE(u.quality_score, 0.0) AS usage_quality,
    COALESCE(u.success_count * 1.0 / NULLIF(u.usage_count, 0), 0.0) AS success_rate,
    u.flaky_count,
    p.created_at
FROM test_patterns p
LEFT JOIN pattern_usage u ON p.id = u.pattern_id;

-- ============================================================================
-- Materialized Statistics Table (for performance)
-- ============================================================================

-- Table: pattern_stats_cache
-- Cached aggregated statistics (updated periodically)
CREATE TABLE IF NOT EXISTS pattern_stats_cache (
    pattern_id TEXT PRIMARY KEY,
    total_uses INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0.0,
    avg_quality REAL NOT NULL DEFAULT 0.0,
    avg_coverage_gain REAL NOT NULL DEFAULT 0.0,
    project_count INTEGER NOT NULL DEFAULT 0,
    trend TEXT NOT NULL DEFAULT 'stable',  -- 'rising', 'stable', 'declining'
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pattern_id) REFERENCES test_patterns(id) ON DELETE CASCADE,
    CHECK(success_rate >= 0.0 AND success_rate <= 1.0),
    CHECK(avg_quality >= 0.0 AND avg_quality <= 1.0),
    CHECK(avg_coverage_gain >= 0.0 AND avg_coverage_gain <= 1.0),
    CHECK(trend IN ('rising', 'stable', 'declining'))
);

CREATE INDEX IF NOT EXISTS idx_stats_cache_updated
    ON pattern_stats_cache(last_updated DESC);

-- ============================================================================
-- Helper Functions (User-Defined Functions - requires SQLite extension)
-- ============================================================================

-- Note: These would be implemented in the application layer (QEReasoningBank class)
-- Examples of what would be available:
--
-- compute_similarity(pattern_a, pattern_b) -> REAL
-- extract_signature_hash(code_signature) -> TEXT
-- normalize_pattern(test_template) -> JSON
-- validate_transformation_rules(rules) -> BOOLEAN

-- ============================================================================
-- Data Integrity Triggers
-- ============================================================================

-- Trigger: update_pattern_timestamp
-- Automatically update updated_at on pattern modification
CREATE TRIGGER IF NOT EXISTS update_pattern_timestamp
AFTER UPDATE ON test_patterns
FOR EACH ROW
BEGIN
    UPDATE test_patterns
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Trigger: update_mapping_timestamp
-- Automatically update updated_at on mapping modification
CREATE TRIGGER IF NOT EXISTS update_mapping_timestamp
AFTER UPDATE ON cross_project_mappings
FOR EACH ROW
BEGIN
    UPDATE cross_project_mappings
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Trigger: update_usage_timestamp
-- Automatically update last_used on usage update
CREATE TRIGGER IF NOT EXISTS update_usage_timestamp
AFTER UPDATE ON pattern_usage
FOR EACH ROW
WHEN NEW.usage_count > OLD.usage_count
BEGIN
    UPDATE pattern_usage
    SET last_used = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- ============================================================================
-- Cleanup Procedures (would be implemented as application-level logic)
-- ============================================================================

-- Example cleanup logic:
-- 1. Delete patterns with 0 usage after 90 days
-- 2. Delete similarity index entries older than 30 days
-- 3. Archive patterns with quality_score < 0.3 and usage_count < 5
-- 4. Compact FTS index monthly

-- ============================================================================
-- Initial Data / Seed Patterns (Optional)
-- ============================================================================

-- Seed data would be inserted via the application layer
-- Examples of common patterns to bootstrap:
-- - Basic unit test pattern (AAA: Arrange-Act-Assert)
-- - Error handling pattern (try-catch with specific error)
-- - Async function test pattern (async/await with Jest)
-- - Mocking pattern (jest.fn(), jest.spyOn())
-- - Integration test pattern (API endpoint testing)

-- ============================================================================
-- Schema Version Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES ('1.1.0', 'Initial QE ReasoningBank schema with pattern similarity indexing');

-- ============================================================================
-- End of Schema
-- ============================================================================
