/**
 * SQLite Nervous System Store
 *
 * Persists nervous system component state to SQLite database.
 * Uses the existing SwarmMemoryManager's database connection.
 *
 * @module nervous-system/persistence/SQLiteNervousSystemStore
 */

import type Database from 'better-sqlite3';
import type {
  INervousSystemStore,
  NervousSystemComponent,
  HdcSerializedState,
  BTSPSerializedState,
  CircadianSerializedState,
  StoredStateMetadata,
} from './INervousSystemStore.js';
import { Logger } from '../../utils/Logger.js';

/**
 * Configuration for SQLiteNervousSystemStore
 */
export interface SQLiteNervousSystemStoreConfig {
  /** Database instance to use (from SwarmMemoryManager) */
  db?: Database.Database;
  /** Path to database file (if db not provided) */
  dbPath?: string;
  /** Table name prefix (default: 'nervous_system') */
  tablePrefix?: string;
}

/**
 * SQLite implementation of nervous system state storage
 */
export class SQLiteNervousSystemStore implements INervousSystemStore {
  private readonly logger: Logger;
  private db: Database.Database | null = null;
  private readonly config: Required<SQLiteNervousSystemStoreConfig>;
  private initialized = false;

  // Prepared statements for performance
  private stmtSaveState: Database.Statement | null = null;
  private stmtLoadState: Database.Statement | null = null;
  private stmtDeleteState: Database.Statement | null = null;
  private stmtDeleteAllState: Database.Statement | null = null;
  private stmtListAgents: Database.Statement | null = null;
  private stmtGetMetadata: Database.Statement | null = null;

