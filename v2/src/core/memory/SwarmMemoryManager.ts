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

// ============================================================================
// Type-safe database value types
// ============================================================================

/**
 * JSON-serializable value type for memory storage
 * Represents any value that can be stored and retrieved from the database
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Alias for unknown serializable data - use when the shape is not known
 * but the value will be JSON serialized/deserialized
 */
export type SerializableValue = JsonValue | Record<string, unknown>;

/**
 * SQL parameter types that can be safely passed to better-sqlite3
 */
export type SqlParam = string | number | null | Buffer | bigint;

// ============================================================================
// Database row interfaces for type-safe queries
// ============================================================================

/** Row returned from memory_entries table */
interface MemoryEntryRow {
  key: string;
  value: string;
  partition: string;
  created_at: number;
  expires_at: number | null;
  owner: string;
  access_level: string;
  team_id: string | null;
  swarm_id: string | null;
  metadata?: string | null;
}

/** Row returned from events table */
interface EventRow {
  id: string;
  type: string;
  payload: string;
  timestamp: number;
  source: string;
  ttl: number;
}

/** Row returned from workflow_state table */
interface WorkflowStateRow {
  id: string;
  step: string;
  status: string;
  checkpoint: string;
  sha: string;
  ttl: number;
  created_at: number;
  updated_at: number;
}

/** Row returned from patterns table */
interface PatternRow {
  id: string;
  pattern: string;
  confidence: number;
  usage_count: number;
  metadata: string | null;
  ttl: number;
  created_at: number;
  agent_id: string | null;
}

/** Row returned from consensus_state table */
interface ConsensusRow {
  id: string;
  decision: string;
  proposer: string;
  votes: string;
  quorum: number;
  status: string;
  version: number;
  ttl: number;
  created_at: number;
}

/** Row returned from performance_metrics table */
interface PerformanceMetricRow {
  id: string;
  metric: string;
  value: number;
  unit: string;
  timestamp: number;
  agent_id: string | null;
}

/** Row returned from artifacts table */
interface ArtifactRow {
  id: string;
  kind: string;
  path: string;
  sha256: string;
  tags: string;
  metadata: string | null;
  ttl: number;
  created_at: number;
}

/** Row returned from sessions table */
interface SessionRow {
  id: string;
  mode: string;
  state: string;
  checkpoints: string;
  created_at: number;
  last_resumed: number | null;
}

/** Row returned from agent_registry table */
interface AgentRegistryRow {
  id: string;
  type: string;
  capabilities: string;
  status: string;
  performance: string;
  created_at: number;
  updated_at: number;
}

/** Row returned from goap_goals table */
interface GOAPGoalRow {
  id: string;
  conditions: string;
  cost: number;
  priority: string | null;
  created_at: number;
}

/** Row returned from goap_actions table */
interface GOAPActionRow {
  id: string;
  preconditions: string;
  effects: string;
  cost: number;
  agent_type: string | null;
  created_at: number;
}

/** Row returned from goap_plans table */
interface GOAPPlanRow {
  id: string;
  goal_id: string;
  sequence: string;
  total_cost: number;
  created_at: number;
}

/** Row returned from ooda_cycles table */
interface OODACycleRow {
  id: string;
  phase: string;
  observations: string | null;
  orientation: string | null;
  decision: string | null;
  action: string | null;
  timestamp: number;
  completed: number;
  result: string | null;
}

/** Row returned from hints table */
interface HintRow {
  key: string;
  value: string;
  created_at: number;
  expires_at: number | null;
}

/** Row returned from memory_acl table */
interface ACLRow {
  resource_id: string;
  owner: string;
  access_level: string;
  team_id: string | null;
  swarm_id: string | null;
  granted_permissions: string | null;
  blocked_agents: string | null;
  created_at: number;
  updated_at: number;
}

/** Count query result */
interface CountRow {
  count: number;
}

/** Partition query result */
interface PartitionRow {
  partition: string;
}

/** Access level count result */
interface AccessLevelCountRow {
  access_level: string;
  count: number;
}

/** PRAGMA table_info result */
interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

/** Agent performance data structure */
export interface AgentPerformanceData {
  tasksCompleted?: number;
  tasksFailed?: number;
  avgExecutionTime?: number;
  lastActive?: number;
  successRate?: number;
  [key: string]: unknown;
}

/** OODA phase data structure */
export type OODAPhaseData = Record<string, unknown>;

/** Learning metrics structure */
export interface LearningMetrics {
  accuracy?: number;
  loss?: number;
  epochsCompleted?: number;
  learningRate?: number;
  [key: string]: unknown;
}

