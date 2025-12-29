/**
 * All Database Migrations
 *
 * Each migration handles a specific schema change.
 * Migrations are applied in order by version number.
 *
 * IMPORTANT: Never modify an existing migration after it's been released.
 * Always create a new migration for schema changes.
 *
 * @module persistence/migrations/all-migrations
 */

import Database from 'better-sqlite3';
import { Migration } from './index';

/**
 * Helper: Check if a table exists
 */
function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return !!row;
}

/**
 * Helper: Check if a column exists in a table
 */
function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some(c => c.name === columnName);
  } catch {
    return false;
  }
}

/**
 * Helper: Safe add column
 */
function safeAddColumn(db: Database.Database, tableName: string, columnName: string, columnDef: string): void {
  if (tableExists(db, tableName) && !columnExists(db, tableName, columnName)) {
    try {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    } catch {
      // Column may already exist with different definition
    }
  }
}

/**
 * Helper: Safe create index
 */
function safeCreateIndex(db: Database.Database, sql: string): void {
  try {
    db.exec(sql);
  } catch {
    // Index may already exist or columns may not exist
  }
}

/**
 * Migration 001: Core Learning Tables
 *
 * Creates the foundational tables for the learning system.
 * These tables store experiences, Q-values, and patterns.
 * Uses defensive checks to handle existing tables with different schemas.
 */
