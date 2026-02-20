/**
 * PostgreSQL Cloud Writer
 *
 * Writes data to cloud PostgreSQL database.
 * Handles upserts, transactions, and batch operations.
 *
 * Note: Uses pg module for PostgreSQL connections.
 * Since pg is not in dependencies, this provides a mock implementation
 * that can be replaced with actual pg operations when needed.
 */

import type { CloudWriter, UpsertOptions, CloudConfig } from '../interfaces.js';
import type { TunnelManager } from './tunnel-manager.js';
import { validateIdentifier } from '../../shared/sql-safety.js';
import { toErrorMessage } from '../../shared/error-utils.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('postgres-writer');

// Note: pg module is optional - will use mock if not available

/**
 * PostgreSQL writer configuration
 */
export interface PostgresWriterConfig {
  /** Cloud configuration */
  cloud: CloudConfig;

  /** Tunnel manager */
  tunnelManager: TunnelManager;

  /** Connection pool size */
  poolSize?: number;

  /** Connection timeout in ms */
  connectionTimeout?: number;
}

/**
 * Mock PostgreSQL client interface
 * Replace with actual pg.Client when pg is installed
 */
interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  end(): Promise<void>;
}

/**
 * PostgreSQL writer implementation
 */
export class PostgresWriter implements CloudWriter {
  private client: PgClient | null = null;
  private readonly config: PostgresWriterConfig;
  private inTransaction = false;
  private connected = false;

  constructor(config: PostgresWriterConfig) {
    this.config = config;
  }

  /**
   * Connect to cloud database
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    // Ensure tunnel is active
    if (!this.config.tunnelManager.isActive()) {
      await this.config.tunnelManager.start();
    }

    const connection = this.config.tunnelManager.getConnection();
    if (!connection) {
      throw new Error('No tunnel connection available');
    }

    // Try to dynamically import pg (optional dependency)
    try {
      const pg = await import('pg');
      const Client = pg.Client || pg.default?.Client;

      if (Client) {
        const connectionConfig = {
          host: connection.host,
          port: connection.port,
          database: this.config.cloud.database,
          user: this.config.cloud.user,
          password: process.env.PGPASSWORD || '',
          connectionTimeoutMillis: this.config.connectionTimeout || 10000,
        };

        this.client = new Client(connectionConfig) as PgClient;
        await this.client.connect();
        this.connected = true;
        console.log(`[PostgresWriter] Connected to ${connection.host}:${connection.port}/${this.config.cloud.database}`);
      } else {
        throw new Error('pg Client not found');
      }
    } catch (e) {
      // pg module not available - use mock mode
      logger.debug('pg module not available, using mock mode', { error: e instanceof Error ? e.message : String(e) });
      console.warn('[PostgresWriter] pg module not available, running in mock mode');
      this.client = this.createMockClient();
      this.connected = true;
    }
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.query('BEGIN');
    this.inTransaction = true;
  }

  /**
   * Commit transaction
   */
  async commit(): Promise<void> {
    if (!this.client || !this.inTransaction) {
      throw new Error('No active transaction');
    }
    await this.client.query('COMMIT');
    this.inTransaction = false;
  }

  /**
   * Rollback transaction
   */
  async rollback(): Promise<void> {
    if (!this.client || !this.inTransaction) {
      return;
    }
    await this.client.query('ROLLBACK');
    this.inTransaction = false;
  }

  /**
   * Upsert records to a table
   */
  async upsert<T>(table: string, records: T[], options?: UpsertOptions): Promise<number> {
    if (!this.client) {
      throw new Error('Not connected');
    }

    if (records.length === 0) {
      return 0;
    }

    // Get columns from first record
    const firstRecord = records[0] as Record<string, unknown>;
    const columns = Object.keys(firstRecord);

    // Build upsert SQL
    const conflictColumns = options?.conflictColumns || this.inferConflictColumns(table, columns);
    const updateColumns = options?.updateColumns || columns.filter(c => !conflictColumns.includes(c));

    let totalInserted = 0;

    // Process in batches with error recovery per batch
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      try {
        const inserted = await this.upsertBatch(table, batch, columns, conflictColumns, updateColumns, options?.skipIfExists);
        totalInserted += inserted;
      } catch (error) {
        // Retry failed batch with individual inserts (handles oversized batches and isolated bad records)
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(records.length / batchSize);
        logger.debug(`Batch ${batchNum}/${totalBatches} failed for ${table}, retrying individually`, { error: toErrorMessage(error) });
        let recovered = 0;
        for (const record of batch) {
          try {
            const inserted = await this.upsertBatch(table, [record], columns, conflictColumns, updateColumns, options?.skipIfExists);
            recovered += inserted;
          } catch (retryError) {
            // Skip this individual record
            const recordId = (record as Record<string, unknown>)['id'] || (record as Record<string, unknown>)['key'] || '?';
            logger.debug(`Skipped record ${String(recordId).slice(0, 50)} in ${table}`, { error: toErrorMessage(retryError) });
          }
        }
        totalInserted += recovered;
        if (recovered < batch.length) {
          console.warn(`[PostgresWriter] Batch ${batchNum}/${totalBatches} for ${table}: ${recovered}/${batch.length} recovered (${batch.length - recovered} skipped)`);
        }
      }
    }

