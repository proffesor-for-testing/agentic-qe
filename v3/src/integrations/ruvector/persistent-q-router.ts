/**
 * Agentic QE v3 - Persistent Q-Learning Router for RuVector Integration
 *
 * Wraps RuVectorQLearningRouter with SQLite persistence via QValueStore.
 * Q-values survive across sessions, enabling continuous learning.
 *
 * Features:
 * - Loads Q-values from SQLite on initialization
 * - Persists Q-value updates after routing decisions
 * - EWC++ configuration for future catastrophic forgetting prevention
 * - Thread-safe singleton pattern
 *
 * @example
 * ```typescript
 * import { createPersistentQLearningRouter } from '@agentic-qe/v3/integrations/ruvector';
 *
 * const router = await createPersistentQLearningRouter({
 *   enabled: true,
 *   agentId: 'qe-router-1',
 * });
 *
 * // Q-values persist across sessions
 * const result = await router.routeTask(task);
 * await router.provideFeedback(task.id, { success: true, durationMs: 100, quality: 0.9 });
 * ```
 */

import type {
  QLearningRouter,
  QLearningState,
  QLearningAction,
  TestTask,
  AgentRoutingResult,
  RuVectorConfig,
} from './interfaces';
import { RuVectorQLearningRouter, type QLearningParams, createQLearningRouterSync } from './q-learning-router';
import { QValueStore, type QValueStoreConfig, createQValueStore } from '../rl-suite/persistence/q-value-store';
import type { RLAlgorithmType } from '../rl-suite/interfaces';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// EWC++ Configuration (ADR-046: Future Catastrophic Forgetting Prevention)
// ============================================================================

/**
 * Elastic Weight Consolidation++ configuration
 *
 * EWC++ prevents catastrophic forgetting during continual learning by:
 * 1. Computing Fisher Information Matrix to identify important weights
 * 2. Adding regularization term to preserve critical learned parameters
 * 3. Periodic consolidation to merge old and new knowledge
 *
 * NOTE: This is a configuration structure for future implementation.
 * Current version stores Q-values directly without EWC++ regularization.
 */
export interface EWCConfig {
  /** Enable EWC++ regularization (default: false - not yet implemented) */
  enabled: boolean;

  /**
   * Regularization strength (lambda)
   * Higher values = stronger preservation of old knowledge
   * Typical range: 100-10000
   * Default: 1000
   */
  lambda: number;

  /**
   * Interval between consolidation cycles in milliseconds
   * Consolidation computes Fisher Information and updates importance weights
   * Default: 300000 (5 minutes)
   */
  consolidationInterval: number;

  /**
   * Number of samples for Fisher Information estimation
   * More samples = more accurate importance estimation, but slower
   * Default: 200
   */
  fisherSampleSize: number;

  /**
   * Decay factor for old Fisher Information
   * Used in online EWC++ to blend old and new importance estimates
   * Range: 0.0-1.0, higher = more weight on recent estimates
   * Default: 0.9
   */
  fisherDecay: number;

  /**
   * Minimum improvement threshold for consolidation
   * Only consolidate if performance improvement > threshold
   * Default: 0.01 (1% improvement)
   */
  consolidationThreshold: number;
}

/**
 * Default EWC++ configuration
 */
export const DEFAULT_EWC_CONFIG: EWCConfig = {
  enabled: false, // Not yet implemented
  lambda: 1000,
  consolidationInterval: 5 * 60 * 1000, // 5 minutes
  fisherSampleSize: 200,
  fisherDecay: 0.9,
  consolidationThreshold: 0.01,
};

// ============================================================================
// Persistent Q-Learning Router Configuration
// ============================================================================

/**
 * Configuration for persistent Q-Learning router
 */
export interface PersistentQLearningRouterConfig {
  /** RuVector configuration */
  ruvectorConfig: RuVectorConfig;

  /** Q-Learning hyperparameters */
  qLearningParams?: Partial<QLearningParams>;

  /** Agent ID for Q-value storage (used as partition key) */
  agentId: string;

  /** RL algorithm type for Q-value storage */
  algorithm?: RLAlgorithmType;

  /** Domain tag for Q-value storage */
  domain?: string;

  /** EWC++ configuration for catastrophic forgetting prevention */
  ewcConfig?: Partial<EWCConfig>;

  /** Auto-save interval in milliseconds (0 = save on every update) */
  autoSaveInterval?: number;

  /** Whether to load Q-values on initialization */
  loadOnInit?: boolean;
}

/**
 * Default persistent router configuration
 */
