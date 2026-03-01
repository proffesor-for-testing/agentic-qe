/**
 * WASM Loader Unit Tests
 * ADR-052: A1.4 - Unit Tests for CoherenceService WASM Infrastructure
 *
 * Tests the WebAssembly module loader with retry logic, caching, and event emission.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';

/**
 * WasmLoader - Handles loading of prime-radiant-advanced-wasm module
 * with retry logic, caching, and event-based status reporting.
 */
interface WasmLoaderConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

interface WasmModule {
  CohomologyEngine: new () => unknown;
  SpectralEngine: new () => unknown;
  CausalEngine: new () => unknown;
  CategoryEngine: new () => unknown;
  HomotopyEngine: new () => unknown;
  WitnessEngine: new () => unknown;
}

class WasmLoader extends EventEmitter {
  private instance: WasmModule | null = null;
  private loading = false;
  private loadAttempts = 0;
  private readonly config: WasmLoaderConfig;
  private loadPromise: Promise<WasmModule> | null = null;

  constructor(config: Partial<WasmLoaderConfig> = {}) {
    super();
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 100,
      timeoutMs: config.timeoutMs ?? 5000,
    };
    // Prevent unhandled 'error' events - errors are also thrown from load()
    this.on('error', () => {});
  }

  get isLoaded(): boolean {
    return this.instance !== null;
  }

  get attempts(): number {
    return this.loadAttempts;
  }

  async load(): Promise<WasmModule> {
    // Return cached instance if already loaded
    if (this.instance) {
      return this.instance;
    }

    // Return existing promise if already loading
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loading = true;
    // Create promise and immediately add catch to prevent unhandled rejection
    // The actual error will still be thrown when awaited below
    const promise = this.loadWithRetry();
    promise.catch(() => {}); // Prevent unhandled rejection warning
    this.loadPromise = promise;

    try {
      const result = await this.loadPromise;
      return result;
    } finally {
      this.loading = false;
      this.loadPromise = null;
    }
  }

  private async loadWithRetry(): Promise<WasmModule> {
    let lastError: Error | null = null;

    while (this.loadAttempts < this.config.maxRetries) {
      this.loadAttempts++;

      try {
        const module = await this.attemptLoad();
        this.instance = module;
        this.emit('loaded', module);
        return module;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (this.loadAttempts < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    const finalError = new Error(
      `Failed to load WASM module after ${this.config.maxRetries} attempts: ${lastError?.message}`
    );
    // Emit error for listeners, but ensure we don't cause unhandled rejection
    // since the error is also thrown and can be caught by callers
    setImmediate(() => this.emit('error', finalError));
    throw finalError;
  }

  private async attemptLoad(): Promise<WasmModule> {
    // This would be the actual import in production:
    // return await import('prime-radiant-advanced-wasm');
    const importFn = (globalThis as Record<string, unknown>).__wasmImportFn as
      | (() => Promise<WasmModule>)
      | undefined;

    if (importFn) {
      return await importFn();
    }

    throw new Error('WASM module not available');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  reset(): void {
    this.instance = null;
    this.loading = false;
    this.loadAttempts = 0;
    this.loadPromise = null;
  }
}

// Mock WASM module factory
function createMockWasmModule(): WasmModule {
  return {
    CohomologyEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      sheaf_laplacian_energy: vi.fn().mockReturnValue(0.05),
      compute_cohomology_dimension: vi.fn().mockReturnValue(1),
    })),
    SpectralEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      spectral_risk: vi.fn().mockReturnValue(0.15),
      compute_eigenvalues: vi.fn().mockReturnValue([1.0, 0.8, 0.5]),
    })),
    CausalEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      causal_strength: vi.fn().mockReturnValue(0.75),
      verify_relationship: vi.fn().mockReturnValue(true),
    })),
    CategoryEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      compute_morphism: vi.fn().mockReturnValue({ valid: true }),
      category_coherence: vi.fn().mockReturnValue(0.9),
    })),
    HomotopyEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      path_equivalence: vi.fn().mockReturnValue(true),
      homotopy_type: vi.fn().mockReturnValue('contractible'),
    })),
    WitnessEngine: vi.fn().mockImplementation(() => ({
      add_node: vi.fn(),
      add_edge: vi.fn(),
      create_witness: vi.fn().mockReturnValue({ id: 'witness-1', valid: true }),
      replay_witness: vi.fn().mockReturnValue(true),
    })),
  };
}

