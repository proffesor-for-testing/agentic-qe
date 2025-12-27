/**
 * MetricsStore - Persist metrics to database for historical analysis
 *
 * Stores metric snapshots over time and provides queries for
 * historical analysis, trend detection, and reporting.
 *
 * Part of the Nightly-Learner Phase 3 implementation.
 *
 * @version 1.0.0
 * @module src/learning/metrics/MetricsStore
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';
import { LearningMetricsData, LearningMetrics as LearningMetricsCollector } from './LearningMetrics';

export interface MetricsSnapshot {
  id: string;
  metrics: LearningMetricsData;
  snapshotTime: Date;
  periodHours: number;
}

export interface MetricsQuery {
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  orderBy?: 'asc' | 'desc';
}

export interface MetricsAggregation {
  metric: string;
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
  trend: number; // slope of linear regression
}

export interface MetricsStoreConfig {
  /** Database path. Default: .agentic-qe/memory.db */
  dbPath?: string;
  /** Auto-snapshot interval in hours. 0 = disabled. Default: 1 */
  autoSnapshotInterval?: number;
  /** Retention period in days. 0 = infinite. Default: 90 */
  retentionDays?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * MetricsStore persists and queries learning metrics over time
 *
 * @example
 * ```typescript
 * const store = new MetricsStore({ autoSnapshotInterval: 1 });
 *
 * // Capture current metrics
 * await store.captureSnapshot();
 *
 * // Query historical metrics
 * const history = await store.getHistory({
 *   startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
 *   limit: 100,
 * });
 *
 * // Get rolling averages
 * const rolling = await store.getRollingAverage('discoveryRate', 24); // 24-hour window
 *
 * // Analyze trends
 * const trends = await store.getTrends(['discoveryRate', 'transferSuccessRate']);
 * ```
 */
export class MetricsStore {
  private config: Required<MetricsStoreConfig>;
  private db: BetterSqlite3.Database;
  private logger: Logger;
  private collector: LearningMetricsCollector;
  private autoSnapshotTimer?: NodeJS.Timeout;

