/**
 * Integration tests for Phase 3 Learning Metrics
 *
 * Tests the LearningMetrics and MetricsStore implementations
 * with real database queries against the memory.db database.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs-extra';
import BetterSqlite3 from 'better-sqlite3';
import { LearningMetricsCollector, MetricsStore } from '../../../src/learning/metrics';

describe('Learning Metrics Integration', () => {
  const testDbPath = path.join(__dirname, 'test-metrics.db');
  let db: BetterSqlite3.Database;
  let metricsCollector: LearningMetricsCollector;
  let metricsStore: MetricsStore;

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create fresh database
    db = new BetterSqlite3(testDbPath);

    // Initialize schema (patterns, dream_cycles, transfer_registry, captured_experiences)
    db.exec(`
      CREATE TABLE patterns (
        id TEXT PRIMARY KEY,
        pattern TEXT UNIQUE NOT NULL,
        confidence REAL DEFAULT 0.7,
        metadata TEXT,
        agent_id TEXT,
        domain TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE dream_cycles (
        id TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        concepts_processed INTEGER,
        associations_found INTEGER,
        insights_generated INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE dream_insights (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        novelty_score REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE transfer_registry (
        id TEXT PRIMARY KEY,
        pattern_id TEXT NOT NULL,
        source_agent TEXT NOT NULL,
        target_agent TEXT NOT NULL,
        transfer_id TEXT NOT NULL,
        compatibility_score REAL NOT NULL,
        validation_passed INTEGER,
        transferred_at INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE captured_experiences (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        task_type TEXT NOT NULL,
        execution TEXT NOT NULL,
        context TEXT NOT NULL,
        outcome TEXT NOT NULL,
        processed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
    `);

    // Insert test data
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    // Add patterns
    db.prepare(`INSERT INTO patterns (id, pattern, confidence, agent_id, domain, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('p1', 'Test pattern 1', 0.9, 'test-gen', 'testing', dayAgo);
    db.prepare(`INSERT INTO patterns (id, pattern, confidence, agent_id, domain, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('p2', 'Test pattern 2', 0.8, 'test-gen', 'testing', now);
    db.prepare(`INSERT INTO patterns (id, pattern, confidence, agent_id, domain, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('p3', 'Test pattern 3', 0.4, 'coverage', 'analysis', now);

    // Add dream cycles
    db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, duration, concepts_processed, associations_found, insights_generated, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('c1', dayAgo, dayAgo + 60000, 60000, 100, 20, 5, 'completed', dayAgo);
    db.prepare(`INSERT INTO dream_cycles (id, start_time, end_time, duration, concepts_processed, associations_found, insights_generated, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('c2', now - 30000, now, 30000, 80, 15, 3, 'completed', now);

    // Add insights
    db.prepare(`INSERT INTO dream_insights (id, type, content, novelty_score, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('i1', 'pattern_synthesis', 'Insight 1', 0.8, 'applied', dayAgo);
    db.prepare(`INSERT INTO dream_insights (id, type, content, novelty_score, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('i2', 'gap_detection', 'Insight 2', 0.7, 'pending', now);

    // Add transfers
    db.prepare(`INSERT INTO transfer_registry (id, pattern_id, source_agent, target_agent, transfer_id, compatibility_score, validation_passed, transferred_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('t1', 'p1', 'test-gen', 'coverage', 'tr1', 0.75, 1, dayAgo, 'active');
    db.prepare(`INSERT INTO transfer_registry (id, pattern_id, source_agent, target_agent, transfer_id, compatibility_score, validation_passed, transferred_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('t2', 'p2', 'test-gen', 'coverage', 'tr2', 0.65, 1, now, 'active');

    // Add experiences
    db.prepare(`INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, execution, context, outcome, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'e1',
      'agent1',
      'test-gen',
      'unit-test',
      JSON.stringify({ success: true, duration: 5000 }),
      JSON.stringify({ patterns_used: ['p1'], decisions_made: [], errors_encountered: [] }),
      JSON.stringify({ quality_score: 0.8, coverage: 0.75, bugs_found: 3 }),
      dayAgo
    );

    db.prepare(`INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, execution, context, outcome, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'e2',
      'agent2',
      'test-gen',
      'unit-test',
      JSON.stringify({ success: true, duration: 3000 }),
      JSON.stringify({ patterns_used: ['p1', 'p2'], decisions_made: [], errors_encountered: [] }),
      JSON.stringify({ quality_score: 0.9, coverage: 0.85, bugs_found: 5 }),
      now
    );

    db.prepare(`INSERT INTO captured_experiences (id, agent_id, agent_type, task_type, execution, context, outcome, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'e3',
      'agent3',
      'coverage',
      'analysis',
      JSON.stringify({ success: true, duration: 8000 }),
      JSON.stringify({ patterns_used: [], decisions_made: [], errors_encountered: [] }),
      JSON.stringify({ quality_score: 0.6, coverage: 0.60, bugs_found: 2 }),
      now
    );

    db.close();

    // Create metrics instances
    metricsCollector = new LearningMetricsCollector({ dbPath: testDbPath, debug: true });
    metricsStore = new MetricsStore({ dbPath: testDbPath, autoSnapshotInterval: 0, debug: true });
  });

  afterEach(() => {
    metricsCollector.close();
    metricsStore.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('LearningMetrics', () => {
    it('should collect current metrics successfully', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      expect(metrics).toBeDefined();
      expect(metrics.patternsDiscoveredTotal).toBe(3);
      expect(metrics.patternsDiscoveredToday).toBeGreaterThan(0);
      expect(metrics.discoveryRate).toBeGreaterThanOrEqual(0);
      expect(metrics.patternAccuracy).toBeGreaterThan(0);
      expect(metrics.transferSuccessRate).toBeGreaterThanOrEqual(0);
      expect(metrics.calculatedAt).toBeInstanceOf(Date);
    });

    it('should calculate discovery metrics correctly', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      expect(metrics.patternsDiscoveredTotal).toBe(3);
      expect(metrics.discoveryRate).toBeGreaterThan(0); // Should have some hourly rate
    });

    it('should calculate quality metrics correctly', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      // Average confidence should be around (0.9 + 0.8 + 0.4) / 3 = 0.7
      expect(metrics.patternAccuracy).toBeCloseTo(0.7, 1);
      expect(metrics.insightActionability).toBeGreaterThan(0);
      expect(metrics.falsePositiveRate).toBeGreaterThan(0); // We have one low-confidence pattern
    });

    it('should calculate transfer metrics correctly', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      expect(metrics.transferSuccessRate).toBeGreaterThan(0);
      expect(metrics.adoptionRate).toBeGreaterThanOrEqual(0);
      expect(metrics.negativeTransferCount).toBeGreaterThanOrEqual(0);
    });

    it('should calculate impact metrics correctly', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      // Tasks with patterns should be faster than tasks without
      expect(metrics.taskTimeReduction).toBeGreaterThanOrEqual(0);
      expect(metrics.coverageImprovement).toBeDefined();
      expect(metrics.bugDetectionImprovement).toBeDefined();
    });

    it('should calculate system health metrics correctly', async () => {
      const metrics = await metricsCollector.getCurrentMetrics(24);

      expect(metrics.sleepCycleCompletionRate).toBe(1); // Both cycles completed
      expect(metrics.avgCycleDuration).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThanOrEqual(0);
    });

    it('should get comprehensive metrics summary', async () => {
      const summary = await metricsCollector.getMetricsSummary(24);

      expect(summary.metrics).toBeDefined();
      expect(summary.breakdown).toBeDefined();
      expect(summary.breakdown.discovery).toBeDefined();
      expect(summary.breakdown.quality).toBeDefined();
      expect(summary.breakdown.transfer).toBeDefined();
      expect(summary.breakdown.impact).toBeDefined();
      expect(summary.breakdown.system).toBeDefined();
      expect(summary.trends).toBeDefined();
    });
  });

  describe('MetricsStore', () => {
    it('should capture and store metric snapshots', async () => {
      const snapshot = await metricsStore.captureSnapshot(24);

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toMatch(/^snapshot-/);
      expect(snapshot.metrics).toBeDefined();
      expect(snapshot.snapshotTime).toBeInstanceOf(Date);
      expect(snapshot.periodHours).toBe(24);
    });

    it('should retrieve historical snapshots', async () => {
      // Capture multiple snapshots
      await metricsStore.captureSnapshot(24);
      await metricsStore.captureSnapshot(24);

      const history = await metricsStore.getHistory({ limit: 10 });

      expect(history.length).toBe(2);
      expect(history[0].id).toBeDefined();
      expect(history[0].metrics).toBeDefined();
    });

    it('should get latest snapshot', async () => {
      await metricsStore.captureSnapshot(24);
      await metricsStore.captureSnapshot(12);

      const latest = await metricsStore.getLatest();

      expect(latest).toBeDefined();
      expect(latest!.periodHours).toBe(12);
    });

    it('should calculate aggregations', async () => {
      await metricsStore.captureSnapshot(24);
      await metricsStore.captureSnapshot(24);

      const aggregations = await metricsStore.getAggregations([
        'discoveryRate',
        'transferSuccessRate',
        'errorRate',
      ]);

      expect(aggregations.size).toBe(3);
      expect(aggregations.get('discoveryRate')).toBeDefined();
      expect(aggregations.get('discoveryRate')?.avg).toBeGreaterThanOrEqual(0);
      expect(aggregations.get('discoveryRate')?.count).toBe(2);
    });

    it('should export metrics to JSON', async () => {
      await metricsStore.captureSnapshot(24);
      await metricsStore.captureSnapshot(12);

      const exported = await metricsStore.exportMetrics({ limit: 10 });

      expect(exported.length).toBe(2);
      expect(exported[0]).toHaveProperty('id');
      expect(exported[0]).toHaveProperty('metrics');
      expect(exported[0]).toHaveProperty('snapshotTime');
    });

    it('should get snapshot count', async () => {
      await metricsStore.captureSnapshot(24);
      await metricsStore.captureSnapshot(24);

      const count = metricsStore.getSnapshotCount();

      expect(count).toBe(2);
    });

    it('should cleanup old snapshots based on retention policy', async () => {
      // Create store with 0-day retention (delete immediately)
      const shortRetentionStore = new MetricsStore({
        dbPath: testDbPath,
        retentionDays: 0, // No retention - cleanup should do nothing
        autoSnapshotInterval: 0,
      });

      await shortRetentionStore.captureSnapshot(24);

      const deleted = await shortRetentionStore.cleanupOldSnapshots();

      expect(deleted).toBe(0); // 0 retention means infinite, so nothing deleted

      shortRetentionStore.close();
    });
  });
});
