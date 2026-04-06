/**
 * HNSW Adapter
 *
 * Wraps ProgressiveHnswBackend and provides backward-compatible APIs for
 * existing callers that use InMemoryHNSWIndex or RuvectorFlatIndex interfaces.
 *
 * Named indexes: patterns, qe-memory, learning, coverage
 *
 * @see ADR-071: HNSW Implementation Unification
 * @module kernel/hnsw-adapter
 */

import type {
  IHnswIndexProvider,
  SearchResult,
  HnswConfig,
} from './hnsw-index-provider.js';
import { DEFAULT_HNSW_CONFIG } from './hnsw-index-provider.js';
import { ProgressiveHnswBackend } from './progressive-hnsw-backend.js';
import { NativeHnswBackend, NativeHnswUnavailableError } from './native-hnsw-backend.js';
import { isNativeHNSWEnabled, isHnswHealthMonitorEnabled } from '../integrations/ruvector/feature-flags.js';
import type { HnswHealthMonitor, HnswHealthReport } from '../integrations/ruvector/hnsw-health-monitor.js';

// ============================================================================
// Named Index Registry
// ============================================================================

/**
 * Well-known index names used across the AQE platform.
 */
export type HnswIndexName = 'patterns' | 'qe-memory' | 'learning' | 'coverage';

/**
 * Default configurations for each named index.
 */
const INDEX_DEFAULTS: Record<HnswIndexName, Partial<HnswConfig>> = {
  'patterns': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
  'qe-memory': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
  'learning': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 50,
    metric: 'cosine',
  },
  'coverage': {
    dimensions: 384,
    M: 16,
    efConstruction: 200,
    efSearch: 100,
    metric: 'cosine',
  },
};

// ============================================================================
// Singleton Registry
// ============================================================================

const registry: Map<string, IHnswIndexProvider> = new Map();

// ============================================================================
// HnswAdapter
// ============================================================================

/**
 * Adapter that wraps ProgressiveHnswBackend (or NativeHnswBackend when
 * the useNativeHNSW feature flag is enabled) and provides backward-compatible
 * APIs matching the old InMemoryHNSWIndex and RuvectorFlatIndex interfaces.
 *
 * This adapter bridges the gap between the new IHnswIndexProvider interface
 * and existing callers that use string-based IDs and number[] vectors.
 */
export class HnswAdapter implements IHnswIndexProvider {
  private readonly backend: IHnswIndexProvider;
  private readonly _isNativeBackend: boolean;
  private readonly indexName: string;

  /** Maps string keys to numeric IDs (for backward compat with old APIs) */
  private stringToNumericId: Map<string, number> = new Map();
  private numericToStringId: Map<number, string> = new Map();
  private nextAutoId = 0;

  /** Health monitor (lazily created when feature flag is enabled) */
  private healthMonitor: HnswHealthMonitor | null = null;
  private healthMonitorLoaded: boolean = false;
  private operationsSinceLastCheck: number = 0;
  private healthCheckFrequency: number = 100;
  private lastHealthReport: HnswHealthReport | null = null;

  constructor(name: string, config?: Partial<HnswConfig>) {
    this.indexName = name;
    const defaults = INDEX_DEFAULTS[name as HnswIndexName] ?? {};
    const mergedConfig = { ...defaults, ...config };
    const { backend, isNative } = HnswAdapter.createBackend(mergedConfig);
    this.backend = backend;
    this._isNativeBackend = isNative;
  }

  // ============================================================================
  // IHnswIndexProvider implementation
  // ============================================================================

  add(
    id: number,
    vector: Float32Array,
    metadata?: Record<string, unknown>
  ): void {
    this.backend.add(id, vector, metadata);
    this.maybeRunHealthCheck();
  }

  search(query: Float32Array, k: number): SearchResult[] {
    const start = performance.now();
    const results = this.backend.search(query, k);
    const elapsed = performance.now() - start;
    if (elapsed > 50) {
      console.warn(`[HNSW] search took ${elapsed.toFixed(1)}ms (k=${k}, results=${results.length})`);
    }
    this._lastSearchLatencyMs = elapsed;
    return results;
  }

  /** Last search latency in ms, for instrumentation */
  private _lastSearchLatencyMs = 0;
  get lastSearchLatencyMs(): number { return this._lastSearchLatencyMs; }

  remove(id: number): boolean {
    return this.backend.remove(id);
  }

