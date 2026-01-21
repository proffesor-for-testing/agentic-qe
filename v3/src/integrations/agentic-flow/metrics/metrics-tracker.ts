/**
 * Agentic QE v3 - Metrics Tracker
 *
 * Tracks real runtime metrics for Agent Booster, Model Router,
 * ONNX Embeddings, and ReasoningBank components.
 *
 * Replaces hardcoded "91.5% success rate" with actual measured outcomes
 * persisted to SQLite (unified memory.db).
 *
 * @example
 * ```typescript
 * const tracker = await createMetricsTracker();
 *
 * // Record an outcome
 * await tracker.recordOutcome('booster', 'task-123', true, 5, {
 *   subType: 'var-to-const',
 *   confidence: 0.95,
 * });
 *
 * // Get success rate
 * const stats = await tracker.getSuccessRate('booster', '24h');
 * console.log(`Success rate: ${(stats.rate * 100).toFixed(1)}%`);
 * ```
 *
 * @module integrations/agentic-flow/metrics/metrics-tracker
 */

import { randomUUID } from 'crypto';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  getUnifiedMemory,
  UnifiedMemoryManager,
} from '../../../kernel/unified-memory';

import type {
  MetricComponent,
  OutcomeMetadata,
  OutcomeStatus,
  SuccessRateStats,
  ComponentMetricsSummary,
  SubTypeMetrics,
  MetricsSummary,
  PatternMetricsUpdate,
  TimeWindow,
  MetricsTrackerConfig,
  IMetricsTracker,
} from './types';

import {
  timeWindowToMs,
  DEFAULT_METRICS_TRACKER_CONFIG,
} from './types';

// ============================================================================
// Schema
// ============================================================================

/**
 * Metrics outcomes table schema (added to unified memory.db)
 */
const METRICS_OUTCOMES_SCHEMA = `
  -- Runtime metrics outcomes tracking
  CREATE TABLE IF NOT EXISTS metrics_outcomes (
    id TEXT PRIMARY KEY,
    component TEXT NOT NULL,
    task_id TEXT NOT NULL,
    success INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    duration_ms INTEGER NOT NULL,
    sub_type TEXT,
    confidence REAL,
    used_fallback INTEGER DEFAULT 0,
    implementation_used TEXT,
    item_count INTEGER,
    error_message TEXT,
    metadata_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Indexes for efficient queries
  CREATE INDEX IF NOT EXISTS idx_metrics_component ON metrics_outcomes(component);
  CREATE INDEX IF NOT EXISTS idx_metrics_component_time ON metrics_outcomes(component, created_at);
  CREATE INDEX IF NOT EXISTS idx_metrics_subtype ON metrics_outcomes(component, sub_type);
  CREATE INDEX IF NOT EXISTS idx_metrics_success ON metrics_outcomes(success);
  CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics_outcomes(created_at);
`;

// ============================================================================
// MetricsTracker Implementation
// ============================================================================

/**
 * Tracks real runtime metrics for agentic-flow components
 *
 * Persists all outcomes to SQLite for accurate success rate calculation.
 * Replaces hardcoded metrics with actual measured values.
 */
export class MetricsTracker implements IMetricsTracker {
  private readonly config: MetricsTrackerConfig;
  private unifiedMemory: UnifiedMemoryManager | null = null;
  private db: DatabaseType | null = null;
  private initialized = false;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(config: Partial<MetricsTrackerConfig> = {}) {
    this.config = { ...DEFAULT_METRICS_TRACKER_CONFIG, ...config };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the metrics tracker
   *
   * Creates the metrics_outcomes table if it doesn't exist.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Get unified memory manager
    this.unifiedMemory = getUnifiedMemory({
      dbPath: this.config.dbPath,
    });
    await this.unifiedMemory.initialize();

    // Get database reference
    this.db = this.unifiedMemory.getDatabase();

    // Ensure metrics schema exists
    this.ensureSchema();

    // Start automatic cleanup if enabled
    if (this.config.autoCleanup && this.config.cleanupIntervalMs) {
      this.cleanupInterval = setInterval(
        () => this.cleanup().catch(console.error),
        this.config.cleanupIntervalMs
      );
    }

    this.initialized = true;
    console.log('[MetricsTracker] Initialized with unified memory');
  }

