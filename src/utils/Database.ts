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
      throw new Error('Database not initialized');
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
      throw new Error('Database not initialized');
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
      throw new Error('Database not initialized');
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
      throw new Error('Database not initialized');
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
      'CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics (metric_type)'
    ];

    for (const index of indexes) {
      await this.exec(index);
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
}