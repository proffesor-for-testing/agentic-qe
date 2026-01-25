/**
 * JSON Data Reader
 *
 * Reads data from local JSON files for cloud sync.
 * Handles: store.json, intelligence.json, daemon-state.json, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import secureJsonParse from 'secure-json-parse';
import type { DataReader, SyncSource } from '../interfaces.js';

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
    // Just verify the file exists
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[JSONReader:${this.name}] File not found: ${this.filePath}`);
      this.data = [];
      return;
    }

    // Store file modification time
    const stats = fs.statSync(this.filePath);
    this.fileModTime = stats.mtime;

    console.log(`[JSONReader:${this.name}] Initialized: ${this.filePath}`);
  }

  /**
   * Read all records
   */
  async readAll(): Promise<JSONRecord[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = secureJsonParse.parse(content);

      // Extract data based on JSON path if specified
      let records = this.extractRecords(parsed);

      // Transform records
      return records.map(record => this.transformRecord(record));
    } catch (error) {
      console.error(
        `[JSONReader:${this.name}] Failed to read: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Read records changed since a timestamp
   * For JSON files, we compare file modification time
   */
  async readChanged(since: Date): Promise<JSONRecord[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    const stats = fs.statSync(this.filePath);
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
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return [];
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

    return [];
  }

  /**
   * Extract records from Claude-Flow memory store
   */
  private extractClaudeFlowMemory(parsed: unknown): JSONRecord[] {
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const records: JSONRecord[] = [];
    const store = parsed as Record<string, unknown>;

    // Handle flat key-value structure
    for (const [key, value] of Object.entries(store)) {
      // Skip metadata keys
      if (key.startsWith('_')) continue;

      // Determine category from key pattern
      let category = 'general';
      if (key.includes('adr')) category = 'adr-analysis';
      else if (key.includes('agent')) category = 'agent-patterns';
      else if (key.includes('pattern')) category = 'patterns';
      else if (key.includes('metric')) category = 'metrics';

      records.push({
        key,
        value: typeof value === 'object' ? value : { data: value },
        category,
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
            id: mem.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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
    const exists = fs.existsSync(this.filePath);
    let size = 0;
    let modTime: Date | null = null;

    if (exists) {
      const stats = fs.statSync(this.filePath);
      size = stats.size;
      modTime = stats.mtime;
    }

    return { path: this.filePath, exists, modTime, size };
  }
}

/**
 * Create a JSON reader
 */
export function createJSONReader(config: JSONReaderConfig): JSONReader {
  return new JSONReader(config);
}
