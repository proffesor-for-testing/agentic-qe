/**
 * Agentic QE v3 - Memory Factory Unit Tests
 * Milestone 2.2: Test memory backend factory patterns
 *
 * Tests cover:
 * - Factory function for different backend types
 * - Default backend creation based on environment
 * - Backend type selection helpers
 * - Recommended configuration for use cases
 * - Auto-initialization behavior
 * - Error handling for unknown types
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createMemoryBackend,
  createDefaultMemoryBackend,
  selectBackendType,
  getRecommendedConfig,
  InMemoryBackend,
  HybridMemoryBackend,
  type MemoryBackendConfig,
  type MemoryBackendType,
} from '../../../src/kernel/memory-factory';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DB_DIR = '/tmp/aqe-memory-factory-test-' + Date.now();

function getTestDbPath(suffix = ''): string {
  return path.join(TEST_DB_DIR, `memory${suffix}.db`);
}

function cleanupTestDir(): void {
  try {
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Memory Factory Tests
// ============================================================================

describe('Memory Factory', () => {
  beforeEach(() => {
    resetUnifiedMemory();
    cleanupTestDir();
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    // Clear environment variables
    delete process.env.AQE_MEMORY_BACKEND;
    delete process.env.AQE_MEMORY_PATH;
  });

  afterEach(() => {
    resetUnifiedMemory();
    cleanupTestDir();
  });

  // ===========================================================================
  // createMemoryBackend Tests
  // ===========================================================================

  describe('createMemoryBackend', () => {
    describe('memory backend type', () => {
      it('should create InMemoryBackend', async () => {
        const result = await createMemoryBackend({ type: 'memory' });

        expect(result.backend).toBeInstanceOf(InMemoryBackend);
        expect(result.type).toBe('memory');
        expect(result.initialized).toBe(true);
      });

      it('should initialize by default', async () => {
        const result = await createMemoryBackend({ type: 'memory' });

        // Should be able to use immediately
        await result.backend.set('key', 'value');
        const value = await result.backend.get<string>('key');
        expect(value).toBe('value');
      });

      it('should skip initialization when autoInitialize is false', async () => {
        const result = await createMemoryBackend({ type: 'memory' }, false);

        expect(result.initialized).toBe(false);
      });
    });

    describe('sqlite backend type', () => {
      it('should create HybridMemoryBackend for sqlite', async () => {
        const result = await createMemoryBackend({
          type: 'sqlite',
          sqlite: { path: getTestDbPath() },
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        expect(result.type).toBe('sqlite');
      });

      it('should use provided sqlite config', async () => {
        const result = await createMemoryBackend({
          type: 'sqlite',
          sqlite: {
            path: getTestDbPath(),
            walMode: true,
            busyTimeout: 10000,
          },
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        const config = (result.backend as HybridMemoryBackend).getConfig();
        expect(config.sqlite.busyTimeout).toBe(10000);
      });
    });

    describe('agentdb backend type (legacy)', () => {
      it('should create HybridMemoryBackend for agentdb', async () => {
        const result = await createMemoryBackend({
          type: 'agentdb',
          agentdb: { path: getTestDbPath() },
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        expect(result.type).toBe('agentdb');
      });

      it('should use unified memory.db for agentdb', async () => {
        const result = await createMemoryBackend({
          type: 'agentdb',
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        // AgentDB now maps to hybrid with unified storage
      });
    });

    describe('hybrid backend type', () => {
      it('should create HybridMemoryBackend', async () => {
        const result = await createMemoryBackend({
          type: 'hybrid',
          hybrid: {
            sqlite: { path: getTestDbPath() },
            enableFallback: true,
          },
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        expect(result.type).toBe('hybrid');
      });

      it('should support full hybrid config', async () => {
        const result = await createMemoryBackend({
          type: 'hybrid',
          hybrid: {
            sqlite: {
              path: getTestDbPath(),
              walMode: true,
              poolSize: 5,
              busyTimeout: 3000,
            },
            enableFallback: false,
            defaultNamespace: 'custom-ns',
            cleanupInterval: 30000,
          },
        });

        expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
        const config = (result.backend as HybridMemoryBackend).getConfig();
        expect(config.enableFallback).toBe(false);
        expect(config.defaultNamespace).toBe('custom-ns');
      });
    });

    describe('unknown backend type', () => {
      it('should throw for unknown type', async () => {
        await expect(
          createMemoryBackend({ type: 'unknown' as MemoryBackendType })
        ).rejects.toThrow('Unknown memory backend type: unknown');
      });
    });
  });

  // ===========================================================================
  // createDefaultMemoryBackend Tests
  // ===========================================================================

  describe('createDefaultMemoryBackend', () => {
    it('should create in-memory backend by default', async () => {
      const result = await createDefaultMemoryBackend();

      expect(result.backend).toBeInstanceOf(InMemoryBackend);
      expect(result.type).toBe('memory');
    });

    it('should respect AQE_MEMORY_BACKEND env var', async () => {
      process.env.AQE_MEMORY_BACKEND = 'sqlite';
      process.env.AQE_MEMORY_PATH = TEST_DB_DIR;

      const result = await createDefaultMemoryBackend();

      expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
      expect(result.type).toBe('sqlite');
    });

    it('should respect AQE_MEMORY_PATH env var', async () => {
      process.env.AQE_MEMORY_BACKEND = 'hybrid';
      process.env.AQE_MEMORY_PATH = TEST_DB_DIR;

      const result = await createDefaultMemoryBackend();

      expect(result.backend).toBeInstanceOf(HybridMemoryBackend);
    });

    it('should skip initialization when requested', async () => {
      const result = await createDefaultMemoryBackend(false);

      expect(result.initialized).toBe(false);
    });
  });

  // ===========================================================================
  // selectBackendType Tests
  // ===========================================================================

  describe('selectBackendType', () => {
    it('should select memory for no special requirements', () => {
      const type = selectBackendType({
        needsVectorSearch: false,
        needsPersistence: false,
        needsHighPerformance: false,
      });

      expect(type).toBe('memory');
    });

    it('should select hybrid for vector search + high performance', () => {
      const type = selectBackendType({
        needsVectorSearch: true,
        needsPersistence: false,
        needsHighPerformance: true,
      });

      expect(type).toBe('hybrid');
    });

    it('should select hybrid for persistence + vector search', () => {
      const type = selectBackendType({
        needsVectorSearch: true,
        needsPersistence: true,
        needsHighPerformance: false,
      });

      expect(type).toBe('hybrid');
    });

    it('should select sqlite for persistence only', () => {
      const type = selectBackendType({
        needsVectorSearch: false,
        needsPersistence: true,
        needsHighPerformance: false,
      });

      expect(type).toBe('sqlite');
    });

    it('should select memory for ephemeral use', () => {
      const type = selectBackendType({
        needsVectorSearch: false,
        needsPersistence: false,
        needsHighPerformance: true,
      });

      expect(type).toBe('memory');
    });

    it('should handle memory constrained scenario', () => {
      const type = selectBackendType({
        needsVectorSearch: false,
        needsPersistence: false,
        needsHighPerformance: false,
        maxMemoryMB: 128,
      });

      expect(type).toBe('memory');
    });
  });

  // ===========================================================================
  // getRecommendedConfig Tests
  // ===========================================================================

  describe('getRecommendedConfig', () => {
    describe('testing use case', () => {
      it('should return memory config for testing', () => {
        const config = getRecommendedConfig('testing');

        expect(config.type).toBe('memory');
      });
    });

    describe('development use case', () => {
      it('should return hybrid config for development', () => {
        const config = getRecommendedConfig('development');

        expect(config.type).toBe('hybrid');
        expect(config.hybrid?.enableFallback).toBe(true);
      });
    });

    describe('production use case', () => {
      it('should return hybrid config for production', () => {
        const config = getRecommendedConfig('production');

        expect(config.type).toBe('hybrid');
        expect(config.hybrid?.enableFallback).toBe(false); // Fail fast
        expect(config.hybrid?.sqlite?.walMode).toBe(true);
        expect(config.hybrid?.sqlite?.poolSize).toBe(10);
      });
    });

    describe('ci use case', () => {
      it('should return sqlite config for CI', () => {
        const config = getRecommendedConfig('ci');

        expect(config.type).toBe('sqlite');
        expect(config.sqlite?.path).toBe(':memory:'); // In-memory SQLite
        expect(config.sqlite?.walMode).toBe(false);
      });
    });

    describe('unknown use case', () => {
      it('should return memory config for unknown', () => {
        const config = getRecommendedConfig('unknown' as any);

        expect(config.type).toBe('memory');
      });
    });
  });

  // ===========================================================================
  // Backend Integration Tests
  // ===========================================================================

  describe('Backend Integration', () => {
    it('should create working memory backend', async () => {
      const result = await createMemoryBackend({ type: 'memory' });

      // Test basic operations
      await result.backend.set('key1', { value: 'test' });
      const retrieved = await result.backend.get<{ value: string }>('key1');

      expect(retrieved).toEqual({ value: 'test' });
    });

    it('should create working hybrid backend', async () => {
      const result = await createMemoryBackend({
        type: 'hybrid',
        hybrid: {
          sqlite: { path: getTestDbPath() },
        },
      });

      // Test basic operations
      await result.backend.set('key1', { value: 'test' });
      const retrieved = await result.backend.get<{ value: string }>('key1');

      expect(retrieved).toEqual({ value: 'test' });

      await result.backend.dispose();
    });

    it('should support vector operations on hybrid backend', async () => {
      const result = await createMemoryBackend({
        type: 'hybrid',
        hybrid: {
          sqlite: { path: getTestDbPath() },
        },
      });

      // Store vectors
      await result.backend.storeVector('v1', [1, 0, 0]);
      await result.backend.storeVector('v2', [0, 1, 0]);

      // Search
      const results = await result.backend.vectorSearch([1, 0, 0], 1);

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('v1');

      await result.backend.dispose();
    });
  });

  // ===========================================================================
  // Configuration Merging Tests
  // ===========================================================================

  describe('Configuration Merging', () => {
    it('should merge memory config options', async () => {
      const result = await createMemoryBackend({
        type: 'memory',
        memory: { cleanupInterval: 30000 },
      });

      expect(result.backend).toBeInstanceOf(InMemoryBackend);
    });

    it('should merge sqlite config with defaults', async () => {
      const result = await createMemoryBackend({
        type: 'sqlite',
        sqlite: { path: getTestDbPath() },
      });

      const backend = result.backend as HybridMemoryBackend;
      const config = backend.getConfig();

      // Should have default values merged
      expect(config.enableFallback).toBe(true);
    });

    it('should allow overriding all hybrid config options', async () => {
      const result = await createMemoryBackend({
        type: 'hybrid',
        hybrid: {
          sqlite: { path: getTestDbPath() },
          enableFallback: false,
          defaultNamespace: 'custom',
          cleanupInterval: 120000,
        },
      });

      const backend = result.backend as HybridMemoryBackend;
      const config = backend.getConfig();

      expect(config.enableFallback).toBe(false);
      expect(config.defaultNamespace).toBe('custom');
      expect(config.cleanupInterval).toBe(120000);

      await result.backend.dispose();
    });
  });

  // ===========================================================================
  // Re-exports Tests
  // ===========================================================================

  describe('Re-exports', () => {
    it('should re-export InMemoryBackend', () => {
      expect(InMemoryBackend).toBeDefined();
    });

    it('should re-export HybridMemoryBackend', () => {
      expect(HybridMemoryBackend).toBeDefined();
    });
  });
});
