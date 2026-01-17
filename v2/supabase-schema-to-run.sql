-- ============================================
-- Agentic QE Supabase Schema
-- ============================================
-- This schema enables cloud persistence for the Agentic QE Fleet
-- with RuVector extension for vector similarity search and
-- Row-Level Security for multi-tenant data isolation.
--
-- Run this schema on your Supabase project to enable cloud features:
--   1. Connect to your Supabase SQL editor
--   2. Run this entire script
--   3. Configure environment variables (see SupabaseConfig.ts)
--
-- Prerequisites:
--   - Supabase project with PostgreSQL 15+
--   - RuVector extension installed (contact Supabase support if needed)
--
-- @version 1.0.0
-- @module scripts/supabase-schema
-- ============================================

-- ============================================
-- Enable Extensions
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable RuVector for vector similarity search
-- Note: This extension may need to be enabled by Supabase support
-- If not available, you can use pgvector as an alternative
CREATE EXTENSION IF NOT EXISTS ruvector;

-- ============================================
-- Projects Table (Multi-tenant)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,

  -- Ownership
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_ids UUID[] DEFAULT '{}',

  -- Settings
  settings JSONB DEFAULT '{
    "defaultPrivacyLevel": "private",
    "autoShare": false,
    "autoImport": false
  }'::jsonb,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_qe_projects_owner ON qe_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_qe_projects_team ON qe_projects USING GIN(team_ids);

-- ============================================
-- Learning Experiences Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_learning_experiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Agent identification
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  task_type TEXT NOT NULL,

  -- Experience data
  context JSONB NOT NULL DEFAULT '{}',
  outcome JSONB NOT NULL DEFAULT '{}',

  -- Vector embedding for similarity search (384 dimensions for MiniLM)
  embedding ruvector(384),

  -- Sharing controls
  privacy_level TEXT DEFAULT 'private' CHECK (privacy_level IN ('private', 'team', 'public')),
  is_anonymized BOOLEAN DEFAULT false,
  share_count INTEGER DEFAULT 0,

  -- Quality metrics
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT valid_outcome CHECK (outcome ? 'result')
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qe_experiences_project ON qe_learning_experiences(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_agent ON qe_learning_experiences(agent_id);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_agent_type ON qe_learning_experiences(agent_type);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_task_type ON qe_learning_experiences(task_type);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_privacy ON qe_learning_experiences(privacy_level);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_created ON qe_learning_experiences(created_at DESC);

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_qe_experiences_embedding
  ON qe_learning_experiences
  USING hnsw (embedding ruvector_cosine_ops);

-- ============================================
-- Test Patterns Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Pattern identification
  type TEXT NOT NULL,  -- 'edge-case', 'boundary-condition', etc.
  domain TEXT NOT NULL,  -- 'unit-test', 'integration-test', etc.
  framework TEXT,  -- 'jest', 'vitest', etc.

  -- Pattern content
  content TEXT NOT NULL,

  -- Vector embedding for similarity search
  embedding ruvector(384),

  -- Quality metrics
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  verdict TEXT,

  -- Sharing controls
  privacy_level TEXT DEFAULT 'private' CHECK (privacy_level IN ('private', 'team', 'public')),
  is_anonymized BOOLEAN DEFAULT false,
  source_hash TEXT,  -- For deduplication across projects

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate patterns in same project
  CONSTRAINT unique_pattern_per_project UNIQUE(project_id, source_hash)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qe_patterns_project ON qe_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_type ON qe_patterns(type);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_domain ON qe_patterns(domain);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_framework ON qe_patterns(framework);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_privacy ON qe_patterns(privacy_level);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_source_hash ON qe_patterns(source_hash);

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_qe_patterns_embedding
  ON qe_patterns
  USING hnsw (embedding ruvector_cosine_ops);

-- ============================================
-- Nervous System State Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_nervous_system_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Agent and component identification
  agent_id TEXT NOT NULL,
  component TEXT NOT NULL CHECK (component IN ('hdc', 'btsp', 'circadian', 'workspace')),

  -- State data (encrypted at rest by Supabase)
  state_data BYTEA,  -- Binary state for HDC, BTSP
  state_json JSONB,  -- JSON state for Circadian

  -- Version for migrations
  version INTEGER DEFAULT 1,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per agent/component
  CONSTRAINT unique_ns_state UNIQUE(project_id, agent_id, component)
);

-- Index for agent lookup
CREATE INDEX IF NOT EXISTS idx_qe_ns_state_agent ON qe_nervous_system_state(agent_id);
CREATE INDEX IF NOT EXISTS idx_qe_ns_state_component ON qe_nervous_system_state(component);