export const DEFAULT_PERSISTENT_CONFIG: Omit<PersistentQLearningRouterConfig, 'ruvectorConfig' | 'agentId'> = {
  algorithm: 'q-learning',
  domain: 'test-routing',
  autoSaveInterval: 0, // Save on every update
  loadOnInit: true,
  qLearningParams: {},
  ewcConfig: DEFAULT_EWC_CONFIG,
};

// ============================================================================
// Persistent Q-Learning Router Implementation
// ============================================================================

/**
 * @deprecated Use `createQLearningRouter()` instead, which provides direct persistence
 * to the `rl_q_values` table without the overhead of QValueStore abstraction.
 * PersistentQLearningRouter wraps RuVectorQLearningRouter with QValueStore but
 * EWC++ is NOT implemented and the full Q-table export on every feedback is O(n).
 * Direct persistence in RuVectorQLearningRouter does O(1) upserts per update.
 *
 * This class is kept for backward compatibility but is no longer used by
 * DefaultRuVectorClient as of this change.
 */
export class PersistentQLearningRouter implements QLearningRouter {
  private readonly baseRouter: QLearningRouter;
  private readonly qValueStore: QValueStore;
  private readonly config: Required<Omit<PersistentQLearningRouterConfig, 'ruvectorConfig' | 'qLearningParams'>> & {
    ruvectorConfig: RuVectorConfig;
    qLearningParams: Partial<QLearningParams>;
  };
  private readonly ewcConfig: EWCConfig;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingSaves: Map<string, { stateKey: string; actionKey: string; qValue: number; reward?: number }> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private lastConsolidation: Date | null = null;

  constructor(config: PersistentQLearningRouterConfig, qValueStore?: QValueStore) {
    // Merge with defaults, ensuring all required fields have values
    // Note: Spread preserves undefined, so we explicitly fall back to defaults
    this.config = {
      ruvectorConfig: config.ruvectorConfig,
      agentId: config.agentId,
      algorithm: config.algorithm ?? DEFAULT_PERSISTENT_CONFIG.algorithm ?? 'q-learning',
      domain: config.domain ?? DEFAULT_PERSISTENT_CONFIG.domain ?? 'test-routing',
      autoSaveInterval: config.autoSaveInterval ?? DEFAULT_PERSISTENT_CONFIG.autoSaveInterval ?? 0,
      loadOnInit: config.loadOnInit ?? DEFAULT_PERSISTENT_CONFIG.loadOnInit ?? true,
      qLearningParams: config.qLearningParams ?? DEFAULT_PERSISTENT_CONFIG.qLearningParams ?? {},
      ewcConfig: { ...DEFAULT_EWC_CONFIG, ...config.ewcConfig },
    };
    this.ewcConfig = { ...DEFAULT_EWC_CONFIG, ...config.ewcConfig };

    // Create base router using sync version (for constructor use)
    this.baseRouter = createQLearningRouterSync(config.ruvectorConfig, config.qLearningParams);

    // Use provided QValueStore or create new one (dependency injection)
    this.qValueStore = qValueStore ?? createQValueStore();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the router and load Q-values from SQLite
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use Promise lock to prevent concurrent initialization
    if (!this.initPromise) {
      this.initPromise = this._doInitialize();
    }

    return this.initPromise;
  }

  /**
   * Internal initialization implementation
   */
  private async _doInitialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize QValueStore
      await this.qValueStore.initialize();

      // Load existing Q-values into base router
      if (this.config.loadOnInit) {
        await this.loadQValues();
      }

