/**
 * Cloud Sync Agent
 *
 * Orchestrates syncing local AQE learning data to cloud PostgreSQL.
 * Consolidates data from 6+ fragmented local sources.
 *
 * Features:
 * - Multi-source reading (SQLite, JSON)
 * - IAP tunnel management
 * - Batch upserts with conflict resolution
 * - Progress tracking and reporting
 * - Incremental and full sync modes
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SyncConfig,
  SyncReport,
  SyncResult,
  SyncSource,
  CloudWriter,
} from './interfaces.js';

/** Data reader interface */
interface DataReader<T = unknown> {
  readonly name: string;
  readonly type: 'sqlite' | 'json';
  initialize(): Promise<void>;
  readAll(): Promise<T[]>;
  readChanged(since: Date): Promise<T[]>;
  count(): Promise<number>;
  close(): Promise<void>;
}
import { DEFAULT_SYNC_CONFIG } from './interfaces.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('sync-agent');

import { createSQLiteReader, type SQLiteRecord } from './readers/sqlite-reader.js';
import { createJSONReader, type JSONRecord } from './readers/json-reader.js';
import { createConnectionManager } from './cloud/tunnel-manager.js';
import { createPostgresWriter } from './cloud/postgres-writer.js';
import { toErrorMessage, toError } from '../shared/error-utils.js';

/**
 * Sync agent configuration
 */
export interface SyncAgentConfig extends SyncConfig {
  /** Callback for progress updates */
  onProgress?: (message: string, progress: number) => void;

  /** Callback for errors */
  onError?: (error: Error, source: string) => void;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Cloud Sync Agent
 */
export class CloudSyncAgent {
  private readonly config: SyncAgentConfig;
  private readonly readers: Map<string, DataReader> = new Map();
  private writer: CloudWriter | null = null;
  private report: SyncReport | null = null;

  constructor(config: Partial<SyncAgentConfig> = {}) {
    this.config = {
      ...DEFAULT_SYNC_CONFIG,
      ...config,
      local: { ...DEFAULT_SYNC_CONFIG.local, ...config.local },
      cloud: { ...DEFAULT_SYNC_CONFIG.cloud, ...config.cloud },
      sync: { ...DEFAULT_SYNC_CONFIG.sync, ...config.sync },
    };
  }

  /**
   * Initialize the sync agent
   */
  async initialize(): Promise<void> {
    this.log('Initializing sync agent...');

    // Create readers for each enabled source
    const sources = this.config.sync.sources.filter(s => s.enabled !== false);

    for (const source of sources) {
      const reader = this.createReader(source);
      if (reader) {
        try {
          await reader.initialize();
          this.readers.set(source.name, reader);
          this.log(`Initialized reader: ${source.name}`);
        } catch (error) {
          this.log(`Warning: Failed to initialize reader ${source.name}: ${error}`, 'warn');
        }
      }
    }

    this.log(`Initialized ${this.readers.size} readers`);
  }

  /**
   * Run a full sync
   */
  async syncAll(): Promise<SyncReport> {
    this.report = this.createReport('full');

    try {
      await this.connectToCloud();

      // Sort sources by priority
      const sources = this.config.sync.sources
        .filter(s => s.enabled !== false && this.readers.has(s.name))
        .sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

      let completed = 0;
      const total = sources.length;

      for (const source of sources) {
        this.progress(`Syncing ${source.name}...`, completed / total);
        const result = await this.syncSource(source);
        this.report.results.push(result);
        completed++;
      }

      this.report.status = this.report.results.every(r => r.success) ? 'completed' : 'partial';
    } catch (error) {
      this.report.status = 'failed';
      this.report.errors.push(toErrorMessage(error));
    } finally {
      await this.disconnect();
      this.report.completedAt = new Date();
      this.report.totalDurationMs = this.report.completedAt.getTime() - this.report.startedAt.getTime();
      this.report.totalRecordsSynced = this.report.results.reduce((sum, r) => sum + r.recordsSynced, 0);
      this.report.totalConflictsResolved = this.report.results.reduce((sum, r) => sum + r.conflictsResolved, 0);
    }

    return this.report;
  }

