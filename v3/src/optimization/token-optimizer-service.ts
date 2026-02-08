/**
 * Agentic QE v3 - Token Optimizer Service
 * ADR-042: Wires EarlyExitTokenOptimizer into the execution flow
 *
 * This service provides a singleton interface for token optimization,
 * integrating with PatternStore and TokenMetricsCollector.
 */

import { EarlyExitTokenOptimizer, EarlyExitConfig, EarlyExitResult, EarlyExitTask, ReuseStats, DEFAULT_EARLY_EXIT_CONFIG } from './early-exit-token-optimizer.js';
import { PatternStore, createPatternStore } from '../learning/pattern-store.js';
import { TokenMetricsCollector, formatDashboardSummary } from '../learning/token-tracker.js';
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
 */
class TokenOptimizerServiceImpl {
  private optimizer: EarlyExitTokenOptimizer | null = null;
  private patternStore: PatternStore | null = null;
  private config: TokenOptimizerServiceConfig = DEFAULT_SERVICE_CONFIG;
  private initialized = false;

  /**
   * Initialize the service with a memory backend
   */
  async initialize(
    memoryBackend: MemoryBackend,
    config?: Partial<TokenOptimizerServiceConfig>
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };

    if (!this.config.enabled) {
      if (this.config.verbose) {
        console.log('[TokenOptimizerService] Service disabled by configuration');
      }
      return;
    }

    try {
      // Create pattern store
      this.patternStore = createPatternStore(memoryBackend);
      await this.patternStore.initialize();

      // Create optimizer
      this.optimizer = new EarlyExitTokenOptimizer(this.patternStore, this.config.earlyExit);

      this.initialized = true;

      if (this.config.verbose) {
        console.log('[TokenOptimizerService] Initialized with EarlyExitTokenOptimizer');
      }
    } catch (error) {
      console.warn('[TokenOptimizerService] Failed to initialize:', error);
      // Service will operate in disabled mode
    }
  }

  /**
   * Check if a task can use a cached pattern instead of LLM call.
   * This is the main entry point for token optimization.
   *
   * @param task - Task description and context
   * @returns Early exit result with pattern and savings info
   */
  async checkEarlyExit(task: EarlyExitTask): Promise<EarlyExitResult> {
    if (!this.initialized || !this.optimizer) {
      return {
        canExit: false,
        reason: 'no_matching_pattern',
        explanation: 'Token optimizer service not initialized',
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
    if (!this.patternStore) {
      return null;
    }

    try {
      const result = await this.patternStore.store({
        ...pattern,
        id: `pattern-${Date.now()}-${Math.random().toString(36).substring(7)}`,
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
   * Check if service is initialized and enabled
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
   * Reset the service (useful for testing)
   */
  reset(): void {
    if (this.optimizer) {
      this.optimizer.resetStats();
    }
    this.optimizer = null;
    this.patternStore = null;
    this.initialized = false;
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
