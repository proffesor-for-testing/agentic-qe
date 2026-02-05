/**
 * Agentic QE v3 - Learning Metrics Tracker
 * Phase 6: Learning Metrics & Dashboard (Learning Improvement Plan)
 *
 * Tracks learning improvement over time with metrics collection and analysis.
 *
 * Features:
 * - Pattern creation and reuse tracking
 * - Reward improvement analysis
 * - Domain coverage metrics
 * - Daily snapshots for trend analysis
 * - Dashboard data generation
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { QEDomain } from './qe-patterns.js';
import { QE_DOMAIN_LIST } from './qe-patterns.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Learning metrics snapshot
 */
export interface LearningMetricsSnapshot {
  /** Snapshot timestamp */
  timestamp: Date;

  /** Total patterns count */
  totalPatterns: number;

  /** Patterns created today */
  patternsCreatedToday: number;

  /** Total experiences count */
  totalExperiences: number;

  /** Experiences recorded today */
  experiencesToday: number;

  /** Total Q-values count */
  totalQValues: number;

  /** Average reward across recent experiences */
  avgReward: number;

  /** Average reward change from last week */
  avgRewardDelta: number;

  /** Domain coverage (patterns per domain) */
  domainCoverage: Record<QEDomain, number>;

  /** Pattern reuse count */
  patternReuseCount: number;

  /** Short-term patterns */
  shortTermPatterns: number;

  /** Long-term patterns */
  longTermPatterns: number;

  /** Average pattern confidence */
  avgConfidence: number;

  /** Average pattern quality score */
  avgQualityScore: number;

  /** Success rate across experiences */
  successRate: number;
}

/**
 * Dashboard data for CLI display
 */
export interface DashboardData {
  /** Current metrics */
  current: LearningMetricsSnapshot;

  /** Historical metrics (last 7 days) */
  history: LearningMetricsSnapshot[];

  /** Trends */
  trends: {
    patternsPerDay: number[];
    experiencesPerDay: number[];
    avgRewardPerDay: number[];
  };

  /** Top domains by pattern count */
  topDomains: Array<{ domain: QEDomain; count: number }>;
}

// ============================================================================
// Learning Metrics Tracker
// ============================================================================

/**
 * Learning Metrics Tracker
 *
 * Collects and analyzes learning system metrics for dashboard display.
 */
export class LearningMetricsTracker {
  private db: DatabaseType | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(projectRoot: string = process.cwd()) {
    this.dbPath = path.join(projectRoot, '.agentic-qe', 'memory.db');
  }

  /**
   * Initialize the tracker (open database, ensure tables exist)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!existsSync(this.dbPath)) {
      throw new Error(`Database not found: ${this.dbPath}. Run "aqe init --auto" first.`);
    }

    this.db = new Database(this.dbPath, { readonly: false });

    // Ensure learning_metrics table exists for snapshots
    this.ensureMetricsTable();

    this.initialized = true;
  }

  /**
   * Ensure the learning_daily_snapshots table exists
   */
  private ensureMetricsTable(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_daily_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL UNIQUE,
        total_patterns INTEGER DEFAULT 0,
        patterns_created_today INTEGER DEFAULT 0,
        total_experiences INTEGER DEFAULT 0,
        experiences_today INTEGER DEFAULT 0,
        total_q_values INTEGER DEFAULT 0,
        avg_reward REAL DEFAULT 0.0,
        avg_confidence REAL DEFAULT 0.0,
        avg_quality_score REAL DEFAULT 0.0,
        success_rate REAL DEFAULT 0.0,
        pattern_reuse_count INTEGER DEFAULT 0,
        short_term_patterns INTEGER DEFAULT 0,
        long_term_patterns INTEGER DEFAULT 0,
        domain_coverage_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_learning_daily_snapshots_date ON learning_daily_snapshots(snapshot_date DESC);
    `);
  }

  /**
   * Get current learning metrics
   */
  async getCurrentMetrics(): Promise<LearningMetricsSnapshot> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const today = new Date().toISOString().split('T')[0];
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Pattern metrics
    const patternStats = this.getPatternStats(today);

    // Experience metrics (from learning_experiences if exists, or qe_pattern_usage)
    const experienceStats = this.getExperienceStats(today);

    // Q-value metrics
    const qValueStats = this.getQValueStats();

    // Domain coverage
    const domainCoverage = this.getDomainCoverage();

    // Get last week's avg reward for delta calculation
    const lastWeekReward = this.getHistoricalAvgReward(oneWeekAgo);

    return {
      timestamp: new Date(),
      totalPatterns: patternStats.total,
      patternsCreatedToday: patternStats.createdToday,
      totalExperiences: experienceStats.total,
      experiencesToday: experienceStats.recordedToday,
      totalQValues: qValueStats.total,
      avgReward: experienceStats.avgReward,
      avgRewardDelta: experienceStats.avgReward - lastWeekReward,
      domainCoverage,
      patternReuseCount: patternStats.reuseCount,
      shortTermPatterns: patternStats.shortTerm,
      longTermPatterns: patternStats.longTerm,
      avgConfidence: patternStats.avgConfidence,
      avgQualityScore: patternStats.avgQualityScore,
      successRate: experienceStats.successRate,
    };
  }

  /**
   * Get pattern statistics
   */
  private getPatternStats(today: string): {
    total: number;
    createdToday: number;
    shortTerm: number;
    longTerm: number;
    avgConfidence: number;
    avgQualityScore: number;
    reuseCount: number;
  } {
    if (!this.db) {
      return {
        total: 0,
        createdToday: 0,
        shortTerm: 0,
        longTerm: 0,
        avgConfidence: 0,
        avgQualityScore: 0,
        reuseCount: 0,
      };
    }

    // Check if qe_patterns table exists
    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='qe_patterns'`
    ).get();