  size(): number {
    return this.backend.size();
  }

  dimensions(): number {
    return this.backend.dimensions();
  }

  recall(): number {
    return this.backend.recall();
  }

  // ============================================================================
  // Backward-compatible APIs (InMemoryHNSWIndex style: string IDs, number[])
  // ============================================================================

  /**
   * Add a vector using a string ID (backward compat with InMemoryHNSWIndex).
   *
   * @param id - String identifier
   * @param embedding - Vector as number[]
   */
  addByStringId(id: string, embedding: number[]): void {
    let numericId = this.stringToNumericId.get(id);
    if (numericId !== undefined) {
      // Update existing
      this.backend.remove(numericId);
    } else {
      numericId = this.nextAutoId++;
      this.stringToNumericId.set(id, numericId);
      this.numericToStringId.set(numericId, id);
    }
    this.backend.add(numericId, new Float32Array(embedding));
  }

  /**
   * Search using a number[] query (backward compat with InMemoryHNSWIndex).
   *
   * @param query - Query vector as number[]
   * @param k - Number of results
   * @returns Results with string IDs and scores
   */
  searchByArray(
    query: number[],
    k: number
  ): Array<{ id: string; score: number }> {
    const results = this.backend.search(new Float32Array(query), k);
    return results.map((r) => ({
      id: this.numericToStringId.get(r.id) ?? String(r.id),
      score: r.score,
    }));
  }

  /**
   * Remove by string ID (backward compat with InMemoryHNSWIndex).
   */
  removeByStringId(id: string): boolean {
    const numericId = this.stringToNumericId.get(id);
    if (numericId === undefined) return false;
    const removed = this.backend.remove(numericId);
    if (removed) {
      this.stringToNumericId.delete(id);
      this.numericToStringId.delete(numericId);
    }
    return removed;
  }

  /**
   * Clear all vectors from the index.
   */
  clear(): void {
    this.backend.clear?.();
    this.stringToNumericId.clear();
    this.numericToStringId.clear();
    this.nextAutoId = 0;
  }

  /**
   * Dispose of the underlying backend and release native resources.
   *
   * After dispose(), this adapter instance must not be used. Callers
   * should invoke `HnswAdapter.close(name)` rather than calling this
   * directly — `close()` also removes the entry from the registry so
   * the next `HnswAdapter.create(name)` call builds a fresh backend.
   */
  dispose(): void {
    try {
      this.backend.dispose?.();
    } catch {
      // Best-effort — a failing dispose must not throw during teardown.
    }
    this.stringToNumericId.clear();
    this.numericToStringId.clear();
    this.nextAutoId = 0;
  }

  /**
   * Check whether @ruvector/gnn is available.
   */
  isRuvectorAvailable(): boolean {
    if (this.backend instanceof ProgressiveHnswBackend) {
      return this.backend.isRuvectorAvailable();
    }
    // NativeHnswBackend uses @ruvector/router VectorDb
    if (this.backend instanceof NativeHnswBackend) {
      return this.backend.isNativeAvailable();
    }
    return false;
  }

  /**
   * Check whether this adapter is using the native HNSW backend.
   */
  isNativeBackend(): boolean {
    return this._isNativeBackend;
  }