    return totalInserted;
  }

  /**
   * Upsert a batch of records
   */
  private async upsertBatch<T>(
    table: string,
    records: T[],
    columns: string[],
    conflictColumns: string[],
    updateColumns: string[],
    skipIfExists?: boolean
  ): Promise<number> {
    if (!this.client) return 0;

    // Build VALUES placeholders
    const valuePlaceholders: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const record of records) {
      const recordValues: string[] = [];
      for (const col of columns) {
        const value = (record as Record<string, unknown>)[col];
        recordValues.push(`$${paramIndex++}`);
        params.push(this.serializeValue(value, col));
      }
      valuePlaceholders.push(`(${recordValues.join(', ')})`);
    }

    // Validate all identifiers before interpolating into SQL
    const safeTable = validateIdentifier(table);
    const safeColumns = columns.map(validateIdentifier);
    const safeConflictColumns = conflictColumns.map(validateIdentifier);
    const safeUpdateColumns = updateColumns.map(validateIdentifier);

    // Build ON CONFLICT clause (only when conflict columns are inferred/specified)
    let conflictClause = '';
    if (safeConflictColumns.length > 0) {
      if (skipIfExists) {
        conflictClause = `ON CONFLICT (${safeConflictColumns.join(', ')}) DO NOTHING`;
      } else if (safeUpdateColumns.length > 0) {
        const updateSet = safeUpdateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
        conflictClause = `ON CONFLICT (${safeConflictColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
      }
    }
    // No ON CONFLICT for tables without a matching constraint (plain INSERT)

    const sql = `
      INSERT INTO ${safeTable} (${safeColumns.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      ${conflictClause}
    `;

    try {
      const result = await this.client.query(sql, params);
      return result.rowCount || 0;
    } catch (error) {
      logger.debug(`Upsert failed for ${table}`, { error: toErrorMessage(error) });
      throw error;
    }
  }

  /**
   * Execute raw SQL
   */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.query(sql, params);
  }

  /**
   * Query records
   */
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const result = await this.client.query(sql, params);
    return result.rows as T[];
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.inTransaction) {
      await this.rollback();
    }

    if (this.client) {
      await this.client.end();
      this.client = null;
      this.connected = false;
      console.log('[PostgresWriter] Connection closed');
    }
  }

  /**
   * Serialize value for PostgreSQL
   */
  private serializeValue(value: unknown, columnName?: string): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle BLOB embeddings (Buffer)
    if (Buffer.isBuffer(value)) {
      // Try to deserialize as Float32Array
      try {
        const floats = new Float32Array(value.buffer, value.byteOffset, value.length / 4);
        if (floats.length > 0 && floats.length <= 1024) {
          return `[${Array.from(floats).join(',')}]`;
        }
      } catch (e) {
        // Not a valid float array
        logger.debug('Buffer to float array conversion failed', { error: e instanceof Error ? e.message : String(e) });
      }
      return null;  // Skip invalid embeddings
    }

    // Handle Unix timestamps (milliseconds) - convert to ISO string for TIMESTAMPTZ
    if (typeof value === 'number') {
      // Check if it looks like a Unix millisecond timestamp (13+ digits, > year 2000)
      if (value > 946684800000 && value < 4102444800000) {
        // Looks like a millisecond timestamp (between year 2000 and 2100)
        return new Date(value).toISOString();
      }
      // Check if it's a Unix seconds timestamp (10 digits, > year 2000)
      if (value > 946684800 && value < 4102444800) {
        return new Date(value * 1000).toISOString();
      }
      return value;
    }

    if (Array.isArray(value)) {
      // Check if it's a number array (embedding)
      if (value.length > 0 && typeof value[0] === 'number') {
        // Format as PostgreSQL vector
        return `[${value.join(',')}]`;
      }
      return JSON.stringify(value);
    }

    if (typeof value === 'object') {
      let jsonStr = JSON.stringify(value);
      if (columnName && this.isJsonbColumn(columnName)) {
        // Remove NUL chars (PostgreSQL JSONB rejects \u0000)
        jsonStr = jsonStr.replace(/\u0000/g, '');
        try {
          JSON.parse(jsonStr);
        } catch {
          return JSON.stringify(String(value));
        }
      }
      return jsonStr;
    }

    // Handle string values
    if (typeof value === 'string') {
      // Empty strings in timestamp columns → NULL (PostgreSQL rejects '' for TIMESTAMPTZ)
      if (value === '') {
        const timestampColumns = ['created_at', 'updated_at', 'last_used_at', 'started_at',
                                  'ended_at', 'completed_at', 'expires_at', 'last_update'];
        if (columnName && timestampColumns.includes(columnName)) {
          return null;
        }
      }

      // Check if it's already an ISO date string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return value;
      }
      // Check if it's a numeric string that looks like a timestamp
      const numVal = parseInt(value, 10);
      if (!isNaN(numVal) && numVal > 946684800000 && numVal < 4102444800000) {
        return new Date(numVal).toISOString();
      }
      // JSONB columns: validate JSON, sanitize NUL chars, wrap if invalid
      if (columnName && this.isJsonbColumn(columnName)) {
        const sanitized = value.replace(/\u0000/g, '');
        try {
          JSON.parse(sanitized);
          return sanitized;
        } catch {
          return JSON.stringify(sanitized);
        }
      }
    }

    return value;
  }

  /**
   * Check if a column is a JSONB column
   */
  private isJsonbColumn(columnName: string): boolean {
    const jsonbColumns = ['action_value', 'state', 'action', 'next_state', 'preconditions', 'effects',
                         'metadata', 'value', 'payload', 'context_json', 'template_json', 'execution_trace',
                         'action_sequence', 'initial_state', 'goal_state', 'sequence',
                         'task_json', 'decision_json', 'steps_json', 'metadata_json'];
    return jsonbColumns.includes(columnName);
  }

  /**
   * Infer conflict columns from table name and available columns.
   * Only returns columns if the target table is known to have a matching unique constraint.
   */
  private inferConflictColumns(table: string, columns: string[]): string[] {
    // Extract table name without schema
    const tableName = table.includes('.') ? table.split('.')[1] : table;

    // Tables with TEXT id primary key (most AQE tables)
    const tablesWithIdPK = [
      'qe_patterns', 'sona_patterns', 'goap_actions', 'goap_plans',
      'patterns', 'events', 'routing_outcomes', 'qe_trajectories',
      'dream_insights', 'intelligence_memories',
    ];
    if (columns.includes('id') && tablesWithIdPK.includes(tableName)) {
      return ['id'];
    }

    // memory_entries: unique(key, partition, source_env)
    if (tableName === 'memory_entries' && columns.includes('key') && columns.includes('source_env')) {
      if (columns.includes('partition')) {
        return ['key', 'partition', 'source_env'];
      }
      return ['key', 'source_env'];
    }

    // claude_flow_memory: unique(key, source_env)
    if (tableName === 'claude_flow_memory' && columns.includes('key') && columns.includes('source_env')) {
      return ['key', 'source_env'];
    }

    // qlearning_patterns: unique(state, action, source_env)
    if (tableName === 'qlearning_patterns' && columns.includes('state') && columns.includes('action') && columns.includes('source_env')) {
      return ['state', 'action', 'source_env'];
    }

    // claude_flow_workers: unique(worker_type, source_env)
    if (tableName === 'claude_flow_workers' && columns.includes('worker_type') && columns.includes('source_env')) {
      return ['worker_type', 'source_env'];
    }

    // No conflict columns → plain INSERT (no ON CONFLICT clause)
    return [];
  }

  /**
   * Create mock client for testing without pg installed
   */
  private createMockClient(): PgClient {
    const mockRows: unknown[] = [];
    return {
      async connect() {
        console.log('[MockPgClient] Connected (mock mode)');
      },
      async query(sql: string, params?: unknown[]) {
        console.log(`[MockPgClient] Query: ${sql.slice(0, 100)}... (${params?.length || 0} params)`);
        return { rows: mockRows, rowCount: 0 };
      },
      async end() {
        console.log('[MockPgClient] Disconnected (mock mode)');
      },
    };
  }
}

/**
 * Create a PostgreSQL writer
 */
export function createPostgresWriter(config: PostgresWriterConfig): PostgresWriter {
  return new PostgresWriter(config);
}
