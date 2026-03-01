/**
 * Pull Sync Agent
 *
 * Orchestrates pulling data from cloud PostgreSQL into local SQLite.
 * Mirrors CloudSyncAgent but in the reverse direction (cloud → local).
 *
 * Features:
 * - Full and incremental pull modes
 * - Column remapping (cloud schema → local schema)
 * - Type transforms (PostgreSQL types → SQLite types)
 * - Automatic backup before writes
 * - Dry-run preview mode
 * - Per-table and per-environment filtering
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { PullConfig, PullSource, SyncReport, SyncResult } from './interfaces.js';
import { DEFAULT_PULL_CONFIG } from './interfaces.js';
import { createConnectionManager } from './cloud/tunnel-manager.js';
import { createPostgresWriter } from './cloud/postgres-writer.js';
import { type PostgresReader, createPostgresReader } from './cloud/postgres-reader.js';
import { type SQLiteWriter, createSQLiteWriter } from './writers/sqlite-writer.js';
import { toErrorMessage, toError } from '../shared/error-utils.js';
import { LoggerFactory } from '../logging/index.js';

const logger = LoggerFactory.create('pull-agent');

/**
 * Pull sync agent configuration
 */
export interface PullAgentConfig extends PullConfig {
  /** Callback for progress updates */
  onProgress?: (message: string, progress: number) => void;

  /** Callback for errors */
  onError?: (error: Error, source: string) => void;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Verification result
 */
export interface PullVerifyResult {
  verified: boolean;
  results: PullVerifyTableResult[];
}

export interface PullVerifyTableResult {
  source: string;
  cloudTable: string;
  localTable: string;
  cloudCount: number;
  localCount: number;
  match: boolean;
  diff: number;
}

/**
 * Pull Sync Agent
 */
export class PullSyncAgent {
  private readonly config: PullAgentConfig;
  private reader: PostgresReader | null = null;
  private writer: SQLiteWriter | null = null;
  private cloudWriter: import('./interfaces.js').CloudWriter | null = null;
  private report: SyncReport | null = null;

  constructor(config: Partial<PullAgentConfig> = {}) {
    this.config = {
      ...DEFAULT_PULL_CONFIG,
      ...config,
      cloud: { ...DEFAULT_PULL_CONFIG.cloud, ...config.cloud },
      sources: config.sources || DEFAULT_PULL_CONFIG.sources,
    };
  }

  /**
   * Initialize connections to both cloud and local databases
   */
  async initialize(): Promise<void> {
    this.log('Initializing pull sync agent...');

    // Connect to cloud
    const tunnelManager = createConnectionManager(this.config.cloud);
    this.cloudWriter = createPostgresWriter({
      cloud: this.config.cloud,
      tunnelManager,
    });
    await this.cloudWriter.connect();
    this.log('Connected to cloud database');

    // Create cloud reader (uses cloudWriter for queries)
    this.reader = createPostgresReader({
      writer: this.cloudWriter,
      environment: this.config.environment,
    });

    // Connect to local SQLite
    const dbPath = this.resolveTargetDb();
    this.writer = createSQLiteWriter({ dbPath });
    await this.writer.connect();
    this.log(`Connected to local database: ${dbPath}`);
  }

  /**
   * Full pull: download all cloud data into local DB
   */
  async pullAll(): Promise<SyncReport> {
    this.report = this.createReport('full');

    try {
      this.ensureInitialized();
      this.backupLocalDb();

      const sources = this.getEnabledSources();
      let completed = 0;

      for (const source of sources) {
        this.progress(`Pulling ${source.name}...`, completed / sources.length);
        const result = await this.pullTable(source);
        this.report.results.push(result);
        completed++;
      }

      this.report.status = this.report.results.every(r => r.success) ? 'completed' : 'partial';
    } catch (error) {
      this.report.status = 'failed';
      this.report.errors.push(toErrorMessage(error));
    } finally {
      this.finalizeReport();
    }

    return this.report;
  }

  /**
   * Incremental pull: only records changed since a timestamp
   */
  async pullIncremental(since?: Date): Promise<SyncReport> {
    this.report = this.createReport('incremental');
    const sinceDate = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

    try {
      this.ensureInitialized();
      this.backupLocalDb();

      const sources = this.getEnabledSources().filter(s => s.mode !== 'full');

      for (const source of sources) {
        this.progress(`Incremental pull ${source.name}...`, 0);
        const result = await this.pullTableIncremental(source, sinceDate);
        this.report.results.push(result);
      }

      this.report.status = this.report.results.every(r => r.success) ? 'completed' : 'partial';
    } catch (error) {
      this.report.status = 'failed';
      this.report.errors.push(toErrorMessage(error));
    } finally {
      this.finalizeReport();
    }

    return this.report;
  }

  /**
   * Pull a single table from cloud to local
   */
  async pullTable(source: PullSource): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      table: source.localTable,
      source: source.name,
      recordsSynced: 0,
      conflictsResolved: 0,
      recordsSkipped: 0,
      durationMs: 0,
      warnings: [],
    };

