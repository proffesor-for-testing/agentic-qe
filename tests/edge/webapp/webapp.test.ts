/**
 * Web App Tests
 *
 * Tests for the @ruvector/edge web dashboard.
 *
 * @module tests/edge/webapp/webapp.test
 */

// Jest test suite
import {
  dashboardReducer,
  initialState,
  actions,
  selectors,
} from '../../../src/edge/webapp/store/dashboardReducer';
import type {
  DashboardState,
  AgentInfo,
  PeerInfo,
  PatternStats,
  CRDTState,
  SystemMetrics,
} from '../../../src/edge/webapp/types';

// ============================================
// Dashboard Reducer Tests
// ============================================

describe('Dashboard Reducer', () => {
  describe('initialState', () => {
    it('should have correct initial values', () => {
      expect(initialState.connectionStatus).toBe('disconnected');
      expect(initialState.localAgent).toBeNull();
      expect(initialState.peers).toHaveLength(0);
      expect(initialState.patterns.total).toBe(0);
      expect(initialState.crdt.stores).toHaveLength(0);
      expect(initialState.tests.running).toHaveLength(0);
    });
  });

  describe('SET_CONNECTION_STATUS', () => {
    it('should update connection status', () => {
      const newState = dashboardReducer(
        initialState,
        actions.setConnectionStatus('connected')
      );
      expect(newState.connectionStatus).toBe('connected');
    });

    it('should preserve other state', () => {
      const stateWithPeers: DashboardState = {
        ...initialState,
        peers: [{ id: 'test-peer' } as PeerInfo],
      };
      const newState = dashboardReducer(
        stateWithPeers,
        actions.setConnectionStatus('connected')
      );
      expect(newState.peers).toHaveLength(1);
    });
  });

  describe('SET_LOCAL_AGENT', () => {
    it('should set local agent info', () => {
      const agent: AgentInfo = {
        id: 'agent-123',
        publicKey: 'pk-abc',
        createdAt: Date.now(),
        capabilities: ['p2p', 'crdt'],
      };
      const newState = dashboardReducer(
        initialState,
        actions.setLocalAgent(agent)
      );
      expect(newState.localAgent).toEqual(agent);
    });
  });

  describe('Peer Management', () => {
    const testPeer: PeerInfo = {
      id: 'peer-1',
      publicKey: 'pk-peer-1',
      connectionState: 'connected',
      latencyMs: 25,
      lastSeen: Date.now(),
      patternsShared: 5,
    };

    it('should add peer', () => {
      const newState = dashboardReducer(
        initialState,
        actions.addPeer(testPeer)
      );
      expect(newState.peers).toHaveLength(1);
      expect(newState.peers[0].id).toBe('peer-1');
    });

    it('should update peer', () => {
      const stateWithPeer: DashboardState = {
        ...initialState,
        peers: [testPeer],
      };
      const newState = dashboardReducer(
        stateWithPeer,
        actions.updatePeer('peer-1', { latencyMs: 50, patternsShared: 10 })
      );
      expect(newState.peers[0].latencyMs).toBe(50);
      expect(newState.peers[0].patternsShared).toBe(10);
    });

    it('should remove peer', () => {
      const stateWithPeer: DashboardState = {
        ...initialState,
        peers: [testPeer],
      };
      const newState = dashboardReducer(
        stateWithPeer,
        actions.removePeer('peer-1')
      );
      expect(newState.peers).toHaveLength(0);
    });

    it('should not update non-existent peer', () => {
      const stateWithPeer: DashboardState = {
        ...initialState,
        peers: [testPeer],
      };
      const newState = dashboardReducer(
        stateWithPeer,
        actions.updatePeer('non-existent', { latencyMs: 100 })
      );
      expect(newState.peers[0].latencyMs).toBe(25);
    });
  });

  describe('UPDATE_PATTERNS', () => {
    it('should update pattern stats', () => {
      const stats: PatternStats = {
        total: 100,
        local: 80,
        synced: 20,
        pending: 5,
        categories: { test: 50, security: 30, performance: 20 },
      };
      const newState = dashboardReducer(
        initialState,
        actions.updatePatterns(stats)
      );
      expect(newState.patterns.total).toBe(100);
      expect(newState.patterns.categories.test).toBe(50);
    });
  });

  describe('UPDATE_CRDT', () => {
    it('should update CRDT state', () => {
      const crdtState: CRDTState = {
        stores: [
          { id: 'store-1', type: 'GCounter', size: 100, version: 5 },
        ],
        totalOperations: 50,
        conflictsResolved: 2,
        lastSync: Date.now(),
      };
      const newState = dashboardReducer(
        initialState,
        actions.updateCRDT(crdtState)
      );
      expect(newState.crdt.stores).toHaveLength(1);
      expect(newState.crdt.totalOperations).toBe(50);
    });
  });

  describe('Test Management', () => {
    it('should add test', () => {
      const test = {
        id: 'test-1',
        name: 'Test Suite 1',
        status: 'running' as const,
        progress: 50,
        startedAt: Date.now(),
      };
      const newState = dashboardReducer(
        initialState,
        actions.addTest(test)
      );
      expect(newState.tests.running).toHaveLength(1);
    });

    it('should complete test', () => {
      const runningTest = {
        id: 'test-1',
        name: 'Test Suite 1',
        status: 'running' as const,
        progress: 100,
        startedAt: Date.now() - 5000,
      };
      const stateWithTest: DashboardState = {
        ...initialState,
        tests: {
          ...initialState.tests,
          running: [runningTest],
        },
      };
      const result = {
        id: 'test-1',
        name: 'Test Suite 1',
        status: 'passed' as const,
        duration: 5000,
        passed: 10,
        failed: 0,
        total: 10,
      };
      const newState = dashboardReducer(
        stateWithTest,
        actions.completeTest(result)
      );
      expect(newState.tests.running).toHaveLength(0);
      expect(newState.tests.completed).toHaveLength(1);
      expect(newState.tests.completed[0].status).toBe('passed');
    });
  });

  describe('UPDATE_METRICS', () => {
    it('should update system metrics', () => {
      const metrics: SystemMetrics = {
        memoryUsage: 256,
        cpuUsage: 45,
        networkLatency: 30,
        messagesPerSecond: 100,
        uptime: 3600000,
      };
      const newState = dashboardReducer(
        initialState,
        actions.updateMetrics(metrics)
      );
      expect(newState.metrics.memoryUsage).toBe(256);
      expect(newState.metrics.uptime).toBe(3600000);
    });
  });

  describe('RESET', () => {
    it('should reset to initial state', () => {
      const modifiedState: DashboardState = {
        ...initialState,
        connectionStatus: 'connected',
        peers: [{ id: 'test' } as PeerInfo],
        patterns: { ...initialState.patterns, total: 100 },
      };
      const newState = dashboardReducer(modifiedState, actions.reset());
      expect(newState).toEqual(initialState);
    });
  });
});

