/**
 * @fileoverview Metrics aggregator for quality metrics collection and analysis
 * @module persistence/metrics-aggregator
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import {
  QualityMetric,
  AggregatedMetric,
  RecordMetricInput,
  MetricTrendPoint,
  AgentPerformance,
  AggregationPeriod,
  PersistenceConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  createDatabase,
  closeDatabase,
} from './schema';

/**
 * Query options for metrics
 */
export interface MetricQueryOptions {
  limit?: number;
  offset?: number;
  dimensions?: Record<string, string>;
}

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  period: AggregationPeriod;
  agentId?: string;
  metricName?: string;
}

/**
 * Period duration in milliseconds
 */
const PERIOD_DURATIONS: Record<AggregationPeriod, number> = {
  '1min': 60 * 1000,
  '5min': 5 * 60 * 1000,
  '1hour': 60 * 60 * 1000,
  '1day': 24 * 60 * 60 * 1000,
};

/**
 * MetricsAggregator collects and aggregates quality metrics
 *
 * @example
 * ```typescript
 * const aggregator = new MetricsAggregator({ dbPath: './data/metrics.db' });
 *
 * // Record a metric
 * aggregator.recordMetric({
 *   agent_id: 'test-generator',
 *   metric_name: 'test_coverage',
 *   metric_value: 85.5,
 *   dimensions: { suite: 'unit', language: 'typescript' }
 * });
 *
 * // Aggregate by period
 * aggregator.aggregateByPeriod({ period: '1hour' });
 *
 * // Get trends
 * const trends = aggregator.getMetricTrends('test_coverage', '24h');
 * ```
 */
export class MetricsAggregator {
  private db: Database.Database;
  private config: PersistenceConfig;
  private statements: {
    insertMetric: Database.Statement;
    insertAggregated: Database.Statement;
    getMetricsByAgent: Database.Statement;
    getMetricsByName: Database.Statement;
    getAggregatedByPeriod: Database.Statement;
  };

  /**
   * Create a new MetricsAggregator instance
   * @param config - Persistence configuration
   */
  constructor(config: Partial<PersistenceConfig> = {}) {
    this.config = { ...DEFAULT_PERSISTENCE_CONFIG, ...config };
    this.db = createDatabase(this.config);
    this.statements = this.prepareStatements();
  }

