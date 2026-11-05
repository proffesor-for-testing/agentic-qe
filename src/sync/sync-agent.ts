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
  /** #1361: false when the source file is absent (JSON sources). */
  exists?(): boolean;
}
import { DEFAULT_SYNC_CONFIG } from './interfaces.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('sync-agent');

import { createSQLiteReader } from './readers/sqlite-reader.js';
import { createJSONReader } from './readers/json-reader.js';
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
  /** #1361: why a source has no reader, so a sync can report it instead of dropping it. */
  private readonly readerErrors: Map<string, string> = new Map();
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
          this.readerErrors.set(source.name, toErrorMessage(error));
          this.log(`Warning: Failed to initialize reader ${source.name}: ${error}`, 'warn');
        }
      } else {
        this.readerErrors.set(source.name, `Unsupported source type: ${source.type}`);
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
      // #1361: nothing selected is a failed sync, not an empty "completed" one.
      const selected = this.selectSources(this.config.sync.sources.filter(s => s.enabled !== false));
      await this.connectToCloud();

      let completed = 0;
      const total = selected.length;

      for (const source of selected) {
        this.progress(`Syncing ${source.name}...`, completed / total);
        const result = this.readers.has(source.name) ? await this.syncSource(source) : this.unreadSource(source);
        this.report.results.push(result);
        completed++;
      }

      this.report.status = reportStatus(this.report.results);
      if (nothingRead(this.report.results)) this.report.errors.push(NOTHING_READ);
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
      // #1361: full-mode sources are left to `--full`; nothing left is a failure.
      const selected = this.selectSources(
        this.config.sync.sources.filter(s => s.enabled !== false && s.mode !== 'full'),
        ' for an incremental sync (full-mode sources need --full)',
      );
      await this.connectToCloud();

      for (const source of selected) {
        this.progress(`Incremental sync ${source.name}...`, 0);
        const result = this.readers.has(source.name)
          ? await this.syncSourceIncremental(source, sinceDate)
          : this.unreadSource(source);
        this.report.results.push(result);
      }

      this.report.status = reportStatus(this.report.results);
      if (nothingRead(this.report.results)) this.report.errors.push(NOTHING_READ);
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
        // #1361: an absent file was not read; it must not make a sync "completed".
        if (reader.exists?.() === false) result.sourceMissing = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Write to cloud (no wrapping transaction — postgres-writer handles per-batch recovery)
      if (this.writer && !this.config.sync.dryRun) {
        const skipped = { count: 0, reason: '' };
        const written = await this.writer.upsert(source.targetTable, records, {
          skipIfExists: source.mode === 'append',
          onSkipped: (count, reason) => { skipped.count += count; skipped.reason ||= reason; },
        });
        result.recordsSynced = written;
        // #1361: records the cloud rejected fail the source, never a silent 0.
        if (rejectSkipped(result, skipped, records.length, source.targetTable)) {
          result.durationMs = Date.now() - startTime;
          return result;
        }
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
        if (reader.exists?.() === false) result.sourceMissing = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Write to cloud (no wrapping transaction — postgres-writer handles per-batch recovery)
      if (this.writer && !this.config.sync.dryRun) {
        const skipped = { count: 0, reason: '' };
        const written = await this.writer.upsert(source.targetTable, records, {
          onSkipped: (count, reason) => { skipped.count += count; skipped.reason ||= reason; },
        });
        result.recordsSynced = written;
        if (rejectSkipped(result, skipped, records.length, source.targetTable)) {
          result.durationMs = Date.now() - startTime;
          return result;
        }
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
        // #1378: a source that cannot be counted (e.g. a corrupt JSON file)
        // is reported with its error instead of failing the whole status.
        let count = 0;
        let error: string | undefined;
        try {
          count = await reader.count();
        } catch (e) {
          error = toErrorMessage(e);
        }
        sources.push({
          name: source.name,
          type: source.type,
          targetTable: source.targetTable,
          recordCount: count,
          enabled: source.enabled !== false,
          priority: source.priority,
          ...(error ? { error } : {}),
        });
      } else {
        sources.push({
          name: source.name,
          type: source.type,
          targetTable: source.targetTable,
          recordCount: 0,
          enabled: source.enabled !== false,
          priority: source.priority,
          // #1378: say why the reader could not be opened (e.g. EACCES).
          error: this.readerErrors.get(source.name) ?? 'Reader not initialized',
        });
      }
    }

    return { sources };
  }

  /**
   * Verify sync by comparing local and cloud counts.
   *
   * #1361: verify connects to the cloud itself; before, it never did, so every
   * cloud count was 0 and an empty source "matched". A count that could not be
   * read (no connection, a failed query, a local source that could not be
   * opened) is `unverified`, never a match, and `verified` is true only when
   * every source was counted on both sides and matched.
   */
  async verify(): Promise<VerifyResult> {
    const sources = this.config.sync.sources.filter(s => s.enabled !== false);
    if (sources.length === 0) {
      return { verified: false, status: 'unverified', results: [], error: 'No sources selected to verify' };
    }

    let connectError: string | undefined;
    try {
      if (this.config.sync.dryRun) throw new Error('verify needs a cloud connection; it cannot run as a dry run');
      await this.connectToCloud();
      if (!this.writer) throw new Error('No cloud connection was opened');
    } catch (error) {
      connectError = `Could not connect to the cloud database: ${toErrorMessage(error)}`;
    }

    const results: VerifyTableResult[] = [];
    try {
      for (const source of sources) {
        results.push(await this.verifySource(source, connectError));
      }
    } finally {
      await this.disconnect();
    }

    const status = verifyStatus(results);
    return {
      verified: status === 'verified',
      status,
      results,
      ...(connectError ? { error: connectError } : {}),
    };
  }

  /** #1361: count one source on both sides; any count that cannot be read is unverified. */
  private async verifySource(source: SyncSource, connectError?: string): Promise<VerifyTableResult> {
    const base = { source: source.name, table: source.targetTable };
    const unverified = (localCount: number, error: string): VerifyTableResult =>
      ({ ...base, localCount, cloudCount: -1, match: false, diff: 0, status: 'unverified', error });

    const reader = this.readers.get(source.name);
    if (!reader) {
      return unverified(-1, `Local source could not be read: ${this.readerErrors.get(source.name) ?? 'reader not initialized'}`);
    }
    let localCount: number;
    try {
      localCount = await reader.count();
    } catch (error) {
      return unverified(-1, `Local count failed: ${toErrorMessage(error)}`);
    }
    if (connectError || !this.writer) return unverified(localCount, connectError ?? 'No cloud connection');

    let cloudCount: number;
    try {
      // Use SET LOCAL to avoid HNSW index-only scan bug (ruvector HNSW
      // indexes return 0 rows for COUNT(*) when chosen by the planner)
      await this.writer.beginTransaction();
      await this.writer.execute('SET LOCAL enable_indexonlyscan = off');
      const rows = await this.writer.query<{ count: number | string }>(
        `SELECT COUNT(*) as count FROM ${source.targetTable} WHERE source_env = $1`,
        [this.config.environment]
      );
      await this.writer.commit();
      // node-postgres returns COUNT(*) (bigint) as a string. No row, a null
      // or an empty count is an error, never a count of 0 (#1361).
      const raw = rows[0]?.count;
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        throw new Error(`COUNT(*) returned no value (${rows.length === 0 ? 'no row' : JSON.stringify(raw)})`);
      }
      cloudCount = Number(raw);
      if (!Number.isInteger(cloudCount) || cloudCount < 0) throw new Error(`Unexpected count: ${String(raw)}`);
    } catch (e) {
      try { await this.writer.rollback(); } catch { /* ignore */ }
      logger.debug('Cloud count query failed', { source: source.name, error: e instanceof Error ? e.message : String(e) });
      return unverified(localCount, `Cloud count failed: ${toErrorMessage(e)}`);
    }

    const match = localCount === cloudCount;
    return { ...base, localCount, cloudCount, match, diff: localCount - cloudCount, status: match ? 'match' : 'mismatch' };
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

  /**
   * #1361: the sources a sync will report on, by priority. An empty selection
   * (a `--sources` filter that matched nothing, everything disabled) throws,
   * so the sync fails instead of completing with nothing to do.
   */
  private selectSources(candidates: SyncSource[], why = ''): SyncSource[] {
    if (candidates.length === 0) {
      throw new Error(`No sources selected to sync${why}`);
    }
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return [...candidates].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /** #1361: a selected source whose reader could not be opened is a failed result. */
  private unreadSource(source: SyncSource): SyncResult {
    return {
      success: false,
      table: source.targetTable,
      source: source.name,
      recordsSynced: 0,
      conflictsResolved: 0,
      recordsSkipped: 0,
      durationMs: 0,
      error: `Source could not be read: ${this.readerErrors.get(source.name) ?? 'reader not initialized'}`,
    };
  }

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
    // #1331: a dry run only reads local sources and counts what it would
    // send, so it must not open the IAP tunnel or need cloud credentials.
    if (this.config.sync.dryRun) {
      this.log('[DRY RUN] Not connecting to the cloud database');
      return;
    }

    const tunnelManager = createConnectionManager(this.config.cloud);

    const writer = createPostgresWriter({
      cloud: this.config.cloud,
      tunnelManager,
    });

    // #1361: keep the writer only once connected, so a failed connect leaves
    // no half-open writer behind and a later call connects again.
    try {
      await writer.connect();
    } catch (error) {
      try { await writer.close(); } catch { /* not connected */ }
      throw error;
    }
    this.writer = writer;
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
      ...(this.config.sync.dryRun ? { dryRun: true } : {}),
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
 * #1361: overall status from per-source results. A source counts as read
 * when it succeeded and its file existed; a missing optional source is
 * neither a failure nor a read. Nothing read is failed; every source read or
 * missing (and at least one read) is completed; otherwise partial.
 */
function reportStatus(results: SyncResult[]): SyncReport['status'] {
  if (nothingRead(results)) return 'failed';
  return results.every(r => r.success) ? 'completed' : 'partial';
}

const NOTHING_READ = 'No source could be read: every selected source failed or its file does not exist';

/** #1361: no selected source was actually read. */
function nothingRead(results: SyncResult[]): boolean {
  return !results.some(r => r.success && !r.sourceMissing);
}

/**
 * #1361: records a writer reported as not written fail the source. Returns
 * true when it did, with `result.error` saying how many and why.
 */
function rejectSkipped(
  result: SyncResult, skipped: { count: number; reason: string }, total: number, table: string,
): boolean {
  if (skipped.count === 0) return false;
  result.recordsSkipped = skipped.count;
  result.success = false;
  result.error = `${skipped.count} of ${total} records were not written to ${table}` +
    (skipped.reason ? `: ${skipped.reason.slice(0, 300)}` : '');
  return true;
}

/** #1361: overall verify status from per-source comparisons. */
function verifyStatus(results: VerifyTableResult[]): VerifyStatus {
  if (results.length === 0) return 'unverified';
  if (results.some(r => r.status === 'mismatch')) return 'mismatch';
  const matched = results.filter(r => r.status === 'match').length;
  if (matched === results.length) return 'verified';
  return matched > 0 ? 'partial' : 'unverified';
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
/**
 * #1361: `verified` every source counted on both sides and matched;
 * `mismatch` some source differs; `partial` the counted sources matched but
 * others could not be counted; `unverified` nothing could be compared (no
 * cloud connection, no sources).
 */
export type VerifyStatus = 'verified' | 'mismatch' | 'partial' | 'unverified';

export interface VerifyResult {
  verified: boolean;
  status: VerifyStatus;
  results: VerifyTableResult[];
  /** Why the comparison could not run (e.g. the cloud connection failed). */
  error?: string;
}

export interface VerifyTableResult {
  source: string;
  table: string;
  /** -1 when the local source could not be counted. */
  localCount: number;
  /** -1 when the cloud count could not be read. */
  cloudCount: number;
  match: boolean;
  diff: number;
  status: 'match' | 'mismatch' | 'unverified';
  error?: string;
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