  /**
   * Ensure metrics schema exists in database
   */
  private ensureSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.exec(METRICS_OUTCOMES_SCHEMA);
    } catch (error) {
      // Table may already exist, that's fine
      if (error instanceof Error && !error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Dispose of resources
   */
  async dispose(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    // Don't close unifiedMemory - it's a singleton shared with other components
    this.db = null;
    this.unifiedMemory = null;
    this.initialized = false;
  }

  // ============================================================================
  // Outcome Recording
  // ============================================================================

  /**
   * Record an operation outcome
   *
   * @param component - Component that performed the operation
   * @param taskId - Unique identifier for the task
   * @param success - Whether the operation succeeded
   * @param durationMs - Duration of the operation in milliseconds
   * @param metadata - Additional metadata about the operation
   */
  async recordOutcome(
    component: MetricComponent,
    taskId: string,
    success: boolean,
    durationMs: number,
    metadata?: OutcomeMetadata
  ): Promise<void> {
    this.ensureInitialized();

    const id = randomUUID();
    const status: OutcomeStatus = success ? 'success' : 'failure';

    const stmt = this.db!.prepare(`
      INSERT INTO metrics_outcomes (
        id, component, task_id, success, status, duration_ms,
        sub_type, confidence, used_fallback, implementation_used,
        item_count, error_message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      component,
      taskId,
      success ? 1 : 0,
      status,
      durationMs,
      metadata?.subType ?? null,
      metadata?.confidence ?? null,
      metadata?.usedFallback ? 1 : 0,
      metadata?.implementationUsed ?? null,
      metadata?.itemCount ?? null,
      metadata?.errorMessage ?? null,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  // ============================================================================
  // Success Rate Queries
  // ============================================================================

  /**
   * Get success rate for a component
   *
   * @param component - Component to get success rate for
   * @param timeWindow - Time window to consider (default: '24h')
   * @returns Success rate statistics
   */
  async getSuccessRate(
    component: MetricComponent,
    timeWindow: TimeWindow = '24h'
  ): Promise<SuccessRateStats> {
    this.ensureInitialized();

    const windowMs = timeWindowToMs(timeWindow);
    const cutoffTime = timeWindow === 'all'
      ? '1970-01-01'
      : new Date(Date.now() - windowMs).toISOString();

    // Get counts
    const countRow = this.db!.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partials,
        AVG(duration_ms) as avg_duration
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ?
    `).get(component, cutoffTime) as {
      total: number;
      successes: number;
      failures: number;
      partials: number;
      avg_duration: number;
    };

    // Get P95 duration
    const durations = this.db!.prepare(`
      SELECT duration_ms
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ?
      ORDER BY duration_ms
    `).all(component, cutoffTime) as Array<{ duration_ms: number }>;

    const p95Index = Math.floor(durations.length * 0.95);
    const p95Duration = durations[p95Index]?.duration_ms ?? 0;

    // Calculate rate
    const total = countRow.total ?? 0;
    const successes = countRow.successes ?? 0;
    const failures = countRow.failures ?? 0;
    const partials = countRow.partials ?? 0;
    const rate = total > 0 ? successes / total : 0;

    // Get time bounds
    const timeBounds = this.db!.prepare(`
      SELECT
        MIN(created_at) as window_start,
        MAX(created_at) as window_end
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ?
    `).get(component, cutoffTime) as {
      window_start: string | null;
      window_end: string | null;
    };

    return {
      rate,
      total,
      successes,
      failures,
      partials,
      avgDurationMs: countRow.avg_duration ?? 0,
      p95DurationMs: p95Duration,
      windowStart: timeBounds.window_start
        ? new Date(timeBounds.window_start)
        : new Date(),
      windowEnd: timeBounds.window_end
        ? new Date(timeBounds.window_end)
        : new Date(),
    };
  }

  // ============================================================================
  // Metrics Summary
  // ============================================================================

  /**
   * Get comprehensive metrics summary
   *
   * @param timeWindow - Time window to consider (default: '24h')
   * @returns Full metrics summary
   */
  async getMetricsSummary(timeWindow: TimeWindow = '24h'): Promise<MetricsSummary> {
    this.ensureInitialized();

    const components: MetricComponent[] = ['booster', 'router', 'embeddings', 'reasoning'];
    const componentSummaries: Record<MetricComponent, ComponentMetricsSummary> = {} as Record<MetricComponent, ComponentMetricsSummary>;

    let totalOps = 0;
    let totalSuccesses = 0;
    let totalDuration = 0;

    for (const component of components) {
      const summary = await this.getComponentSummary(component, timeWindow);
      componentSummaries[component] = summary;

      totalOps += summary.totalOperations;
      totalSuccesses += summary.successfulOperations;
      totalDuration += summary.avgDurationMs * summary.totalOperations;
    }

    return {
      components: componentSummaries,
      overall: {
        totalOperations: totalOps,
        successRate: totalOps > 0 ? totalSuccesses / totalOps : 0,
        avgDurationMs: totalOps > 0 ? totalDuration / totalOps : 0,
      },
      generatedAt: new Date(),
      timeWindow,
    };
  }

  /**
   * Get metrics summary for a single component
   */
  private async getComponentSummary(
    component: MetricComponent,
    timeWindow: TimeWindow
  ): Promise<ComponentMetricsSummary> {
    const windowMs = timeWindowToMs(timeWindow);
    const cutoffTime = timeWindow === 'all'
      ? '1970-01-01'
      : new Date(Date.now() - windowMs).toISOString();

    // Get overall stats
    const stats = await this.getSuccessRate(component, timeWindow);

    // Get duration percentiles
    const durations = this.db!.prepare(`
      SELECT duration_ms
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ?
      ORDER BY duration_ms
    `).all(component, cutoffTime) as Array<{ duration_ms: number }>;

    const p50Index = Math.floor(durations.length * 0.50);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    // Get sub-type breakdown
    const subTypeRows = this.db!.prepare(`
      SELECT
        sub_type,
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        AVG(duration_ms) as avg_duration
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ? AND sub_type IS NOT NULL
      GROUP BY sub_type
      ORDER BY total DESC
    `).all(component, cutoffTime) as Array<{
      sub_type: string;
      total: number;
      successes: number;
      avg_duration: number;
    }>;

    const bySubType: SubTypeMetrics[] = subTypeRows.map(row => ({
      subType: row.sub_type,
      total: row.total,
      successes: row.successes,
      successRate: row.total > 0 ? row.successes / row.total : 0,
      avgDurationMs: row.avg_duration,
    }));

    // Get fallback rate
    const fallbackRow = this.db!.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN used_fallback = 1 THEN 1 ELSE 0 END) as fallbacks
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ?
    `).get(component, cutoffTime) as { total: number; fallbacks: number };

    const fallbackRate = fallbackRow.total > 0
      ? fallbackRow.fallbacks / fallbackRow.total
      : 0;

    return {
      component,
      successRate: stats.rate,
      totalOperations: stats.total,
      successfulOperations: stats.successes,
      failedOperations: stats.failures,
      avgDurationMs: stats.avgDurationMs,
      p50DurationMs: durations[p50Index]?.duration_ms ?? 0,
      p95DurationMs: durations[p95Index]?.duration_ms ?? 0,
      p99DurationMs: durations[p99Index]?.duration_ms ?? 0,
      bySubType,
      fallbackRate,
      period: {
        start: stats.windowStart,
        end: stats.windowEnd,
      },
    };
  }

  // ============================================================================
  // Pattern Metrics
  // ============================================================================

  /**
   * Get metrics for pattern file updates
   *
   * Returns per-subtype metrics that can be written to pattern JSON files.
   *
   * @param component - Component to get pattern metrics for
   * @param timeWindow - Time window to consider
   * @returns Pattern metrics updates
   */
  async getPatternMetrics(
    component: MetricComponent,
    timeWindow: TimeWindow = '30d'
  ): Promise<PatternMetricsUpdate[]> {
    this.ensureInitialized();

    const windowMs = timeWindowToMs(timeWindow);
    const cutoffTime = timeWindow === 'all'
      ? '1970-01-01'
      : new Date(Date.now() - windowMs).toISOString();

    const rows = this.db!.prepare(`
      SELECT
        sub_type,
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        MAX(created_at) as last_updated
      FROM metrics_outcomes
      WHERE component = ? AND created_at >= ? AND sub_type IS NOT NULL
      GROUP BY sub_type
    `).all(component, cutoffTime) as Array<{
      sub_type: string;
      total: number;
      successes: number;
      last_updated: string;
    }>;

    return rows.map(row => ({
      patternKey: `${component}-${row.sub_type}`,
      successRate: row.total > 0 ? row.successes / row.total : 0,
      totalOperations: row.total,
      lastUpdated: new Date(row.last_updated),
    }));
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup old metrics based on retention policy
   *
   * @returns Number of deleted records
   */
  async cleanup(): Promise<number> {
    this.ensureInitialized();

    const retentionDays = this.config.retentionDays ?? 90;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
      .toISOString();

    // Delete old records
    const result = this.db!.prepare(`
      DELETE FROM metrics_outcomes
      WHERE created_at < ?
    `).run(cutoffDate);

    const deletedByAge = result.changes;

    // Also enforce max outcomes if set
    if (this.config.maxOutcomes) {
      const countRow = this.db!.prepare(
        'SELECT COUNT(*) as count FROM metrics_outcomes'
      ).get() as { count: number };

      if (countRow.count > this.config.maxOutcomes) {
        const toDelete = countRow.count - this.config.maxOutcomes;
        const deleteResult = this.db!.prepare(`
          DELETE FROM metrics_outcomes
          WHERE id IN (
            SELECT id FROM metrics_outcomes
            ORDER BY created_at ASC
            LIMIT ?
          )
        `).run(toDelete);

        return deletedByAge + deleteResult.changes;
      }
    }

    return deletedByAge;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('MetricsTracker not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if tracker is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and initialize a metrics tracker
 *
 * @param config - Configuration options
 * @returns Initialized metrics tracker
 *
 * @example
 * ```typescript
 * const tracker = await createMetricsTracker();
 *
 * // Record outcomes
 * await tracker.recordOutcome('booster', 'task-1', true, 5);
 *
 * // Get success rate
 * const stats = await tracker.getSuccessRate('booster');
 * console.log(`Booster success rate: ${(stats.rate * 100).toFixed(1)}%`);
 * ```
 */
export async function createMetricsTracker(
  config: Partial<MetricsTrackerConfig> = {}
): Promise<MetricsTracker> {
  const tracker = new MetricsTracker(config);
  await tracker.initialize();
  return tracker;
}

/**
 * Create a metrics tracker without auto-initialization
 * (must call initialize() manually)
 */
export function createMetricsTrackerSync(
  config: Partial<MetricsTrackerConfig> = {}
): MetricsTracker {
  return new MetricsTracker(config);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sharedInstance: MetricsTracker | null = null;

/**
 * Get or create the shared metrics tracker instance
 *
 * @param config - Configuration options (only used on first call)
 * @returns Shared metrics tracker instance
 */
export async function getMetricsTracker(
  config: Partial<MetricsTrackerConfig> = {}
): Promise<MetricsTracker> {
  if (!sharedInstance) {
    sharedInstance = await createMetricsTracker(config);
  }
  return sharedInstance;
}

/**
 * Reset the shared instance (for testing)
 */
export function resetMetricsTracker(): void {
  if (sharedInstance) {
    sharedInstance.dispose().catch(console.error);
    sharedInstance = null;
  }
}
