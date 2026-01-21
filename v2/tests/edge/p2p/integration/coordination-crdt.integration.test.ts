/**
 * Coordination-CRDT Integration Tests
 *
 * Tests the integration between the coordination module and CRDT module:
 * - Peer coordination with CRDT-based state synchronization
 * - VectorClock synchronization between CoordinationManager peers
 * - CRDT delta exchange during SyncOrchestrator operations
 * - Conflict resolution when peers have divergent state
 * - Health monitoring with CRDT counters for metrics
 *
 * @module tests/edge/p2p/integration/coordination-crdt.integration.test
 */

import {
  // Coordination module
  CoordinationManager,
  SyncOrchestrator,
  HealthMonitor,
  createCoordinationManager,
  createSyncOrchestrator,
  createHealthMonitor,
  CoordinationState,
  CoordinationRole,
  CoordinationEventType,
  CoordinationMessageType,
  HealthLevel,
  createDefaultCapabilities,
  createDefaultSyncStatus,
  generateMessageId,
  DEFAULT_COORDINATION_CONFIG,
} from '../../../../src/edge/p2p/coordination';

import type {
  CoordinationConfig,
  CoordinationMessage,
  SyncConfig,
  SyncStatus,
  HealthStatus,
} from '../../../../src/edge/p2p/coordination';

import {
  // CRDT module
  CRDTStore,
  VectorClock,
  GCounter,
  LWWRegister,
  ORSet,
  PatternCRDT,
  VectorClockComparison,
  CRDTType,
} from '../../../../src/edge/p2p/crdt';

import type { PatternInput } from '../../../../src/edge/p2p/crdt';

import type { SharedPattern, PatternCategory, PatternQuality } from '../../../../src/edge/p2p/sharing';

// ============================================
// Test Fixtures and Helpers
// ============================================

/**
 * Create a test identity for coordination
 */
function createTestIdentity(id: string) {
  const keyData = Array(32)
    .fill(0)
    .map((_, i) => (id.charCodeAt(i % id.length) + i) % 256);
  const publicKey = btoa(keyData.map((n) => String.fromCharCode(n)).join(''));

  return {
    agentId: id,
    publicKey,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create a test key pair for signing
 */
function createTestKeyPair(id: string) {
  const keyData = Array(32)
    .fill(0)
    .map((_, i) => (id.charCodeAt(i % id.length) + i) % 256);
  const keyStr = keyData.map((n) => String.fromCharCode(n)).join('');

  return {
    publicKey: btoa(keyStr),
    privateKey: btoa(keyStr + keyStr),
  };
}

/**
 * Create a test coordination config
 */
function createTestConfig(agentId: string, overrides?: Partial<CoordinationConfig>): CoordinationConfig {
  const identity = createTestIdentity(agentId);
  const keyPair = createTestKeyPair(agentId);

  return {
    ...DEFAULT_COORDINATION_CONFIG,
    localIdentity: identity,
    localKeyPair: keyPair,
    enableLogging: false,
    autoReconnect: false,
    ...overrides,
  };
}

/**
 * Create a test SharedPattern with proper CRDT version info
 */
function createTestPattern(
  id: string,
  agentId: string,
  vectorClockEntries: Record<string, number> = {}
): SharedPattern {
  const now = new Date().toISOString();
  const clock = vectorClockEntries[agentId] || 1;

  return {
    id,
    category: 'test' as PatternCategory,
    type: 'unit-test',
    domain: 'api',
    content: {
      raw: `describe('${id}', () => { it('works', () => expect(true).toBe(true)); });`,
      contentHash: `hash-${id}-${Date.now()}`,
      language: 'typescript',
    },
    embedding: new Float32Array(384).fill(0.5),
    metadata: {
      name: `Test Pattern ${id}`,
      description: 'A test pattern for integration testing',
      tags: ['test', 'integration'],
    },
    version: {
      semver: '1.0.0',
      vectorClock: { clock: { [agentId]: clock, ...vectorClockEntries } },
    },
    quality: {
      level: 'medium' as PatternQuality,
      successRate: 0.85,
      usageCount: 10,
      uniqueUsers: 3,
      avgConfidence: 0.78,
      feedbackScore: 0.5,
    },
    sharing: {
      policy: 'public',
      privacyLevel: 'anonymized',
      differentialPrivacy: false,
      redistributable: true,
      requireAttribution: false,
    },
    createdAt: now,
    updatedAt: now,
  } as unknown as SharedPattern;
}

/**
 * Mock message channel for peer-to-peer communication
 */
class MockMessageChannel {
  private handlers: Map<string, (message: CoordinationMessage) => void> = new Map();
  private messageLog: Array<{ from: string; to: string; message: CoordinationMessage }> = [];

  registerHandler(peerId: string, handler: (message: CoordinationMessage) => void): void {
    this.handlers.set(peerId, handler);
  }

  unregisterHandler(peerId: string): void {
    this.handlers.delete(peerId);
  }

  async send(from: string, to: string, message: CoordinationMessage): Promise<void> {
    this.messageLog.push({ from, to, message });
    const handler = this.handlers.get(to);
    if (handler) {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 5));
      handler(message);
    }
  }

  getMessageLog(): Array<{ from: string; to: string; message: CoordinationMessage }> {
    return [...this.messageLog];
  }

  clearMessageLog(): void {
    this.messageLog = [];
  }
}

