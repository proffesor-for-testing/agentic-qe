/**
 * Cloud Sync Interfaces
 *
 * Defines the contracts for syncing local AQE learning data to cloud PostgreSQL.
 * Consolidates data from 6+ local sources into unified cloud storage.
 */

/**
 * Sync configuration for connecting local sources to cloud
 */
export interface SyncConfig {
  /** All local data sources (fragmented across system) */
  local: LocalDataSources;

  /** Cloud PostgreSQL configuration */
  cloud: CloudConfig;

  /** Sync behavior settings */
  sync: SyncSettings;

  /** Environment identifier */
  environment: string;
}

/**
 * Local data source paths
 */
export interface LocalDataSources {
  /** PRIMARY - V3 active runtime database */
  v3MemoryDb: string;

  /** HISTORICAL - Root v2 memory database */
  rootMemoryDb: string;

  /** CLAUDE-FLOW - JSON memory store */
  claudeFlowMemory: string;

  /** CLAUDE-FLOW - Daemon state */
  claudeFlowDaemon: string;

  /** CLAUDE-FLOW - Metrics directory */
  claudeFlowMetrics: string;

  /** Q-LEARNING - Intelligence patterns */
  intelligenceJson: string;

  /** LEGACY - Swarm memory database */
  swarmMemoryDb?: string;

  /** LEGACY - V2 patterns database */
  v2PatternsDb?: string;
}

/**
 * Cloud PostgreSQL configuration
 */
export interface CloudConfig {
  /** GCP project ID */
  project: string;

  /** GCP zone */
  zone: string;

  /** Cloud SQL instance name */
  instance: string;

  /** Database name */
  database: string;

  /** Database user */
  user: string;

  /** IAP tunnel port */
  tunnelPort: number;

  /** Connection string (computed from above or direct) */
  connectionString?: string;
}

/**
 * Sync behavior settings
 */
export interface SyncSettings {
  /** Sync mode */
  mode: SyncMode;

  /** Sync interval (e.g., '5m', '1h') */
  interval: string;

  /** Batch size for records */
  batchSize: number;

  /** Source priority (higher = sync first) */
  sourcePriority: Record<string, number>;

  /** Sources to sync */
  sources: SyncSource[];

  /** Enable dry run (no writes) */
  dryRun?: boolean;

  /** Conflict resolution strategy */
  conflictResolution: ConflictResolution;
}

/**
 * Sync modes
 */
export type SyncMode = 'full' | 'incremental' | 'bidirectional' | 'append';

/**
 * Conflict resolution strategies
 */
export type ConflictResolution =
  | 'local-wins'      // Local data always wins
  | 'cloud-wins'      // Cloud data always wins
  | 'newer-wins'      // More recent timestamp wins
  | 'higher-confidence' // Higher confidence score wins
  | 'merge';          // Merge with weighted averages

/**
 * Individual sync source configuration
 */
export interface SyncSource {
  /** Source name (for logging) */
  name: string;

  /** Source type */
  type: 'sqlite' | 'json';

  /** File path */
  path: string;

  /** Target cloud table */
  targetTable: string;

  /** Priority level */
  priority: 'high' | 'medium' | 'low';

  /** Sync mode for this source */
  mode: SyncMode;

  /** Custom transform function name */
  transform?: string;

  /** Source-specific query (for SQLite) */
  query?: string;

  /** JSON path (for JSON sources) */
  jsonPath?: string;

  /** Whether this source is enabled */
  enabled?: boolean;
}

/**
 * Sync result
 */
export interface SyncResult {
  /** Whether sync was successful */
  success: boolean;

  /** Table that was synced */
  table: string;

  /** Source that was synced */
  source: string;

  /** Number of records synced */
  recordsSynced: number;

  /** Number of conflicts resolved */
  conflictsResolved: number;

  /** Number of records skipped */
  recordsSkipped: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;

  /** Warnings */
  warnings?: string[];
}

/**
 * Full sync report
 */
export interface SyncReport {
  /** Sync ID */
  syncId: string;

