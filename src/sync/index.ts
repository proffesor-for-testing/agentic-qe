/**
 * Cloud Sync Module
 *
 * Exports all cloud sync functionality for AQE learning data.
 *
 * @example
 * ```typescript
 * import { syncToCloud, createSyncAgent } from 'agentic-qe/sync';
 *
 * // Quick sync
 * const report = await syncToCloud({ environment: 'devpod' });
 *
 * // Advanced usage
 * const agent = createSyncAgent({
 *   environment: 'devpod',
 *   verbose: true,
 *   sync: {
 *     mode: 'incremental',
 *     batchSize: 500,
 *   },
 * });
 * await agent.initialize();
 * const report = await agent.syncAll();
 * await agent.close();
 * ```
 */

// Interfaces and types
export type {
  SyncConfig,
  LocalDataSources,
  CloudConfig,
  SyncSettings,
  SyncMode,
  ConflictResolution,
  SyncSource,
  SyncResult,
  SyncReport,
  DataReader,
  CloudWriter,
  UpsertOptions,
  TunnelConnection,
  EmbeddingGenerator,
  PullSource,
  PullConfig,
} from './interfaces.js';

export { DEFAULT_SYNC_CONFIG, DEFAULT_PULL_CONFIG, TYPE_MAPPING } from './interfaces.js';

// Readers
export {
  SQLiteReader,
  createSQLiteReader,
  type SQLiteReaderConfig,
  type SQLiteRecord,
} from './readers/sqlite-reader.js';

export {
  JSONReader,
  createJSONReader,
  type JSONReaderConfig,
  type JSONRecord,
} from './readers/json-reader.js';

// Cloud connectivity
export type { TunnelManager } from './cloud/tunnel-manager.js';
export {
  IAPTunnelManager,
  DirectConnectionManager,
  createTunnelManager,
  createConnectionManager,
} from './cloud/tunnel-manager.js';

export {
  PostgresWriter,
  createPostgresWriter,
  type PostgresWriterConfig,
} from './cloud/postgres-writer.js';

export {
  PostgresReader,
  createPostgresReader,
  type PostgresReaderConfig,
} from './cloud/postgres-reader.js';

// Writers
export {
  SQLiteWriter,
  createSQLiteWriter,
  type SQLiteWriterConfig,
} from './writers/sqlite-writer.js';

// Sync agent (push: local → cloud)
export {
  CloudSyncAgent,
  createSyncAgent,
  syncToCloud,
  syncIncrementalToCloud,
  type SyncAgentConfig,
  type SourceStatus,
  type VerifyResult,
  type VerifyTableResult,
} from './sync-agent.js';

// Pull agent (pull: cloud → local)
export {
  PullSyncAgent,
  createPullSyncAgent,
  pullFromCloud,
  pullIncrementalFromCloud,
  type PullAgentConfig,
  type PullVerifyResult,
  type PullVerifyTableResult,
} from './pull-agent.js';

// Embeddings (Phase 3)
export {
  SyncEmbeddingGenerator,
  createSyncEmbeddingGenerator,
  type PatternRecord,
  type PatternEmbeddingResult,
  type EmbeddingBatchStats,
} from './embeddings/index.js';