-- ============================================
-- Aggregated Metrics Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_aggregate_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Metric identification
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  sample_count INTEGER DEFAULT 1,

  -- Dimensions for filtering
  agent_type TEXT,
  task_type TEXT,
  framework TEXT,

  -- Time bucketing
  time_bucket TIMESTAMPTZ NOT NULL,
  granularity TEXT DEFAULT 'hour' CHECK (granularity IN ('minute', 'hour', 'day', 'week')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint for upsert
  CONSTRAINT unique_metric_bucket UNIQUE(project_id, metric_type, metric_name, time_bucket, granularity, agent_type, task_type, framework)
);

-- Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_qe_metrics_bucket ON qe_aggregate_metrics(time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_qe_metrics_type ON qe_aggregate_metrics(metric_type, metric_name);

-- ============================================
-- Sync Queue Table (for Hybrid Mode)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,

  -- Change data
  change_data JSONB,

  -- Sync status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'conflict')),
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ,

  -- Order matters for conflict resolution
  sequence_number BIGSERIAL
);

-- Indexes for sync processing
CREATE INDEX IF NOT EXISTS idx_qe_sync_status ON qe_sync_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_qe_sync_sequence ON qe_sync_queue(sequence_number);

-- ============================================
-- Memory Entries Table (SwarmMemory sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_memory_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Entry identification
  key TEXT NOT NULL,
  partition TEXT NOT NULL DEFAULT 'default',

  -- Value (JSON serialized)
  value TEXT NOT NULL,

  -- Access control
  owner TEXT NOT NULL,
  access_level TEXT DEFAULT 'owner' CHECK (access_level IN ('owner', 'team', 'swarm', 'public')),
  team_id UUID,
  swarm_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- NULL = never expires

  -- Unique key per project/partition
  CONSTRAINT unique_memory_key UNIQUE(project_id, partition, key)
);

-- Indexes for memory queries
CREATE INDEX IF NOT EXISTS idx_qe_memory_project ON qe_memory_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_memory_partition ON qe_memory_entries(partition);
CREATE INDEX IF NOT EXISTS idx_qe_memory_key ON qe_memory_entries(key);
CREATE INDEX IF NOT EXISTS idx_qe_memory_owner ON qe_memory_entries(owner);
CREATE INDEX IF NOT EXISTS idx_qe_memory_expires ON qe_memory_entries(expires_at) WHERE expires_at IS NOT NULL;

-- Partial index for non-expired entries
CREATE INDEX IF NOT EXISTS idx_qe_memory_active
  ON qe_memory_entries(project_id, partition, key)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- ============================================
