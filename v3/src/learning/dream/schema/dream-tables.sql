-- Dream System Database Schema
-- ADR-021: QE ReasoningBank - Dream Cycle Integration
--
-- Tables for Dream-based Pattern Discovery:
-- - concept_nodes: Nodes in the concept graph (patterns, techniques, domains, outcomes, errors)
-- - concept_edges: Weighted edges representing associations between concepts
-- - dream_cycles: History of dream cycle executions
-- - dream_insights: Insights generated during dream cycles

-- ============================================================================
-- Concept Graph Nodes
-- ============================================================================
-- Stores concepts that can be activated during dream cycles.
-- Concepts are derived from patterns, experiences, and domain knowledge.
CREATE TABLE IF NOT EXISTS concept_nodes (
  id TEXT PRIMARY KEY,
  concept_type TEXT NOT NULL,  -- 'pattern', 'technique', 'domain', 'outcome', 'error'
  content TEXT NOT NULL,
  embedding BLOB,
  activation_level REAL DEFAULT 0.0,
  last_activated TEXT,
  pattern_id TEXT,             -- Optional link to source pattern
  metadata TEXT,               -- JSON metadata
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- Concept Edges (associations)
-- ============================================================================
-- Weighted edges between concepts representing learned associations.
-- Edges can represent similarity, causation, co-occurrence, or sequence.
CREATE TABLE IF NOT EXISTS concept_edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  edge_type TEXT NOT NULL,     -- 'similarity', 'causation', 'co_occurrence', 'sequence'
  evidence INTEGER DEFAULT 1,  -- Number of observations supporting this edge
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source) REFERENCES concept_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target) REFERENCES concept_nodes(id) ON DELETE CASCADE
);

-- ============================================================================
-- Dream Cycles (history)
-- ============================================================================
-- Records each dream cycle execution with timing and results.
CREATE TABLE IF NOT EXISTS dream_cycles (
  id TEXT PRIMARY KEY,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_ms INTEGER,
  concepts_processed INTEGER DEFAULT 0,
  associations_found INTEGER DEFAULT 0,
  insights_generated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',  -- 'running', 'completed', 'interrupted', 'failed'
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================================
-- Dream Insights
-- ============================================================================
-- Insights discovered during dream cycles through pattern activation.
CREATE TABLE IF NOT EXISTS dream_insights (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,  -- 'correlation', 'anomaly', 'optimization', 'anti_pattern', 'novel_pattern'
  source_concepts TEXT NOT NULL,  -- JSON array of concept IDs that contributed
  description TEXT NOT NULL,
  novelty_score REAL DEFAULT 0.5,
  actionable INTEGER DEFAULT 0,   -- Boolean: can this insight be applied?
  applied INTEGER DEFAULT 0,      -- Boolean: has this insight been applied?
  pattern_id TEXT,                -- Optional: pattern created from this insight
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cycle_id) REFERENCES dream_cycles(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_concept_type ON concept_nodes(concept_type);
CREATE INDEX IF NOT EXISTS idx_concept_activation ON concept_nodes(activation_level);
CREATE INDEX IF NOT EXISTS idx_concept_pattern ON concept_nodes(pattern_id);
CREATE INDEX IF NOT EXISTS idx_edge_source ON concept_edges(source);
CREATE INDEX IF NOT EXISTS idx_edge_target ON concept_edges(target);
CREATE INDEX IF NOT EXISTS idx_edge_type ON concept_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_edge_weight ON concept_edges(weight DESC);
CREATE INDEX IF NOT EXISTS idx_insight_cycle ON dream_insights(cycle_id);
CREATE INDEX IF NOT EXISTS idx_insight_type ON dream_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insight_novelty ON dream_insights(novelty_score DESC);
CREATE INDEX IF NOT EXISTS idx_dream_status ON dream_cycles(status);
CREATE INDEX IF NOT EXISTS idx_dream_start ON dream_cycles(start_time DESC);
