/**
 * Agentic QE v3 - MinCut Persistence Layer
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Provides database persistence for MinCut analysis data using
 * the unified memory system (UnifiedMemoryManager).
 *
 * Tables:
 * - mincut_snapshots: Graph state snapshots
 * - mincut_history: Time-series MinCut values
 * - mincut_weak_vertices: Detected bottlenecks
 * - mincut_alerts: Generated alerts
 * - mincut_healing_actions: Self-healing history
 * - mincut_observations: Strange Loop observations
 */

import { v4 as uuidv4 } from 'uuid';
import { UnifiedMemoryManager, getUnifiedMemory } from '../../kernel/unified-memory';
import { SwarmGraph } from './swarm-graph';
import {
  SwarmGraphSnapshot,
  MinCutResult,
  WeakVertex,
  MinCutAlert,
  MinCutHistoryEntry,
  ReorganizationAction,
  ReorganizationResult,
  SwarmObservation,
  SelfModelPrediction,
} from './interfaces';

// ============================================================================
// Database Row Types
// ============================================================================

interface SnapshotRow {
  id: string;
  timestamp: string;
  vertex_count: number;
  edge_count: number;
  total_weight: number;
  is_connected: number;
  component_count: number;
  vertices_json: string;
  edges_json: string;
  created_at: string;
}

interface HistoryRow {
  id: number;
  timestamp: string;
  mincut_value: number;
  vertex_count: number;
  edge_count: number;
  algorithm: string;
  duration_ms: number | null;
  snapshot_id: string | null;
  created_at: string;
}

interface WeakVertexRow {
  id: string;
  vertex_id: string;
  weighted_degree: number;
  risk_score: number;
  reason: string;
  domain: string | null;
  vertex_type: string;
  suggestions_json: string | null;
  detected_at: string;
  resolved_at: string | null;
  snapshot_id: string | null;
  created_at: string;
}

interface AlertRow {
  id: string;
  severity: string;
  message: string;
  mincut_value: number;
  threshold: number;
  affected_vertices_json: string | null;
  remediations_json: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  timestamp: string;
  created_at: string;
}

interface HealingActionRow {
  id: string;
  action_type: string;
  action_params_json: string;
  success: number;
  mincut_before: number;
  mincut_after: number;
  improvement: number;
  error_message: string | null;
  duration_ms: number;
  triggered_by: string | null;
  snapshot_before_id: string | null;
  snapshot_after_id: string | null;
  created_at: string;
}

interface ObservationRow {
  id: string;
  iteration: number;
  mincut_value: number;
  weak_vertex_count: number;
  weak_vertices_json: string | null;
  snapshot_id: string | null;
  prediction_json: string | null;
  actual_vs_predicted_diff: number | null;
  timestamp: string;
}

// ============================================================================
// MinCut Persistence Class
// ============================================================================

/**
 * MinCut Persistence - Handles database operations for MinCut data
 */
export class MinCutPersistence {
  private memory: UnifiedMemoryManager;
  private initialized = false;

  constructor(memory?: UnifiedMemoryManager) {
    this.memory = memory ?? getUnifiedMemory();
  }

  /**
   * Initialize the persistence layer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.memory.isInitialized()) {
      await this.memory.initialize();
    }

    this.initialized = true;
  }

  // ==========================================================================
  // Snapshot Operations
  // ==========================================================================

  /**
   * Save a graph snapshot
   */
  async saveSnapshot(snapshot: SwarmGraphSnapshot): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const db = this.memory.getDatabase();

