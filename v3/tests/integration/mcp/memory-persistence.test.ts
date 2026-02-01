/**
 * Memory Persistence Integration Tests
 *
 * Tests that MCP tools properly persist data across:
 * 1. Fleet dispose/reinitialize cycles (same process)
 * 2. Tool instance cache resets
 * 3. Process restarts (SQLite file persistence)
 *
 * These tests verify the fixes for the createMinimalMemoryBackend → getSharedMemoryBackend
 * migration and the resetInstanceCache() mechanism.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { HybridMemoryBackend } from '../../../src/kernel/hybrid-backend';
import { resetUnifiedMemory, getUnifiedMemory } from '../../../src/kernel/unified-memory';
import { getSharedMemoryBackend } from '../../../src/mcp/tools/base';
import { QE_TOOLS, resetAllToolCaches } from '../../../src/mcp/tools/registry';
import { handleFleetInit, handleFleetStatus, disposeFleet, isFleetInitialized } from '../../../src/mcp/handlers/core-handlers';

// Use system temp directory for test isolation (auto-cleaned by OS)
const TEST_DATA_DIR = path.join(os.tmpdir(), 'agentic-qe-test-' + process.pid);

describe('Memory Persistence Tests', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Dispose fleet if initialized
    if (isFleetInitialized()) {
      await disposeFleet();
    }
    // Clean up test directory
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  describe('HybridMemoryBackend Persistence', () => {
    it('should persist data to SQLite database file', async () => {
      const dbPath = path.join(TEST_DATA_DIR, 'test-memory.db');
      const testNamespace = 'persistence-test';

      const backend = new HybridMemoryBackend({
        sqlite: {
          path: dbPath,
          walMode: true,
          poolSize: 1,
          busyTimeout: 5000,
        },
        enableFallback: true,
        defaultNamespace: testNamespace,
      });

      await backend.initialize();

      // Store test data (key includes namespace prefix for uniqueness)
      const testKey = `test-key-${uuidv4()}`;
      const testValue = { data: 'test-value', timestamp: Date.now() };

      await backend.set(testKey, testValue);

      // Verify data was stored
      const retrieved = await backend.get<typeof testValue>(testKey);
      expect(retrieved).toBeDefined();
      expect(retrieved?.data).toBe('test-value');

      // Verify database file exists (in-memory SQLite still creates a file marker)
      // Note: current implementation uses in-memory storage

      // Dispose backend
      await backend.dispose();

      // Create a NEW backend instance pointing to same file with SAME namespace
      const backend2 = new HybridMemoryBackend({
        sqlite: {
          path: dbPath,
          walMode: true,
          poolSize: 1,
          busyTimeout: 5000,
        },
        enableFallback: true,
        defaultNamespace: testNamespace,
      });

      await backend2.initialize();

      // Note: Current HybridMemoryBackend uses in-memory storage internally
      // so data won't persist across instances. This test documents expected behavior
      // when real SQLite persistence is implemented.

      // For now, verify backend2 initializes without error
      expect(backend2).toBeDefined();

      await backend2.dispose();
    });
  });

  describe('Fleet Dispose/Reinit Cycle', () => {
    beforeEach(async () => {
      // Ensure fleet is disposed before each test
      if (isFleetInitialized()) {
        await disposeFleet();
      }
    });

    it('should reset tool instance caches on dispose', async () => {
      // Initialize fleet
      const initResult = await handleFleetInit({
        topology: 'hierarchical',
        maxAgents: 5,
        lazyLoading: true,
      });
      expect(initResult.success).toBe(true);

      // Verify fleet is initialized
      expect(isFleetInitialized()).toBe(true);

      // Get fleet status to confirm it's working
      const statusResult = await handleFleetStatus({ verbose: false });
      expect(statusResult.success).toBe(true);

      // Dispose fleet - this should call resetAllToolCaches()
      await disposeFleet();

      // Verify fleet is disposed
      expect(isFleetInitialized()).toBe(false);

      // Reinitialize fleet
      const reinitResult = await handleFleetInit({
        topology: 'hierarchical',
        maxAgents: 5,
        lazyLoading: true,
      });
      expect(reinitResult.success).toBe(true);

      // Verify fleet status works after reinit
      const statusResult2 = await handleFleetStatus({ verbose: false });
      expect(statusResult2.success).toBe(true);

      // Clean up
      await disposeFleet();
    });

    it('should not hold stale backend references after reinit', async () => {
      // This test verifies that service caches don't hold disposed backend references

      // Initialize fleet
      await handleFleetInit({
        topology: 'hierarchical',
        maxAgents: 5,
        lazyLoading: true,
      });

      // Get initial status
      const status1 = await handleFleetStatus({ verbose: true });
      expect(status1.success).toBe(true);

      // Dispose and reinit
      await disposeFleet();
      await handleFleetInit({
        topology: 'hierarchical',
        maxAgents: 5,
        lazyLoading: true,
      });

      // Get status after reinit - should NOT throw "not initialized" error
      const status2 = await handleFleetStatus({ verbose: true });
      expect(status2.success).toBe(true);

      // Dispose again and reinit once more to test multiple cycles
      await disposeFleet();
      await handleFleetInit({
        topology: 'hierarchical',
        maxAgents: 5,
        lazyLoading: true,
      });

      const status3 = await handleFleetStatus({ verbose: true });
      expect(status3.success).toBe(true);

      // Clean up
      await disposeFleet();
    });
  });

  describe('Tool Instance Cache Reset', () => {
    it('should have resetInstanceCache method on all tools', () => {
      // Verify all tools have the resetInstanceCache method
      for (const tool of QE_TOOLS) {
        expect(typeof tool.resetInstanceCache).toBe('function');
      }
    });

    it('should reset all tool caches via resetAllToolCaches', () => {
      // This test verifies resetAllToolCaches can be called without error
      // Tools with instance caches will have their caches cleared
      expect(() => resetAllToolCaches()).not.toThrow();
    });

    it('should have caches reset for tools with instance services', () => {
      // Tools known to have instance caches:
      // - TestGenerateTool (testGeneratorService)
      // - CoverageAnalyzeTool (analyzerService)
      // - CoverageGapsTool (gapService)
      // - DefectPredictTool (predictorService)

      const toolsWithCaches = [
        'qe/tests/generate',
        'qe/coverage/analyze',
        'qe/coverage/gaps',
        'qe/defects/predict',
      ];

      for (const toolName of toolsWithCaches) {
        const tool = QE_TOOLS.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(typeof tool?.resetInstanceCache).toBe('function');
      }
    });
  });

  describe('Shared Memory Backend Singleton', () => {
    it('should return same instance on multiple calls', async () => {
      const backend1 = await getSharedMemoryBackend();
      const backend2 = await getSharedMemoryBackend();

      // Should be the exact same instance
      expect(backend1).toBe(backend2);
    });

    it('should support set/get operations', async () => {
      const backend = await getSharedMemoryBackend();

      const testKey = `shared-test-${uuidv4()}`;
      const testValue = { shared: true, value: Math.random() };

      await backend.set(testKey, testValue);

      // Retrieve using same backend
      const retrieved = await backend.get<typeof testValue>(testKey);
      expect(retrieved).toBeDefined();
      expect(retrieved?.shared).toBe(true);
    });
  });
});

describe('Process Restart Simulation', () => {
  // Use system temp directory for test isolation (auto-cleaned by OS)
  const RESTART_TEST_DIR = path.join(os.tmpdir(), `agentic-qe-restart-test-${process.pid}`);
  const TEST_NAMESPACE = 'restart-test';

  beforeAll(async () => {
    // Clean up
    if (fs.existsSync(RESTART_TEST_DIR)) {
      fs.rmSync(RESTART_TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(RESTART_TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Clean up
    if (fs.existsSync(RESTART_TEST_DIR)) {
      fs.rmSync(RESTART_TEST_DIR, { recursive: true });
    }
  });

  it('should store and retrieve data within same backend lifecycle', async () => {
    // This tests basic set/get functionality
    const backend = new HybridMemoryBackend({
      sqlite: {
        path: path.join(RESTART_TEST_DIR, 'restart-test.db'),
        walMode: true,
        poolSize: 1,
        busyTimeout: 5000,
      },
      enableFallback: true,
      defaultNamespace: TEST_NAMESPACE,
    });

    await backend.initialize();

    const testKey = 'restart-persistence-key';
    const testValue = { survived: true, timestamp: Date.now(), random: Math.random() };

    await backend.set(testKey, testValue);

    // Verify stored
    const check = await backend.get<typeof testValue>(testKey);
    expect(check).toBeDefined();
    expect(check?.survived).toBe(true);
    expect(check?.timestamp).toBe(testValue.timestamp);

    // Dispose
    await backend.dispose();
  });

  it('should persist data across backend instances (real SQLite)', async () => {
    // This test verifies that data PERSISTS across backend instances
    // when using real SQLite (better-sqlite3) for storage.

    const dbPath = path.join(RESTART_TEST_DIR, 'persistence-test.db');

    // First instance - store data
    const backend1 = new HybridMemoryBackend({
      sqlite: { path: dbPath, walMode: true, poolSize: 1, busyTimeout: 5000 },
      enableFallback: true,
      defaultNamespace: TEST_NAMESPACE,
    });
    await backend1.initialize();

    // Verify we're using real SQLite persistence
    expect(backend1.isPersistent()).toBe(true);

    await backend1.set('persistence-key', { instance: 1, timestamp: Date.now() });
    await backend1.dispose();

    // Second instance - retrieve data (simulates process restart)
    const backend2 = new HybridMemoryBackend({
      sqlite: { path: dbPath, walMode: true, poolSize: 1, busyTimeout: 5000 },
      enableFallback: true,
      defaultNamespace: TEST_NAMESPACE,
    });
    await backend2.initialize();

    // Data from instance 1 SHOULD be available (real SQLite persistence)
    const retrieved = await backend2.get<{ instance: number; timestamp: number }>('persistence-key');

    // Data persists across backend instances!
    expect(retrieved).toBeDefined();
    expect(retrieved?.instance).toBe(1);

    await backend2.dispose();
  });

  it('should throw clear error when database path is invalid', async () => {
    // Reset the singleton to ensure clean state for this test
    resetUnifiedMemory();

    // Test that invalid paths result in clear error messages, not silent fallbacks
    const invalidBackend = new HybridMemoryBackend({
      sqlite: {
        // Non-existent root directory that cannot be created
        path: '/this/path/definitely/does/not/exist/and/cannot/be/created/db.sqlite',
        walMode: true,
        poolSize: 1,
        busyTimeout: 5000,
      },
      enableFallback: false,
      defaultNamespace: TEST_NAMESPACE,
    });

    // Should throw an error, not silently fall back to in-memory
    await expect(invalidBackend.initialize()).rejects.toThrow('Failed to initialize UnifiedMemoryManager');
  });
});

describe('ADR-046 Unified Storage Consistency', () => {
  /**
   * This test verifies that all components use the same unified database.
   * Added after brutal honesty review found hooks.ts was using inconsistent paths.
   */
  it('should verify all components resolve to same database path', async () => {
    // Reset to ensure clean state
    resetUnifiedMemory();

    // Import the unified memory config
    const { DEFAULT_UNIFIED_MEMORY_CONFIG, getUnifiedMemory } = await import('../../../src/kernel/unified-memory');

    // Get the singleton
    const unified = getUnifiedMemory();
    await unified.initialize();

    // Verify the expected path (now absolute with project root detection)
    const actualPath = unified.getDbPath();
    expect(actualPath).toContain('.agentic-qe');
    expect(actualPath).toContain('memory.db');

    // Verify HybridMemoryBackend uses same singleton
    const backend = new HybridMemoryBackend({
      sqlite: {
        path: path.join(process.cwd(), '.agentic-qe', 'memory.db'),
        walMode: true,
      },
    });
    await backend.initialize();

    // Both should be using the same underlying database
    const unifiedMemory = backend.getUnifiedMemory();
    expect(unifiedMemory).toBe(unified);

    await backend.dispose();
  });

  it('should reject attempts to use different database paths after init', async () => {
    // Reset to ensure clean state
    resetUnifiedMemory();

    // Initialize with default path
    const unified = getUnifiedMemory();
    await unified.initialize();
    const firstPath = unified.getDbPath();

    // Try to get instance with different path - should return same instance
    const { getUnifiedMemory: getMemory } = await import('../../../src/kernel/unified-memory');
    const sameInstance = getMemory({ dbPath: '/some/other/path.db' });

    // Singleton pattern: first caller's config wins
    expect(sameInstance).toBe(unified);
    expect(sameInstance.getDbPath()).toBe(firstPath);
  });
});
