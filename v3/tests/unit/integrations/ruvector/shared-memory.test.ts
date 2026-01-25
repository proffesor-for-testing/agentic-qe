/**
 * Agentic QE v3 - Shared Memory Unit Tests
 *
 * Tests for shared memory initialization and fleet integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import {
  initializeSharedMemory,
  getSharedServerClient,
  setSharedServerClient,
  isSharedMemoryAvailable,
  getSharedMemoryStatus,
  getLastInitResult,
  shutdownSharedMemory,
  resetSharedMemoryState,
  integrateWithFleet,
  type SharedMemoryConfig,
} from '../../../../src/integrations/ruvector/shared-memory';
import { RuVectorServerClient } from '../../../../src/integrations/ruvector/server-client';

// Mock RuVectorServerClient
vi.mock('../../../../src/integrations/ruvector/server-client', () => ({
  createRuVectorServerClient: vi.fn(),
  RuVectorServerClient: vi.fn(),
}));

import { createRuVectorServerClient } from '../../../../src/integrations/ruvector/server-client';
const mockedCreateClient = createRuVectorServerClient as Mock;

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockClient(options: {
  isRunning?: boolean;
  supportsVectorOps?: boolean;
  health?: { status: string; responseTimeMs?: number };
} = {}): Partial<RuVectorServerClient> {
  return {
    isServerRunning: vi.fn().mockReturnValue(options.isRunning ?? false),
    supportsVectorOperations: vi.fn().mockReturnValue(options.supportsVectorOps ?? false),
    getVectorOperationsUnavailableReason: vi.fn().mockReturnValue('Test reason'),
    healthCheck: vi.fn().mockResolvedValue(options.health ?? { status: 'stopped' }),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Shared Memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSharedMemoryState();
  });

  afterEach(async () => {
    await shutdownSharedMemory();
  });

  describe('initializeSharedMemory', () => {
    it('should return disabled result when enabled is false', async () => {
      const result = await initializeSharedMemory({ enabled: false });

      expect(result.isReady).toBe(false);
      expect(result.client).toBeNull();
      expect(result.unavailableReason).toContain('disabled');
    });

    it('should initialize with client when enabled', async () => {
      const mockClient = createMockClient({ isRunning: false });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await initializeSharedMemory({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.client).toBe(mockClient);
      expect(result.isReady).toBe(false); // Not running
      expect(result.supportsVectorOperations).toBe(false);
    });

    it('should report ready when server is running', async () => {
      const mockClient = createMockClient({ isRunning: true });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await initializeSharedMemory({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.isReady).toBe(true);
      // Still provides reason because vector operations are not supported
      expect(result.supportsVectorOperations).toBe(false);
      expect(result.unavailableReason).toContain('Test reason'); // From mock
    });

    it('should have no unavailable reason when fully available', async () => {
      const mockClient = createMockClient({ isRunning: true, supportsVectorOps: true });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await initializeSharedMemory({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.isReady).toBe(true);
      expect(result.supportsVectorOperations).toBe(true);
      expect(result.unavailableReason).toBeUndefined();
    });

    it('should handle initialization errors gracefully', async () => {
      mockedCreateClient.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await initializeSharedMemory({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.isReady).toBe(false);
      expect(result.client).toBeNull();
      expect(result.unavailableReason).toContain('Connection failed');
    });

    it('should track initialization time', async () => {
      const mockClient = createMockClient();
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await initializeSharedMemory({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.initTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSharedServerClient / setSharedServerClient', () => {
    it('should return null when not initialized', () => {
      expect(getSharedServerClient()).toBeNull();
    });

    it('should set and get client', () => {
      const mockClient = createMockClient() as RuVectorServerClient;
      setSharedServerClient(mockClient);

      expect(getSharedServerClient()).toBe(mockClient);
    });

    it('should allow setting to null', () => {
      const mockClient = createMockClient() as RuVectorServerClient;
      setSharedServerClient(mockClient);
      setSharedServerClient(null);

      expect(getSharedServerClient()).toBeNull();
    });
  });

  describe('isSharedMemoryAvailable', () => {
    it('should return false when not initialized', () => {
      expect(isSharedMemoryAvailable()).toBe(false);
    });

    it('should return false when server not running', async () => {
      const mockClient = createMockClient({ isRunning: false });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });

      expect(isSharedMemoryAvailable()).toBe(false);
    });

    it('should return false when vector ops not supported', async () => {
      const mockClient = createMockClient({ isRunning: true, supportsVectorOps: false });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });

      expect(isSharedMemoryAvailable()).toBe(false);
    });

    it('should return true when fully available', async () => {
      const mockClient = createMockClient({ isRunning: true, supportsVectorOps: true });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });

      expect(isSharedMemoryAvailable()).toBe(true);
    });
  });

  describe('getSharedMemoryStatus', () => {
    it('should return disabled status when no client', async () => {
      const status = await getSharedMemoryStatus();

      expect(status.enabled).toBe(false);
      expect(status.serverRunning).toBe(false);
    });

    it('should return status from client', async () => {
      const mockClient = createMockClient({
        isRunning: true,
        supportsVectorOps: false,
        health: { status: 'running', responseTimeMs: 5 },
      });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });
      const status = await getSharedMemoryStatus();

      expect(status.enabled).toBe(true);
      expect(status.serverRunning).toBe(true);
      expect(status.vectorOperationsSupported).toBe(false);
      expect(status.health?.status).toBe('running');
      expect(status.health?.responseTimeMs).toBe(5);
    });
  });

  describe('getLastInitResult', () => {
    it('should return null before initialization', () => {
      expect(getLastInitResult()).toBeNull();
    });

    it('should return last result after initialization', async () => {
      const mockClient = createMockClient();
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });

      const result = getLastInitResult();
      expect(result).not.toBeNull();
      expect(result?.client).toBe(mockClient);
    });
  });

  describe('shutdownSharedMemory', () => {
    it('should dispose client on shutdown', async () => {
      const mockClient = createMockClient();
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });
      await shutdownSharedMemory();

      expect(mockClient.dispose).toHaveBeenCalled();
      expect(getSharedServerClient()).toBeNull();
    });

    it('should handle shutdown errors gracefully', async () => {
      const mockClient = createMockClient();
      (mockClient.dispose as Mock).mockRejectedValueOnce(new Error('Shutdown error'));
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      await initializeSharedMemory({ enabled: true, suppressWarnings: true });

      // Should not throw
      await expect(shutdownSharedMemory()).resolves.not.toThrow();
    });
  });

  describe('integrateWithFleet', () => {
    it('should return disabled status when disabled', async () => {
      const result = await integrateWithFleet({ enabled: false });

      expect(result.status).toBe('disabled');
      expect(result.client).toBeNull();
    });

    it('should return unavailable when client creation fails', async () => {
      mockedCreateClient.mockRejectedValueOnce(new Error('Init failed'));

      const result = await integrateWithFleet({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.status).toBe('unavailable');
      expect(result.client).toBeNull();
    });

    it('should return server-only when running but no vector ops', async () => {
      const mockClient = createMockClient({ isRunning: true, supportsVectorOps: false });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await integrateWithFleet({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.status).toBe('server-only');
      expect(result.client).toBe(mockClient);
      expect(result.message).toContain('local storage');
    });

    it('should return ready when fully available', async () => {
      const mockClient = createMockClient({ isRunning: true, supportsVectorOps: true });
      mockedCreateClient.mockResolvedValueOnce(mockClient);

      const result = await integrateWithFleet({
        enabled: true,
        suppressWarnings: true,
      });

      expect(result.status).toBe('ready');
      expect(result.client).toBe(mockClient);
      expect(result.message).toContain('sharing enabled');
    });
  });
});
