/**
 * LLMBaselineTracker - Track LLM provider performance baselines over time
 *
 * Phase 0 integration: Establishes real performance baselines for LLM providers
 * to replace unverified claims with measured data.
 *
 * Integrates with existing observability infrastructure:
 * - Uses BaselineCollector patterns
 * - Stores data in SQLite for historical tracking
 * - Provides improvement target calculations
 *
 * @version 1.0.0
 * @module providers/LLMBaselineTracker
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/Logger';
import { SecureRandom } from '../utils/SecureRandom';

/**
 * LLM performance measurement
 */
export interface LLMPerformanceMeasurement {
  id?: string;
  provider: string;          // 'openrouter', 'ruvllm', 'claude'
  model: string;             // e.g., 'mistralai/devstral-2512:free'
  operation: string;         // 'completion', 'embedding', 'batch'
  metrics: {
    latencyP50: number;      // milliseconds
    latencyP95: number;      // milliseconds
    latencyP99: number;      // milliseconds
    tokensPerSecond: number; // throughput
    inputTokens: number;     // total for sample
    outputTokens: number;    // total for sample
    cost: number;            // USD
    errorRate: number;       // 0-1
  };
  sampleSize: number;
  timestamp: Date;
  environment?: {
    node?: string;
    platform?: string;
  };
}

/**
 * Baseline comparison result
 */
export interface BaselineComparison {
  provider: string;
  model: string;
  operation: string;
  current: LLMPerformanceMeasurement;
  baseline: LLMPerformanceMeasurement | null;
  improvement: {
    latencyP50Change: number;     // % change (negative = improvement)
    throughputChange: number;      // % change (positive = improvement)
    costChange: number;            // % change (negative = improvement)
  } | null;
  meetsTarget: boolean;
}

/**
 * LLMBaselineTracker configuration
 */
export interface LLMBaselineTrackerConfig {
  /** Database path. Default: .agentic-qe/llm-baselines.db */
  dbPath?: string;
  /** Minimum improvement target (%). Default: 10 */
  minImprovementTarget?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Tracks LLM provider performance baselines over time
 */
export class LLMBaselineTracker {
  private db: BetterSqlite3.Database | null = null;
  private readonly config: Required<LLMBaselineTrackerConfig>;
  private readonly logger: Logger;
  private initialized: boolean = false;

  constructor(config: LLMBaselineTrackerConfig = {}) {
    this.logger = Logger.getInstance();
    this.config = {
      dbPath: config.dbPath || path.join(process.cwd(), '.agentic-qe', 'llm-baselines.db'),
      minImprovementTarget: config.minImprovementTarget ?? 10,
      debug: config.debug ?? false,
    };
  }

