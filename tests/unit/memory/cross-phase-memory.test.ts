/**
 * Cross-Phase Memory Service Unit Tests
 *
 * Tests for persistent memory across QCSD cross-phase feedback loops.
 * Uses a mock UnifiedMemoryManager to isolate from SQLite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  CrossPhaseMemoryService,
  CROSS_PHASE_NAMESPACES,
  resetCrossPhaseMemory,
  getCrossPhaseMemory,
} from '../../../src/memory/cross-phase-memory.js';

// ---------------------------------------------------------------------------
// Mock UnifiedMemoryManager
// ---------------------------------------------------------------------------

function createMockMemoryManager() {
  const store = new Map<string, { value: unknown; namespace: string; ttl?: number }>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),

    kvSet: vi.fn(async (key: string, value: unknown, namespace: string, ttl?: number) => {
      store.set(`${namespace}::${key}`, { value, namespace, ttl });
    }),

    kvGet: vi.fn(async <T>(key: string, namespace: string): Promise<T | undefined> => {
      const entry = store.get(`${namespace}::${key}`);
      return entry ? (entry.value as T) : undefined;
    }),

    kvSearch: vi.fn(async (_pattern: string, namespace: string, _limit: number): Promise<string[]> => {
      const keys: string[] = [];
      for (const [compositeKey, entry] of store.entries()) {
        if (entry.namespace === namespace) {
          // Extract the original key (after namespace::)
          const originalKey = compositeKey.substring(namespace.length + 2);
          keys.push(originalKey);
        }
      }
      return keys;
    }),

    kvDelete: vi.fn(async (key: string, namespace: string): Promise<boolean> => {
      return store.delete(`${namespace}::${key}`);
    }),

    // expose store for test assertions
    _store: store,
  };
}

describe('CrossPhaseMemoryService', () => {
  let service: CrossPhaseMemoryService;
  let mockMemory: ReturnType<typeof createMockMemoryManager>;

  beforeEach(() => {
    mockMemory = createMockMemoryManager();
    service = new CrossPhaseMemoryService({
      memoryManager: mockMemory as any,
    });
    resetCrossPhaseMemory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize the underlying memory manager', async () => {
      // Act
      await service.initialize();

      // Assert
      expect(mockMemory.initialize).toHaveBeenCalledOnce();
    });

    it('should only initialize once (idempotent)', async () => {
      // Act
      await service.initialize();
      await service.initialize();

      // Assert
      expect(mockMemory.initialize).toHaveBeenCalledOnce();
    });

    it('should auto-initialize on first store operation', async () => {
      // Act
      await service.storeRiskSignal(
        [{ area: 'auth', weight: 0.8, trend: 'increasing' }],
        { prioritize: ['auth hardening'], deprioritize: [] }
      );

      // Assert
      expect(mockMemory.initialize).toHaveBeenCalled();
    });
  });

  describe('Loop 1: Production to Ideation (Strategic)', () => {
    it('should store and query risk signals', async () => {
      // Arrange
      const riskWeights = [{ area: 'auth', weight: 0.9, trend: 'increasing' as const }];
      const recommendations = { prioritize: ['MFA'], deprioritize: ['cosmetic'] };

      // Act
      const signal = await service.storeRiskSignal(riskWeights, recommendations);

      // Assert
      expect(signal.id).toBeDefined();
      expect(typeof signal.id).toBe('string');
      expect(signal.id.length).toBeGreaterThan(0);
      expect(signal.source).toBe('production');
      expect(signal.target).toBe('ideation');
      expect(signal.loopType).toBe('strategic');
      expect(signal.riskWeights).toEqual(riskWeights);
      expect(mockMemory.kvSet).toHaveBeenCalled();
    });

    it('should query non-expired risk signals', async () => {
      // Arrange
      await service.storeRiskSignal(
        [{ area: 'perf', weight: 0.5, trend: 'stable' }],
        { prioritize: [], deprioritize: [] }
      );

      // Act
      const signals = await service.queryRiskSignals();

      // Assert
      expect(signals.length).toBe(1);
      expect(signals[0].riskWeights[0].area).toBe('perf');
    });
  });

  describe('Loop 2: Production to Refinement (Tactical)', () => {
    it('should store SFDIPOT signals with feature context', async () => {
      // Arrange
      const factors = [{ factor: 'Security', weight: 0.9, rationale: 'critical' }];

      // Act
      const signal = await service.storeSFDIPOTSignal(
        factors,
        'user-authentication',
        { adjustFactors: [], addTests: [] }
      );

      // Assert
      expect(signal.loopType).toBe('tactical');
      expect(signal.featureContext).toBe('user-authentication');
    });

    it('should filter SFDIPOT signals by feature context', async () => {
      // Arrange
      await service.storeSFDIPOTSignal(
        [{ factor: 'S', weight: 0.5, rationale: 'r' }],
        'auth-module',
        { adjustFactors: [], addTests: [] }
      );
      await service.storeSFDIPOTSignal(
        [{ factor: 'D', weight: 0.3, rationale: 'r' }],
        'payment-module',
        { adjustFactors: [], addTests: [] }
      );

      // Act
      const authSignals = await service.querySFDIPOTSignals('auth');

      // Assert
      expect(authSignals.length).toBe(1);
      expect(authSignals[0].featureContext).toBe('auth-module');
    });
  });

  describe('Loop 3: CI/CD to Development (Operational)', () => {
    it('should store test health signals', async () => {
      // Arrange
      const flakyPatterns = [{
        testId: 'test-1',
        pattern: 'timing-dependent' as const,
        frequency: 0.3,
        lastOccurrence: new Date().toISOString(),
      }];
      const gateFailures = [{
        gate: 'coverage',
        threshold: 80,
        actual: 65,
        trend: 'declining' as const,
      }];

      // Act
      const signal = await service.storeTestHealthSignal(
        flakyPatterns,
        gateFailures,
        { fixFlaky: ['test-1'], addTests: [], removeTests: [] }
      );

      // Assert
      expect(signal.loopType).toBe('operational');
      expect(signal.flakyPatterns).toHaveLength(1);
      expect(signal.gateFailures).toHaveLength(1);
    });
  });

  describe('Loop 4: Development to Refinement (Quality Criteria)', () => {
    it('should store AC quality signals', async () => {
      // Arrange
      const untestable = [{
        pattern: 'tightly-coupled',
        location: 'src/auth.ts',
        suggestion: 'extract interface',
      }];
      const gaps = [{
        area: 'error-handling',
        currentCoverage: 30,
        targetCoverage: 80,
        priority: 'high' as const,
      }];

      // Act
      const signal = await service.storeACQualitySignal(
        untestable,
        gaps,
        { refineAC: ['add error scenarios'], addCoverage: ['error-handling'] }
      );

      // Assert
      expect(signal.loopType).toBe('quality-criteria');
      expect(signal.untestablePatterns).toHaveLength(1);
      expect(signal.coverageGaps).toHaveLength(1);
    });
  });

  describe('delete and cleanup', () => {
    it('should delete a signal by ID', async () => {
      // Arrange
      const signal = await service.storeRiskSignal(
        [{ area: 'x', weight: 0.5, trend: 'stable' }],
        { prioritize: [], deprioritize: [] }
      );

      // Act
      const deleted = await service.delete(CROSS_PHASE_NAMESPACES.STRATEGIC, signal.id);

      // Assert
      expect(deleted).toBe(true);
      expect(mockMemory.kvDelete).toHaveBeenCalledWith(signal.id, CROSS_PHASE_NAMESPACES.STRATEGIC);
    });

    it('should clean up expired signals', async () => {
      // Arrange - store a signal then verify cleanup returns result structure
      await service.storeRiskSignal(
        [{ area: 'test', weight: 0.1, trend: 'stable' }],
        { prioritize: [], deprioritize: [] }
      );

      // Act
      const result = await service.cleanupExpired();

      // Assert - signals are fresh so nothing should be deleted
      expect(result).toHaveProperty('deleted');
      expect(result).toHaveProperty('namespaces');
      expect(result.deleted).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return stats across all namespaces', async () => {
      // Arrange
      await service.storeRiskSignal(
        [{ area: 'a', weight: 0.5, trend: 'stable' }],
        { prioritize: [], deprioritize: [] }
      );

      // Act
      const stats = await service.getStats();

      // Assert
      expect(stats.totalSignals).toBeGreaterThanOrEqual(1);
      expect(stats.byLoop).toHaveProperty('strategic');
      expect(stats.byNamespace).toHaveProperty(CROSS_PHASE_NAMESPACES.STRATEGIC);
    });
  });

  describe('singleton management', () => {
    it('should return same instance from getCrossPhaseMemory', () => {
      // Act
      const a = getCrossPhaseMemory({ memoryManager: mockMemory as any });
      const b = getCrossPhaseMemory();

      // Assert
      expect(a).toBe(b);
    });

    it('should reset singleton on resetCrossPhaseMemory', () => {
      // Arrange
      const first = getCrossPhaseMemory({ memoryManager: mockMemory as any });

      // Act
      resetCrossPhaseMemory();
      const second = getCrossPhaseMemory({ memoryManager: mockMemory as any });

      // Assert
      expect(first).not.toBe(second);
    });
  });
});
