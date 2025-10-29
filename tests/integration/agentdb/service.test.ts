/**
 * AgentDB Service Integration Tests
 *
 * Tests core AgentDBService functionality to verify it actually works:
 * - Database initialization and connection
 * - Pattern storage with embeddings
 * - Pattern retrieval with filters
 * - Batch operations performance
 * - Error handling and edge cases
 *
 * These tests verify REAL database operations, not just JSON metadata flags.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { AgentDBManager, AgentDBConfig, MemoryPattern, RetrievalOptions } from '@core/memory/AgentDBManager';
import * as fs from 'fs';
import * as path from 'path';

describe('AgentDB Service Integration', () => {
  let agentDBManager: AgentDBManager;
  let testDbPath: string;
  const TEST_DATA_DIR = path.join(__dirname, '../../fixtures/agentdb');

  beforeEach(async () => {
    // Create unique test database for each test
    testDbPath = path.join(TEST_DATA_DIR, `test-${Date.now()}.db`);

    // Ensure fixtures directory exists
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    const config: AgentDBConfig = {
      dbPath: testDbPath,
      enableQUICSync: false, // Disable for basic tests
      syncPort: 4433,
      syncPeers: [],
      enableLearning: false,
      enableReasoning: false,
      cacheSize: 100,
      quantizationType: 'none'
    };

    agentDBManager = new AgentDBManager(config);
    await agentDBManager.initialize();
  });

  afterEach(async () => {
    if (agentDBManager) {
      await agentDBManager.shutdown();
    }

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Initialization', () => {
    it('should create database file on disk', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);

      const stats = fs.statSync(testDbPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should create required tables in database', () => {
      const db = new Database(testDbPath, { readonly: true });

      // Check for patterns table
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tableNames = tables.map((t: any) => t.name);

      expect(tableNames).toContain('patterns');

      db.close();
    });

    it('should create patterns table with correct schema', () => {
      const db = new Database(testDbPath, { readonly: true });

      const schema = db.prepare("PRAGMA table_info(patterns)").all();
      const columnNames = schema.map((col: any) => col.name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('type');
      expect(columnNames).toContain('domain');
      expect(columnNames).toContain('pattern_data');
      expect(columnNames).toContain('confidence');
      expect(columnNames).toContain('usage_count');
      expect(columnNames).toContain('created_at');

      db.close();
    });
  });

  describe('Pattern Storage', () => {
    it('should store pattern with embedding in database', async () => {
      // Arrange
      const pattern: MemoryPattern = {
        id: 'test-pattern-1',
        type: 'test-generation',
        domain: 'unit-testing',
        pattern_data: JSON.stringify({
          text: 'Test pattern for unit testing',
          metadata: { framework: 'jest', confidence: 0.95 },
          embedding: new Array(384).fill(0.1) // 384-dimensional embedding
        }),
        confidence: 0.95,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      // Act
      const id = await agentDBManager.storePattern(pattern);

      // Assert
      expect(id).toBe('test-pattern-1');

      // VERIFY in actual database (not just memory)
      const db = new Database(testDbPath, { readonly: true });
      const result = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id) as any;

      expect(result).toBeDefined();
      expect(result.id).toBe('test-pattern-1');
      expect(result.type).toBe('test-generation');
      expect(result.domain).toBe('unit-testing');
      expect(result.confidence).toBe(0.95);

      const parsedData = JSON.parse(result.pattern_data);
      expect(parsedData.embedding).toHaveLength(384);
      expect(parsedData.metadata.framework).toBe('jest');

      db.close();
    });

    it('should auto-generate ID if not provided', async () => {
      const pattern: MemoryPattern = {
        id: '', // Empty ID
        type: 'test-pattern',
        domain: 'general',
        pattern_data: JSON.stringify({ text: 'Auto-generated ID test' }),
        confidence: 0.8,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      const id = await agentDBManager.storePattern(pattern);

      expect(id).toBeTruthy();
      expect(id.length).toBeGreaterThan(0);

      // Verify in database
      const db = new Database(testDbPath, { readonly: true });
      const result = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
      expect(result).toBeDefined();
      db.close();
    });

    it('should update existing pattern if ID exists', async () => {
      // Store initial pattern
      const pattern1: MemoryPattern = {
        id: 'update-test',
        type: 'test',
        domain: 'general',
        pattern_data: JSON.stringify({ text: 'Original text' }),
        confidence: 0.7,
        usage_count: 1,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      await agentDBManager.storePattern(pattern1);

      // Update with same ID
      const pattern2: MemoryPattern = {
        ...pattern1,
        pattern_data: JSON.stringify({ text: 'Updated text' }),
        confidence: 0.9,
        usage_count: 2
      };

      await agentDBManager.storePattern(pattern2);

      // Verify only one record exists
      const db = new Database(testDbPath, { readonly: true });
      const count = db.prepare('SELECT COUNT(*) as c FROM patterns WHERE id = ?').get('update-test') as any;
      expect(count.c).toBe(1);

      const result = db.prepare('SELECT * FROM patterns WHERE id = ?').get('update-test') as any;
      const parsedData = JSON.parse(result.pattern_data);
      expect(parsedData.text).toBe('Updated text');
      expect(result.confidence).toBe(0.9);
      expect(result.usage_count).toBe(2);

      db.close();
    });

    it('should handle patterns with large embeddings', async () => {
      const largeEmbedding = new Array(1536).fill(0).map(() => Math.random()); // OpenAI embedding size

      const pattern: MemoryPattern = {
        id: 'large-embedding',
        type: 'test',
        domain: 'general',
        pattern_data: JSON.stringify({
          text: 'Test with large embedding',
          embedding: largeEmbedding
        }),
        confidence: 0.85,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      const id = await agentDBManager.storePattern(pattern);

      const db = new Database(testDbPath, { readonly: true });
      const result = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id) as any;
      const parsedData = JSON.parse(result.pattern_data);

      expect(parsedData.embedding).toHaveLength(1536);
      expect(parsedData.embedding).toEqual(largeEmbedding);

      db.close();
    });
  });

  describe('Pattern Retrieval', () => {
    beforeEach(async () => {
      // Seed test data
      const testPatterns: MemoryPattern[] = [
        {
          id: 'unit-test-1',
          type: 'test-generation',
          domain: 'unit-testing',
          pattern_data: JSON.stringify({
            text: 'Unit test for authentication',
            embedding: new Array(384).fill(0.8),
            metadata: { framework: 'jest', category: 'auth' }
          }),
          confidence: 0.9,
          usage_count: 5,
          success_count: 4,
          created_at: Date.now() - 1000,
          last_used: Date.now()
        },
        {
          id: 'integration-test-1',
          type: 'test-generation',
          domain: 'integration-testing',
          pattern_data: JSON.stringify({
            text: 'Integration test for API',
            embedding: new Array(384).fill(0.6),
            metadata: { framework: 'jest', category: 'api' }
          }),
          confidence: 0.85,
          usage_count: 3,
          success_count: 3,
          created_at: Date.now() - 2000,
          last_used: Date.now()
        },
        {
          id: 'e2e-test-1',
          type: 'test-generation',
          domain: 'e2e-testing',
          pattern_data: JSON.stringify({
            text: 'E2E test for user flow',
            embedding: new Array(384).fill(0.4),
            metadata: { framework: 'playwright', category: 'user-flow' }
          }),
          confidence: 0.95,
          usage_count: 10,
          success_count: 9,
          created_at: Date.now() - 3000,
          last_used: Date.now()
        }
      ];

      for (const pattern of testPatterns) {
        await agentDBManager.storePattern(pattern);
      }
    });

    it('should retrieve patterns by domain filter', async () => {
      const options: RetrievalOptions = {
        domain: 'unit-testing',
        k: 10
      };

      const result = await agentDBManager.retrievePatterns('authentication test', options);

      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.memories.every(m => m.domain === 'unit-testing')).toBe(true);
    });

    it('should retrieve top k patterns', async () => {
      const options: RetrievalOptions = {
        k: 2
      };

      const result = await agentDBManager.retrievePatterns('test pattern', options);

      expect(result.memories.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minimum confidence', async () => {
      const options: RetrievalOptions = {
        k: 10,
        minConfidence: 0.9
      };

      const result = await agentDBManager.retrievePatterns('test', options);

      expect(result.memories.every(m => m.confidence >= 0.9)).toBe(true);
    });

    it('should return similarity scores', async () => {
      const options: RetrievalOptions = {
        k: 3,
        metric: 'cosine'
      };

      const result = await agentDBManager.retrievePatterns('test authentication', options);

      expect(result.memories.length).toBeGreaterThan(0);
      expect(result.memories.every(m => typeof m.similarity === 'number')).toBe(true);
      expect(result.memories.every(m => m.similarity >= 0 && m.similarity <= 1)).toBe(true);
    });

    it('should include query metadata', async () => {
      const startTime = performance.now();
      const result = await agentDBManager.retrievePatterns('test', { k: 5 });
      const queryTime = performance.now() - startTime;

      expect(result.metadata).toBeDefined();
      expect(result.metadata.queryTime).toBeGreaterThan(0);
      expect(result.metadata.queryTime).toBeLessThan(100); // Should be fast
      expect(result.metadata.resultsCount).toBe(result.memories.length);
      expect(typeof result.metadata.cacheHit).toBe('boolean');
    });
  });

  describe('Batch Operations', () => {
    it('should store 100 patterns in under 10ms', async () => {
      const patterns: MemoryPattern[] = Array.from({ length: 100 }, (_, i) => ({
        id: `batch-pattern-${i}`,
        type: 'test-pattern',
        domain: 'performance',
        pattern_data: JSON.stringify({
          text: `Batch pattern ${i}`,
          embedding: new Array(384).fill(Math.random())
        }),
        confidence: 0.8 + Math.random() * 0.2,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      const startTime = performance.now();
      const ids = await agentDBManager.storeBatch(patterns);
      const duration = performance.now() - startTime;

      expect(ids).toHaveLength(100);
      expect(duration).toBeLessThan(10);

      // Verify in database
      const db = new Database(testDbPath, { readonly: true });
      const count = db.prepare("SELECT COUNT(*) as c FROM patterns WHERE id LIKE 'batch-pattern-%'").get() as any;
      expect(count.c).toBe(100);
      db.close();
    });

    it('should handle batch operations with transaction rollback on error', async () => {
      const patterns: MemoryPattern[] = [
        {
          id: 'valid-1',
          type: 'test',
          domain: 'general',
          pattern_data: JSON.stringify({ text: 'Valid pattern 1' }),
          confidence: 0.9,
          usage_count: 0,
          success_count: 0,
          created_at: Date.now(),
          last_used: Date.now()
        },
        {
          id: 'invalid',
          type: 'test',
          domain: 'general',
          pattern_data: 'INVALID JSON{{{', // Invalid JSON
          confidence: 0.9,
          usage_count: 0,
          success_count: 0,
          created_at: Date.now(),
          last_used: Date.now()
        }
      ];

      await expect(agentDBManager.storeBatch(patterns)).rejects.toThrow();

      // Verify no patterns were stored (transaction rolled back)
      const db = new Database(testDbPath, { readonly: true });
      const count = db.prepare("SELECT COUNT(*) as c FROM patterns WHERE id IN ('valid-1', 'invalid')").get() as any;
      expect(count.c).toBe(0);
      db.close();
    });

    it('should retrieve batch of patterns efficiently', async () => {
      // Store 50 patterns
      const patterns = Array.from({ length: 50 }, (_, i) => ({
        id: `retrieve-batch-${i}`,
        type: 'test',
        domain: 'performance',
        pattern_data: JSON.stringify({
          text: `Pattern ${i}`,
          embedding: new Array(384).fill(i / 50)
        }),
        confidence: 0.8,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      }));

      await agentDBManager.storeBatch(patterns);

      // Retrieve all
      const startTime = performance.now();
      const result = await agentDBManager.retrievePatterns('pattern', { k: 50 });
      const duration = performance.now() - startTime;

      expect(result.memories.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should be fast even for batch
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      await agentDBManager.shutdown();

      // Try to store pattern after shutdown
      const pattern: MemoryPattern = {
        id: 'error-test',
        type: 'test',
        domain: 'general',
        pattern_data: JSON.stringify({ text: 'Error test' }),
        confidence: 0.8,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      await expect(agentDBManager.storePattern(pattern)).rejects.toThrow();
    });

    it('should handle invalid JSON in pattern_data', async () => {
      const pattern: MemoryPattern = {
        id: 'invalid-json',
        type: 'test',
        domain: 'general',
        pattern_data: 'INVALID JSON{{{',
        confidence: 0.8,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      await expect(agentDBManager.storePattern(pattern)).rejects.toThrow();
    });

    it('should handle empty query gracefully', async () => {
      const result = await agentDBManager.retrievePatterns('', { k: 10 });

      expect(result.memories).toEqual([]);
      expect(result.metadata.resultsCount).toBe(0);
    });

    it('should handle retrieval with no matching patterns', async () => {
      const result = await agentDBManager.retrievePatterns('completely unrelated query xyz123', {
        k: 10,
        domain: 'non-existent-domain'
      });

      expect(result.memories).toEqual([]);
      expect(result.metadata.resultsCount).toBe(0);
    });
  });

  describe('Cache Operations', () => {
    it('should cache frequently accessed patterns', async () => {
      // Store pattern
      const pattern: MemoryPattern = {
        id: 'cache-test',
        type: 'test',
        domain: 'general',
        pattern_data: JSON.stringify({
          text: 'Cached pattern',
          embedding: new Array(384).fill(0.5)
        }),
        confidence: 0.9,
        usage_count: 0,
        success_count: 0,
        created_at: Date.now(),
        last_used: Date.now()
      };

      await agentDBManager.storePattern(pattern);

      // First retrieval (cache miss)
      const result1 = await agentDBManager.retrievePatterns('cached pattern', { k: 1 });
      expect(result1.metadata.cacheHit).toBe(false);

      // Second retrieval (cache hit)
      const result2 = await agentDBManager.retrievePatterns('cached pattern', { k: 1 });
      expect(result2.metadata.cacheHit).toBe(true);

      // Cache hit should be faster
      const startTime1 = performance.now();
      await agentDBManager.retrievePatterns('cached pattern', { k: 1 });
      const uncachedTime = performance.now() - startTime1;

      const startTime2 = performance.now();
      await agentDBManager.retrievePatterns('cached pattern', { k: 1 });
      const cachedTime = performance.now() - startTime2;

      expect(cachedTime).toBeLessThanOrEqual(uncachedTime);
    });
  });
});