  /**
   * Initialize the tracker and create database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new BetterSqlite3(this.config.dbPath);

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS llm_measurements (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        latency_p50 REAL NOT NULL,
        latency_p95 REAL NOT NULL,
        latency_p99 REAL NOT NULL,
        tokens_per_second REAL NOT NULL,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cost REAL NOT NULL,
        error_rate REAL NOT NULL,
        sample_size INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        environment TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_measurements_provider_model
        ON llm_measurements(provider, model, operation);
      CREATE INDEX IF NOT EXISTS idx_measurements_timestamp
        ON llm_measurements(timestamp);

      CREATE TABLE IF NOT EXISTS llm_baselines (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        measurement_id TEXT NOT NULL,
        set_at TEXT NOT NULL,
        UNIQUE(provider, model, operation),
        FOREIGN KEY(measurement_id) REFERENCES llm_measurements(id)
      );
    `);

    this.initialized = true;

    if (this.config.debug) {
      this.logger.debug('LLMBaselineTracker initialized', { dbPath: this.config.dbPath });
    }
  }

  /**
   * Record a new performance measurement
   */
  recordMeasurement(measurement: Omit<LLMPerformanceMeasurement, 'id'>): LLMPerformanceMeasurement {
    if (!this.db) throw new Error('Tracker not initialized');

    const id = `llm-${SecureRandom.uuid().slice(0, 8)}`;
    const record: LLMPerformanceMeasurement = { ...measurement, id };

    const stmt = this.db.prepare(`
      INSERT INTO llm_measurements (
        id, provider, model, operation,
        latency_p50, latency_p95, latency_p99,
        tokens_per_second, input_tokens, output_tokens,
        cost, error_rate, sample_size, timestamp, environment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      record.provider,
      record.model,
      record.operation,
      record.metrics.latencyP50,
      record.metrics.latencyP95,
      record.metrics.latencyP99,
      record.metrics.tokensPerSecond,
      record.metrics.inputTokens,
      record.metrics.outputTokens,
      record.metrics.cost,
      record.metrics.errorRate,
      record.sampleSize,
      record.timestamp.toISOString(),
      record.environment ? JSON.stringify(record.environment) : null
    );

    if (this.config.debug) {
      this.logger.debug('Recorded LLM measurement', {
        id,
        provider: record.provider,
        model: record.model,
        latencyP50: record.metrics.latencyP50,
      });
    }

    return record;
  }

  /**
   * Set a measurement as the baseline for a provider/model/operation
   */
  setBaseline(provider: string, model: string, operation: string, measurementId: string): void {
    if (!this.db) throw new Error('Tracker not initialized');

    const id = `baseline-${provider}-${model}-${operation}`.replace(/[^a-zA-Z0-9-]/g, '-');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO llm_baselines (id, provider, model, operation, measurement_id, set_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, provider, model, operation, measurementId, new Date().toISOString());

    this.logger.info('Set LLM baseline', { provider, model, operation, measurementId });
  }

  /**
   * Get the current baseline for a provider/model/operation
   */
  getBaseline(provider: string, model: string, operation: string): LLMPerformanceMeasurement | null {
    if (!this.db) throw new Error('Tracker not initialized');

    const row = this.db.prepare(`
      SELECT m.* FROM llm_measurements m
      JOIN llm_baselines b ON m.id = b.measurement_id
      WHERE b.provider = ? AND b.model = ? AND b.operation = ?
    `).get(provider, model, operation) as any;

    if (!row) return null;

    return this.rowToMeasurement(row);
  }

  /**
   * Compare current measurement against baseline
   */
  compareToBaseline(current: LLMPerformanceMeasurement): BaselineComparison {
    const baseline = this.getBaseline(current.provider, current.model, current.operation);

    let improvement: BaselineComparison['improvement'] = null;
    let meetsTarget = false;

    if (baseline) {
      const latencyChange =
        ((current.metrics.latencyP50 - baseline.metrics.latencyP50) / baseline.metrics.latencyP50) * 100;
      const throughputChange =
        ((current.metrics.tokensPerSecond - baseline.metrics.tokensPerSecond) /
          baseline.metrics.tokensPerSecond) *
        100;
      const costChange =
        baseline.metrics.cost > 0
          ? ((current.metrics.cost - baseline.metrics.cost) / baseline.metrics.cost) * 100
          : 0;

      improvement = {
        latencyP50Change: latencyChange,
        throughputChange,
        costChange,
      };

      // Meets target if latency improved by at least minImprovementTarget%
      // OR throughput improved by at least minImprovementTarget%
      meetsTarget =
        latencyChange <= -this.config.minImprovementTarget ||
        throughputChange >= this.config.minImprovementTarget;
    }

    return {
      provider: current.provider,
      model: current.model,
      operation: current.operation,
      current,
      baseline,
      improvement,
      meetsTarget,
    };
  }

  /**
   * Get all measurements for a provider/model
   */
  getMeasurements(
    provider: string,
    model: string,
    operation?: string,
    limit: number = 100
  ): LLMPerformanceMeasurement[] {
    if (!this.db) throw new Error('Tracker not initialized');

    let query = `
      SELECT * FROM llm_measurements
      WHERE provider = ? AND model = ?
    `;
    const params: any[] = [provider, model];

    if (operation) {
      query += ' AND operation = ?';
      params.push(operation);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => this.rowToMeasurement(row));
  }

  /**
   * Get summary statistics for a provider/model
   */
  getSummary(provider: string, model: string): {
    totalMeasurements: number;
    avgLatencyP50: number;
    avgThroughput: number;
    totalCost: number;
    lastMeasurement: Date | null;
  } {
    if (!this.db) throw new Error('Tracker not initialized');

    const row = this.db
      .prepare(
        `
      SELECT
        COUNT(*) as total,
        AVG(latency_p50) as avg_latency,
        AVG(tokens_per_second) as avg_throughput,
        SUM(cost) as total_cost,
        MAX(timestamp) as last_timestamp
      FROM llm_measurements
      WHERE provider = ? AND model = ?
    `
      )
      .get(provider, model) as any;

    return {
      totalMeasurements: row.total || 0,
      avgLatencyP50: row.avg_latency || 0,
      avgThroughput: row.avg_throughput || 0,
      totalCost: row.total_cost || 0,
      lastMeasurement: row.last_timestamp ? new Date(row.last_timestamp) : null,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  private rowToMeasurement(row: any): LLMPerformanceMeasurement {
    return {
      id: row.id,
      provider: row.provider,
      model: row.model,
      operation: row.operation,
      metrics: {
        latencyP50: row.latency_p50,
        latencyP95: row.latency_p95,
        latencyP99: row.latency_p99,
        tokensPerSecond: row.tokens_per_second,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cost: row.cost,
        errorRate: row.error_rate,
      },
      sampleSize: row.sample_size,
      timestamp: new Date(row.timestamp),
      environment: row.environment ? JSON.parse(row.environment) : undefined,
    };
  }
}

/**
 * Create a tracker instance (convenience function)
 */
export function createLLMBaselineTracker(config?: LLMBaselineTrackerConfig): LLMBaselineTracker {
  return new LLMBaselineTracker(config);
}
