-- ============================================================================
-- GOAP (Goal-Oriented Action Planning) Database Schema for Agentic QE V3
-- ============================================================================
--
-- This schema supports the A* planning system for:
-- - Quality Gate decisions
-- - Test Strategy generation
-- - Fleet Orchestration
-- - Failure Recovery
--
-- Tables:
--   1. goap_goals - Target states to achieve
--   2. goap_actions - Atomic operations with preconditions/effects
--   3. goap_plans - Computed action sequences
--   4. goap_execution_steps - Execution history for learning
--
-- @module planning/schema
-- @version 3.0.0
-- ============================================================================

-- ============================================================================
-- Table: goap_goals
-- Target states to achieve through planning
-- ============================================================================
CREATE TABLE IF NOT EXISTS goap_goals (
    -- Primary identifier
    id TEXT PRIMARY KEY,

    -- Goal metadata
    name TEXT NOT NULL,
    description TEXT,

    -- Goal conditions (JSON StateConditions)
    -- Example: {"coverage.line": {"min": 80}, "quality.testsPassing": {"min": 95}}
    conditions TEXT NOT NULL,

    -- Priority (1=low, 5=critical)
    priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),

    -- QE domain classification
    qe_domain TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- Table: goap_actions
-- Atomic operations that can be executed by agents
-- ============================================================================
CREATE TABLE IF NOT EXISTS goap_actions (
    -- Primary identifier
    id TEXT PRIMARY KEY,

    -- Action metadata
    name TEXT NOT NULL,
    description TEXT,

    -- Agent type that can execute this action
    agent_type TEXT NOT NULL,

    -- Preconditions (JSON StateConditions)
    -- Example: {"fleet.activeAgents": {"min": 1}, "coverage.measured": true}
    preconditions TEXT NOT NULL,

    -- Effects (JSON ActionEffects)
    -- Example: {"coverage.line": {"delta": 10}, "coverage.measured": {"set": true}}
    effects TEXT NOT NULL,

    -- Cost metrics
    cost REAL NOT NULL DEFAULT 1.0 CHECK (cost > 0),
    estimated_duration_ms INTEGER,

    -- Learning metrics
    success_rate REAL NOT NULL DEFAULT 1.0 CHECK (success_rate >= 0 AND success_rate <= 1),
    execution_count INTEGER NOT NULL DEFAULT 0 CHECK (execution_count >= 0),

    -- Classification
    category TEXT NOT NULL CHECK (category IN ('test', 'security', 'performance', 'analysis', 'coverage', 'fleet', 'quality')),
    qe_domain TEXT,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- Table: goap_plans
-- Computed action sequences to achieve goals
-- ============================================================================
CREATE TABLE IF NOT EXISTS goap_plans (
    -- Primary identifier
    id TEXT PRIMARY KEY,

    -- Associated goal (optional)
    goal_id TEXT,

    -- State snapshots (JSON V3WorldState)
    initial_state TEXT NOT NULL,
    goal_state TEXT NOT NULL,

    -- Action sequence (JSON array of action IDs)
    -- Example: ["action-1", "action-2", "action-3"]
    action_sequence TEXT NOT NULL,

    -- Cost metrics
    total_cost REAL NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    estimated_duration_ms INTEGER,

    -- Execution status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),

    -- Plan reuse tracking
    reused_from TEXT,
    similarity_score REAL CHECK (similarity_score IS NULL OR (similarity_score >= 0 AND similarity_score <= 1)),

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    executed_at TEXT,
    completed_at TEXT,

    -- Foreign key constraint
    FOREIGN KEY (goal_id) REFERENCES goap_goals(id) ON DELETE SET NULL
);

-- ============================================================================
-- Table: goap_execution_steps
-- Individual step execution history for learning and replay
-- ============================================================================
CREATE TABLE IF NOT EXISTS goap_execution_steps (
    -- Primary identifier
    id TEXT PRIMARY KEY,

    -- Plan association
    plan_id TEXT NOT NULL,
    action_id TEXT NOT NULL,
    step_order INTEGER NOT NULL CHECK (step_order >= 0),

    -- State snapshots (JSON V3WorldState)
    world_state_before TEXT,
    world_state_after TEXT,

    -- Execution status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),

    -- Agent tracking
    agent_id TEXT,

    -- Error tracking
    error_message TEXT,

    -- Timestamp
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Foreign key constraints
    FOREIGN KEY (plan_id) REFERENCES goap_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (action_id) REFERENCES goap_actions(id) ON DELETE RESTRICT
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Goals indexes
CREATE INDEX IF NOT EXISTS idx_goap_goals_priority ON goap_goals(priority DESC);
CREATE INDEX IF NOT EXISTS idx_goap_goals_qe_domain ON goap_goals(qe_domain);

-- Actions indexes
CREATE INDEX IF NOT EXISTS idx_goap_actions_category ON goap_actions(category);
CREATE INDEX IF NOT EXISTS idx_goap_actions_agent_type ON goap_actions(agent_type);
CREATE INDEX IF NOT EXISTS idx_goap_actions_qe_domain ON goap_actions(qe_domain);
CREATE INDEX IF NOT EXISTS idx_goap_actions_success_rate ON goap_actions(success_rate DESC);
CREATE INDEX IF NOT EXISTS idx_goap_actions_cost ON goap_actions(cost ASC);

-- Plans indexes
CREATE INDEX IF NOT EXISTS idx_goap_plans_status ON goap_plans(status);
CREATE INDEX IF NOT EXISTS idx_goap_plans_goal_id ON goap_plans(goal_id);
CREATE INDEX IF NOT EXISTS idx_goap_plans_created_at ON goap_plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goap_plans_reused_from ON goap_plans(reused_from);

-- Execution steps indexes
CREATE INDEX IF NOT EXISTS idx_goap_steps_plan_id ON goap_execution_steps(plan_id);
CREATE INDEX IF NOT EXISTS idx_goap_steps_action_id ON goap_execution_steps(action_id);
CREATE INDEX IF NOT EXISTS idx_goap_steps_status ON goap_execution_steps(status);
CREATE INDEX IF NOT EXISTS idx_goap_steps_plan_order ON goap_execution_steps(plan_id, step_order);
