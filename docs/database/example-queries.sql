-- ============================================================================
-- AgentDB v2.0 Example Queries
-- ============================================================================
-- Purpose: Common query patterns for working with the unified learning database
-- Usage: Copy and adapt these queries for your specific needs
-- ============================================================================

-- ============================================================================
-- PATTERN DISCOVERY & SEARCH
-- ============================================================================

-- Find best patterns for a specific framework
SELECT
    pattern_name,
    pattern_type,
    success_rate,
    usage_count,
    quality_score,
    coverage_delta,
    trend
FROM test_patterns
WHERE framework = 'jest'
  AND success_rate >= 0.7
  AND usage_count >= 3
ORDER BY (success_rate * 0.4 + quality_score * 0.4 + (usage_count/100.0) * 0.2) DESC
LIMIT 20;

-- Search patterns by natural language (full-text search)
SELECT
    p.pattern_name,
    p.description,
    p.framework,
    p.success_rate,
    bm25(pattern_fts) as relevance_score
FROM pattern_fts
JOIN test_patterns p ON pattern_fts.rowid = p.rowid
WHERE pattern_fts MATCH 'authentication OR jwt OR token'
ORDER BY relevance_score DESC
LIMIT 15;

-- Find similar patterns to a given pattern
SELECT
    p.pattern_name,
    p.framework,
    p.pattern_type,
    p.success_rate,
    si.similarity_score
FROM pattern_similarity_index si
JOIN test_patterns p ON si.similar_pattern_id = p.id
WHERE si.pattern_id = 'auth-jwt-test-001'
  AND si.similarity_score >= 0.7
ORDER BY si.similarity_score DESC
LIMIT 10;

-- Combined semantic + performance search
WITH text_matches AS (
    SELECT
        p.id,
        p.pattern_name,
        p.success_rate,
        p.quality_score,
        bm25(pattern_fts) as text_relevance
    FROM pattern_fts
    JOIN test_patterns p ON pattern_fts.rowid = p.rowid
    WHERE pattern_fts MATCH 'error handling edge cases'
    LIMIT 50
)
SELECT
    pattern_name,
    success_rate,
    quality_score,
    text_relevance,
    (text_relevance * 0.5 + success_rate * 0.3 + quality_score * 0.2) as combined_score
FROM text_matches
WHERE success_rate >= 0.6
ORDER BY combined_score DESC
LIMIT 10;

-- Find improving patterns (trending up)
SELECT
    pattern_name,
    framework,
    pattern_type,
    success_rate,
    last_success_rate,
    (success_rate - last_success_rate) as improvement,
    usage_count,
    trend
FROM test_patterns
WHERE trend = 'improving'
  AND usage_count >= 5
ORDER BY improvement DESC
LIMIT 15;

-- Find patterns needing improvement
SELECT
    pattern_name,
    framework,
    success_rate,
    usage_count,
    trend,
    CAST((strftime('%s', 'now') - last_used) / 86400 AS INTEGER) as days_since_use
FROM test_patterns
WHERE (success_rate < 0.6 OR trend = 'declining')
  AND usage_count >= 5
ORDER BY success_rate ASC, usage_count DESC
LIMIT 20;

-- ============================================================================
-- EPISODE ANALYSIS
-- ============================================================================

-- Find successful high-coverage episodes
SELECT
    session_id,
    task,
    test_framework,
    test_type,
    coverage_before,
    coverage_after,
    (coverage_after - coverage_before) as coverage_gain,
    test_count,
    quality_score,
    latency_ms,
    tokens_used
FROM episodes
WHERE success = 1
  AND coverage_after >= 80.0
  AND test_framework = 'jest'
ORDER BY coverage_after DESC, quality_score DESC
LIMIT 25;

-- Analyze episode performance by framework
SELECT
    test_framework,
    test_type,
    COUNT(*) as episode_count,
    AVG(coverage_after) as avg_coverage,
    AVG(quality_score) as avg_quality,
    AVG(test_count) as avg_test_count,
    AVG(latency_ms) as avg_latency,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
    CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as success_rate
