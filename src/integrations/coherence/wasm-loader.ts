/**
 * WASM Loader for Prime-Radiant Coherence Engines
 *
 * Provides lazy loading of the prime-radiant-advanced-wasm module with:
 * - Retry logic with exponential backoff (3 attempts by default)
 * - Event emission for monitoring load status
 * - Graceful error handling
 * - Node.js 18+ compatibility
 *
 * @module integrations/coherence/wasm-loader
 *
 * @example
 * ```typescript
 * import { wasmLoader } from './wasm-loader';
 *
 * // Add event listeners
 * wasmLoader.on('loaded', ({ version, loadTimeMs }) => {
 *   console.log(`WASM loaded v${version} in ${loadTimeMs}ms`);
 * });
 *
 * wasmLoader.on('retry', ({ attempt, maxAttempts, delayMs }) => {
 *   console.log(`Retry ${attempt}/${maxAttempts} in ${delayMs}ms`);
 * });
 *
 * // Load and use engines
 * const engines = await wasmLoader.getEngines();
 * const energy = engines.cohomology.consistencyEnergy(graph);
 * ```
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

import type {
  RawCoherenceEngines,
  WasmLoaderConfig,
  WasmLoaderEvent,
  WasmLoaderEventData,
  WasmLoaderEventListener,
  IRawCohomologyEngine,
  IRawSpectralEngine,
  IRawCausalEngine,
  IRawCategoryEngine,
  IRawHoTTEngine,
  IRawQuantumEngine,
  IWasmLoader,
  WasmModule,
  FallbackResult,
  FallbackState,
} from './types.js';
import { toErrorMessage, toError } from '../../shared/error-utils.js';
import {
  DEFAULT_WASM_LOADER_CONFIG,
  DEFAULT_FALLBACK_RESULT,
  WasmLoadError,
  WasmNotLoadedError,
} from './types.js';

// =============================================================================
// Types for the raw WASM module
// =============================================================================

/**
 * Raw WASM module exports from prime-radiant-advanced-wasm
 */
interface PrimeRadiantWasmModule {
  CohomologyEngine: new () => IRawCohomologyEngine;
  SpectralEngine: {
    new (): IRawSpectralEngine;
    withConfig(numEigenvalues: number, tolerance: number, maxIterations: number): IRawSpectralEngine;
  };
  CausalEngine: new () => IRawCausalEngine;
  CategoryEngine: new () => IRawCategoryEngine;
  HoTTEngine: {
    new (): IRawHoTTEngine;
    withStrictMode(strict: boolean): IRawHoTTEngine;
  };
  QuantumEngine: new () => IRawQuantumEngine;
  getVersion(): string;
  initModule(): void;
  /** Async init using fetch (browser only) */
  default: (input?: unknown) => Promise<unknown>;
  /**
   * Sync init using raw WASM bytes (Node.js compatible)
   * Accepts Buffer, ArrayBuffer, Uint8Array, or object with module property
   */
  initSync: (module: ArrayBuffer | Uint8Array | { module: ArrayBuffer | Uint8Array }) => unknown;
}

// =============================================================================
// WASM Loader Implementation
// =============================================================================

/**
 * State of the WASM loader
 */
type LoaderState = 'unloaded' | 'loading' | 'loaded' | 'failed' | 'degraded';

/**
 * ADR-052 A4.3: Exponential backoff delays for retry logic
 * Default: 1s, 2s, 4s (3 retries)
 */
const FALLBACK_RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * WASM Loader for Prime-Radiant coherence engines.
 *
 * Provides lazy loading with retry logic and event emission.
 * Uses the Singleton pattern to ensure only one loader instance.
 * Implements IWasmLoader interface for CoherenceService compatibility.
 *
 * ADR-052 A4.3 Enhancements:
 * - Full graceful degradation with fallback results
 * - Emits 'degraded_mode' event via internal EventBus
 * - Exponential backoff retry (1s, 2s, 4s)
 * - Never blocks execution due to WASM failure
 */
