/**
 * JSON Data Reader
 *
 * Reads data from local JSON files for cloud sync.
 * Handles: store.json, intelligence.json, daemon-state.json, etc.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import secureJsonParse from 'secure-json-parse';
import type { DataReader, SyncSource } from '../interfaces.js';
import { toErrorMessage } from '../../shared/error-utils.js';

/**
 * JSON reader configuration
 */
export interface JSONReaderConfig {
  /** Source configuration */
  source: SyncSource;

  /** Base directory for resolving paths */
  baseDir: string;

  /** Environment identifier */
  environment: string;
}

/**
 * Generic record type from JSON
 */
export interface JSONRecord {
  [key: string]: unknown;
}

/**
 * JSON data reader implementation
 */
export class JSONReader implements DataReader<JSONRecord> {
  readonly name: string;
  readonly type = 'json' as const;

  private readonly config: JSONReaderConfig;
  private readonly filePath: string;
  private data: JSONRecord[] | null = null;
  private fileModTime: Date | null = null;

  constructor(config: JSONReaderConfig) {
    this.config = config;
    this.name = config.source.name;
    this.filePath = path.resolve(config.baseDir, config.source.path);
  }

  /**
   * Initialize the reader
   */
  async initialize(): Promise<void> {
    // Just verify the file exists (#1378: a file that cannot be stat'ed for
    // another reason, e.g. a parent without search permission, throws)
    const stats = this.statFile();
    if (!stats) {
      console.warn(`[JSONReader:${this.name}] File not found: ${this.filePath}`);
      this.data = [];
      return;
    }

    // Store file modification time
    this.fileModTime = stats.mtime;

    console.log(`[JSONReader:${this.name}] Initialized: ${this.filePath}`);
  }

  /**
   * #1361: whether the source file exists, so a sync can tell a missing
   * source (nothing read) from one that was read and is empty.
   */
  exists(): boolean {
    return this.statFile() !== null;
  }