FROM episodes
WHERE test_framework IS NOT NULL
  AND ts >= strftime('%s', 'now', '-30 days')
GROUP BY test_framework, test_type
ORDER BY success_rate DESC, avg_coverage DESC;

-- Find episodes that used specific patterns
SELECT
    e.session_id,
    e.task,
    e.test_framework,
    e.coverage_after,
    e.success,
    json_extract(e.pattern_ids, '$') as patterns_used
FROM episodes e
WHERE e.pattern_ids IS NOT NULL
  AND json_type(e.pattern_ids) = 'array'
  AND json_array_length(e.pattern_ids) > 0
ORDER BY e.ts DESC
LIMIT 50;

-- Time-series analysis of episode success
SELECT
    DATE(ts, 'unixepoch') as date,
    COUNT(*) as total_episodes,
    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
    AVG(coverage_after) as avg_coverage,
    AVG(quality_score) as avg_quality
FROM episodes
WHERE ts >= strftime('%s', 'now', '-90 days')
GROUP BY DATE(ts, 'unixepoch')
ORDER BY date ASC;

-- ============================================================================
-- LEARNING PROGRESS TRACKING
-- ============================================================================

-- Track agent improvement over time
SELECT
    DATE(timestamp, 'unixepoch') as date,
    agent_type,
    metric_type,
    AVG(metric_value) as avg_metric,
    AVG(improvement_percentage) as avg_improvement,
    COUNT(*) as measurement_count
FROM learning_metrics
WHERE agent_type = 'qe-test-generator'
  AND timestamp >= strftime('%s', 'now', '-30 days')
GROUP BY DATE(timestamp, 'unixepoch'), agent_type, metric_type
ORDER BY date ASC, metric_type;

-- Compare agent performance across metrics
SELECT
    agent_type,
    AVG(CASE WHEN metric_type = 'coverage' THEN metric_value END) as avg_coverage,
    AVG(CASE WHEN metric_type = 'quality' THEN metric_value END) as avg_quality,
    AVG(CASE WHEN metric_type = 'success_rate' THEN metric_value END) as avg_success,
    AVG(improvement_percentage) as overall_improvement,
    COUNT(DISTINCT agent_id) as agent_count,
    MAX(timestamp) as last_activity
FROM learning_metrics
WHERE timestamp >= strftime('%s', 'now', '-7 days')
GROUP BY agent_type
ORDER BY overall_improvement DESC;

-- Detect learning plateaus
WITH daily_metrics AS (
    SELECT
        agent_id,
        DATE(timestamp, 'unixepoch') as date,
        AVG(metric_value) as daily_avg,
        AVG(improvement_percentage) as daily_improvement
    FROM learning_metrics
    WHERE metric_type = 'coverage'
      AND timestamp >= strftime('%s', 'now', '-30 days')
    GROUP BY agent_id, DATE(timestamp, 'unixepoch')
),
moving_avg AS (
    SELECT
        agent_id,
        date,
        daily_avg,
        daily_improvement,
        AVG(daily_improvement) OVER (
            PARTITION BY agent_id
            ORDER BY date
            ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
        ) as week_avg_improvement
    FROM daily_metrics
)
SELECT
    agent_id,
    date,
    daily_avg,
    daily_improvement,
    week_avg_improvement,
    CASE
        WHEN week_avg_improvement < 0.5 THEN 'Plateau'
        WHEN week_avg_improvement < 2.0 THEN 'Slow Growth'
        ELSE 'Active Learning'
    END as learning_status
FROM moving_avg
ORDER BY agent_id, date DESC;

-- ============================================================================
-- PATTERN EFFECTIVENESS ANALYSIS
-- ============================================================================

-- Calculate rolling 30-day success rate for patterns
SELECT
    p.pattern_name,
    p.framework,
    COUNT(pu.id) as recent_uses,
    AVG(CAST(pu.success AS REAL)) as recent_success_rate,
    AVG(pu.coverage_improvement) as avg_coverage_gain,
    AVG(pu.execution_time_ms) as avg_execution_time,
    p.success_rate as overall_success_rate,
    (AVG(CAST(pu.success AS REAL)) - p.success_rate) as performance_delta
