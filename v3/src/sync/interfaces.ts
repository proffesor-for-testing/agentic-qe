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
 */
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  local: {
    // Paths are relative to project root (parent of v3/)
    v3MemoryDb: '../v3/.agentic-qe/memory.db',
    rootMemoryDb: '../.agentic-qe/memory.db',
    claudeFlowMemory: '../.claude-flow/memory/store.json',
    claudeFlowDaemon: '../.claude-flow/daemon-state.json',
    claudeFlowMetrics: '../.claude-flow/metrics/',
    intelligenceJson: '../v3/.ruvector/intelligence.json',
    swarmMemoryDb: '../.swarm/memory.db',
    v2PatternsDb: '../v2/data/ruvector-patterns.db',
  },
  cloud: {
    project: process.env.GCP_PROJECT || 'ferrous-griffin-480616-s9',
    zone: process.env.GCP_ZONE || 'us-central1-a',
    instance: process.env.GCP_INSTANCE || 'ruvector-postgres',
    database: process.env.GCP_DATABASE || 'aqe_learning',
    user: process.env.GCP_USER || 'ruvector',
    tunnelPort: parseInt(process.env.GCP_TUNNEL_PORT || '15432', 10),
  },
  sync: {
    mode: 'incremental',
    interval: '1h',
    batchSize: 1000,
    conflictResolution: 'newer-wins',
    sourcePriority: {
      v3Memory: 1,
      claudeFlowMemory: 2,
      rootMemory: 3,
      intelligenceJson: 4,
      legacy: 5,
    },
    sources: [
      // V3 Memory - PRIMARY
      {
        name: 'v3-qe-patterns',
        type: 'sqlite',
        path: '../v3/.agentic-qe/memory.db',
        targetTable: 'aqe.qe_patterns',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM qe_patterns',
        enabled: true,
      },
      {
        name: 'v3-sona-patterns',
        type: 'sqlite',
        path: '../v3/.agentic-qe/memory.db',
        targetTable: 'aqe.sona_patterns',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM sona_patterns',
        enabled: true,
      },
      {
        name: 'v3-goap-actions',
        type: 'sqlite',
        path: '../v3/.agentic-qe/memory.db',
        targetTable: 'aqe.goap_actions',
        priority: 'high',
        mode: 'incremental',
        query: 'SELECT * FROM goap_actions',
        enabled: true,
      },
      // Claude-Flow Memory
      {
        name: 'claude-flow-memory',
        type: 'json',
        path: '../.claude-flow/memory/store.json',
        targetTable: 'aqe.claude_flow_memory',
        priority: 'high',
        mode: 'full',
        enabled: true,
      },
      // Root Memory - HISTORICAL
      {
        name: 'root-memory-entries',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.memory_entries',
        priority: 'medium',
        mode: 'incremental',
        query: 'SELECT * FROM memory_entries',
        enabled: true,
      },
      {
        name: 'root-learning-experiences',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.learning_experiences',
        priority: 'medium',
        mode: 'append',
        query: 'SELECT * FROM learning_experiences',
        enabled: true,
      },
      {
        name: 'root-goap-actions',
        type: 'sqlite',
        path: '../.agentic-qe/memory.db',
        targetTable: 'aqe.goap_actions',
        priority: 'medium',
        mode: 'incremental',
        query: 'SELECT * FROM goap_actions',
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
      // Intelligence JSON
      {
        name: 'intelligence-qlearning',
        type: 'json',
        path: '../v3/.ruvector/intelligence.json',
        targetTable: 'aqe.qlearning_patterns',
        priority: 'medium',
        mode: 'full',
        jsonPath: '$.qvalues',
        enabled: true,
      },
    ],
  },
  environment: process.env.AQE_ENV || 'devpod',
};