  /** Start time */
  startedAt: Date;

  /** End time */
  completedAt?: Date;

  /** Overall status */
  status: 'running' | 'completed' | 'failed' | 'partial';

  /** Environment that was synced */
  environment: string;

  /** Sync mode used */
  mode: SyncMode;

  /** Results per table */
  results: SyncResult[];

  /** Total records synced */
  totalRecordsSynced: number;

  /** Total conflicts resolved */
  totalConflictsResolved: number;

  /** Total duration */
  totalDurationMs: number;

  /** Errors encountered */
  errors: string[];
}

/**
 * Data reader interface for local sources
 */
export interface DataReader<T = unknown> {
  /** Reader name */
  readonly name: string;

  /** Source type */
  readonly type: 'sqlite' | 'json';

  /** Initialize the reader */
  initialize(): Promise<void>;

  /** Read all records */
  readAll(): Promise<T[]>;

  /** Read records changed since timestamp */
  readChanged(since: Date): Promise<T[]>;

  /** Get record count */
  count(): Promise<number>;

  /** Close the reader */
  close(): Promise<void>;
}

/**
 * Cloud writer interface
 */
export interface CloudWriter {
  /** Connect to cloud database */
  connect(): Promise<void>;

  /** Begin a transaction */
  beginTransaction(): Promise<void>;

  /** Commit transaction */
  commit(): Promise<void>;

  /** Rollback transaction */
  rollback(): Promise<void>;

  /** Upsert records to a table */
  upsert<T>(table: string, records: T[], options?: UpsertOptions): Promise<number>;

  /** Execute raw SQL */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** Query records */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Close connection */
  close(): Promise<void>;
}

/**
 * Upsert options
 */
export interface UpsertOptions {
  /** Conflict columns for ON CONFLICT */
  conflictColumns?: string[];

  /** Update columns on conflict */
  updateColumns?: string[];

  /** Skip if exists (no update) */
  skipIfExists?: boolean;
}

/**
 * Tunnel connection info
 */
export interface TunnelConnection {
  /** Local host */
  host: string;

  /** Local port */
  port: number;

  /** Process ID */
  pid?: number;

  /** Started at */
  startedAt: Date;
}

/**
 * Embedding generator interface
 */
export interface EmbeddingGenerator {
  /** Generate embedding for text */
  generate(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts */
  generateBatch(texts: string[]): Promise<number[][]>;

  /** Embedding dimension */
  readonly dimension: number;
}

/**
 * Pull source configuration (cloud → local)
 */
export interface PullSource {
  /** Source name (for logging) */
  name: string;

  /** Cloud table to read from (e.g., 'aqe.qe_patterns') */
  cloudTable: string;

  /** Local SQLite table to write to */
  localTable: string;

  /** Whether this source is enabled */
  enabled: boolean;

  /** Priority level */
  priority: 'high' | 'medium' | 'low';

  /** Pull mode */
  mode: 'full' | 'incremental' | 'append';

  /** Column renames: cloud column → local column */
  columnMap?: Record<string, string>;

  /** Columns to strip from cloud records before local insert */
  dropColumns?: string[];

  /** Type transforms for specific columns */
  transforms?: Record<string, 'boolean-to-int' | 'jsonb-to-text' | 'timestamptz-to-text'>;
}

/**
 * Pull sync configuration
 */
export interface PullConfig {
  /** Cloud database config */
  cloud: CloudConfig;

  /** Environment to filter by (or 'all' for cross-env) */
  environment: string;

  /** Pull sources */
  sources: PullSource[];

  /** Batch size for reads */
  batchSize: number;

  /** Dry run (no writes) */
  dryRun?: boolean;

  /** Target local DB path (defaults to .agentic-qe/memory.db) */
  targetDb?: string;