// ============================================
// Selectors Tests
// ============================================

describe('Dashboard Selectors', () => {
  const connectedState: DashboardState = {
    ...initialState,
    connectionStatus: 'connected',
    peers: [
      { id: 'peer-1', connectionState: 'connected' } as PeerInfo,
      { id: 'peer-2', connectionState: 'disconnected' } as PeerInfo,
    ],
    patterns: { total: 100, local: 80, synced: 20, pending: 5, categories: {} },
    crdt: { stores: [{ id: 's1' } as any], totalOperations: 10, conflictsResolved: 1, lastSync: 0 },
    metrics: { ...initialState.metrics, uptime: 3661000, memoryUsage: 256 },
  };

  describe('isConnected', () => {
    it('should return true when connected', () => {
      expect(selectors.isConnected(connectedState)).toBe(true);
    });

    it('should return false when disconnected', () => {
      expect(selectors.isConnected(initialState)).toBe(false);
    });
  });

  describe('getPeerCount', () => {
    it('should return total peer count', () => {
      expect(selectors.getPeerCount(connectedState)).toBe(2);
    });

    it('should return 0 for no peers', () => {
      expect(selectors.getPeerCount(initialState)).toBe(0);
    });
  });

  describe('getConnectedPeers', () => {
    it('should return only connected peers', () => {
      const connected = selectors.getConnectedPeers(connectedState);
      expect(connected).toHaveLength(1);
      expect(connected[0].id).toBe('peer-1');
    });
  });

  describe('getTotalPatterns', () => {
    it('should return total pattern count', () => {
      expect(selectors.getTotalPatterns(connectedState)).toBe(100);
    });
  });

  describe('getSyncedPatterns', () => {
    it('should return synced pattern count', () => {
      expect(selectors.getSyncedPatterns(connectedState)).toBe(20);
    });
  });

  describe('getCRDTStoreCount', () => {
    it('should return CRDT store count', () => {
      expect(selectors.getCRDTStoreCount(connectedState)).toBe(1);
    });
  });

  describe('getUptime', () => {
    it('should format hours and minutes', () => {
      expect(selectors.getUptime(connectedState)).toBe('1h 1m');
    });

    it('should format minutes and seconds', () => {
      const state = { ...initialState, metrics: { ...initialState.metrics, uptime: 65000 } };
      expect(selectors.getUptime(state)).toBe('1m 5s');
    });

    it('should format seconds only', () => {
      const state = { ...initialState, metrics: { ...initialState.metrics, uptime: 45000 } };
      expect(selectors.getUptime(state)).toBe('45s');
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy when connected and low memory', () => {
      expect(selectors.getHealthStatus(connectedState)).toBe('healthy');
    });

    it('should return error when connection status is error', () => {
      const errorState = { ...connectedState, connectionStatus: 'error' as const };
      expect(selectors.getHealthStatus(errorState)).toBe('error');
    });

    it('should return warning when not connected', () => {
      expect(selectors.getHealthStatus(initialState)).toBe('warning');
    });

    it('should return warning when memory usage is high', () => {
      const highMemState = {
        ...connectedState,
        metrics: { ...connectedState.metrics, memoryUsage: 600 },
      };
      expect(selectors.getHealthStatus(highMemState)).toBe('warning');
    });
  });
});