      this.initialized = true;
      console.log(`[PersistentQLearningRouter] Initialized: agent=${this.config.agentId}, algorithm=${this.config.algorithm}`);
    } catch (error) {
      this.initPromise = null;
      throw new Error(
        `Failed to initialize PersistentQLearningRouter: ${toErrorMessage(error)}`
      );
    }
  }

  /**
   * Load Q-values from SQLite into base router
   */
  private async loadQValues(): Promise<void> {
    const qTable = await this.qValueStore.exportForAgent(
      this.config.agentId,
      this.config.algorithm
    );

    if (qTable.size > 0) {
      // Convert to model format and import into base router
      const model: Record<string, unknown> = {
        type: 'ruvector-qlearning',
        version: '1.0',
        qTable: Object.fromEntries(
          Array.from(qTable.entries()).map(([stateKey, actionMap]) => [
            stateKey,
            Object.fromEntries(actionMap),
          ])
        ),
        episodeCount: 0, // Will be updated from stored value
      };

      await this.baseRouter.importModel(model);
      console.log(`[PersistentQLearningRouter] Loaded ${qTable.size} state entries from SQLite`);
    }
  }

  // ==========================================================================
  // QLearningRouter Interface Implementation
  // ==========================================================================

  /**
   * Route a test task to optimal agent using Q-Learning
   * Persists Q-value updates after routing
   */
  async routeTask(task: TestTask): Promise<AgentRoutingResult> {
    this.ensureInitialized();

    const result = await this.baseRouter.routeTask(task);

    // Q-values are updated during feedback, not during routing
    // This ensures we learn from actual outcomes, not predictions

    return result;
  }

  /**
   * Batch route multiple tasks
   */
  async routeTasks(tasks: TestTask[]): Promise<AgentRoutingResult[]> {
    this.ensureInitialized();
    return Promise.all(tasks.map((task) => this.routeTask(task)));
  }

  /**
   * Provide feedback for Q-Learning update and persist to SQLite
   */
  async provideFeedback(
    taskId: string,
    result: { success: boolean; durationMs: number; quality: number }
  ): Promise<void> {
    this.ensureInitialized();

    // Update base router (in-memory Q-values)
    await this.baseRouter.provideFeedback(taskId, result);

    // Export updated Q-values and persist to SQLite
    const model = await this.baseRouter.exportModel();
    const qTableObj = model.qTable as Record<string, Record<string, number>> | undefined;

    if (qTableObj) {
      await this.persistQValues(qTableObj, this.calculateReward(result));
    }

    // Check if EWC++ consolidation is needed
    if (this.ewcConfig.enabled) {
      await this.checkConsolidation();
    }
  }

  /**
   * Get Q-value for state-action pair
   */
  getQValue(state: QLearningState, action: QLearningAction): number {
    this.ensureInitialized();
    return this.baseRouter.getQValue(state, action);
  }

  /**
   * Reset learning state (clears both in-memory and persisted Q-values)
   */
  async reset(): Promise<void> {
    this.ensureInitialized();

    // Reset base router
    await this.baseRouter.reset();

    // Clear pending saves
    this.pendingSaves.clear();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // Note: We don't delete from SQLite to allow recovery
    // Use pruneOldEntries() for cleanup
    console.log(`[PersistentQLearningRouter] Reset: agent=${this.config.agentId}`);
  }

  /**
   * Export learned model (includes persisted Q-values)
   */
  async exportModel(): Promise<Record<string, unknown>> {
    this.ensureInitialized();

    const baseModel = await this.baseRouter.exportModel();

    return {
      ...baseModel,
      persistence: {
        agentId: this.config.agentId,
        algorithm: this.config.algorithm,
        domain: this.config.domain,
        dbPath: this.qValueStore.getDbPath(),
      },
      ewcConfig: this.ewcConfig,
      lastConsolidation: this.lastConsolidation?.toISOString(),
    };
  }

  /**
   * Import learned model and persist to SQLite
   */
  async importModel(model: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();

    // Import into base router
    await this.baseRouter.importModel(model);

    // Persist to SQLite
    const qTableObj = model.qTable as Record<string, Record<string, number>> | undefined;
    if (qTableObj) {
      await this.persistQValues(qTableObj);
    }
  }

  // ==========================================================================
  // Persistence Methods
  // ==========================================================================

  /**
   * Persist Q-values to SQLite
   */
  private async persistQValues(
    qTableObj: Record<string, Record<string, number>>,
    lastReward?: number
  ): Promise<void> {
    const entries: Array<{ stateKey: string; actionKey: string; qValue: number }> = [];

    for (const [stateKey, actionObj] of Object.entries(qTableObj)) {
      for (const [actionKey, qValue] of Object.entries(actionObj)) {
        entries.push({ stateKey, actionKey, qValue });
      }
    }

    if (this.config.autoSaveInterval === 0) {
      // Immediate save
      await this.saveQValues(entries, lastReward);
    } else {
      // Batch saves
      for (const entry of entries) {
        const key = `${entry.stateKey}|${entry.actionKey}`;
        this.pendingSaves.set(key, { ...entry, reward: lastReward });
      }
      this.scheduleSave();
    }
  }

  /**
   * Save Q-values to SQLite
   */
  private async saveQValues(
    entries: Array<{ stateKey: string; actionKey: string; qValue: number }>,
    reward?: number
  ): Promise<void> {
    for (const entry of entries) {
      await this.qValueStore.setQValue(
        this.config.agentId,
        entry.stateKey,
        entry.actionKey,
        entry.qValue,
        reward,
        {
          algorithm: this.config.algorithm,
          domain: this.config.domain,
        }
      );
    }
  }

  /**
   * Schedule batched save
   */
  private scheduleSave(): void {
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      const entries = Array.from(this.pendingSaves.values());
      this.pendingSaves.clear();

      if (entries.length > 0) {
        const reward = entries[0]?.reward;
        await this.saveQValues(
          entries.map((e) => ({ stateKey: e.stateKey, actionKey: e.actionKey, qValue: e.qValue })),
          reward
        );
      }
    }, this.config.autoSaveInterval);
  }

  // ==========================================================================
  // EWC++ Methods (Future Implementation)
  // ==========================================================================

  /**
   * Check if EWC++ consolidation is needed
   *
   * NOTE: Actual EWC++ implementation is pending.
   * This method currently just tracks consolidation timing.
   */
  private async checkConsolidation(): Promise<void> {
    if (!this.ewcConfig.enabled) return;

    const now = new Date();
    const timeSinceLastConsolidation = this.lastConsolidation
      ? now.getTime() - this.lastConsolidation.getTime()
      : Infinity;

    if (timeSinceLastConsolidation >= this.ewcConfig.consolidationInterval) {
      await this.runConsolidation();
    }
  }

  /**
   * Run EWC++ consolidation
   *
   * NOTE: This is a placeholder for future EWC++ implementation.
   * Currently just updates the timestamp.
   */
  private async runConsolidation(): Promise<void> {
    console.log(`[PersistentQLearningRouter] EWC++ consolidation triggered (not yet implemented)`);
    this.lastConsolidation = new Date();
  }

  /**
   * Get EWC++ configuration
   */
  getEWCConfig(): EWCConfig {
    return { ...this.ewcConfig };
  }

  /**
   * Update EWC++ configuration
   */
  setEWCConfig(config: Partial<EWCConfig>): void {
    Object.assign(this.ewcConfig, config);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Calculate reward from feedback result
   */
  private calculateReward(result: { success: boolean; durationMs: number; quality: number }): number {
    let reward = 0;

    // Success is primary factor
    if (result.success) {
      reward += 0.5;
    } else {
      reward -= 0.3;
    }

    // Quality bonus
    reward += result.quality * 0.3;

    // Speed bonus (faster is better, up to 0.2)
    const speedBonus = Math.max(0, 1 - result.durationMs / 60000) * 0.2;
    reward += speedBonus;

    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Ensure router is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PersistentQLearningRouter not initialized. Call initialize() first.');
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.config.agentId;
  }

  /**
   * Get Q-value statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    uniqueStates: number;
    averageQValue: number;
    averageVisits: number;
  }> {
    const stats = await this.qValueStore.getStats();
    return {
      totalEntries: stats.totalEntries,
      uniqueStates: stats.uniqueStates,
      averageQValue: stats.averageQValue,
      averageVisits: stats.averageVisits,
    };
  }

  /**
   * Close the router (does NOT close the shared QValueStore)
   */
  async close(): Promise<void> {
    // Flush pending saves
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.pendingSaves.size > 0) {
      const entries = Array.from(this.pendingSaves.values());
      this.pendingSaves.clear();
      await this.saveQValues(
        entries.map((e) => ({ stateKey: e.stateKey, actionKey: e.actionKey, qValue: e.qValue })),
        entries[0]?.reward
      );
    }

    this.initialized = false;
    console.log(`[PersistentQLearningRouter] Closed: agent=${this.config.agentId}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a persistent Q-Learning router
 *
 * @example
 * ```typescript
 * // Create with default configuration
 * const router = await createPersistentQLearningRouter({
 *   ruvectorConfig: { enabled: true },
 *   agentId: 'qe-router-1',
 * });
 *
 * // Create with custom EWC++ config
 * const routerWithEWC = await createPersistentQLearningRouter({
 *   ruvectorConfig: { enabled: true },
 *   agentId: 'qe-router-2',
 *   ewcConfig: {
 *     enabled: true,
 *     lambda: 5000,
 *     consolidationInterval: 60000,
 *   },
 * });
 * ```
 */
export async function createPersistentQLearningRouter(
  config: PersistentQLearningRouterConfig,
  qValueStore?: QValueStore
): Promise<PersistentQLearningRouter> {
  const router = new PersistentQLearningRouter(config, qValueStore);
  await router.initialize();
  return router;
}

/**
 * Create a persistent Q-Learning router synchronously (must call initialize() manually)
 */
export function createPersistentQLearningRouterSync(
  config: PersistentQLearningRouterConfig,
  qValueStore?: QValueStore
): PersistentQLearningRouter {
  return new PersistentQLearningRouter(config, qValueStore);
}