  constructor(config: SQLiteNervousSystemStoreConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      db: config.db ?? null as unknown as Database.Database,
      dbPath: config.dbPath ?? '.agentic-qe/memory.db',
      tablePrefix: config.tablePrefix ?? 'nervous_system',
    };
  }

  /**
   * Initialize the store - create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get database connection
      if (this.config.db) {
        this.db = this.config.db;
      } else {
        // Dynamic import to avoid issues if better-sqlite3 not available
        const BetterSqlite3 = (await import('better-sqlite3')).default;
        this.db = new BetterSqlite3(this.config.dbPath);
      }

      // Create table
      this.createTables();

      // Prepare statements
      this.prepareStatements();

      this.initialized = true;
      this.logger.info('SQLiteNervousSystemStore initialized', {
        dbPath: this.config.dbPath,
        tablePrefix: this.config.tablePrefix,
      });
    } catch (error) {
      this.logger.error('Failed to initialize SQLiteNervousSystemStore:', error);
      throw new Error(`SQLiteNervousSystemStore initialization failed: ${error}`);
    }
  }

  /**
   * Create required tables
   */
  private createTables(): void {
    const tableName = `${this.config.tablePrefix}_state`;

    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        agent_id TEXT NOT NULL,
        component TEXT NOT NULL,
        state_data BLOB,
        state_json TEXT,
        version INTEGER DEFAULT 1,
        size_bytes INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (agent_id, component)
      );

      CREATE INDEX IF NOT EXISTS idx_${this.config.tablePrefix}_agent
        ON ${tableName}(agent_id);

      CREATE INDEX IF NOT EXISTS idx_${this.config.tablePrefix}_component
        ON ${tableName}(component);

      CREATE INDEX IF NOT EXISTS idx_${this.config.tablePrefix}_updated
        ON ${tableName}(updated_at);
    `);
  }

  /**
   * Prepare SQL statements for reuse
   */
  private prepareStatements(): void {
    const tableName = `${this.config.tablePrefix}_state`;

    this.stmtSaveState = this.db!.prepare(`
      INSERT INTO ${tableName} (agent_id, component, state_data, state_json, version, size_bytes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, component) DO UPDATE SET
        state_data = excluded.state_data,
        state_json = excluded.state_json,
        version = excluded.version,
        size_bytes = excluded.size_bytes,
        updated_at = excluded.updated_at
    `);

    this.stmtLoadState = this.db!.prepare(`
      SELECT state_data, state_json, version, size_bytes, created_at, updated_at
      FROM ${tableName}
      WHERE agent_id = ? AND component = ?
    `);

    this.stmtDeleteState = this.db!.prepare(`
      DELETE FROM ${tableName}
      WHERE agent_id = ? AND component = ?
    `);

    this.stmtDeleteAllState = this.db!.prepare(`
      DELETE FROM ${tableName}
      WHERE agent_id = ?
    `);

    this.stmtListAgents = this.db!.prepare(`
      SELECT DISTINCT agent_id FROM ${tableName}
    `);

    this.stmtGetMetadata = this.db!.prepare(`
      SELECT agent_id, component, version, size_bytes, created_at, updated_at
      FROM ${tableName}
      WHERE agent_id = ?
    `);
  }

  /**
   * Ensure store is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('SQLiteNervousSystemStore not initialized. Call initialize() first.');
    }
  }

  /**
   * Shutdown the store
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Don't close db if it was passed in externally
      if (!this.config.db && this.db) {
        this.db.close();
      }

      this.db = null;
      this.stmtSaveState = null;
      this.stmtLoadState = null;
      this.stmtDeleteState = null;
      this.stmtDeleteAllState = null;
      this.stmtListAgents = null;
      this.stmtGetMetadata = null;
      this.initialized = false;

      this.logger.info('SQLiteNervousSystemStore shutdown complete');
    } catch (error) {
      this.logger.error('Error during SQLiteNervousSystemStore shutdown:', error);
    }
  }

  // ============================================
  // HDC State Operations
  // ============================================

  async saveHdcState(agentId: string, state: HdcSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      // Serialize state to binary (for patterns) and JSON (for metadata)
      const stateJson = JSON.stringify({
        version: state.version,
        dimension: state.dimension,
        serializedAt: state.serializedAt,
        patternCount: state.patterns.length,
        codebookSizes: {
          type: state.codebooks.type.length,
          domain: state.codebooks.domain.length,
          framework: state.codebooks.framework.length,
        },
      });

      // Pack binary data (codebooks, role vectors, patterns)
      const stateData = this.packHdcBinaryData(state);

      this.stmtSaveState!.run(
        agentId,
        'hdc',
        stateData,
        stateJson,
        state.version,
        stateData.length,
        Date.now()
      );

      this.logger.debug('Saved HDC state', { agentId, size: stateData.length });
    } catch (error) {
      this.logger.error('Failed to save HDC state:', error);
      throw error;
    }
  }

  async loadHdcState(agentId: string): Promise<HdcSerializedState | null> {
    this.ensureInitialized();

    try {
      const row = this.stmtLoadState!.get(agentId, 'hdc') as {
        state_data: Buffer | null;
        state_json: string | null;
        version: number;
      } | undefined;

      if (!row || !row.state_data) {
        return null;
      }

      // Unpack binary data
      const state = this.unpackHdcBinaryData(
        row.state_data,
        JSON.parse(row.state_json || '{}')
      );

      this.logger.debug('Loaded HDC state', { agentId, patterns: state.patterns.length });
      return state;
    } catch (error) {
      this.logger.error('Failed to load HDC state:', error);
      throw error;
    }
  }

  async deleteHdcState(agentId: string): Promise<void> {
    this.ensureInitialized();
    this.stmtDeleteState!.run(agentId, 'hdc');
    this.logger.debug('Deleted HDC state', { agentId });
  }

  // ============================================
  // BTSP State Operations
  // ============================================

  async saveBtspState(agentId: string, state: BTSPSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      // Store as JSON since all data is numeric arrays
      const stateJson = JSON.stringify(state);
      const sizeBytes = stateJson.length;

      this.stmtSaveState!.run(
        agentId,
        'btsp',
        null,  // No binary data needed
        stateJson,
        state.version,
        sizeBytes,
        Date.now()
      );

      this.logger.debug('Saved BTSP state', { agentId, size: sizeBytes });
    } catch (error) {
      this.logger.error('Failed to save BTSP state:', error);
      throw error;
    }
  }

  async loadBtspState(agentId: string): Promise<BTSPSerializedState | null> {
    this.ensureInitialized();

    try {
      const row = this.stmtLoadState!.get(agentId, 'btsp') as {
        state_json: string | null;
      } | undefined;

      if (!row || !row.state_json) {
        return null;
      }

      const state = JSON.parse(row.state_json) as BTSPSerializedState;
      this.logger.debug('Loaded BTSP state', { agentId, associations: state.associationCount });
      return state;
    } catch (error) {
      this.logger.error('Failed to load BTSP state:', error);
      throw error;
    }
  }

  async deleteBtspState(agentId: string): Promise<void> {
    this.ensureInitialized();
    this.stmtDeleteState!.run(agentId, 'btsp');
    this.logger.debug('Deleted BTSP state', { agentId });
  }

  // ============================================
  // Circadian State Operations
  // ============================================

  async saveCircadianState(agentId: string, state: CircadianSerializedState): Promise<void> {
    this.ensureInitialized();

    try {
      const stateJson = JSON.stringify(state);
      const sizeBytes = stateJson.length;

      this.stmtSaveState!.run(
        agentId,
        'circadian',
        null,
        stateJson,
        state.version,
        sizeBytes,
        Date.now()
      );

      this.logger.debug('Saved Circadian state', {
        agentId,
        phase: state.state.phase,
        size: sizeBytes,
      });
    } catch (error) {
      this.logger.error('Failed to save Circadian state:', error);
      throw error;
    }
  }

  async loadCircadianState(agentId: string): Promise<CircadianSerializedState | null> {
    this.ensureInitialized();

    try {
      const row = this.stmtLoadState!.get(agentId, 'circadian') as {
        state_json: string | null;
      } | undefined;

      if (!row || !row.state_json) {
        return null;
      }

      const state = JSON.parse(row.state_json) as CircadianSerializedState;
      this.logger.debug('Loaded Circadian state', { agentId, phase: state.state.phase });
      return state;
    } catch (error) {
      this.logger.error('Failed to load Circadian state:', error);
      throw error;
    }
  }

  async deleteCircadianState(agentId: string): Promise<void> {
    this.ensureInitialized();
    this.stmtDeleteState!.run(agentId, 'circadian');
    this.logger.debug('Deleted Circadian state', { agentId });
  }

  // ============================================
  // Bulk Operations
  // ============================================

  async deleteAllState(agentId: string): Promise<void> {
    this.ensureInitialized();
    this.stmtDeleteAllState!.run(agentId);
    this.logger.info('Deleted all state', { agentId });
  }

  async listAgents(): Promise<string[]> {
    this.ensureInitialized();

    const rows = this.stmtListAgents!.all() as Array<{ agent_id: string }>;
    return rows.map((r) => r.agent_id);
  }

  async getStateMetadata(
    agentId: string,
    component?: NervousSystemComponent
  ): Promise<StoredStateMetadata[]> {
    this.ensureInitialized();

    let rows: Array<{
      agent_id: string;
      component: string;
      version: number;
      size_bytes: number;
      created_at: number;
      updated_at: number;
    }>;

    if (component) {
      rows = [this.stmtLoadState!.get(agentId, component) as any].filter(Boolean);
    } else {
      rows = this.stmtGetMetadata!.all(agentId) as any;
    }

    return rows.map((row) => ({
      agentId: row.agent_id,
      component: row.component as NervousSystemComponent,
      version: row.version,
      sizeBytes: row.size_bytes,
      storedAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  // ============================================
  // Store Information
  // ============================================

  getStoreInfo(): {
    type: 'sqlite' | 'supabase' | 'file' | 'memory';
    version: string;
    location?: string;
  } {
    return {
      type: 'sqlite',
      version: '1.0.0',
      location: this.config.dbPath,
    };
  }

  // ============================================
  // Binary Packing Utilities
  // ============================================

  /**
   * Pack HDC state into a single binary buffer
   * Format:
   *   [4 bytes: dimension]
   *   [4 bytes: num type codebook entries]
   *   [... type codebook entries: key length (2) + key + vector (1250)]
   *   [4 bytes: num domain codebook entries]
   *   [... domain codebook entries]
   *   [4 bytes: num framework codebook entries]
   *   [... framework codebook entries]
   *   [4 × 1250 bytes: role vectors]
   *   [4 bytes: num patterns]
   *   [... patterns: key length (2) + key + vector (1250)]
   */
  private packHdcBinaryData(state: HdcSerializedState): Buffer {
    const chunks: Buffer[] = [];

    // Helper to write codebook
    const writeCodebook = (entries: Array<[string, Uint8Array]>) => {
      const countBuf = Buffer.alloc(4);
      countBuf.writeUInt32LE(entries.length);
      chunks.push(countBuf);

      for (const [key, vector] of entries) {
        const keyBuf = Buffer.from(key, 'utf8');
        const keyLenBuf = Buffer.alloc(2);
        keyLenBuf.writeUInt16LE(keyBuf.length);
        chunks.push(keyLenBuf);
        chunks.push(keyBuf);
        chunks.push(Buffer.from(vector));
      }
    };

    // Dimension
    const dimBuf = Buffer.alloc(4);
    dimBuf.writeUInt32LE(state.dimension);
    chunks.push(dimBuf);

    // Codebooks
    writeCodebook(state.codebooks.type);
    writeCodebook(state.codebooks.domain);
    writeCodebook(state.codebooks.framework);

    // Role vectors
    chunks.push(Buffer.from(state.roleVectors.type));
    chunks.push(Buffer.from(state.roleVectors.domain));
    chunks.push(Buffer.from(state.roleVectors.content));
    chunks.push(Buffer.from(state.roleVectors.framework));

    // Patterns
    const patternCountBuf = Buffer.alloc(4);
    patternCountBuf.writeUInt32LE(state.patterns.length);
    chunks.push(patternCountBuf);

    for (const pattern of state.patterns) {
      const keyBuf = Buffer.from(pattern.key, 'utf8');
      const keyLenBuf = Buffer.alloc(2);
      keyLenBuf.writeUInt16LE(keyBuf.length);
      chunks.push(keyLenBuf);
      chunks.push(keyBuf);
      chunks.push(Buffer.from(pattern.vector));
      // Note: metadata is stored in JSON, not binary
    }

    return Buffer.concat(chunks);
  }

  /**
   * Unpack HDC state from binary buffer
   */
  private unpackHdcBinaryData(
    data: Buffer,
    metadata: { dimension?: number; patternCount?: number }
  ): HdcSerializedState {
    let offset = 0;

    const readUInt32 = (): number => {
      const val = data.readUInt32LE(offset);
      offset += 4;
      return val;
    };

    const readUInt16 = (): number => {
      const val = data.readUInt16LE(offset);
      offset += 2;
      return val;
    };

    const readBytes = (len: number): Uint8Array => {
      const buf = data.slice(offset, offset + len);
      offset += len;
      return new Uint8Array(buf);
    };

    const readString = (len: number): string => {
      const buf = data.slice(offset, offset + len);
      offset += len;
      return buf.toString('utf8');
    };

    // Helper to read codebook
    const readCodebook = (vectorSize: number): Array<[string, Uint8Array]> => {
      const count = readUInt32();
      const entries: Array<[string, Uint8Array]> = [];

      for (let i = 0; i < count; i++) {
        const keyLen = readUInt16();
        const key = readString(keyLen);
        const vector = readBytes(vectorSize);
        entries.push([key, vector]);
      }

      return entries;
    };

    // Dimension
    const dimension = readUInt32();
    const vectorSize = dimension / 8;

    // Codebooks
    const typeCodebook = readCodebook(vectorSize);
    const domainCodebook = readCodebook(vectorSize);
    const frameworkCodebook = readCodebook(vectorSize);

    // Role vectors
    const roleVectors = {
      type: readBytes(vectorSize),
      domain: readBytes(vectorSize),
      content: readBytes(vectorSize),
      framework: readBytes(vectorSize),
    };

    // Patterns
    const patternCount = readUInt32();
    const patterns: HdcSerializedState['patterns'] = [];

    for (let i = 0; i < patternCount; i++) {
      const keyLen = readUInt16();
      const key = readString(keyLen);
      const vector = readBytes(vectorSize);
      patterns.push({ key, vector });
    }

    return {
      version: 1,
      dimension,
      codebooks: {
        type: typeCodebook,
        domain: domainCodebook,
        framework: frameworkCodebook,
      },
      roleVectors,
      patterns,
      serializedAt: Date.now(),
    };
  }
}

/**
 * Factory function to create SQLite store
 */
export function createSQLiteNervousSystemStore(
  config?: SQLiteNervousSystemStoreConfig
): SQLiteNervousSystemStore {
  return new SQLiteNervousSystemStore(config);
}
