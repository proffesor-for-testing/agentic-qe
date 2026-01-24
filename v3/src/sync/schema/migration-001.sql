-- Migration 001: Add missing columns from local SQLite schemas
-- Target: ruvector-postgres (aqe_learning database)

-- QE Patterns - add token tracking and reuse columns
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS latency_ms REAL;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS reusable BOOLEAN DEFAULT FALSE;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS reuse_count INTEGER DEFAULT 0;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS average_token_savings REAL DEFAULT 0;
ALTER TABLE aqe.qe_patterns ADD COLUMN IF NOT EXISTS total_tokens_saved INTEGER DEFAULT 0;

-- SONA Patterns - add failure tracking and metadata
ALTER TABLE aqe.sona_patterns ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;
ALTER TABLE aqe.sona_patterns ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE aqe.sona_patterns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE aqe.sona_patterns ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- GOAP Actions - use estimated_duration_ms instead of duration_estimate
ALTER TABLE aqe.goap_actions ADD COLUMN IF NOT EXISTS estimated_duration_ms INTEGER;
ALTER TABLE aqe.goap_actions ADD COLUMN IF NOT EXISTS qe_domain TEXT;

-- Memory Entries - add ownership and access control
ALTER TABLE aqe.memory_entries ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE aqe.memory_entries ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'private';
ALTER TABLE aqe.memory_entries ADD COLUMN IF NOT EXISTS team_id TEXT;
ALTER TABLE aqe.memory_entries ADD COLUMN IF NOT EXISTS swarm_id TEXT;

-- Learning Experiences - add timestamp
ALTER TABLE aqe.learning_experiences ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

-- Patterns - add TTL and agent_id
ALTER TABLE aqe.patterns ADD COLUMN IF NOT EXISTS ttl INTEGER DEFAULT 604800;
ALTER TABLE aqe.patterns ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Events - add TTL
ALTER TABLE aqe.events ADD COLUMN IF NOT EXISTS ttl INTEGER DEFAULT 2592000;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_qe_patterns_reusable ON aqe.qe_patterns(reusable) WHERE reusable = TRUE;
CREATE INDEX IF NOT EXISTS idx_memory_owner ON aqe.memory_entries(owner);
CREATE INDEX IF NOT EXISTS idx_memory_team ON aqe.memory_entries(team_id);
CREATE INDEX IF NOT EXISTS idx_memory_swarm ON aqe.memory_entries(swarm_id);
CREATE INDEX IF NOT EXISTS idx_patterns_agent ON aqe.patterns(agent_id);
CREATE INDEX IF NOT EXISTS idx_goap_qe_domain ON aqe.goap_actions(qe_domain);

-- Done
SELECT 'Migration 001 completed successfully' as status;
