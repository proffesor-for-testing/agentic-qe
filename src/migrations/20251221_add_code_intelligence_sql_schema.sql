-- Migration: Add Code Intelligence Schema
-- Date: 2025-12-21
-- Description: Creates tables for code chunk storage, entity parsing, and relationship graphs
-- Features: RuVector embeddings, full-text search with pg_trgm, SQL-based graph relationships

-- ============================================================================
-- STEP 1: Install Required Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- STEP 2: Create code_chunks Table
-- ============================================================================
-- Stores code chunks with vector embeddings for semantic search and BM25 full-text search

CREATE TABLE IF NOT EXISTS code_chunks (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  chunk_type VARCHAR(50),  -- 'function', 'class', 'module', 'block'
  name TEXT,
  line_start INTEGER,
  line_end INTEGER,
  content TEXT NOT NULL,
  language VARCHAR(20),
  embedding ruvector(768),  -- RuVector 768-dimensional SIMD-optimized embedding
  content_tsvector tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for code_chunks
CREATE INDEX IF NOT EXISTS idx_chunks_file ON code_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_chunks_type ON code_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_chunks_language ON code_chunks(language);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON code_chunks USING GIN(content_tsvector);
-- Note: RuVector uses SIMD for fast cosine distance without specialized index

-- Add helpful comments
COMMENT ON TABLE code_chunks IS 'Stores code chunks with RuVector embeddings for hybrid semantic + keyword search';
COMMENT ON COLUMN code_chunks.embedding IS 'RuVector 768-dim SIMD-optimized embedding for semantic similarity';
COMMENT ON COLUMN code_chunks.content_tsvector IS 'Full-text search vector for BM25 keyword matching';

-- ============================================================================
-- STEP 3: Create code_entities Table
-- ============================================================================
-- Stores parsed code entities (functions, classes, methods, interfaces)

CREATE TABLE IF NOT EXISTS code_entities (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,  -- 'function', 'class', 'method', 'interface', 'variable', 'type'
  name TEXT NOT NULL,
  signature TEXT,
  line_start INTEGER,
  line_end INTEGER,
  language VARCHAR(20),
  parent_id TEXT REFERENCES code_entities(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for code_entities
CREATE INDEX IF NOT EXISTS idx_entities_file ON code_entities(file_path);
CREATE INDEX IF NOT EXISTS idx_entities_type ON code_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON code_entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON code_entities(parent_id);

-- Add helpful comments
COMMENT ON TABLE code_entities IS 'Parsed code entities (functions, classes, methods) for code graph analysis';
COMMENT ON COLUMN code_entities.parent_id IS 'Self-referential FK for hierarchical relationships (e.g., method -> class)';

-- ============================================================================
-- STEP 4: Create entity_relationships Table
-- ============================================================================
-- Stores relationships between code entities for graph analysis (SQL-based, not Apache AGE)

CREATE TABLE IF NOT EXISTS entity_relationships (
  id SERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_type VARCHAR(50) NOT NULL,  -- IMPORTS, TESTS, CALLS, EXTENDS, IMPLEMENTS, DEFINES, REFERENCES
  confidence REAL DEFAULT 1.0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, relationship_type)
);

-- Indices for entity_relationships
CREATE INDEX IF NOT EXISTS idx_rel_source ON entity_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON entity_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_rel_type ON entity_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_rel_source_type ON entity_relationships(source_id, relationship_type);

-- Add helpful comments
COMMENT ON TABLE entity_relationships IS 'Code entity relationships for graph analysis (uses SQL tables, not Apache AGE)';
COMMENT ON COLUMN entity_relationships.relationship_type IS 'Type: IMPORTS, TESTS, CALLS, EXTENDS, IMPLEMENTS, DEFINES, REFERENCES';
COMMENT ON COLUMN entity_relationships.confidence IS 'Confidence score for inferred relationships (0.0-1.0)';

-- ============================================================================
-- STEP 5: Create Helper Functions
-- ============================================================================

-- Function to update code_chunks.updated_at timestamp
CREATE OR REPLACE FUNCTION update_code_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on code_chunks
CREATE TRIGGER trigger_update_code_chunks_updated_at
  BEFORE UPDATE ON code_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_code_chunks_updated_at();

-- Function to perform hybrid search (semantic + keyword)
CREATE OR REPLACE FUNCTION hybrid_code_search(
  query_embedding ruvector(768),
  query_text TEXT,
  semantic_weight REAL DEFAULT 0.7,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  file_path TEXT,
  chunk_type VARCHAR(50),
  name TEXT,
  content TEXT,
  semantic_score REAL,
  keyword_score REAL,
  hybrid_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.file_path,
    c.chunk_type,
    c.name,
    c.content,
    (1 - cosine_distance(c.embedding, query_embedding)) AS semantic_score,
    ts_rank(c.content_tsvector, plainto_tsquery('english', query_text)) AS keyword_score,
    (
      semantic_weight * (1 - cosine_distance(c.embedding, query_embedding)) +
      (1 - semantic_weight) * ts_rank(c.content_tsvector, plainto_tsquery('english', query_text))
    ) AS hybrid_score
  FROM code_chunks c
  WHERE c.embedding IS NOT NULL
  ORDER BY hybrid_score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION hybrid_code_search IS 'Hybrid search combining RuVector semantic similarity and BM25 keyword matching';

-- ============================================================================
-- STEP 6: Verification Queries
-- ============================================================================

-- Verify extensions
SELECT extname, extversion FROM pg_extension WHERE extname IN ('ruvector', 'pg_trgm');

-- Verify tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('code_chunks', 'code_entities', 'entity_relationships');

-- Verify indices
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('code_chunks', 'code_entities', 'entity_relationships');

-- ============================================================================
-- Migration Complete
-- ============================================================================