  /**
   * Prepare SQL statements for performance
   */
  private prepareStatements() {
    return {
      insertMetric: this.db.prepare(`
        INSERT INTO quality_metrics (id, timestamp, agent_id, metric_name, metric_value, dimensions)
        VALUES (?, ?, ?, ?, ?, ?)
      `),

      insertAggregated: this.db.prepare(`
        INSERT INTO aggregated_metrics (id, period_start, period_end, agent_id, metric_name, count, sum, min, max, avg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getMetricsByAgent: this.db.prepare(`
        SELECT * FROM quality_metrics
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      getMetricsByName: this.db.prepare(`
        SELECT * FROM quality_metrics
        WHERE metric_name = ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      getAggregatedByPeriod: this.db.prepare(`
        SELECT * FROM aggregated_metrics
        WHERE period_start >= ? AND period_end <= ?
        ORDER BY period_start DESC
      `),
    };
  }

  /**
   * Deserialize metric record from database row
   */
  private deserializeMetric(row: Record<string, unknown>): QualityMetric {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      agent_id: row.agent_id as string,
      metric_name: row.metric_name as string,
      metric_value: row.metric_value as number,
      dimensions: JSON.parse(row.dimensions as string),
    };
  }

  /**
   * Deserialize aggregated metric from database row
   */
  private deserializeAggregated(row: Record<string, unknown>): AggregatedMetric {
    return {
      id: row.id as string,
      period_start: row.period_start as string,
      period_end: row.period_end as string,
      agent_id: row.agent_id as string,
      metric_name: row.metric_name as string,
      count: row.count as number,
      sum: row.sum as number,
      min: row.min as number,
      max: row.max as number,
      avg: row.avg as number,
    };
  }

  /**
   * Record a quality metric
   * @param input - Metric recording input
   * @returns Created metric record
   */
  recordMetric(input: RecordMetricInput): QualityMetric {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    const dimensions = JSON.stringify(input.dimensions || {});

    let retries = this.config.maxRetries || 3;
    while (retries > 0) {
      try {
        this.statements.insertMetric.run(
          id,
          timestamp,
          input.agent_id,
          input.metric_name,
          input.metric_value,
          dimensions
        );
        break;
      } catch (error: unknown) {
        retries--;
        if (retries === 0) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to record metric after retries: ${errorMessage}`);
        }
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait for synchronous retry
        }
      }
    }

    return {
      id,
      timestamp,
      agent_id: input.agent_id,
      metric_name: input.metric_name,
      metric_value: input.metric_value,
      dimensions: input.dimensions || {},
    };
  }

  /**
   * Record multiple metrics in a batch
   * @param inputs - Array of metric inputs
   * @returns Array of created metrics
   */
  recordMetricsBatch(inputs: RecordMetricInput[]): QualityMetric[] {
    const insertMany = this.db.transaction((items: RecordMetricInput[]) => {
      const results: QualityMetric[] = [];
      for (const input of items) {
        const result = this.recordMetric(input);
        results.push(result);
      }
      return results;
    });

    return insertMany(inputs);
  }

  /**
   * Get metrics by agent ID
   * @param agentId - Agent identifier
   * @param options - Query options
   * @returns Array of metrics
   */
  getMetricsByAgent(agentId: string, options: MetricQueryOptions = {}): QualityMetric[] {
    const { limit = 100, offset = 0 } = options;

    const rows = this.statements.getMetricsByAgent.all(agentId, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.deserializeMetric(row));
  }

  /**
   * Get metrics by name
   * @param metricName - Metric name
   * @param options - Query options
   * @returns Array of metrics
   */
  getMetricsByName(metricName: string, options: MetricQueryOptions = {}): QualityMetric[] {
    const { limit = 100, offset = 0 } = options;

    const rows = this.statements.getMetricsByName.all(metricName, limit, offset) as Record<string, unknown>[];
    return rows.map(row => this.deserializeMetric(row));
  }

  /**
   * Get metrics within a time range
   * @param start - Start timestamp
   * @param end - End timestamp
   * @param limit - Maximum results
   * @returns Array of metrics
   */
  getMetricsByTimeRange(start: string, end: string, limit: number = 1000): QualityMetric[] {
    const rows = this.db.prepare(`
      SELECT * FROM quality_metrics
      WHERE timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(start, end, limit) as Record<string, unknown>[];

    return rows.map(row => this.deserializeMetric(row));
  }

  /**
   * Aggregate metrics by period
   * @param config - Aggregation configuration
   * @returns Number of aggregated periods
   */
  aggregateByPeriod(config: AggregationConfig): number {
    const duration = PERIOD_DURATIONS[config.period];
    const now = new Date();

    // Calculate period boundaries
    const periodStart = new Date(Math.floor(now.getTime() / duration) * duration - duration);
    const periodEnd = new Date(periodStart.getTime() + duration);

    // Build query conditions
    let whereClause = 'WHERE timestamp >= ? AND timestamp < ?';
    const params: (string | number)[] = [periodStart.toISOString(), periodEnd.toISOString()];

    if (config.agentId) {
      whereClause += ' AND agent_id = ?';
      params.push(config.agentId);
    }

    if (config.metricName) {
      whereClause += ' AND metric_name = ?';
      params.push(config.metricName);
    }

    // Get aggregations grouped by agent and metric
    const aggregations = this.db.prepare(`
      SELECT
        agent_id,
        metric_name,
        COUNT(*) as count,
        SUM(metric_value) as sum,
        MIN(metric_value) as min,
        MAX(metric_value) as max,
        AVG(metric_value) as avg
      FROM quality_metrics
      ${whereClause}
      GROUP BY agent_id, metric_name
    `).all(...params) as Array<{
      agent_id: string;
      metric_name: string;
      count: number;
      sum: number;
      min: number;
      max: number;
      avg: number;
    }>;

    // Insert aggregated records
    const insertAggregations = this.db.transaction((aggs: typeof aggregations) => {
      for (const agg of aggs) {
        this.statements.insertAggregated.run(
          uuidv4(),
          periodStart.toISOString(),
          periodEnd.toISOString(),
          agg.agent_id,
          agg.metric_name,
          agg.count,
          agg.sum,
          agg.min,
          agg.max,
          agg.avg
        );
      }
      return aggs.length;
    });

    return insertAggregations(aggregations);
  }

  /**
   * Get aggregated metrics for a time period
   * @param start - Period start
   * @param end - Period end
   * @returns Array of aggregated metrics
   */
  getAggregatedMetrics(start: string, end: string): AggregatedMetric[] {
    const rows = this.statements.getAggregatedByPeriod.all(start, end) as Record<string, unknown>[];
    return rows.map(row => this.deserializeAggregated(row));
  }

  /**
   * Get metric trends over time
   * @param metricName - Metric to analyze
   * @param timeframe - Timeframe (e.g., '24h', '7d', '30d')
   * @param agentId - Optional agent filter
   * @returns Array of trend data points
   */
  getMetricTrends(metricName: string, timeframe: string, agentId?: string): MetricTrendPoint[] {
    // Parse timeframe
    const match = timeframe.match(/^(\d+)(h|d|m)$/);
    if (!match) {
      throw new Error(`Invalid timeframe: ${timeframe}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    let milliseconds: number;

    switch (unit) {
      case 'm':
        milliseconds = value * 60 * 1000;
        break;
      case 'h':
        milliseconds = value * 60 * 60 * 1000;
        break;
      case 'd':
        milliseconds = value * 24 * 60 * 60 * 1000;
        break;
      default:
        throw new Error(`Invalid time unit: ${unit}`);
    }

    const end = new Date();
    const start = new Date(end.getTime() - milliseconds);

    // Build query
    let query = `
      SELECT
        strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
        AVG(metric_value) as value,
        COUNT(*) as count
      FROM quality_metrics
      WHERE metric_name = ? AND timestamp >= ? AND timestamp <= ?
    `;
    const params: (string | number)[] = [metricName, start.toISOString(), end.toISOString()];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    query += ' GROUP BY hour ORDER BY hour ASC';

    const rows = this.db.prepare(query).all(...params) as Array<{
      hour: string;
      value: number;
      count: number;
    }>;

    return rows.map(row => ({
      timestamp: row.hour,
      value: row.value,
      count: row.count,
    }));
  }

  /**
   * Get agent performance summary
   * @param agentId - Agent identifier
   * @param timeframe - Optional timeframe filter
   * @returns Agent performance data
   */
  getAgentPerformance(agentId: string, timeframe?: string): AgentPerformance {
    let whereClause = 'WHERE agent_id = ?';
    const params: (string | number)[] = [agentId];

    if (timeframe) {
      const match = timeframe.match(/^(\d+)(h|d|m)$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        let milliseconds: number;

        switch (unit) {
          case 'm':
            milliseconds = value * 60 * 1000;
            break;
          case 'h':
            milliseconds = value * 60 * 60 * 1000;
            break;
          case 'd':
            milliseconds = value * 24 * 60 * 60 * 1000;
            break;
          default:
            milliseconds = 24 * 60 * 60 * 1000;
        }

        const cutoff = new Date(Date.now() - milliseconds).toISOString();
        whereClause += ' AND timestamp >= ?';
        params.push(cutoff);
      }
    }

    // Get metric aggregations
    const metricRows = this.db.prepare(`
      SELECT metric_name, AVG(metric_value) as avg_value
      FROM quality_metrics
      ${whereClause}
      GROUP BY metric_name
    `).all(...params) as Array<{ metric_name: string; avg_value: number }>;

    const metrics: Record<string, number> = {};
    for (const row of metricRows) {
      metrics[row.metric_name] = row.avg_value;
    }

    // Calculate performance stats
    const totalEvents = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM quality_metrics
      ${whereClause}
    `).get(...params) as { count: number };

    // Duration and success rate from specific metrics
    const avgDuration = metrics['duration_ms'] || 0;
    const successRate = metrics['success_rate'] || 1.0;

    return {
      agent_id: agentId,
      total_events: totalEvents.count,
      avg_duration_ms: avgDuration,
      success_rate: successRate,
      metrics,
    };
  }

  /**
   * Get all unique metric names
   * @returns Array of metric names
   */
  getMetricNames(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT metric_name FROM quality_metrics
      ORDER BY metric_name
    `).all() as Array<{ metric_name: string }>;

    return rows.map(row => row.metric_name);
  }

  /**
   * Get metric statistics
   * @param metricName - Metric name
   * @returns Statistics for the metric
   */
  getMetricStatistics(metricName: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    stddev: number;
    p50: number;
    p90: number;
    p99: number;
  } {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as count,
        MIN(metric_value) as min,
        MAX(metric_value) as max,
        AVG(metric_value) as avg
      FROM quality_metrics
      WHERE metric_name = ?
    `).get(metricName) as { count: number; min: number; max: number; avg: number };

    // Calculate standard deviation
    const stddevResult = this.db.prepare(`
      SELECT
        SQRT(AVG((metric_value - ?) * (metric_value - ?))) as stddev
      FROM quality_metrics
      WHERE metric_name = ?
    `).get(stats.avg, stats.avg, metricName) as { stddev: number };

    // Get percentiles (approximate using order)
    const values = this.db.prepare(`
      SELECT metric_value
      FROM quality_metrics
      WHERE metric_name = ?
      ORDER BY metric_value ASC
    `).all(metricName) as Array<{ metric_value: number }>;

    const getPercentile = (p: number): number => {
      if (values.length === 0) return 0;
      const index = Math.floor((p / 100) * values.length);
      return values[Math.min(index, values.length - 1)].metric_value;
    };

    return {
      count: stats.count,
      min: stats.min || 0,
      max: stats.max || 0,
      avg: stats.avg || 0,
      stddev: stddevResult.stddev || 0,
      p50: getPercentile(50),
      p90: getPercentile(90),
      p99: getPercentile(99),
    };
  }

  /**
   * Compare metric across agents
   * @param metricName - Metric to compare
   * @param limit - Maximum agents to return
   * @returns Agent comparison data
   */
  compareAgents(metricName: string, limit: number = 10): Array<{
    agent_id: string;
    avg: number;
    count: number;
  }> {
    const rows = this.db.prepare(`
      SELECT
        agent_id,
        AVG(metric_value) as avg,
        COUNT(*) as count
      FROM quality_metrics
      WHERE metric_name = ?
      GROUP BY agent_id
      ORDER BY avg DESC
      LIMIT ?
    `).all(metricName, limit) as Array<{
      agent_id: string;
      avg: number;
      count: number;
    }>;

    return rows;
  }

  /**
   * Delete metrics older than specified date
   * @param olderThan - ISO timestamp cutoff
   * @returns Number of deleted metrics
   */
  deleteMetricsOlderThan(olderThan: string): number {
    const result = this.db.prepare(`
      DELETE FROM quality_metrics WHERE timestamp < ?
    `).run(olderThan);

    return result.changes;
  }

  /**
   * Delete aggregated metrics older than specified date
   * @param olderThan - ISO timestamp cutoff
   * @returns Number of deleted records
   */
  deleteAggregatedOlderThan(olderThan: string): number {
    const result = this.db.prepare(`
      DELETE FROM aggregated_metrics WHERE period_end < ?
    `).run(olderThan);

    return result.changes;
  }

  /**
   * Get overall statistics
   * @returns Aggregator statistics
   */
  getStatistics(): {
    totalMetrics: number;
    totalAggregated: number;
    uniqueAgents: number;
    uniqueMetricNames: number;
    oldestMetric: string | null;
    newestMetric: string | null;
  } {
    const stats = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM quality_metrics) as totalMetrics,
        (SELECT COUNT(*) FROM aggregated_metrics) as totalAggregated,
        (SELECT COUNT(DISTINCT agent_id) FROM quality_metrics) as uniqueAgents,
        (SELECT COUNT(DISTINCT metric_name) FROM quality_metrics) as uniqueMetricNames,
        (SELECT MIN(timestamp) FROM quality_metrics) as oldestMetric,
        (SELECT MAX(timestamp) FROM quality_metrics) as newestMetric
    `).get() as {
      totalMetrics: number;
      totalAggregated: number;
      uniqueAgents: number;
      uniqueMetricNames: number;
      oldestMetric: string | null;
      newestMetric: string | null;
    };

    return stats;
  }

  /**
   * Close database connection
   */
  close(): void {
    closeDatabase(this.db);
  }
}
