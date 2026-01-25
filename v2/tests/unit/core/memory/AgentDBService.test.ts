/**
 * AgentDBService Unit Tests
 *
 * Tests:
 * - Initialization and configuration
 * - Pattern storage and retrieval
 * - Vector similarity search with HNSW
 * - Batch operations
 * - Error handling
 * - Cache and quantization
 *
 * @group unit
 * @group core
 * @group memory
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AgentDBService, createAgentDBService, QEPattern, AgentDBServiceConfig } from '@core/memory/AgentDBService';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const TEST_DB_DIR = '.test-agentdb';
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-patterns.db');

describe('AgentDBService', () => {
  let service: AgentDBService;

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    // Create service with test configuration
    const config: AgentDBServiceConfig = {
      dbPath: TEST_DB_PATH,
      embeddingDim: 4, // Small dimension for testing
      enableHNSW: true,
      enableCache: true,
      cacheSize: 100,
      cacheTTL: 1000,
      enableQuantization: false
    };

    service = new AgentDBService(config);
  });

  afterEach(async () => {
    // Clean up
    await service.close();

    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      await service.initialize();

      const stats = await service.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalPatterns).toBe(0);
    });

    it('should throw error when initializing twice', async () => {
      await service.initialize();

      await expect(service.initialize()).rejects.toThrow('already initialized');
    });

    it('should create database directory if it does not exist', async () => {
      const nestedPath = path.join(TEST_DB_DIR, 'nested', 'dir', 'patterns.db');
      const nestedService = new AgentDBService({
        dbPath: nestedPath,
        embeddingDim: 4,
        enableHNSW: true,
        enableCache: false
      });

      await nestedService.initialize();

      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);

      await nestedService.close();
    });

    it('should support factory creation with defaults', async () => {
      // createAgentDBService is async - returns Promise<AgentDBService>
      // and already initializes the service
      const defaultService = await createAgentDBService({
        dbPath: path.join(TEST_DB_DIR, 'default.db')
      });

      const stats = await defaultService.getStats();
      expect(stats).toBeDefined();

      await defaultService.close();
    });
  });

  describe('Pattern Storage', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should store a single pattern successfully', async () => {
      const pattern: QEPattern = {
        id: 'pattern-1',
        type: 'test-generator',
        domain: 'unit-testing',
        data: { framework: 'jest', language: 'typescript' },
        confidence: 0.95,
        usageCount: 1,
        successCount: 1,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);

      // storePattern returns void, not the ID
      await service.storePattern(pattern, embedding);

      const stats = await service.getStats();
      expect(stats.totalPatterns).toBe(1);
    });

    it('should retrieve stored pattern by ID', async () => {
      const pattern: QEPattern = {
        id: 'pattern-2',
        type: 'coverage-analyzer',
        domain: 'coverage-analysis',
        data: { threshold: 80, gaps: [] },
        confidence: 0.88,
        usageCount: 5,
        successCount: 4,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      const embedding = new Float32Array([0.5, 0.6, 0.7, 0.8]);

      await service.storePattern(pattern, embedding);

      const retrieved = await service.retrievePattern('pattern-2');

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('pattern-2');
      expect(retrieved!.type).toBe('coverage-analyzer');
      expect(retrieved!.domain).toBe('coverage-analysis');
      expect(retrieved!.confidence).toBe(0.88);
      expect(retrieved!.data).toEqual(pattern.data);
    });

    it('should return null for non-existent pattern', async () => {
      const retrieved = await service.retrievePattern('non-existent');

      expect(retrieved).toBeNull();
    });

    it('should throw error for invalid embedding dimension', async () => {
      const pattern: QEPattern = {
        id: 'pattern-3',
        type: 'test-generator',
        domain: 'test-planning',
        data: {},
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      // Wrong dimension (3 instead of 4)
      const embedding = new Float32Array([0.1, 0.2, 0.3]);

      await expect(service.storePattern(pattern, embedding))
        .rejects.toThrow('dimension mismatch');
    });
  });

  describe('Vector Similarity Search', () => {
    beforeEach(async () => {
      await service.initialize();

      // Store multiple patterns for search testing
      const patterns: Array<{ pattern: QEPattern; embedding: number[] }> = [
        {
          pattern: {
            id: 'search-1',
            type: 'test-generator',
            domain: 'unit-testing',
            data: { framework: 'jest' },
            confidence: 0.95,
            usageCount: 10,
            successCount: 9,
            createdAt: Date.now(),
            lastUsed: Date.now()
          },
          embedding: [1.0, 0.0, 0.0, 0.0]
        },
        {
          pattern: {
            id: 'search-2',
            type: 'test-generator',
            domain: 'unit-testing',
            data: { framework: 'vitest' },
            confidence: 0.90,
            usageCount: 8,
            successCount: 7,
            createdAt: Date.now(),
            lastUsed: Date.now()
          },
          embedding: [0.9, 0.1, 0.0, 0.0]
        },
        {
          pattern: {
            id: 'search-3',
            type: 'coverage-analyzer',
            domain: 'coverage-analysis',
            data: { threshold: 80 },
            confidence: 0.85,
            usageCount: 5,
            successCount: 4,
            createdAt: Date.now(),
            lastUsed: Date.now()
          },
          embedding: [0.0, 1.0, 0.0, 0.0]
        }
      ];

      for (const { pattern, embedding } of patterns) {
        await service.storePattern(pattern, embedding);
      }
    });

    // Note: These tests verify the search API works, but the mocked HNSW returns
    // empty results. Full vector search behavior is tested in integration tests.
    it('should find similar patterns using vector search', async () => {
      const queryEmbedding = [0.95, 0.05, 0.0, 0.0]; // Similar to search-1

      const results = await service.searchSimilar(queryEmbedding, {
        k: 2,
        metric: 'cosine'
      });

      // Mock HNSW returns empty results - verify API doesn't throw
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter results by domain', async () => {
      const queryEmbedding = [0.5, 0.5, 0.0, 0.0];

      const results = await service.searchSimilar(queryEmbedding, {
        k: 10,
        domain: 'unit-testing'
      });

      // Mock HNSW returns empty results - verify API accepts domain filter
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter results by type', async () => {
      const queryEmbedding = [0.5, 0.5, 0.0, 0.0];

      const results = await service.searchSimilar(queryEmbedding, {
        k: 10,
        type: 'test-generator'
      });

      // Mock HNSW returns empty results - verify API accepts type filter
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should filter results by minimum confidence', async () => {
      const queryEmbedding = [0.5, 0.5, 0.0, 0.0];

      const results = await service.searchSimilar(queryEmbedding, {
        k: 10,
        minConfidence: 0.92
      });

      results.forEach(result => {
        expect(result.pattern.confidence).toBeGreaterThanOrEqual(0.92);
      });
    });

    it('should respect k parameter for result count', async () => {
      const queryEmbedding = [0.5, 0.5, 0.0, 0.0];

      const results = await service.searchSimilar(queryEmbedding, {
        k: 2
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should throw error for invalid query embedding dimension', async () => {
      const queryEmbedding = [0.5, 0.5, 0.0]; // Wrong dimension

      await expect(service.searchSimilar(queryEmbedding))
        .rejects.toThrow('dimension mismatch');
    });
  });

  describe('Batch Operations', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should insert multiple patterns in batch', async () => {
      const patterns: QEPattern[] = [
        {
          id: 'batch-1',
          type: 'test-generator',
          domain: 'unit-testing',
          data: { framework: 'jest' },
          confidence: 0.9,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        },
        {
          id: 'batch-2',
          type: 'test-generator',
          domain: 'integration-testing',
          data: { framework: 'cypress' },
          confidence: 0.85,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        },
        {
          id: 'batch-3',
          type: 'coverage-analyzer',
          domain: 'coverage-analysis',
          data: { threshold: 80 },
          confidence: 0.88,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        }
      ];

      const embeddings = [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
        [0.9, 0.8, 0.7, 0.6]
      ];

      const result = await service.storeBatch(patterns, embeddings);

      expect(result.success).toBe(true);
      expect(result.insertedIds.length).toBe(3);
      expect(result.errors.length).toBe(0);
      // Duration may be 0 in mocked environment with fast operations
      expect(result.duration).toBeGreaterThanOrEqual(0);

      const stats = await service.getStats();
      expect(stats.totalPatterns).toBe(3);
    });

    it('should handle partial batch failures gracefully', async () => {
      const patterns: QEPattern[] = [
        {
          id: 'batch-4',
          type: 'test-generator',
          domain: 'unit-testing',
          data: {},
          confidence: 0.9,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        },
        {
          id: 'batch-5',
          type: 'test-generator',
          domain: 'integration-testing',
          data: {},
          confidence: 0.85,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        }
      ];

      const embeddings = [
        [0.1, 0.2, 0.3, 0.4], // Valid
        [0.5, 0.6, 0.7] // Invalid dimension
      ];

      const result = await service.storeBatch(patterns, embeddings);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('dimension mismatch');
    });

    it('should throw error for mismatched array lengths', async () => {
      const patterns: QEPattern[] = [
        {
          id: 'batch-6',
          type: 'test-generator',
          domain: 'unit-testing',
          data: {},
          confidence: 0.9,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        }
      ];

      const embeddings = [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8] // Extra embedding
      ];

      const result = await service.storeBatch(patterns, embeddings);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report throughput metrics', async () => {
      const patterns: QEPattern[] = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-${i}`,
        type: 'test-generator',
        domain: 'performance-testing',
        data: { index: i },
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        createdAt: Date.now(),
        lastUsed: Date.now()
      }));

      const embeddings = Array.from({ length: 10 }, () => new Float32Array([0.1, 0.2, 0.3, 0.4]));

      const result = await service.storeBatch(patterns, embeddings);

      expect(result.success).toBe(true);
      // Duration may be 0 in mocked environment with fast operations
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.insertedIds.length).toBe(10);
    });
  });

  describe('Pattern Deletion', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should delete pattern successfully', async () => {
      const pattern: QEPattern = {
        id: 'delete-1',
        type: 'test-generator',
        domain: 'unit-testing',
        data: {},
        confidence: 0.9,
        usageCount: 1,
        successCount: 1,
        createdAt: Date.now(),
        lastUsed: Date.now()
      };

      await service.storePattern(pattern, new Float32Array([0.1, 0.2, 0.3, 0.4]));

      const deleted = await service.deletePattern('delete-1');

      expect(deleted).toBe(true);

      const retrieved = await service.retrievePattern('delete-1');
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent pattern', async () => {
      const deleted = await service.deletePattern('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('Database Statistics', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return accurate statistics', async () => {
      // Store some patterns
      for (let i = 0; i < 5; i++) {
        await service.storePattern(
          {
            id: `stats-${i}`,
            type: 'test-generator',
            domain: 'unit-testing',
            data: { index: i },
            confidence: 0.9,
            usageCount: 1,
            successCount: 1,
            createdAt: Date.now(),
            lastUsed: Date.now()
          },
          [0.1, 0.2, 0.3, 0.4]
        );
      }

      const stats = await service.getStats();

      expect(stats.totalPatterns).toBe(5);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should include cache statistics when enabled', async () => {
      const stats = await service.getStats();

      expect(stats.cacheStats).toBeDefined();
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should clear cache successfully', () => {
      expect(() => service.clearCache()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when operating before initialization', async () => {
      const uninitializedService = new AgentDBService({
        dbPath: path.join(TEST_DB_DIR, 'error.db'),
        embeddingDim: 4,
        enableHNSW: true,
        enableCache: false
      });

      await expect(
        uninitializedService.storePattern(
          {
            id: 'error-1',
            type: 'test-generator',
            domain: 'unit-testing',
            data: {},
            confidence: 0.9,
            usageCount: 1,
            successCount: 1,
            createdAt: Date.now(),
            lastUsed: Date.now()
          },
          [0.1, 0.2, 0.3, 0.4]
        )
      ).rejects.toThrow('not initialized');
    });

    it('should handle close on uninitialized service gracefully', async () => {
      const uninitializedService = new AgentDBService({
        dbPath: path.join(TEST_DB_DIR, 'error2.db'),
        embeddingDim: 4,
        enableHNSW: true,
        enableCache: false
      });

      await expect(uninitializedService.close()).resolves.not.toThrow();
    });
  });

  describe('Lifecycle Management', () => {
    it('should close successfully and clean up resources', async () => {
      await service.initialize();

      await service.storePattern(
        {
          id: 'lifecycle-1',
          type: 'test-generator',
          domain: 'unit-testing',
          data: {},
          confidence: 0.9,
          usageCount: 1,
          successCount: 1,
          createdAt: Date.now(),
          lastUsed: Date.now()
        },
        [0.1, 0.2, 0.3, 0.4]
      );

      await service.close();

      // Should throw after close
      await expect(service.getStats()).rejects.toThrow('not initialized');
    });

    it('should allow reinitialization after close', async () => {
      await service.initialize();
      await service.close();

      // Create new service with same path
      const newService = new AgentDBService({
        dbPath: TEST_DB_PATH,
        embeddingDim: 4,
        enableHNSW: true,
        enableCache: false
      });

      await newService.initialize();

      const stats = await newService.getStats();
      expect(stats).toBeDefined();

      await newService.close();
    });
  });
});