    if (!tableExists) {
      return {
        total: 0,
        createdToday: 0,
        shortTerm: 0,
        longTerm: 0,
        avgConfidence: 0,
        avgQualityScore: 0,
        reuseCount: 0,
      };
    }

    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END) as created_today,
        SUM(CASE WHEN tier = 'short-term' THEN 1 ELSE 0 END) as short_term,
        SUM(CASE WHEN tier = 'long-term' THEN 1 ELSE 0 END) as long_term,
        AVG(confidence) as avg_confidence,
        AVG(quality_score) as avg_quality_score,
        SUM(usage_count) as total_usage
      FROM qe_patterns
    `).get(today) as {
      total: number;
      created_today: number;
      short_term: number;
      long_term: number;
      avg_confidence: number;
      avg_quality_score: number;
      total_usage: number;
    };

    return {
      total: stats.total || 0,
      createdToday: stats.created_today || 0,
      shortTerm: stats.short_term || 0,
      longTerm: stats.long_term || 0,
      avgConfidence: stats.avg_confidence || 0,
      avgQualityScore: stats.avg_quality_score || 0,
      reuseCount: stats.total_usage || 0,
    };
  }

  /**
   * Get experience statistics
   */
  private getExperienceStats(today: string): {
    total: number;
    recordedToday: number;
    avgReward: number;
    successRate: number;
  } {
    if (!this.db) {
      return { total: 0, recordedToday: 0, avgReward: 0, successRate: 0 };
    }

    // Try learning_experiences table first (v2 compatible)
    const learningTableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='learning_experiences'`
    ).get();

    if (learningTableExists) {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN date(datetime(created_at, 'unixepoch')) = ? THEN 1 ELSE 0 END) as recorded_today,
          AVG(reward) as avg_reward,
          AVG(CASE WHEN reward >= 0.5 THEN 1.0 ELSE 0.0 END) as success_rate
        FROM learning_experiences
      `).get(today) as {
        total: number;
        recorded_today: number;
        avg_reward: number;
        success_rate: number;
      };

      return {
        total: stats.total || 0,
        recordedToday: stats.recorded_today || 0,
        avgReward: stats.avg_reward || 0,
        successRate: stats.success_rate || 0,
      };
    }

    // Fall back to qe_pattern_usage table
    const usageTableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='qe_pattern_usage'`
    ).get();

    if (usageTableExists) {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END) as recorded_today,
          AVG(success) as success_rate
        FROM qe_pattern_usage
      `).get(today) as {
        total: number;
        recorded_today: number;
        success_rate: number;
      };

      return {
        total: stats.total || 0,
        recordedToday: stats.recorded_today || 0,
        avgReward: stats.success_rate || 0, // Use success as reward proxy
        successRate: stats.success_rate || 0,
      };
    }

    return { total: 0, recordedToday: 0, avgReward: 0, successRate: 0 };
  }

  /**
   * Get Q-value statistics
   */
  private getQValueStats(): { total: number } {
    if (!this.db) return { total: 0 };

    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='rl_q_values'`
    ).get();

    if (!tableExists) return { total: 0 };

    const stats = this.db.prepare(`
      SELECT COUNT(*) as total FROM rl_q_values
    `).get() as { total: number };

    return { total: stats.total || 0 };
  }

  /**
   * Get domain coverage (patterns per domain)
   */
  private getDomainCoverage(): Record<QEDomain, number> {
    const coverage: Record<QEDomain, number> = {} as Record<QEDomain, number>;

    // Initialize all domains to 0
    for (const domain of QE_DOMAIN_LIST) {
      coverage[domain] = 0;
    }

    if (!this.db) return coverage;

    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='qe_patterns'`
    ).get();

    if (!tableExists) return coverage;

    const rows = this.db.prepare(`
      SELECT qe_domain, COUNT(*) as count
      FROM qe_patterns
      GROUP BY qe_domain
    `).all() as Array<{ qe_domain: string; count: number }>;

    for (const row of rows) {
      if (QE_DOMAIN_LIST.includes(row.qe_domain as QEDomain)) {
        coverage[row.qe_domain as QEDomain] = row.count;
      }
    }

    return coverage;
  }

  /**
   * Get historical average reward
   */
  private getHistoricalAvgReward(date: string): number {
    if (!this.db) return 0;

    // Try learning_experiences first
    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='learning_experiences'`
    ).get();

    if (tableExists) {
      const result = this.db.prepare(`
        SELECT AVG(reward) as avg_reward
        FROM learning_experiences
        WHERE datetime(created_at, 'unixepoch') <= datetime(?)
      `).get(date + ' 23:59:59') as { avg_reward: number | null };

      return result?.avg_reward || 0;
    }

    return 0;
  }

  /**
   * Get dashboard data for CLI display
   */
  async getDashboardData(): Promise<DashboardData> {
    if (!this.initialized) await this.initialize();

    const current = await this.getCurrentMetrics();
    const history = await this.getMetricsHistory(7);

    // Calculate trends
    const patternsPerDay = history.map(h => h.patternsCreatedToday);
    const experiencesPerDay = history.map(h => h.experiencesToday);
    const avgRewardPerDay = history.map(h => h.avgReward);

    // Top domains by pattern count
    const topDomains = Object.entries(current.domainCoverage)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => ({
        domain: domain as QEDomain,
        count,
      }));

    return {
      current,
      history,
      trends: {
        patternsPerDay,
        experiencesPerDay,
        avgRewardPerDay,
      },
      topDomains,
    };
  }

  /**
   * Get metrics history for the last N days
   */
  async getMetricsHistory(days: number): Promise<LearningMetricsSnapshot[]> {
    if (!this.initialized) await this.initialize();
    if (!this.db) return [];

    const history: LearningMetricsSnapshot[] = [];

    // Check if learning_daily_snapshots table exists
    const tableExists = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='learning_daily_snapshots'`
    ).get();

    if (!tableExists) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT *
      FROM learning_daily_snapshots
      ORDER BY snapshot_date DESC
      LIMIT ?
    `).all(days) as Array<{
      snapshot_date: string;
      total_patterns: number;
      patterns_created_today: number;
      total_experiences: number;
      experiences_today: number;
      total_q_values: number;
      avg_reward: number;
      avg_confidence: number;
      avg_quality_score: number;
      success_rate: number;
      pattern_reuse_count: number;
      short_term_patterns: number;
      long_term_patterns: number;
      domain_coverage_json: string;
    }>;

    for (const row of rows) {
      let domainCoverage: Record<QEDomain, number> = {} as Record<QEDomain, number>;
      try {
        domainCoverage = JSON.parse(row.domain_coverage_json || '{}');
      } catch {
        // Use empty coverage if parse fails
        for (const domain of QE_DOMAIN_LIST) {
          domainCoverage[domain] = 0;
        }
      }

      history.push({
        timestamp: new Date(row.snapshot_date),
        totalPatterns: row.total_patterns,
        patternsCreatedToday: row.patterns_created_today,
        totalExperiences: row.total_experiences,
        experiencesToday: row.experiences_today,
        totalQValues: row.total_q_values,
        avgReward: row.avg_reward,
        avgRewardDelta: 0, // Not stored in history
        domainCoverage,
        patternReuseCount: row.pattern_reuse_count,
        shortTermPatterns: row.short_term_patterns,
        longTermPatterns: row.long_term_patterns,
        avgConfidence: row.avg_confidence,
        avgQualityScore: row.avg_quality_score,
        successRate: row.success_rate,
      });
    }

    return history;
  }

  /**
   * Save a daily metrics snapshot
   */
  async saveSnapshot(): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const metrics = await this.getCurrentMetrics();
    const today = new Date().toISOString().split('T')[0];

    this.db.prepare(`
      INSERT OR REPLACE INTO learning_daily_snapshots (
        snapshot_date,
        total_patterns,
        patterns_created_today,
        total_experiences,
        experiences_today,
        total_q_values,
        avg_reward,
        avg_confidence,
        avg_quality_score,
        success_rate,
        pattern_reuse_count,
        short_term_patterns,
        long_term_patterns,
        domain_coverage_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      today,
      metrics.totalPatterns,
      metrics.patternsCreatedToday,
      metrics.totalExperiences,
      metrics.experiencesToday,
      metrics.totalQValues,
      metrics.avgReward,
      metrics.avgConfidence,
      metrics.avgQualityScore,
      metrics.successRate,
      metrics.patternReuseCount,
      metrics.shortTermPatterns,
      metrics.longTermPatterns,
      JSON.stringify(metrics.domainCoverage)
    );
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
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new LearningMetricsTracker instance
 */
export function createLearningMetricsTracker(
  projectRoot?: string
): LearningMetricsTracker {
  return new LearningMetricsTracker(projectRoot);
}