    db.prepare(`
      INSERT INTO mincut_snapshots (
        id, timestamp, vertex_count, edge_count, total_weight,
        is_connected, component_count, vertices_json, edges_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      snapshot.timestamp.toISOString(),
      snapshot.stats.vertexCount,
      snapshot.stats.edgeCount,
      snapshot.stats.totalWeight,
      snapshot.stats.isConnected ? 1 : 0,
      snapshot.stats.componentCount,
      JSON.stringify(snapshot.vertices),
      JSON.stringify(snapshot.edges)
    );

    // Enforce retention to prevent unbounded snapshot growth (Issue #258)
    await this.enforceRetention();

    return id;
  }

  /**
   * Enforce retention limits on snapshots and history to prevent DB bloat (Issue #258)
   */
  async enforceRetention(maxSnapshots: number = 200): Promise<number> {
    const db = this.memory.getDatabase();
    if (!db) return 0;

    const countRow = db.prepare('SELECT COUNT(*) as count FROM mincut_snapshots').get() as { count: number };
    if (countRow.count <= maxSnapshots) return 0;

    const deleteCount = countRow.count - maxSnapshots;
    db.prepare(`
      DELETE FROM mincut_snapshots WHERE id IN (
        SELECT id FROM mincut_snapshots ORDER BY created_at ASC LIMIT ?
      )
    `).run(deleteCount);

    // Also trim history
    const historyCount = db.prepare('SELECT COUNT(*) as count FROM mincut_history').get() as { count: number };
    if (historyCount.count > 500) {
      const historyDelete = historyCount.count - 500;
      db.prepare(`
        DELETE FROM mincut_history WHERE id IN (
          SELECT id FROM mincut_history ORDER BY created_at ASC LIMIT ?
        )
      `).run(historyDelete);
    }

    return deleteCount;
  }

  /**
   * Get a snapshot by ID
   */
  async getSnapshot(id: string): Promise<SwarmGraphSnapshot | null> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const row = db.prepare('SELECT * FROM mincut_snapshots WHERE id = ?')
      .get(id) as SnapshotRow | undefined;

    if (!row) return null;

    return this.rowToSnapshot(row);
  }

  /**
   * Get recent snapshots
   */
  async getRecentSnapshots(limit: number = 10): Promise<SwarmGraphSnapshot[]> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const rows = db.prepare(`
      SELECT * FROM mincut_snapshots
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as SnapshotRow[];

    return rows.map(row => this.rowToSnapshot(row));
  }

  // ==========================================================================
  // History Operations
  // ==========================================================================