FROM test_patterns p
LEFT JOIN pattern_usage pu ON p.id = pu.pattern_id
    AND pu.usage_timestamp >= strftime('%s', 'now', '-30 days')
WHERE p.usage_count >= 5
GROUP BY p.id
HAVING recent_uses >= 3
ORDER BY recent_success_rate DESC, avg_coverage_gain DESC;

-- Find most effective patterns by agent type
SELECT
    pu.agent_type,
    p.pattern_name,
    p.framework,
    COUNT(*) as usage_count,
    AVG(CAST(pu.success AS REAL)) as success_rate,
    AVG(pu.coverage_improvement) as avg_coverage_gain
FROM pattern_usage pu
JOIN test_patterns p ON pu.pattern_id = p.id
WHERE pu.usage_timestamp >= strftime('%s', 'now', '-30 days')
GROUP BY pu.agent_type, p.id
HAVING usage_count >= 3
ORDER BY pu.agent_type, success_rate DESC;

-- Identify underutilized high-quality patterns
SELECT
    pattern_name,
    framework,
    pattern_type,
    success_rate,
    quality_score,
    usage_count,
    CAST((strftime('%s', 'now') - last_used) / 86400 AS INTEGER) as days_since_use,
    (success_rate * 0.5 + quality_score * 0.5) as combined_quality
FROM test_patterns
WHERE success_rate >= 0.8
  AND quality_score >= 0.7
  AND usage_count < 10
  AND last_used IS NOT NULL
ORDER BY combined_quality DESC, usage_count ASC
LIMIT 20;

-- ============================================================================
-- CROSS-PROJECT PATTERN SHARING
-- ============================================================================

-- Find patterns that work well across projects
SELECT
    p.pattern_name,
    p.framework,
    COUNT(DISTINCT cm.target_project) as project_count,
    AVG(cm.success_rate) as avg_cross_project_success,
    SUM(cm.usage_count) as total_cross_project_uses,
    p.success_rate as original_success_rate
FROM test_patterns p
JOIN cross_project_mappings cm ON p.id = cm.pattern_id
GROUP BY p.id
HAVING project_count >= 2
  AND avg_cross_project_success >= 0.7
ORDER BY avg_cross_project_success DESC, project_count DESC;

-- Identify patterns ready for cross-project sharing
SELECT
    pattern_name,
    framework,
    pattern_type,
    success_rate,
    usage_count,
    quality_score,
    description
FROM test_patterns
WHERE success_rate >= 0.85
  AND usage_count >= 10
  AND quality_score >= 0.8
  AND id NOT IN (SELECT pattern_id FROM cross_project_mappings)
ORDER BY (success_rate * 0.4 + quality_score * 0.4 + (usage_count/100.0) * 0.2) DESC
LIMIT 15;

-- ============================================================================
-- REINFORCEMENT LEARNING QUERIES
-- ============================================================================

-- Find best actions for a given state
SELECT
    state_key,
    action_key,
    q_value,
    update_count,
    CAST((strftime('%s', 'now') - last_updated) / 3600 AS INTEGER) as hours_since_update
FROM q_values
WHERE agent_id = 'test-gen-001'
  AND state_key LIKE '%high_complexity%'
ORDER BY q_value DESC
LIMIT 10;

-- Analyze Q-value convergence
SELECT
    agent_type,
    COUNT(DISTINCT state_key) as unique_states,
    COUNT(DISTINCT action_key) as unique_actions,
    AVG(q_value) as avg_q_value,
    AVG(update_count) as avg_updates,
    MAX(update_count) as max_updates,
    MIN(update_count) as min_updates
FROM q_values
GROUP BY agent_type
ORDER BY avg_updates DESC;

-- Sample experiences for training (random batch)
SELECT
    state,
    action,
    reward,
    next_state,
    done