export class WasmLoader implements IWasmLoader {
  private state: LoaderState = 'unloaded';
  private wasmModule: PrimeRadiantWasmModule | null = null;
  private engines: RawCoherenceEngines | null = null;
  private loadPromise: Promise<RawCoherenceEngines> | null = null;
  private lastError: Error | null = null;
  private config: WasmLoaderConfig;
  private version: string = '';

  // ADR-052 A4.3: Fallback state tracking
  private fallbackState: FallbackState = {
    mode: 'wasm',
    consecutiveFailures: 0,
    totalActivations: 0,
    nextRetryAt: undefined,
    lastSuccessfulLoad: undefined,
  };

  // ADR-052 A4.3: Background retry timer
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private degradedModeStartTime: Date | null = null;

  private eventListeners: Map<WasmLoaderEvent, Set<WasmLoaderEventListener<WasmLoaderEvent>>>;

  /**
   * Create a new WASM loader instance.
   *
   * @param config - Loader configuration (optional)
   */
  constructor(config: Partial<WasmLoaderConfig> = {}) {
    this.config = { ...DEFAULT_WASM_LOADER_CONFIG, ...config };

    // Initialize event listener maps (ADR-052 A4.3: added degraded_mode and recovered)
    this.eventListeners = new Map();
    this.eventListeners.set('loaded', new Set());
    this.eventListeners.set('error', new Set());
    this.eventListeners.set('retry', new Set());
    this.eventListeners.set('degraded_mode', new Set());
    this.eventListeners.set('recovered', new Set());
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Check if the WASM module is loaded and ready.
   *
   * @returns True if the module is loaded and engines are available
   *
   * @example
   * ```typescript
   * if (wasmLoader.isLoaded()) {
   *   const engines = wasmLoader.getEnginesSync();
   * }
   * ```
   */
  public isLoaded(): boolean {
    return this.state === 'loaded' && this.engines !== null;
  }

  /**
   * Get the current loader state.
   *
   * @returns Current state: 'unloaded', 'loading', 'loaded', or 'failed'
   */
  public getState(): LoaderState {
    return this.state;
  }

  /**
   * Get the loaded WASM version (empty string if not loaded).
   *
   * @returns Version string from the WASM module
   */
  public getVersion(): string {
    return this.version;
  }

  /**
   * Get the last error that occurred during loading (if any).
   *
   * @returns The last error or null if no error
   */
  public getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * ADR-052 A4.3: Check if currently operating in fallback/degraded mode.
   *
   * @returns True if WASM is unavailable and fallback is active
   */
  public isInDegradedMode(): boolean {
    return this.state === 'degraded' || this.fallbackState.mode === 'fallback';
  }

  /**
   * ADR-052 A4.3: Get the current fallback state.
   *
   * @returns Current fallback state with retry information
   */
  public getFallbackState(): FallbackState {
    return { ...this.fallbackState };
  }

  /**
   * ADR-052 A4.3: Get a fallback result when WASM is unavailable.
   * Returns a "coherent" result with low confidence (0.5) and usedFallback: true.
   * NEVER blocks execution.
   *
   * @returns FallbackResult with usedFallback: true and confidence: 0.5
   */
  public getFallbackResult(): FallbackResult {
    return {
      usedFallback: true,
      confidence: 0.5,
      retryCount: this.fallbackState.consecutiveFailures,
      lastError: this.lastError?.message,
      activatedAt: this.degradedModeStartTime ?? new Date(),
    };
  }

  /**
   * Load the WASM module and initialize all engines.
   *
   * This method is idempotent - calling it multiple times will return
   * the same promise if loading is in progress, or the cached engines
   * if already loaded.
   *
   * @returns Promise resolving to all coherence engines
   * @throws {WasmLoadError} If loading fails after all retry attempts
   *
   * @example
   * ```typescript
   * try {
   *   const engines = await wasmLoader.getEngines();
   *   const energy = engines.cohomology.consistencyEnergy(graph);
   * } catch (error) {
   *   if (error instanceof WasmLoadError) {
   *     console.error(`Failed after ${error.attempts} attempts`);
   *   }
   * }
   * ```
   */
  public async getEngines(): Promise<RawCoherenceEngines> {
    // Return cached engines if already loaded
    if (this.state === 'loaded' && this.engines) {
      return this.engines;
    }

    // Return existing load promise if loading is in progress
    if (this.state === 'loading' && this.loadPromise) {
      return this.loadPromise;
    }

    // Start new load
    this.state = 'loading';
    this.loadPromise = this.loadWithRetry();

    try {
      this.engines = await this.loadPromise;
      this.state = 'loaded';

      // ADR-052 A4.3: Track successful load and emit recovery event if coming from degraded
      if (this.fallbackState.mode === 'fallback' || this.fallbackState.mode === 'recovering') {
        this.emitRecoveryEvent();
      }
      this.fallbackState.mode = 'wasm';
      this.fallbackState.consecutiveFailures = 0;
      this.fallbackState.lastSuccessfulLoad = new Date();

      return this.engines;
    } catch (error) {
      this.state = 'failed';
      this.lastError = toError(error);

      // ADR-052 A4.3: Enter degraded mode and schedule retry
      this.enterDegradedMode(this.lastError);

      throw error;
    } finally {
      this.loadPromise = null;
    }
  }

  /**
   * ADR-052 A4.3: Get engines with graceful fallback - NEVER throws.
   *
   * This method attempts to load WASM but returns null with a FallbackResult
   * instead of throwing. Use this when you want to handle degraded mode gracefully.
   *
   * @returns Object with engines (or null) and fallback information
   *
   * @example
   * ```typescript
   * const { engines, fallback } = await wasmLoader.getEnginesWithFallback();
   *
   * if (fallback.usedFallback) {
   *   console.warn('Operating in degraded mode:', fallback.lastError);
   *   // Use TypeScript fallback implementation
   * } else {
   *   // Use WASM engines
   *   const energy = engines!.cohomology.consistencyEnergy(graph);
   * }
   * ```
   */
  public async getEnginesWithFallback(): Promise<{
    engines: RawCoherenceEngines | null;
    fallback: FallbackResult;
  }> {
    // Return cached engines if already loaded
    if (this.state === 'loaded' && this.engines) {
      return {
        engines: this.engines,
        fallback: {
          usedFallback: false,
          confidence: 1.0,
          retryCount: 0,
        },
      };
    }

    // If already in degraded mode, return fallback immediately (don't block)
    if (this.state === 'degraded') {
      return {
        engines: null,
        fallback: this.getFallbackResult(),
      };
    }

    try {
      const engines = await this.getEngines();
      return {
        engines,
        fallback: {
          usedFallback: false,
          confidence: 1.0,
          retryCount: 0,
        },
      };
    } catch {
      // ADR-052 A4.3: Never throw - return fallback result
      return {
        engines: null,
        fallback: this.getFallbackResult(),
      };
    }
  }

  /**
   * Get engines synchronously if already loaded.
   *
   * @returns Coherence engines
   * @throws {WasmNotLoadedError} If WASM is not loaded
   *
   * @example
   * ```typescript
   * if (wasmLoader.isLoaded()) {
   *   const engines = wasmLoader.getEnginesSync();
   * }
   * ```
   */
  public getEnginesSync(): RawCoherenceEngines {
    if (!this.engines) {
      throw new WasmNotLoadedError(
        'WASM module is not loaded. Call getEngines() first.'
      );
    }
    return this.engines;
  }

  // ===========================================================================
  // IWasmLoader Interface Implementation
  // ===========================================================================

  /**
   * Check if WASM module is available for loading.
   * Required by IWasmLoader interface.
   *
   * @returns Promise resolving to true if WASM can be loaded
   */
  public async isAvailable(): Promise<boolean> {
    // If already loaded, it's available
    if (this.state === 'loaded' && this.wasmModule) {
      return true;
    }

    // If failed, it's not available
    if (this.state === 'failed') {
      return false;
    }

    // Try to detect if WASM file exists
    try {
      const require = createRequire(import.meta.url);
      const wasmPaths = [
        (() => {
          try {
            const modulePath = require.resolve('prime-radiant-advanced-wasm');
            return join(dirname(modulePath), 'prime_radiant_advanced_wasm_bg.wasm');
          } catch {
            return null;
          }
        })(),
        join(process.cwd(), 'node_modules/prime-radiant-advanced-wasm/prime_radiant_advanced_wasm_bg.wasm'),
      ].filter((p): p is string => p !== null);

      for (const path of wasmPaths) {
        if (existsSync(path)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Load the WASM module.
   * Required by IWasmLoader interface.
   *
   * @returns Promise resolving to the loaded WasmModule
   */
  public async load(): Promise<WasmModule> {
    // Ensure engines are loaded (this also loads the module)
    await this.getEngines();

    if (!this.wasmModule) {
      throw new WasmNotLoadedError('WASM module failed to load');
    }

    // Return the module cast to WasmModule (they have the same structure)
    return this.wasmModule as unknown as WasmModule;
  }

  /**
   * Get the loaded WASM module synchronously.
   * Required by IWasmLoader interface.
   *
   * @returns The loaded WasmModule
   * @throws {WasmNotLoadedError} If the module is not loaded
   */
  public getModule(): WasmModule {
    if (!this.wasmModule) {
      throw new WasmNotLoadedError(
        'WASM module is not loaded. Call load() first.'
      );
    }

    return this.wasmModule as unknown as WasmModule;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Subscribe to loader events.
   *
   * @param event - Event name: 'loaded', 'error', or 'retry'
   * @param listener - Callback function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = wasmLoader.on('loaded', ({ version }) => {
   *   console.log(`Loaded version ${version}`);
   * });
   *
   * // Later, to unsubscribe:
   * unsubscribe();
   * ```
   */
  public on<E extends WasmLoaderEvent>(
    event: E,
    listener: WasmLoaderEventListener<E>
  ): () => void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener as WasmLoaderEventListener<WasmLoaderEvent>);
    }

    // Return unsubscribe function
    return () => {
      listeners?.delete(listener as WasmLoaderEventListener<WasmLoaderEvent>);
    };
  }

  /**
   * Unsubscribe from loader events.
   *
   * @param event - Event name
   * @param listener - Callback function to remove
   */
  public off<E extends WasmLoaderEvent>(
    event: E,
    listener: WasmLoaderEventListener<E>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as WasmLoaderEventListener<WasmLoaderEvent>);
    }
  }

  /**
   * Reset the loader state to allow reloading.
   *
   * This frees any loaded engines and resets the state to 'unloaded'.
   * Useful for testing or recovery scenarios.
   */
  public reset(): void {
    // Cancel any pending retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Free any loaded engines
    if (this.engines) {
      try {
        this.engines.cohomology.free();
        this.engines.spectral.free();
        this.engines.causal.free();
        this.engines.category.free();
        this.engines.hott.free();
        this.engines.quantum.free();
      } catch (error) {
        // Non-critical: WASM cleanup errors during unload
        console.debug('[WASMLoader] Cleanup error during unload:', error instanceof Error ? error.message : error);
      }
    }

    this.state = 'unloaded';
    this.wasmModule = null;
    this.engines = null;
    this.loadPromise = null;
    this.lastError = null;
    this.version = '';

    // ADR-052 A4.3: Reset fallback state
    this.fallbackState = {
      mode: 'wasm',
      consecutiveFailures: 0,
      totalActivations: 0,
      nextRetryAt: undefined,
      lastSuccessfulLoad: undefined,
    };
    this.degradedModeStartTime = null;
  }

  /**
   * ADR-052 A4.3: Force a retry of WASM loading.
   * Can be called manually to trigger an immediate retry attempt.
   *
   * @returns Promise resolving to true if WASM was loaded, false otherwise
   */
  public async forceRetry(): Promise<boolean> {
    // Cancel any pending retry
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Clear failed state to allow retry
    if (this.state === 'failed' || this.state === 'degraded') {
      this.state = 'unloaded';
      this.fallbackState.mode = 'recovering';
    }

    try {
      await this.getEngines();
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Load the WASM module with retry logic and exponential backoff.
   */
  private async loadWithRetry(): Promise<RawCoherenceEngines> {
    const { maxAttempts, baseDelayMs, maxDelayMs } = this.config;
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = performance.now();
        const engines = await this.attemptLoad();
        const loadTimeMs = performance.now() - startTime;

        // Emit success event
        this.emit('loaded', {
          version: this.version,
          loadTimeMs: Math.round(loadTimeMs * 100) / 100,
        });

        return engines;
      } catch (error) {
        lastError = toError(error);

        // Emit error event
        this.emit('error', {
          error: lastError,
          fatal: attempt >= maxAttempts,
          attempt,
        });

        if (attempt < maxAttempts) {
          // Calculate delay with exponential backoff
          const delayMs = Math.min(
            baseDelayMs * Math.pow(2, attempt - 1),
            maxDelayMs
          );

          // Emit retry event
          this.emit('retry', {
            attempt: attempt + 1,
            maxAttempts,
            delayMs,
            previousError: lastError,
          });

          // Wait before retry
          await this.sleep(delayMs);
        }
      }
    }

    // All retries exhausted
    throw new WasmLoadError(
      `Failed to load WASM module after ${maxAttempts} attempts: ${lastError.message}`,
      maxAttempts,
      lastError
    );
  }

  /**
   * Attempt to load the WASM module once.
   *
   * This method handles both Node.js and browser environments:
   * - Node.js: Uses initSync() with WASM bytes read from filesystem
   * - Browser: Uses default() async init with fetch
   */
  private async attemptLoad(): Promise<RawCoherenceEngines> {
    // Create require for ESM/CommonJS compatibility
    // Note: import.meta.url is available in ESM contexts (Node.js 18+)
    let require: NodeRequire;
    try {
      // ESM context
      require = createRequire(import.meta.url);
    } catch {
      // CommonJS fallback - use global require
      require = globalThis.require || (await import('module')).createRequire(__filename);
    }

    // Import the WASM module
    let wasmModule: PrimeRadiantWasmModule;
    try {
      // Dynamic import for the WASM module
      wasmModule = await import('prime-radiant-advanced-wasm') as unknown as PrimeRadiantWasmModule;
    } catch (importError) {
      // Fallback to require for CommonJS environments
      try {
        wasmModule = require('prime-radiant-advanced-wasm');
      } catch (requireError) {
        throw new Error(
          `Failed to import prime-radiant-advanced-wasm: ${toErrorMessage(importError)}`
        );
      }
    }

    // Determine if we're in Node.js environment
    const isNodeJs = typeof process !== 'undefined' &&
                     process.versions != null &&
                     process.versions.node != null;

    if (isNodeJs) {
      // Node.js: Use initSync with WASM bytes from filesystem
      await this.initializeForNodeJs(wasmModule, require);
    } else {
      // Browser: Use async default init with fetch
      if (wasmModule.default && typeof wasmModule.default === 'function') {
        await wasmModule.default();
      }
    }

    // Initialize the module internals if needed
    if (wasmModule.initModule && typeof wasmModule.initModule === 'function') {
      try {
        wasmModule.initModule();
      } catch {
        // initModule might throw if already initialized, which is fine
      }
    }

    // Get version
    if (wasmModule.getVersion && typeof wasmModule.getVersion === 'function') {
      this.version = wasmModule.getVersion();
    }

    this.wasmModule = wasmModule;

    // Create engine instances
    const engines: RawCoherenceEngines = {
      cohomology: new wasmModule.CohomologyEngine(),
      spectral: new wasmModule.SpectralEngine(),
      causal: new wasmModule.CausalEngine(),
      category: new wasmModule.CategoryEngine(),
      hott: new wasmModule.HoTTEngine(),
      quantum: new wasmModule.QuantumEngine(),
    };

    return engines;
  }

  /**
   * Initialize WASM module for Node.js environment.
   *
   * In Node.js, the default async init uses fetch() which isn't available.
   * Instead, we read the WASM binary from disk and use initSync().
   */
  private async initializeForNodeJs(
    wasmModule: PrimeRadiantWasmModule,
    require: NodeRequire
  ): Promise<void> {
    // Find the WASM file path
    const wasmPaths = [
      // Resolve from require - most reliable
      (() => {
        try {
          const modulePath = require.resolve('prime-radiant-advanced-wasm');
          return join(dirname(modulePath), 'prime_radiant_advanced_wasm_bg.wasm');
        } catch {
          return null;
        }
      })(),
      // Direct node_modules path from current file
      join(dirname(fileURLToPath(import.meta.url)), '../../../../node_modules/prime-radiant-advanced-wasm/prime_radiant_advanced_wasm_bg.wasm'),
      // Workspace root
      join(process.cwd(), 'node_modules/prime-radiant-advanced-wasm/prime_radiant_advanced_wasm_bg.wasm'),
    ].filter((p): p is string => p !== null);

    let wasmPath: string | null = null;
    for (const path of wasmPaths) {
      if (existsSync(path)) {
        wasmPath = path;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(
        `Could not find WASM binary. Searched paths:\n${wasmPaths.join('\n')}\n` +
        'Ensure prime-radiant-advanced-wasm is installed.'
      );
    }

    // Read WASM bytes from disk
    const wasmBytes = readFileSync(wasmPath);

    // Use initSync to initialize the module with raw bytes
    // Pass as object format to avoid deprecation warning
    if (wasmModule.initSync && typeof wasmModule.initSync === 'function') {
      wasmModule.initSync({ module: wasmBytes });
    } else {
      throw new Error('WASM module does not export initSync function');
    }
  }

  /**
   * Emit an event to all registered listeners.
   */
  private emit<E extends WasmLoaderEvent>(
    event: E,
    data: WasmLoaderEventData[E]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      // Use Array.from for ES5 compatibility
      const listenerArray = Array.from(listeners);
      for (let i = 0; i < listenerArray.length; i++) {
        try {
          (listenerArray[i] as WasmLoaderEventListener<E>)(data);
        } catch {
          // Don't let listener errors affect the loader
        }
      }
    }
  }

  /**
   * Sleep for a specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================================================================
  // ADR-052 A4.3: Fallback Mode Management
  // ===========================================================================

  /**
   * ADR-052 A4.3: Enter degraded/fallback mode after WASM load failure.
   * Logs warning, emits degraded_mode event, and schedules retry with exponential backoff.
   */
  private enterDegradedMode(error: Error): void {
    // Update state
    this.state = 'degraded';
    this.fallbackState.mode = 'fallback';
    this.fallbackState.consecutiveFailures++;
    this.fallbackState.totalActivations++;

    // Track when we entered degraded mode
    if (!this.degradedModeStartTime) {
      this.degradedModeStartTime = new Date();
    }

    // Calculate next retry time with exponential backoff (1s, 2s, 4s)
    const retryIndex = Math.min(
      this.fallbackState.consecutiveFailures - 1,
      FALLBACK_RETRY_DELAYS_MS.length - 1
    );
    const retryDelayMs = FALLBACK_RETRY_DELAYS_MS[retryIndex];
    const nextRetryAt = new Date(Date.now() + retryDelayMs);
    this.fallbackState.nextRetryAt = nextRetryAt;

    // Log warning (ADR-052 A4.3 requirement 1)
    console.warn(
      `[WasmLoader] WASM load failed, entering degraded mode. ` +
      `Retry ${this.fallbackState.consecutiveFailures}/3 in ${retryDelayMs}ms. ` +
      `Error: ${error.message}`
    );

    // Emit degraded_mode event (ADR-052 A4.3 requirement 3)
    this.emit('degraded_mode', {
      reason: 'WASM load failed after retries',
      retryCount: this.fallbackState.consecutiveFailures,
      lastError: error.message,
      activatedAt: this.degradedModeStartTime,
      nextRetryAt,
    });

    // Schedule background retry with exponential backoff (ADR-052 A4.3 requirement 4)
    // Only schedule if we haven't exceeded max retries
    if (this.fallbackState.consecutiveFailures < FALLBACK_RETRY_DELAYS_MS.length) {
      this.scheduleBackgroundRetry(retryDelayMs);
    }
  }

  /**
   * ADR-052 A4.3: Schedule a background retry of WASM loading.
   * Never blocks execution (requirement 5).
   */
  private scheduleBackgroundRetry(delayMs: number): void {
    // Clear any existing retry timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Schedule the retry (non-blocking)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.fallbackState.mode = 'recovering';

      // Attempt to reload WASM in background
      this.attemptBackgroundRecovery();
    }, delayMs);
  }

  /**
   * ADR-052 A4.3: Attempt to recover WASM in the background.
   * Called by the scheduled retry timer.
   */
  private async attemptBackgroundRecovery(): Promise<void> {
    // Reset state to allow reload attempt
    this.state = 'unloaded';
    this.loadPromise = null;

    try {
      await this.getEngines();
      // Success! emitRecoveryEvent is called in getEngines()
    } catch {
      // Still failing - enterDegradedMode will be called by getEngines()
      // which will schedule the next retry if retries remain
    }
  }

  /**
   * ADR-052 A4.3: Emit recovery event when WASM is restored after degraded mode.
   */
  private emitRecoveryEvent(): void {
    if (!this.degradedModeStartTime) return;

    const degradedDurationMs = Date.now() - this.degradedModeStartTime.getTime();

    console.info(
      `[WasmLoader] WASM recovered after ${degradedDurationMs}ms in degraded mode. ` +
      `Retry count: ${this.fallbackState.consecutiveFailures}`
    );

    this.emit('recovered', {
      degradedDurationMs,
      retryCount: this.fallbackState.consecutiveFailures,
      version: this.version,
    });

    // Reset degraded mode tracking
    this.degradedModeStartTime = null;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Default WASM loader instance (singleton).
 *
 * Use this for most cases. Create a new WasmLoader instance only if you
 * need custom configuration or isolated state.
 *
 * @example
 * ```typescript
 * import { wasmLoader } from './wasm-loader';
 *
 * const engines = await wasmLoader.getEngines();
 * ```
 */
export const wasmLoader = new WasmLoader();

// =============================================================================
// Convenience Exports
// =============================================================================

/**
 * Check if WASM is loaded (convenience function).
 *
 * @returns True if the default loader has loaded the WASM module
 */
export function isLoaded(): boolean {
  return wasmLoader.isLoaded();
}

/**
 * Get engines from the default loader (convenience function).
 *
 * @returns Promise resolving to coherence engines
 */
export async function getEngines(): Promise<RawCoherenceEngines> {
  return wasmLoader.getEngines();
}

/**
 * Create a custom loader with specific configuration.
 *
 * @param config - Loader configuration
 * @returns New WasmLoader instance
 *
 * @example
 * ```typescript
 * const customLoader = createLoader({
 *   maxAttempts: 5,
 *   baseDelayMs: 200,
 * });
 * ```
 */
export function createLoader(config: Partial<WasmLoaderConfig>): WasmLoader {
  return new WasmLoader(config);
}

// =============================================================================
// ADR-052 A4.3: Fallback Convenience Exports
// =============================================================================

/**
 * Check if the default loader is in degraded mode (convenience function).
 *
 * @returns True if operating with fallback logic
 */
export function isInDegradedMode(): boolean {
  return wasmLoader.isInDegradedMode();
}

/**
 * Get the fallback state from the default loader (convenience function).
 *
 * @returns Current fallback state
 */
export function getFallbackState(): FallbackState {
  return wasmLoader.getFallbackState();
}

/**
 * Get engines with fallback from the default loader (convenience function).
 * NEVER throws - returns fallback result on failure.
 *
 * @returns Object with engines (or null) and fallback information
 */
export async function getEnginesWithFallback(): Promise<{
  engines: RawCoherenceEngines | null;
  fallback: FallbackResult;
}> {
  return wasmLoader.getEnginesWithFallback();
}

export default wasmLoader;