  /**
   * Record a MinCut measurement
   */
  async recordHistory(entry: {
    minCutValue: number;
    vertexCount: number;
    edgeCount: number;
    algorithm?: string;
    durationMs?: number;
    snapshotId?: string;
  }): Promise<number> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const result = db.prepare(`
      INSERT INTO mincut_history (
        mincut_value, vertex_count, edge_count, algorithm, duration_ms, snapshot_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.minCutValue,
      entry.vertexCount,
      entry.edgeCount,
      entry.algorithm ?? 'weighted-degree',
      entry.durationMs ?? null,
      entry.snapshotId ?? null
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Get MinCut history
   */
  async getHistory(options: {
    limit?: number;
    since?: Date;
    until?: Date;
  } = {}): Promise<MinCutHistoryEntry[]> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    let sql = 'SELECT * FROM mincut_history WHERE 1=1';
    const params: unknown[] = [];

    if (options.since) {
      sql += ' AND timestamp >= ?';
      params.push(options.since.toISOString());
    }

    if (options.until) {
      sql += ' AND timestamp <= ?';
      params.push(options.until.toISOString());
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = db.prepare(sql).all(...params) as HistoryRow[];

    return rows.map(row => ({
      timestamp: new Date(row.timestamp),
      value: row.mincut_value,
      vertexCount: row.vertex_count,
      edgeCount: row.edge_count,
    }));
  }

  /**
   * Get MinCut statistics over a time window
   */
  async getHistoryStats(windowMs: number = 3600000): Promise<{
    min: number;
    max: number;
    average: number;
    count: number;
    trend: 'improving' | 'stable' | 'degrading';
  }> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const since = new Date(Date.now() - windowMs);

    const stats = db.prepare(`
      SELECT
        MIN(mincut_value) as min_value,
        MAX(mincut_value) as max_value,
        AVG(mincut_value) as avg_value,
        COUNT(*) as count
      FROM mincut_history
      WHERE timestamp >= ?
    `).get(since.toISOString()) as {
      min_value: number | null;
      max_value: number | null;
      avg_value: number | null;
      count: number;
    };

    // Calculate trend from first and last values
    const firstLast = db.prepare(`
      SELECT mincut_value, timestamp FROM (
        SELECT mincut_value, timestamp FROM mincut_history
        WHERE timestamp >= ?
        ORDER BY timestamp ASC
        LIMIT 1
      )
      UNION ALL
      SELECT mincut_value, timestamp FROM (
        SELECT mincut_value, timestamp FROM mincut_history
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 1
      )
    `).all(since.toISOString(), since.toISOString()) as Array<{ mincut_value: number }>;

    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (firstLast.length >= 2) {
      const diff = firstLast[1].mincut_value - firstLast[0].mincut_value;
      const threshold = (stats.avg_value ?? 0) * 0.1;
      if (diff > threshold) {
        trend = 'improving';
      } else if (diff < -threshold) {
        trend = 'degrading';
      }
    }

    return {
      min: stats.min_value ?? 0,
      max: stats.max_value ?? 0,
      average: stats.avg_value ?? 0,
      count: stats.count,
      trend,
    };
  }

  // ==========================================================================
  // Weak Vertex Operations
  // ==========================================================================

  /**
   * Save detected weak vertices
   */
  async saveWeakVertices(
    weakVertices: WeakVertex[],
    snapshotId?: string
  ): Promise<string[]> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const ids: string[] = [];

    const insert = db.prepare(`
      INSERT INTO mincut_weak_vertices (
        id, vertex_id, weighted_degree, risk_score, reason,
        domain, vertex_type, suggestions_json, snapshot_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((vertices: WeakVertex[]) => {
      for (const weak of vertices) {
        const id = uuidv4();
        insert.run(
          id,
          weak.vertexId,
          weak.weightedDegree,
          weak.riskScore,
          weak.reason,
          weak.vertex.domain ?? null,
          weak.vertex.type,
          JSON.stringify(weak.suggestions),
          snapshotId ?? null
        );
        ids.push(id);
      }
    });

    insertMany(weakVertices);
    return ids;
  }

  /**
   * Get unresolved weak vertices
   */
  async getUnresolvedWeakVertices(): Promise<Array<{
    id: string;
    vertexId: string;
    riskScore: number;
    reason: string;
    detectedAt: Date;
  }>> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const rows = db.prepare(`
      SELECT id, vertex_id, risk_score, reason, detected_at
      FROM mincut_weak_vertices
      WHERE resolved_at IS NULL
      ORDER BY risk_score DESC
    `).all() as Array<{
      id: string;
      vertex_id: string;
      risk_score: number;
      reason: string;
      detected_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      vertexId: row.vertex_id,
      riskScore: row.risk_score,
      reason: row.reason,
      detectedAt: new Date(row.detected_at),
    }));
  }

  /**
   * Mark weak vertex as resolved
   */
  async resolveWeakVertex(id: string): Promise<boolean> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const result = db.prepare(`
      UPDATE mincut_weak_vertices
      SET resolved_at = datetime('now')
      WHERE id = ? AND resolved_at IS NULL
    `).run(id);

    return result.changes > 0;
  }

  // ==========================================================================
  // Alert Operations
  // ==========================================================================

  /**
   * Save an alert
   */
  async saveAlert(alert: MinCutAlert): Promise<string> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();

    db.prepare(`
      INSERT INTO mincut_alerts (
        id, severity, message, mincut_value, threshold,
        affected_vertices_json, remediations_json, acknowledged, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.id,
      alert.severity,
      alert.message,
      alert.minCutValue,
      alert.threshold,
      JSON.stringify(alert.affectedVertices),
      JSON.stringify(alert.remediations),
      alert.acknowledged ? 1 : 0,
      alert.timestamp.toISOString()
    );

    return alert.id;
  }

  /**
   * Get unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<MinCutAlert[]> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const rows = db.prepare(`
      SELECT * FROM mincut_alerts
      WHERE acknowledged = 0
      ORDER BY timestamp DESC
    `).all() as AlertRow[];

    return rows.map(row => this.rowToAlert(row));
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(id: string, acknowledgedBy?: string): Promise<boolean> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const result = db.prepare(`
      UPDATE mincut_alerts
      SET acknowledged = 1,
          acknowledged_at = datetime('now'),
          acknowledged_by = ?
      WHERE id = ? AND acknowledged = 0
    `).run(acknowledgedBy ?? null, id);

    return result.changes > 0;
  }

  /**
   * Get alert history
   */
  async getAlertHistory(limit: number = 50): Promise<MinCutAlert[]> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const rows = db.prepare(`
      SELECT * FROM mincut_alerts
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as AlertRow[];

    return rows.map(row => this.rowToAlert(row));
  }

  // ==========================================================================
  // Healing Action Operations
  // ==========================================================================

  /**
   * Record a healing action
   */
  async recordHealingAction(result: ReorganizationResult & {
    triggeredBy?: string;
    snapshotBeforeId?: string;
    snapshotAfterId?: string;
  }): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const db = this.memory.getDatabase();

    db.prepare(`
      INSERT INTO mincut_healing_actions (
        id, action_type, action_params_json, success,
        mincut_before, mincut_after, improvement,
        error_message, duration_ms, triggered_by,
        snapshot_before_id, snapshot_after_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      result.action.type,
      JSON.stringify(result.action),
      result.success ? 1 : 0,
      result.minCutBefore,
      result.minCutAfter,
      result.improvement,
      result.error ?? null,
      result.durationMs,
      result.triggeredBy ?? null,
      result.snapshotBeforeId ?? null,
      result.snapshotAfterId ?? null
    );

    return id;
  }

  /**
   * Get healing action history
   */
  async getHealingHistory(options: {
    limit?: number;
    successOnly?: boolean;
  } = {}): Promise<Array<{
    id: string;
    actionType: string;
    success: boolean;
    improvement: number;
    durationMs: number;
    createdAt: Date;
  }>> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    let sql = 'SELECT * FROM mincut_healing_actions WHERE 1=1';
    const params: unknown[] = [];

    if (options.successOnly) {
      sql += ' AND success = 1';
    }

    sql += ' ORDER BY created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = db.prepare(sql).all(...params) as HealingActionRow[];

    return rows.map(row => ({
      id: row.id,
      actionType: row.action_type,
      success: row.success === 1,
      improvement: row.improvement,
      durationMs: row.duration_ms,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Get healing success rate
   */
  async getHealingSuccessRate(windowMs: number = 86400000): Promise<{
    total: number;
    successful: number;
    rate: number;
    averageImprovement: number;
  }> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const since = new Date(Date.now() - windowMs);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
        AVG(CASE WHEN success = 1 THEN improvement ELSE 0 END) as avg_improvement
      FROM mincut_healing_actions
      WHERE created_at >= ?
    `).get(since.toISOString()) as {
      total: number;
      successful: number;
      avg_improvement: number | null;
    };

    return {
      total: stats.total,
      successful: stats.successful,
      rate: stats.total > 0 ? stats.successful / stats.total : 0,
      averageImprovement: stats.avg_improvement ?? 0,
    };
  }

  // ==========================================================================
  // Observation Operations (P1: Strange Loop)
  // ==========================================================================

  /**
   * Record a Strange Loop observation
   */
  async recordObservation(observation: {
    iteration: number;
    minCutValue: number;
    weakVertices: WeakVertex[];
    snapshotId?: string;
    prediction?: SelfModelPrediction;
  }): Promise<string> {
    this.ensureInitialized();

    const id = uuidv4();
    const db = this.memory.getDatabase();

    // Calculate actual vs predicted diff if prediction exists
    let actualVsPredictedDiff: number | null = null;
    if (observation.prediction) {
      actualVsPredictedDiff = observation.minCutValue - observation.prediction.predictedMinCut;
    }

    db.prepare(`
      INSERT INTO mincut_observations (
        id, iteration, mincut_value, weak_vertex_count,
        weak_vertices_json, snapshot_id, prediction_json,
        actual_vs_predicted_diff
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      observation.iteration,
      observation.minCutValue,
      observation.weakVertices.length,
      JSON.stringify(observation.weakVertices.map(v => v.vertexId)),
      observation.snapshotId ?? null,
      observation.prediction ? JSON.stringify(observation.prediction) : null,
      actualVsPredictedDiff
    );

    return id;
  }

  /**
   * Get recent observations
   */
  async getRecentObservations(limit: number = 20): Promise<Array<{
    id: string;
    iteration: number;
    minCutValue: number;
    weakVertexCount: number;
    timestamp: Date;
  }>> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const rows = db.prepare(`
      SELECT id, iteration, mincut_value, weak_vertex_count, timestamp
      FROM mincut_observations
      ORDER BY iteration DESC
      LIMIT ?
    `).all(limit) as ObservationRow[];

    return rows.map(row => ({
      id: row.id,
      iteration: row.iteration,
      minCutValue: row.mincut_value,
      weakVertexCount: row.weak_vertex_count,
      timestamp: new Date(row.timestamp),
    }));
  }

  /**
   * Get prediction accuracy
   */
  async getPredictionAccuracy(windowIterations: number = 100): Promise<{
    count: number;
    meanAbsoluteError: number;
    accuracy: number;
  }> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as count,
        AVG(ABS(actual_vs_predicted_diff)) as mae
      FROM mincut_observations
      WHERE prediction_json IS NOT NULL
        AND actual_vs_predicted_diff IS NOT NULL
      ORDER BY iteration DESC
      LIMIT ?
    `).get(windowIterations) as { count: number; mae: number | null };

    return {
      count: stats.count,
      meanAbsoluteError: stats.mae ?? 0,
      // Accuracy as 1 - normalized MAE (assuming reasonable range)
      accuracy: stats.mae !== null ? Math.max(0, 1 - stats.mae / 3) : 0,
    };
  }

  // ==========================================================================
  // Cleanup Operations
  // ==========================================================================

  /**
   * Cleanup old data
   */
  async cleanup(options: {
    historyMaxAge?: number; // ms
    snapshotMaxAge?: number; // ms
    alertMaxAge?: number; // ms
  } = {}): Promise<{
    historyDeleted: number;
    snapshotsDeleted: number;
    alertsDeleted: number;
  }> {
    this.ensureInitialized();

    const db = this.memory.getDatabase();
    const now = Date.now();

    // Default max ages
    const historyMaxAge = options.historyMaxAge ?? 7 * 24 * 60 * 60 * 1000; // 7 days
    const snapshotMaxAge = options.snapshotMaxAge ?? 24 * 60 * 60 * 1000; // 1 day
    const alertMaxAge = options.alertMaxAge ?? 30 * 24 * 60 * 60 * 1000; // 30 days

    const historyResult = db.prepare(`
      DELETE FROM mincut_history
      WHERE timestamp < ?
    `).run(new Date(now - historyMaxAge).toISOString());

    const snapshotResult = db.prepare(`
      DELETE FROM mincut_snapshots
      WHERE timestamp < ?
    `).run(new Date(now - snapshotMaxAge).toISOString());

    const alertResult = db.prepare(`
      DELETE FROM mincut_alerts
      WHERE timestamp < ? AND acknowledged = 1
    `).run(new Date(now - alertMaxAge).toISOString());

    return {
      historyDeleted: historyResult.changes,
      snapshotsDeleted: snapshotResult.changes,
      alertsDeleted: alertResult.changes,
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MinCutPersistence not initialized. Call initialize() first.');
    }
  }

  private rowToSnapshot(row: SnapshotRow): SwarmGraphSnapshot {
    return {
      timestamp: new Date(row.timestamp),
      vertices: JSON.parse(row.vertices_json),
      edges: JSON.parse(row.edges_json),
      stats: {
        vertexCount: row.vertex_count,
        edgeCount: row.edge_count,
        totalWeight: row.total_weight,
        averageDegree: row.edge_count > 0 && row.vertex_count > 0
          ? (row.edge_count * 2) / row.vertex_count
          : 0,
        density: row.vertex_count > 1
          ? row.edge_count / ((row.vertex_count * (row.vertex_count - 1)) / 2)
          : 0,
        isConnected: row.is_connected === 1,
        componentCount: row.component_count,
      },
    };
  }

  private rowToAlert(row: AlertRow): MinCutAlert {
    return {
      id: row.id,
      severity: row.severity as MinCutAlert['severity'],
      message: row.message,
      minCutValue: row.mincut_value,
      threshold: row.threshold,
      affectedVertices: row.affected_vertices_json
        ? JSON.parse(row.affected_vertices_json)
        : [],
      remediations: row.remediations_json
        ? JSON.parse(row.remediations_json)
        : [],
      acknowledged: row.acknowledged === 1,
      timestamp: new Date(row.timestamp),
    };
  }
}

/**
 * Create a MinCut persistence instance
 */
export function createMinCutPersistence(
  memory?: UnifiedMemoryManager
): MinCutPersistence {
  return new MinCutPersistence(memory);
}