FROM learning_experiences
WHERE agent_id = 'test-gen-001'
  AND timestamp >= strftime('%s', 'now', '-7 days')
ORDER BY RANDOM()
LIMIT 100;

-- ============================================================================
-- PERFORMANCE & MONITORING
-- ============================================================================

-- Database statistics
SELECT
    'Episodes' as table_name,
    COUNT(*) as row_count,
    AVG(LENGTH(task) + LENGTH(COALESCE(input, '')) + LENGTH(COALESCE(output, ''))) as avg_row_size
FROM episodes
UNION ALL
SELECT
    'Test Patterns',
    COUNT(*),
    AVG(LENGTH(pattern_content) + LENGTH(COALESCE(description, '')))
FROM test_patterns
UNION ALL
SELECT
    'Pattern Usage',
    COUNT(*),
    AVG(LENGTH(COALESCE(context, '')))
FROM pattern_usage
UNION ALL
SELECT
    'Learning Metrics',
    COUNT(*),
    AVG(LENGTH(COALESCE(context, '')) + LENGTH(COALESCE(metadata, '')))
FROM learning_metrics;

-- Index usage and efficiency
SELECT
    name,
    tbl_name,
    sql
FROM sqlite_master
WHERE type = 'index'
  AND sql IS NOT NULL
ORDER BY tbl_name, name;

-- Identify slow queries (requires query plan analysis)
-- Run EXPLAIN QUERY PLAN before these queries to analyze performance

-- Check cache hit rate (requires periodic monitoring)
SELECT
    cache_key,
    framework,
    pattern_type,
    CAST((strftime('%s', 'now') - computed_at) / 60 AS INTEGER) as age_minutes,
    CASE
        WHEN strftime('%s', 'now') > expires_at THEN 'Expired'
        ELSE 'Valid'
    END as cache_status
FROM pattern_stats_cache
ORDER BY computed_at DESC;

-- ============================================================================
-- DATA QUALITY & INTEGRITY
-- ============================================================================

-- Find episodes with missing test context
SELECT
    COUNT(*) as total_episodes,
    SUM(CASE WHEN test_framework IS NULL THEN 1 ELSE 0 END) as missing_framework,
    SUM(CASE WHEN test_type IS NULL THEN 1 ELSE 0 END) as missing_type,
    SUM(CASE WHEN coverage_after IS NULL THEN 1 ELSE 0 END) as missing_coverage,
    SUM(CASE WHEN quality_score IS NULL THEN 1 ELSE 0 END) as missing_quality
FROM episodes;

-- Validate JSON columns
SELECT
    COUNT(*) as total_patterns,
    SUM(CASE WHEN json_valid(code_signature) = 0 THEN 1 ELSE 0 END) as invalid_signatures,
    SUM(CASE WHEN json_valid(test_template) = 0 THEN 1 ELSE 0 END) as invalid_templates,
    SUM(CASE WHEN json_valid(metadata) = 0 THEN 1 ELSE 0 END) as invalid_metadata
FROM test_patterns;

-- Check for duplicate patterns
SELECT
    code_signature_hash,
    framework,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(id, ', ') as pattern_ids
FROM test_patterns
GROUP BY code_signature_hash, framework
HAVING duplicate_count > 1;

-- ============================================================================
-- MAINTENANCE QUERIES
-- ============================================================================

-- Vacuum and analyze (run periodically)
-- VACUUM;
-- ANALYZE;

-- Rebuild indexes (if performance degrades)
-- REINDEX;

-- Clear expired cache entries
DELETE FROM pattern_stats_cache
WHERE strftime('%s', 'now') > expires_at;

-- Archive old episodes (optional, adjust time window as needed)
-- CREATE TABLE episodes_archive AS
-- SELECT * FROM episodes
-- WHERE ts < strftime('%s', 'now', '-365 days');
--
-- DELETE FROM episodes
-- WHERE ts < strftime('%s', 'now', '-365 days');

-- ============================================================================
-- END OF EXAMPLE QUERIES
-- ============================================================================