  constructor(config?: MetricsStoreConfig) {
    this.logger = Logger.getInstance();

    this.config = {
      dbPath: config?.dbPath || path.join(process.cwd(), '.agentic-qe', 'memory.db'),
      autoSnapshotInterval: config?.autoSnapshotInterval ?? 1, // 1 hour
      retentionDays: config?.retentionDays ?? 90,
      debug: config?.debug ?? false,
    };

    this.db = new BetterSqlite3(this.config.dbPath);
    this.collector = new LearningMetricsCollector({ dbPath: this.config.dbPath, debug: this.config.debug });

    this.initializeSchema();

    if (this.config.autoSnapshotInterval > 0) {
      this.startAutoSnapshot();
    }
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metrics_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_time INTEGER NOT NULL,
        period_hours INTEGER NOT NULL,

        -- Discovery metrics
        patterns_discovered_total INTEGER NOT NULL,
        patterns_discovered_today INTEGER NOT NULL,
        discovery_rate REAL NOT NULL,

        -- Quality metrics
        pattern_accuracy REAL NOT NULL,
        insight_actionability REAL NOT NULL,
        false_positive_rate REAL NOT NULL,

        -- Transfer metrics
        transfer_success_rate REAL NOT NULL,
        adoption_rate REAL NOT NULL,
        negative_transfer_count INTEGER NOT NULL,

        -- Impact metrics
        task_time_reduction REAL NOT NULL,
        coverage_improvement REAL NOT NULL,
        bug_detection_improvement REAL NOT NULL,

        -- System health
        sleep_cycle_completion_rate REAL NOT NULL,
        avg_cycle_duration REAL NOT NULL,
        error_rate REAL NOT NULL,

        -- Metadata
        calculated_at INTEGER NOT NULL,
        period_start INTEGER NOT NULL,
        period_end INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_snapshot_time ON metrics_snapshots(snapshot_time);
      CREATE INDEX IF NOT EXISTS idx_metrics_calculated_at ON metrics_snapshots(calculated_at);
      CREATE INDEX IF NOT EXISTS idx_metrics_period ON metrics_snapshots(period_start, period_end);
    `);
  }

  /**
   * Start auto-snapshot timer
   */
  private startAutoSnapshot(): void {
    const intervalMs = this.config.autoSnapshotInterval * 60 * 60 * 1000;

    this.autoSnapshotTimer = setInterval(async () => {
      try {
        await this.captureSnapshot();
        await this.cleanupOldSnapshots();
      } catch (error) {
        this.logger.error('[MetricsStore] Auto-snapshot failed', { error });
      }
    }, intervalMs);

    this.logger.info('[MetricsStore] Auto-snapshot enabled', {
      interval: this.config.autoSnapshotInterval + 'h',
    });
  }

  /**
   * Stop auto-snapshot timer
   */
  stopAutoSnapshot(): void {
    if (this.autoSnapshotTimer) {
      clearInterval(this.autoSnapshotTimer);
      this.autoSnapshotTimer = undefined;
      this.logger.info('[MetricsStore] Auto-snapshot disabled');
    }
  }

  /**
   * Capture a metrics snapshot
   */
  async captureSnapshot(periodHours: number = 24): Promise<MetricsSnapshot> {
    const metrics = await this.collector.getCurrentMetrics(periodHours);
    const id = `snapshot-${Date.now()}-${SecureRandom.randomString(8, 'alphanumeric')}`;
    const snapshotTime = new Date();

    // Store snapshot
    this.db.prepare(`
      INSERT INTO metrics_snapshots (
        id, snapshot_time, period_hours,
        patterns_discovered_total, patterns_discovered_today, discovery_rate,
        pattern_accuracy, insight_actionability, false_positive_rate,
        transfer_success_rate, adoption_rate, negative_transfer_count,
        task_time_reduction, coverage_improvement, bug_detection_improvement,
        sleep_cycle_completion_rate, avg_cycle_duration, error_rate,
        calculated_at, period_start, period_end, created_at
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      id,
      snapshotTime.getTime(),
      periodHours,
      metrics.patternsDiscoveredTotal,
      metrics.patternsDiscoveredToday,
      metrics.discoveryRate,
      metrics.patternAccuracy,
      metrics.insightActionability,
      metrics.falsePositiveRate,
      metrics.transferSuccessRate,
      metrics.adoptionRate,
      metrics.negativeTransferCount,
      metrics.taskTimeReduction,
      metrics.coverageImprovement,
      metrics.bugDetectionImprovement,
      metrics.sleepCycleCompletionRate,
      metrics.avgCycleDuration,
      metrics.errorRate,
      metrics.calculatedAt.getTime(),
      metrics.periodStart.getTime(),
      metrics.periodEnd.getTime(),
      Date.now()
    );

    if (this.config.debug) {
      this.logger.debug('[MetricsStore] Snapshot captured', {
        id,
        discoveryRate: metrics.discoveryRate,
        transferSuccessRate: metrics.transferSuccessRate,
      });
    }

    return {
      id,
      metrics,
      snapshotTime,
      periodHours,
    };
  }

