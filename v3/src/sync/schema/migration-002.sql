-- Migration 002: Add missing tables for post-consolidation sync
-- Date: 2026-02-20
-- Context: After database consolidation (2026-01-30), the sync config
--   referenced old v2 tables (memory_entries, learning_experiences, patterns, events)
--   that no longer exist. This migration adds cloud tables for new v3 data
--   that was never being synced.

-- ============================================================================
-- New Tables for Execution & Routing Data
-- ============================================================================

-- Routing outcomes (model routing decisions) - 184+ records locally
CREATE TABLE IF NOT EXISTS aqe.routing_outcomes (
    id TEXT PRIMARY KEY,
    task_json JSONB NOT NULL,
    decision_json JSONB NOT NULL,
    used_agent TEXT NOT NULL,
    followed_recommendation BOOLEAN NOT NULL,
    success BOOLEAN NOT NULL,
    quality_score REAL NOT NULL,
    duration_ms REAL NOT NULL,
    error TEXT,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QE trajectories (execution traces) - 320+ records locally
CREATE TABLE IF NOT EXISTS aqe.qe_trajectories (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    agent TEXT,
    domain TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    success BOOLEAN,
    steps_json JSONB,
    metadata_json JSONB,
    embedding ruvector(384),
    feedback TEXT,
    related_patterns TEXT,
    source_env TEXT NOT NULL
);

-- Dream insights (consolidation results) - 660+ records locally
CREATE TABLE IF NOT EXISTS aqe.dream_insights (
    id TEXT PRIMARY KEY,
    cycle_id TEXT NOT NULL,
    insight_type TEXT NOT NULL,
    source_concepts TEXT NOT NULL,
    description TEXT NOT NULL,
    novelty_score REAL DEFAULT 0.5,
    confidence_score REAL DEFAULT 0.5,
    actionable BOOLEAN DEFAULT FALSE,
    applied BOOLEAN DEFAULT FALSE,
    suggested_action TEXT,
    pattern_id TEXT,
    source_env TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_routing_outcomes_agent ON aqe.routing_outcomes(used_agent);
CREATE INDEX IF NOT EXISTS idx_routing_outcomes_source ON aqe.routing_outcomes(source_env);
CREATE INDEX IF NOT EXISTS idx_routing_outcomes_success ON aqe.routing_outcomes(success);

CREATE INDEX IF NOT EXISTS idx_qe_trajectories_domain ON aqe.qe_trajectories(domain);
CREATE INDEX IF NOT EXISTS idx_qe_trajectories_source ON aqe.qe_trajectories(source_env);
CREATE INDEX IF NOT EXISTS idx_qe_trajectories_success ON aqe.qe_trajectories(success);

CREATE INDEX IF NOT EXISTS idx_dream_insights_type ON aqe.dream_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_dream_insights_source ON aqe.dream_insights(source_env);
CREATE INDEX IF NOT EXISTS idx_dream_insights_cycle ON aqe.dream_insights(cycle_id);

-- HNSW vector index for trajectory semantic search
CREATE INDEX IF NOT EXISTS idx_qe_trajectories_embedding ON aqe.qe_trajectories
    USING hnsw (embedding ruvector_cosine_ops);
