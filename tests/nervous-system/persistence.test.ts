/**
 * Nervous System Persistence Tests
 *
 * Tests for serialization, storage, and restoration of nervous system state.
 *
 * @module tests/nervous-system/persistence
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Serializers
import {
  serializeHdcMemory,
  deserializeHdcMemory,
  validateHdcState,
  calculateHdcStateSize,
} from '../../src/nervous-system/persistence/HdcSerializer.js';
import {
  serializeBTSP,
  deserializeBTSP,
  validateBTSPState,
  createEmptyBTSPState,
} from '../../src/nervous-system/persistence/BTSPSerializer.js';
import {
  serializeCircadian,
  deserializeCircadian,
  validateCircadianState,
  createDefaultCircadianState,
  calculateEnergySavings,
} from '../../src/nervous-system/persistence/CircadianSerializer.js';

// Store
import {
  SQLiteNervousSystemStore,
  createSQLiteNervousSystemStore,
} from '../../src/nervous-system/persistence/SQLiteNervousSystemStore.js';

// Manager
import {
  NervousSystemPersistenceManager,
  createNervousSystemPersistenceManager,
} from '../../src/nervous-system/persistence/NervousSystemPersistenceManager.js';

// Adapters
import { HdcMemoryAdapter } from '../../src/nervous-system/adapters/HdcMemoryAdapter.js';
import { BTSPAdapter } from '../../src/nervous-system/adapters/BTSPAdapter.js';
import { CircadianController, createTestingController } from '../../src/nervous-system/adapters/CircadianController.js';
import { initNervousSystem, Hypervector } from '../../src/nervous-system/wasm-loader.js';

describe('Nervous System Persistence', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for test database files
    tempDir = mkdtempSync(join(tmpdir(), 'ns-persist-test-'));
    // Initialize WASM
    await initNervousSystem();
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('HdcSerializer', () => {
    it('should serialize HDC memory state with codebooks', async () => {
      // Create and initialize adapter
      const adapter = new HdcMemoryAdapter();
      await adapter.initialize();

      // Serialize
      const state = serializeHdcMemory(adapter);

      // Verify state structure
      expect(state.version).toBe(1);
      expect(state.dimension).toBe(10000);
      // Patterns are tracked separately; codebooks and role vectors are serialized
      expect(state.codebooks.type.length).toBeGreaterThan(0);
      expect(state.codebooks.domain.length).toBeGreaterThan(0);
      expect(state.codebooks.framework.length).toBeGreaterThan(0);
      expect(state.roleVectors.type).toBeDefined();
      expect(state.roleVectors.domain).toBeDefined();

      // Calculate size
      const size = calculateHdcStateSize(state);
      expect(size).toBeGreaterThan(0);

      // Cleanup
      adapter.dispose();
    });

    it('should deserialize HDC codebooks into new adapter', async () => {
      // Create and initialize source adapter
      const adapter1 = new HdcMemoryAdapter();
      await adapter1.initialize();

      // Serialize
      const state = serializeHdcMemory(adapter1);

      // Create new adapter and restore
      const adapter2 = new HdcMemoryAdapter();
      await adapter2.initialize();

      // Deserialize - restores codebooks and role vectors
      deserializeHdcMemory(state, adapter2, Hypervector);

      // Verify codebooks were restored by checking they exist
      const codebooks2 = adapter2.getCodebooks();
      expect(codebooks2.type.size).toBeGreaterThan(0);
      expect(codebooks2.domain.size).toBeGreaterThan(0);

      // Cleanup
      adapter1.dispose();
      adapter2.dispose();
    });
  });

  describe('BTSPSerializer', () => {
    it('should serialize and deserialize BTSP state', async () => {
      // Create and initialize adapter
      const adapter = new BTSPAdapter({
        inputSize: 64,
        outputSize: 32,
        learningRate: 0.01,
        plateauThreshold: 0.5,
        maxCapacity: 100,
      });
      await adapter.initialize();

      // Perform some learning
      const pattern = new Float32Array(64).fill(0.5);
      adapter.learnFromFailure(pattern, -0.8);

      // Serialize
      const state = serializeBTSP(adapter);

      // Validate state (returns { valid: boolean, errors: string[] })
      const validation = validateBTSPState(state);
      expect(validation.valid).toBe(true);
      expect(state.version).toBe(1);
      expect(state.associationCount).toBe(1);

      // Create new adapter and restore
      const adapter2 = new BTSPAdapter({
        inputSize: 64,
        outputSize: 32,
        learningRate: 0.01,
        plateauThreshold: 0.5,
        maxCapacity: 100,
      });
      await adapter2.initialize();

      deserializeBTSP(state, adapter2);

      // Verify association count restored
      expect(adapter2.getAssociationCount()).toBe(1);

      // Cleanup
      adapter.dispose();
      adapter2.dispose();
    });

    it('should create empty BTSP state', () => {
      const config = { inputSize: 64, outputSize: 32 };
      const state = createEmptyBTSPState(config);
      const validation = validateBTSPState(state);
      expect(validation.valid).toBe(true);
      expect(state.associationCount).toBe(0);
    });
  });

  describe('CircadianSerializer', () => {
    it('should serialize and deserialize Circadian state', async () => {
      // Create controller
      const controller = await CircadianController.create({
        cyclePeriodMs: 60000,
        useWasmPhaseSelection: true,
      });

      // Advance time to get some state
      controller.advance(5000);

      // Serialize
      const state = serializeCircadian(controller);

      // Validate state (returns { valid: boolean, errors: string[] })
      const validation = validateCircadianState(state);
      expect(validation.valid).toBe(true);
      expect(state.version).toBe(1);
      expect(state.state.phase).toBeDefined();

      // Create new controller and restore
      const controller2 = await CircadianController.create({
        cyclePeriodMs: 60000,
        useWasmPhaseSelection: true,
      });

      deserializeCircadian(state, controller2);

      // Verify state was restored (use getState().cycleTime)
      expect(controller2.getState().cycleTime).toBe(state.state.cycleTime);

      // Cleanup
      controller.dispose();
      controller2.dispose();
    });

    it('should create default Circadian state', () => {
      const state = createDefaultCircadianState();
      const validation = validateCircadianState(state);
      expect(validation.valid).toBe(true);
      expect(state.state.phase).toBe('Active');
    });

    it('should calculate energy savings', () => {
      const state = createDefaultCircadianState();
      state.metrics.totalEnergyConsumed = 100;
      const savings = calculateEnergySavings(state);
      // calculateEnergySavings returns { savingsPercentage: number, ... }
      expect(savings.savingsPercentage).toBeGreaterThanOrEqual(0);
    });
  });

  describe('SQLiteNervousSystemStore', () => {
    it('should store and load HDC state', async () => {
      const dbPath = join(tempDir, 'test.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      // Create mock HDC state
      const hdcState = {
        version: 1 as const,
        dimension: 10000,
        codebooks: { type: [], domain: [], framework: [] },
        roleVectors: {
          type: new Uint8Array(1250),
          domain: new Uint8Array(1250),
          content: new Uint8Array(1250),
          framework: new Uint8Array(1250),
        },
        patterns: [],
        serializedAt: Date.now(),
      };

      // Save
      await store.saveHdcState('test-agent', hdcState);

      // Load
      const loaded = await store.loadHdcState('test-agent');
      expect(loaded).not.toBeNull();
      expect(loaded?.dimension).toBe(10000);

      await store.shutdown();
    });

    it('should store and load BTSP state', async () => {
      const dbPath = join(tempDir, 'test-btsp.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      const btspState = createEmptyBTSPState({ inputSize: 64, outputSize: 32 });
      btspState.associationCount = 5;

      await store.saveBtspState('test-agent', btspState);

      const loaded = await store.loadBtspState('test-agent');
      expect(loaded).not.toBeNull();
      expect(loaded?.associationCount).toBe(5);

      await store.shutdown();
    });

    it('should store and load Circadian state', async () => {
      const dbPath = join(tempDir, 'test-circadian.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      const circadianState = createDefaultCircadianState();
      circadianState.state.phase = 'Rest';

      await store.saveCircadianState('test-agent', circadianState);

      const loaded = await store.loadCircadianState('test-agent');
      expect(loaded).not.toBeNull();
      expect(loaded?.state.phase).toBe('Rest');

      await store.shutdown();
    });

    it('should list agents with state', async () => {
      const dbPath = join(tempDir, 'test-list.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      // Save states for multiple agents
      await store.saveCircadianState('agent-1', createDefaultCircadianState());
      await store.saveCircadianState('agent-2', createDefaultCircadianState());

      const agents = await store.listAgents();
      expect(agents).toContain('agent-1');
      expect(agents).toContain('agent-2');

      await store.shutdown();
    });

    it('should delete agent state', async () => {
      const dbPath = join(tempDir, 'test-delete.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      await store.saveCircadianState('agent-to-delete', createDefaultCircadianState());
      await store.deleteAllState('agent-to-delete');

      const loaded = await store.loadCircadianState('agent-to-delete');
      expect(loaded).toBeNull();

      await store.shutdown();
    });
  });

  describe('NervousSystemPersistenceManager', () => {
    it('should coordinate persistence across components', async () => {
      const dbPath = join(tempDir, 'manager-test.db');
      const manager = createNervousSystemPersistenceManager({ dbPath });
      await manager.initialize();

      // Save circadian state
      const state = createDefaultCircadianState();
      state.state.phase = 'Dawn';
      await manager.saveCircadianState('coordinated-agent', state);

      // Load it back
      const loaded = await manager.loadCircadianState('coordinated-agent');
      expect(loaded?.state.phase).toBe('Dawn');

      // Get stats
      const stats = manager.getStats();
      expect(stats.initialized).toBe(true);
      expect(stats.storeType).toBe('sqlite');

      await manager.shutdown();
    });

    it('should support auto-save queuing', async () => {
      const dbPath = join(tempDir, 'autosave-test.db');
      const manager = createNervousSystemPersistenceManager({
        dbPath,
        autoSaveIntervalMs: 100, // Short interval for testing
      });
      await manager.initialize();

      // Register for auto-save
      manager.registerForAutoSave('auto-save-agent');

      // Queue state
      const state = createDefaultCircadianState();
      manager.queueStateForAutoSave('auto-save-agent', { circadian: state });

      // Wait for auto-save to trigger
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify state was saved
      const loaded = await manager.loadCircadianState('auto-save-agent');
      expect(loaded).not.toBeNull();

      manager.unregisterFromAutoSave('auto-save-agent');
      await manager.shutdown();
    });

    it('should emit events on state changes', async () => {
      const dbPath = join(tempDir, 'events-test.db');
      const manager = createNervousSystemPersistenceManager({ dbPath });
      await manager.initialize();

      const events: string[] = [];
      manager.on('state:saved', () => events.push('saved'));
      manager.on('state:loaded', () => events.push('loaded'));

      await manager.saveCircadianState('event-agent', createDefaultCircadianState());
      await manager.loadCircadianState('event-agent');

      expect(events).toContain('saved');
      expect(events).toContain('loaded');

      await manager.shutdown();
    });
  });

  describe('Round-trip Integration', () => {
    it('should round-trip HDC state through memory serialization', async () => {
      // Create real adapter with patterns
      const adapter = new HdcMemoryAdapter();
      await adapter.initialize();

      const pattern = adapter.createHypervector();
      adapter.store('roundtrip-test', pattern);

      // Serialize
      const state = serializeHdcMemory(adapter);
      expect(state.patterns.length).toBe(1);

      // Create new adapter and deserialize
      const adapter2 = new HdcMemoryAdapter();
      await adapter2.initialize();
      deserializeHdcMemory(state, adapter2, Hypervector);

      // Verify patterns match
      const patterns2 = adapter2.getStoredPatterns();
      expect(patterns2.has('roundtrip-test')).toBe(true);

      // Cleanup
      adapter.dispose();
      adapter2.dispose();
    });

    it('should round-trip BTSP state through SQLite', async () => {
      const dbPath = join(tempDir, 'roundtrip-btsp.db');
      const store = createSQLiteNervousSystemStore({ dbPath });
      await store.initialize();

      const adapter = new BTSPAdapter({ inputSize: 32, outputSize: 16 });
      await adapter.initialize();

      // Learn something
      adapter.learnFromFailure(new Float32Array(32).fill(0.3), -0.5);

      // Serialize and save
      const state = serializeBTSP(adapter);
      await store.saveBtspState('roundtrip-btsp', state);

      // Load and deserialize
      const loaded = await store.loadBtspState('roundtrip-btsp');
      expect(loaded).not.toBeNull();

      const adapter2 = new BTSPAdapter({ inputSize: 32, outputSize: 16 });
      await adapter2.initialize();
      deserializeBTSP(loaded!, adapter2);

      expect(adapter2.getAssociationCount()).toBe(1);

      // Cleanup
      adapter.dispose();
      adapter2.dispose();
      await store.shutdown();
    });
  });
});
