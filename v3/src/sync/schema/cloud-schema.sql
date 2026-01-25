-- Cloud Sync Schema for AQE Learning Data
-- Target: ruvector-postgres (https://hub.docker.com/r/ruvnet/ruvector-postgres)
--
-- This schema consolidates data from 6+ local sources into a unified cloud database
-- for centralized self-learning across environments.
--
-- Setup: GCE VM running ruvector-postgres Docker container
-- Access: IAP tunnel (gcloud compute start-iap-tunnel)

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS ruvector;

-- Schema for AQE learning data
CREATE SCHEMA IF NOT EXISTS aqe;

-- ============================================================================
-- Core Memory Tables
-- ============================================================================

-- Memory entries (key-value with namespaces)
-- Source: .agentic-qe/memory.db → memory_entries, v3/.agentic-qe/memory.db
CREATE TABLE IF NOT EXISTS aqe.memory_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    partition TEXT NOT NULL DEFAULT 'default',
    value JSONB NOT NULL,
    metadata JSONB,
    embedding ruvector(384),  -- For semantic search (ruvector)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    source_env TEXT NOT NULL,  -- 'devpod', 'laptop', 'ci'
    sync_version BIGINT DEFAULT 0,
    UNIQUE(key, partition, source_env)
);

-- Learning experiences (RL trajectories)
-- Source: .agentic-qe/memory.db → learning_experiences
CREATE TABLE IF NOT EXISTS aqe.learning_experiences (
    id SERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_id TEXT,
    task_type TEXT NOT NULL,
    state JSONB NOT NULL,
    action JSONB NOT NULL,
    reward REAL NOT NULL,
    next_state JSONB NOT NULL,
    episode_id TEXT,
    metadata JSONB,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GOAP (Goal-Oriented Action Planning) Tables
-- ============================================================================

-- GOAP actions (planning primitives)
-- Source: .agentic-qe/memory.db → goap_actions, v3/.agentic-qe/memory.db → goap_actions
CREATE TABLE IF NOT EXISTS aqe.goap_actions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    agent_type TEXT NOT NULL,
    preconditions JSONB NOT NULL,
    effects JSONB NOT NULL,
    cost REAL DEFAULT 1.0,
    duration_estimate INTEGER,
    success_rate REAL DEFAULT 1.0,
    execution_count INTEGER DEFAULT 0,
    category TEXT,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GOAP plans (execution traces)
-- Source: .agentic-qe/memory.db → goap_plans
CREATE TABLE IF NOT EXISTS aqe.goap_plans (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    sequence JSONB NOT NULL,
    initial_state JSONB,
    goal_state JSONB,
    action_sequence JSONB,
    total_cost REAL,
    estimated_duration INTEGER,
    actual_duration INTEGER,
    status TEXT DEFAULT 'pending',
    success BOOLEAN,
    failure_reason TEXT,
    execution_trace JSONB,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- Pattern Learning Tables
-- ============================================================================

-- Patterns (learned behaviors)
-- Source: .agentic-qe/memory.db → patterns
CREATE TABLE IF NOT EXISTS aqe.patterns (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    confidence REAL NOT NULL,
    usage_count INTEGER DEFAULT 0,
    metadata JSONB,
    domain TEXT DEFAULT 'general',
    success_rate REAL DEFAULT 1.0,
    embedding ruvector(384),
    source_env TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QE-specific patterns (from v3 memory)
-- Source: v3/.agentic-qe/memory.db → qe_patterns
CREATE TABLE IF NOT EXISTS aqe.qe_patterns (
    id TEXT PRIMARY KEY,
    pattern_type TEXT NOT NULL,
    qe_domain TEXT,  -- 'test-generation', 'coverage-analysis', etc.
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    confidence REAL DEFAULT 0.5,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0.0,
    quality_score REAL DEFAULT 0.0,
    tier TEXT DEFAULT 'short-term',
    template_json JSONB,
    context_json JSONB,
    successful_uses INTEGER DEFAULT 0,
    embedding ruvector(384),
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- SONA neural patterns (from v3 memory)
-- Source: v3/.agentic-qe/memory.db → sona_patterns
CREATE TABLE IF NOT EXISTS aqe.sona_patterns (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    domain TEXT,
    state_embedding ruvector(384),
    action_embedding ruvector(384),
    action_type TEXT,
    action_value JSONB,
    outcome_reward REAL,
    outcome_success BOOLEAN,
    outcome_quality REAL,
    confidence REAL,
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Events & Audit Tables
-- ============================================================================

-- Events (audit log)
-- Source: .agentic-qe/memory.db → events
CREATE TABLE IF NOT EXISTS aqe.events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    source TEXT NOT NULL,
    source_env TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ
);

-- ============================================================================
-- Claude-Flow Integration Tables
-- ============================================================================

-- Claude-Flow memory store (JSON → PostgreSQL)
-- Source: .claude-flow/memory/store.json
CREATE TABLE IF NOT EXISTS aqe.claude_flow_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL,
    value JSONB NOT NULL,
    category TEXT,  -- 'adr-analysis', 'agent-patterns', etc.
    embedding ruvector(384),
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(key, source_env)
);

-- Claude-Flow daemon worker stats
-- Source: .claude-flow/daemon-state.json
CREATE TABLE IF NOT EXISTS aqe.claude_flow_workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_type TEXT NOT NULL,  -- 'map', 'audit', 'optimize', etc.
    run_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_duration_ms REAL,
    last_run TIMESTAMPTZ,
    source_env TEXT NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(worker_type, source_env)
);

-- ============================================================================
-- Q-Learning / Intelligence Tables
-- ============================================================================

-- Q-Learning patterns from intelligence.json
-- Source: v3/.ruvector/intelligence.json
CREATE TABLE IF NOT EXISTS aqe.qlearning_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state TEXT NOT NULL,
    action TEXT NOT NULL,
    q_value REAL NOT NULL,
    visits INTEGER DEFAULT 0,
    last_update TIMESTAMPTZ,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(state, action, source_env)
);

-- Memory embeddings from intelligence.json
-- Source: v3/.ruvector/intelligence.json
CREATE TABLE IF NOT EXISTS aqe.intelligence_memories (
    id TEXT PRIMARY KEY,
    memory_type TEXT NOT NULL,  -- 'file_access', etc.
    content TEXT,
    embedding ruvector(64),  -- intelligence.json uses 64-dim
    metadata JSONB,
    source_env TEXT NOT NULL,
    timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Sync Metadata Tables
-- ============================================================================

-- Sync state tracking
CREATE TABLE IF NOT EXISTS aqe.sync_state (
    source_env TEXT PRIMARY KEY,
    last_sync_at TIMESTAMPTZ,
    last_sync_version BIGINT DEFAULT 0,
    tables_synced JSONB,
    status TEXT DEFAULT 'idle',
    error_message TEXT,
    records_synced INTEGER DEFAULT 0
);

-- Sync history log
CREATE TABLE IF NOT EXISTS aqe.sync_history (
    id SERIAL PRIMARY KEY,
    source_env TEXT NOT NULL,
    sync_type TEXT NOT NULL,  -- 'full', 'incremental', 'bidirectional'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running',  -- 'running', 'completed', 'failed'
    tables_synced JSONB,
    records_synced INTEGER DEFAULT 0,
    errors JSONB,
    duration_ms INTEGER
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- HNSW vector indexes for similarity search (ruvector)
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON aqe.memory_entries
    USING hnsw (embedding ruvector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_patterns_embedding ON aqe.patterns
    USING hnsw (embedding ruvector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_embedding ON aqe.qe_patterns
    USING hnsw (embedding ruvector_cosine_ops);

-- Standard indexes for queries
CREATE INDEX IF NOT EXISTS idx_memory_partition ON aqe.memory_entries(partition);
CREATE INDEX IF NOT EXISTS idx_memory_source ON aqe.memory_entries(source_env);
CREATE INDEX IF NOT EXISTS idx_memory_key ON aqe.memory_entries(key);
CREATE INDEX IF NOT EXISTS idx_memory_updated ON aqe.memory_entries(updated_at);

CREATE INDEX IF NOT EXISTS idx_learning_agent ON aqe.learning_experiences(agent_id);
CREATE INDEX IF NOT EXISTS idx_learning_task_type ON aqe.learning_experiences(task_type);
CREATE INDEX IF NOT EXISTS idx_learning_source ON aqe.learning_experiences(source_env);

CREATE INDEX IF NOT EXISTS idx_goap_actions_agent ON aqe.goap_actions(agent_type);
CREATE INDEX IF NOT EXISTS idx_goap_actions_source ON aqe.goap_actions(source_env);

CREATE INDEX IF NOT EXISTS idx_goap_plans_status ON aqe.goap_plans(status);
CREATE INDEX IF NOT EXISTS idx_goap_plans_source ON aqe.goap_plans(source_env);

CREATE INDEX IF NOT EXISTS idx_patterns_domain ON aqe.patterns(domain);
CREATE INDEX IF NOT EXISTS idx_patterns_source ON aqe.patterns(source_env);

CREATE INDEX IF NOT EXISTS idx_qe_patterns_domain ON aqe.qe_patterns(qe_domain);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_type ON aqe.qe_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_tier ON aqe.qe_patterns(tier);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_quality ON aqe.qe_patterns(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_source ON aqe.qe_patterns(source_env);

CREATE INDEX IF NOT EXISTS idx_sona_patterns_type ON aqe.sona_patterns(type);
CREATE INDEX IF NOT EXISTS idx_sona_patterns_domain ON aqe.sona_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_sona_patterns_source ON aqe.sona_patterns(source_env);

CREATE INDEX IF NOT EXISTS idx_events_type ON aqe.events(type);
CREATE INDEX IF NOT EXISTS idx_events_source ON aqe.events(source_env);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON aqe.events(timestamp);

CREATE INDEX IF NOT EXISTS idx_claude_flow_category ON aqe.claude_flow_memory(category);
CREATE INDEX IF NOT EXISTS idx_claude_flow_source ON aqe.claude_flow_memory(source_env);

CREATE INDEX IF NOT EXISTS idx_qlearning_state ON aqe.qlearning_patterns(state);
CREATE INDEX IF NOT EXISTS idx_qlearning_source ON aqe.qlearning_patterns(source_env);

CREATE INDEX IF NOT EXISTS idx_intelligence_type ON aqe.intelligence_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_intelligence_source ON aqe.intelligence_memories(source_env);

CREATE INDEX IF NOT EXISTS idx_sync_history_source ON aqe.sync_history(source_env);
CREATE INDEX IF NOT EXISTS idx_sync_history_started ON aqe.sync_history(started_at);

-- ============================================================================
-- Functions for Conflict Resolution
-- ============================================================================

-- Function to merge patterns with weighted averages
CREATE OR REPLACE FUNCTION aqe.merge_pattern_stats(
    local_usage_count INTEGER,
    local_success_rate REAL,
    cloud_usage_count INTEGER,
    cloud_success_rate REAL
) RETURNS TABLE(merged_usage_count INTEGER, merged_success_rate REAL) AS $$
BEGIN
    merged_usage_count := local_usage_count + cloud_usage_count;
    IF merged_usage_count > 0 THEN
        merged_success_rate := (
            (local_usage_count * local_success_rate) +
            (cloud_usage_count * cloud_success_rate)
        ) / merged_usage_count;
    ELSE
        merged_success_rate := 0;
    END IF;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function to get sync status summary
CREATE OR REPLACE FUNCTION aqe.get_sync_summary()
RETURNS TABLE(
    source_env TEXT,
    last_sync TIMESTAMPTZ,
    status TEXT,
    total_records BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.source_env,
        s.last_sync_at as last_sync,
        s.status,
        COALESCE(
            (SELECT COUNT(*) FROM aqe.memory_entries WHERE source_env = s.source_env) +
            (SELECT COUNT(*) FROM aqe.qe_patterns WHERE source_env = s.source_env) +
            (SELECT COUNT(*) FROM aqe.goap_actions WHERE source_env = s.source_env),
            0
        ) as total_records
    FROM aqe.sync_state s;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Views for Easy Querying
-- ============================================================================

-- View: All patterns across sources
CREATE OR REPLACE VIEW aqe.all_patterns AS
SELECT
    'qe_pattern' as pattern_source,
    id,
    name as pattern,
    qe_domain as domain,
    confidence,
    usage_count,
    success_rate,
    source_env,
    created_at
FROM aqe.qe_patterns
UNION ALL
SELECT
    'pattern' as pattern_source,
    id,
    pattern,
    domain,
    confidence,
    usage_count,
    success_rate,
    source_env,
    created_at
FROM aqe.patterns;

-- View: Learning activity summary
CREATE OR REPLACE VIEW aqe.learning_summary AS
SELECT
    source_env,
    COUNT(DISTINCT agent_id) as unique_agents,
    COUNT(*) as total_experiences,
    AVG(reward) as avg_reward,
    MAX(created_at) as last_activity
FROM aqe.learning_experiences
GROUP BY source_env;

-- View: GOAP action effectiveness
CREATE OR REPLACE VIEW aqe.goap_effectiveness AS
SELECT
    a.agent_type,
    a.name,
    a.execution_count,
    a.success_rate,
    a.cost,
    a.source_env
FROM aqe.goap_actions a
WHERE a.execution_count > 0
ORDER BY a.success_rate DESC, a.execution_count DESC;