    try {
      this.ensureInitialized();

      // Read from cloud
      const records = await this.reader!.readAll(source);
      this.log(`Read ${records.length} records from cloud ${source.cloudTable}`);

      if (records.length === 0) {
        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      // Write to local
      if (!this.config.dryRun) {
        const written = await this.writer!.upsert(source.localTable, records);
        result.recordsSynced = written;
        result.recordsSkipped = records.length - written;
      } else {
        result.recordsSynced = records.length;
        this.log(`[DRY RUN] Would write ${records.length} records to local ${source.localTable}`);
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
   * Pull incremental changes for a single table
   */
  private async pullTableIncremental(source: PullSource, since: Date): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      table: source.localTable,
      source: source.name,
      recordsSynced: 0,
      conflictsResolved: 0,
      recordsSkipped: 0,
      durationMs: 0,
    };

    try {
      this.ensureInitialized();

      const records = await this.reader!.readChanged(source, since);
      this.log(`Read ${records.length} changed records from cloud ${source.cloudTable} (since ${since.toISOString()})`);

      if (records.length === 0) {
        result.success = true;
        result.durationMs = Date.now() - startTime;
        return result;
      }

      if (!this.config.dryRun) {
        const written = await this.writer!.upsert(source.localTable, records);
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
   * Verify pull by comparing cloud and local counts
   */
  async verify(): Promise<PullVerifyResult> {
    this.ensureInitialized();

    const results: PullVerifyTableResult[] = [];

    for (const source of this.getEnabledSources()) {
      const cloudCount = await this.reader!.count(source);
      const localCount = await this.writer!.count(source.localTable);

      results.push({
        source: source.name,
        cloudTable: source.cloudTable,
        localTable: source.localTable,
        cloudCount,
        localCount,
        match: cloudCount === localCount || cloudCount === -1,
        diff: localCount - cloudCount,
      });
    }

    return {
      verified: results.every(r => r.match),
      results,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
    if (this.cloudWriter) {
      await this.cloudWriter.close();
      this.cloudWriter = null;
    }
    this.reader = null;
    this.log('Pull sync agent closed');
  }

  // Private helpers

  private ensureInitialized(): void {
    if (!this.reader || !this.writer) {
      throw new Error('PullSyncAgent not initialized. Call initialize() first.');
    }
  }

  private getEnabledSources(): PullSource[] {
    let sources = this.config.sources.filter(s => s.enabled);

    // Filter by specific tables if requested
    if (this.config.tables && this.config.tables.length > 0) {
      const tableSet = new Set(this.config.tables);
      sources = sources.filter(s => tableSet.has(s.localTable) || tableSet.has(s.name));
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return sources.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  private resolveTargetDb(): string {
    if (this.config.targetDb) {
      return path.resolve(this.config.targetDb);
    }
    return path.resolve(process.cwd(), '.agentic-qe/memory.db');
  }

  private backupLocalDb(): void {
    if (this.config.dryRun) return;

    const dbPath = this.resolveTargetDb();
    if (!fs.existsSync(dbPath)) return;

    const timestamp = Math.floor(Date.now() / 1000);
    const backupPath = `${dbPath}.bak-${timestamp}`;

    try {
      fs.copyFileSync(dbPath, backupPath);
      this.log(`Backed up local DB to ${backupPath}`);
    } catch (error) {
      this.log(`Warning: Failed to backup local DB: ${toErrorMessage(error)}`, 'warn');
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

  private finalizeReport(): void {
    if (!this.report) return;
    this.report.completedAt = new Date();
    this.report.totalDurationMs = this.report.completedAt.getTime() - this.report.startedAt.getTime();
    this.report.totalRecordsSynced = this.report.results.reduce((sum, r) => sum + r.recordsSynced, 0);
    this.report.totalConflictsResolved = this.report.results.reduce((sum, r) => sum + r.conflictsResolved, 0);
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.config.verbose && level === 'info') return;

    const prefix = `[PullSync:${this.config.environment}]`;
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
 * Create a pull sync agent
 */
export function createPullSyncAgent(config?: Partial<PullAgentConfig>): PullSyncAgent {
  return new PullSyncAgent(config);
}

/**
 * Quick pull utility — full pull from cloud
 */
export async function pullFromCloud(config?: Partial<PullAgentConfig>): Promise<SyncReport> {
  const agent = createPullSyncAgent({ ...config, verbose: true });
  await agent.initialize();
  try {
    return await agent.pullAll();
  } finally {
    await agent.close();
  }
}

/**
 * Quick incremental pull utility
 */
export async function pullIncrementalFromCloud(
  since?: Date,
  config?: Partial<PullAgentConfig>,
): Promise<SyncReport> {
  const agent = createPullSyncAgent({ ...config, verbose: true });
  await agent.initialize();
  try {
    return await agent.pullIncremental(since);
  } finally {
    await agent.close();
  }
}
