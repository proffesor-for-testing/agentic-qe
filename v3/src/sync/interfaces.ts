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
 * - v3/.agentic-qe/memory.db is DEPRECATED (data merged to root)
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  local: {
    // PRIMARY: Root database (consolidated, MCP-active)
    v3MemoryDb: '../.agentic-qe/memory.db',      // Now points to root (consolidated)
    rootMemoryDb: '../.agentic-qe/memory.db',    // Same as above
    claudeFlowMemory: '../.claude-flow/memory/store.json',
    claudeFlowDaemon: '../.claude-flow/daemon-state.json',
    claudeFlowMetrics: '../.claude-flow/metrics/',
    intelligenceJson: '../v3/.ruvector/intelligence.json',
    swarmMemoryDb: '../.swarm/memory.db',
    v2PatternsDb: '../v2/data/ruvector-patterns.db',
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
      rootMemory: 1,        // Root is now PRIMARY (consolidated)
      claudeFlowMemory: 2,
      intelligenceJson: 3,
      legacy: 4,
    },
    sources: [
      // ============================================================
      // ROOT Memory - PRIMARY (Consolidated from V3 + Historical)
      // All tables now in single database: .agentic-qe/memory.db
      // ============================================================
      {
        name: 'root-sona-patterns',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.sona_patterns',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM sona_patterns',
        enabled: true,
      },
      {
        name: 'root-goap-actions',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.goap_actions',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM goap_actions',
        enabled: true,
      },
      {
        name: 'root-memory-entries',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.memory_entries',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM memory_entries',
        enabled: true,
      },
      {
        name: 'root-learning-experiences',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.learning_experiences',
        priority: 'high',
        mode: 'append',
        query: 'SELECT * FROM learning_experiences',
        enabled: true,
      },
      {
        name: 'root-patterns',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.patterns',
        priority: 'medium',
        mode: 'incremental',
        query: 'SELECT * FROM patterns',
        enabled: true,
      },
      {
        name: 'root-events',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.events',
        priority: 'low',
        mode: 'append',
        query: 'SELECT * FROM events',
        enabled: true,
      },
      // Claude-Flow Memory (JSON)
      {
        name: 'claude-flow-memory',
        type: 'json',
        path: '../.claude-flow/memory/store.json',
        targetTable: 'aqe.claude_flow_memory',
        priority: 'medium',
        mode: 'full',
        enabled: true,
      },
      // Intelligence JSON (Q-Learning)
      {
        name: 'intelligence-qlearning',
        type: 'json',
        path: '../v3/.ruvector/intelligence.json',
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
