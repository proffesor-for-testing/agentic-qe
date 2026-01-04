/**
 * Mock P2P Service
 *
 * Mock implementation for testing P2P React hooks and components.
 *
 * @module edge/webapp/services/__mocks__/P2PService
 */

import type { DashboardState } from '../../types';

// State management for the mock
const mockSubscribers = new Set<(state: DashboardState) => void>();
const mockEventHandlers = new Set<(event: any) => void>();

const createInitialState = (): DashboardState => ({
  connectionStatus: 'disconnected',
  localAgent: null,
  peers: [],
  patterns: { total: 0, local: 0, synced: 0, pending: 0, categories: {} },
  crdt: { stores: [], totalOperations: 0, conflictsResolved: 0, lastSync: 0 },
  tests: { running: [], completed: [], queued: 0 },
  metrics: { memoryUsage: 0, cpuUsage: 0, networkLatency: 0, messagesPerSecond: 0, uptime: 0 },
});

let mockState: DashboardState = createInitialState();

// Mock service instance
export const mockServiceInstance = {
  init: jest.fn().mockResolvedValue(undefined),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  sharePattern: jest.fn().mockResolvedValue(undefined),
  addPattern: jest.fn().mockResolvedValue('pattern-123'),
  syncCRDT: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn(),
  subscribe: jest.fn((callback: (state: DashboardState) => void) => {
    mockSubscribers.add(callback);
    // Immediately call with current state so hook gets initial data
    callback(mockState);
    return () => mockSubscribers.delete(callback);
  }),
  onEvent: jest.fn((handler: (event: any) => void) => {
    mockEventHandlers.add(handler);
    return () => mockEventHandlers.delete(handler);
  }),
  getState: jest.fn(() => mockState),
};

// Helper functions for testing
export const __test__ = {
  emitStateChange: (newState: Partial<DashboardState>) => {
    mockState = { ...mockState, ...newState };
    mockServiceInstance.getState.mockReturnValue(mockState);
    mockSubscribers.forEach(cb => cb(mockState));
  },
  emitEvent: (event: any) => {
    mockEventHandlers.forEach(handler => handler(event));
  },
  reset: () => {
    mockSubscribers.clear();
    mockEventHandlers.clear();
    mockState = createInitialState();
    // Reset mock functions to initial implementations
    mockServiceInstance.init.mockReset().mockResolvedValue(undefined);
    mockServiceInstance.connect.mockReset().mockResolvedValue(undefined);
    mockServiceInstance.disconnect.mockReset().mockResolvedValue(undefined);
    mockServiceInstance.sharePattern.mockReset().mockResolvedValue(undefined);
    mockServiceInstance.addPattern.mockReset().mockResolvedValue('pattern-123');
    mockServiceInstance.syncCRDT.mockReset().mockResolvedValue(undefined);
    mockServiceInstance.destroy.mockReset();
    mockServiceInstance.subscribe.mockReset().mockImplementation((callback: (state: DashboardState) => void) => {
      mockSubscribers.add(callback);
      return () => mockSubscribers.delete(callback);
    });
    mockServiceInstance.onEvent.mockReset().mockImplementation((handler: (event: any) => void) => {
      mockEventHandlers.add(handler);
      return () => mockEventHandlers.delete(handler);
    });
    mockServiceInstance.getState.mockReset().mockReturnValue(mockState);
  },
  getState: () => mockState,
  getSubscribers: () => mockSubscribers,
  getEventHandlers: () => mockEventHandlers,
};

// Mock class implementation
export class P2PServiceImpl {
  constructor() {
    return mockServiceInstance;
  }
}

// Exported functions - use implementation to ensure mockServiceInstance is available
export const getP2PService = jest.fn().mockImplementation(() => {
  return mockServiceInstance;
});

export const resetP2PService = jest.fn(() => {
  __test__.reset();
});
