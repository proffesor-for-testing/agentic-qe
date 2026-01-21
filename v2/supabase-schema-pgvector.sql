-- ============================================
-- Agentic QE Supabase Schema (pgvector version)
-- ============================================
-- Uses pgvector (native Supabase extension) for vector similarity search
-- Compatible with RuVector API patterns
--
-- @version 1.0.0
-- ============================================

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector (native to Supabase)

-- ============================================
-- Projects Table (Multi-tenant)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID,
  team_ids UUID[] DEFAULT '{}',
  settings JSONB DEFAULT '{"defaultPrivacyLevel": "private", "autoShare": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qe_projects_owner ON qe_projects(owner_id);

-- ============================================
-- Learning Experiences Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_learning_experiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  task_type TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  outcome JSONB NOT NULL DEFAULT '{}',
  embedding vector(384),
  privacy_level TEXT DEFAULT 'private' CHECK (privacy_level IN ('private', 'team', 'public')),
  is_anonymized BOOLEAN DEFAULT false,
  share_count INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_qe_experiences_project ON qe_learning_experiences(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_agent ON qe_learning_experiences(agent_id);
CREATE INDEX IF NOT EXISTS idx_qe_experiences_embedding ON qe_learning_experiences USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- Test Patterns Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  domain TEXT NOT NULL,
  framework TEXT,
  content TEXT NOT NULL,
  embedding vector(384),
  confidence REAL DEFAULT 0.5,
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  verdict TEXT,
  privacy_level TEXT DEFAULT 'private',
  is_anonymized BOOLEAN DEFAULT false,
  source_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qe_patterns_project ON qe_patterns(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_patterns_embedding ON qe_patterns USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- Nervous System State Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_nervous_system_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  component TEXT NOT NULL,
  state_data BYTEA,
  state_json JSONB,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_ns_state UNIQUE(project_id, agent_id, component)
);

CREATE INDEX IF NOT EXISTS idx_qe_ns_state_agent ON qe_nervous_system_state(agent_id);

-- ============================================
-- Aggregated Metrics Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_aggregate_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL NOT NULL,
  sample_count INTEGER DEFAULT 1,
  agent_type TEXT,
  task_type TEXT,
  framework TEXT,
  time_bucket TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qe_metrics_project ON qe_aggregate_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_metrics_time ON qe_aggregate_metrics(time_bucket DESC);

-- ============================================
-- Memory Entries Table (SwarmMemory sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_memory_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  partition TEXT NOT NULL DEFAULT 'default',
  value TEXT NOT NULL,
  owner TEXT NOT NULL,
  access_level TEXT DEFAULT 'owner' CHECK (access_level IN ('owner', 'team', 'swarm', 'public')),
  team_id UUID,
  swarm_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT unique_memory_key UNIQUE(project_id, partition, key)
);

CREATE INDEX IF NOT EXISTS idx_qe_memory_project ON qe_memory_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_memory_partition ON qe_memory_entries(partition);

-- ============================================
-- Events Table (Telemetry sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qe_events_project ON qe_events(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_events_type ON qe_events(type);
CREATE INDEX IF NOT EXISTS idx_qe_events_timestamp ON qe_events(timestamp DESC);

-- ============================================
-- Code Chunks Table (Code Intelligence sync)
-- ============================================

CREATE TABLE IF NOT EXISTS qe_code_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('function', 'class', 'method', 'interface', 'type', 'import', 'export', 'block')),
  name TEXT,
  language TEXT NOT NULL CHECK (language IN ('typescript', 'javascript', 'python', 'java', 'go', 'rust', 'other')),
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  commit_sha TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_chunk_location UNIQUE(project_id, file_path, start_line, end_line)
);

CREATE INDEX IF NOT EXISTS idx_qe_code_project ON qe_code_chunks(project_id);
CREATE INDEX IF NOT EXISTS idx_qe_code_file ON qe_code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_qe_code_embedding ON qe_code_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- Sync Queue Table
-- ============================================

CREATE TABLE IF NOT EXISTS qe_sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES qe_projects(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  data JSONB,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_qe_sync_pending ON qe_sync_queue(processed_at) WHERE processed_at IS NULL;

-- ============================================
-- Helper Functions
-- ============================================

-- Function to search similar code chunks
CREATE OR REPLACE FUNCTION search_similar_code(
  query_embedding vector(768),
  match_count INTEGER DEFAULT 10,
  min_similarity REAL DEFAULT 0.5,
  filter_project UUID DEFAULT NULL,
  filter_language TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  file_path TEXT,
  content TEXT,
  start_line INTEGER,
  end_line INTEGER,
  chunk_type TEXT,
  name TEXT,
  language TEXT,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.file_path,
    c.content,
    c.start_line,
    c.end_line,
    c.chunk_type,
    c.name,
    c.language,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM qe_code_chunks c
  WHERE
    c.embedding IS NOT NULL
    AND (filter_project IS NULL OR c.project_id = filter_project)
    AND (filter_language IS NULL OR c.language = filter_language)
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search similar experiences
CREATE OR REPLACE FUNCTION search_similar_experiences(
  query_embedding vector(384),
  match_count INTEGER DEFAULT 10,
  min_similarity REAL DEFAULT 0.5,
  filter_project UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  agent_id TEXT,
  agent_type TEXT,
  task_type TEXT,
  context JSONB,
  outcome JSONB,
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
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM qe_learning_experiences e
  WHERE
    e.embedding IS NOT NULL
    AND (filter_project IS NULL OR e.project_id = filter_project)
    AND 1 - (e.embedding <=> query_embedding) >= min_similarity
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- Success Message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Agentic QE schema created successfully with pgvector!';
  RAISE NOTICE 'Tables: qe_projects, qe_learning_experiences, qe_patterns, qe_nervous_system_state, qe_aggregate_metrics, qe_memory_entries, qe_events, qe_code_chunks, qe_sync_queue';
END $$;
