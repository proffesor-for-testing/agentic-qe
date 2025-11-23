import BetterSqlite3 from 'better-sqlite3';
import { SecureRandom } from '../../utils/SecureRandom.js';
import * as path from 'path';
import * as fs from 'fs-extra';
import {
  AccessControl,
  AccessLevel,
  Permission,
  ACL,
  AccessControlError
} from './AccessControl';

// Re-export for external use
export { AccessLevel, Permission, ACL, AccessControlError };
import {
  AgentDBManager,
  createAgentDBManager,
  type AgentDBConfig
} from './AgentDBManager';
import { PatternCache } from './PatternCache';
import { memorySpanManager } from '../../telemetry/instrumentation/memory';
import { QEAgentType } from '../../types';

export interface MemoryEntry {
  key: string;
  value: any;
  partition?: string;
  ttl?: number;
  createdAt: number;
  expiresAt?: number;
  owner?: string;
  accessLevel?: AccessLevel;
  teamId?: string;
  swarmId?: string;
}

export interface StoreOptions {
  partition?: string;
  ttl?: number;
  metadata?: Record<string, any>;
  owner?: string;
  accessLevel?: AccessLevel;
  teamId?: string;
  swarmId?: string;
}

export interface RetrieveOptions {
  partition?: string;
  includeExpired?: boolean;
  agentId?: string;
  teamId?: string;
  swarmId?: string;
  isSystemAgent?: boolean;
}

export interface DeleteOptions {
  agentId?: string;
  teamId?: string;
  swarmId?: string;
  isSystemAgent?: boolean;
}

export interface Hint {
  key: string;
  value: any;
  ttl?: number;
  createdAt: number;
  expiresAt?: number;
}

// Table 3: Events
export interface Event {
  id?: string;
  type: string;
  payload: any;
  timestamp?: number;
  source: string;
  ttl?: number;
}

// Table 4: Workflow State
export interface WorkflowState {
  id: string;
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  checkpoint: any;
  sha: string;
  ttl?: number;
  createdAt?: number;
  updatedAt?: number;
}

// Table 5: Patterns
export interface Pattern {
  id?: string;
  pattern: string;
  confidence: number;
  usageCount: number;
  ttl?: number;
  metadata?: any;
  createdAt?: number;
}

// Table 6: Consensus State
export interface ConsensusProposal {
  id: string;
  decision: string;
  proposer: string;
  votes: string[];
  quorum: number;
  status: 'pending' | 'approved' | 'rejected';
  version?: number;
  ttl?: number;
  createdAt?: number;
}

// Table 7: Performance Metrics
export interface PerformanceMetric {
  id?: string;
  metric: string;
  value: number;
  unit: string;
  timestamp?: number;
  agentId?: string;
}

// Table 8: Artifacts
export interface Artifact {
  id: string;
  kind: 'code' | 'doc' | 'data' | 'config';
  path: string;
  sha256: string;
  tags: string[];
  metadata?: any;
  ttl?: number;
  createdAt?: number;
}

// Table 9: Sessions
export interface Session {
  id: string;
  mode: 'swarm' | 'hive-mind';
  state: any;
  checkpoints: Checkpoint[];
  createdAt?: number;
  lastResumed?: number;
}

export interface Checkpoint {
  timestamp: number;
  state: any;
  sha: string;
}

// Table 10: Agent Registry
export interface AgentRegistration {
  id: string;
  type: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'terminated';
  performance: any;
  createdAt?: number;
  updatedAt?: number;
}

// Table 11: GOAP State
export interface GOAPGoal {
  id: string;
  conditions: string[];
  cost: number;
  priority?: string;
  createdAt?: number;
}

export interface GOAPAction {
  id: string;
  preconditions: string[];
  effects: string[];
  cost: number;
  agentType?: string;
  createdAt?: number;
}

export interface GOAPPlan {
  id: string;
  goalId: string;
  sequence: string[];
  totalCost: number;
  createdAt?: number;
}

// Table 12: OODA Cycles
export interface OODACycle {
  id: string;
  phase: 'observe' | 'orient' | 'decide' | 'act';
  observations?: any;
  orientation?: any;
  decision?: any;
  action?: any;
  timestamp: number;
  completed?: boolean;
  result?: any;
}

/**
 * SwarmMemoryManager - Manages persistent memory for agent swarm coordination
 *
 * Features:
 * - SQLite-based persistent storage with 12-table schema
 * - Partitioned key-value store
 * - TTL-based expiration with different policies per table
 * - Hint/blackboard pattern support
 * - Pattern-based retrieval
 * - 5-level access control (private, team, swarm, public, system)
 * - Agent-based permissions (read, write, delete, share)
 * - Event stream tracking (30-day TTL)
 * - Workflow checkpointing (never expires)
 * - Consensus gating (7-day TTL)
 * - Artifact manifests (never expires)
 * - GOAP planning support
 * - OODA loop tracking
 * - Session resumability
 * - Agent lifecycle management
 */
export class SwarmMemoryManager {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;
  private initialized = false;
  private accessControl: AccessControl;
  private aclCache: Map<string, ACL>;
  private patternCache: PatternCache;
  private agentDBManager: AgentDBManager | null = null;
  private lastModifiedTimestamps: Map<string, number>; // Track entry modifications for sync

