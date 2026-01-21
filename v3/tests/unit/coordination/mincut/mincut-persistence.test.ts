/**
 * Unit tests for MinCutPersistence
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests database operations for MinCut data persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MinCutPersistence,
  createMinCutPersistence,
} from '../../../../src/coordination/mincut/mincut-persistence';
import { SwarmGraphSnapshot, WeakVertex, MinCutAlert } from '../../../../src/coordination/mincut/interfaces';
import { UnifiedMemoryManager, getUnifiedMemory } from '../../../../src/kernel/unified-memory';

// Mock the unified memory module
vi.mock('../../../../src/kernel/unified-memory', () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
      get: vi.fn(),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn) => fn),
  };

  const mockMemory = {
    isInitialized: vi.fn(() => true),
    initialize: vi.fn(),
    getDatabase: vi.fn(() => mockDb),
  };

  return {
    UnifiedMemoryManager: vi.fn(() => mockMemory),
    getUnifiedMemory: vi.fn(() => mockMemory),
  };
});

describe('MinCutPersistence', () => {
  let persistence: MinCutPersistence;
  let mockMemory: any;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn(() => ({
        run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
        get: vi.fn(),
        all: vi.fn(() => []),
      })),
      transaction: vi.fn((fn) => fn),
    };

    mockMemory = {
      isInitialized: vi.fn(() => true),
      initialize: vi.fn(),
      getDatabase: vi.fn(() => mockDb),
    };

    vi.mocked(getUnifiedMemory).mockReturnValue(mockMemory);
    persistence = createMinCutPersistence();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Initialization
  // ==========================================================================

  describe('Initialization', () => {
    it('should create persistence instance', () => {
      expect(persistence).toBeDefined();
    });

    it('should initialize without error', async () => {
      await expect(persistence.initialize()).resolves.not.toThrow();
    });

    it('should call memory initialize if not initialized', async () => {
      mockMemory.isInitialized.mockReturnValue(false);
      await persistence.initialize();
      expect(mockMemory.initialize).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await persistence.initialize();
      await persistence.initialize();
      // Should still work without error
    });

    it('should throw if not initialized when accessing data', async () => {
      const uninitializedPersistence = createMinCutPersistence();
      // Don't call initialize

      await expect(async () => {
        await uninitializedPersistence.getHistory();
      }).rejects.toThrow('not initialized');
    });
  });

  // ==========================================================================
  // Snapshot Operations
  // ==========================================================================

  describe('Snapshot Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should save snapshot', async () => {
      const snapshot: SwarmGraphSnapshot = {
        timestamp: new Date(),
        vertices: [
          { id: 'a', type: 'agent', weight: 1, createdAt: new Date() },
          { id: 'b', type: 'agent', weight: 1, createdAt: new Date() },
        ],
        edges: [
          { source: 'a', target: 'b', weight: 1, type: 'coordination', bidirectional: true },
        ],
        stats: {
          vertexCount: 2,
          edgeCount: 1,
          totalWeight: 1,
          averageDegree: 1,
          density: 1,
          isConnected: true,
          componentCount: 1,
        },
      };

      const id = await persistence.saveSnapshot(snapshot);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should get snapshot by ID', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          id: 'snap-1',
          timestamp: '2025-01-15T00:00:00Z',
          vertex_count: 2,
          edge_count: 1,
          total_weight: 1,
          is_connected: 1,
          component_count: 1,
          vertices_json: JSON.stringify([{ id: 'a' }, { id: 'b' }]),
          edges_json: JSON.stringify([{ source: 'a', target: 'b' }]),
          created_at: '2025-01-15T00:00:00Z',
        })),
        all: vi.fn(),
      });

      const snapshot = await persistence.getSnapshot('snap-1');
      expect(snapshot).toBeDefined();
      expect(snapshot!.stats.vertexCount).toBe(2);
    });

    it('should return null for non-existent snapshot', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => undefined),
        all: vi.fn(),
      });

      const snapshot = await persistence.getSnapshot('nonexistent');
      expect(snapshot).toBeNull();
    });

    it('should get recent snapshots', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 'snap-1',
            timestamp: '2025-01-15T00:00:00Z',
            vertex_count: 2,
            edge_count: 1,
            total_weight: 1,
            is_connected: 1,
            component_count: 1,
            vertices_json: '[]',
            edges_json: '[]',
          },
        ]),
      });

      const snapshots = await persistence.getRecentSnapshots(10);
      expect(Array.isArray(snapshots)).toBe(true);
    });
  });

  // ==========================================================================
  // History Operations
  // ==========================================================================

  describe('History Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should record history entry', async () => {
      const id = await persistence.recordHistory({
        minCutValue: 2.5,
        vertexCount: 5,
        edgeCount: 7,
        algorithm: 'weighted-degree',
        durationMs: 10,
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
    });

    it('should record history with defaults', async () => {
      const id = await persistence.recordHistory({
        minCutValue: 2.5,
        vertexCount: 5,
        edgeCount: 7,
      });

      expect(id).toBeDefined();
    });

    it('should get history with default options', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 1,
            timestamp: '2025-01-15T00:00:00Z',
            mincut_value: 2.5,
            vertex_count: 5,
            edge_count: 7,
          },
        ]),
      });

      const history = await persistence.getHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get history with time filter', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      });

      const since = new Date(Date.now() - 3600000);
      const history = await persistence.getHistory({ since, limit: 10 });
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get history stats', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          min_value: 1.0,
          max_value: 3.0,
          avg_value: 2.0,
          count: 5,
        })),
        all: vi.fn(() => [
          { mincut_value: 1.5 },
          { mincut_value: 2.0 },
        ]),
      });

      const stats = await persistence.getHistoryStats(3600000);
      expect(stats.min).toBeDefined();
      expect(stats.max).toBeDefined();
      expect(stats.average).toBeDefined();
      expect(stats.count).toBeDefined();
      expect(stats.trend).toBeDefined();
    });

    it('should handle empty history stats', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          min_value: null,
          max_value: null,
          avg_value: null,
          count: 0,
        })),
        all: vi.fn(() => []),
      });

      const stats = await persistence.getHistoryStats();
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.average).toBe(0);
    });
  });

  // ==========================================================================
  // Weak Vertex Operations
  // ==========================================================================

  describe('Weak Vertex Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should save weak vertices', async () => {
      const weakVertices: WeakVertex[] = [
        {
          vertexId: 'a',
          vertex: { id: 'a', type: 'agent', weight: 1, createdAt: new Date() },
          degree: 1,
          weightedDegree: 0.5,
          riskScore: 0.8,
          reason: 'Low connectivity',
          suggestions: [{ type: 'add_edge', target: 'b', weight: 1.0 }],
        },
      ];

      mockDb.transaction.mockImplementation((fn) => fn);
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const ids = await persistence.saveWeakVertices(weakVertices, 'snap-1');
      expect(ids.length).toBe(1);
    });

    it('should get unresolved weak vertices', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 'wv-1',
            vertex_id: 'a',
            risk_score: 0.8,
            reason: 'Low connectivity',
            detected_at: '2025-01-15T00:00:00Z',
          },
        ]),
      });

      const unresolved = await persistence.getUnresolvedWeakVertices();
      expect(Array.isArray(unresolved)).toBe(true);
      expect(unresolved[0].vertexId).toBe('a');
    });

    it('should resolve weak vertex', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ changes: 1 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const result = await persistence.resolveWeakVertex('wv-1');
      expect(result).toBe(true);
    });

    it('should return false for non-existent weak vertex', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ changes: 0 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const result = await persistence.resolveWeakVertex('nonexistent');
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // Alert Operations
  // ==========================================================================

  describe('Alert Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should save alert', async () => {
      const alert: MinCutAlert = {
        id: 'alert-1',
        severity: 'high',
        message: 'MinCut value too low',
        minCutValue: 0.5,
        threshold: 1.0,
        affectedVertices: ['a', 'b'],
        remediations: [],
        acknowledged: false,
        timestamp: new Date(),
      };

      const id = await persistence.saveAlert(alert);
      expect(id).toBe('alert-1');
    });

    it('should get unacknowledged alerts', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 'alert-1',
            severity: 'high',
            message: 'Test alert',
            mincut_value: 0.5,
            threshold: 1.0,
            affected_vertices_json: '["a"]',
            remediations_json: '[]',
            acknowledged: 0,
            timestamp: '2025-01-15T00:00:00Z',
          },
        ]),
      });

      const alerts = await persistence.getUnacknowledgedAlerts();
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts[0].acknowledged).toBe(false);
    });

    it('should acknowledge alert', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ changes: 1 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const result = await persistence.acknowledgeAlert('alert-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should get alert history', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      });

      const history = await persistence.getAlertHistory(50);
      expect(Array.isArray(history)).toBe(true);
    });
  });

  // ==========================================================================
  // Healing Action Operations
  // ==========================================================================

  describe('Healing Action Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should record healing action', async () => {
      const result = {
        action: { type: 'add_edge' as const, source: 'a', target: 'b', weight: 1.0 },
        success: true,
        minCutBefore: 0.5,
        minCutAfter: 1.5,
        improvement: 1.0,
        durationMs: 50,
      };

      const id = await persistence.recordHealingAction(result);
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should get healing history', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 'heal-1',
            action_type: 'add_edge',
            success: 1,
            improvement: 1.0,
            duration_ms: 50,
            created_at: '2025-01-15T00:00:00Z',
          },
        ]),
      });

      const history = await persistence.getHealingHistory({ limit: 10 });
      expect(Array.isArray(history)).toBe(true);
      expect(history[0].success).toBe(true);
    });

    it('should get successful healing only', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => []),
      });

      const history = await persistence.getHealingHistory({ successOnly: true });
      expect(Array.isArray(history)).toBe(true);
    });

    it('should get healing success rate', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          total: 10,
          successful: 8,
          avg_improvement: 0.5,
        })),
        all: vi.fn(),
      });

      const rate = await persistence.getHealingSuccessRate(86400000);
      expect(rate.total).toBe(10);
      expect(rate.successful).toBe(8);
      expect(rate.rate).toBe(0.8);
    });

    it('should handle zero total in success rate', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          total: 0,
          successful: 0,
          avg_improvement: null,
        })),
        all: vi.fn(),
      });

      const rate = await persistence.getHealingSuccessRate();
      expect(rate.rate).toBe(0);
    });
  });

  // ==========================================================================
  // Observation Operations
  // ==========================================================================

  describe('Observation Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should record observation', async () => {
      const id = await persistence.recordObservation({
        iteration: 1,
        minCutValue: 2.0,
        weakVertices: [],
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });

    it('should record observation with prediction', async () => {
      const id = await persistence.recordObservation({
        iteration: 1,
        minCutValue: 2.0,
        weakVertices: [],
        prediction: {
          predictedMinCut: 1.8,
          confidence: 0.9,
          model: 'lstm',
          timestamp: new Date(),
        },
      });

      expect(id).toBeDefined();
    });

    it('should get recent observations', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(),
        all: vi.fn(() => [
          {
            id: 'obs-1',
            iteration: 1,
            mincut_value: 2.0,
            weak_vertex_count: 0,
            timestamp: '2025-01-15T00:00:00Z',
          },
        ]),
      });

      const observations = await persistence.getRecentObservations(20);
      expect(Array.isArray(observations)).toBe(true);
      expect(observations[0].iteration).toBe(1);
    });

    it('should get prediction accuracy', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          count: 10,
          mae: 0.2,
        })),
        all: vi.fn(),
      });

      const accuracy = await persistence.getPredictionAccuracy(100);
      expect(accuracy.count).toBe(10);
      expect(accuracy.meanAbsoluteError).toBe(0.2);
      expect(accuracy.accuracy).toBeGreaterThan(0);
    });

    it('should handle no predictions in accuracy', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(),
        get: vi.fn(() => ({
          count: 0,
          mae: null,
        })),
        all: vi.fn(),
      });

      const accuracy = await persistence.getPredictionAccuracy();
      expect(accuracy.count).toBe(0);
      expect(accuracy.accuracy).toBe(0);
    });
  });

  // ==========================================================================
  // Cleanup Operations
  // ==========================================================================

  describe('Cleanup Operations', () => {
    beforeEach(async () => {
      await persistence.initialize();
    });

    it('should cleanup old data', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ changes: 5 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const result = await persistence.cleanup({
        historyMaxAge: 7 * 24 * 60 * 60 * 1000,
        snapshotMaxAge: 24 * 60 * 60 * 1000,
        alertMaxAge: 30 * 24 * 60 * 60 * 1000,
      });

      expect(result.historyDeleted).toBe(5);
      expect(result.snapshotsDeleted).toBe(5);
      expect(result.alertsDeleted).toBe(5);
    });

    it('should use default max ages', async () => {
      mockDb.prepare.mockReturnValue({
        run: vi.fn(() => ({ changes: 0 })),
        get: vi.fn(),
        all: vi.fn(),
      });

      const result = await persistence.cleanup();
      expect(result.historyDeleted).toBeDefined();
    });
  });
});
