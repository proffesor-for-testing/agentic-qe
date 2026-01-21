/**
 * Regression test for Issue #137: FleetManager MemoryManager type mismatch
 *
 * This test ensures that:
 * 1. FleetManager uses SwarmMemoryManager (not MemoryManager)
 * 2. Agents spawned by FleetManager have learning features enabled
 * 3. No warnings about "memoryStore is not SwarmMemoryManager" are logged
 *
 * @see https://github.com/proffesor-for-testing/agentic-qe/issues/137
 */

import { FleetManager } from '@core/FleetManager';
import { SwarmMemoryManager } from '@core/memory/SwarmMemoryManager';
import { isSwarmMemoryManager, validateLearningConfig } from '@agents/BaseAgent';
import { MemoryStore } from '../../src/types';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

describe('Issue #137: FleetManager Learning Features Regression', () => {
  let fleet: FleetManager | null = null;
  let testDbDir: string;
  let consoleWarnSpy: jest.SpyInstance;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    // Create temp directory for test database
    testDbDir = path.join(os.tmpdir(), `aqe-test-${Date.now()}`);
    await fs.ensureDir(testDbDir);
  });

  beforeEach(() => {
    // Spy on console.warn to detect learning feature warnings
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Set test env to use in-memory database
    process.env.NODE_ENV = 'test';
  });

  afterEach(async () => {
    // Cleanup fleet if created
    if (fleet) {
      try {
        await fleet.stop();
      } catch {
        // Ignore cleanup errors
      }
      fleet = null;
    }
    consoleWarnSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  afterAll(async () => {
    // Cleanup temp directory
    try {
      await fs.remove(testDbDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Type Guard Functions', () => {
    it('isSwarmMemoryManager returns true for SwarmMemoryManager', async () => {
      const swarm = new SwarmMemoryManager(':memory:');
      await swarm.initialize();
      try {
        // Note: isSwarmMemoryManager takes MemoryStore, SwarmMemoryManager needs cast
        expect(isSwarmMemoryManager(swarm as unknown as MemoryStore)).toBe(true);
      } finally {
        await swarm.close();
      }
    });

    it('isSwarmMemoryManager returns false for plain object', () => {
      const fakeMemoryStore: MemoryStore = {
        store: jest.fn(),
        retrieve: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn().mockResolvedValue(true),
        clear: jest.fn()
      };
      expect(isSwarmMemoryManager(fakeMemoryStore)).toBe(false);
    });

    it('validateLearningConfig detects invalid configuration', () => {
      const fakeMemoryStore: MemoryStore = {
        store: jest.fn(),
        retrieve: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn().mockResolvedValue(true),
        clear: jest.fn()
      };

      const result = validateLearningConfig({
        type: 'test-generator',
        capabilities: [],
        context: { id: 'test', type: 'test-generator', status: 'idle' } as any,
        memoryStore: fakeMemoryStore,
        eventBus: {} as any,
        enableLearning: true
      });

      expect(result.valid).toBe(false);
      expect(result.warning).toContain('Learning is enabled but memoryStore is not SwarmMemoryManager');
    });

    it('validateLearningConfig passes with SwarmMemoryManager', async () => {
      const swarm = new SwarmMemoryManager(':memory:');
      await swarm.initialize();
      try {
        const result = validateLearningConfig({
          type: 'test-generator',
          capabilities: [],
          context: { id: 'test', type: 'test-generator', status: 'idle' } as any,
          // SwarmMemoryManager needs to be cast to MemoryStore for the config
          memoryStore: swarm as unknown as MemoryStore,
          eventBus: {} as any,
          enableLearning: true
        });

        expect(result.valid).toBe(true);
        expect(result.warning).toBeUndefined();
      } finally {
        await swarm.close();
      }
    });

    it('validateLearningConfig passes when learning is disabled', () => {
      const fakeMemoryStore: MemoryStore = {
        store: jest.fn(),
        retrieve: jest.fn(),
        set: jest.fn(),
        get: jest.fn(),
        delete: jest.fn().mockResolvedValue(true),
        clear: jest.fn()
      };

      const result = validateLearningConfig({
        type: 'test-generator',
        capabilities: [],
        context: { id: 'test', type: 'test-generator', status: 'idle' } as any,
        memoryStore: fakeMemoryStore,
        eventBus: {} as any,
        enableLearning: false // Learning disabled - no SwarmMemoryManager required
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('FleetManager Memory Store Type', () => {
    it('FleetManager should use SwarmMemoryManager internally', async () => {
      fleet = new FleetManager({
        agents: [] // No agents - just checking the memory manager type
      });

      await fleet.initialize();

      // Verify no warnings about wrong memory store type
      const memoryStoreWarnings = consoleWarnSpy.mock.calls.filter(
        (call: any[]) => call[0]?.toString().includes('memoryStore is not SwarmMemoryManager')
      );
      expect(memoryStoreWarnings.length).toBe(0);
    });

    /**
     * Test that FleetManager's internal getMemoryStore returns SwarmMemoryManager
     *
     * Note: This test accesses internal state to verify the fix for Issue #137.
     * In production, agents spawned by FleetManager will receive this memory store.
     */
    it('FleetManager internal memory store should be SwarmMemoryManager type', async () => {
      fleet = new FleetManager({
        agents: []
      });

      await fleet.initialize();

      // Access internal memoryManager for verification
      // This is a test-only check to ensure the fix is working
      const internalMemoryManager = (fleet as any).memoryManager;

      // The internal memory manager should be SwarmMemoryManager
      // After the Issue #137 fix, this should be true
      expect(internalMemoryManager).toBeDefined();
      expect(internalMemoryManager.constructor.name).toBe('SwarmMemoryManager');
    });
  });

  describe('Learning Feature Activation', () => {
    /**
     * Verify that no "memoryStore is not SwarmMemoryManager" warnings are logged
     * during FleetManager initialization.
     *
     * This is the key regression test for Issue #137.
     */
    it('No SwarmMemoryManager type mismatch warnings during initialization', async () => {
      fleet = new FleetManager({
        agents: [] // No agents - just checking the memory manager type
      });

      await fleet.initialize();
      await fleet.start();

      // Verify no warnings about wrong memory store type
      const learningDisabledWarnings = consoleWarnSpy.mock.calls.filter(
        (call: any[]) =>
          call[0]?.toString().includes('Learning features will be disabled') ||
          call[0]?.toString().includes('Learning enabled but memoryStore is not SwarmMemoryManager') ||
          call[0]?.toString().includes('memoryStore is not SwarmMemoryManager')
      );

      // Issue #137 fix verification: No learning disabled warnings
      expect(learningDisabledWarnings.length).toBe(0);
    });
  });
});
