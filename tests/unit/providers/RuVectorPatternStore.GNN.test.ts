/**
 * RuVectorPatternStore GNN Integration Tests
 *
 * Tests the GNN learning integration in RuVectorPatternStore (Phase 0.5).
 * Validates remote learning sync, EWC protection, and query integration.
 *
 * @module tests/unit/providers/RuVectorPatternStore.GNN.test
 */

import {
  RuVectorPatternStore,
  GNNLearningConfig,
  createQEPatternStore
} from '../../../src/core/memory/RuVectorPatternStore';
import type { TestPattern } from '../../../src/core/memory/IPatternStore';

// Mock the RuVectorClient module
jest.mock('../../../src/providers/RuVectorClient', () => {
  return {
    RuVectorClient: jest.fn().mockImplementation((config) => {
      return {
        config,
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        search: jest.fn().mockResolvedValue([]),
        store: jest.fn().mockResolvedValue({ success: true }),
        forceLearn: jest.fn().mockResolvedValue({
          patternsConsolidated: 10,
          ewcLoss: 0.001
        }),
        getMetrics: jest.fn().mockResolvedValue({
          cacheHitRate: 0.75,
          patternsLearned: 100,
          lastLearnTime: Date.now(),
          totalInferences: 500
        })
      };
    })
  };
});

// Mock @ruvector/core to avoid native module loading
jest.mock('@ruvector/core', () => {
  throw new Error('Native module not available in test environment');
});