-- Events Table (Telemetry sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- Event details
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,  -- agent ID or component

  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- TTL for cleanup (0 = forever)
  ttl INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_qe_events_project ON qe_events(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_events_type ON qe_events(type);
CREATE INDEX IF NOT EXISTS idx_qe_events_source ON qe_events(source);
CREATE INDEX IF NOT EXISTS idx_qe_events_timestamp ON qe_events(timestamp DESC);

-- Partial index for recent events (last 7 days)
CREATE INDEX IF NOT EXISTS idx_qe_events_recent
  ON qe_events(project_id, type, timestamp DESC)
  WHERE timestamp > NOW() - INTERVAL '7 days';

-- ============================================
-- Code Chunks Table (Code Intelligence sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_code_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,

  -- File location
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,

  -- Chunk identification
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('function', 'class', 'method', 'interface', 'type', 'import', 'export', 'block')),
  name TEXT,  -- Function/class/method name
  language TEXT NOT NULL CHECK (language IN ('typescript', 'javascript', 'python', 'java', 'go', 'rust', 'other')),

  -- Content
  content TEXT NOT NULL,

  -- Vector embedding for semantic search (768 dimensions for nomic-embed-text)
  embedding ruvector(768),

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Git tracking
  commit_sha TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint per file/line range
  CONSTRAINT unique_chunk_location UNIQUE(project_id, file_path, start_line, end_line)
);

-- Indexes for code search
CREATE INDEX IF NOT EXISTS idx_qe_code_project ON qe_code_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_code_file ON qe_code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_qe_code_type ON qe_code_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_qe_code_language ON qe_code_chunks(language);
CREATE INDEX IF NOT EXISTS idx_qe_code_name ON qe_code_chunks(name) WHERE name IS NOT NULL;

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_qe_code_embedding
  ON qe_code_chunks
  USING hnsw (embedding ruvector_cosine_ops);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_qe_code_content_fts
  ON qe_code_chunks
  USING GIN (to_tsvector('english', content));

-- ============================================
-- Row-Level Security Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE qe_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_learning_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_nervous_system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_aggregate_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_memory_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qe_code_chunks ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Projects Policies
-- ============================================

-- Users can read their own projects and projects they're a team member of
CREATE POLICY "Users can view own projects"
  ON qe_projects FOR SELECT
  USING (
    owner_id = auth.uid()
    OR auth.uid() = ANY(team_ids)
  );

-- Users can create projects
CREATE POLICY "Users can create projects"
  ON qe_projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON qe_projects FOR UPDATE
  USING (owner_id = auth.uid());

-- Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON qe_projects FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================
-- Learning Experiences Policies
-- ============================================

-- Users can read public experiences
CREATE POLICY "Anyone can read public experiences"
  ON qe_learning_experiences FOR SELECT
  USING (privacy_level = 'public');

-- Users can read team experiences from their projects
CREATE POLICY "Team members can read team experiences"
  ON qe_learning_experiences FOR SELECT
  USING (
    privacy_level = 'team'
    AND project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

-- Users can read their own private experiences
CREATE POLICY "Users can read own experiences"
  ON qe_learning_experiences FOR SELECT
  USING (created_by = auth.uid());

-- Users can insert experiences into their projects
CREATE POLICY "Users can insert experiences"
  ON qe_learning_experiences FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- Users can update their own experiences
CREATE POLICY "Users can update own experiences"
  ON qe_learning_experiences FOR UPDATE
  USING (created_by = auth.uid());

-- Users can delete their own experiences
CREATE POLICY "Users can delete own experiences"
  ON qe_learning_experiences FOR DELETE
  USING (created_by = auth.uid());

-- ============================================
-- Patterns Policies (similar to experiences)
-- ============================================

CREATE POLICY "Anyone can read public patterns"
  ON qe_patterns FOR SELECT
  USING (privacy_level = 'public');

CREATE POLICY "Team members can read team patterns"
  ON qe_patterns FOR SELECT
  USING (
    privacy_level = 'team'
    AND project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

CREATE POLICY "Project owners can read own patterns"
  ON qe_patterns FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can insert patterns"
  ON qe_patterns FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can update patterns"
  ON qe_patterns FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can delete patterns"
  ON qe_patterns FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- Nervous System State Policies
-- ============================================

-- Only project owners can access their nervous system state
CREATE POLICY "Project owners can access NS state"
  ON qe_nervous_system_state FOR ALL
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- Metrics Policies
-- ============================================

-- Project members can read metrics
CREATE POLICY "Project members can read metrics"
  ON qe_aggregate_metrics FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

-- Project owners can insert/update metrics
CREATE POLICY "Project owners can write metrics"
  ON qe_aggregate_metrics FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- Sync Queue Policies
-- ============================================

-- Only project owners can access sync queue
CREATE POLICY "Project owners can access sync queue"
  ON qe_sync_queue FOR ALL
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- Memory Entries Policies
-- ============================================

-- Project owners can access all memory in their projects
CREATE POLICY "Project owners can access all memory"
  ON qe_memory_entries FOR ALL
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- Team members can access team/swarm/public memory
CREATE POLICY "Team members can read shared memory"
  ON qe_memory_entries FOR SELECT
  USING (
    access_level IN ('team', 'swarm', 'public')
    AND project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

-- ============================================
-- Events Policies
-- ============================================

-- Project owners can access all events
CREATE POLICY "Project owners can access events"
  ON qe_events FOR ALL
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- Team members can read events
CREATE POLICY "Team members can read events"
  ON qe_events FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

-- ============================================
-- Code Chunks Policies
-- ============================================

-- Project owners can access all code chunks
CREATE POLICY "Project owners can access code chunks"
  ON qe_code_chunks FOR ALL
  USING (
    project_id IN (
      SELECT id FROM qe_projects WHERE owner_id = auth.uid()
    )
  );

-- Team members can read code chunks
CREATE POLICY "Team members can read code chunks"
  ON qe_code_chunks FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM qe_projects
      WHERE owner_id = auth.uid() OR auth.uid() = ANY(team_ids)
    )
  );

-- ============================================
-- Helper Functions
-- ============================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_qe_projects_updated_at
  BEFORE UPDATE ON qe_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qe_ns_state_updated_at
  BEFORE UPDATE ON qe_nervous_system_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Vector Similarity Search Functions
-- ============================================

-- Search for similar experiences by embedding
CREATE OR REPLACE FUNCTION search_similar_experiences(
  query_embedding ruvector(384),
  match_threshold REAL DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_privacy TEXT DEFAULT NULL,
  filter_agent_type TEXT DEFAULT NULL,
  filter_task_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  agent_id TEXT,
  agent_type TEXT,
  task_type TEXT,
  context JSONB,
  outcome JSONB,
  confidence REAL,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.agent_id,
    e.agent_type,
    e.task_type,
    e.context,
    e.outcome,
    e.confidence,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM qe_learning_experiences e
  WHERE
    e.embedding IS NOT NULL
    AND (filter_privacy IS NULL OR e.privacy_level = filter_privacy)
    AND (filter_agent_type IS NULL OR e.agent_type = filter_agent_type)
    AND (filter_task_type IS NULL OR e.task_type = filter_task_type)
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Search for similar patterns by embedding
CREATE OR REPLACE FUNCTION search_similar_patterns(
  query_embedding ruvector(384),
  match_threshold REAL DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_type TEXT DEFAULT NULL,
  filter_domain TEXT DEFAULT NULL,
  filter_framework TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  domain TEXT,
  framework TEXT,
  content TEXT,
  confidence REAL,
  usage_count INT,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.type,
    p.domain,
    p.framework,
    p.content,
    p.confidence,
    p.usage_count,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM qe_patterns p
  WHERE
    p.embedding IS NOT NULL
    AND (filter_type IS NULL OR p.type = filter_type)
    AND (filter_domain IS NULL OR p.domain = filter_domain)
    AND (filter_framework IS NULL OR p.framework = filter_framework)
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Search for similar code chunks by embedding
CREATE OR REPLACE FUNCTION search_similar_code(
  query_embedding ruvector(768),
  match_threshold REAL DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_project_id UUID DEFAULT NULL,
  filter_language TEXT DEFAULT NULL,
  filter_chunk_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  file_path TEXT,
  start_line INT,
  end_line INT,
  chunk_type TEXT,
  name TEXT,
  language TEXT,
  content TEXT,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.project_id,
    c.file_path,
    c.start_line,
    c.end_line,
    c.chunk_type,
    c.name,
    c.language,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM qe_code_chunks c
  WHERE
    c.embedding IS NOT NULL
    AND (filter_project_id IS NULL OR c.project_id = filter_project_id)
    AND (filter_language IS NULL OR c.language = filter_language)
    AND (filter_chunk_type IS NULL OR c.chunk_type = filter_chunk_type)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- ============================================
-- Aggregate Statistics View
-- ============================================

CREATE OR REPLACE VIEW qe_project_stats AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  COUNT(DISTINCT e.id) AS experience_count,
  COUNT(DISTINCT pt.id) AS pattern_count,
  COUNT(DISTINCT ns.agent_id) AS agent_count,
  MAX(e.created_at) AS last_experience_at,
  AVG(e.confidence) AS avg_confidence
FROM qe_projects p
LEFT JOIN qe_learning_experiences e ON e.project_id = p.id
LEFT JOIN qe_patterns pt ON pt.project_id = p.id
LEFT JOIN qe_nervous_system_state ns ON ns.project_id = p.id
GROUP BY p.id, p.name;

-- ============================================
-- Enable RuVector Learning (if extension supports it)
-- ============================================
-- Note: These functions may not be available in all RuVector versions
-- Uncomment if your version supports learning features

-- SELECT ruvector_enable_learning('qe_learning_experiences');
-- SELECT ruvector_enable_learning('qe_patterns');

-- ============================================
-- Grants for Service Role
-- ============================================
-- These grants allow the service role to bypass RLS for admin operations

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================
-- Schema Version Tracking
-- ============================================

CREATE TABLE IF NOT EXISTS qe_schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  description TEXT
);

INSERT INTO qe_schema_version (version, description)
VALUES (1, 'Initial schema with RuVector and RLS')
ON CONFLICT (version) DO NOTHING;

-- ============================================
-- Success Message
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Agentic QE schema created successfully!';
  RAISE NOTICE 'Core Tables: qe_projects, qe_learning_experiences, qe_patterns, qe_nervous_system_state';
  RAISE NOTICE 'Sync Tables: qe_memory_entries, qe_events, qe_code_chunks, qe_sync_queue, qe_aggregate_metrics';
  RAISE NOTICE 'RLS policies enabled for multi-tenant security';
  RAISE NOTICE 'Vector similarity search ready via RuVector extension (384d for experiences/patterns, 768d for code)';
END $$;
