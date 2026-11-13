/**
 * PostgreSQL Cloud Reader
 *
 * Reads data from cloud PostgreSQL tables for pull sync (cloud → local).
 * Reuses existing PostgresWriter connection infrastructure for queries.
 */

import type { CloudWriter, PullSource } from '../interfaces.js';
import { validateIdentifier } from '../../shared/sql-safety.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('postgres-reader');

/**
 * PostgreSQL reader configuration
 */
export interface PostgresReaderConfig {
  /** Cloud writer (reused for query access) */
  writer: CloudWriter;

  /** Environment to filter by (or 'all' for all environments) */
  environment: string;

  /** #1409: this machine's environment, skipped for sources with excludeOwnEnvironment */
  localEnvironment?: string;
}

/**
 * PostgreSQL cloud reader
 *
 * Uses the existing CloudWriter.query() method to SELECT from cloud tables.
 */
export class PostgresReader {
  private readonly writer: CloudWriter;
  private readonly environment: string;
  private readonly localEnvironment: string | undefined;

  constructor(config: PostgresReaderConfig) {
    this.writer = config.writer;
    this.environment = config.environment;
    this.localEnvironment = config.localEnvironment;
  }

  /**
   * The WHERE clause for a source: the environment filter, plus #1409's
   * own-environment and prefix exclusions; parameters are appended to `params`.
   */
  private filters(source: PullSource, params: unknown[]): string {
    const conditions: string[] = [];
    const param = (value: unknown) => { params.push(value); return `$${params.length}`; };
    if (this.environment !== 'all') conditions.push(`source_env = ${param(this.environment)}`);
    if (source.excludeOwnEnvironment && this.localEnvironment) {
      conditions.push(`source_env <> ${param(this.localEnvironment)}`);
    }
    if (source.excludePrefix) {
      // LIKE wildcards in the prefix are matched literally.
      const escaped = source.excludePrefix.prefix.replace(/[\\%_]/g, c => `\\${c}`);
      conditions.push(`${validateIdentifier(source.excludePrefix.column)} NOT LIKE ${param(`${escaped}%`)}`);
    }
    return conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`;
  }

  /**
   * Validate and sanitize a 'schema.table' cloud table reference.
   * Throws if the format is invalid (must contain exactly one dot).
   */
  private sanitizeCloudTable(cloudTable: string): string {
    const dotIndex = cloudTable.indexOf('.');
    if (dotIndex === -1 || dotIndex === 0 || dotIndex === cloudTable.length - 1) {
      throw new Error(
        `Invalid cloud table format '${cloudTable}': expected 'schema.table' (e.g., 'aqe.qe_patterns')`
      );
    }
    const schema = cloudTable.substring(0, dotIndex);
    const table = cloudTable.substring(dotIndex + 1);
    return `${validateIdentifier(schema)}.${validateIdentifier(table)}`;
  }

  /**
   * Read all records from a cloud table
   */
  async readAll(source: PullSource): Promise<Record<string, unknown>[]> {
    const safeTable = this.sanitizeCloudTable(source.cloudTable);

    const params: unknown[] = [];
    const sql = `SELECT * FROM ${safeTable}${this.filters(source, params)}`;

    try {
      const rows = await this.writer.query<Record<string, unknown>>(sql, params);
      logger.debug(`Read ${rows.length} records from ${source.cloudTable}`, {
        env: this.environment,
      });
      return rows.map(row => this.transformRecord(row, source));
    } catch (error) {
      throw new Error(
        `Failed to read from ${source.cloudTable}: ${toErrorMessage(error)}`
      );
    }
  }

  /**
   * Read records changed since a timestamp
   */
  async readChanged(source: PullSource, since: Date): Promise<Record<string, unknown>[]> {
    const safeTable = this.sanitizeCloudTable(source.cloudTable);

    // Try common timestamp columns
    const timestampCol = await this.findTimestampColumn(safeTable);
    if (!timestampCol) {
      logger.debug(`No timestamp column found for ${source.cloudTable}, falling back to readAll`);
      return this.readAll(source);
    }

    const params: unknown[] = [since.toISOString()];
    const where = this.filters(source, params);
    const sql = `SELECT * FROM ${safeTable} WHERE ${validateIdentifier(timestampCol)} > $1` +
      (where ? ` AND ${where.slice(' WHERE '.length)}` : '');

    try {
      const rows = await this.writer.query<Record<string, unknown>>(sql, params);
      return rows.map(row => this.transformRecord(row, source));
    } catch (error) {
      logger.debug(`Changed query failed for ${source.cloudTable}, falling back to readAll`, {
        error: toErrorMessage(error),
      });
      return this.readAll(source);
    }
  }

  /**
   * Get record count from a cloud table
   */
  async count(source: PullSource): Promise<number> {
    const safeTable = this.sanitizeCloudTable(source.cloudTable);

    const params: unknown[] = [];
    const sql = `SELECT COUNT(*) as count FROM ${safeTable}${this.filters(source, params)}`;

    try {
      // Wrap in transaction with SET LOCAL to avoid HNSW index-only scan bug.
      // ruvector HNSW indexes incorrectly advertise index-only scan support,
      // causing COUNT(*) to return 0 when the planner picks the HNSW index.
      // SET LOCAL scopes the setting to this transaction only.
      await this.writer.beginTransaction();
      await this.writer.execute('SET LOCAL enable_indexonlyscan = off');
      const rows = await this.writer.query<{ count: string | number }>(sql, params);
      await this.writer.commit();
      // PostgreSQL COUNT returns bigint as string in some drivers
      return typeof rows[0]?.count === 'string' ? parseInt(rows[0].count, 10) : (rows[0]?.count || 0);
    } catch (error) {
      try { await this.writer.rollback(); } catch { /* ignore rollback errors */ }
      logger.debug(`Count query failed for ${source.cloudTable}`, {
        error: toErrorMessage(error),
      });
      return -1;
    }
  }

  /**
   * Transform a cloud record for local insertion.
   * - Drops specified columns (source_env, embedding, sync_version)
   * - Renames columns per columnMap
   * - Applies type transforms (boolean→int, jsonb→text, etc.)
   */
  private transformRecord(row: Record<string, unknown>, source: PullSource): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      // Drop columns
      if (source.dropColumns?.includes(key)) {
        continue;
      }

      // Rename column if mapped
      const localKey = source.columnMap?.[key] || key;

      // Apply type transforms
      result[localKey] = this.transformValue(value, key, source.transforms);
    }

    // #1409: local NOT NULL columns the cloud has no column for.
    for (const [column, template] of Object.entries(source.fill ?? {})) {
      result[column] = template.replace('{env}', String(row.source_env ?? 'unknown'));
    }

    return result;
  }

  /**
   * Transform a single value based on configured transforms
   */
  private transformValue(
    value: unknown,
    columnName: string,
    transforms?: Record<string, string>,
  ): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    const transform = transforms?.[columnName];

    if (transform === 'boolean-to-int') {
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value === 'true' || value === 't') return 1;
      if (value === 'false' || value === 'f') return 0;
      return value;
    }

    if (transform === 'jsonb-to-text') {
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    }

    if (transform === 'json-string-to-text') {
      // #1407: a value an earlier writer stored JSON-quoted ("edit:ts").
      if (typeof value === 'string' && value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        try {
          const parsed: unknown = JSON.parse(value);
          if (typeof parsed === 'string') return parsed;
        } catch { /* not a JSON string literal; keep it */ }
      }
      return value;
    }

    if (transform === 'timestamptz-to-epoch-ms') {
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isNaN(ms) ? null : ms;
      }
      return value;
    }

    if (transform === 'timestamptz-to-text') {
      if (value instanceof Date) return value.toISOString();
      return value;
    }

    // Auto-convert JSONB objects to TEXT for SQLite
    if (typeof value === 'object' && !Buffer.isBuffer(value)) {
      return JSON.stringify(value);
    }

    // Auto-convert Date objects to ISO strings
    if (value instanceof Date) {
      return value.toISOString();
    }

    // Convert PostgreSQL booleans
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    return value;
  }

  /**
   * Find a timestamp column in a cloud table
   */
  private async findTimestampColumn(safeTable: string): Promise<string | null> {
    const candidates = ['updated_at', 'created_at', 'last_update', 'last_used_at'];

    try {
      // Query information_schema for column names
      const schema = safeTable.split('.')[0];
      const table = safeTable.split('.')[1];
      const rows = await this.writer.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         AND data_type IN ('timestamp with time zone', 'timestamp without time zone')`,
        [schema, table],
      );

      const columnNames = rows.map(r => r.column_name);
      for (const candidate of candidates) {
        if (columnNames.includes(candidate)) {
          return candidate;
        }
      }
      // Return first timestamp column if no candidate matches
      return columnNames[0] || null;
    } catch {
      return null;
    }
  }
}

/**
 * Create a PostgreSQL reader
 */
export function createPostgresReader(config: PostgresReaderConfig): PostgresReader {
  return new PostgresReader(config);
}