  /**
   * #1378: the file's stats, or null when it does not exist (ENOENT, or a
   * path component that is not a directory). Any other error, such as EACCES
   * on a parent directory, throws "could not be read": existsSync() reported
   * those as "missing", so an unreadable store passed as "Not read".
   */
  private statFile(): fs.Stats | null {
    try {
      return fs.statSync(this.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw new Error(`JSON source ${this.name} could not be read: ${this.filePath}: ${code ?? toErrorMessage(error)}`);
    }
  }

  /**
   * Read all records.
   *
   * A missing file has no records (see exists(); the sync reports it as not
   * read). #1378: a file that exists but cannot be read or parsed throws, so
   * a corrupt store is a failed source, never an empty successful one.
   */
  async readAll(): Promise<JSONRecord[]> {
    if (!this.statFile()) {
      return [];
    }

    let content: string;
    try {
      content = fs.readFileSync(this.filePath, 'utf-8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new Error(`JSON source ${this.name} could not be read: ${this.filePath}: ${code ?? toErrorMessage(error)}`);
    }

    let parsed: unknown;
    try {
      parsed = secureJsonParse.parse(content);
    } catch (error) {
      const why = content.trim() === '' ? 'the file is empty' : describeParseError(error);
      throw new Error(`JSON source ${this.name} could not be parsed: ${this.filePath}: ${why}`);
    }

    // #1378: the claude-flow, intelligence and daemon stores (and any source
    // with a jsonPath) are JSON objects. Another root (an array, a number,
    // null) is a corrupt store, not an empty one. Other sources keep the
    // default: an array root is a list of records.
    if (this.requiresObjectRoot() && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
      const got = parsed === null ? 'null' : Array.isArray(parsed) ? 'an array' : `a ${typeof parsed}`;
      throw new Error(`JSON source ${this.name} could not be parsed: ${this.filePath}: not a JSON object (got ${got})`);
    }

    // Extract data based on JSON path if specified
    const records = this.extractRecords(parsed);

    // Transform records
    return records.map(record => this.transformRecord(record));
  }

  /**
   * Read records changed since a timestamp
   * For JSON files, we compare file modification time
   */
  async readChanged(since: Date): Promise<JSONRecord[]> {
    const stats = this.statFile();
    if (!stats) {
      return [];
    }

    if (stats.mtime <= since) {
      // File hasn't changed
      return [];
    }

    // File has changed, return all records (JSON doesn't have per-record timestamps)
    return this.readAll();
  }

  /**
   * Get record count
   */
  async count(): Promise<number> {
    const records = await this.readAll();
    return records.length;
  }

  /**
   * Close the reader
   */
  async close(): Promise<void> {
    this.data = null;
    this.fileModTime = null;
    console.log(`[JSONReader:${this.name}] Closed`);
  }

  /** #1378: sources whose store must be a JSON object (see readAll). */
  private requiresObjectRoot(): boolean {
    return Boolean(this.config.source.jsonPath) || this.name.includes('claude-flow-memory') ||
      this.name.includes('intelligence') || this.name.includes('qlearning') || this.name.includes('daemon');
  }

  /**
   * Extract records from parsed JSON based on source type
   */
  private extractRecords(parsed: unknown): JSONRecord[] {
    // Handle JSON path if specified
    if (this.config.source.jsonPath) {
      return this.extractByPath(parsed, this.config.source.jsonPath);
    }

    // Handle different JSON structures based on source name
    if (this.name.includes('claude-flow-memory')) {
      return this.extractClaudeFlowMemory(parsed);
    }

    if (this.name.includes('intelligence') || this.name.includes('qlearning')) {
      return this.extractIntelligence(parsed);
    }

    if (this.name.includes('daemon')) {
      return this.extractDaemonState(parsed);
    }

    // Default: treat as array or single object
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      // If it's an object with entries, convert to array
      const entries = Object.entries(parsed as Record<string, unknown>);
      return entries.map(([key, value]) => ({
        key,
        value,
      }));
    }

    return [];
  }

  /**
   * Extract by JSON path (simplified implementation)
   */
  private extractByPath(data: unknown, jsonPath: string): JSONRecord[] {
    // Handle simple paths like '$.qvalues' or '$.memories'
    const pathParts = jsonPath.replace(/^\$\./, '').split('.');

    let current: unknown = data;
    for (const part of pathParts) {
      // #1157: own keys only; `$.constructor` is not a path into the data.
      if (current && typeof current === 'object' && Object.hasOwn(current, part)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        // #1384: a configured path the file does not have is reported, not 0 records.
        throw new Error(`Configured JSON path ${jsonPath} not found in source ${this.name}: ${this.filePath}`);
      }
    }

    if (Array.isArray(current)) {
      return current;
    }

    if (typeof current === 'object' && current !== null) {
      // Convert object to array of key-value pairs
      return Object.entries(current as Record<string, unknown>).map(([key, value]) => ({
        state: key, // Assuming state-action pairs for qvalues
        ...(typeof value === 'object' ? value : { value }) as Record<string, unknown>,
      }));
    }

    // #1384: a scalar or null at the path has no records to read.
    const got = current === null ? 'null' : `a ${typeof current}`;
    throw new Error(`Configured JSON path ${jsonPath} in source ${this.name} is not a list or an object (got ${got}): ${this.filePath}`);
  }

  /**
   * Extract records from Claude-Flow memory store.
   *
   * #1384: the store is `{entries: {key: {key, value, namespace, storedAt, ...}}, version}`;
   * each entry is one record whose value is the stored payload (as
   * claude-flow-bridge reads it), not the wrapper. The older flat store
   * (`{key: value}`) still reads one record per key.
   */
  private extractClaudeFlowMemory(parsed: unknown): JSONRecord[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const store = parsed as Record<string, unknown>;
    const versioned = isPlainObject(store.entries);
    const entries = versioned ? store.entries as Record<string, unknown> : store;

    const records: JSONRecord[] = [];
    for (const [key, value] of Object.entries(entries)) {
      // Skip metadata keys
      if (key.startsWith('_') || (!versioned && key === 'version')) continue;

      const stored = versioned && isPlainObject(value) && Object.hasOwn(value, 'value') ? value : null;
      // created_at stays the sync time (transformRecord): incremental pulls
      // select rows by it, so an old storedAt would hide the row from them.
      records.push({
        key,
        value: stored ? toJsonbPayload(stored.value) : (typeof value === 'object' ? value : { data: value }),
        category: categorizeMemoryKey(key),
      });
    }

    return records;
  }

  /**
   * Extract records from intelligence.json
   */
  private extractIntelligence(parsed: unknown): JSONRecord[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const records: JSONRecord[] = [];
    const intel = parsed as Record<string, unknown>;

    // Extract Q-values
    if (intel.qvalues && typeof intel.qvalues === 'object') {
      const qvalues = intel.qvalues as Record<string, unknown>;
      for (const [state, actions] of Object.entries(qvalues)) {
        if (typeof actions === 'object' && actions !== null) {
          for (const [action, data] of Object.entries(actions as Record<string, unknown>)) {
            const qData = typeof data === 'object' ? data as Record<string, unknown> : { value: data };
            records.push({
              state,
              action,
              q_value: qData.value || qData.q_value || 0,
              visits: qData.visits || 0,
              last_update: qData.lastUpdate || qData.last_update,
            });
          }
        }
      }
    }

    // Extract memories with embeddings
    if (intel.memories && Array.isArray(intel.memories)) {
      for (const memory of intel.memories) {
        if (typeof memory === 'object' && memory !== null) {
          const mem = memory as Record<string, unknown>;
          records.push({
            id: mem.id || `mem_${Date.now()}_${randomUUID().slice(0, 12)}`,
            memory_type: mem.type || 'file_access',
            content: mem.content || mem.path,
            embedding: mem.embedding,
            metadata: mem.metadata,
            timestamp: mem.timestamp,
          });
        }
      }
    }

    return records;
  }

  /**
   * Extract records from daemon-state.json
   */
  private extractDaemonState(parsed: unknown): JSONRecord[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const records: JSONRecord[] = [];
    const state = parsed as Record<string, unknown>;

    // Extract worker stats
    if (state.workers && typeof state.workers === 'object') {
      const workers = state.workers as Record<string, unknown>;
      for (const [workerType, stats] of Object.entries(workers)) {
        if (typeof stats === 'object' && stats !== null) {
          const workerStats = stats as Record<string, unknown>;
          records.push({
            worker_type: workerType,
            run_count: workerStats.runCount || workerStats.runs || 0,
            success_count: workerStats.successCount || workerStats.successes || 0,
            failure_count: workerStats.failureCount || workerStats.failures || 0,
            avg_duration_ms: workerStats.avgDuration || workerStats.averageDurationMs,
            last_run: workerStats.lastRun,
          });
        }
      }
    }

    return records;
  }

  /**
   * Transform a record for cloud sync
   */
  private transformRecord(record: JSONRecord): JSONRecord {
    const transformed: JSONRecord = {
      ...record,
      source_env: this.config.environment,
    };

    // Ensure timestamps are ISO strings
    for (const [key, value] of Object.entries(transformed)) {
      if (key.includes('timestamp') || key.endsWith('_at') || key === 'last_update') {
        if (typeof value === 'number') {
          transformed[key] = new Date(value).toISOString();
        } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
          transformed[key] = new Date(value).toISOString();
        }
      }

      // Convert nested objects to JSONB-compatible format
      if (typeof value === 'object' && value !== null && !Array.isArray(value) &&
          !['value', 'metadata', 'embedding'].includes(key)) {
        // Already an object, PostgreSQL will handle JSONB conversion
      }
    }

    // Add created_at if missing
    if (!transformed.created_at) {
      transformed.created_at = new Date().toISOString();
    }

    return transformed;
  }