  /**
   * Get historical snapshots
   */
  async getHistory(query?: MetricsQuery): Promise<MetricsSnapshot[]> {
    const { startTime, endTime, limit = 100, orderBy = 'desc' } = query || {};

    let sql = 'SELECT * FROM metrics_snapshots WHERE 1=1';
    const params: (string | number | Date)[] = [];

    if (startTime) {
      sql += ' AND snapshot_time >= ?';
      params.push(startTime.getTime());
    }

    if (endTime) {
      sql += ' AND snapshot_time <= ?';
      params.push(endTime.getTime());
    }

    sql += ` ORDER BY snapshot_time ${orderBy.toUpperCase()} LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<{ snapshot_time: number; value?: number } & Record<string, unknown>>;

    return rows.map(row => this.rowToSnapshot(row));
  }

  /**
   * Get latest snapshot
   */
  async getLatest(): Promise<MetricsSnapshot | null> {
    const row = this.db.prepare(`
      SELECT * FROM metrics_snapshots
      ORDER BY snapshot_time DESC
      LIMIT 1
    `).get() as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;

    return row ? this.rowToSnapshot(row) : null;
  }

  /**
   * Get rolling average for a metric
   */
  async getRollingAverage(metricName: string, windowHours: number): Promise<number[]> {
    const columnName = this.metricNameToColumn(metricName);
    const windowMs = windowHours * 60 * 60 * 1000;
    const now = Date.now();

    // Get snapshots in window
    const rows = this.db.prepare(`
      SELECT snapshot_time, ${columnName} as value
      FROM metrics_snapshots
      WHERE snapshot_time >= ?
      ORDER BY snapshot_time ASC
    `).all(now - windowMs) as Array<{ snapshot_time: number; value?: number } & Record<string, unknown>>;

    if (rows.length === 0) return [];

    // Calculate rolling average
    const values: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const windowStart = rows[i].snapshot_time - windowMs;
      const windowData = rows.filter(r => r.snapshot_time >= windowStart && r.snapshot_time <= rows[i].snapshot_time);
      const avg = windowData.reduce((sum, r) => sum + (r.value || 0), 0) / windowData.length;
      values.push(avg);
    }

    return values;
  }

  /**
   * Get aggregated statistics for metrics
   */
  async getAggregations(metricNames: string[], query?: MetricsQuery): Promise<Map<string, MetricsAggregation>> {
    const { startTime, endTime } = query || {};
    const result = new Map<string, MetricsAggregation>();

    for (const metricName of metricNames) {
      const columnName = this.metricNameToColumn(metricName);

      let sql = `
        SELECT
          AVG(${columnName}) as avg,
          MIN(${columnName}) as min,
          MAX(${columnName}) as max,
          COUNT(*) as count
        FROM metrics_snapshots
        WHERE 1=1
      `;
      const params: (string | number | Date)[] = [];

      if (startTime) {
        sql += ' AND snapshot_time >= ?';
        params.push(startTime.getTime());
      }

      if (endTime) {
        sql += ' AND snapshot_time <= ?';
        params.push(endTime.getTime());
      }

      const row = this.db.prepare(sql).get(...params) as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;

      // Calculate standard deviation
      let stdDev = 0;
      if ((row?.count ?? 0) > 1) {
        let varianceSql = `
          SELECT
            SUM((${columnName} - ?) * (${columnName} - ?)) / (COUNT(*) - 1) as variance
          FROM metrics_snapshots
          WHERE 1=1
        `;
        const varianceParams: (string | number | Date | undefined)[] = [row?.avg, row?.avg];

        if (startTime) {
          varianceSql += ' AND snapshot_time >= ?';
          varianceParams.push(startTime.getTime());
        }

        if (endTime) {
          varianceSql += ' AND snapshot_time <= ?';
          varianceParams.push(endTime.getTime());
        }

        const varianceRow = this.db.prepare(varianceSql).get(...varianceParams) as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;
        stdDev = Math.sqrt(varianceRow?.variance || 0);
      }

      // Calculate trend (linear regression slope)
      const trend = await this.calculateTrend(columnName, query);

      result.set(metricName, {
        metric: metricName,
        avg: row?.avg ?? 0,
        min: row?.min ?? 0,
        max: row?.max ?? 0,
        stdDev,
        count: row?.count ?? 0,
        trend,
      });
    }

    return result;
  }

  /**
   * Calculate trend using linear regression
   */
  private async calculateTrend(columnName: string, query?: MetricsQuery): Promise<number> {
    const { startTime, endTime } = query || {};

    let sql = `
      SELECT snapshot_time, ${columnName} as value
      FROM metrics_snapshots
      WHERE 1=1
    `;
    const params: (string | number | Date)[] = [];

    if (startTime) {
      sql += ' AND snapshot_time >= ?';
      params.push(startTime.getTime());
    }

    if (endTime) {
      sql += ' AND snapshot_time <= ?';
      params.push(endTime.getTime());
    }

    sql += ' ORDER BY snapshot_time ASC';

    const rows = this.db.prepare(sql).all(...params) as Array<{ snapshot_time: number; value?: number } & Record<string, unknown>>;

    if (rows.length < 2) return 0;

    // Simple linear regression: y = mx + b, we return m (slope)
    const n = rows.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i; // Use index as x to normalize
      const y = rows[i].value || 0;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return isFinite(slope) ? slope : 0;
  }

  /**
   * Get trends for multiple metrics
   */
  async getTrends(metricNames: string[], query?: MetricsQuery): Promise<Map<string, number>> {
    const trends = new Map<string, number>();

    for (const metricName of metricNames) {
      const columnName = this.metricNameToColumn(metricName);
      const trend = await this.calculateTrend(columnName, query);
      trends.set(metricName, trend);
    }

    return trends;
  }

  /**
   * Get metric comparison between two time periods
   */
  async compareMetrics(
    metricNames: string[],
    period1Start: Date,
    period1End: Date,
    period2Start: Date,
    period2End: Date
  ): Promise<Map<string, { period1: number; period2: number; change: number; changePercent: number }>> {
    const result = new Map();

    for (const metricName of metricNames) {
      const columnName = this.metricNameToColumn(metricName);

      const period1Row = this.db.prepare(`
        SELECT AVG(${columnName}) as avg
        FROM metrics_snapshots
        WHERE snapshot_time >= ? AND snapshot_time <= ?
      `).get(period1Start.getTime(), period1End.getTime()) as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;

      const period2Row = this.db.prepare(`
        SELECT AVG(${columnName}) as avg
        FROM metrics_snapshots
        WHERE snapshot_time >= ? AND snapshot_time <= ?
      `).get(period2Start.getTime(), period2End.getTime()) as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;

      const period1Avg = period1Row?.avg || 0;
      const period2Avg = period2Row?.avg || 0;
      const change = period2Avg - period1Avg;
      const changePercent = period1Avg > 0 ? (change / period1Avg) * 100 : 0;

      result.set(metricName, {
        period1: period1Avg,
        period2: period2Avg,
        change,
        changePercent,
      });
    }

    return result;
  }

  /**
   * Clean up old snapshots based on retention policy
   */
  async cleanupOldSnapshots(): Promise<number> {
    if (this.config.retentionDays === 0) return 0;

    const cutoffTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;

    const result = this.db.prepare(`
      DELETE FROM metrics_snapshots
      WHERE snapshot_time < ?
    `).run(cutoffTime);

    const deleted = result.changes;

    if (deleted > 0) {
      this.logger.info('[MetricsStore] Cleaned up old snapshots', {
        deleted,
        retentionDays: this.config.retentionDays,
      });
    }

    return deleted;
  }

  /**
   * Get snapshot count
   */
  getSnapshotCount(query?: MetricsQuery): number {
    const { startTime, endTime } = query || {};

    let sql = 'SELECT COUNT(*) as count FROM metrics_snapshots WHERE 1=1';
    const params: (string | number | Date)[] = [];

    if (startTime) {
      sql += ' AND snapshot_time >= ?';
      params.push(startTime.getTime());
    }

    if (endTime) {
      sql += ' AND snapshot_time <= ?';
      params.push(endTime.getTime());
    }

    const row = this.db.prepare(sql).get(...params) as { count?: number; avg?: number; min?: number; max?: number; variance?: number } & Record<string, unknown> | undefined;
    return row?.count || 0;
  }

  /**
   * Export metrics to JSON
   */
  async exportMetrics(query?: MetricsQuery): Promise<MetricsSnapshot[]> {
    return this.getHistory(query);
  }

  /**
   * Convert database row to MetricsSnapshot
   */
  private rowToSnapshot(row: Record<string, unknown>): MetricsSnapshot {
    const metrics: LearningMetricsData = {
      patternsDiscoveredTotal: row.patterns_discovered_total as number,
      patternsDiscoveredToday: row.patterns_discovered_today as number,
      discoveryRate: row.discovery_rate as number,
      patternAccuracy: row.pattern_accuracy as number,
      insightActionability: row.insight_actionability as number,
      falsePositiveRate: row.false_positive_rate as number,
      transferSuccessRate: row.transfer_success_rate as number,
      adoptionRate: row.adoption_rate as number,
      negativeTransferCount: row.negative_transfer_count as number,
      taskTimeReduction: row.task_time_reduction as number,
      coverageImprovement: row.coverage_improvement as number,
      bugDetectionImprovement: row.bug_detection_improvement as number,
      sleepCycleCompletionRate: row.sleep_cycle_completion_rate as number,
      avgCycleDuration: row.avg_cycle_duration as number,
      errorRate: row.error_rate as number,
      calculatedAt: new Date(row.calculated_at as number),
      periodStart: new Date(row.period_start as number),
      periodEnd: new Date(row.period_end as number),
    };

    return {
      id: row.id as string,
      metrics,
      snapshotTime: new Date(row.snapshot_time as number),
      periodHours: row.period_hours as number,
    };
  }

  /**
   * Convert metric name to database column name
   */
  private metricNameToColumn(metricName: string): string {
    // Convert camelCase to snake_case
    return metricName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Close database connection and stop auto-snapshot
   */
  close(): void {
    this.stopAutoSnapshot();
    this.collector.close();
    this.db.close();
  }
}

export default MetricsStore;