const migration001CoreLearning: Migration = {
  version: 1,
  name: 'core_learning_tables',
  description: 'Create core learning system tables (experiences, q_values, patterns)',
  up: (db: Database.Database) => {
    // Learning experiences - create if not exists
    if (!tableExists(db, 'learning_experiences')) {
      db.exec(`
        CREATE TABLE learning_experiences (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          state TEXT,
          action TEXT,
          reward REAL,
          next_state TEXT,
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learning_exp_agent ON learning_experiences(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learning_exp_created ON learning_experiences(created_at)');

    // Q-values - create if not exists
    if (!tableExists(db, 'q_values')) {
      db.exec(`
        CREATE TABLE q_values (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          state TEXT,
          action TEXT,
          value REAL NOT NULL,
          visits INTEGER DEFAULT 1,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_qvalues_agent ON q_values(agent_id)');
    // Only create unique index if state and action columns exist
    if (columnExists(db, 'q_values', 'state') && columnExists(db, 'q_values', 'action')) {
      safeCreateIndex(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_qvalues_unique ON q_values(agent_id, state, action)');
    }

    // Patterns - create if not exists
    if (!tableExists(db, 'patterns')) {
      db.exec(`
        CREATE TABLE patterns (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          confidence REAL DEFAULT 0.5,
          occurrences INTEGER DEFAULT 1,
          metadata TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_patterns_type ON patterns(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence)');
  }
};

/**
 * Migration 002: Dream System Tables
 *
 * Creates tables for the dream consolidation system.
 * Dreams process experiences during idle periods.
 */
const migration002DreamSystem: Migration = {
  version: 2,
  name: 'dream_system_tables',
  description: 'Create dream system tables (cycles, insights, concepts)',
  up: (db: Database.Database) => {
    // Dream cycles - tracks dream consolidation sessions
    if (!tableExists(db, 'dream_cycles')) {
      db.exec(`
        CREATE TABLE dream_cycles (
          id TEXT PRIMARY KEY,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          concepts_processed INTEGER,
          associations_found INTEGER,
          insights_generated INTEGER,
          status TEXT NOT NULL DEFAULT 'running',
          error TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
    } else {
      // Add missing columns to existing table
      safeAddColumn(db, 'dream_cycles', 'status', "TEXT DEFAULT 'running'");
      safeAddColumn(db, 'dream_cycles', 'duration', 'INTEGER');
      safeAddColumn(db, 'dream_cycles', 'concepts_processed', 'INTEGER');
      safeAddColumn(db, 'dream_cycles', 'associations_found', 'INTEGER');
      safeAddColumn(db, 'dream_cycles', 'insights_generated', 'INTEGER');
      safeAddColumn(db, 'dream_cycles', 'error', 'TEXT');
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_dream_cycle_status ON dream_cycles(status)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_dream_cycle_time ON dream_cycles(start_time)');

    // Dream insights - patterns discovered during dreams
    if (!tableExists(db, 'dream_insights')) {
      db.exec(`
        CREATE TABLE dream_insights (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT,
          description TEXT NOT NULL,
          associated_concepts TEXT,
          novelty_score REAL DEFAULT 0.5,
          confidence_score REAL DEFAULT 0.5,
          actionable INTEGER DEFAULT 0,
          suggested_action TEXT,
          target_agent_types TEXT,
          priority TEXT DEFAULT 'medium',
          status TEXT DEFAULT 'pending',
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          applied_at INTEGER,
          outcome TEXT
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_dream_insights_type ON dream_insights(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_dream_insights_status ON dream_insights(status)');

    // Concept nodes - knowledge graph nodes
    if (!tableExists(db, 'concept_nodes')) {
      db.exec(`
        CREATE TABLE concept_nodes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          embedding TEXT,
          activation_level REAL DEFAULT 0.0,
          last_activated INTEGER,
          metadata TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_concept_nodes_type ON concept_nodes(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_concept_nodes_activation ON concept_nodes(activation_level)');

    // Concept edges - knowledge graph relationships
    if (!tableExists(db, 'concept_edges')) {
      db.exec(`
        CREATE TABLE concept_edges (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          target TEXT NOT NULL,
          weight REAL DEFAULT 1.0,
          type TEXT DEFAULT 'related',
          evidence TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_concept_edges_source ON concept_edges(source)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_concept_edges_target ON concept_edges(target)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_concept_edges_type ON concept_edges(type)');

    // Synthesized patterns - patterns created by combining others
    if (!tableExists(db, 'synthesized_patterns')) {
      db.exec(`
        CREATE TABLE synthesized_patterns (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          description TEXT NOT NULL,
          conditions TEXT,
          actions TEXT,
          confidence REAL DEFAULT 0.5,
          supporting_experiences TEXT,
          effectiveness REAL,
          agent_types TEXT,
          task_types TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_synth_patterns_type ON synthesized_patterns(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_synth_patterns_confidence ON synthesized_patterns(confidence)');
  }
};

/**
 * Migration 003: Transfer Learning Tables
 *
 * Creates tables for knowledge transfer between agents.
 */
const migration003TransferLearning: Migration = {
  version: 3,
  name: 'transfer_learning_tables',
  description: 'Create transfer learning tables (registry, requests, validations)',
  up: (db: Database.Database) => {
    // Transfer registry - tracks what can be transferred
    if (!tableExists(db, 'transfer_registry')) {
      db.exec(`
        CREATE TABLE transfer_registry (
          id TEXT PRIMARY KEY,
          pattern_id TEXT NOT NULL,
          source_agent TEXT NOT NULL,
          target_agent TEXT NOT NULL,
          transfer_id TEXT,
          compatibility_score REAL DEFAULT 0.5,
          validation_passed INTEGER DEFAULT 0,
          transferred_at INTEGER,
          status TEXT DEFAULT 'pending'
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_reg_source ON transfer_registry(source_agent)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_reg_target ON transfer_registry(target_agent)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_reg_status ON transfer_registry(status)');

    // Transfer requests - pending/completed transfers
    if (!tableExists(db, 'transfer_requests')) {
      db.exec(`
        CREATE TABLE transfer_requests (
          id TEXT PRIMARY KEY,
          source_agent TEXT NOT NULL,
          target_agent TEXT NOT NULL,
          pattern_ids TEXT,
          priority TEXT DEFAULT 'medium',
          reason TEXT,
          requested_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          requested_by TEXT,
          status TEXT DEFAULT 'pending',
          result TEXT,
          completed_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_req_status ON transfer_requests(status)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_req_source ON transfer_requests(source_agent)');

    // Transfer validations - validation results
    if (!tableExists(db, 'transfer_validations')) {
      db.exec(`
        CREATE TABLE transfer_validations (
          id TEXT PRIMARY KEY,
          transfer_id TEXT NOT NULL,
          validation_type TEXT NOT NULL,
          passed INTEGER DEFAULT 0,
          score REAL,
          details TEXT,
          validated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_transfer_val_transfer ON transfer_validations(transfer_id)');

    // Captured experiences - raw experience capture before processing
    if (!tableExists(db, 'captured_experiences')) {
      db.exec(`
        CREATE TABLE captured_experiences (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          action TEXT NOT NULL,
          context TEXT,
          outcome TEXT,
          reward REAL,
          captured_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          processed INTEGER DEFAULT 0
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_captured_exp_agent ON captured_experiences(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_captured_exp_processed ON captured_experiences(processed)');

    // Baselines - performance baselines for agents
    if (!tableExists(db, 'baselines')) {
      db.exec(`
        CREATE TABLE baselines (
          id TEXT PRIMARY KEY,
          metric_name TEXT NOT NULL,
          agent_type TEXT,
          baseline_value REAL NOT NULL,
          sample_size INTEGER DEFAULT 0,
          collected_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_baselines_metric ON baselines(metric_name)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_baselines_agent ON baselines(agent_type)');
  }
};

/**
 * Migration 004: GOAP Planning Tables
 *
 * Creates tables for Goal-Oriented Action Planning.
 */
const migration004GOAPPlanning: Migration = {
  version: 4,
  name: 'goap_planning_tables',
  description: 'Create GOAP planning tables (goals, actions, plans, execution)',
  up: (db: Database.Database) => {
    // GOAP goals
    if (!tableExists(db, 'goap_goals')) {
      db.exec(`
        CREATE TABLE goap_goals (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          conditions TEXT NOT NULL,
          priority REAL DEFAULT 1.0,
          deadline INTEGER,
          status TEXT DEFAULT 'pending',
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          completed_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_goals_status ON goap_goals(status)');

    // GOAP actions
    if (!tableExists(db, 'goap_actions')) {
      db.exec(`
        CREATE TABLE goap_actions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          preconditions TEXT NOT NULL,
          effects TEXT NOT NULL,
          cost REAL DEFAULT 1.0,
          duration_estimate INTEGER,
          success_rate REAL DEFAULT 1.0,
          execution_count INTEGER DEFAULT 0,
          category TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_actions_category ON goap_actions(category)');

    // GOAP plans
    if (!tableExists(db, 'goap_plans')) {
      db.exec(`
        CREATE TABLE goap_plans (
          id TEXT PRIMARY KEY,
          goal_id TEXT,
          actions TEXT NOT NULL,
          total_cost REAL,
          estimated_duration INTEGER,
          status TEXT DEFAULT 'pending',
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          started_at INTEGER,
          completed_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_plans_goal ON goap_plans(goal_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_plans_status ON goap_plans(status)');

    // GOAP execution steps
    if (!tableExists(db, 'goap_execution_steps')) {
      db.exec(`
        CREATE TABLE goap_execution_steps (
          id TEXT PRIMARY KEY,
          plan_id TEXT NOT NULL,
          action_id TEXT NOT NULL,
          step_order INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          started_at INTEGER,
          completed_at INTEGER,
          result TEXT,
          error TEXT
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_exec_plan ON goap_execution_steps(plan_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_goap_exec_status ON goap_execution_steps(status)');
  }
};

/**
 * Migration 005: Memory and Events Tables
 *
 * Creates tables for memory management and event tracking.
 */
const migration005MemoryEvents: Migration = {
  version: 5,
  name: 'memory_events_tables',
  description: 'Create memory and event tracking tables',
  up: (db: Database.Database) => {
    // Memory entries
    if (!tableExists(db, 'memory_entries')) {
      db.exec(`
        CREATE TABLE memory_entries (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          namespace TEXT DEFAULT 'default',
          agent_id TEXT,
          access_level TEXT DEFAULT 'private',
          expires_at INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_memory_key ON memory_entries(key)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory_entries(namespace)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries(agent_id)');
    // Only create unique index if both columns exist
    if (columnExists(db, 'memory_entries', 'namespace') && columnExists(db, 'memory_entries', 'key')) {
      safeCreateIndex(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_unique ON memory_entries(namespace, key)');
    }

    // Events
    if (!tableExists(db, 'events')) {
      db.exec(`
        CREATE TABLE events (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          agent_id TEXT,
          data TEXT,
          timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)');

    // Hints
    if (!tableExists(db, 'hints')) {
      db.exec(`
        CREATE TABLE hints (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT,
          confidence REAL DEFAULT 0.5,
          applied INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_hints_type ON hints(type)');

    // Sessions
    if (!tableExists(db, 'sessions')) {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          agent_id TEXT,
          started_at INTEGER DEFAULT (strftime('%s', 'now')),
          ended_at INTEGER,
          metadata TEXT
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id)');
  }
};

/**
 * Migration 006: Agent Registry and Performance
 *
 * Creates tables for agent registration and performance tracking.
 */
const migration006AgentSystem: Migration = {
  version: 6,
  name: 'agent_system_tables',
  description: 'Create agent registry and performance tables',
  up: (db: Database.Database) => {
    // Agent registry
    if (!tableExists(db, 'agent_registry')) {
      db.exec(`
        CREATE TABLE agent_registry (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT,
          capabilities TEXT,
          status TEXT DEFAULT 'active',
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          last_active INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_agent_reg_type ON agent_registry(type)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_agent_reg_status ON agent_registry(status)');

    // Performance metrics
    if (!tableExists(db, 'performance_metrics')) {
      db.exec(`
        CREATE TABLE performance_metrics (
          id TEXT PRIMARY KEY,
          agent_id TEXT,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          recorded_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_perf_agent ON performance_metrics(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_perf_metric ON performance_metrics(metric_name)');

    // OODA cycles
    if (!tableExists(db, 'ooda_cycles')) {
      db.exec(`
        CREATE TABLE ooda_cycles (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          observe TEXT,
          orient TEXT,
          decide TEXT,
          act TEXT,
          outcome TEXT,
          started_at INTEGER DEFAULT (strftime('%s', 'now')),
          completed_at INTEGER
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_ooda_agent ON ooda_cycles(agent_id)');
  }
};

/**
 * Migration 007: Learning History and Metrics
 *
 * Creates tables for tracking learning progress over time.
 */
const migration007LearningHistory: Migration = {
  version: 7,
  name: 'learning_history_tables',
  description: 'Create learning history and metrics tables',
  up: (db: Database.Database) => {
    // Learning history
    if (!tableExists(db, 'learning_history')) {
      db.exec(`
        CREATE TABLE learning_history (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          episode INTEGER NOT NULL,
          total_reward REAL,
          steps INTEGER,
          success INTEGER DEFAULT 0,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learn_hist_agent ON learning_history(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learn_hist_episode ON learning_history(episode)');

    // Learning metrics
    if (!tableExists(db, 'learning_metrics')) {
      db.exec(`
        CREATE TABLE learning_metrics (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          metric_name TEXT NOT NULL,
          metric_value REAL NOT NULL,
          context TEXT,
          recorded_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);
    }
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learn_metrics_agent ON learning_metrics(agent_id)');
    safeCreateIndex(db, 'CREATE INDEX IF NOT EXISTS idx_learn_metrics_name ON learning_metrics(metric_name)');
  }
};

/**
 * All migrations in order
 */
export const allMigrations: Migration[] = [
  migration001CoreLearning,
  migration002DreamSystem,
  migration003TransferLearning,
  migration004GOAPPlanning,
  migration005MemoryEvents,
  migration006AgentSystem,
  migration007LearningHistory
];

export default allMigrations;
