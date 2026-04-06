/**
 * Agentic QE v3 - Token Optimizer Service
 * ADR-042: Wires EarlyExitTokenOptimizer into the execution flow
 *
 * This service provides a singleton interface for token optimization,
 * integrating with PatternStore and TokenMetricsCollector.
 */

import { randomUUID } from 'crypto';
import { EarlyExitTokenOptimizer, EarlyExitConfig, EarlyExitResult, EarlyExitTask, ReuseStats, DEFAULT_EARLY_EXIT_CONFIG } from './early-exit-token-optimizer.js';
import { type IPatternStore, createPatternStore } from '../learning/pattern-store.js';
import { TokenMetricsCollector, formatDashboardSummary } from '../learning/token-tracker.js';
import { getSessionCache, type SessionCacheStats } from './session-cache.js';
import type { MemoryBackend } from '../kernel/interfaces.js';
import type { QEPattern, QEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// Service Configuration
// ============================================================================

/**
 * Token optimizer service configuration
 */
export interface TokenOptimizerServiceConfig {
  /** Enable the optimizer (default: true) */
  enabled: boolean;

  /** Early exit configuration */
  earlyExit: Partial<EarlyExitConfig>;

  /** Log verbose output */
  verbose: boolean;
}

const DEFAULT_SERVICE_CONFIG: TokenOptimizerServiceConfig = {
  enabled: true,
  earlyExit: DEFAULT_EARLY_EXIT_CONFIG,
  verbose: false,
};

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Singleton service for token optimization.
 * Wires EarlyExitTokenOptimizer into the system.
 *
 * Lazy lifecycle (fix/init-v3-9-3 Fix 2):
 *   initialize()  — stores config + backend, marks service as registered.
 *                   Does NOT open patterns.rvf / memory.db. Safe to call on
 *                   every CLI invocation including `aqe init`.
 *   ensurePatternStoreReady() — lazy first-use path. Creates the pattern
 *                   store and optimizer on demand when checkEarlyExit or
 *                   storePattern is first called.
 *
 * Commands that never hit the early-exit path (init, status, --version,
 * --help, health, hooks, daemon) no longer grab RVF/SQLite locks at all.
 */
class TokenOptimizerServiceImpl {
  private optimizer: EarlyExitTokenOptimizer | null = null;
  private patternStore: IPatternStore | null = null;
  private config: TokenOptimizerServiceConfig = DEFAULT_SERVICE_CONFIG;
  private initialized = false;
  private readyPromise: Promise<void> | null = null;
  private memoryBackend: MemoryBackend | null = null;

  /**
   * Register the service with a memory backend and config.
   *
   * This is intentionally cheap: it only stores references. The pattern
   * store and optimizer are created lazily on first use via
   * `ensurePatternStoreReady()`. See fix/init-v3-9-3 Fix 2.
   */
  async initialize(
    memoryBackend: MemoryBackend,
    config?: Partial<TokenOptimizerServiceConfig>
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Clear any stale lazy state from a previous lifecycle. Tests
    // commonly reset by poking (service as any).initialized = false
    // without touching the new lazy fields (readyPromise, patternStore,
    // optimizer, memoryBackend). Re-initializing must always start from
    // a clean slate to avoid picking up a resolved/rejected promise
    // bound to a disposed memory backend.
    this.readyPromise = null;
    this.patternStore = null;
    this.optimizer = null;

    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
    this.memoryBackend = memoryBackend;
    this.initialized = true;

    if (this.config.verbose) {
      console.log('[TokenOptimizerService] Registered (lazy — pattern store not yet created)');
    }
  }

  /**
   * Lazily create the pattern store + optimizer on first use.
   *
   * Idempotent and race-safe: concurrent callers share one promise.
   * If creation fails, the service stays in a "registered but unready"
   * state and returns no_matching_pattern for all queries.
   */
  private async ensurePatternStoreReady(): Promise<void> {
    if (this.optimizer) return;
    if (!this.initialized || !this.config.enabled || !this.memoryBackend) return;
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = (async () => {
      try {
        this.patternStore = createPatternStore(this.memoryBackend!);
        await this.patternStore.initialize();
        this.optimizer = new EarlyExitTokenOptimizer(this.patternStore, this.config.earlyExit);
        if (this.config.verbose) {
          console.log('[TokenOptimizerService] Pattern store ready (lazy init)');
        }
      } catch (error) {
        console.warn('[TokenOptimizerService] Lazy pattern store init failed:', error);
        // Leave optimizer null — service degrades to session-cache-only mode.
      }
    })();
    return this.readyPromise;
  }

  /**
   * Check if a task can use a cached pattern instead of LLM call.
   * This is the main entry point for token optimization.
   *
   * @param task - Task description and context
   * @returns Early exit result with pattern and savings info
   */
  async checkEarlyExit(task: EarlyExitTask): Promise<EarlyExitResult> {
    if (!this.initialized || !this.config.enabled) {
      return {
        canExit: false,
        reason: 'no_matching_pattern',
        explanation: 'Token optimizer service not initialized',
        searchLatencyMs: 0,
      };
    }

    // Imp-15: O(1) exact-match check via fingerprint cache BEFORE HNSW search.
    // The session cache does NOT need the pattern store — it's in-memory
    // only. This path continues to work even if lazy pattern store init
    // has not run yet.
    try {
      const cache = getSessionCache();
      const fingerprint = cache.computeFingerprint(
        task.domain ?? 'unknown',
        task.description,
        (task.context as Record<string, unknown>) ?? {},
      );
      const cached = cache.get(fingerprint);
      if (cached) {
        TokenMetricsCollector.recordEarlyExit(cached.tokensSaved);
        if (this.config.verbose) {
          console.log(
            `[TokenOptimizerService] Session cache hit: ${fingerprint.slice(0, 8)}... ` +
            `(saved ${cached.tokensSaved} tokens)`
          );
        }
        return {
          canExit: true,
          estimatedTokensSaved: cached.tokensSaved,
          confidence: 1.0,
          similarityScore: 1.0,
          reason: 'pattern_reused',
          explanation: `Session cache exact match (fingerprint: ${fingerprint.slice(0, 8)}...)`,
          searchLatencyMs: 0,
        };
      }
    } catch {
      // Graceful degradation: if session cache fails, fall through to HNSW
    }

    // Lazy first-use path: create pattern store + optimizer on demand.
    // This is the first moment a command actually needs semantic search.
    await this.ensurePatternStoreReady();
    if (!this.optimizer) {
      return {
        canExit: false,
        reason: 'no_matching_pattern',
        explanation: 'Pattern store unavailable (lazy init failed or disabled)',
        searchLatencyMs: 0,
      };
    }

    const result = await this.optimizer.checkEarlyExit(task);

    // Record early exit in TokenMetricsCollector
    if (result.canExit && result.estimatedTokensSaved) {
      TokenMetricsCollector.recordEarlyExit(result.estimatedTokensSaved);

      if (this.config.verbose) {
        console.log(
          `[TokenOptimizerService] Early exit: ${result.reusedPattern?.name} ` +
          `(saved ${result.estimatedTokensSaved} tokens)`
        );
      }
    }

    return result;
  }

  /**
   * Convenience method to check early exit for a simple task description.
   *
   * @param description - Task description
   * @param domain - Optional QE domain
   * @returns Early exit result
   */
  async checkTaskEarlyExit(
    description: string,
    domain?: QEDomain
  ): Promise<EarlyExitResult> {
    return this.checkEarlyExit({ description, domain });
  }

  /**
   * Record that a pattern reuse was successful.
   * Call this after verifying the reused pattern worked correctly.
   */
  recordSuccessfulReuse(patternId: string): void {
    if (this.optimizer) {
      this.optimizer.recordSuccessfulReuse(patternId);
    }
  }

  /**
   * Record that a pattern reuse failed.
   * Call this when a reused pattern didn't work as expected.
   */
  recordFailedReuse(patternId: string): void {
    if (this.optimizer) {
      this.optimizer.recordFailedReuse(patternId);
    }
  }

  /**
   * Store a new pattern for future reuse.
   * Call this after a successful LLM operation to enable future caching.
   */
  async storePattern(pattern: Omit<QEPattern, 'id' | 'createdAt' | 'lastUsedAt'>): Promise<string | null> {
    // Lazy first-use: storing a pattern also needs the store open.
    await this.ensurePatternStoreReady();
    if (!this.patternStore) {
      return null;
    }

    try {
      const result = await this.patternStore.store({
        ...pattern,
        id: `pattern-${Date.now()}-${randomUUID().slice(0, 8)}`,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      } as QEPattern);

      if (result.success) {
        return result.value;
      }
      return null;
    } catch (error) {
      console.warn('[TokenOptimizerService] Failed to store pattern:', error);
      return null;
    }
  }

  /**
   * Get reuse statistics
   */
  getReuseStats(): ReuseStats | null {
    if (!this.optimizer) {
      return null;
    }
    return this.optimizer.getReuseStats();
  }

  /**
   * Check if service is registered and enabled. Returns true as soon as
   * `initialize()` has been called, independently of whether the lazy
   * pattern store has actually been created yet — callers care about
   * whether the service will attempt an early-exit check, not about
   * native resource readiness.
   */
  isEnabled(): boolean {
    return this.initialized && this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<TokenOptimizerServiceConfig> {
    return { ...this.config };
  }

  /**
   * Get a compact, terminal-friendly token budget dashboard summary.
   * Delegates to the formatDashboardSummary utility from the token tracker.
   *
   * @returns Multi-line dashboard string
   */
  getDashboardSummary(): string {
    return formatDashboardSummary();
  }

  /**
   * Imp-15: Store a result in the session cache for future O(1) reuse.
   * Call this after a successful LLM execution to enable exact-match caching.
   */
  cacheOperationResult(
    domain: string,
    action: string,
    input: Record<string, unknown>,
    result: Record<string, unknown>,
    estimatedTokens: number,
  ): void {
    try {
      const cache = getSessionCache();
      const fingerprint = cache.computeFingerprint(domain, action, input);
      cache.set(fingerprint, domain, action, result, estimatedTokens);
    } catch {
      // Graceful degradation
    }
  }

  /**
   * Imp-15: Get session cache statistics (hit rate, tokens saved, cache size).
   */
  getSessionCacheStats(): SessionCacheStats {
    try {
      return getSessionCache().getStats();
    } catch {
      return { size: 0, hits: 0, misses: 0, hitRate: 0, estimatedTokensSaved: 0 };
    }
  }

  /**
   * Reset the service (useful for testing)
   */
  reset(): void {
    if (this.optimizer) {
      this.optimizer.resetStats();
    }
    this.optimizer = null;
    this.patternStore = null;
    this.initialized = false;
    this.readyPromise = null;
    this.memoryBackend = null;
    this.config = DEFAULT_SERVICE_CONFIG;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global token optimizer service instance
 */
export const TokenOptimizerService = new TokenOptimizerServiceImpl();

/**
 * Initialize the token optimizer service.
 * Should be called during application startup.
 */
export async function initializeTokenOptimizer(
  memoryBackend: MemoryBackend,
  config?: Partial<TokenOptimizerServiceConfig>
): Promise<void> {
  await TokenOptimizerService.initialize(memoryBackend, config);
}

/**
 * Re-export types for convenience
 */
export type { EarlyExitTask, EarlyExitResult, ReuseStats } from './early-exit-token-optimizer.js';