describe('RuVectorPatternStore GNN Integration', () => {
  let store: RuVectorPatternStore;

  // Create test pattern helper
  function createTestPattern(overrides: Partial<TestPattern> = {}): TestPattern {
    return {
      id: `test-pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      embedding: new Array(384).fill(0).map(() => Math.random()),
      type: 'unit',
      domain: 'test',
      content: 'Test pattern content',
      framework: 'jest',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      usageCount: 0,
      ...overrides
    };
  }

  describe('GNN Disabled (Default)', () => {
    beforeEach(async () => {
      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine'
        // GNN learning NOT enabled
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
    });

    it('should report GNN as disabled', () => {
      expect(store.isGNNEnabled()).toBe(false);
    });

    it('should return undefined for GNN config when not set', () => {
      expect(store.getGNNConfig()).toBeUndefined();
    });

    it('should return empty result for syncToRemote when GNN disabled', async () => {
      const result = await store.syncToRemote();
      expect(result).toEqual({ synced: 0, failed: 0, duration: 0 });
    });

    it('should return failure for forceGNNLearn when GNN disabled', async () => {
      const result = await store.forceGNNLearn();
      expect(result).toEqual({ success: false, patternsConsolidated: 0, duration: 0 });
    });

    it('should return null for getGNNMetrics when GNN disabled', async () => {
      const result = await store.getGNNMetrics();
      expect(result).toBeNull();
    });

    it('should use local search for queryWithGNN when GNN disabled', async () => {
      // Store a pattern first
      const pattern = createTestPattern();
      await store.storePattern(pattern);

      const result = await store.queryWithGNN('test query', pattern.embedding);

      expect(result.source).toBe('local');
    });

    it('should return zero pending sync count when GNN disabled', () => {
      expect(store.getPendingSyncCount()).toBe(0);
    });
  });

  describe('GNN Enabled', () => {
    let mockRuVectorClient: any;

    beforeEach(async () => {
      // Get the mock constructor
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');
      mockRuVectorClient = RuVectorClient;

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          baseUrl: 'http://localhost:8080',
          cacheThreshold: 0.85,
          loraRank: 8,
          ewcEnabled: true,
          autoSync: false,
          syncBatchSize: 10
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should report GNN as enabled', () => {
      expect(store.isGNNEnabled()).toBe(true);
    });

    it('should return GNN config when set', () => {
      const config = store.getGNNConfig();
      expect(config).toBeDefined();
      expect(config?.enabled).toBe(true);
      expect(config?.loraRank).toBe(8);
      expect(config?.ewcEnabled).toBe(true);
    });

    it('should initialize RuVectorClient with correct config', () => {
      expect(mockRuVectorClient).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://localhost:8080',
          learningEnabled: true,
          cacheThreshold: 0.85,
          loraRank: 8,
          ewcEnabled: true
        })
      );
    });
  });

  describe('syncToRemote', () => {
    let mockClient: any;

    beforeEach(async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      mockClient = {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue([]),
        forceLearn: jest.fn().mockResolvedValue({}),
        getMetrics: jest.fn().mockResolvedValue({})
      };

      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          syncBatchSize: 2
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should sync pending patterns to remote', async () => {
      // Add patterns via storeWithSync
      const pattern1 = createTestPattern({ id: 'sync-1' });
      const pattern2 = createTestPattern({ id: 'sync-2' });

      await store.storeWithSync(pattern1);
      await store.storeWithSync(pattern2);

      expect(store.getPendingSyncCount()).toBe(2);

      // Sync to remote
      const result = await store.syncToRemote();

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      // Pending count should be cleared
      expect(store.getPendingSyncCount()).toBe(0);
    });

    it('should sync all patterns with force option', async () => {
      // Store patterns normally (not via storeWithSync)
      const pattern1 = createTestPattern({ id: 'force-1' });
      const pattern2 = createTestPattern({ id: 'force-2' });

      await store.storePattern(pattern1);
      await store.storePattern(pattern2);

      // Pending should be 0 since we didn't use storeWithSync
      expect(store.getPendingSyncCount()).toBe(0);

      // Force sync all patterns
      const result = await store.syncToRemote({ force: true });

      expect(result.synced).toBe(2);
      expect(mockClient.store).toHaveBeenCalledTimes(2);
    });

    it('should handle sync failures gracefully', async () => {
      // Make store fail for some patterns
      let callCount = 0;
      mockClient.store.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Sync failed'));
        }
        return Promise.resolve({ success: true });
      });

      const pattern1 = createTestPattern({ id: 'fail-1' });
      const pattern2 = createTestPattern({ id: 'fail-2' });
      const pattern3 = createTestPattern({ id: 'fail-3' });

      await store.storeWithSync(pattern1);
      await store.storeWithSync(pattern2);
      await store.storeWithSync(pattern3);

      const result = await store.syncToRemote();

      expect(result.synced).toBe(2);
      expect(result.failed).toBe(1);
    });
  });

  describe('forceGNNLearn', () => {
    let mockClient: any;

    beforeEach(async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      mockClient = {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue([]),
        forceLearn: jest.fn().mockResolvedValue({
          patternsConsolidated: 25,
          ewcLoss: 0.0015
        }),
        getMetrics: jest.fn().mockResolvedValue({})
      };

      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should trigger learning consolidation', async () => {
      const result = await store.forceGNNLearn();

      expect(result.success).toBe(true);
      expect(result.patternsConsolidated).toBe(25);
      expect(result.ewcLoss).toBe(0.0015);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should pass domain option to forceLearn', async () => {
      await store.forceGNNLearn({ domain: 'test-domain' });

      expect(mockClient.forceLearn).toHaveBeenCalledWith('test-domain');
    });

    it('should handle learning errors gracefully', async () => {
      mockClient.forceLearn.mockRejectedValue(new Error('Learning failed'));

      const result = await store.forceGNNLearn();

      expect(result.success).toBe(false);
      expect(result.patternsConsolidated).toBe(0);
    });
  });

  describe('getGNNMetrics', () => {
    let mockClient: any;

    beforeEach(async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      mockClient = {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue([]),
        forceLearn: jest.fn().mockResolvedValue({}),
        getMetrics: jest.fn().mockResolvedValue({
          cacheHitRate: 0.72,
          patternsLearned: 150,
          lastLearnTime: 1700000000000,
          totalInferences: 1000
        })
      };

      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          loraRank: 16,
          ewcEnabled: false
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should return combined metrics', async () => {
      const metrics = await store.getGNNMetrics();

      expect(metrics).not.toBeNull();
      expect(metrics?.enabled).toBe(true);
      expect(metrics?.cacheHitRate).toBe(0.72);
      expect(metrics?.patternsLearned).toBe(150);
      expect(metrics?.loraRank).toBe(16);
      expect(metrics?.ewcEnabled).toBe(false);
      expect(metrics?.lastLearnTime).toBe(1700000000000);
      expect(metrics?.totalInferences).toBe(1000);
    });

    it('should handle metrics errors gracefully', async () => {
      mockClient.getMetrics.mockRejectedValue(new Error('Metrics unavailable'));

      const metrics = await store.getGNNMetrics();

      expect(metrics).toBeNull();
    });
  });

  describe('queryWithGNN', () => {
    let mockClient: any;

    beforeEach(async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      mockClient = {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue([]),
        forceLearn: jest.fn().mockResolvedValue({}),
        getMetrics: jest.fn().mockResolvedValue({})
      };

      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          cacheThreshold: 0.80
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should use GNN search when confidence is high', async () => {
      mockClient.search.mockResolvedValue([
        {
          id: 'gnn-result-1',
          confidence: 0.95,
          metadata: { type: 'unit', domain: 'test', content: 'GNN match' }
        }
      ]);

      const embedding = new Array(384).fill(0.5);
      const result = await store.queryWithGNN('test query', embedding);

      expect(result.source).toBe('gnn');
      expect(result.confidence).toBe(0.95);
      expect(result.results.length).toBe(1);
      expect(result.results[0].pattern.id).toBe('gnn-result-1');
    });

    it('should fall back to local search when confidence is low', async () => {
      mockClient.search.mockResolvedValue([
        {
          id: 'low-confidence',
          confidence: 0.50,
          metadata: { type: 'unit', domain: 'test' }
        }
      ]);

      // Store a local pattern
      const localPattern = createTestPattern({ id: 'local-pattern' });
      await store.storePattern(localPattern);

      const result = await store.queryWithGNN('test query', localPattern.embedding);

      expect(result.source).toBe('local');
    });

    it('should fall back to local when GNN search fails', async () => {
      mockClient.search.mockRejectedValue(new Error('GNN service unavailable'));

      const localPattern = createTestPattern();
      await store.storePattern(localPattern);

      const result = await store.queryWithGNN('test query', localPattern.embedding);

      expect(result.source).toBe('local');
    });

    it('should respect custom threshold in options', async () => {
      mockClient.search.mockResolvedValue([
        {
          id: 'medium-confidence',
          confidence: 0.70,
          metadata: { type: 'unit', domain: 'test', content: 'Medium match' }
        }
      ]);

      const embedding = new Array(384).fill(0.5);

      // With low threshold (0.60), should use GNN result
      const result = await store.queryWithGNN('test query', embedding, { threshold: 0.60 });

      expect(result.source).toBe('gnn');
      expect(result.confidence).toBe(0.70);
    });

    it('should fall back to local when no GNN results', async () => {
      mockClient.search.mockResolvedValue([]);

      const localPattern = createTestPattern();
      await store.storePattern(localPattern);

      const result = await store.queryWithGNN('test query', localPattern.embedding);

      expect(result.source).toBe('local');
    });
  });

  describe('storeWithSync', () => {
    let mockClient: any;

    beforeEach(async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      mockClient = {
        healthCheck: jest.fn().mockResolvedValue({
          status: 'healthy',
          gnnStatus: 'active',
          loraStatus: 'enabled'
        }),
        store: jest.fn().mockResolvedValue({ success: true }),
        search: jest.fn().mockResolvedValue([]),
        forceLearn: jest.fn().mockResolvedValue({}),
        getMetrics: jest.fn().mockResolvedValue({})
      };

      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          autoSync: true,
          syncBatchSize: 3
        }
      });
      await store.initialize();
    });

    afterEach(async () => {
      await store.shutdown();
      jest.clearAllMocks();
    });

    it('should store pattern and queue for sync', async () => {
      const pattern = createTestPattern();

      const result = await store.storeWithSync(pattern);

      expect(result.stored).toBe(true);
      expect(store.getPendingSyncCount()).toBe(1);
    });

    it('should auto-sync when batch size reached', async () => {
      const pattern1 = createTestPattern({ id: 'auto-1' });
      const pattern2 = createTestPattern({ id: 'auto-2' });
      const pattern3 = createTestPattern({ id: 'auto-3' });

      await store.storeWithSync(pattern1);
      expect(store.getPendingSyncCount()).toBe(1);
      expect(mockClient.store).not.toHaveBeenCalled();

      await store.storeWithSync(pattern2);
      expect(store.getPendingSyncCount()).toBe(2);
      expect(mockClient.store).not.toHaveBeenCalled();

      // Third pattern should trigger auto-sync (batchSize = 3)
      const result = await store.storeWithSync(pattern3);

      expect(result.synced).toBe(true);
      expect(mockClient.store).toHaveBeenCalledTimes(3);
      expect(store.getPendingSyncCount()).toBe(0);
    });

    it('should not auto-sync when disabled', async () => {
      // Create store with autoSync disabled
      await store.shutdown();

      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');
      RuVectorClient.mockImplementation(() => mockClient);

      store = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true,
          autoSync: false,
          syncBatchSize: 2
        }
      });
      await store.initialize();

      const pattern1 = createTestPattern({ id: 'no-sync-1' });
      const pattern2 = createTestPattern({ id: 'no-sync-2' });
      const pattern3 = createTestPattern({ id: 'no-sync-3' });

      await store.storeWithSync(pattern1);
      await store.storeWithSync(pattern2);
      await store.storeWithSync(pattern3);

      // No auto-sync should have happened
      expect(mockClient.store).not.toHaveBeenCalled();
      expect(store.getPendingSyncCount()).toBe(3);
    });
  });

  describe('Health Check Integration', () => {
    it('should disable GNN on unhealthy health check', async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      RuVectorClient.mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue({
          status: 'unhealthy',
          gnnStatus: 'failed',
          loraStatus: 'disabled'
        }),
        store: jest.fn(),
        search: jest.fn(),
        forceLearn: jest.fn(),
        getMetrics: jest.fn()
      }));

      const testStore = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true
        }
      });
      await testStore.initialize();

      // GNN should be disabled due to unhealthy status
      expect(testStore.isGNNEnabled()).toBe(false);

      await testStore.shutdown();
    });

    it('should enable GNN on degraded health check', async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      RuVectorClient.mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue({
          status: 'degraded',
          gnnStatus: 'partial',
          loraStatus: 'enabled'
        }),
        store: jest.fn(),
        search: jest.fn(),
        forceLearn: jest.fn(),
        getMetrics: jest.fn()
      }));

      const testStore = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true
        }
      });
      await testStore.initialize();

      // GNN should be enabled even in degraded mode
      expect(testStore.isGNNEnabled()).toBe(true);

      await testStore.shutdown();
    });

    it('should handle health check failure gracefully', async () => {
      const { RuVectorClient } = require('../../../src/providers/RuVectorClient');

      RuVectorClient.mockImplementation(() => ({
        healthCheck: jest.fn().mockRejectedValue(new Error('Connection refused')),
        store: jest.fn(),
        search: jest.fn(),
        forceLearn: jest.fn(),
        getMetrics: jest.fn()
      }));

      const testStore = new RuVectorPatternStore({
        dimension: 384,
        metric: 'cosine',
        gnnLearning: {
          enabled: true
        }
      });
      await testStore.initialize();

      // GNN should be disabled on connection failure
      expect(testStore.isGNNEnabled()).toBe(false);

      await testStore.shutdown();
    });
  });

  describe('Factory Functions', () => {
    it('should create QE pattern store without GNN by default', async () => {
      const qeStore = createQEPatternStore();
      await qeStore.initialize();

      expect(qeStore.isGNNEnabled()).toBe(false);

      await qeStore.shutdown();
    });
  });
});
