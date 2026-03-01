/**
 * Test: Token Bootstrap
 * Tests token tracking initialization, shutdown, and idempotency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies before imports
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

vi.mock('../../../src/optimization/token-optimizer-service.js', () => ({
  initializeTokenOptimizer: vi.fn().mockResolvedValue(undefined),
  TokenOptimizerService: {
    isEnabled: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../../src/learning/token-tracker.js', () => ({
  TokenMetricsCollector: {
    configurePersistence: vi.fn(),
    load: vi.fn().mockResolvedValue(true),
    startAutoSave: vi.fn(),
    stopAutoSave: vi.fn(),
    hasUnsavedChanges: vi.fn().mockReturnValue(false),
    save: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/kernel/memory-factory.js', () => ({
  createDefaultMemoryBackend: vi.fn().mockResolvedValue({
    backend: {
      dispose: vi.fn().mockResolvedValue(undefined),
    },
  }),
  createMemoryBackend: vi.fn(),
}));

import * as fs from 'fs';
import { initializeTokenOptimizer } from '../../../src/optimization/token-optimizer-service.js';
import { TokenMetricsCollector } from '../../../src/learning/token-tracker.js';
import { createDefaultMemoryBackend } from '../../../src/kernel/memory-factory.js';
import {
  bootstrapTokenTracking,
  shutdownTokenTracking,
  isTokenTrackingInitialized,
  getTokenMemoryBackend,
} from '../../../src/init/token-bootstrap.js';

describe('Token Bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});

    // Reset default mock behaviors
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(TokenMetricsCollector.hasUnsavedChanges).mockReturnValue(false);
    vi.mocked(TokenMetricsCollector.load).mockResolvedValue(true as any);
    vi.mocked(TokenMetricsCollector.save).mockResolvedValue(undefined);
    vi.mocked(createDefaultMemoryBackend).mockResolvedValue({
      backend: { dispose: vi.fn().mockResolvedValue(undefined) },
    } as any);
    vi.mocked(initializeTokenOptimizer).mockResolvedValue(undefined as any);
  });

  afterEach(async () => {
    // Always clean up module-level state by shutting down
    // This resets the module-level `initialized` flag
    try {
      await shutdownTokenTracking();
    } catch {
      // ignore
    }
  });

  describe('bootstrapTokenTracking', () => {
    it('should initialize successfully with default config', async () => {
      await bootstrapTokenTracking();
      expect(isTokenTrackingInitialized()).toBe(true);
    });

    it('should be idempotent - second call does not re-initialize optimizer', async () => {
      await bootstrapTokenTracking();
      const callCount = vi.mocked(initializeTokenOptimizer).mock.calls.length;

      await bootstrapTokenTracking();
      // Should NOT have called initializeTokenOptimizer again
      expect(vi.mocked(initializeTokenOptimizer).mock.calls.length).toBe(callCount);
    });

    it('should create storage directory when persistence is enabled and dir does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await bootstrapTokenTracking({
        enablePersistence: true,
        storagePath: '/tmp/test-aqe',
      });

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should skip storage directory creation when persistence is disabled', async () => {
      await bootstrapTokenTracking({
        enablePersistence: false,
        enableOptimization: false,
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should initialize token optimizer when optimization is enabled', async () => {
      await bootstrapTokenTracking({ enableOptimization: true });

      expect(createDefaultMemoryBackend).toHaveBeenCalled();
      expect(initializeTokenOptimizer).toHaveBeenCalled();
    });

    it('should skip token optimizer when optimization is disabled', async () => {
      await bootstrapTokenTracking({ enableOptimization: false });

      expect(initializeTokenOptimizer).not.toHaveBeenCalled();
    });

    it('should handle optimizer initialization failure gracefully', async () => {
      vi.mocked(createDefaultMemoryBackend).mockRejectedValue(new Error('memory backend failure'));

      // Should not throw
      await bootstrapTokenTracking({ enableOptimization: true });

      expect(isTokenTrackingInitialized()).toBe(true);
    });

    it('should configure persistence and start auto-save', async () => {
      await bootstrapTokenTracking({ enablePersistence: true });

      expect(TokenMetricsCollector.configurePersistence).toHaveBeenCalled();
      expect(TokenMetricsCollector.load).toHaveBeenCalled();
      expect(TokenMetricsCollector.startAutoSave).toHaveBeenCalled();
    });

    it('should handle metrics load failure gracefully', async () => {
      vi.mocked(TokenMetricsCollector.load).mockRejectedValue(new Error('no metrics'));

      // Should not throw
      await bootstrapTokenTracking({ enablePersistence: true });

      expect(isTokenTrackingInitialized()).toBe(true);
    });
  });

  describe('shutdownTokenTracking', () => {
    it('should be a no-op when not initialized', async () => {
      // Ensure we are not initialized (afterEach already shuts down)
      expect(isTokenTrackingInitialized()).toBe(false);

      vi.clearAllMocks(); // Clear any calls from afterEach
      await shutdownTokenTracking();

      expect(TokenMetricsCollector.stopAutoSave).not.toHaveBeenCalled();
    });

    it('should stop auto-save on shutdown', async () => {
      await bootstrapTokenTracking();
      vi.clearAllMocks(); // Clear setup calls

      await shutdownTokenTracking();

      expect(TokenMetricsCollector.stopAutoSave).toHaveBeenCalled();
    });

    it('should save unsaved metrics on shutdown', async () => {
      await bootstrapTokenTracking();
      vi.mocked(TokenMetricsCollector.hasUnsavedChanges).mockReturnValue(true);
      vi.clearAllMocks();
      vi.mocked(TokenMetricsCollector.hasUnsavedChanges).mockReturnValue(true);

      await shutdownTokenTracking();

      expect(TokenMetricsCollector.save).toHaveBeenCalled();
    });

    it('should handle save failure gracefully on shutdown', async () => {
      await bootstrapTokenTracking();
      vi.mocked(TokenMetricsCollector.hasUnsavedChanges).mockReturnValue(true);
      vi.mocked(TokenMetricsCollector.save).mockRejectedValue(new Error('write failed'));

      // Should not throw
      await shutdownTokenTracking();
    });

    it('should reset initialized flag after shutdown', async () => {
      await bootstrapTokenTracking();
      expect(isTokenTrackingInitialized()).toBe(true);

      await shutdownTokenTracking();
      expect(isTokenTrackingInitialized()).toBe(false);
    });

    it('should dispose memory backend on shutdown', async () => {
      const disposeFn = vi.fn().mockResolvedValue(undefined);
      vi.mocked(createDefaultMemoryBackend).mockResolvedValue({
        backend: { dispose: disposeFn },
      } as any);

      await bootstrapTokenTracking({ enableOptimization: true });
      await shutdownTokenTracking();

      expect(disposeFn).toHaveBeenCalled();
    });
  });

  describe('isTokenTrackingInitialized', () => {
    it('should return false before initialization', () => {
      expect(isTokenTrackingInitialized()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await bootstrapTokenTracking();
      expect(isTokenTrackingInitialized()).toBe(true);
    });
  });

  describe('getTokenMemoryBackend', () => {
    it('should return null before initialization', () => {
      expect(getTokenMemoryBackend()).toBeNull();
    });

    it('should return backend after initialization with optimization enabled', async () => {
      await bootstrapTokenTracking({ enableOptimization: true });
      expect(getTokenMemoryBackend()).not.toBeNull();
    });
  });
});
