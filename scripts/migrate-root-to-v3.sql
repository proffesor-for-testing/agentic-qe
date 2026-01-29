-- Migration Script: ROOT DB to V3 DB
-- Consolidates all learning data into v3/.agentic-qe/memory.db
-- Run with: sqlite3 v3/.agentic-qe/memory.db < scripts/migrate-root-to-v3.sql

-- ============================================================================
-- Step 1: Create missing tables (from ROOT schema)
-- ============================================================================

-- Patterns table (legacy learning patterns)
CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL UNIQUE,
    confidence REAL NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    ttl INTEGER NOT NULL DEFAULT 604800,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    agent_id TEXT,
    domain TEXT DEFAULT 'general',
    success_rate REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_patterns_agent_confidence ON patterns(agent_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_agent ON patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence);
CREATE INDEX IF NOT EXISTS idx_patterns_expires ON patterns(expires_at);

-- Learning experiences table (RL experiences)
CREATE TABLE IF NOT EXISTS learning_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    task_id TEXT,
    task_type TEXT NOT NULL,
    state TEXT NOT NULL,
    action TEXT NOT NULL,
    reward REAL NOT NULL,
    next_state TEXT NOT NULL,
    episode_id TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_learning_exp_agent ON learning_experiences(agent_id);
CREATE INDEX IF NOT EXISTS idx_learning_exp_created ON learning_experiences(created_at);

-- Captured experiences table (task execution captures)
CREATE TABLE IF NOT EXISTS captured_experiences (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    task_type TEXT NOT NULL,
    execution TEXT NOT NULL,
    context TEXT NOT NULL,
    outcome TEXT NOT NULL,
    embedding BLOB,
    created_at INTEGER NOT NULL,
    processed INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_captured_exp_agent ON captured_experiences(agent_id);
CREATE INDEX IF NOT EXISTS idx_captured_exp_processed ON captured_experiences(processed);
CREATE INDEX IF NOT EXISTS idx_captured_exp_agent_type ON captured_experiences(agent_type);
CREATE INDEX IF NOT EXISTS idx_captured_exp_task_type ON captured_experiences(task_type);
CREATE INDEX IF NOT EXISTS idx_captured_exp_created_at ON captured_experiences(created_at);

-- Synthesized patterns table (dream-synthesized patterns)
CREATE TABLE IF NOT EXISTS synthesized_patterns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    source_patterns TEXT NOT NULL,
    synthesis_method TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    validation_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_synth_patterns_confidence ON synthesized_patterns(confidence);

-- Dream cycles table (dream learning cycles)
CREATE TABLE IF NOT EXISTS dream_cycles (
    id TEXT PRIMARY KEY,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    duration INTEGER,
    concepts_processed INTEGER,
    associations_found INTEGER,
    insights_generated INTEGER,
    status TEXT NOT NULL,
    error TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dream_cycle_status ON dream_cycles(status);
CREATE INDEX IF NOT EXISTS idx_dream_cycle_time ON dream_cycles(start_time);

-- Dream insights table (insights from dream cycles)
CREATE TABLE IF NOT EXISTS dream_insights (
    id TEXT PRIMARY KEY,
    cycle_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    source_patterns TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    applied INTEGER DEFAULT 0,
    applied_at DATETIME,
    title TEXT,
    description TEXT,
    associated_concepts TEXT,
    novelty_score REAL DEFAULT 0.5,
    confidence_score REAL DEFAULT 0.5,
    actionable INTEGER DEFAULT 0,
    suggested_action TEXT,
    target_agent_types TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'pending',
    outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_dream_insights_type ON dream_insights(type);
CREATE INDEX IF NOT EXISTS idx_insight_status ON dream_insights(status);
CREATE INDEX IF NOT EXISTS idx_insight_priority ON dream_insights(priority);
CREATE INDEX IF NOT EXISTS idx_insight_actionable ON dream_insights(actionable);
CREATE INDEX IF NOT EXISTS idx_insight_cycle ON dream_insights(cycle_id);

-- Memory entries table (partitioned memory store)
CREATE TABLE IF NOT EXISTS memory_entries (
    key TEXT NOT NULL,
    partition TEXT NOT NULL DEFAULT 'default',
    value TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    owner TEXT,
    access_level TEXT DEFAULT 'private',
    team_id TEXT,
    swarm_id TEXT,
    PRIMARY KEY (key, partition)
);
CREATE INDEX IF NOT EXISTS idx_memory_partition ON memory_entries(partition);
CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_entries(owner);
CREATE INDEX IF NOT EXISTS idx_memory_access ON memory_entries(access_level);
CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key);

-- Agent registry table
CREATE TABLE IF NOT EXISTS agent_registry (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    status TEXT NOT NULL,
    performance TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_reg_type ON agent_registry(type);
CREATE INDEX IF NOT EXISTS idx_agent_reg_status ON agent_registry(status);

-- Transfer registry table (cross-domain transfer learning)
CREATE TABLE IF NOT EXISTS transfer_registry (
    id TEXT PRIMARY KEY,
    source_domain TEXT NOT NULL,
    target_domain TEXT NOT NULL,
    pattern_id TEXT NOT NULL,
    transformation TEXT,
    success_rate REAL DEFAULT 0.0,
    transfer_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Concept nodes table (dream concept graph)
CREATE TABLE IF NOT EXISTS concept_nodes (
    id TEXT PRIMARY KEY,
    concept_type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB,
    activation_level REAL DEFAULT 0.0,
    last_activated TEXT,
    pattern_id TEXT,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_concept_type ON concept_nodes(concept_type);
CREATE INDEX IF NOT EXISTS idx_concept_activation ON concept_nodes(activation_level);
CREATE INDEX IF NOT EXISTS idx_concept_pattern ON concept_nodes(pattern_id);

-- Concept edges table (dream concept relationships)
CREATE TABLE IF NOT EXISTS concept_edges (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    target TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 1.0,
    edge_type TEXT NOT NULL,
    evidence INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (source) REFERENCES concept_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target) REFERENCES concept_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_edge_source ON concept_edges(source);
CREATE INDEX IF NOT EXISTS idx_edge_target ON concept_edges(target);
CREATE INDEX IF NOT EXISTS idx_edge_type ON concept_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_edge_weight ON concept_edges(weight DESC);

-- ============================================================================
-- Step 2: Schema complete - data will be imported via separate commands
-- ============================================================================

SELECT 'Schema migration complete. Tables created successfully.' as status;