  /** Only pull specific tables */
  tables?: string[];
}

/**
 * Default pull configuration
 *
 * Maps cloud PostgreSQL tables back to local SQLite tables.
 * Reverses the push column mappings from DEFAULT_SYNC_CONFIG.
 */
export const DEFAULT_PULL_CONFIG: PullConfig = {
  cloud: {
    project: process.env.GCP_PROJECT || '',
    zone: process.env.GCP_ZONE || '',
    instance: process.env.GCP_INSTANCE || '',
    database: process.env.GCP_DATABASE || '',
    user: process.env.GCP_USER || '',
    tunnelPort: parseInt(process.env.GCP_TUNNEL_PORT || '15432', 10),
  },
  environment: process.env.AQE_ENV || 'all',
  batchSize: 1000,
  sources: [
    // QE Patterns (cloud 0 records, but may grow)
    {
      name: 'qe-patterns',
      cloudTable: 'aqe.qe_patterns',
      localTable: 'qe_patterns',
      enabled: true,
      priority: 'high',
      mode: 'incremental',
      dropColumns: ['source_env', 'embedding', 'sync_version'],
      transforms: { reusable: 'boolean-to-int' },
    },
    // SONA patterns (873 records)
    {
      name: 'sona-patterns',
      cloudTable: 'aqe.sona_patterns',
      localTable: 'sona_patterns',
      enabled: true,
      priority: 'high',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      transforms: {
        is_active: 'boolean-to-int',
        requires_fine_tuning: 'boolean-to-int',
      },
    },
    // GOAP actions (2,335 records)
    {
      name: 'goap-actions',
      cloudTable: 'aqe.goap_actions',
      localTable: 'goap_actions',
      enabled: true,
      priority: 'high',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      columnMap: { duration_estimate: 'estimated_duration_ms' },
    },
    // GOAP plans (91 records)
    {
      name: 'goap-plans',
      cloudTable: 'aqe.goap_plans',
      localTable: 'goap_plans',
      enabled: true,
      priority: 'medium',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      columnMap: { estimated_duration: 'estimated_duration_ms' },
    },
    // Memory entries → kv_store (0 records in cloud currently)
    {
      name: 'memory-entries',
      cloudTable: 'aqe.memory_entries',
      localTable: 'kv_store',
      enabled: true,
      priority: 'high',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      columnMap: { partition: 'namespace' },
    },
    // Learning experiences → captured_experiences (7,702 records)
    // Drop 'id' because cloud uses SERIAL auto-increment, local uses UUID
    // Map 'created_at' → 'started_at' since push mapped started_at → created_at
    {
      name: 'learning-experiences',
      cloudTable: 'aqe.learning_experiences',
      localTable: 'captured_experiences',
      enabled: true,
      priority: 'high',
      mode: 'append',
      dropColumns: ['id', 'source_env', 'sync_version'],
      columnMap: {
        agent_id: 'agent',
        task_id: 'task',
        task_type: 'domain',
        state: 'result_json',
        action: 'steps_json',
        reward: 'quality',
        next_state: 'routing_json',
        episode_id: 'tags',
        created_at: 'started_at',
      },
    },
    // Q-learning patterns → rl_q_values (3 records)
    {
      name: 'qlearning-patterns',
      cloudTable: 'aqe.qlearning_patterns',
      localTable: 'rl_q_values',
      enabled: true,
      priority: 'medium',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      columnMap: {
        state: 'state_key',
        action: 'action_key',
        last_update: 'updated_at',
      },
    },
    // Routing outcomes (186 records)
    {
      name: 'routing-outcomes',
      cloudTable: 'aqe.routing_outcomes',
      localTable: 'routing_outcomes',
      enabled: true,
      priority: 'medium',
      mode: 'append',
      dropColumns: ['source_env', 'sync_version'],
    },
    // QE trajectories (0 records in cloud currently)
    {
      name: 'qe-trajectories',
      cloudTable: 'aqe.qe_trajectories',
      localTable: 'qe_trajectories',
      enabled: true,
      priority: 'medium',
      mode: 'append',
      dropColumns: ['source_env', 'sync_version', 'embedding'],
    },
    // Dream insights (680 records)
    {
      name: 'dream-insights',
      cloudTable: 'aqe.dream_insights',
      localTable: 'dream_insights',
      enabled: true,
      priority: 'low',
      mode: 'append',
      dropColumns: ['source_env', 'sync_version'],
    },
    // Claude-Flow memory (2 records in cloud)
    // Push syncs from JSON file; pull writes to kv_store since local has no dedicated table
    {
      name: 'claude-flow-memory',
      cloudTable: 'aqe.claude_flow_memory',
      localTable: 'kv_store',
      enabled: true,
      priority: 'low',
      mode: 'incremental',
      dropColumns: ['source_env', 'sync_version'],
      columnMap: { partition: 'namespace' },
    },
    // NOTE: intelligence-qlearning (JSON push source) is NOT pulled back —
    // the cloud qlearning_patterns table is already pulled via the qlearning-patterns source above.
  ],
};

/**
 * SQLite to PostgreSQL type mapping
 */
export const TYPE_MAPPING: Record<string, string> = {
  'TEXT': 'TEXT',
  'INTEGER': 'INTEGER',
  'REAL': 'REAL',
  'BLOB': 'BYTEA',
  'NULL': 'NULL',
};

/**
 * Default sync configuration
 *
 * CONSOLIDATION NOTE (2026-01-30):
 * All data is now consolidated in ROOT database: .agentic-qe/memory.db
 * - MCP server writes here via findProjectRoot()
 * - V3 runtime writes here via kernel.ts findProjectRoot()
 * - Legacy v3 databases are DEPRECATED (data merged to root)
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  local: {
    // PRIMARY: Root database (consolidated, MCP-active)
    // Paths relative to process.cwd() which is the project root
    v3MemoryDb: './.agentic-qe/memory.db',
    rootMemoryDb: './.agentic-qe/memory.db',
    claudeFlowMemory: './.claude-flow/memory/store.json',
    claudeFlowDaemon: './.claude-flow/daemon-state.json',
    claudeFlowMetrics: './.claude-flow/metrics/',
    intelligenceJson: './.ruvector/intelligence.json',
    swarmMemoryDb: './.swarm/memory.db',
    v2PatternsDb: '', // v2 removed — no longer available
  },
  cloud: {
    project: process.env.GCP_PROJECT || '',
    zone: process.env.GCP_ZONE || '',
    instance: process.env.GCP_INSTANCE || '',
    database: process.env.GCP_DATABASE || '',
    user: process.env.GCP_USER || '',
    tunnelPort: parseInt(process.env.GCP_TUNNEL_PORT || '15432', 10),
  },
  sync: {
    mode: 'incremental',
    interval: '1h',
    batchSize: 1000,
    conflictResolution: 'newer-wins',
    sourcePriority: {
      qePatterns: 1,        // Primary QE learning data (12K+ records)
      sonaPatterns: 2,      // Neural backbone patterns
      goapActions: 3,       // Planning primitives
      kvStore: 4,           // Key-value memory entries
      experiences: 5,       // Captured RL experiences
      claudeFlowMemory: 6,
      intelligenceJson: 7,
    },
    sources: [
      // ============================================================
      // ROOT Memory - PRIMARY (Consolidated database)
      // All tables in single database: .agentic-qe/memory.db
      //
      // NOTE (2026-02-20): Post-consolidation table mapping:
      //   OLD v2 tables (removed)  →  NEW v3 tables (actual)
      //   memory_entries           →  kv_store
      //   learning_experiences     →  captured_experiences
      //   patterns                 →  qe_patterns (absorbed)
      //   events                   →  (removed, use dream_cycles/routing_outcomes)
      // ============================================================

      // QE Patterns - PRIMARY learning data (12,150+ records)
      // Explicit columns to match cloud schema exactly
      {
        name: 'root-qe-patterns',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.qe_patterns',
        priority: 'high',
        mode: 'incremental',
        query: "SELECT id, pattern_type, qe_domain, domain, name, description, confidence, usage_count, success_rate, quality_score, tier, template_json, context_json, successful_uses, created_at, updated_at, last_used_at, tokens_used, input_tokens, output_tokens, latency_ms, reusable, reuse_count, average_token_savings, total_tokens_saved FROM qe_patterns",
        enabled: true,
      },
      // SONA neural patterns (731+ records)
      {
        name: 'root-sona-patterns',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.sona_patterns',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM sona_patterns',
        enabled: true,
      },
      // GOAP actions (2,243+ records)
      {
        name: 'root-goap-actions',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.goap_actions',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM goap_actions',
        enabled: true,
      },
      // KV Store → cloud memory_entries (1,619+ records)
      // Only sync entries with valid JSON values (skip corrupt/HTML-embedded data)
      {
        name: 'root-kv-store',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.memory_entries',
        priority: 'high',
        mode: 'incremental',
        query: "SELECT key, namespace as partition, CASE WHEN json_valid(value) THEN value ELSE json_quote(value) END as value, created_at, expires_at FROM kv_store WHERE json_valid(value) OR json_valid(json_quote(value))",
        enabled: true,
      },
      // Captured experiences → cloud learning_experiences (854+ records)
      // Cloud id is SERIAL (auto-increment) — omit local UUID id
      {
        name: 'root-captured-experiences',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.learning_experiences',
        priority: 'high',
        mode: 'append',
        query: "SELECT agent as agent_id, task as task_id, domain as task_type, COALESCE(result_json, '{}') as state, COALESCE(steps_json, '{}') as action, quality as reward, COALESCE(routing_json, '{}') as next_state, tags as episode_id, started_at as created_at FROM captured_experiences",
        enabled: true,
      },
      // GOAP plans (91+ records)
      {
        name: 'root-goap-plans',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.goap_plans',
        priority: 'medium',
        mode: 'incremental',
        query: "SELECT id, goal_id, action_sequence as sequence, initial_state, goal_state, action_sequence, total_cost, estimated_duration_ms as estimated_duration, status, created_at, completed_at FROM goap_plans",
        enabled: true,
      },
      // RL Q-values (from SQLite, not JSON)
      // Use DISTINCT to avoid duplicate (state, action) pairs in same batch
      {
        name: 'root-rl-q-values',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.qlearning_patterns',
        priority: 'medium',
        mode: 'incremental',
        query: "SELECT DISTINCT state_key as state, action_key as action, q_value, visits, updated_at as last_update, created_at FROM rl_q_values GROUP BY state_key, action_key",
        enabled: true,
      },
      // Routing outcomes (184+ records) - model routing decisions
      {
        name: 'root-routing-outcomes',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.routing_outcomes',
        priority: 'medium',
        mode: 'append',
        query: 'SELECT * FROM routing_outcomes',
        enabled: true,
      },
      // QE trajectories (320+ records) - execution traces
      {
        name: 'root-qe-trajectories',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.qe_trajectories',
        priority: 'medium',
        mode: 'append',
        query: 'SELECT * FROM qe_trajectories',
        enabled: true,
      },
      // Dream insights (660+ records) - consolidation results
      {
        name: 'root-dream-insights',
        type: 'sqlite',
        path: './.agentic-qe/memory.db',
        targetTable: 'aqe.dream_insights',
        priority: 'low',
        mode: 'append',
        query: 'SELECT * FROM dream_insights',
        enabled: true,
      },
      // Claude-Flow Memory (JSON)
      {
        name: 'claude-flow-memory',
        type: 'json',
        path: './.claude-flow/memory/store.json',
        targetTable: 'aqe.claude_flow_memory',
        priority: 'medium',
        mode: 'full',
        enabled: true,
      },
      // Intelligence JSON (Q-Learning)
      {
        name: 'intelligence-qlearning',
        type: 'json',
        path: './.ruvector/intelligence.json',
        targetTable: 'aqe.qlearning_patterns',
        priority: 'low',
        mode: 'full',
        jsonPath: '$.qvalues',
        enabled: true,
      },
    ],
  },
  environment: process.env.AQE_ENV || 'devpod',
};