  /**
   * Get the index name.
   */
  getName(): string {
    return this.indexName;
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Set the health check frequency (number of operations between checks).
   * Only applies when the useHnswHealthMonitor feature flag is enabled.
   *
   * @param frequency - Number of add/remove operations between health checks
   */
  setHealthCheckFrequency(frequency: number): void {
    this.healthCheckFrequency = Math.max(1, frequency);
  }

  /**
   * Get the health check frequency.
   */
  getHealthCheckFrequency(): number {
    return this.healthCheckFrequency;
  }

  /**
   * Get the last health report, or null if no check has run.
   */
  getLastHealthReport(): HnswHealthReport | null {
    return this.lastHealthReport;
  }

  /**
   * Get the health monitor instance, or null if not enabled.
   */
  getHealthMonitor(): HnswHealthMonitor | null {
    return this.healthMonitor;
  }

  /**
   * Conditionally run a health check based on operation count and feature flag.
   * Non-blocking: runs asynchronously to avoid slowing operations.
   */
  private maybeRunHealthCheck(): void {
    if (!isHnswHealthMonitorEnabled()) return;

    this.operationsSinceLastCheck++;
    if (this.operationsSinceLastCheck < this.healthCheckFrequency) return;

    this.operationsSinceLastCheck = 0;
    this.ensureHealthMonitor();

    if (this.healthMonitor) {
      try {
        this.lastHealthReport = this.healthMonitor.checkHealth(this.backend);
        if (!this.lastHealthReport.healthy) {
          console.warn(
            `[HNSW-Health] Index "${this.indexName}" health check failed: ` +
            `${this.lastHealthReport.alerts.length} alert(s). ` +
            `Coherence: ${this.lastHealthReport.metrics.coherenceScore.toFixed(3)}`
          );
        }
      } catch (err: unknown) {
        // Health checks must never break normal operations
        console.warn(`[HNSW-Health] Health check error for "${this.indexName}":`, err);
      }
    }
  }

  /**
   * Lazily load and create the health monitor.
   */
  private ensureHealthMonitor(): void {
    if (this.healthMonitorLoaded) return;
    this.healthMonitorLoaded = true;

    try {
      // Dynamic import to avoid circular dependencies and keep startup fast
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../integrations/ruvector/hnsw-health-monitor.js');
      this.healthMonitor = mod.createHnswHealthMonitor();
    } catch (err) {
      // Module not available, health monitoring disabled
      if (process.env.DEBUG) console.debug('[HNSW-Health] Monitor module unavailable:', err instanceof Error ? err.message : err);
      this.healthMonitor = null;
    }
  }

  // ============================================================================
  // Backend Selection
  // ============================================================================

  /**
   * Create the appropriate HNSW backend based on feature flags.
   *
   * When useNativeHNSW is enabled, tries to create a NativeHnswBackend.
   * Falls back to ProgressiveHnswBackend if the native binary is unavailable.
   *
   * @param config - HNSW configuration
   * @returns The backend instance and whether it is native
   */
  private static createBackend(
    config: Partial<HnswConfig>
  ): { backend: IHnswIndexProvider; isNative: boolean } {
    if (isNativeHNSWEnabled()) {
      try {
        const native = new NativeHnswBackend(config);
        return { backend: native, isNative: true };
      } catch (err: unknown) {
        if (err instanceof NativeHnswUnavailableError) {
          // Expected: native binary not available, fall back silently
          console.info(
            `[HNSW] Native backend unavailable, falling back to JS: ${err.message}`
          );
        } else {
          // Unexpected error, log warning and fall back
          console.warn(
            `[HNSW] Unexpected error creating native backend, falling back to JS:`,
            err
          );
        }
      }
    }

    return { backend: new ProgressiveHnswBackend(config), isNative: false };
  }

  // ============================================================================
  // Factory
  // ============================================================================

  /**
   * Create or retrieve a named HNSW index.
   *
   * Uses a singleton registry so the same name always returns the same instance.
   *
   * @param name - Index name (e.g. 'patterns', 'qe-memory', 'learning', 'coverage')
   * @param config - Optional configuration overrides
   * @returns IHnswIndexProvider instance
   */
  static create(name: string, config?: Partial<HnswConfig>): HnswAdapter {
    const existing = registry.get(name);
    if (existing instanceof HnswAdapter) {
      return existing;
    }

    const adapter = new HnswAdapter(name, config);
    registry.set(name, adapter);
    return adapter;
  }

  /**
   * Get an existing named index, or undefined if not created.
   */
  static get(name: string): HnswAdapter | undefined {
    const existing = registry.get(name);
    return existing instanceof HnswAdapter ? existing : undefined;
  }

  /**
   * Close and remove a named index from the registry.
   *
   * Disposes the underlying backend (releasing any native handles) and
   * removes the registry entry so the next `HnswAdapter.create(name)`
   * call builds a fresh backend. This is the correct teardown path when
   * a parent manager (e.g. UnifiedMemoryManager) is being reset.
   */
  static close(name: string): void {
    const existing = registry.get(name);
    if (existing instanceof HnswAdapter) {
      existing.dispose();
    }
    registry.delete(name);
  }

  /**
   * Close all named indexes.
   */
  static closeAll(): void {
    for (const [name] of registry) {
      HnswAdapter.close(name);
    }
    registry.clear();
  }

  /**
   * List all registered index names.
   */
  static listIndexes(): string[] {
    return Array.from(registry.keys());
  }
}