// ============================================
// Type Tests
// ============================================

describe('Types', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('should have correct default values', async () => {
      const { DEFAULT_SETTINGS } = await import('../../../src/edge/webapp/types');
      expect(DEFAULT_SETTINGS.theme).toBe('system');
      expect(DEFAULT_SETTINGS.autoConnect).toBe(true);
      expect(DEFAULT_SETTINGS.notifications).toBe(true);
      expect(DEFAULT_SETTINGS.syncInterval).toBe(30);
      expect(DEFAULT_SETTINGS.maxPeers).toBe(10);
      expect(DEFAULT_SETTINGS.debug).toBe(false);
    });
  });
});

// ============================================
// Integration Tests
// ============================================

describe('Webapp Module Exports', () => {
  it('should export all required components', async () => {
    const webapp = await import('../../../src/edge/webapp');

    expect(webapp.WEBAPP_CAPABILITIES).toBeDefined();
    expect(webapp.WEBAPP_CAPABILITIES.version).toBe('1.0.0');
    expect(webapp.WEBAPP_CAPABILITIES.features.dashboard).toBe(true);

    expect(webapp.dashboardReducer).toBeDefined();
    expect(webapp.initialState).toBeDefined();
    expect(webapp.actions).toBeDefined();
    expect(webapp.selectors).toBeDefined();

    expect(webapp.DEFAULT_SETTINGS).toBeDefined();
  });
});
