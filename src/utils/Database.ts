/**
 * Database - SQLite database management for the AQE Fleet
 *
 * Provides persistent storage for fleet state, agent metrics, task history,
 * and configuration data using better-sqlite3 for improved performance and reliability.
 */

import BetterSqlite3 from 'better-sqlite3';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Logger } from './Logger';

export interface DatabaseRow {
  [key: string]: any;
}

export class Database {
  private db: BetterSqlite3.Database | null = null;
  private readonly logger: Logger;
  private readonly dbPath: string;
  private isInitialized: boolean = false;

  constructor(dbPath: string = './data/fleet.db') {
    this.logger = Logger.getInstance();
    this.dbPath = dbPath;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Ensure data directory exists
      const dbDir = dirname(this.dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection (better-sqlite3 is synchronous)
      this.db = new BetterSqlite3(this.dbPath);

      // Enable foreign keys
      this.exec('PRAGMA foreign_keys = ON');

      // Create tables
      await this.createTables();

      this.isInitialized = true;
      this.logger.info(`Database initialized at ${this.dbPath}`);

    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      this.db.close();
      this.logger.info('Database connection closed');
      this.db = null;
      this.isInitialized = false;
    } catch (error) {
      this.logger.error('Error closing database:', error);
      throw error;
    }
  }

