/**
 * Dashboard Reducer
 *
 * State management for the web dashboard using a reducer pattern.
 *
 * @module edge/webapp/store/dashboardReducer
 */

import type {
  DashboardState,
  DashboardAction,
  AgentInfo,
  PeerInfo,
  PatternStats,
  CRDTState,
  TestInfo,
  TestResult,
  SystemMetrics,
} from '../types';

// ============================================
// Initial State
// ============================================

export const initialState: DashboardState = {
  connectionStatus: 'disconnected',
  localAgent: null,
  peers: [],
  patterns: {
    total: 0,
    local: 0,
    synced: 0,
    pending: 0,
    categories: {},
  },
  crdt: {
    stores: [],
    totalOperations: 0,
    conflictsResolved: 0,
    lastSync: 0,
  },
  tests: {
    running: [],
    completed: [],
    queued: 0,
  },
  metrics: {
    memoryUsage: 0,
    cpuUsage: 0,
    networkLatency: 0,
    messagesPerSecond: 0,
    uptime: 0,
  },
};

// ============================================
// Reducer
// ============================================

export function dashboardReducer(
  state: DashboardState,
  action: DashboardAction
): DashboardState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.status,
      };

    case 'SET_LOCAL_AGENT':
      return {
        ...state,
        localAgent: action.agent,
      };

    case 'ADD_PEER':
      return {
        ...state,
        peers: [...state.peers, action.peer],
      };

    case 'UPDATE_PEER':
      return {
        ...state,
        peers: state.peers.map(peer =>
          peer.id === action.peerId
            ? { ...peer, ...action.updates, lastSeen: Date.now() }
            : peer
        ),
      };

    case 'REMOVE_PEER':
      return {
        ...state,
        peers: state.peers.filter(peer => peer.id !== action.peerId),
      };

    case 'UPDATE_PATTERNS':
      return {
        ...state,
        patterns: action.stats,
      };

    case 'UPDATE_CRDT':
      return {
        ...state,
        crdt: action.state,
      };

    case 'ADD_TEST':
      return {
        ...state,
        tests: {
          ...state.tests,
          running: [...state.tests.running, action.test],
        },
      };

    case 'UPDATE_TEST':
      return {
        ...state,
        tests: {
          ...state.tests,
          running: state.tests.running.map(test =>
            test.id === action.testId
              ? { ...test, ...action.updates }
              : test
          ),
        },
      };

    case 'COMPLETE_TEST':
      return {
        ...state,
        tests: {
          ...state.tests,
          running: state.tests.running.filter(t => t.id !== action.result.id),
          completed: [action.result, ...state.tests.completed].slice(0, 100),
        },
      };

    case 'UPDATE_METRICS':
      return {
        ...state,
        metrics: action.metrics,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// ============================================
// Action Creators
// ============================================

export const actions = {
  setConnectionStatus: (status: DashboardState['connectionStatus']): DashboardAction => ({
    type: 'SET_CONNECTION_STATUS',
    status,
  }),

  setLocalAgent: (agent: AgentInfo): DashboardAction => ({
    type: 'SET_LOCAL_AGENT',
    agent,
  }),

  addPeer: (peer: PeerInfo): DashboardAction => ({
    type: 'ADD_PEER',
    peer,
  }),

  updatePeer: (peerId: string, updates: Partial<PeerInfo>): DashboardAction => ({
    type: 'UPDATE_PEER',
    peerId,
    updates,
  }),

  removePeer: (peerId: string): DashboardAction => ({
    type: 'REMOVE_PEER',
    peerId,
  }),

  updatePatterns: (stats: PatternStats): DashboardAction => ({
    type: 'UPDATE_PATTERNS',
    stats,
  }),

  updateCRDT: (state: CRDTState): DashboardAction => ({
    type: 'UPDATE_CRDT',
    state,
  }),

  addTest: (test: TestInfo): DashboardAction => ({
    type: 'ADD_TEST',
    test,
  }),

  updateTest: (testId: string, updates: Partial<TestInfo>): DashboardAction => ({
    type: 'UPDATE_TEST',
    testId,
    updates,
  }),

  completeTest: (result: TestResult): DashboardAction => ({
    type: 'COMPLETE_TEST',
    result,
  }),

  updateMetrics: (metrics: SystemMetrics): DashboardAction => ({
    type: 'UPDATE_METRICS',
    metrics,
  }),

  reset: (): DashboardAction => ({
    type: 'RESET',
  }),
};

// ============================================
// Selectors
// ============================================

export const selectors = {
  isConnected: (state: DashboardState): boolean =>
    state.connectionStatus === 'connected',

  getPeerCount: (state: DashboardState): number =>
    state.peers.length,

  getConnectedPeers: (state: DashboardState): PeerInfo[] =>
    state.peers.filter(p => p.connectionState === 'connected'),

  getTotalPatterns: (state: DashboardState): number =>
    state.patterns.total,

  getSyncedPatterns: (state: DashboardState): number =>
    state.patterns.synced,

  getCRDTStoreCount: (state: DashboardState): number =>
    state.crdt.stores.length,

  getRunningTests: (state: DashboardState): TestInfo[] =>
    state.tests.running,

  getCompletedTests: (state: DashboardState): TestResult[] =>
    state.tests.completed,

  getUptime: (state: DashboardState): string => {
    const seconds = Math.floor(state.metrics.uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  },

  getHealthStatus: (state: DashboardState): 'healthy' | 'warning' | 'error' => {
    if (state.connectionStatus === 'error') return 'error';
    if (state.connectionStatus !== 'connected') return 'warning';
    if (state.metrics.memoryUsage > 500) return 'warning';
    return 'healthy';
  },
};