describe('WasmLoader', () => {
  let loader: WasmLoader;
  let mockModule: WasmModule;

  beforeEach(() => {
    loader = new WasmLoader({ maxRetries: 3, retryDelayMs: 10 });
    mockModule = createMockWasmModule();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).__wasmImportFn;
  });

  describe('initial state', () => {
    it('should not be loaded initially', () => {
      expect(loader.isLoaded).toBe(false);
    });

    it('should have zero attempts initially', () => {
      expect(loader.attempts).toBe(0);
    });
  });

  describe('load', () => {
    it('should load WASM module successfully', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockResolvedValue(mockModule);

      const loadPromise = loader.load();
      await vi.runAllTimersAsync();
      const result = await loadPromise;

      expect(result).toBe(mockModule);
      expect(loader.isLoaded).toBe(true);
      expect(loader.attempts).toBe(1);
    });

    it('should emit loaded event on success', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockResolvedValue(mockModule);

      const loadedHandler = vi.fn();
      loader.on('loaded', loadedHandler);

      const loadPromise = loader.load();
      await vi.runAllTimersAsync();
      await loadPromise;

      expect(loadedHandler).toHaveBeenCalledWith(mockModule);
      expect(loadedHandler).toHaveBeenCalledTimes(1);
    });

    it('should return cached instance on subsequent calls', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockResolvedValue(mockModule);

      const loadPromise1 = loader.load();
      await vi.runAllTimersAsync();
      const result1 = await loadPromise1;

      const result2 = await loader.load();

      expect(result1).toBe(result2);
      expect(loader.attempts).toBe(1); // Only one attempt
    });
  });

  describe('retry logic', () => {
    it('should handle load failure with retry', async () => {
      const importFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue(mockModule);

      (globalThis as Record<string, unknown>).__wasmImportFn = importFn;

      const loadPromise = loader.load();
      await vi.runAllTimersAsync();
      const result = await loadPromise;

      expect(result).toBe(mockModule);
      expect(loader.attempts).toBe(3);
      expect(importFn).toHaveBeenCalledTimes(3);
    });

    it('should emit error event after max retries', async () => {
      const importFn = vi.fn().mockRejectedValue(new Error('Persistent error'));
      (globalThis as Record<string, unknown>).__wasmImportFn = importFn;

      const errorHandler = vi.fn();
      loader.on('error', errorHandler);

      // Catch rejection immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const loadPromise = loader.load().catch((e) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();
      await loadPromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toContain('Failed to load WASM module after 3 attempts');
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should retry with configured delay', async () => {
      const loader50ms = new WasmLoader({ maxRetries: 2, retryDelayMs: 50 });
      const importFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockResolvedValue(mockModule);

      (globalThis as Record<string, unknown>).__wasmImportFn = importFn;

      const loadPromise = loader50ms.load();

      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(importFn).toHaveBeenCalledTimes(1);

      // Wait for retry delay
      await vi.advanceTimersByTimeAsync(50);
      expect(importFn).toHaveBeenCalledTimes(2);

      await loadPromise;
      expect(loader50ms.isLoaded).toBe(true);
    });
  });

  describe('isLoaded', () => {
    it('should report isLoaded correctly before loading', () => {
      expect(loader.isLoaded).toBe(false);
    });

    it('should report isLoaded correctly after successful load', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockResolvedValue(mockModule);

      const loadPromise = loader.load();
      await vi.runAllTimersAsync();
      await loadPromise;

      expect(loader.isLoaded).toBe(true);
    });

    it('should report isLoaded correctly after failed load', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockRejectedValue(new Error('Failed'));

      // Catch rejection immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const loadPromise = loader.load().catch((e) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();
      await loadPromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toContain('Failed to load WASM module');
      expect(loader.isLoaded).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset state after successful load', async () => {
      (globalThis as Record<string, unknown>).__wasmImportFn = vi
        .fn()
        .mockResolvedValue(mockModule);

      const loadPromise = loader.load();
      await vi.runAllTimersAsync();
      await loadPromise;

      expect(loader.isLoaded).toBe(true);
      expect(loader.attempts).toBe(1);

      loader.reset();

      expect(loader.isLoaded).toBe(false);
      expect(loader.attempts).toBe(0);
    });
  });

  describe('concurrent loading', () => {
    it('should handle concurrent load calls', async () => {
      const importFn = vi.fn().mockResolvedValue(mockModule);
      (globalThis as Record<string, unknown>).__wasmImportFn = importFn;

      // Start multiple concurrent loads
      const promise1 = loader.load();
      const promise2 = loader.load();
      const promise3 = loader.load();

      await vi.runAllTimersAsync();

      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

      // All should return the same instance
      expect(result1).toBe(mockModule);
      expect(result2).toBe(mockModule);
      expect(result3).toBe(mockModule);

      // Should only load once
      expect(importFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultLoader = new WasmLoader();
      expect(defaultLoader.isLoaded).toBe(false);
    });

    it('should respect custom maxRetries', async () => {
      const customLoader = new WasmLoader({ maxRetries: 5, retryDelayMs: 1 });
      const importFn = vi.fn().mockRejectedValue(new Error('Always fails'));
      (globalThis as Record<string, unknown>).__wasmImportFn = importFn;

      // Catch rejection immediately to prevent unhandled rejection
      let caughtError: Error | null = null;
      const loadPromise = customLoader.load().catch((e) => {
        caughtError = e;
      });

      await vi.runAllTimersAsync();
      await loadPromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toContain('Failed to load WASM module after 5 attempts');
      expect(customLoader.attempts).toBe(5);
      expect(importFn).toHaveBeenCalledTimes(5);
    });
  });
});

// Export for use in other tests
export { WasmLoader, createMockWasmModule, type WasmModule, type WasmLoaderConfig };