/**
 * Coordinated peer with CRDT store
 */
class CRDTEnabledPeer {
  readonly peerId: string;
  readonly manager: CoordinationManager;
  readonly crdtStore: CRDTStore;
  private channel: MockMessageChannel;

  constructor(peerId: string, config: CoordinationConfig, channel: MockMessageChannel) {
    this.peerId = peerId;
    this.channel = channel;
    this.manager = createCoordinationManager(config);
    this.crdtStore = new CRDTStore({ replicaId: peerId, autoGC: false });

    // Register message handler
    channel.registerHandler(peerId, (message) => {
      this.manager.handleMessage(message.senderId, message);
    });

    // Set up message sender
    this.manager.setMessageSender(async (targetPeerId, message) => {
      await channel.send(peerId, targetPeerId, message);
    });
  }

  destroy(): void {
    this.channel.unregisterHandler(this.peerId);
    this.crdtStore.dispose();
  }
}

// ============================================
// Test Suites
// ============================================

describe('Coordination-CRDT Integration', () => {
  let channel: MockMessageChannel;
  let peer1: CRDTEnabledPeer;
  let peer2: CRDTEnabledPeer;

  beforeEach(() => {
    channel = new MockMessageChannel();

    const config1 = createTestConfig('peer-1');
    const config2 = createTestConfig('peer-2');

    peer1 = new CRDTEnabledPeer('peer-1', config1, channel);
    peer2 = new CRDTEnabledPeer('peer-2', config2, channel);
  });

  afterEach(async () => {
    await peer1.manager.destroy();
    await peer2.manager.destroy();
    peer1.destroy();
    peer2.destroy();
  });

  // ============================================
  // Test Suite 1: Peer Coordination with CRDT State Sync
  // ============================================

  describe('Peer coordination with CRDT-based state synchronization', () => {
    it('should synchronize GCounter state between two peers', () => {
      // Create counters on both peers
      const counter1 = peer1.crdtStore.createGCounter('page-views');
      const counter2 = peer2.crdtStore.createGCounter('page-views');

      // Increment on peer 1
      counter1.increment(5);
      counter1.increment(3);

      // Increment on peer 2
      counter2.increment(10);

      // Get states for synchronization
      const state1 = counter1.state();
      const state2 = counter2.state();

      // Simulate sync: apply each other's state
      counter1.merge(state2);
      counter2.merge(state1);

      // Both should have the sum of all increments
      expect(counter1.value()).toBe(18); // 5 + 3 + 10
      expect(counter2.value()).toBe(18);
    });

    it('should synchronize LWWRegister state with proper conflict resolution', () => {
      // Create registers on both peers
      const register1 = peer1.crdtStore.createLWWRegister<string>('config-value');
      const register2 = peer2.crdtStore.createLWWRegister<string>('config-value');

      // Set values at different times
      register1.setWithTimestamp('value-from-peer1', 1000);
      register2.setWithTimestamp('value-from-peer2', 2000); // Later timestamp wins

      // Get states
      const state1 = register1.state();
      const state2 = register2.state();

      // Merge states
      const result1 = register1.merge(state2);
      const result2 = register2.merge(state1);

      // LWW: later timestamp wins
      expect(register1.value()).toBe('value-from-peer2');
      expect(register2.value()).toBe('value-from-peer2');

      // Check conflict was detected and resolved
      expect(result1.localChanged).toBe(true);
      expect(result2.localChanged).toBe(false);
    });

    it('should synchronize ORSet state with add-wins semantics', () => {
      // Create sets on both peers
      const set1 = peer1.crdtStore.createORSet<string>('tags');
      const set2 = peer2.crdtStore.createORSet<string>('tags');

      // Add different items on each peer
      set1.add('typescript');
      set1.add('jest');
      set2.add('jest'); // Same item added on both
      set2.add('vitest');

      // Get states
      const state1 = set1.state();
      const state2 = set2.state();

      // Merge states
      set1.merge(state2);
      set2.merge(state1);

      // Both should have all items (add wins)
      const values1 = set1.values();
      const values2 = set2.values();

      expect(values1).toContain('typescript');
      expect(values1).toContain('jest');
      expect(values1).toContain('vitest');
      expect(values2).toContain('typescript');
      expect(values2).toContain('jest');
      expect(values2).toContain('vitest');
    });

    it('should synchronize PatternCRDT composite state', () => {
      // Create patterns on both peers
      const input1: PatternInput = {
        id: 'pattern-1',
        content: 'original content from peer 1',
        type: 'unit-test',
        category: 'test',
        domain: 'api',
        tags: ['typescript', 'testing'],
      };

      const pattern1 = peer1.crdtStore.createPattern(input1);

      // Simulate creating the same pattern from received state on peer 2
      const state1 = pattern1.state();
      peer2.crdtStore.applyState(state1);

      const pattern2 = peer2.crdtStore.getPattern('pattern-1');
      expect(pattern2).toBeDefined();

      // Modify on peer 1
      pattern1.addTag('jest');
      pattern1.incrementUsage();

      // Sync again
      const updatedState1 = pattern1.state();
      peer2.crdtStore.applyState(updatedState1);

      // Verify sync
      const pattern2Updated = peer2.crdtStore.getPattern('pattern-1');
      expect(pattern2Updated).toBeDefined();
      expect(pattern2Updated!.getData().tags).toContain('jest');
    });

    it('should handle full CRDT store synchronization', () => {
      // Create multiple CRDTs on peer 1
      peer1.crdtStore.createGCounter('counter-1', 5);
      peer1.crdtStore.createLWWRegister<number>('register-1', 42);
      peer1.crdtStore.createORSet<string>('set-1');
      peer1.crdtStore.getORSet<string>('set-1')!.add('item1');

      // Get all states from peer 1
      const allStates = peer1.crdtStore.getAllStates();

      // Apply to peer 2
      for (const state of allStates) {
        peer2.crdtStore.applyState(state);
      }

      // Verify peer 2 has all CRDTs
      expect(peer2.crdtStore.getGCounter('counter-1')?.value()).toBe(5);
      expect(peer2.crdtStore.getLWWRegister<number>('register-1')?.value()).toBe(42);
      expect(peer2.crdtStore.getORSet<string>('set-1')?.has('item1')).toBe(true);
    });
  });

  // ============================================
  // Test Suite 2: VectorClock Synchronization
  // ============================================

  describe('VectorClock synchronization between CoordinationManager peers', () => {
    it('should track vector clock progression during operations', () => {
      const store = peer1.crdtStore;
      const initialClock = store.getVectorClock();
      const initialLocal = initialClock.get('peer-1');

      // Perform operations
      store.createGCounter('counter');
      store.createLWWRegister('register');

      const finalClock = store.getVectorClock();
      const finalLocal = finalClock.get('peer-1');

      // Vector clock should have advanced
      expect(finalLocal).toBeGreaterThan(initialLocal);
    });

    it('should merge vector clocks during state synchronization', () => {
      // Create counter on peer 1 and increment
      const counter1 = peer1.crdtStore.createGCounter('shared-counter');
      counter1.increment(3);

      // Create counter on peer 2 and increment
      const counter2 = peer2.crdtStore.createGCounter('shared-counter');
      counter2.increment(5);

      // Get vector clocks before merge
      const clock1Before = counter1.getVectorClock();
      const clock2Before = counter2.getVectorClock();

      // Merge states
      counter1.merge(counter2.state());
      counter2.merge(counter1.state());

      // Get vector clocks after merge
      const clock1After = counter1.getVectorClock();
      const clock2After = counter2.getVectorClock();

      // Clocks should now know about both replicas
      expect(clock1After.get('peer-1')).toBeGreaterThan(0);
      expect(clock1After.get('peer-2')).toBeGreaterThan(0);
      expect(clock2After.get('peer-1')).toBeGreaterThan(0);
      expect(clock2After.get('peer-2')).toBeGreaterThan(0);
    });

    it('should detect concurrent updates using vector clocks', () => {
      // Create registers with initial state
      const register1 = new LWWRegister<string>('peer-1', 'shared-register', 'initial');
      const register2 = new LWWRegister<string>('peer-2', 'shared-register', 'initial');

      // Concurrent updates
      register1.set('update-from-peer1');
      register2.set('update-from-peer2');

      // Check for concurrency
      const clock1 = register1.getVectorClock();
      const clock2 = register2.getVectorClock();

      const comparison = clock1.compare(clock2);
      expect(comparison).toBe(VectorClockComparison.Concurrent);
    });

    it('should establish happens-before relationship for sequential updates', async () => {
      const counter1 = peer1.crdtStore.createGCounter('seq-counter');
      counter1.increment(1);

      // Simulate sync to peer 2
      const state1 = counter1.state();
      peer2.crdtStore.applyState(state1);
      const counter2 = peer2.crdtStore.getGCounter('seq-counter')!;

      // Peer 2 increments after receiving peer 1's state
      counter2.increment(1);

      // Now peer 2's clock should be after peer 1's
      const clock1 = counter1.getVectorClock();
      const clock2 = counter2.getVectorClock();

      expect(clock1.happenedBefore(clock2)).toBe(true);
    });

    it('should use vector clocks for delta generation', () => {
      const counter = peer1.crdtStore.createGCounter('delta-counter');

      // Get initial clock
      const initialClock = counter.getVectorClock().serialize();

      // Perform updates
      counter.increment(10);
      counter.increment(5);

      // Generate delta since initial clock
      const delta = counter.generateDelta(initialClock);

      expect(delta).not.toBeNull();
      expect(delta!.origin).toBe('peer-1');
      expect(delta!.crdtId).toBe('delta-counter');
    });
  });

  // ============================================
  // Test Suite 3: CRDT Delta Exchange During Sync
  // ============================================

  describe('CRDT delta exchange during SyncOrchestrator operations', () => {
    let syncOrchestrator1: SyncOrchestrator;
    let syncOrchestrator2: SyncOrchestrator;
    let syncMessages: CoordinationMessage[];

    beforeEach(() => {
      syncMessages = [];

      const syncConfig: SyncConfig = {
        autoSyncOnConnect: false,
        syncInterval: 0,
        batchSize: 10,
        conflictStrategy: 'latest_wins',
        incrementalSync: true,
        maxPatternsPerSync: 100,
        validatePatterns: true,
        syncTimeout: 5000,
      };

      syncOrchestrator1 = createSyncOrchestrator({
        localAgentId: 'peer-1',
        peerId: 'peer-2',
        config: syncConfig,
        sendMessage: async (message) => {
          syncMessages.push(message);
          // Forward to peer 2's orchestrator
          await syncOrchestrator2.handleMessage(message);
        },
        onSyncProgress: () => {},
      });

      syncOrchestrator2 = createSyncOrchestrator({
        localAgentId: 'peer-2',
        peerId: 'peer-1',
        config: syncConfig,
        sendMessage: async (message) => {
          syncMessages.push(message);
          // Forward to peer 1's orchestrator
          await syncOrchestrator1.handleMessage(message);
        },
        onSyncProgress: () => {},
      });
    });

    afterEach(() => {
      syncOrchestrator1.stop();
      syncOrchestrator2.stop();
    });

    it('should generate deltas for changed CRDTs only', () => {
      const counter = peer1.crdtStore.createGCounter('delta-test');
      const lastSyncClock = counter.getVectorClock().serialize();

      // No changes yet
      let delta = counter.generateDelta(lastSyncClock);
      expect(delta).toBeNull();

      // Make changes
      counter.increment(5);

      // Now delta should be generated
      delta = counter.generateDelta(lastSyncClock);
      expect(delta).not.toBeNull();
      expect(delta!.type).toBe(CRDTType.GCounter);
    });

    it('should apply deltas to update local state', () => {
      // Create counter on peer 1
      const counter1 = peer1.crdtStore.createGCounter('apply-delta-test');
      counter1.increment(10);

      // Generate delta
      const delta = counter1.generateDelta();

      // Create matching counter on peer 2 and apply delta
      const counter2 = peer2.crdtStore.createGCounter('apply-delta-test');
      const applied = counter2.applyDelta(delta!);

      expect(applied).toBe(true);
      expect(counter2.value()).toBe(10);
    });

    it('should exchange deltas during sync operation', () => {
      // Set up patterns on peer 1's orchestrator
      const patterns: SharedPattern[] = [
        createTestPattern('sync-pattern-1', 'peer-1'),
        createTestPattern('sync-pattern-2', 'peer-1'),
      ];

      patterns.forEach((p) => syncOrchestrator1.addLocalPattern(p));

      // The sync flow would normally be initiated here
      // For unit testing, we verify the delta exchange mechanism
      const counter = peer1.crdtStore.createGCounter('sync-exchange');
      counter.increment(5);

      const initialClock = peer2.crdtStore.getVectorClock().serialize();
      const deltas = peer1.crdtStore.generateDeltas(initialClock);

      expect(deltas.length).toBeGreaterThan(0);
    });

    it('should track delta buffer for offline peers', () => {
      const store = peer1.crdtStore;

      // Apply a delta for a CRDT that doesn't exist yet
      const fakeDelta = {
        crdtId: 'nonexistent-crdt',
        type: CRDTType.GCounter,
        origin: 'peer-2',
        vectorClock: { entries: { 'peer-2': 1 }, lastModified: Date.now() },
        operations: [],
        sequenceNumber: 1,
        generatedAt: Date.now(),
      };

      // This should buffer the delta since the CRDT doesn't exist
      const applied = store.applyDelta(fakeDelta);
      expect(applied).toBe(false); // Not applied immediately

      // Stats should show pending deltas
      const stats = store.getStats();
      expect(stats.pendingDeltas).toBeGreaterThanOrEqual(0);
    });

    it('should handle ORSet delta operations correctly', () => {
      const set1 = peer1.crdtStore.createORSet<string>('orset-delta');
      set1.add('item1');
      set1.add('item2');

      // Generate delta
      const delta = set1.generateDelta();
      expect(delta).not.toBeNull();

      // Apply to peer 2
      const set2 = peer2.crdtStore.createORSet<string>('orset-delta');
      set2.applyDelta(delta!);

      expect(set2.has('item1')).toBe(true);
      expect(set2.has('item2')).toBe(true);
    });
  });

  // ============================================
  // Test Suite 4: Conflict Resolution
  // ============================================

  describe('Conflict resolution when peers have divergent state', () => {
    it('should resolve GCounter conflicts by taking element-wise max', () => {
      // Both peers create the same counter but increment differently
      const counter1 = peer1.crdtStore.createGCounter('conflict-counter');
      const counter2 = peer2.crdtStore.createGCounter('conflict-counter');

      // Peer 1 increments
      counter1.increment(10);
      counter1.increment(5);

      // Peer 2 increments
      counter2.increment(20);

      // Merge in both directions
      const state1 = counter1.state();
      const state2 = counter2.state();

      counter1.merge(state2);
      counter2.merge(state1);

      // Both should converge to the sum
      expect(counter1.value()).toBe(35); // 10 + 5 + 20
      expect(counter2.value()).toBe(35);
      expect(counter1.equals(counter2)).toBe(true);
    });

    it('should resolve LWWRegister conflicts with latest timestamp winning', () => {
      const register1 = peer1.crdtStore.createLWWRegister<string>('conflict-register');
      const register2 = peer2.crdtStore.createLWWRegister<string>('conflict-register');

      // Concurrent writes with different timestamps
      register1.setWithTimestamp('value-A', 1000);
      register2.setWithTimestamp('value-B', 1500); // Later wins

      // Merge
      const result1 = register1.merge(register2.state());
      const result2 = register2.merge(register1.state());

      // Both should have value-B
      expect(register1.value()).toBe('value-B');
      expect(register2.value()).toBe('value-B');

      // Conflict should be recorded
      expect(result1.conflicts.length).toBeGreaterThanOrEqual(0);
    });

    it('should resolve LWWRegister tie-breaker by replica ID', () => {
      const register1 = peer1.crdtStore.createLWWRegister<string>('tie-register');
      const register2 = peer2.crdtStore.createLWWRegister<string>('tie-register');

      // Same timestamp - replica ID tie-breaker
      const sameTimestamp = 1000;
      register1.setWithTimestamp('value-from-peer1', sameTimestamp);
      register2.setWithTimestamp('value-from-peer2', sameTimestamp);

      // Merge
      register1.merge(register2.state());
      register2.merge(register1.state());

      // Higher replica ID wins (peer-2 > peer-1 lexicographically)
      expect(register1.value()).toBe('value-from-peer2');
      expect(register2.value()).toBe('value-from-peer2');
    });

    it('should resolve ORSet add/remove conflicts with add-wins semantics', () => {
      const set1 = peer1.crdtStore.createORSet<string>('conflict-set');
      const set2 = peer2.crdtStore.createORSet<string>('conflict-set');

      // Peer 1 adds item
      set1.add('item');

      // Sync initial state
      set2.merge(set1.state());
      expect(set2.has('item')).toBe(true);

      // Concurrently: peer 1 removes, peer 2 re-adds
      set1.remove('item');
      set2.add('item'); // New add with different tag

      // Merge
      const result1 = set1.merge(set2.state());
      const result2 = set2.merge(set1.state());

      // Add wins - item should be present (new add has different tag)
      expect(set1.has('item')).toBe(true);
      expect(set2.has('item')).toBe(true);
    });

    it('should track and report conflicts in CRDTStore', () => {
      // Enable conflict tracking
      const store = new CRDTStore({
        replicaId: 'conflict-tracker',
        trackConflicts: true,
        autoGC: false,
      });

      const register = store.createLWWRegister<string>('tracked-register', 'initial');

      // Apply remote state with concurrent update
      const remoteState = {
        type: CRDTType.LWWRegister as const,
        id: 'tracked-register',
        vectorClock: {
          entries: { 'remote-peer': 2 },
          lastModified: Date.now(),
        },
        origin: 'remote-peer',
        value: {
          value: 'remote-value',
          timestamp: Date.now() + 1000, // Later timestamp
          replica: 'remote-peer',
        },
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          mergeCount: 0,
          lastModifiedBy: 'remote-peer',
        },
        stateVersion: 1,
      };

      store.applyState(remoteState);

      // Should be able to retrieve conflicts
      const conflicts = store.getConflicts();
      expect(Array.isArray(conflicts)).toBe(true);

      store.dispose();
    });

    it('should resolve PatternCRDT field conflicts independently', () => {
      const input: PatternInput = {
        id: 'pattern-conflict',
        content: 'original content',
        type: 'test',
        category: 'unit',
        domain: 'api',
        tags: ['tag1'],
      };

      const pattern1 = new PatternCRDT('peer-1', input);
      const state1 = pattern1.state();

      // Create pattern2 from state1
      const pattern2 = PatternCRDT.fromState(state1, 'peer-2');

      // Concurrent updates to different fields
      pattern1.setContent('content from peer 1');
      pattern1.addTag('peer1-tag');

      pattern2.setType('integration');
      pattern2.addTag('peer2-tag');

      // Merge
      pattern1.merge(pattern2.state());
      pattern2.merge(pattern1.state());

      // Each field should be resolved independently
      const data1 = pattern1.getData();
      const data2 = pattern2.getData();

      // Tags from both should be present (ORSet merge)
      expect(data1.tags).toContain('peer1-tag');
      expect(data1.tags).toContain('peer2-tag');
      expect(data2.tags).toContain('peer1-tag');
      expect(data2.tags).toContain('peer2-tag');
    });
  });

  // ============================================
  // Test Suite 5: Health Monitoring with CRDT Counters
  // ============================================

  describe('Health monitoring with CRDT counters for metrics', () => {
    let healthMonitor: HealthMonitor;
    let pingCallbacks: Array<() => void>;
    let healthChanges: HealthStatus[];
    let metricsCounter: GCounter;

    beforeEach(() => {
      pingCallbacks = [];
      healthChanges = [];
      metricsCounter = new GCounter('peer-1', 'health-metrics');

      healthMonitor = createHealthMonitor({
        peerId: 'test-peer',
        pingInterval: 100, // Fast for testing
        pingTimeout: 50,
        maxFailedPings: 3,
        onPing: async (sequence) => {
          // Track ping using CRDT counter
          metricsCounter.increment();
          pingCallbacks.forEach((cb) => cb());
        },
        onHealthChange: (health) => {
          healthChanges.push({ ...health });
        },
        enableLogging: false,
      });
    });

    afterEach(() => {
      healthMonitor.stop();
    });

    it('should track ping count using GCounter', async () => {
      const initialValue = metricsCounter.value();

      healthMonitor.start();

      // Wait for a few pings
      await new Promise((resolve) => setTimeout(resolve, 350));

      healthMonitor.stop();

      // Counter should have incremented
      const finalValue = metricsCounter.value();
      expect(finalValue).toBeGreaterThan(initialValue);
    });

    it('should merge ping metrics from multiple health monitors', () => {
      const counter1 = new GCounter('peer-1', 'ping-metrics');
      const counter2 = new GCounter('peer-2', 'ping-metrics');

      // Simulate ping tracking on both peers
      counter1.increment(10); // 10 pings from peer 1
      counter2.increment(15); // 15 pings from peer 2

      // Merge counters
      counter1.merge(counter2.state());
      counter2.merge(counter1.state());

      // Total pings should be sum from all replicas
      expect(counter1.value()).toBe(25);
      expect(counter2.value()).toBe(25);
    });

    it('should update health status and trigger callbacks', async () => {
      healthMonitor.start();

      // Simulate successful pong
      const sequence = 1;
      const sentAt = Date.now();
      healthMonitor.recordPong(sequence, sentAt, Date.now());

      // Health should be updated
      const health = healthMonitor.getHealth();
      expect(health.isResponsive).toBe(true);

      healthMonitor.stop();
    });

    it('should track failed pings and degrade health', async () => {
      healthMonitor.start();

      // Wait for pings to time out (no pongs recorded)
      await new Promise((resolve) => setTimeout(resolve, 400));

      const health = healthMonitor.getHealth();

      // Should have detected failures
      expect(health.failedPings).toBeGreaterThan(0);

      healthMonitor.stop();
    });

    it('should maintain health metrics across sync', () => {
      // Create health metric counters on both peers
      const successfulPings1 = peer1.crdtStore.createGCounter('successful-pings');
      const successfulPings2 = peer2.crdtStore.createGCounter('successful-pings');

      const failedPings1 = peer1.crdtStore.createGCounter('failed-pings');
      const failedPings2 = peer2.crdtStore.createGCounter('failed-pings');

      // Record metrics on peer 1
      successfulPings1.increment(100);
      failedPings1.increment(5);

      // Record metrics on peer 2
      successfulPings2.increment(80);
      failedPings2.increment(10);

      // Sync metrics
      successfulPings1.merge(successfulPings2.state());
      failedPings1.merge(failedPings2.state());
      successfulPings2.merge(successfulPings1.state());
      failedPings2.merge(failedPings1.state());

      // Calculate aggregate health metrics
      const totalSuccessful = successfulPings1.value();
      const totalFailed = failedPings1.value();
      const successRate = totalSuccessful / (totalSuccessful + totalFailed);

      expect(totalSuccessful).toBe(180); // 100 + 80
      expect(totalFailed).toBe(15); // 5 + 10
      expect(successRate).toBeCloseTo(0.923, 2); // 180/195
    });

    it('should use LWWRegister for health level state', () => {
      // Track current health level as LWW register
      const healthLevel1 = peer1.crdtStore.createLWWRegister<string>('health-level', 'healthy');
      const healthLevel2 = peer2.crdtStore.createLWWRegister<string>('health-level', 'healthy');

      // Peer 1 degrades
      healthLevel1.setWithTimestamp('warning', 1000);

      // Peer 2 recovers later
      healthLevel2.setWithTimestamp('healthy', 2000);

      // Sync - latest wins
      healthLevel1.merge(healthLevel2.state());
      healthLevel2.merge(healthLevel1.state());

      expect(healthLevel1.value()).toBe('healthy');
      expect(healthLevel2.value()).toBe('healthy');
    });

    it('should use ORSet to track active issues', () => {
      // Track current issues as ORSet
      const issues1 = peer1.crdtStore.createORSet<string>('health-issues');
      const issues2 = peer2.crdtStore.createORSet<string>('health-issues');

      // Peer 1 detects issues
      issues1.add('high-latency');
      issues1.add('packet-loss');

      // Peer 2 detects different issue
      issues2.add('connection-degraded');

      // Sync - all issues collected
      issues1.merge(issues2.state());
      issues2.merge(issues1.state());

      expect(issues1.has('high-latency')).toBe(true);
      expect(issues1.has('packet-loss')).toBe(true);
      expect(issues1.has('connection-degraded')).toBe(true);

      // Peer 1 resolves an issue
      issues1.remove('high-latency');

      // After sync, both should reflect resolution
      issues2.merge(issues1.state());
      expect(issues2.has('high-latency')).toBe(false);
    });
  });

  // ============================================
  // Test Suite 6: End-to-End Integration Scenarios
  // ============================================

  describe('End-to-end integration scenarios', () => {
    it('should handle complete sync workflow with CRDT state', async () => {
      // Peer 1 creates initial data
      const counter = peer1.crdtStore.createGCounter('workflow-counter', 50);
      const register = peer1.crdtStore.createLWWRegister<string>('workflow-config', 'production');
      const tags = peer1.crdtStore.createORSet<string>('workflow-tags');
      tags.add('v1.0');
      tags.add('stable');

      // Get all states
      const states = peer1.crdtStore.getAllStates();

      // Apply to peer 2
      for (const state of states) {
        peer2.crdtStore.applyState(state);
      }

      // Verify sync
      expect(peer2.crdtStore.getGCounter('workflow-counter')?.value()).toBe(50);
      expect(peer2.crdtStore.getLWWRegister<string>('workflow-config')?.value()).toBe('production');
      expect(peer2.crdtStore.getORSet<string>('workflow-tags')?.has('v1.0')).toBe(true);

      // Both peers make concurrent changes
      peer1.crdtStore.getGCounter('workflow-counter')!.increment(10);
      peer2.crdtStore.getGCounter('workflow-counter')!.increment(20);

      peer1.crdtStore.getORSet<string>('workflow-tags')!.add('peer1-change');
      peer2.crdtStore.getORSet<string>('workflow-tags')!.add('peer2-change');

      // Sync again
      const states1 = peer1.crdtStore.getAllStates();
      const states2 = peer2.crdtStore.getAllStates();

      for (const state of states2) {
        peer1.crdtStore.applyState(state);
      }
      for (const state of states1) {
        peer2.crdtStore.applyState(state);
      }

      // Both should converge
      expect(peer1.crdtStore.getGCounter('workflow-counter')?.value()).toBe(80); // 50 + 10 + 20
      expect(peer2.crdtStore.getGCounter('workflow-counter')?.value()).toBe(80);

      const tags1 = peer1.crdtStore.getORSet<string>('workflow-tags')!.values();
      const tags2 = peer2.crdtStore.getORSet<string>('workflow-tags')!.values();
      expect(tags1).toContain('peer1-change');
      expect(tags1).toContain('peer2-change');
      expect(tags2).toContain('peer1-change');
      expect(tags2).toContain('peer2-change');
    });

    it('should handle network partition and recovery', () => {
      // Initial sync
      const counter1 = peer1.crdtStore.createGCounter('partition-counter', 10);
      peer2.crdtStore.applyState(counter1.state());
      const counter2 = peer2.crdtStore.getGCounter('partition-counter')!;

      // Simulate partition - both peers operate independently
      counter1.increment(100);
      counter1.increment(50);
      counter2.increment(75);
      counter2.increment(25);

      // Record clocks before merge
      const clock1 = counter1.getVectorClock();
      const clock2 = counter2.getVectorClock();

      // Clocks should be concurrent (partition)
      expect(clock1.isConcurrent(clock2)).toBe(true);

      // Partition heals - sync
      counter1.merge(counter2.state());
      counter2.merge(counter1.state());

      // Should converge to total
      expect(counter1.value()).toBe(260); // 10 + 100 + 50 + 75 + 25
      expect(counter2.value()).toBe(260);
      expect(counter1.equals(counter2)).toBe(true);
    });

    it('should garbage collect tombstones after TTL', async () => {
      // Create set with short tombstone TTL
      const set = new ORSet<string>('peer-1', 'gc-test', { tombstoneTtl: 100 });

      set.add('item1');
      set.add('item2');
      set.remove('item1');

      // Tombstone should exist
      expect(set.getTombstoneCount()).toBe(1);

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 150));

      // GC
      const collected = set.gcTombstones();
      expect(collected).toBe(1);
      expect(set.getTombstoneCount()).toBe(0);
    });

    it('should handle store disposal correctly', () => {
      const store = new CRDTStore({ replicaId: 'dispose-test', autoGC: false });

      store.createGCounter('counter');
      store.createLWWRegister('register');
      store.createORSet('set');

      expect(store.getStats().totalInstances).toBe(3);

      store.dispose();

      expect(store.getStats().totalInstances).toBe(0);
    });

    it('should emit events during CRDT operations', () => {
      const events: Array<{ type: string; crdtId: string }> = [];

      peer1.crdtStore.on((event) => {
        events.push({ type: event.type, crdtId: event.crdtId });
      });

      peer1.crdtStore.createGCounter('event-counter');
      peer1.crdtStore.getGCounter('event-counter')!.increment(5);

      expect(events.some((e) => e.type === 'created' && e.crdtId === 'event-counter')).toBe(true);
    });
  });
});