  // TTL policy constants (in seconds)
  private readonly TTL_POLICY = {
    artifacts: 0,           // Never expire
    shared: 1800,          // 30 minutes
    patterns: 604800,      // 7 days
    events: 2592000,       // 30 days
    workflow_state: 0,     // Never expire
    consensus: 604800      // 7 days
  };

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.accessControl = new AccessControl();
    this.aclCache = new Map();
    this.lastModifiedTimestamps = new Map();
    // Initialize pattern cache with LRU eviction (100 entries, 60s TTL)
    this.patternCache = new PatternCache({
      maxSize: 100,
      ttl: 60000,
      enableStats: true
    });
  }

  private run(sql: string, params: any[] = []): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    this.db.prepare(sql).run(...params);
  }

  private queryOne<T = any>(sql: string, params: any[] = []): T | undefined {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  private queryAll<T = any>(sql: string, params: any[] = []): T[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db.prepare(sql).all(...params) as T[];
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure directory exists for file-based DB
      if (this.dbPath !== ':memory:') {
        await fs.ensureDir(path.dirname(this.dbPath));
      }

      this.db = new BetterSqlite3(this.dbPath);
    } catch (error) {
      throw new Error(`Failed to create database connection: ${error}`);
    }

    // Create memory entries table with access control fields
    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        key TEXT NOT NULL,
        partition TEXT NOT NULL DEFAULT 'default',
        value TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        owner TEXT,
        access_level TEXT DEFAULT 'private',
        team_id TEXT,
        swarm_id TEXT,
        PRIMARY KEY (key, partition)
      )
    `);

    // Create ACL table for advanced permissions
    await this.run(`
      CREATE TABLE IF NOT EXISTS memory_acl (
        resource_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        access_level TEXT NOT NULL,
        team_id TEXT,
        swarm_id TEXT,
        granted_permissions TEXT,
        blocked_agents TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create hints table for blackboard pattern
    await this.run(`
      CREATE TABLE IF NOT EXISTS hints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);

    // Table 3: Events (TTL: 30 days)
    await this.run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        source TEXT NOT NULL,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.events},
        expires_at INTEGER
      )
    `);

    // Table 4: Workflow State (TTL: never expires)
    await this.run(`
      CREATE TABLE IF NOT EXISTS workflow_state (
        id TEXT PRIMARY KEY,
        step TEXT NOT NULL,
        status TEXT NOT NULL,
        checkpoint TEXT NOT NULL,
        sha TEXT NOT NULL,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.workflow_state},
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Table 5: Patterns (TTL: 7 days)
    await this.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        confidence REAL NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.patterns},
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        agent_id TEXT
      )
    `);

    // Create indexes for O(log n) pattern queries (Issue #57)
    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_patterns_agent_confidence
      ON patterns(agent_id, confidence DESC)
    `);
    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_patterns_agent
      ON patterns(agent_id)
    `);

    // Table 6: Consensus State (TTL: 7 days)
    await this.run(`
      CREATE TABLE IF NOT EXISTS consensus_state (
        id TEXT PRIMARY KEY,
        decision TEXT NOT NULL,
        proposer TEXT NOT NULL,
        votes TEXT NOT NULL,
        quorum INTEGER NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.consensus},
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    // Table 7: Performance Metrics
    await this.run(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        agent_id TEXT
      )
    `);

    // Table 8: Artifacts (TTL: never expires)
    await this.run(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        tags TEXT NOT NULL,
        metadata TEXT,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.artifacts},
        created_at INTEGER NOT NULL
      )
    `);

    // Table 9: Sessions (for resumability)
    await this.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        state TEXT NOT NULL,
        checkpoints TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_resumed INTEGER
      )
    `);

    // Table 10: Agent Registry
    await this.run(`
      CREATE TABLE IF NOT EXISTS agent_registry (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        capabilities TEXT NOT NULL,
        status TEXT NOT NULL,
        performance TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Table 11: GOAP State
    await this.run(`
      CREATE TABLE IF NOT EXISTS goap_goals (
        id TEXT PRIMARY KEY,
        conditions TEXT NOT NULL,
        cost INTEGER NOT NULL,
        priority TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY,
        preconditions TEXT NOT NULL,
        effects TEXT NOT NULL,
        cost INTEGER NOT NULL,
        agent_type TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        sequence TEXT NOT NULL,
        total_cost INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Table 12: OODA Cycles
    await this.run(`
      CREATE TABLE IF NOT EXISTS ooda_cycles (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL,
        observations TEXT,
        orientation TEXT,
        decision TEXT,
        action TEXT,
        timestamp INTEGER NOT NULL,
        completed INTEGER DEFAULT 0,
        result TEXT
      )
    `);

    // Create indexes for performance
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_partition ON memory_entries(partition)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_entries(owner)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_memory_access ON memory_entries(access_level)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_key ON hints(key)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_hints_expires ON hints(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_acl_owner ON memory_acl(owner)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_source ON events(source)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_events_expires ON events(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_state(status)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_patterns_expires ON patterns(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_consensus_status ON consensus_state(status)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_consensus_expires ON consensus_state(expires_at)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_metric ON performance_metrics(metric)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_agent ON performance_metrics(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_registry(status)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_ooda_phase ON ooda_cycles(phase)`);

    // Table 13: Q-values (Q-learning)
    await this.run(`
      CREATE TABLE IF NOT EXISTS q_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        action_key TEXT NOT NULL,
        q_value REAL NOT NULL DEFAULT 0,
        update_count INTEGER NOT NULL DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, state_key, action_key)
      )
    `);

    // Table 14: Learning Experiences
    await this.run(`
      CREATE TABLE IF NOT EXISTS learning_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        task_type TEXT NOT NULL,
        state TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state TEXT NOT NULL,
        episode_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table 15: Learning History (snapshots and metrics)
    await this.run(`
      CREATE TABLE IF NOT EXISTS learning_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        pattern_id TEXT,
        state_representation TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state_representation TEXT,
        q_value REAL,
        episode INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table 16: Learning Metrics (aggregated performance data)
    await this.run(`
      CREATE TABLE IF NOT EXISTS learning_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        metric_value REAL NOT NULL,
        window_start DATETIME,
        window_end DATETIME,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Learning indexes for performance
    await this.run(`CREATE INDEX IF NOT EXISTS idx_q_values_agent ON q_values(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_learning_exp_agent ON learning_experiences(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_learning_hist_agent ON learning_history(agent_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_learning_metrics_agent ON learning_metrics(agent_id)`);

    this.initialized = true;
  }

  /**
   * Store a key-value pair in memory with OpenTelemetry instrumentation
   *
   * Automatically instruments the memory store operation with distributed tracing.
   * Records namespace, key, value size, TTL, and operation performance metrics.
   *
   * @param key - Memory key
   * @param value - Value to store (will be JSON serialized)
   * @param options - Store options including partition, TTL, access control
   */
  async store(key: string, value: any, options: StoreOptions = {}): Promise<void> {
    // Auto-initialize if not initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Memory manager not initialized. Call initialize() first.');
    }

    const partition = options.partition || 'default';
    const owner = options.owner || 'system';
    const accessLevel = options.accessLevel || AccessLevel.PRIVATE;
    const valueJson = JSON.stringify(value);
    const valueSize = valueJson.length;

    // Create instrumentation span
    const { span, context: spanContext } = memorySpanManager.startStoreSpan({
      agentId: { id: owner, type: QEAgentType.FLEET_COMMANDER, created: new Date() },
      namespace: partition,
      key,
      valueSize,
      ttl: options.ttl,
    });

    const startTime = Date.now();

    try {
      const createdAt = Date.now();
      const expiresAt = options.ttl ? createdAt + (options.ttl * 1000) : null;
      const metadata = options.metadata ? JSON.stringify(options.metadata) : null;

      // Check write permission if updating existing entry
      const existing = await this.queryOne<any>(
        `SELECT owner, access_level, team_id, swarm_id FROM memory_entries WHERE key = ? AND partition = ?`,
        [key, partition]
      );

      if (existing && options.owner) {
        // Verify write permission
        const permCheck = this.accessControl.checkPermission({
          agentId: options.owner,
          resourceOwner: existing.owner,
          accessLevel: existing.access_level as AccessLevel,
          permission: Permission.WRITE,
          teamId: options.teamId,
          resourceTeamId: existing.team_id,
          swarmId: options.swarmId,
          resourceSwarmId: existing.swarm_id
        });

        if (!permCheck.allowed) {
          throw new AccessControlError(`Write denied: ${permCheck.reason}`);
        }
      }

      await this.run(
        `INSERT OR REPLACE INTO memory_entries
         (key, partition, value, metadata, created_at, expires_at, owner, access_level, team_id, swarm_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          key,
          partition,
          valueJson,
          metadata,
          createdAt,
          expiresAt,
          owner,
          accessLevel,
          options.teamId || null,
          options.swarmId || null
        ]
      );

      // Track modification for QUIC sync
      const entryKey = `${partition}:${key}`;
      this.lastModifiedTimestamps.set(entryKey, createdAt);

      // Complete span successfully
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeStoreSpan(span, {
        success: true,
        durationMs,
      });
    } catch (error) {
      // Complete span with error
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeStoreSpan(span, {
        success: false,
        durationMs,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Alias for store() method to maintain compatibility with MemoryStore interface
   * Used by VerificationHookManager and other components
   */
  async set(key: string, value: any, options: StoreOptions | string = {}): Promise<void> {
    // Handle legacy API: set(key, value, partition)
    if (typeof options === 'string') {
      return this.store(key, value, { partition: options });
    }
    return this.store(key, value, options);
  }

  /**
   * Alias for retrieve() method to maintain compatibility
   * Supports both options object and partition string
   */
  async get(key: string, options: RetrieveOptions | string = {}): Promise<any> {
    // Handle legacy API: get(key, partition)
    if (typeof options === 'string') {
      return this.retrieve(key, { partition: options });
    }
    return this.retrieve(key, options);
  }

  /**
   * Retrieve a value from memory with OpenTelemetry instrumentation
   *
   * Automatically instruments the memory retrieve operation with distributed tracing.
   * Records namespace, key, whether the value was found, value size, and performance metrics.
   *
   * @param key - Memory key
   * @param options - Retrieve options including partition, agentId for access control
   * @returns Retrieved value or null if not found
   */
  async retrieve(key: string, options: RetrieveOptions = {}): Promise<any> {
    // Auto-initialize if not initialized
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.db) {
      throw new Error('Memory manager not initialized. Call initialize() first.');
    }

    const partition = options.partition || 'default';
    const agentId = options.agentId || 'system';

    // Create instrumentation span
    const { span, context: spanContext } = memorySpanManager.startRetrieveSpan({
      agentId: { id: agentId, type: QEAgentType.FLEET_COMMANDER, created: new Date() },
      namespace: partition,
      key,
    });

    const startTime = Date.now();

    try {
      const now = Date.now();
      let query = `SELECT value, owner, access_level, team_id, swarm_id
                   FROM memory_entries WHERE key = ? AND partition = ?`;
      const params: any[] = [key, partition];

      if (!options.includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > ?)`;
        params.push(now);
      }

      const row = await this.queryOne<any>(query, params);

      if (!row) {
        // Complete span - not found
        const durationMs = Date.now() - startTime;
        memorySpanManager.completeRetrieveSpan(span, {
          found: false,
          durationMs,
        });
        return null;
      }

      // Check read permission if agentId provided
      if (options.agentId) {
        const permCheck = this.accessControl.checkPermission({
          agentId: options.agentId,
          resourceOwner: row.owner,
          accessLevel: row.access_level as AccessLevel,
          permission: Permission.READ,
          teamId: options.teamId,
          resourceTeamId: row.team_id,
          swarmId: options.swarmId,
          resourceSwarmId: row.swarm_id,
          isSystemAgent: options.isSystemAgent
        });

        if (!permCheck.allowed) {
          throw new AccessControlError(`Read denied: ${permCheck.reason}`);
        }
      }

      const valueSize = row.value.length;
      const parsedValue = JSON.parse(row.value);

      // Complete span successfully
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeRetrieveSpan(span, {
        found: true,
        valueSize,
        durationMs,
      });

      return parsedValue;
    } catch (error) {
      // Complete span with error
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeRetrieveSpan(span, {
        found: false,
        durationMs,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Query/search memory entries by pattern with OpenTelemetry instrumentation
   *
   * Automatically instruments the memory search operation with distributed tracing.
   * Records namespace, search pattern, result count, and performance metrics.
   *
   * @param pattern - SQL LIKE pattern for key matching
   * @param options - Retrieve options including partition, agentId for access control
   * @returns Array of matching memory entries
   */
  async query(pattern: string, options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const partition = options.partition || 'default';
    const agentId = options.agentId || 'system';

    // Create instrumentation span
    const { span, context: spanContext } = memorySpanManager.startSearchSpan({
      agentId: { id: agentId, type: QEAgentType.FLEET_COMMANDER, created: new Date() },
      namespace: partition,
      pattern,
    });

    const startTime = Date.now();

    try {
      const now = Date.now();
      let query = `SELECT key, value, partition, created_at, expires_at, owner, access_level, team_id, swarm_id
                   FROM memory_entries
                   WHERE partition = ? AND key LIKE ?`;
      const params: any[] = [partition, pattern];

      if (!options.includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > ?)`;
        params.push(now);
      }

      const rows = await this.queryAll<any>(query, params);

      // Filter by access control if agentId provided
      const filteredRows = options.agentId
        ? rows.filter((row: any) => {
            const permCheck = this.accessControl.checkPermission({
              agentId: options.agentId!,
              resourceOwner: row.owner,
              accessLevel: row.access_level as AccessLevel,
              permission: Permission.READ,
              teamId: options.teamId,
              resourceTeamId: row.team_id,
              swarmId: options.swarmId,
              resourceSwarmId: row.swarm_id,
              isSystemAgent: options.isSystemAgent
            });
            return permCheck.allowed;
          })
        : rows;

      const results = filteredRows.map((row: any) => ({
        key: row.key,
        value: JSON.parse(row.value),
        partition: row.partition,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        owner: row.owner,
        accessLevel: row.access_level as AccessLevel,
        teamId: row.team_id,
        swarmId: row.swarm_id
      }));

      // Complete span successfully
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeSearchSpan(span, {
        resultCount: results.length,
        durationMs,
      });

      return results;
    } catch (error) {
      // Complete span with error
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeSearchSpan(span, {
        resultCount: 0,
        durationMs,
        error: error as Error,
      });
      throw error;
    }
  }

  /**
   * Delete a key from memory with OpenTelemetry instrumentation
   *
   * Automatically instruments the memory delete operation with distributed tracing.
   * Records namespace, key, and operation performance metrics.
   *
   * @param key - Memory key to delete
   * @param partition - Memory partition (namespace)
   * @param options - Delete options including agentId for access control
   */
  async delete(key: string, partition: string = 'default', options: DeleteOptions = {}): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const agentId = options.agentId || 'system';

    // Create instrumentation span
    const { span, context: spanContext } = memorySpanManager.startDeleteSpan({
      agentId: { id: agentId, type: QEAgentType.FLEET_COMMANDER, created: new Date() },
      namespace: partition,
      key,
    });

    const startTime = Date.now();

    try {
      // Check delete permission if agentId provided
      if (options.agentId) {
        const row = await this.queryOne<any>(
          `SELECT owner, access_level, team_id, swarm_id FROM memory_entries WHERE key = ? AND partition = ?`,
          [key, partition]
        );

        if (row) {
          const permCheck = this.accessControl.checkPermission({
            agentId: options.agentId,
            resourceOwner: row.owner,
            accessLevel: row.access_level as AccessLevel,
            permission: Permission.DELETE,
            teamId: options.teamId,
            resourceTeamId: row.team_id,
            swarmId: options.swarmId,
            resourceSwarmId: row.swarm_id,
            isSystemAgent: options.isSystemAgent
          });

          if (!permCheck.allowed) {
            throw new AccessControlError(`Delete denied: ${permCheck.reason}`);
          }
        }
      }

      await this.run(`DELETE FROM memory_entries WHERE key = ? AND partition = ?`, [key, partition]);

      // Clean up ACL if exists
      const resourceId = `${partition}:${key}`;
      await this.run(`DELETE FROM memory_acl WHERE resource_id = ?`, [resourceId]);
      this.aclCache.delete(resourceId);

      // Complete span successfully
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeDeleteSpan(span, {
        success: true,
        durationMs,
      });
    } catch (error) {
      // Complete span with error
      const durationMs = Date.now() - startTime;
      memorySpanManager.completeDeleteSpan(span, {
        success: false,
        durationMs,
        error: error as Error,
      });
      throw error;
    }
  }

  async clear(partition: string = 'default'): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    await this.run(`DELETE FROM memory_entries WHERE partition = ?`, [partition]);
  }

  async postHint(hint: { key: string; value: any; ttl?: number }): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const createdAt = Date.now();
    const expiresAt = hint.ttl ? createdAt + (hint.ttl * 1000) : null;

    await this.run(
      `INSERT INTO hints (key, value, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      [hint.key, JSON.stringify(hint.value), createdAt, expiresAt]
    );
  }

  async readHints(pattern: string): Promise<Hint[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    const rows = await this.queryAll<any>(
      `SELECT key, value, created_at, expires_at
       FROM hints
       WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC`,
      [pattern, now]
    );

    return rows.map((row: any) => ({
      key: row.key,
      value: JSON.parse(row.value),
      createdAt: row.created_at,
      expiresAt: row.expires_at
    }));
  }

  async cleanExpired(): Promise<number> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    // Clean memory entries
    await this.run(
      `DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean hints
    await this.run(
      `DELETE FROM hints WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean events
    await this.run(
      `DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean patterns
    await this.run(
      `DELETE FROM patterns WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean consensus
    await this.run(
      `DELETE FROM consensus_state WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    return 0;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  async stats(): Promise<{
    totalEntries: number;
    totalHints: number;
    totalEvents: number;
    totalWorkflows: number;
    totalPatterns: number;
    totalConsensus: number;
    totalMetrics: number;
    totalArtifacts: number;
    totalSessions: number;
    totalAgents: number;
    totalGOAPGoals: number;
    totalGOAPActions: number;
    totalGOAPPlans: number;
    totalOODACycles: number;
    partitions: string[];
    accessLevels: Record<string, number>;
  }> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const entriesCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM memory_entries`);
    const hintsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM hints`);
    const eventsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM events`);
    const workflowsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM workflow_state`);
    const patternsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM patterns`);
    const consensusCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM consensus_state`);
    const metricsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM performance_metrics`);
    const artifactsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM artifacts`);
    const sessionsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM sessions`);
    const agentsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM agent_registry`);
    const goapGoalsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM goap_goals`);
    const goapActionsCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM goap_actions`);
    const goapPlansCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM goap_plans`);
    const oodaCyclesCount = await this.queryOne<{count: number}>(`SELECT COUNT(*) as count FROM ooda_cycles`);
    const partitionsResult = await this.queryAll<{partition: string}>(`SELECT DISTINCT partition FROM memory_entries`);
    const accessLevelsResult = await this.queryAll<{access_level: string; count: number}>(
      `SELECT access_level, COUNT(*) as count FROM memory_entries GROUP BY access_level`
    );

    const accessLevels: Record<string, number> = {};
    accessLevelsResult.forEach(row => {
      accessLevels[row.access_level] = row.count;
    });

    return {
      totalEntries: entriesCount?.count || 0,
      totalHints: hintsCount?.count || 0,
      totalEvents: eventsCount?.count || 0,
      totalWorkflows: workflowsCount?.count || 0,
      totalPatterns: patternsCount?.count || 0,
      totalConsensus: consensusCount?.count || 0,
      totalMetrics: metricsCount?.count || 0,
      totalArtifacts: artifactsCount?.count || 0,
      totalSessions: sessionsCount?.count || 0,
      totalAgents: agentsCount?.count || 0,
      totalGOAPGoals: goapGoalsCount?.count || 0,
      totalGOAPActions: goapActionsCount?.count || 0,
      totalGOAPPlans: goapPlansCount?.count || 0,
      totalOODACycles: oodaCyclesCount?.count || 0,
      partitions: partitionsResult.map((row) => row.partition),
      accessLevels
    };
  }

  // ============================================================================
  // Table 3: Events (TTL: 30 days)
  // ============================================================================

  async storeEvent(event: Event): Promise<string> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = event.id || `event-${Date.now()}-${SecureRandom.generateId(5)}`;
    const timestamp = event.timestamp || Date.now();
    const ttl = event.ttl !== undefined ? event.ttl : this.TTL_POLICY.events;
    const expiresAt = ttl > 0 ? timestamp + (ttl * 1000) : null;

    await this.run(
      `INSERT INTO events (id, type, payload, timestamp, source, ttl, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, event.type, JSON.stringify(event.payload), timestamp, event.source, ttl, expiresAt]
    );

    return id;
  }

  async queryEvents(type: string): Promise<Event[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT id, type, payload, timestamp, source, ttl
       FROM events
       WHERE type = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC`,
      [type, now]
    );

    return rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
      source: row.source,
      ttl: row.ttl
    }));
  }

  async getEventsBySource(source: string): Promise<Event[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT id, type, payload, timestamp, source, ttl
       FROM events
       WHERE source = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC`,
      [source, now]
    );

    return rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
      source: row.source,
      ttl: row.ttl
    }));
  }

  // ============================================================================
  // Table 4: Workflow State (TTL: never expires)
  // ============================================================================

  async storeWorkflowState(workflow: WorkflowState): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = workflow.ttl !== undefined ? workflow.ttl : this.TTL_POLICY.workflow_state;

    await this.run(
      `INSERT OR REPLACE INTO workflow_state (id, step, status, checkpoint, sha, ttl, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [workflow.id, workflow.step, workflow.status, JSON.stringify(workflow.checkpoint), workflow.sha, ttl, now, now]
    );
  }

  async getWorkflowState(id: string): Promise<WorkflowState> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, step, status, checkpoint, sha, ttl, created_at, updated_at
       FROM workflow_state
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`Workflow state not found: ${id}`);
    }

    return {
      id: row.id,
      step: row.step,
      status: row.status,
      checkpoint: JSON.parse(row.checkpoint),
      sha: row.sha,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async updateWorkflowState(id: string, updates: Partial<WorkflowState>): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const current = await this.getWorkflowState(id);
    const now = Date.now();

    await this.run(
      `UPDATE workflow_state
       SET step = ?, status = ?, checkpoint = ?, sha = ?, updated_at = ?
       WHERE id = ?`,
      [
        updates.step || current.step,
        updates.status || current.status,
        JSON.stringify(updates.checkpoint || current.checkpoint),
        updates.sha || current.sha,
        now,
        id
      ]
    );
  }

  async queryWorkflowsByStatus(status: string): Promise<WorkflowState[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, step, status, checkpoint, sha, ttl, created_at, updated_at
       FROM workflow_state
       WHERE status = ?`,
      [status]
    );

    return rows.map((row: any) => ({
      id: row.id,
      step: row.step,
      status: row.status,
      checkpoint: JSON.parse(row.checkpoint),
      sha: row.sha,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // ============================================================================
  // Table 5: Patterns (TTL: 7 days)
  // ============================================================================

  async storePattern(pattern: Pattern): Promise<string> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = pattern.id || `pattern-${Date.now()}-${SecureRandom.generateId(5)}`;
    const now = Date.now();
    const ttl = pattern.ttl !== undefined ? pattern.ttl : this.TTL_POLICY.patterns;
    const expiresAt = ttl > 0 ? now + (ttl * 1000) : null;

    // Extract agent_id from metadata for indexed lookups (O(log n) vs O(n))
    const agentId = pattern.metadata?.agent_id || pattern.metadata?.agentId || null;

    await this.run(
      `INSERT OR REPLACE INTO patterns (id, pattern, confidence, usage_count, metadata, ttl, expires_at, created_at, agent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        pattern.pattern,
        pattern.confidence,
        pattern.usageCount,
        pattern.metadata ? JSON.stringify(pattern.metadata) : null,
        ttl,
        expiresAt,
        now,
        agentId
      ]
    );

    // Invalidate cache for this agent to ensure consistency
    this.invalidatePatternCacheForAgent(agentId);

    return id;
  }

  async getPattern(patternName: string): Promise<Pattern> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const row = await this.queryOne<any>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE pattern = ? AND (expires_at IS NULL OR expires_at > ?)`,
      [patternName, now]
    );

    if (!row) {
      throw new Error(`Pattern not found: ${patternName}`);
    }

    return {
      id: row.id,
      pattern: row.pattern,
      confidence: row.confidence,
      usageCount: row.usage_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  async incrementPatternUsage(patternName: string): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    // Get the agent_id before updating to invalidate correct cache entries
    const pattern = this.queryOne<any>(
      `SELECT agent_id, metadata FROM patterns WHERE pattern = ?`,
      [patternName]
    );

    this.run(
      `UPDATE patterns
       SET usage_count = usage_count + 1
       WHERE pattern = ?`,
      [patternName]
    );

    // Invalidate cache for affected agent
    if (pattern) {
      const agentId = pattern.agent_id ||
        (pattern.metadata ? JSON.parse(pattern.metadata).agent_id || JSON.parse(pattern.metadata).agentId : null);
      this.invalidatePatternCacheForAgent(agentId);
    }
  }

  /**
   * Invalidate pattern cache for a specific agent
   * Call this after any pattern mutation to maintain cache coherence
   */
  private invalidatePatternCacheForAgent(agentId: string | null): void {
    if (agentId) {
      this.patternCache.invalidate(agentId);
    } else {
      // Nuclear option for NULL agent_id - clear entire cache
      // This is expensive but ensures correctness for pre-migration data
      this.patternCache.clear();
    }
  }

  async queryPatternsByConfidence(threshold: number): Promise<Pattern[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE confidence >= ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY confidence DESC`,
      [threshold, now]
    );

    return rows.map((row: any) => ({
      id: row.id,
      pattern: row.pattern,
      confidence: row.confidence,
      usageCount: row.usage_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  /**
   * Query patterns by agent ID and minimum confidence
   * Filters patterns to only those belonging to the specified agent
   * @param agentId Agent ID to filter by
   * @param minConfidence Minimum confidence threshold (default: 0)
   * @returns Array of patterns belonging to the agent
   */
  /**
   * Escape special LIKE pattern characters to prevent SQL injection
   */
  private escapeLikePattern(value: string): string {
    return value.replace(/[%_\\]/g, '\\$&');
  }

  async queryPatternsByAgent(agentId: string, minConfidence: number = 0): Promise<Pattern[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    // Check cache first (O(1) lookup)
    const cacheKey = PatternCache.generateKey(agentId, minConfidence);
    const cached = this.patternCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const now = Date.now();
    const escapedAgentId = this.escapeLikePattern(agentId);

    // Split into two queries to ensure index usage on the fast path
    // Query 1: O(log n) - Use index for agent_id column (post-migration data)
    const indexedRows = this.queryAll<any>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE agent_id = ?
         AND confidence >= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY confidence DESC`,
      [agentId, minConfidence, now]
    );

    // Query 2: O(n) - Fallback LIKE scan for pre-migration data (agent_id IS NULL)
    const nullRows = this.queryAll<any>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE agent_id IS NULL
         AND confidence >= ?
         AND (expires_at IS NULL OR expires_at > ?)
         AND (metadata LIKE ? ESCAPE '\\' OR metadata LIKE ? ESCAPE '\\')
       ORDER BY confidence DESC`,
      [
        minConfidence,
        now,
        `%"agent_id":"${escapedAgentId}"%`,
        `%"agentId":"${escapedAgentId}"%`
      ]
    );

    // Combine results and sort by confidence (descending)
    const allRows = [...indexedRows, ...nullRows];
    allRows.sort((a: any, b: any) => b.confidence - a.confidence);

    const patterns = allRows.map((row: any) => ({
      id: row.id,
      pattern: row.pattern,
      confidence: row.confidence,
      usageCount: row.usage_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));

    // Cache results for subsequent lookups
    this.patternCache.set(cacheKey, patterns);

    return patterns;
  }

  /**
   * Get pattern cache statistics for monitoring
   */
  getPatternCacheStats() {
    return this.patternCache.getStats();
  }

  /**
   * Clear pattern cache (useful after bulk updates)
   */
  clearPatternCache(): void {
    this.patternCache.clear();
  }

  // ============================================================================
  // Table 6: Consensus State (TTL: 7 days)
  // ============================================================================

  async createConsensusProposal(proposal: ConsensusProposal): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = proposal.ttl !== undefined ? proposal.ttl : this.TTL_POLICY.consensus;
    const expiresAt = ttl > 0 ? now + (ttl * 1000) : null;

    await this.run(
      `INSERT INTO consensus_state (id, decision, proposer, votes, quorum, status, version, ttl, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        proposal.id,
        proposal.decision,
        proposal.proposer,
        JSON.stringify(proposal.votes),
        proposal.quorum,
        proposal.status,
        proposal.version || 1,
        ttl,
        expiresAt,
        now
      ]
    );
  }

  async getConsensusProposal(id: string): Promise<ConsensusProposal> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const row = await this.queryOne<any>(
      `SELECT id, decision, proposer, votes, quorum, status, version, ttl, created_at
       FROM consensus_state
       WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)`,
      [id, now]
    );

    if (!row) {
      throw new Error(`Consensus proposal not found: ${id}`);
    }

    return {
      id: row.id,
      decision: row.decision,
      proposer: row.proposer,
      votes: JSON.parse(row.votes),
      quorum: row.quorum,
      status: row.status,
      version: row.version,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  async voteOnConsensus(proposalId: string, agentId: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const proposal = await this.getConsensusProposal(proposalId);

    if (!proposal.votes.includes(agentId)) {
      proposal.votes.push(agentId);
    }

    const approved = proposal.votes.length >= proposal.quorum;

    if (approved) {
      proposal.status = 'approved';
    }

    await this.run(
      `UPDATE consensus_state
       SET votes = ?, status = ?
       WHERE id = ?`,
      [JSON.stringify(proposal.votes), proposal.status, proposalId]
    );

    return approved;
  }

  async queryConsensusProposals(status: string): Promise<ConsensusProposal[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = await this.queryAll<any>(
      `SELECT id, decision, proposer, votes, quorum, status, version, ttl, created_at
       FROM consensus_state
       WHERE status = ? AND (expires_at IS NULL OR expires_at > ?)`,
      [status, now]
    );

    return rows.map((row: any) => ({
      id: row.id,
      decision: row.decision,
      proposer: row.proposer,
      votes: JSON.parse(row.votes),
      quorum: row.quorum,
      status: row.status,
      version: row.version,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  // ============================================================================
  // Table 7: Performance Metrics
  // ============================================================================

  async storePerformanceMetric(metric: PerformanceMetric): Promise<string> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = metric.id || `metric-${Date.now()}-${SecureRandom.generateId(5)}`;
    const timestamp = metric.timestamp || Date.now();

    await this.run(
      `INSERT INTO performance_metrics (id, metric, value, unit, timestamp, agent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, metric.metric, metric.value, metric.unit, timestamp, metric.agentId || null]
    );

    return id;
  }

  async queryPerformanceMetrics(metricName: string): Promise<PerformanceMetric[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, metric, value, unit, timestamp, agent_id
       FROM performance_metrics
       WHERE metric = ?
       ORDER BY timestamp DESC`,
      [metricName]
    );

    return rows.map((row: any) => ({
      id: row.id,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      timestamp: row.timestamp,
      agentId: row.agent_id
    }));
  }

  async getMetricsByAgent(agentId: string): Promise<PerformanceMetric[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, metric, value, unit, timestamp, agent_id
       FROM performance_metrics
       WHERE agent_id = ?
       ORDER BY timestamp DESC`,
      [agentId]
    );

    return rows.map((row: any) => ({
      id: row.id,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      timestamp: row.timestamp,
      agentId: row.agent_id
    }));
  }

  async getAverageMetric(metricName: string): Promise<number> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<{ avg: number }>(
      `SELECT AVG(value) as avg FROM performance_metrics WHERE metric = ?`,
      [metricName]
    );

    return row?.avg || 0;
  }

  // ============================================================================
  // Table 8: Artifacts (TTL: never expires)
  // ============================================================================

  async createArtifact(artifact: Artifact): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = artifact.ttl !== undefined ? artifact.ttl : this.TTL_POLICY.artifacts;

    await this.run(
      `INSERT INTO artifacts (id, kind, path, sha256, tags, metadata, ttl, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifact.id,
        artifact.kind,
        artifact.path,
        artifact.sha256,
        JSON.stringify(artifact.tags),
        artifact.metadata ? JSON.stringify(artifact.metadata) : null,
        ttl,
        now
      ]
    );
  }

  async getArtifact(id: string): Promise<Artifact> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, kind, path, sha256, tags, metadata, ttl, created_at
       FROM artifacts
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`Artifact not found: ${id}`);
    }

    return {
      id: row.id,
      kind: row.kind,
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  async queryArtifactsByKind(kind: string): Promise<Artifact[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, kind, path, sha256, tags, metadata, ttl, created_at
       FROM artifacts
       WHERE kind = ?`,
      [kind]
    );

    return rows.map((row: any) => ({
      id: row.id,
      kind: row.kind,
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  async queryArtifactsByTag(tag: string): Promise<Artifact[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, kind, path, sha256, tags, metadata, ttl, created_at
       FROM artifacts
       WHERE tags LIKE ?`,
      [`%"${tag}"%`]
    );

    return rows.map((row: any) => ({
      id: row.id,
      kind: row.kind,
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  // ============================================================================
  // Table 9: Sessions (resumability)
  // ============================================================================

  async createSession(session: Session): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `INSERT INTO sessions (id, mode, state, checkpoints, created_at, last_resumed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.mode,
        JSON.stringify(session.state),
        JSON.stringify(session.checkpoints),
        now,
        null
      ]
    );
  }

  async getSession(id: string): Promise<Session> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, mode, state, checkpoints, created_at, last_resumed
       FROM sessions
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`Session not found: ${id}`);
    }

    return {
      id: row.id,
      mode: row.mode,
      state: JSON.parse(row.state),
      checkpoints: JSON.parse(row.checkpoints),
      createdAt: row.created_at,
      lastResumed: row.last_resumed
    };
  }

  async addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const session = await this.getSession(sessionId);
    session.checkpoints.push(checkpoint);

    await this.run(
      `UPDATE sessions
       SET checkpoints = ?
       WHERE id = ?`,
      [JSON.stringify(session.checkpoints), sessionId]
    );
  }

  async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | undefined> {
    const session = await this.getSession(sessionId);
    return session.checkpoints.length > 0
      ? session.checkpoints[session.checkpoints.length - 1]
      : undefined;
  }

  async markSessionResumed(sessionId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `UPDATE sessions
       SET last_resumed = ?
       WHERE id = ?`,
      [now, sessionId]
    );
  }

  // ============================================================================
  // Table 10: Agent Registry
  // ============================================================================

  async registerAgent(agent: AgentRegistration): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `INSERT INTO agent_registry (id, type, capabilities, status, performance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.type,
        JSON.stringify(agent.capabilities),
        agent.status,
        JSON.stringify(agent.performance),
        now,
        now
      ]
    );
  }

  async getAgent(id: string): Promise<AgentRegistration> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, type, capabilities, status, performance, created_at, updated_at
       FROM agent_registry
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`Agent not found: ${id}`);
    }

    return {
      id: row.id,
      type: row.type,
      capabilities: JSON.parse(row.capabilities),
      status: row.status,
      performance: JSON.parse(row.performance),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `UPDATE agent_registry
       SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, now, agentId]
    );
  }

  async queryAgentsByStatus(status: string): Promise<AgentRegistration[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, type, capabilities, status, performance, created_at, updated_at
       FROM agent_registry
       WHERE status = ?`,
      [status]
    );

    return rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      capabilities: JSON.parse(row.capabilities),
      status: row.status,
      performance: JSON.parse(row.performance),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async updateAgentPerformance(agentId: string, performance: any): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `UPDATE agent_registry
       SET performance = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(performance), now, agentId]
    );
  }

  // ============================================================================
  // Table 11: GOAP State
  // ============================================================================

  async storeGOAPGoal(goal: GOAPGoal): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `INSERT INTO goap_goals (id, conditions, cost, priority, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [goal.id, JSON.stringify(goal.conditions), goal.cost, goal.priority || null, now]
    );
  }

  async getGOAPGoal(id: string): Promise<GOAPGoal> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, conditions, cost, priority, created_at
       FROM goap_goals
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`GOAP goal not found: ${id}`);
    }

    return {
      id: row.id,
      conditions: JSON.parse(row.conditions),
      cost: row.cost,
      priority: row.priority,
      createdAt: row.created_at
    };
  }

  async storeGOAPAction(action: GOAPAction): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `INSERT INTO goap_actions (id, preconditions, effects, cost, agent_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        action.id,
        JSON.stringify(action.preconditions),
        JSON.stringify(action.effects),
        action.cost,
        action.agentType || null,
        now
      ]
    );
  }

  async getGOAPAction(id: string): Promise<GOAPAction> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, preconditions, effects, cost, agent_type, created_at
       FROM goap_actions
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`GOAP action not found: ${id}`);
    }

    return {
      id: row.id,
      preconditions: JSON.parse(row.preconditions),
      effects: JSON.parse(row.effects),
      cost: row.cost,
      agentType: row.agent_type,
      createdAt: row.created_at
    };
  }

  async storeGOAPPlan(plan: GOAPPlan): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    await this.run(
      `INSERT INTO goap_plans (id, goal_id, sequence, total_cost, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [plan.id, plan.goalId, JSON.stringify(plan.sequence), plan.totalCost, now]
    );
  }

  async getGOAPPlan(id: string): Promise<GOAPPlan> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, goal_id, sequence, total_cost, created_at
       FROM goap_plans
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`GOAP plan not found: ${id}`);
    }

    return {
      id: row.id,
      goalId: row.goal_id,
      sequence: JSON.parse(row.sequence),
      totalCost: row.total_cost,
      createdAt: row.created_at
    };
  }

  // ============================================================================
  // Table 12: OODA Cycles
  // ============================================================================

  async storeOODACycle(cycle: OODACycle): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    await this.run(
      `INSERT INTO ooda_cycles (id, phase, observations, orientation, decision, action, timestamp, completed, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cycle.id,
        cycle.phase,
        cycle.observations ? JSON.stringify(cycle.observations) : null,
        cycle.orientation ? JSON.stringify(cycle.orientation) : null,
        cycle.decision ? JSON.stringify(cycle.decision) : null,
        cycle.action ? JSON.stringify(cycle.action) : null,
        cycle.timestamp,
        cycle.completed ? 1 : 0,
        cycle.result ? JSON.stringify(cycle.result) : null
      ]
    );
  }

  async getOODACycle(id: string): Promise<OODACycle> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = await this.queryOne<any>(
      `SELECT id, phase, observations, orientation, decision, action, timestamp, completed, result
       FROM ooda_cycles
       WHERE id = ?`,
      [id]
    );

    if (!row) {
      throw new Error(`OODA cycle not found: ${id}`);
    }

    return {
      id: row.id,
      phase: row.phase,
      observations: row.observations ? JSON.parse(row.observations) : undefined,
      orientation: row.orientation ? JSON.parse(row.orientation) : undefined,
      decision: row.decision ? JSON.parse(row.decision) : undefined,
      action: row.action ? JSON.parse(row.action) : undefined,
      timestamp: row.timestamp,
      completed: row.completed === 1,
      result: row.result ? JSON.parse(row.result) : undefined
    };
  }

  async updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: any): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const fieldMap: Record<string, string> = {
      observe: 'observations',
      orient: 'orientation',
      decide: 'decision',
      act: 'action'
    };

    const field = fieldMap[phase];

    await this.run(
      `UPDATE ooda_cycles
       SET phase = ?, ${field} = ?
       WHERE id = ?`,
      [phase, JSON.stringify(data), cycleId]
    );
  }

  async completeOODACycle(cycleId: string, result: any): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    await this.run(
      `UPDATE ooda_cycles
       SET completed = 1, result = ?
       WHERE id = ?`,
      [JSON.stringify(result), cycleId]
    );
  }

  async queryOODACyclesByPhase(phase: string): Promise<OODACycle[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = await this.queryAll<any>(
      `SELECT id, phase, observations, orientation, decision, action, timestamp, completed, result
       FROM ooda_cycles
       WHERE phase = ?`,
      [phase]
    );

    return rows.map((row: any) => ({
      id: row.id,
      phase: row.phase,
      observations: row.observations ? JSON.parse(row.observations) : undefined,
      orientation: row.orientation ? JSON.parse(row.orientation) : undefined,
      decision: row.decision ? JSON.parse(row.decision) : undefined,
      action: row.action ? JSON.parse(row.action) : undefined,
      timestamp: row.timestamp,
      completed: row.completed === 1,
      result: row.result ? JSON.parse(row.result) : undefined
    }));
  }

  // ACL Management Methods

  /**
   * Store ACL for a memory entry
   */
  async storeACL(acl: ACL): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const grantedPerms = acl.grantedPermissions ? JSON.stringify(acl.grantedPermissions) : null;
    const blockedAgents = acl.blockedAgents ? JSON.stringify(acl.blockedAgents) : null;

    await this.run(
      `INSERT OR REPLACE INTO memory_acl
       (resource_id, owner, access_level, team_id, swarm_id, granted_permissions, blocked_agents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        acl.resourceId,
        acl.owner,
        acl.accessLevel,
        acl.teamId || null,
        acl.swarmId || null,
        grantedPerms,
        blockedAgents,
        acl.createdAt.getTime(),
        acl.updatedAt.getTime()
      ]
    );

    this.aclCache.set(acl.resourceId, acl);
  }

  /**
   * Retrieve ACL for a memory entry
   */
  async getACL(resourceId: string): Promise<ACL | null> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    // Check cache first
    if (this.aclCache.has(resourceId)) {
      return this.aclCache.get(resourceId)!;
    }

    const row = await this.queryOne<any>(
      `SELECT * FROM memory_acl WHERE resource_id = ?`,
      [resourceId]
    );

    if (!row) {
      return null;
    }

    const acl: ACL = {
      resourceId: row.resource_id,
      owner: row.owner,
      accessLevel: row.access_level as AccessLevel,
      teamId: row.team_id,
      swarmId: row.swarm_id,
      grantedPermissions: row.granted_permissions ? JSON.parse(row.granted_permissions) : undefined,
      blockedAgents: row.blocked_agents ? JSON.parse(row.blocked_agents) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    this.aclCache.set(resourceId, acl);
    return acl;
  }

  /**
   * Update ACL for a memory entry
   */
  async updateACL(resourceId: string, updates: Partial<ACL>): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.updateACL(existing, updates);
    await this.storeACL(updated);
  }

  /**
   * Grant permission to an agent
   */
  async grantPermission(resourceId: string, agentId: string, permissions: Permission[]): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.grantPermission(existing, agentId, permissions);
    await this.storeACL(updated);
  }

  /**
   * Revoke permission from an agent
   */
  async revokePermission(resourceId: string, agentId: string, permissions: Permission[]): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.revokePermission(existing, agentId, permissions);
    await this.storeACL(updated);
  }

  /**
   * Block an agent from accessing a resource
   */
  async blockAgent(resourceId: string, agentId: string): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.blockAgent(existing, agentId);
    await this.storeACL(updated);
  }

  /**
   * Unblock an agent
   */
  async unblockAgent(resourceId: string, agentId: string): Promise<void> {
    const existing = await this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.unblockAgent(existing, agentId);
    await this.storeACL(updated);
  }

  /**
   * Get access control instance for direct usage
   */
  getAccessControl(): AccessControl {
    return this.accessControl;
  }

  // ============================================================================
  // QUIC Integration (Optional, opt-in feature)
  // ============================================================================

  /**
   * Enable AgentDB for distributed memory synchronization
   *
   * @param config - AgentDB configuration (optional, uses defaults if not provided)
   */
  async enableAgentDB(config?: Partial<AgentDBConfig>): Promise<void> {
    if (this.agentDBManager) {
      throw new Error('AgentDB already enabled');
    }

    const fullConfig: AgentDBConfig = {
      dbPath: config?.dbPath || './data/agentdb',
      enableQUICSync: config?.enableQUICSync !== false,
      syncPort: config?.syncPort || 4433,
      syncPeers: config?.syncPeers || [],
      enableLearning: config?.enableLearning !== false,
      enableReasoning: config?.enableReasoning !== false,
      cacheSize: config?.cacheSize || 1000,
      quantizationType: config?.quantizationType || 'scalar'
    };

    this.agentDBManager = await createAgentDBManager(fullConfig);
  }

  /**
   * Disable AgentDB
   */
  async disableAgentDB(): Promise<void> {
    if (!this.agentDBManager) {
      return;
    }

    try {
      await this.agentDBManager.close();
    } finally {
      this.agentDBManager = null;
    }
  }

  /**
   * Add peer for QUIC synchronization via AgentDB
   *
   * @param address - Peer IP address
   * @param port - Peer port number
   * @returns Peer ID
   */
  async addQUICPeer(address: string, port: number): Promise<string> {
    if (!this.agentDBManager) {
      throw new Error('AgentDB not enabled. Call enableAgentDB() first.');
    }

    // AgentDB handles peer management internally via QUIC sync
    const peerId = `${address}:${port}`;
    return peerId;
  }

  /**
   * Remove peer from QUIC synchronization
   *
   * @param peerId - Peer ID to remove
   */
  async removeQUICPeer(peerId: string): Promise<void> {
    if (!this.agentDBManager) {
      throw new Error('AgentDB not enabled');
    }

    // AgentDB handles peer management internally
  }

  /**
   * Get QUIC performance metrics
   *
   * @returns Performance metrics or null if not enabled
   */
  getQUICMetrics(): any | null {
    if (!this.agentDBManager) {
      return null;
    }

    // AgentDB provides metrics through different API
    return null;
  }

  /**
   * Get list of connected QUIC peers
   *
   * @returns Array of peer information or empty array if not enabled
   */
  getQUICPeers(): any[] {
    if (!this.agentDBManager) {
      return [];
    }

    // AgentDB handles peer discovery internally
    return [];
  }

  /**
   * Check if QUIC integration is enabled
   *
   * @returns True if AgentDB is enabled with QUIC sync
   */
  isQUICEnabled(): boolean {
    return this.agentDBManager !== null;
  }

  /**
   * Get memory entries modified since timestamp (for QUIC sync)
   *
   * @param since - Timestamp to get entries modified after
   * @param partition - Optional partition filter
   * @returns Array of modified entries with metadata
   */
  async getModifiedEntries(since: number, partition?: string): Promise<MemoryEntry[]> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    let query = `
      SELECT key, value, partition, created_at, expires_at, owner, access_level, team_id, swarm_id
      FROM memory_entries
      WHERE created_at > ?
    `;

    const params: any[] = [since];

    if (partition) {
      query += ` AND partition = ?`;
      params.push(partition);
    }

    query += ` ORDER BY created_at ASC`;

    const rows = await this.queryAll<any>(query, params);

    return rows.map((row: any) => ({
      key: row.key,
      value: JSON.parse(row.value),
      partition: row.partition,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      owner: row.owner,
      accessLevel: row.access_level as AccessLevel,
      teamId: row.team_id,
      swarmId: row.swarm_id
    }));
  }

  /**
   * Get last modification timestamp for an entry
   *
   * @param key - Entry key
   * @param partition - Entry partition
   * @returns Timestamp or undefined if not tracked
   */
  getLastModified(key: string, partition: string = 'default'): number | undefined {
    const entryKey = `${partition}:${key}`;
    return this.lastModifiedTimestamps.get(entryKey);
  }

  /**
   * Get AgentDB manager instance (for advanced usage)
   *
   * @returns AgentDBManager instance or null if not enabled
   */
  getAgentDBManager(): AgentDBManager | null {
    return this.agentDBManager;
  }

  // ============================================================================
  // Learning Operations (Q-learning and Experience Storage)
  // ============================================================================

  /**
   * Store a learning experience for Q-learning
   * Delegates to the underlying Database instance
   */
  async storeLearningExperience(experience: {
    agentId: string;
    taskId?: string;
    taskType: string;
    state: string;
    action: string;
    reward: number;
    nextState: string;
    episodeId?: string;
  }): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      INSERT INTO learning_experiences (
        agent_id, task_id, task_type, state, action, reward, next_state, episode_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.run(sql, [
      experience.agentId,
      experience.taskId || null,
      experience.taskType,
      experience.state,
      experience.action,
      experience.reward,
      experience.nextState,
      experience.episodeId || null
    ]);
  }

  /**
   * Upsert a Q-value for a state-action pair
   * Delegates to the underlying Database instance
   */
  async upsertQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    qValue: number
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      INSERT INTO q_values (agent_id, state_key, action_key, q_value, update_count, last_updated)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id, state_key, action_key) DO UPDATE SET
        q_value = ?,
        update_count = update_count + 1,
        last_updated = CURRENT_TIMESTAMP
    `;

    this.run(sql, [agentId, stateKey, actionKey, qValue, qValue]);
  }

  /**
   * Get all Q-values for an agent
   */
  async getAllQValues(agentId: string): Promise<Array<{
    state_key: string;
    action_key: string;
    q_value: number;
    update_count: number;
  }>> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT state_key, action_key, q_value, update_count
      FROM q_values
      WHERE agent_id = ?
      ORDER BY last_updated DESC
    `;

    return await this.queryAll<{
      state_key: string;
      action_key: string;
      q_value: number;
      update_count: number;
    }>(sql, [agentId]);
  }

  /**
   * Get Q-value for a specific state-action pair
   */
  async getQValue(agentId: string, stateKey: string, actionKey: string): Promise<number | null> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT q_value FROM q_values
      WHERE agent_id = ? AND state_key = ? AND action_key = ?
    `;

    const row = await this.queryOne<{ q_value: number }>(sql, [agentId, stateKey, actionKey]);
    return row ? row.q_value : null;
  }

  /**
   * Store a learning performance snapshot
   */
  async storeLearningSnapshot(snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: any;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): Promise<void> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      INSERT INTO learning_history (
        agent_id, state_representation, action, reward,
        next_state_representation, q_value, episode
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // Store as learning_history entry (compatible with existing schema)
    this.run(sql, [
      snapshot.agentId,
      snapshot.snapshotType,
      JSON.stringify(snapshot.metrics),
      snapshot.improvementRate || 0,
      '', // next_state_representation (unused for snapshots)
      snapshot.explorationRate || 0,
      snapshot.totalExperiences || 0
    ]);
  }

  /**
   * Get learning history for an agent
   */
  async getLearningHistory(agentId: string, limit: number = 100): Promise<Array<{
    id: number;
    agent_id: string;
    pattern_id?: string;
    state_representation: string;
    action: string;
    reward: number;
    next_state_representation?: string;
    q_value?: number;
    episode?: number;
    timestamp: string;
  }>> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT id, agent_id, pattern_id, state_representation, action, reward,
             next_state_representation, q_value, episode, timestamp
      FROM learning_history
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    return await this.queryAll<{
      id: number;
      agent_id: string;
      pattern_id?: string;
      state_representation: string;
      action: string;
      reward: number;
      next_state_representation?: string;
      q_value?: number;
      episode?: number;
      timestamp: string;
    }>(sql, [agentId, limit]);
  }
}