  /**
   * Get file info for debugging
   */
  getInfo(): { path: string; exists: boolean; modTime: Date | null; size: number } {
    // #1378: same existence rule as readAll (only ENOENT/ENOTDIR is missing).
    const stats = this.statFile();
    return { path: this.filePath, exists: stats !== null, modTime: stats?.mtime ?? null, size: stats?.size ?? 0 };
  }
}

/**
 * #1378: a parse error without the file's content. Node's JSON.parse message
 * can quote the start of the input (`Unexpected token 'S', "SECRET=..." is
 * not valid JSON`), and the message is printed in sync reports, so only the
 * position is kept.
 */
function describeParseError(error: unknown): string {
  const message = toErrorMessage(error);
  // secure-json-parse rejects prototype-poisoning keys with a SyntaxError.
  if (/forbidden prototype property/i.test(message)) return 'contains a forbidden __proto__/constructor key';
  if (!(error instanceof SyntaxError)) return message;
  const where = message.match(/position \d+(?: \(line \d+ column \d+\))?/);
  return `not valid JSON${where ? ` at ${where[0]}` : ''}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Category of a claude-flow memory, from its key (the cloud `category` column). */
function categorizeMemoryKey(key: string): string {
  if (key.includes('adr')) return 'adr-analysis';
  if (key.includes('agent')) return 'agent-patterns';
  if (key.includes('pattern')) return 'patterns';
  if (key.includes('metric')) return 'metrics';
  return 'general';
}

/**
 * #1384: a claude-flow payload for the JSONB `value` column. Objects and JSON
 * text pass through; any other string is encoded as a JSON string, so text
 * such as a date is stored as text and never rejected as invalid JSONB.
 */
function toJsonbPayload(value: unknown): unknown {
  if (value === undefined || value === null) return { data: null };
  if (typeof value !== 'string') return value;
  try {
    JSON.parse(value);
    return value;
  } catch {
    return JSON.stringify(value);
  }
}

/**
 * Create a JSON reader
 */
export function createJSONReader(config: JSONReaderConfig): JSONReader {
  return new JSONReader(config);
}