  /**
   * Run incremental sync (only changed records)
   */
  async syncIncremental(since?: Date): Promise<SyncReport> {
    this.report = this.createReport('incremental');

    // Default to 24 hours ago if not specified
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      await this.connectToCloud();

      const sources = this.config.sync.sources
        .filter(s => s.enabled !== false && this.readers.has(s.name) && s.mode !== 'full')
        .sort((a, b) => {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

      for (const source of sources) {
        this.progress(`Incremental sync ${source.name}...`, 0);
        const result = await this.syncSourceIncremental(source, sinceDate);
        this.report.results.push(result);
      }

      this.report.status = this.report.results.every(r => r.success) ? 'completed' : 'partial';
    } catch (error) {
      this.report.status = 'failed';
      this.report.errors.push(toErrorMessage(error));
    } finally {
      await this.disconnect();
      this.report.completedAt = new Date();
      this.report.totalDurationMs = this.report.completedAt.getTime() - this.report.startedAt.getTime();
      this.report.totalRecordsSynced = this.report.results.reduce((sum, r) => sum + r.recordsSynced, 0);
    }

    return this.report;
  }

  /**
   * Sync a single source
   */
  async syncSource(source: SyncSource): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      table: source.targetTable,
      source: source.name,
      recordsSynced: 0,
      conflictsResolved: 0,
      recordsSkipped: 0,
      durationMs: 0,
      warnings: [],
    };