export interface MemoryEntry<T = SerializableValue> {
  key: string;
  value: T;
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
  metadata?: Record<string, unknown>;
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

export interface Hint<T = SerializableValue> {
  key: string;
  value: T;
  ttl?: number;
  createdAt: number;
  expiresAt?: number;
}

// Table 3: Events
export interface Event<T = SerializableValue> {
  id?: string;
  type: string;
  payload: T;
  timestamp?: number;
  source: string;
  ttl?: number;
}

// Table 4: Workflow State
export interface WorkflowState<T = SerializableValue> {
  id: string;
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  checkpoint: T;
  sha: string;
  ttl?: number;
  createdAt?: number;
  updatedAt?: number;
}

/** Pattern metadata structure */
export interface PatternMetadata {
  agent_id?: string;
  agentId?: string;
  framework?: string;
  language?: string;
  category?: string;
  [key: string]: unknown;
}

// Table 5: Patterns
export interface Pattern {
  id?: string;
  pattern: string;
  confidence: number;
  usageCount: number;
  ttl?: number;
  metadata?: PatternMetadata;
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

/** Artifact metadata structure */
export interface ArtifactMetadata {
  description?: string;
  author?: string;
  version?: string;
  size?: number;
  mimeType?: string;
  [key: string]: unknown;
}

// Table 8: Artifacts
export interface Artifact {
  id: string;
  kind: 'code' | 'doc' | 'data' | 'config';
  path: string;
  sha256: string;
  tags: string[];
  metadata?: ArtifactMetadata;
  ttl?: number;
  createdAt?: number;
}

/** Session state structure */
export interface SessionState {
  currentStep?: string;
  completedSteps?: string[];
  pendingActions?: string[];
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Checkpoint state structure */
export interface CheckpointState {
  step?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
  [key: string]: unknown;
}

// Table 9: Sessions
export interface Session<T = SessionState> {
  id: string;
  mode: 'swarm' | 'hive-mind';
  state: T;
  checkpoints: Checkpoint[];
  createdAt?: number;
  lastResumed?: number;
}

export interface Checkpoint<T = CheckpointState> {
  timestamp: number;
  state: T;
  sha: string;
}

// Table 10: Agent Registry
export interface AgentRegistration {
  id: string;
  type: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'terminated';
  performance: AgentPerformanceData;
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

/** OODA observations data */
export interface OODAObservations {
  inputs?: unknown[];
  signals?: Record<string, unknown>;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

/** OODA orientation data */
export interface OODAOrientation {
  analysis?: string;
  synthesis?: Record<string, unknown>;
  mentalModels?: string[];
  [key: string]: unknown;
}

/** OODA decision data */
export interface OODADecision {
  selectedOption?: string;
  alternatives?: string[];
  rationale?: string;
  confidence?: number;
  [key: string]: unknown;
}

/** OODA action data */
export interface OODAAction {
  actionType?: string;
  parameters?: Record<string, unknown>;
  expectedOutcome?: string;
  [key: string]: unknown;
}

/** OODA result data */
export interface OODAResult {
  success?: boolean;
  outcome?: string;
  feedback?: Record<string, unknown>;
  [key: string]: unknown;
}

// Table 12: OODA Cycles
export interface OODACycle {
  id: string;
  phase: 'observe' | 'orient' | 'decide' | 'act';
  observations?: OODAObservations;
  orientation?: OODAOrientation;
  decision?: OODADecision;
  action?: OODAAction;
  timestamp: number;
  completed?: boolean;
  result?: OODAResult;
}

/**
 * SwarmMemoryManager - Manages persistent memory for agent swarm coordination
 *
 * IMPORTANT: This class uses better-sqlite3 which is intentionally synchronous.
 * All database operations are synchronous for maximum performance.
 * Only initialize() is async due to filesystem operations.
 *
 * Issue #65: Converted from misleading async/await pattern to honest synchronous API.
 * See: https://github.com/proffesor-for-testing/agentic-qe/issues/65
 *
 * Features:
 * - SQLite-based persistent storage with 12-table schema (SYNCHRONOUS)
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

  private run(sql: string, params: SqlParam[] = []): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    this.db.prepare(sql).run(...params);
  }

  private queryOne<T>(sql: string, params: SqlParam[] = []): T | undefined {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  private queryAll<T>(sql: string, params: SqlParam[] = []): T[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db.prepare(sql).all(...params) as T[];
  }

  /**
   * Execute a raw SQL query (public method for CLI/admin usage)
   * @param sql SQL query string
   * @param params Query parameters
   * @returns Array of results
   */
  queryRaw<T>(sql: string, params: SqlParam[] = []): T[] {
    return this.queryAll<T>(sql, params);
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
    // Note: All this.run() calls are synchronous (better-sqlite3)
    this.run(`
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
    this.run(`
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
    this.run(`
      CREATE TABLE IF NOT EXISTS hints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    `);

    // Table 3: Events (TTL: 30 days)
    this.run(`
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
    this.run(`
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
    // Issue #79: Added domain and success_rate columns for learning persistence
    this.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL UNIQUE,
        confidence REAL NOT NULL,
        usage_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        ttl INTEGER NOT NULL DEFAULT ${this.TTL_POLICY.patterns},
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        agent_id TEXT,
        domain TEXT DEFAULT 'general',
        success_rate REAL DEFAULT 1.0
      )
    `);

    // Migration: Add columns if they don't exist (for existing databases)
    // SQLite doesn't support IF NOT EXISTS for columns, so check first
    try {
      const tableInfo = this.queryAll<TableInfoRow>(`PRAGMA table_info(patterns)`);
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('agent_id')) {
        this.run(`ALTER TABLE patterns ADD COLUMN agent_id TEXT`);
      }
      // Issue #79: Add domain column for learning persistence
      if (!columnNames.includes('domain')) {
        this.run(`ALTER TABLE patterns ADD COLUMN domain TEXT DEFAULT 'general'`);
      }
      // Issue #79: Add success_rate column for learning persistence
      if (!columnNames.includes('success_rate')) {
        this.run(`ALTER TABLE patterns ADD COLUMN success_rate REAL DEFAULT 1.0`);
      }
    } catch (e) {
      // Ignore errors - columns might already exist
    }

    // Create indexes for O(log n) pattern queries (Issue #57)
    this.run(`
      CREATE INDEX IF NOT EXISTS idx_patterns_agent_confidence
      ON patterns(agent_id, confidence DESC)
    `);
    this.run(`
      CREATE INDEX IF NOT EXISTS idx_patterns_agent
      ON patterns(agent_id)
    `);

    // Table 6: Consensus State (TTL: 7 days)
    this.run(`
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
    this.run(`
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
    this.run(`
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
    this.run(`
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
    this.run(`
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
    this.run(`
      CREATE TABLE IF NOT EXISTS goap_goals (
        id TEXT PRIMARY KEY,
        conditions TEXT NOT NULL,
        cost INTEGER NOT NULL,
        priority TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    this.run(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY,
        preconditions TEXT NOT NULL,
        effects TEXT NOT NULL,
        cost INTEGER NOT NULL,
        agent_type TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    this.run(`
      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        sequence TEXT NOT NULL,
        total_cost INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // Table 12: OODA Cycles
    this.run(`
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
    this.run(`CREATE INDEX IF NOT EXISTS idx_memory_partition ON memory_entries(partition)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_entries(expires_at)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_memory_owner ON memory_entries(owner)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_memory_access ON memory_entries(access_level)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_hints_key ON hints(key)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_hints_expires ON hints(expires_at)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_acl_owner ON memory_acl(owner)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_events_source ON events(source)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_events_expires ON events(expires_at)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_state(status)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON patterns(confidence)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_patterns_expires ON patterns(expires_at)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_consensus_status ON consensus_state(status)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_consensus_expires ON consensus_state(expires_at)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_metric ON performance_metrics(metric)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_agent ON performance_metrics(agent_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_registry(status)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_ooda_phase ON ooda_cycles(phase)`);

    // Table 13: Q-values (Q-learning)
    // Issue #79: Added metadata column for learning persistence
    this.run(`
      CREATE TABLE IF NOT EXISTS q_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        action_key TEXT NOT NULL,
        q_value REAL NOT NULL DEFAULT 0,
        update_count INTEGER NOT NULL DEFAULT 1,
        metadata TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, state_key, action_key)
      )
    `);

    // Issue #79: Migration for q_values metadata column
    try {
      const qvTableInfo = this.queryAll<TableInfoRow>(`PRAGMA table_info(q_values)`);
      if (!qvTableInfo.some(col => col.name === 'metadata')) {
        this.run(`ALTER TABLE q_values ADD COLUMN metadata TEXT`);
      }
    } catch {
      // Ignore errors - column might already exist
    }

    // Table 14: Learning Experiences
    // Issue #79: Added metadata and created_at columns for learning persistence
    this.run(`
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
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Issue #79: Migration for learning_experiences columns
    try {
      const leTableInfo = this.queryAll<TableInfoRow>(`PRAGMA table_info(learning_experiences)`);
      const leColumnNames = leTableInfo.map(col => col.name);

      if (!leColumnNames.includes('metadata')) {
        this.run(`ALTER TABLE learning_experiences ADD COLUMN metadata TEXT`);
      }
      if (!leColumnNames.includes('created_at')) {
        this.run(`ALTER TABLE learning_experiences ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
      }
    } catch {
      // Ignore errors - columns might already exist
    }

    // Table 15: Learning History (snapshots and metrics)
    this.run(`
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
    this.run(`
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
    this.run(`CREATE INDEX IF NOT EXISTS idx_q_values_agent ON q_values(agent_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_learning_exp_agent ON learning_experiences(agent_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_learning_hist_agent ON learning_history(agent_id)`);
    this.run(`CREATE INDEX IF NOT EXISTS idx_learning_metrics_agent ON learning_metrics(agent_id)`);

    this.initialized = true;
  }

  /**
   * Store a key-value pair in memory with OpenTelemetry instrumentation
   *
   * NOTE: This method is async only for auto-initialization. The actual DB
   * operations are synchronous (better-sqlite3). For maximum performance,
   * call initialize() first and use storeSync() instead.
   *
   * @param key - Memory key
   * @param value - Value to store (will be JSON serialized)
   * @param options - Store options including partition, TTL, access control
   */
  async store(key: string, value: SerializableValue, options: StoreOptions = {}): Promise<void> {
    // Auto-initialize if not initialized (only async part)
    if (!this.initialized) {
      await this.initialize();
    }
    // Delegate to sync implementation
    this.storeSync(key, value, options);
  }

  /**
   * Synchronous store operation - use when already initialized
   * Issue #65: Honest synchronous API for better-sqlite3
   */
  storeSync(key: string, value: SerializableValue, options: StoreOptions = {}): void {
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
      const existing = this.queryOne<Pick<MemoryEntryRow, 'owner' | 'access_level' | 'team_id' | 'swarm_id'>>(
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
          resourceTeamId: existing.team_id ?? undefined,
          swarmId: options.swarmId,
          resourceSwarmId: existing.swarm_id ?? undefined
        });

        if (!permCheck.allowed) {
          throw new AccessControlError(`Write denied: ${permCheck.reason}`);
        }
      }

      this.run(
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
  async set(key: string, value: SerializableValue, options: StoreOptions | string = {}): Promise<void> {
    // Handle legacy API: set(key, value, partition)
    if (typeof options === 'string') {
      return this.store(key, value, { partition: options });
    }
    return this.store(key, value, options);
  }

  /**
   * Synchronous set - use when already initialized
   */
  setSync(key: string, value: SerializableValue, options: StoreOptions | string = {}): void {
    if (typeof options === 'string') {
      this.storeSync(key, value, { partition: options });
    } else {
      this.storeSync(key, value, options);
    }
  }

  /**
   * Alias for retrieve() method to maintain compatibility
   * Supports both options object and partition string
   */
  async get(key: string, options: RetrieveOptions | string = {}): Promise<SerializableValue | null> {
    // Handle legacy API: get(key, partition)
    if (typeof options === 'string') {
      return this.retrieve(key, { partition: options });
    }
    return this.retrieve(key, options);
  }

  /**
   * Synchronous get - use when already initialized
   */
  getSync(key: string, options: RetrieveOptions | string = {}): SerializableValue | null {
    if (typeof options === 'string') {
      return this.retrieveSync(key, { partition: options });
    }
    return this.retrieveSync(key, options);
  }

  /**
   * Retrieve a value from memory with OpenTelemetry instrumentation
   *
   * NOTE: This method is async only for auto-initialization. For maximum
   * performance, call initialize() first and use retrieveSync() instead.
   *
   * @param key - Memory key
   * @param options - Retrieve options including partition, agentId for access control
   * @returns Retrieved value or null if not found
   */
  async retrieve(key: string, options: RetrieveOptions = {}): Promise<SerializableValue | null> {
    // Auto-initialize if not initialized (only async part)
    if (!this.initialized) {
      await this.initialize();
    }
    return this.retrieveSync(key, options);
  }

  /**
   * Synchronous retrieve operation - use when already initialized
   * Issue #65: Honest synchronous API for better-sqlite3
   */
  retrieveSync(key: string, options: RetrieveOptions = {}): SerializableValue | null {
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
      const params: SqlParam[] = [key, partition];

      if (!options.includeExpired) {
        query += ` AND (expires_at IS NULL OR expires_at > ?)`;
        params.push(now);
      }

      const row = this.queryOne<Pick<MemoryEntryRow, 'value' | 'owner' | 'access_level' | 'team_id' | 'swarm_id'>>(query, params);

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
          resourceTeamId: row.team_id ?? undefined,
          swarmId: options.swarmId,
          resourceSwarmId: row.swarm_id ?? undefined,
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
   * Issue #65: Converted to synchronous API
   *
   * @param pattern - SQL LIKE pattern for key matching
   * @param options - Retrieve options including partition, agentId for access control
   * @returns Array of matching memory entries
   */
  query(pattern: string, options: RetrieveOptions = {}): MemoryEntry[] {
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
      let queryStr = `SELECT key, value, partition, created_at, expires_at, owner, access_level, team_id, swarm_id
                   FROM memory_entries
                   WHERE partition = ? AND key LIKE ?`;
      const params: SqlParam[] = [partition, pattern];

      if (!options.includeExpired) {
        queryStr += ` AND (expires_at IS NULL OR expires_at > ?)`;
        params.push(now);
      }

      const rows = this.queryAll<MemoryEntryRow>(queryStr, params);

      // Filter by access control if agentId provided
      const filteredRows = options.agentId
        ? rows.filter((row) => {
            const permCheck = this.accessControl.checkPermission({
              agentId: options.agentId!,
              resourceOwner: row.owner,
              accessLevel: row.access_level as AccessLevel,
              permission: Permission.READ,
              teamId: options.teamId,
              resourceTeamId: row.team_id ?? undefined,
              swarmId: options.swarmId,
              resourceSwarmId: row.swarm_id ?? undefined,
              isSystemAgent: options.isSystemAgent
            });
            return permCheck.allowed;
          })
        : rows;

      const results = filteredRows.map((row) => ({
        key: row.key,
        value: JSON.parse(row.value) as SerializableValue,
        partition: row.partition,
        createdAt: row.created_at,
        expiresAt: row.expires_at ?? undefined,
        owner: row.owner,
        accessLevel: row.access_level as AccessLevel,
        teamId: row.team_id ?? undefined,
        swarmId: row.swarm_id ?? undefined
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
  delete(key: string, partition: string = 'default', options: DeleteOptions = {}): void {
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
        const row = this.queryOne<Pick<MemoryEntryRow, 'owner' | 'access_level' | 'team_id' | 'swarm_id'>>(
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
            resourceTeamId: row.team_id ?? undefined,
            swarmId: options.swarmId,
            resourceSwarmId: row.swarm_id ?? undefined,
            isSystemAgent: options.isSystemAgent
          });

          if (!permCheck.allowed) {
            throw new AccessControlError(`Delete denied: ${permCheck.reason}`);
          }
        }
      }

      this.run(`DELETE FROM memory_entries WHERE key = ? AND partition = ?`, [key, partition]);

      // Clean up ACL if exists
      const resourceId = `${partition}:${key}`;
      this.run(`DELETE FROM memory_acl WHERE resource_id = ?`, [resourceId]);
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

  clear(partition: string = 'default'): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    this.run(`DELETE FROM memory_entries WHERE partition = ?`, [partition]);
  }

  postHint(hint: { key: string; value: SerializableValue; ttl?: number }): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const createdAt = Date.now();
    const expiresAt = hint.ttl ? createdAt + (hint.ttl * 1000) : null;

    this.run(
      `INSERT INTO hints (key, value, created_at, expires_at) VALUES (?, ?, ?, ?)`,
      [hint.key, JSON.stringify(hint.value), createdAt, expiresAt]
    );
  }

  readHints(pattern: string): Hint[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    const rows = this.queryAll<HintRow>(
      `SELECT key, value, created_at, expires_at
       FROM hints
       WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC`,
      [pattern, now]
    );

    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value) as SerializableValue,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined
    }));
  }

  cleanExpired(): number {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    // Clean memory entries
    this.run(
      `DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean hints
    this.run(
      `DELETE FROM hints WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean events
    this.run(
      `DELETE FROM events WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean patterns
    this.run(
      `DELETE FROM patterns WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    // Clean consensus
    this.run(
      `DELETE FROM consensus_state WHERE expires_at IS NOT NULL AND expires_at <= ?`,
      [now]
    );

    return 0;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  stats(): {
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
  } {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const entriesCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM memory_entries`);
    const hintsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM hints`);
    const eventsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM events`);
    const workflowsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM workflow_state`);
    const patternsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM patterns`);
    const consensusCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM consensus_state`);
    const metricsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM performance_metrics`);
    const artifactsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM artifacts`);
    const sessionsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM sessions`);
    const agentsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM agent_registry`);
    const goapGoalsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM goap_goals`);
    const goapActionsCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM goap_actions`);
    const goapPlansCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM goap_plans`);
    const oodaCyclesCount = this.queryOne<CountRow>(`SELECT COUNT(*) as count FROM ooda_cycles`);
    const partitionsResult = this.queryAll<PartitionRow>(`SELECT DISTINCT partition FROM memory_entries`);
    const accessLevelsResult = this.queryAll<AccessLevelCountRow>(
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

  storeEvent(event: Event): string {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = event.id || `event-${Date.now()}-${SecureRandom.generateId(5)}`;
    const timestamp = event.timestamp || Date.now();
    const ttl = event.ttl !== undefined ? event.ttl : this.TTL_POLICY.events;
    const expiresAt = ttl > 0 ? timestamp + (ttl * 1000) : null;

    this.run(
      `INSERT INTO events (id, type, payload, timestamp, source, ttl, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, event.type, JSON.stringify(event.payload), timestamp, event.source, ttl, expiresAt]
    );

    return id;
  }

  queryEvents(type: string): Event[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = this.queryAll<EventRow>(
      `SELECT id, type, payload, timestamp, source, ttl
       FROM events
       WHERE type = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC`,
      [type, now]
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload) as SerializableValue,
      timestamp: row.timestamp,
      source: row.source,
      ttl: row.ttl
    }));
  }

  getEventsBySource(source: string): Event[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = this.queryAll<EventRow>(
      `SELECT id, type, payload, timestamp, source, ttl
       FROM events
       WHERE source = ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY timestamp DESC`,
      [source, now]
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload) as SerializableValue,
      timestamp: row.timestamp,
      source: row.source,
      ttl: row.ttl
    }));
  }

  // ============================================================================
  // Table 4: Workflow State (TTL: never expires)
  // ============================================================================

  storeWorkflowState(workflow: WorkflowState): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = workflow.ttl !== undefined ? workflow.ttl : this.TTL_POLICY.workflow_state;

    this.run(
      `INSERT OR REPLACE INTO workflow_state (id, step, status, checkpoint, sha, ttl, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [workflow.id, workflow.step, workflow.status, JSON.stringify(workflow.checkpoint), workflow.sha, ttl, now, now]
    );
  }

  getWorkflowState(id: string): WorkflowState {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<WorkflowStateRow>(
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
      status: row.status as WorkflowState['status'],
      checkpoint: JSON.parse(row.checkpoint) as SerializableValue,
      sha: row.sha,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateWorkflowState(id: string, updates: Partial<WorkflowState>): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const current = this.getWorkflowState(id);
    const now = Date.now();

    this.run(
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

  queryWorkflowsByStatus(status: string): WorkflowState[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<WorkflowStateRow>(
      `SELECT id, step, status, checkpoint, sha, ttl, created_at, updated_at
       FROM workflow_state
       WHERE status = ?`,
      [status]
    );

    return rows.map((row) => ({
      id: row.id,
      step: row.step,
      status: row.status as WorkflowState['status'],
      checkpoint: JSON.parse(row.checkpoint) as SerializableValue,
      sha: row.sha,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // ============================================================================
  // Table 5: Patterns (TTL: 7 days)
  // ============================================================================

  storePattern(pattern: Pattern): string {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = pattern.id || `pattern-${Date.now()}-${SecureRandom.generateId(5)}`;
    const now = Date.now();
    const ttl = pattern.ttl !== undefined ? pattern.ttl : this.TTL_POLICY.patterns;
    const expiresAt = ttl > 0 ? now + (ttl * 1000) : null;

    // Extract agent_id from metadata for indexed lookups (O(log n) vs O(n))
    const agentId = pattern.metadata?.agent_id || pattern.metadata?.agentId || null;

    this.run(
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

  getPattern(patternName: string): Pattern {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const row = this.queryOne<PatternRow>(
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
      metadata: row.metadata ? JSON.parse(row.metadata) as PatternMetadata : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  incrementPatternUsage(patternName: string): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    // Get the agent_id before updating to invalidate correct cache entries
    const pattern = this.queryOne<Pick<PatternRow, 'agent_id' | 'metadata'>>(
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
      const parsedMetadata = pattern.metadata ? JSON.parse(pattern.metadata) as PatternMetadata : null;
      const agentId = pattern.agent_id ||
        (parsedMetadata ? parsedMetadata.agent_id || parsedMetadata.agentId : null) || null;
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

  queryPatternsByConfidence(threshold: number): Pattern[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = this.queryAll<PatternRow>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE confidence >= ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY confidence DESC`,
      [threshold, now]
    );

    return rows.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      confidence: row.confidence,
      usageCount: row.usage_count,
      metadata: row.metadata ? JSON.parse(row.metadata) as PatternMetadata : undefined,
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

  queryPatternsByAgent(agentId: string, minConfidence: number = 0): Pattern[] {
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
    const indexedRows = this.queryAll<PatternRow>(
      `SELECT id, pattern, confidence, usage_count, metadata, ttl, created_at
       FROM patterns
       WHERE agent_id = ?
         AND confidence >= ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY confidence DESC`,
      [agentId, minConfidence, now]
    );

    // Query 2: O(n) - Fallback LIKE scan for pre-migration data (agent_id IS NULL)
    const nullRows = this.queryAll<PatternRow>(
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
    allRows.sort((a, b) => b.confidence - a.confidence);

    const patterns = allRows.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      confidence: row.confidence,
      usageCount: row.usage_count,
      metadata: row.metadata ? JSON.parse(row.metadata) as PatternMetadata : undefined,
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

  createConsensusProposal(proposal: ConsensusProposal): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = proposal.ttl !== undefined ? proposal.ttl : this.TTL_POLICY.consensus;
    const expiresAt = ttl > 0 ? now + (ttl * 1000) : null;

    this.run(
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

  getConsensusProposal(id: string): ConsensusProposal {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const row = this.queryOne<ConsensusRow>(
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
      votes: JSON.parse(row.votes) as string[],
      quorum: row.quorum,
      status: row.status as ConsensusProposal['status'],
      version: row.version,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  voteOnConsensus(proposalId: string, agentId: string): boolean {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const proposal = this.getConsensusProposal(proposalId);

    if (!proposal.votes.includes(agentId)) {
      proposal.votes.push(agentId);
    }

    const approved = proposal.votes.length >= proposal.quorum;

    if (approved) {
      proposal.status = 'approved';
    }

    this.run(
      `UPDATE consensus_state
       SET votes = ?, status = ?
       WHERE id = ?`,
      [JSON.stringify(proposal.votes), proposal.status, proposalId]
    );

    return approved;
  }

  queryConsensusProposals(status: string): ConsensusProposal[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const rows = this.queryAll<ConsensusRow>(
      `SELECT id, decision, proposer, votes, quorum, status, version, ttl, created_at
       FROM consensus_state
       WHERE status = ? AND (expires_at IS NULL OR expires_at > ?)`,
      [status, now]
    );

    return rows.map((row) => ({
      id: row.id,
      decision: row.decision,
      proposer: row.proposer,
      votes: JSON.parse(row.votes) as string[],
      quorum: row.quorum,
      status: row.status as ConsensusProposal['status'],
      version: row.version,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  // ============================================================================
  // Table 7: Performance Metrics
  // ============================================================================

  storePerformanceMetric(metric: PerformanceMetric): string {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const id = metric.id || `metric-${Date.now()}-${SecureRandom.generateId(5)}`;
    const timestamp = metric.timestamp || Date.now();

    this.run(
      `INSERT INTO performance_metrics (id, metric, value, unit, timestamp, agent_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, metric.metric, metric.value, metric.unit, timestamp, metric.agentId || null]
    );

    return id;
  }

  queryPerformanceMetrics(metricName: string): PerformanceMetric[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<PerformanceMetricRow>(
      `SELECT id, metric, value, unit, timestamp, agent_id
       FROM performance_metrics
       WHERE metric = ?
       ORDER BY timestamp DESC`,
      [metricName]
    );

    return rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      timestamp: row.timestamp,
      agentId: row.agent_id ?? undefined
    }));
  }

  getMetricsByAgent(agentId: string): PerformanceMetric[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<PerformanceMetricRow>(
      `SELECT id, metric, value, unit, timestamp, agent_id
       FROM performance_metrics
       WHERE agent_id = ?
       ORDER BY timestamp DESC`,
      [agentId]
    );

    return rows.map((row) => ({
      id: row.id,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      timestamp: row.timestamp,
      agentId: row.agent_id ?? undefined
    }));
  }

  getAverageMetric(metricName: string): number {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<{ avg: number }>(
      `SELECT AVG(value) as avg FROM performance_metrics WHERE metric = ?`,
      [metricName]
    );

    return row?.avg || 0;
  }

  // ============================================================================
  // Table 8: Artifacts (TTL: never expires)
  // ============================================================================

  createArtifact(artifact: Artifact): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();
    const ttl = artifact.ttl !== undefined ? artifact.ttl : this.TTL_POLICY.artifacts;

    this.run(
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

  getArtifact(id: string): Artifact {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<ArtifactRow>(
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
      kind: row.kind as Artifact['kind'],
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags) as string[],
      metadata: row.metadata ? JSON.parse(row.metadata) as ArtifactMetadata : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    };
  }

  queryArtifactsByKind(kind: string): Artifact[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<ArtifactRow>(
      `SELECT id, kind, path, sha256, tags, metadata, ttl, created_at
       FROM artifacts
       WHERE kind = ?`,
      [kind]
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as Artifact['kind'],
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags) as string[],
      metadata: row.metadata ? JSON.parse(row.metadata) as ArtifactMetadata : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  queryArtifactsByTag(tag: string): Artifact[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<ArtifactRow>(
      `SELECT id, kind, path, sha256, tags, metadata, ttl, created_at
       FROM artifacts
       WHERE tags LIKE ?`,
      [`%"${tag}"%`]
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as Artifact['kind'],
      path: row.path,
      sha256: row.sha256,
      tags: JSON.parse(row.tags) as string[],
      metadata: row.metadata ? JSON.parse(row.metadata) as ArtifactMetadata : undefined,
      ttl: row.ttl,
      createdAt: row.created_at
    }));
  }

  // ============================================================================
  // Table 9: Sessions (resumability)
  // ============================================================================

  createSession(session: Session): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
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

  getSession(id: string): Session {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<SessionRow>(
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
      mode: row.mode as Session['mode'],
      state: JSON.parse(row.state) as SessionState,
      checkpoints: JSON.parse(row.checkpoints) as Checkpoint[],
      createdAt: row.created_at,
      lastResumed: row.last_resumed ?? undefined
    };
  }

  addSessionCheckpoint(sessionId: string, checkpoint: Checkpoint): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const session = this.getSession(sessionId);
    session.checkpoints.push(checkpoint);

    this.run(
      `UPDATE sessions
       SET checkpoints = ?
       WHERE id = ?`,
      [JSON.stringify(session.checkpoints), sessionId]
    );
  }

  getLatestCheckpoint(sessionId: string): Checkpoint | undefined {
    const session = this.getSession(sessionId);
    return session.checkpoints.length > 0
      ? session.checkpoints[session.checkpoints.length - 1]
      : undefined;
  }

  markSessionResumed(sessionId: string): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
      `UPDATE sessions
       SET last_resumed = ?
       WHERE id = ?`,
      [now, sessionId]
    );
  }

  // ============================================================================
  // Table 10: Agent Registry
  // ============================================================================

  registerAgent(agent: AgentRegistration): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
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

  getAgent(id: string): AgentRegistration {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<AgentRegistryRow>(
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
      capabilities: JSON.parse(row.capabilities) as string[],
      status: row.status as AgentRegistration['status'],
      performance: JSON.parse(row.performance) as AgentPerformanceData,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  updateAgentStatus(agentId: string, status: 'active' | 'idle' | 'terminated'): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
      `UPDATE agent_registry
       SET status = ?, updated_at = ?
       WHERE id = ?`,
      [status, now, agentId]
    );
  }

  queryAgentsByStatus(status: string): AgentRegistration[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<AgentRegistryRow>(
      `SELECT id, type, capabilities, status, performance, created_at, updated_at
       FROM agent_registry
       WHERE status = ?`,
      [status]
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      capabilities: JSON.parse(row.capabilities) as string[],
      status: row.status as AgentRegistration['status'],
      performance: JSON.parse(row.performance) as AgentPerformanceData,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  updateAgentPerformance(agentId: string, performance: AgentPerformanceData): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
      `UPDATE agent_registry
       SET performance = ?, updated_at = ?
       WHERE id = ?`,
      [JSON.stringify(performance), now, agentId]
    );
  }

  // ============================================================================
  // Table 11: GOAP State
  // ============================================================================

  storeGOAPGoal(goal: GOAPGoal): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
      `INSERT INTO goap_goals (id, conditions, cost, priority, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [goal.id, JSON.stringify(goal.conditions), goal.cost, goal.priority || null, now]
    );
  }

  getGOAPGoal(id: string): GOAPGoal {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<GOAPGoalRow>(
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
      conditions: JSON.parse(row.conditions) as string[],
      cost: row.cost,
      priority: row.priority ?? undefined,
      createdAt: row.created_at
    };
  }

  storeGOAPAction(action: GOAPAction): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
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

  getGOAPAction(id: string): GOAPAction {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<GOAPActionRow>(
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
      preconditions: JSON.parse(row.preconditions) as string[],
      effects: JSON.parse(row.effects) as string[],
      cost: row.cost,
      agentType: row.agent_type ?? undefined,
      createdAt: row.created_at
    };
  }

  storeGOAPPlan(plan: GOAPPlan): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const now = Date.now();

    this.run(
      `INSERT INTO goap_plans (id, goal_id, sequence, total_cost, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [plan.id, plan.goalId, JSON.stringify(plan.sequence), plan.totalCost, now]
    );
  }

  getGOAPPlan(id: string): GOAPPlan {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<GOAPPlanRow>(
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
      sequence: JSON.parse(row.sequence) as string[],
      totalCost: row.total_cost,
      createdAt: row.created_at
    };
  }

  // ============================================================================
  // Table 12: OODA Cycles
  // ============================================================================

  storeOODACycle(cycle: OODACycle): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    this.run(
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

  getOODACycle(id: string): OODACycle {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const row = this.queryOne<OODACycleRow>(
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
      phase: row.phase as OODACycle['phase'],
      observations: row.observations ? JSON.parse(row.observations) as OODAObservations : undefined,
      orientation: row.orientation ? JSON.parse(row.orientation) as OODAOrientation : undefined,
      decision: row.decision ? JSON.parse(row.decision) as OODADecision : undefined,
      action: row.action ? JSON.parse(row.action) as OODAAction : undefined,
      timestamp: row.timestamp,
      completed: row.completed === 1,
      result: row.result ? JSON.parse(row.result) as OODAResult : undefined
    };
  }

  updateOODAPhase(cycleId: string, phase: OODACycle['phase'], data: OODAPhaseData): void {
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

    this.run(
      `UPDATE ooda_cycles
       SET phase = ?, ${field} = ?
       WHERE id = ?`,
      [phase, JSON.stringify(data), cycleId]
    );
  }

  completeOODACycle(cycleId: string, result: OODAResult): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    this.run(
      `UPDATE ooda_cycles
       SET completed = 1, result = ?
       WHERE id = ?`,
      [JSON.stringify(result), cycleId]
    );
  }

  queryOODACyclesByPhase(phase: string): OODACycle[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const rows = this.queryAll<OODACycleRow>(
      `SELECT id, phase, observations, orientation, decision, action, timestamp, completed, result
       FROM ooda_cycles
       WHERE phase = ?`,
      [phase]
    );

    return rows.map((row) => ({
      id: row.id,
      phase: row.phase as OODACycle['phase'],
      observations: row.observations ? JSON.parse(row.observations) as OODAObservations : undefined,
      orientation: row.orientation ? JSON.parse(row.orientation) as OODAOrientation : undefined,
      decision: row.decision ? JSON.parse(row.decision) as OODADecision : undefined,
      action: row.action ? JSON.parse(row.action) as OODAAction : undefined,
      timestamp: row.timestamp,
      completed: row.completed === 1,
      result: row.result ? JSON.parse(row.result) as OODAResult : undefined
    }));
  }

  // ACL Management Methods

  /**
   * Store ACL for a memory entry
   */
  storeACL(acl: ACL): void {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const grantedPerms = acl.grantedPermissions ? JSON.stringify(acl.grantedPermissions) : null;
    const blockedAgents = acl.blockedAgents ? JSON.stringify(acl.blockedAgents) : null;

    this.run(
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
  getACL(resourceId: string): ACL | null {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    // Check cache first
    if (this.aclCache.has(resourceId)) {
      return this.aclCache.get(resourceId)!;
    }

    const row = this.queryOne<ACLRow>(
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
      teamId: row.team_id ?? undefined,
      swarmId: row.swarm_id ?? undefined,
      grantedPermissions: row.granted_permissions ? JSON.parse(row.granted_permissions) as Record<string, Permission[]> : undefined,
      blockedAgents: row.blocked_agents ? JSON.parse(row.blocked_agents) as string[] : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };

    this.aclCache.set(resourceId, acl);
    return acl;
  }

  /**
   * Update ACL for a memory entry
   */
  updateACL(resourceId: string, updates: Partial<ACL>): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.updateACL(existing, updates);
    this.storeACL(updated);
  }

  /**
   * Grant permission to an agent
   */
  grantPermission(resourceId: string, agentId: string, permissions: Permission[]): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.grantPermission(existing, agentId, permissions);
    this.storeACL(updated);
  }

  /**
   * Revoke permission from an agent
   */
  revokePermission(resourceId: string, agentId: string, permissions: Permission[]): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.revokePermission(existing, agentId, permissions);
    this.storeACL(updated);
  }

  /**
   * Block an agent from accessing a resource
   */
  blockAgent(resourceId: string, agentId: string): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.blockAgent(existing, agentId);
    this.storeACL(updated);
  }

  /**
   * Unblock an agent
   */
  unblockAgent(resourceId: string, agentId: string): void {
    const existing = this.getACL(resourceId);
    if (!existing) {
      throw new Error(`ACL not found for resource: ${resourceId}`);
    }

    const updated = this.accessControl.unblockAgent(existing, agentId);
    this.storeACL(updated);
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
  addQUICPeer(address: string, port: number): string {
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
  removeQUICPeer(peerId: string): void {
    if (!this.agentDBManager) {
      throw new Error('AgentDB not enabled');
    }

    // AgentDB handles peer management internally
  }

  /** QUIC metrics structure */


  /**
   * Get QUIC performance metrics
   *
   * @returns Performance metrics or null if not enabled
   */
  getQUICMetrics(): Record<string, unknown> | null {
    if (!this.agentDBManager) {
      return null;
    }

    // AgentDB provides metrics through different API
    return null;
  }

  /** QUIC peer information structure */


  /**
   * Get list of connected QUIC peers
   *
   * @returns Array of peer information or empty array if not enabled
   */
  getQUICPeers(): Array<Record<string, unknown>> {
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
  getModifiedEntries(since: number, partition?: string): MemoryEntry[] {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    let query = `
      SELECT key, value, partition, created_at, expires_at, owner, access_level, team_id, swarm_id
      FROM memory_entries
      WHERE created_at > ?
    `;

    const params: SqlParam[] = [since];

    if (partition) {
      query += ` AND partition = ?`;
      params.push(partition);
    }

    query += ` ORDER BY created_at ASC`;

    const rows = this.queryAll<MemoryEntryRow>(query, params);

    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value) as SerializableValue,
      partition: row.partition,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
      owner: row.owner,
      accessLevel: row.access_level as AccessLevel,
      teamId: row.team_id ?? undefined,
      swarmId: row.swarm_id ?? undefined
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
  storeLearningExperience(experience: {
    agentId: string;
    taskId?: string;
    taskType: string;
    state: string;
    action: string;
    reward: number;
    nextState: string;
    episodeId?: string;
  }): void {
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
  upsertQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    qValue: number
  ): void {
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
  getAllQValues(agentId: string): Array<{
    state_key: string;
    action_key: string;
    q_value: number;
    update_count: number;
  }> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT state_key, action_key, q_value, update_count
      FROM q_values
      WHERE agent_id = ?
      ORDER BY last_updated DESC
    `;

    return this.queryAll<{
      state_key: string;
      action_key: string;
      q_value: number;
      update_count: number;
    }>(sql, [agentId]);
  }

  /**
   * Get Q-value for a specific state-action pair
   */
  getQValue(agentId: string, stateKey: string, actionKey: string): number | null {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT q_value FROM q_values
      WHERE agent_id = ? AND state_key = ? AND action_key = ?
    `;

    const row = this.queryOne<{ q_value: number }>(sql, [agentId, stateKey, actionKey]);
    return row ? row.q_value : null;
  }

  /**
   * Get the best action for a given state based on Q-values
   * Returns the action with the highest Q-value for the specified state
   */
  getBestAction(agentId: string, stateKey: string): {
    action_key: string;
    q_value: number;
    update_count: number;
  } | null {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT action_key, q_value, update_count
      FROM q_values
      WHERE agent_id = ? AND state_key = ?
      ORDER BY q_value DESC
      LIMIT 1
    `;

    const result = this.queryOne<{
      action_key: string;
      q_value: number;
      update_count: number;
    }>(sql, [agentId, stateKey]);
    return result || null;
  }

  /**
   * Get recent learning experiences for an agent
   * Returns experiences ordered by most recent first
   */
  getRecentLearningExperiences(agentId: string, limit: number = 10): Array<{
    id: number;
    agent_id: string;
    task_type: string;
    state: string;
    action: string;
    reward: number;
    next_state: string;
    episode_id: string | null;
    created_at: string;
  }> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT id, agent_id, task_type, state, action, reward, next_state, episode_id, created_at
      FROM learning_experiences
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return this.queryAll<{
      id: number;
      agent_id: string;
      task_type: string;
      state: string;
      action: string;
      reward: number;
      next_state: string;
      episode_id: string | null;
      created_at: string;
    }>(sql, [agentId, limit]);
  }

  /**
   * Get learning experiences by task type
   */
  getLearningExperiencesByTaskType(agentId: string, taskType: string, limit: number = 50): Array<{
    id: number;
    agent_id: string;
    task_type: string;
    state: string;
    action: string;
    reward: number;
    next_state: string;
    created_at: string;
  }> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT id, agent_id, task_type, state, action, reward, next_state, created_at
      FROM learning_experiences
      WHERE agent_id = ? AND task_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return this.queryAll<{
      id: number;
      agent_id: string;
      task_type: string;
      state: string;
      action: string;
      reward: number;
      next_state: string;
      created_at: string;
    }>(sql, [agentId, taskType, limit]);
  }

  /**
   * Get high-reward learning experiences for pattern extraction
   * Useful for identifying successful strategies to replicate
   */
  getHighRewardExperiences(agentId: string, minReward: number = 0.8, limit: number = 20): Array<{
    id: number;
    task_type: string;
    state: string;
    action: string;
    reward: number;
    next_state: string;
    created_at: string;
  }> {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT id, task_type, state, action, reward, next_state, created_at
      FROM learning_experiences
      WHERE agent_id = ? AND reward >= ?
      ORDER BY reward DESC, created_at DESC
      LIMIT ?
    `;

    return this.queryAll<{
      id: number;
      task_type: string;
      state: string;
      action: string;
      reward: number;
      next_state: string;
      created_at: string;
    }>(sql, [agentId, minReward, limit]);
  }

  /**
   * Get learning statistics for an agent
   * Useful for tracking learning progress over time
   */
  getLearningStats(agentId: string): {
    totalExperiences: number;
    averageReward: number;
    maxReward: number;
    minReward: number;
    uniqueTaskTypes: number;
    uniqueActions: number;
  } {
    if (!this.db) {
      throw new Error('Memory manager not initialized');
    }

    const sql = `
      SELECT
        COUNT(*) as total_experiences,
        AVG(reward) as avg_reward,
        MAX(reward) as max_reward,
        MIN(reward) as min_reward,
        COUNT(DISTINCT task_type) as unique_task_types,
        COUNT(DISTINCT action) as unique_actions
      FROM learning_experiences
      WHERE agent_id = ?
    `;

    const row = this.queryOne<{
      total_experiences: number;
      avg_reward: number;
      max_reward: number;
      min_reward: number;
      unique_task_types: number;
      unique_actions: number;
    }>(sql, [agentId]);

    return {
      totalExperiences: row?.total_experiences || 0,
      averageReward: row?.avg_reward || 0,
      maxReward: row?.max_reward || 0,
      minReward: row?.min_reward || 0,
      uniqueTaskTypes: row?.unique_task_types || 0,
      uniqueActions: row?.unique_actions || 0
    };
  }

  /**
   * Store a learning performance snapshot
   */
  storeLearningSnapshot(snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: LearningMetrics;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): void {
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
  getLearningHistory(agentId: string, limit: number = 100): Array<{
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
  }> {
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

    return this.queryAll<{
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