  /**
   * Execute SQL query
   */
  exec(sql: string): void {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      this.db.exec(sql);
    } catch (error) {
      this.logger.error('SQL exec error:', error);
      throw error;
    }
  }

  /**
   * Run SQL query with parameters
   */
  async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      const info = this.db.prepare(sql).run(...params);
      return {
        lastID: Number(info.lastInsertRowid),
        changes: info.changes
      };
    } catch (error) {
      this.logger.error('SQL run error:', error);
      throw error;
    }
  }

  /**
   * Get single row from database
   */
  async get(sql: string, params: any[] = []): Promise<DatabaseRow | undefined> {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      return this.db.prepare(sql).get(...params) as DatabaseRow | undefined;
    } catch (error) {
      this.logger.error('SQL get error:', error);
      throw error;
    }
  }

  /**
   * Get all rows from database
   */
  async all(sql: string, params: any[] = []): Promise<DatabaseRow[]> {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      return this.db.prepare(sql).all(...params) as DatabaseRow[];
    } catch (error) {
      this.logger.error('SQL all error:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    const tables = [
      // Fleet configuration and status
      `CREATE TABLE IF NOT EXISTS fleets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Agent registry and status
      `CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        fleet_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        config TEXT,
        metrics TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fleet_id) REFERENCES fleets (id)
      )`,

      // Task definitions and status
      `CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        fleet_id TEXT NOT NULL,
        agent_id TEXT,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT,
        requirements TEXT,
        status TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (fleet_id) REFERENCES fleets (id),
        FOREIGN KEY (agent_id) REFERENCES agents (id)
      )`,

      // Event log for audit trail
      `CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        fleet_id TEXT,
        agent_id TEXT,
        task_id TEXT,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT,
        data TEXT,
        processed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fleet_id) REFERENCES fleets (id),
        FOREIGN KEY (agent_id) REFERENCES agents (id),
        FOREIGN KEY (task_id) REFERENCES tasks (id)
      )`,

      // Performance metrics
      `CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fleet_id TEXT,
        agent_id TEXT,
        task_id TEXT,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_value REAL NOT NULL,
        unit TEXT,
        tags TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fleet_id) REFERENCES fleets (id),
        FOREIGN KEY (agent_id) REFERENCES agents (id),
        FOREIGN KEY (task_id) REFERENCES tasks (id)
      )`,

      // Memory store for persistent agent memory
      `CREATE TABLE IF NOT EXISTS memory_store (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        ttl INTEGER DEFAULT 0,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        UNIQUE(key, namespace)
      )`,

      // Test patterns for Learning System
      `CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL CHECK(category IN ('unit', 'integration', 'e2e', 'performance', 'security')),
        framework TEXT NOT NULL CHECK(framework IN ('jest', 'mocha', 'vitest', 'playwright', 'cypress', 'jasmine', 'ava')),
        language TEXT NOT NULL CHECK(language IN ('typescript', 'javascript', 'python')),
        template TEXT NOT NULL,
        examples TEXT NOT NULL,
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0 CHECK(success_rate >= 0 AND success_rate <= 1),
        quality REAL CHECK(quality >= 0 AND quality <= 1),
        metadata TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // Pattern usage tracking
      `CREATE TABLE IF NOT EXISTS pattern_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        project_id TEXT,
        agent_id TEXT,
        context TEXT,
        success BOOLEAN DEFAULT TRUE,
        execution_time_ms INTEGER,
        error_message TEXT,
        used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pattern_id) REFERENCES patterns (id) ON DELETE CASCADE
      )`,

      // Q-values table for Q-learning
      `CREATE TABLE IF NOT EXISTS q_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        state_key TEXT NOT NULL,
        action_key TEXT NOT NULL,
        q_value REAL NOT NULL DEFAULT 0,
        update_count INTEGER DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, state_key, action_key)
      )`,

      // Learning experiences table
      `CREATE TABLE IF NOT EXISTS learning_experiences (
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
        -- NOTE: No FK constraint on task_id - learning is independent of fleet tasks
        -- task_id is kept for correlation/analytics but doesn't require task to exist in DB
      )`,

      // Learning history for Q-Learning
      `CREATE TABLE IF NOT EXISTS learning_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        pattern_id TEXT,
        state_representation TEXT NOT NULL,
        action TEXT NOT NULL,
        reward REAL NOT NULL,
        next_state_representation TEXT,
        q_value REAL,
        episode INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pattern_id) REFERENCES patterns (id) ON DELETE SET NULL
      )`,

      // Learning metrics for analytics
      `CREATE TABLE IF NOT EXISTS learning_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        metric_type TEXT NOT NULL CHECK(metric_type IN ('accuracy', 'latency', 'quality', 'success_rate', 'improvement')),
        metric_value REAL NOT NULL,
        baseline_value REAL,
        improvement_percentage REAL,
        pattern_count INTEGER,
        context TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.exec(table);
    }

    // Create indexes for better performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_agents_fleet_id ON agents (fleet_id)',
      'CREATE INDEX IF NOT EXISTS idx_agents_type ON agents (type)',
      'CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_fleet_id ON tasks (fleet_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_agent_id ON tasks (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks (type)',
      'CREATE INDEX IF NOT EXISTS idx_events_fleet_id ON events (fleet_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_type ON events (type)',
      'CREATE INDEX IF NOT EXISTS idx_events_processed ON events (processed)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_fleet_id ON metrics (fleet_id)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_agent_id ON metrics (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics (metric_type)',
      'CREATE INDEX IF NOT EXISTS idx_memory_store_namespace ON memory_store (namespace)',
      'CREATE INDEX IF NOT EXISTS idx_memory_store_expires_at ON memory_store (expires_at)',

      // Pattern indexes for fast lookup (< 50ms requirement)
      'CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns (category)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_framework ON patterns (framework)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_language ON patterns (language)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_quality ON patterns (quality)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_usage_count ON patterns (usage_count)',
      'CREATE INDEX IF NOT EXISTS idx_patterns_created_at ON patterns (created_at)',

      // Q-learning indexes
      'CREATE INDEX IF NOT EXISTS idx_q_values_agent_id ON q_values (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_q_values_state ON q_values (state_key)',
      'CREATE INDEX IF NOT EXISTS idx_q_values_updated ON q_values (last_updated)',
      'CREATE INDEX IF NOT EXISTS idx_learning_experiences_agent_id ON learning_experiences (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_learning_experiences_task_type ON learning_experiences (task_type)',
      'CREATE INDEX IF NOT EXISTS idx_learning_experiences_timestamp ON learning_experiences (timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_learning_history_agent_id ON learning_history (agent_id)',

      // Pattern usage indexes for analytics
      'CREATE INDEX IF NOT EXISTS idx_pattern_usage_pattern_id ON pattern_usage (pattern_id)',
      'CREATE INDEX IF NOT EXISTS idx_pattern_usage_agent_id ON pattern_usage (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_pattern_usage_used_at ON pattern_usage (used_at)',
      'CREATE INDEX IF NOT EXISTS idx_pattern_usage_success ON pattern_usage (success)',

      // Learning history indexes
      'CREATE INDEX IF NOT EXISTS idx_learning_history_agent_id ON learning_history (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_learning_history_pattern_id ON learning_history (pattern_id)',
      'CREATE INDEX IF NOT EXISTS idx_learning_history_timestamp ON learning_history (timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_learning_history_episode ON learning_history (episode)',

      // Learning metrics indexes
      'CREATE INDEX IF NOT EXISTS idx_learning_metrics_agent_id ON learning_metrics (agent_id)',
      'CREATE INDEX IF NOT EXISTS idx_learning_metrics_type ON learning_metrics (metric_type)',
      'CREATE INDEX IF NOT EXISTS idx_learning_metrics_timestamp ON learning_metrics (timestamp)'
    ];

    // Create indexes - skip if column doesn't exist (for schema compatibility)
    for (const index of indexes) {
      try {
        await this.exec(index);
      } catch (error: any) {
        // Log warning but continue - index might reference tables from other schema managers
        if (error.message && error.message.includes('no such column')) {
          this.logger.warn(`Skipping index creation: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    this.logger.info('Database tables and indexes created successfully');
  }

  /**
   * Insert or update fleet record
   */
  async upsertFleet(fleet: {
    id: string;
    name: string;
    config: any;
    status: string;
  }): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO fleets (id, name, config, status, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await this.run(sql, [
      fleet.id,
      fleet.name,
      JSON.stringify(fleet.config),
      fleet.status
    ]);
  }

  /**
   * Insert or update agent record
   */
  async upsertAgent(agent: {
    id: string;
    fleetId: string;
    type: string;
    status: string;
    config?: any;
    metrics?: any;
  }): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO agents (id, fleet_id, type, status, config, metrics, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await this.run(sql, [
      agent.id,
      agent.fleetId,
      agent.type,
      agent.status,
      agent.config ? JSON.stringify(agent.config) : null,
      agent.metrics ? JSON.stringify(agent.metrics) : null
    ]);
  }

  /**
   * Insert or update task record
   */
  async upsertTask(task: {
    id: string;
    fleetId: string;
    agentId?: string;
    type: string;
    name: string;
    data?: any;
    requirements?: any;
    status: string;
    priority?: number;
    result?: any;
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
  }): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO tasks (
        id, fleet_id, agent_id, type, name, data, requirements,
        status, priority, result, error, started_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.run(sql, [
      task.id,
      task.fleetId,
      task.agentId || null,
      task.type,
      task.name,
      task.data ? JSON.stringify(task.data) : null,
      task.requirements ? JSON.stringify(task.requirements) : null,
      task.status,
      task.priority || 1,
      task.result ? JSON.stringify(task.result) : null,
      task.error || null,
      task.startedAt ? task.startedAt.toISOString() : null,
      task.completedAt ? task.completedAt.toISOString() : null
    ]);
  }

  /**
   * Insert event record
   */
  async insertEvent(event: {
    id: string;
    fleetId?: string;
    agentId?: string;
    taskId?: string;
    type: string;
    source: string;
    target?: string;
    data: any;
  }): Promise<void> {
    const sql = `
      INSERT INTO events (id, fleet_id, agent_id, task_id, type, source, target, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.run(sql, [
      event.id,
      event.fleetId || null,
      event.agentId || null,
      event.taskId || null,
      event.type,
      event.source,
      event.target || null,
      JSON.stringify(event.data)
    ]);
  }

  /**
   * Insert metric record
   */
  async insertMetric(metric: {
    fleetId?: string;
    agentId?: string;
    taskId?: string;
    metricType: string;
    metricName: string;
    metricValue: number;
    unit?: string;
    tags?: any;
  }): Promise<void> {
    const sql = `
      INSERT INTO metrics (fleet_id, agent_id, task_id, metric_type, metric_name, metric_value, unit, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.run(sql, [
      metric.fleetId || null,
      metric.agentId || null,
      metric.taskId || null,
      metric.metricType,
      metric.metricName,
      metric.metricValue,
      metric.unit || null,
      metric.tags ? JSON.stringify(metric.tags) : null
    ]);
  }

  /**
   * Get database statistics
   */
  async stats(): Promise<{
    total: number;
    active: number;
    size?: number;
    tables?: number;
    lastModified?: Date;
  }> {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      // Get total agents
      const totalResult = await this.get('SELECT COUNT(*) as count FROM agents');
      const total = totalResult?.count || 0;

      // Get active agents
      const activeResult = await this.get('SELECT COUNT(*) as count FROM agents WHERE status = ?', ['active']);
      const active = activeResult?.count || 0;

      return {
        total,
        active
      };
    } catch (error) {
      this.logger.error('Error getting database stats:', error);
      throw error;
    }
  }

  /**
   * Compact database (VACUUM)
   */
  async compact(): Promise<void> {
    if (!this.db) {
        this.logger.error('Database connection failed - not initialized');
        throw new Error('Database not initialized. Call initialize() first.');
      }

    try {
      this.logger.info('Compacting database...');
      this.exec('VACUUM');
      this.logger.info('Database compaction completed');
    } catch (error) {
      this.logger.error('Error compacting database:', error);
      throw error;
    }
  }

  /**
   * ============================================================================
   * Q-Learning Database Operations
   * ============================================================================
   */

  /**
   * Upsert Q-value for state-action pair
   */
  async upsertQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    qValue: number
  ): Promise<void> {
    const sql = `
      INSERT INTO q_values (agent_id, state_key, action_key, q_value, update_count, last_updated)
      VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(agent_id, state_key, action_key) DO UPDATE SET
        q_value = ?,
        update_count = update_count + 1,
        last_updated = CURRENT_TIMESTAMP
    `;

    await this.run(sql, [agentId, stateKey, actionKey, qValue, qValue]);
  }

  /**
   * Get Q-value for state-action pair
   */
  async getQValue(agentId: string, stateKey: string, actionKey: string): Promise<number | null> {
    const sql = `
      SELECT q_value FROM q_values
      WHERE agent_id = ? AND state_key = ? AND action_key = ?
    `;

    const row = await this.get(sql, [agentId, stateKey, actionKey]);
    return row ? row.q_value : null;
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
    const sql = `
      SELECT state_key, action_key, q_value, update_count
      FROM q_values
      WHERE agent_id = ?
      ORDER BY last_updated DESC
    `;

    return await this.all(sql, [agentId]) as Array<{
      state_key: string;
      action_key: string;
      q_value: number;
      update_count: number;
    }>;
  }

  /**
   * Get Q-values for a specific state
   */
  async getStateQValues(agentId: string, stateKey: string): Promise<Array<{
    action_key: string;
    q_value: number;
  }>> {
    const sql = `
      SELECT action_key, q_value
      FROM q_values
      WHERE agent_id = ? AND state_key = ?
      ORDER BY q_value DESC
    `;

    return await this.all(sql, [agentId, stateKey]) as Array<{
      action_key: string;
      q_value: number;
    }>;
  }

  /**
   * Store learning experience
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
    const sql = `
      INSERT INTO learning_experiences (
        agent_id, task_id, task_type, state, action, reward, next_state, episode_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.run(sql, [
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
   * Get learning experiences for an agent
   */
  async getLearningExperiences(
    agentId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<Array<{
    id: number;
    task_type: string;
    state: string;
    action: string;
    reward: number;
    next_state: string;
    timestamp: string;
  }>> {
    const sql = `
      SELECT id, task_type, state, action, reward, next_state, timestamp
      FROM learning_experiences
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;

    return await this.all(sql, [agentId, limit, offset]) as Array<{
      id: number;
      task_type: string;
      state: string;
      action: string;
      reward: number;
      next_state: string;
      timestamp: string;
    }>;
  }

  /**
   * Store learning snapshot for analytics
   */
  async storeLearningSnapshot(snapshot: {
    agentId: string;
    snapshotType: 'performance' | 'q_table' | 'pattern';
    metrics: any;
    improvementRate?: number;
    totalExperiences?: number;
    explorationRate?: number;
  }): Promise<void> {
    const sql = `
      INSERT INTO learning_history (
        agent_id, state_representation, action, reward,
        next_state_representation, q_value, episode
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    // Store as learning_history entry (compatible with existing schema)
    await this.run(sql, [
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
   * Get learning statistics for an agent
   */
  async getLearningStatistics(agentId: string): Promise<{
    totalExperiences: number;
    avgReward: number;
    qTableSize: number;
    recentImprovement: number;
  }> {
    const [experiencesRow, avgRewardRow, qTableRow] = await Promise.all([
      this.get('SELECT COUNT(*) as count FROM learning_experiences WHERE agent_id = ?', [agentId]),
      this.get("SELECT AVG(reward) as avg FROM learning_experiences WHERE agent_id = ? AND timestamp > datetime('now', '-7 days')", [agentId]),
      this.get('SELECT COUNT(*) as count FROM q_values WHERE agent_id = ?', [agentId])
    ]);

    // Calculate recent improvement
    const recentRewards = await this.all(
      'SELECT reward FROM learning_experiences WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 20',
      [agentId]
    );

    const oldRewards = await this.all(
      'SELECT reward FROM learning_experiences WHERE agent_id = ? ORDER BY timestamp ASC LIMIT 20',
      [agentId]
    );

    const recentAvg = recentRewards.length > 0
      ? recentRewards.reduce((sum: number, r: any) => sum + r.reward, 0) / recentRewards.length
      : 0;

    const oldAvg = oldRewards.length > 0
      ? oldRewards.reduce((sum: number, r: any) => sum + r.reward, 0) / oldRewards.length
      : 0;

    const improvement = oldAvg !== 0 ? ((recentAvg - oldAvg) / Math.abs(oldAvg)) * 100 : 0;

    return {
      totalExperiences: (experiencesRow as any)?.count || 0,
      avgReward: (avgRewardRow as any)?.avg || 0,
      qTableSize: (qTableRow as any)?.count || 0,
      recentImprovement: improvement
    };
  }

  /**
   * Clear old learning experiences (keep last N)
   */
  async pruneOldExperiences(agentId: string, keepLast: number = 10000): Promise<number> {
    const sql = `
      DELETE FROM learning_experiences
      WHERE agent_id = ? AND id NOT IN (
        SELECT id FROM learning_experiences
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `;

    const result = await this.run(sql, [agentId, agentId, keepLast]);
    return result.changes;
  }

  /**
   * Get learning history for CLI display
   * Returns comprehensive view of agent's learning progress
   */
  async getLearningHistory(
    agentId: string,
    options: {
      limit?: number;
      offset?: number;
      includeQValues?: boolean;
      includePatterns?: boolean;
    } = {}
  ): Promise<{
    experiences: Array<{
      id: number;
      task_type: string;
      state: string;
      action: string;
      reward: number;
      next_state: string;
      timestamp: string;
      q_value?: number;
    }>;
    summary: {
      totalExperiences: number;
      avgReward: number;
      recentAvgReward: number;
      improvementRate: number;
      qTableSize: number;
      patternsStored?: number;
    };
  }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Get experiences with optional Q-values
    const experiencesSql = options.includeQValues
      ? `
        SELECT
          e.id,
          e.task_type,
          e.state,
          e.action,
          e.reward,
          e.next_state,
          e.timestamp,
          q.q_value
        FROM learning_experiences e
        LEFT JOIN q_values q ON q.agent_id = e.agent_id
          AND q.state_key = e.state
          AND q.action_key = e.action
        WHERE e.agent_id = ?
        ORDER BY e.timestamp DESC
        LIMIT ? OFFSET ?
      `
      : `
        SELECT
          id,
          task_type,
          state,
          action,
          reward,
          next_state,
          timestamp
        FROM learning_experiences
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `;

    const experiences = await this.all(experiencesSql, [agentId, limit, offset]) as any[];

    // Get summary statistics
    const stats = await this.getLearningStatistics(agentId);

    // Get pattern count if requested
    let patternsStored: number | undefined;
    if (options.includePatterns) {
      const patternResult = await this.get(
        'SELECT COUNT(*) as count FROM patterns WHERE metadata LIKE ?',
        [`%"agentId":"${agentId}"%`]
      );
      patternsStored = (patternResult as any)?.count || 0;
    }

    // Calculate recent average reward (last 20 experiences)
    const recentSql = `
      SELECT AVG(reward) as avg
      FROM (
        SELECT reward FROM learning_experiences
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT 20
      )
    `;
    const recentResult = await this.get(recentSql, [agentId]);
    const recentAvgReward = (recentResult as any)?.avg || 0;

    return {
      experiences,
      summary: {
        totalExperiences: stats.totalExperiences,
        avgReward: stats.avgReward,
        recentAvgReward,
        improvementRate: stats.recentImprovement,
        qTableSize: stats.qTableSize,
        patternsStored
      }
    };
  }
}