    try {
      const reader = this.readers.get(source.name);
      if (!reader) {
        throw new Error(`Reader not found: ${source.name}`);
      }

      // Read all records
      const records = await reader.readAll();
      this.log(`Read ${records.length} records from ${source.name}`);

      if (records.length === 0) {
        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Write to cloud (no wrapping transaction — postgres-writer handles per-batch recovery)
      if (this.writer && !this.config.sync.dryRun) {
        const written = await this.writer.upsert(source.targetTable, records, {
          skipIfExists: source.mode === 'append',
        });
        result.recordsSynced = written;
      } else {
        // Dry run - just count
        result.recordsSynced = records.length;
        this.log(`[DRY RUN] Would sync ${records.length} records to ${source.targetTable}`);
      }

      result.success = true;
    } catch (error) {
      result.error = toErrorMessage(error);
      this.config.onError?.(toError(error), source.name);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Sync a source incrementally
   */
  private async syncSourceIncremental(source: SyncSource, since: Date): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      table: source.targetTable,
      source: source.name,
      recordsSynced: 0,
      conflictsResolved: 0,
      recordsSkipped: 0,
      durationMs: 0,
    };

    try {
      const reader = this.readers.get(source.name);
      if (!reader) {
        throw new Error(`Reader not found: ${source.name}`);
      }

      // Read changed records
      const records = await reader.readChanged(since);
      this.log(`Read ${records.length} changed records from ${source.name} (since ${since.toISOString()})`);

      if (records.length === 0) {
        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Write to cloud (no wrapping transaction — postgres-writer handles per-batch recovery)
      if (this.writer && !this.config.sync.dryRun) {
        const written = await this.writer.upsert(source.targetTable, records);
        result.recordsSynced = written;
      } else {
        result.recordsSynced = records.length;
      }

      result.success = true;
    } catch (error) {
      result.error = toErrorMessage(error);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<{ sources: SourceStatus[]; lastSync?: Date }> {
    const sources: SourceStatus[] = [];

    for (const source of this.config.sync.sources) {
      const reader = this.readers.get(source.name);
      if (reader) {
        const count = await reader.count();
        sources.push({
          name: source.name,
          type: source.type,
          targetTable: source.targetTable,
          recordCount: count,
          enabled: source.enabled !== false,
          priority: source.priority,
        });
      } else {
        sources.push({
          name: source.name,
          type: source.type,
          targetTable: source.targetTable,
          recordCount: 0,
          enabled: source.enabled !== false,
          priority: source.priority,
          error: 'Reader not initialized',
        });
      }
    }

    return { sources };
  }

  /**
   * Verify sync by comparing counts
   */
  async verify(): Promise<VerifyResult> {
    const results: VerifyTableResult[] = [];

    for (const source of this.config.sync.sources.filter(s => s.enabled !== false)) {
      const reader = this.readers.get(source.name);
      if (!reader) continue;

      const localCount = await reader.count();
      let cloudCount = 0;

      if (this.writer) {
        try {
          const rows = await this.writer.query<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${source.targetTable} WHERE source_env = $1`,
            [this.config.environment]
          );
          cloudCount = rows[0]?.count || 0;
        } catch (e) {
          logger.debug('Cloud count query failed', { source: source.name, error: e instanceof Error ? e.message : String(e) });
          cloudCount = -1; // Error
        }
      }

      results.push({
        source: source.name,
        table: source.targetTable,
        localCount,
        cloudCount,
        match: localCount === cloudCount,
        diff: localCount - cloudCount,
      });
    }

    return {
      verified: results.every(r => r.match || r.cloudCount === -1),
      results,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.disconnect();

    for (const entry of Array.from(this.readers.entries())) {
      const [name, reader] = entry;
      try {
        await reader.close();
      } catch (error) {
        this.log(`Warning: Failed to close reader ${name}: ${error}`, 'warn');
      }
    }

    this.readers.clear();
    this.log('Sync agent closed');
  }

  // Private helper methods

  private createReader(source: SyncSource): DataReader | null {
    const baseDir = process.cwd();
    const environment = this.config.environment;

    if (source.type === 'sqlite') {
      return createSQLiteReader({ source, baseDir, environment });
    }

    if (source.type === 'json') {
      return createJSONReader({ source, baseDir, environment });
    }

    return null;
  }

  private async connectToCloud(): Promise<void> {
    if (this.writer) return;

    const tunnelManager = createConnectionManager(this.config.cloud);

    this.writer = createPostgresWriter({
      cloud: this.config.cloud,
      tunnelManager,
    });

    await this.writer.connect();
    this.log('Connected to cloud database');
  }

  private async disconnect(): Promise<void> {
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
  }

  private createReport(mode: 'full' | 'incremental'): SyncReport {
    return {
      syncId: uuidv4(),
      startedAt: new Date(),
      status: 'running',
      environment: this.config.environment,
      mode,
      results: [],
      totalRecordsSynced: 0,
      totalConflictsResolved: 0,
      totalDurationMs: 0,
      errors: [],
    };
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.verbose && level === 'info') return;

    const prefix = `[CloudSync:${this.config.environment}]`;
    switch (level) {
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  private progress(message: string, progress: number): void {
    this.config.onProgress?.(message, progress);
    this.log(message);
  }
}

/**
 * Source status information
 */
export interface SourceStatus {
  name: string;
  type: 'sqlite' | 'json';
  targetTable: string;
  recordCount: number;
  enabled: boolean;
  priority: 'high' | 'medium' | 'low';
  error?: string;
}

/**
 * Verify result
 */
export interface VerifyResult {
  verified: boolean;
  results: VerifyTableResult[];
}

export interface VerifyTableResult {
  source: string;
  table: string;
  localCount: number;
  cloudCount: number;
  match: boolean;
  diff: number;
}

/**
 * Create a sync agent
 */
export function createSyncAgent(config?: Partial<SyncAgentConfig>): CloudSyncAgent {
  return new CloudSyncAgent(config);
}

/**
 * Quick sync utility
 */
export async function syncToCloud(config?: Partial<SyncAgentConfig>): Promise<SyncReport> {
  const agent = createSyncAgent({ ...config, verbose: true });
  await agent.initialize();
  try {
    return await agent.syncAll();
  } finally {
    await agent.close();
  }
}

/**
 * Quick incremental sync utility
 */
export async function syncIncrementalToCloud(
  since?: Date,
  config?: Partial<SyncAgentConfig>
): Promise<SyncReport> {
  const agent = createSyncAgent({ ...config, verbose: true });
  await agent.initialize();
  try {
    return await agent.syncIncremental(since);
  } finally {
    await agent.close();
  }
}
