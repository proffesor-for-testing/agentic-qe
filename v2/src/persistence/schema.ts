/**
 * @fileoverview Database schema types and migration logic for AQE persistence layer
 * @module persistence/schema
 */

import Database from 'better-sqlite3';

// ============================================================================
// Event Store Types
// ============================================================================

/**
 * Event types for telemetry tracking
 */
export type EventType =
  | 'agent_started'
  | 'agent_completed'
  | 'agent_error'
  | 'test_generated'
  | 'test_executed'
  | 'coverage_analyzed'
  | 'quality_gate_passed'
  | 'quality_gate_failed'
  | 'pattern_matched'
  | 'learning_completed'
  | 'custom';

/**
 * Event record for telemetry tracking
 */
export interface EventRecord {
  id: string;
  timestamp: string;
  agent_id: string;
  event_type: EventType;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  session_id: string;
}

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  agent_id: string;
  event_type: EventType;
  payload: Record<string, unknown>;
  correlation_id?: string;
  session_id: string;
}

// ============================================================================
// Reasoning Chain Types
// ============================================================================

/**
 * Types of reasoning steps
 */
export type ThoughtType =
  | 'observation'
  | 'hypothesis'
  | 'decision'
  | 'validation'
  | 'conclusion'
  | 'action';

/**
 * Status of a reasoning chain
 */
export type ChainStatus = 'in_progress' | 'completed' | 'failed' | 'abandoned';

/**
 * Reasoning chain record
 */
export interface ReasoningChain {
  id: string;
  session_id: string;
  agent_id: string;
  created_at: string;
  completed_at: string | null;
  status: ChainStatus;
  context: Record<string, unknown>;
}

/**
 * Reasoning step within a chain
 */
export interface ReasoningStep {
  id: string;
  chain_id: string;
  step_order: number;
  thought_type: ThoughtType;
  content: string;
  confidence: number;
  token_count: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Input for starting a new reasoning chain
 */
export interface StartChainInput {
  session_id: string;
  agent_id: string;
  context?: Record<string, unknown>;
}

/**
 * Input for adding a reasoning step
 */
export interface AddStepInput {
  chain_id: string;
  thought_type: ThoughtType;
  content: string;
  confidence: number;
  token_count: number;
  metadata?: Record<string, unknown>;
}

/**
 * Complete chain with all steps
 */
export interface ReasoningChainWithSteps extends ReasoningChain {
  steps: ReasoningStep[];
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Aggregation window periods
 */
export type AggregationPeriod = '1min' | '5min' | '1hour' | '1day';

/**
 * Individual quality metric record
 */
export interface QualityMetric {
  id: string;
  timestamp: string;
  agent_id: string;
  metric_name: string;
  metric_value: number;
  dimensions: Record<string, string>;
}

/**
 * Aggregated metrics for a time period
 */
export interface AggregatedMetric {
  id: string;
  period_start: string;
  period_end: string;
  agent_id: string;
  metric_name: string;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

/**
 * Input for recording a metric
 */
export interface RecordMetricInput {
  agent_id: string;
  metric_name: string;
  metric_value: number;
  dimensions?: Record<string, string>;
}

/**
 * Metric trend data point
 */
export interface MetricTrendPoint {
  timestamp: string;
  value: number;
  count: number;
}

/**
 * Agent performance summary
 */
export interface AgentPerformance {
  agent_id: string;
  total_events: number;
  avg_duration_ms: number;
  success_rate: number;
  metrics: Record<string, number>;
}

// ============================================================================
// Database Configuration
// ============================================================================

/**
 * Configuration for persistence layer
 */
export interface PersistenceConfig {
  dbPath: string;
  enableWAL?: boolean;
  busyTimeout?: number;
  maxRetries?: number;
}

/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  dbPath: './data/aqe-telemetry.db',
  enableWAL: true,
  busyTimeout: 5000,
  maxRetries: 3,
};

// ============================================================================
// Schema Migration
// ============================================================================

/**
 * SQL statements for creating database schema
 */
const SCHEMA_SQL = `
-- Events table for telemetry
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  correlation_id TEXT,
  session_id TEXT NOT NULL
);

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_correlation_id ON events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_agent_time ON events(agent_id, timestamp);

-- Reasoning chains table
CREATE TABLE IF NOT EXISTS reasoning_chains (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  context TEXT NOT NULL DEFAULT '{}'
);

-- Indexes for reasoning chains
CREATE INDEX IF NOT EXISTS idx_chains_session_id ON reasoning_chains(session_id);
CREATE INDEX IF NOT EXISTS idx_chains_agent_id ON reasoning_chains(agent_id);
CREATE INDEX IF NOT EXISTS idx_chains_status ON reasoning_chains(status);
CREATE INDEX IF NOT EXISTS idx_chains_created_at ON reasoning_chains(created_at);

-- Reasoning steps table
CREATE TABLE IF NOT EXISTS reasoning_steps (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  thought_type TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (chain_id) REFERENCES reasoning_chains(id) ON DELETE CASCADE
);

-- Indexes for reasoning steps
CREATE INDEX IF NOT EXISTS idx_steps_chain_id ON reasoning_steps(chain_id);
CREATE INDEX IF NOT EXISTS idx_steps_thought_type ON reasoning_steps(thought_type);
CREATE INDEX IF NOT EXISTS idx_steps_chain_order ON reasoning_steps(chain_id, step_order);

-- Quality metrics table
CREATE TABLE IF NOT EXISTS quality_metrics (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value REAL NOT NULL,
  dimensions TEXT NOT NULL DEFAULT '{}'
);

-- Indexes for quality metrics
CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON quality_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON quality_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON quality_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_metrics_agent_name ON quality_metrics(agent_id, metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON quality_metrics(metric_name, timestamp);

-- Aggregated metrics table
CREATE TABLE IF NOT EXISTS aggregated_metrics (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  count INTEGER NOT NULL,
  sum REAL NOT NULL,
  min REAL NOT NULL,
  max REAL NOT NULL,
  avg REAL NOT NULL
);

-- Indexes for aggregated metrics
CREATE INDEX IF NOT EXISTS idx_agg_agent_id ON aggregated_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agg_name ON aggregated_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_agg_period ON aggregated_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_agg_agent_name_period ON aggregated_metrics(agent_id, metric_name, period_start);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Initialize database schema
 * @param db - Database instance
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Run schema creation
  db.exec(SCHEMA_SQL);

  // Check and update schema version
  const versionRow = db.prepare(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).get() as { version: number } | undefined;

  if (!versionRow) {
    db.prepare(
      'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
    ).run(CURRENT_SCHEMA_VERSION, new Date().toISOString());
  }
}

/**
 * Create database connection with configuration
 * @param config - Persistence configuration
 * @returns Configured database instance
 */
export function createDatabase(config: Partial<PersistenceConfig> = {}): Database.Database {
  const fullConfig = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };

  // Ensure directory exists
  const path = require('path');
  const fs = require('fs');
  const dir = path.dirname(fullConfig.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(fullConfig.dbPath);

  // Configure database
  if (fullConfig.enableWAL) {
    db.pragma('journal_mode = WAL');
  }
  if (fullConfig.busyTimeout) {
    db.pragma(`busy_timeout = ${fullConfig.busyTimeout}`);
  }

  // Initialize schema
  initializeSchema(db);

  return db;
}

/**
 * Close database connection safely
 * @param db - Database instance to close
 */
export function closeDatabase(db: Database.Database): void {
  try {
    db.close();
  } catch (error) {
    // Database may already be closed
  }
}
