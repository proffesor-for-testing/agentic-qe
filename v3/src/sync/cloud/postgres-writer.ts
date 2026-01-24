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
      // @ts-expect-error - pg is an optional dependency
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
    } catch {
      // pg module not available - use mock mode
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

    // Process in batches
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const inserted = await this.upsertBatch(table, batch, columns, conflictColumns, updateColumns, options?.skipIfExists);
      totalInserted += inserted;
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

    // Build ON CONFLICT clause
    let conflictClause = '';
    if (conflictColumns.length > 0) {
      if (skipIfExists) {
        conflictClause = `ON CONFLICT (${conflictColumns.join(', ')}) DO NOTHING`;
      } else if (updateColumns.length > 0) {
        const updateSet = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
        conflictClause = `ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet}`;
      }
    }

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      ${conflictClause}
    `;

    try {
      const result = await this.client.query(sql, params);
      return result.rowCount || 0;
    } catch (error) {
      console.error(`[PostgresWriter] Upsert failed: ${error instanceof Error ? error.message : String(error)}`);
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
      } catch {
        // Not a valid float array
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
      return JSON.stringify(value);
    }

    // Handle string values
    if (typeof value === 'string') {
      // Check if it's already an ISO date string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return value;
      }
      // Check if it's a numeric string that looks like a timestamp
      const numVal = parseInt(value, 10);
      if (!isNaN(numVal) && numVal > 946684800000 && numVal < 4102444800000) {
        return new Date(numVal).toISOString();
      }
      // Check if it's a JSONB column name and wrap non-JSON strings
      const jsonbColumns = ['action_value', 'state', 'action', 'next_state', 'preconditions', 'effects',
                           'metadata', 'value', 'payload', 'context_json', 'template_json', 'execution_trace',
                           'action_sequence', 'initial_state', 'goal_state', 'sequence'];
      if (columnName && jsonbColumns.includes(columnName)) {
        // Check if it's already valid JSON
        if (!value.startsWith('{') && !value.startsWith('[') && !value.startsWith('"')) {
          // Wrap plain strings in quotes for JSONB
          return JSON.stringify(value);
        }
      }
    }

    return value;
  }

  /**
   * Infer conflict columns from table name
   */
  private inferConflictColumns(table: string, columns: string[]): string[] {
    // Extract table name without schema
    const tableName = table.includes('.') ? table.split('.')[1] : table;

    // Common patterns
    if (columns.includes('id')) {
      return ['id'];
    }

    if (columns.includes('key') && columns.includes('source_env')) {
      if (columns.includes('partition')) {
        return ['key', 'partition', 'source_env'];
      }
      return ['key', 'source_env'];
    }

    if (columns.includes('state') && columns.includes('action') && columns.includes('source_env')) {
      return ['state', 'action', 'source_env'];
    }

    if (columns.includes('worker_type') && columns.includes('source_env')) {
      return ['worker_type', 'source_env'];
    }

    // Default to id if present
    return columns.includes('id') ? ['id'] : [];
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
