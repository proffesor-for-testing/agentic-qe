/**
 * Agentic QE v3 - Base RL Algorithm
 *
 * Abstract base class for all RL algorithm implementations.
 * Supports Q-value persistence via QValueStore for cross-session learning.
 */

import type {
  RLAlgorithm,
  RLAlgorithmType,
  RLAlgorithmCategory,
  RLState,
  RLAction,
  RLExperience,
  RLPrediction,
  RLTrainingStats,
  RLTrainingConfig,
  RLAlgorithmInfo,
  RewardSignal,
  RewardContext,
  RewardCalculation,
  RLAlgorithmError
} from './interfaces';
import { RLTrainingError, RLPredictionError, RLConfigError } from './interfaces';
import { QValueStore } from './persistence/q-value-store.js';
import { safeJsonParse } from '../../shared/safe-json.js';
import { LoggerFactory } from '../../logging/index.js';

const logger = LoggerFactory.create('rl-base-algorithm');

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_TRAINING_CONFIG: Required<RLTrainingConfig> = {
  learningRate: 0.001,
  discountFactor: 0.99,
  episodes: 1000,
  maxSteps: 1000,
  batchSize: 32,
  replayBufferSize: 10000,
  targetUpdateFrequency: 100,
  explorationRate: 0.3,
  explorationDecay: 0.995,
  minExplorationRate: 0.01,
};

// ============================================================================
// Persistence Configuration (ADR-046)
// ============================================================================

interface PersistenceConfig {
  /** Enable Q-value persistence to SQLite */
  enabled: boolean;
  /** Agent ID for persistence (required if enabled) */
  agentId?: string;
  /** Auto-save interval in episodes (0 = disabled) */
  autoSaveInterval: number;
  /** Custom database path */
  dbPath?: string;
}

const DEFAULT_PERSISTENCE_CONFIG: PersistenceConfig = {
  enabled: false,
  autoSaveInterval: 10, // Save every 10 episodes
};

// ============================================================================
// Base Algorithm Implementation
// ============================================================================

/**
 * Abstract base class for all RL algorithms
 * Provides common functionality and enforces interface compliance
 */
export abstract class BaseRLAlgorithm implements RLAlgorithm {
  protected config: Required<RLTrainingConfig>;
  protected stats: RLTrainingStats;
  protected replayBuffer: RLExperience[] = [];
  protected episodeCount = 0;
  protected totalReward = 0;
  protected rewardHistory: number[] = [];
  protected initialized = false;
  protected rewardSignals: RewardSignal[] = [];

  // Persistence (ADR-046)
  protected persistenceConfig: PersistenceConfig;
  protected qValueStore: QValueStore | null = null;
  protected lastSaveEpisode = 0;

  constructor(
    public readonly type: RLAlgorithmType,
    public readonly category: RLAlgorithmCategory,
    config: Partial<RLTrainingConfig> = {},
    rewardSignals: RewardSignal[] = [],
    persistenceConfig: Partial<PersistenceConfig> = {}
  ) {
    this.config = { ...DEFAULT_TRAINING_CONFIG, ...config };
    this.rewardSignals = rewardSignals;
    this.persistenceConfig = { ...DEFAULT_PERSISTENCE_CONFIG, ...persistenceConfig };
    this.stats = this.createInitialStats();
  }

  // ============================================================================
  // Persistence Public API (ADR-046)
  // ============================================================================

  /**
   * Enable persistence for this algorithm instance
   */
  enablePersistence(agentId: string, dbPath?: string): void {
    this.persistenceConfig.enabled = true;
    this.persistenceConfig.agentId = agentId;
    if (dbPath) {
      this.persistenceConfig.dbPath = dbPath;
    }
  }

  /**
   * Check if persistence is enabled
   */
  isPersistenceEnabled(): boolean {
    return this.persistenceConfig.enabled && !!this.persistenceConfig.agentId;
  }

  /**
   * Get the agent ID used for persistence
   */
  getPersistenceAgentId(): string | undefined {
    return this.persistenceConfig.agentId;
  }

  // ============================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ============================================================================

  /**
   * Select action for state - must be implemented by subclass
   */
  abstract predict(state: RLState): Promise<RLPrediction>;

  /**
   * Core training logic - must be implemented by subclass
   */
  protected abstract trainCore(experiences: RLExperience[]): Promise<RLTrainingStats>;

  /**
   * Get algorithm-specific info - must be implemented by subclass
   */
  protected abstract getAlgorithmInfo(): RLAlgorithmInfo;

  // ============================================================================
  // Common Implementation
  // ============================================================================

  /**
   * Train algorithm with single experience
   */
  async train(experience: RLExperience): Promise<RLTrainingStats> {
    this.addToReplayBuffer(experience);

    if (this.replayBuffer.length >= this.config.batchSize) {
      const batch = this.sampleBatch();
      return this.trainBatch(batch);
    }

    // Return current stats even if not enough for a batch
    return this.getStats();
  }

  /**
   * Train algorithm with batch of experiences
   */
  async trainBatch(experiences: RLExperience[]): Promise<RLTrainingStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      // Update episode count
      this.episodeCount++;

      // Calculate total reward for this batch
      const batchReward = experiences.reduce((sum, exp) => sum + exp.reward, 0);
      this.totalReward += batchReward;
      this.rewardHistory.push(batchReward);

      // Keep reward history manageable
      if (this.rewardHistory.length > 1000) {
        this.rewardHistory.shift();
      }

      // Call subclass-specific training
      const stats = await this.trainCore(experiences);

      // Update stats
      this.stats = {
        ...stats,
        episode: this.episodeCount,
        totalReward: this.totalReward,
        averageReward: this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length,
        trainingTimeMs: Date.now() - startTime,
        timestamp: new Date(),
      };

      // Decay exploration rate
      this.config.explorationRate = Math.max(
        this.config.minExplorationRate,
        this.config.explorationRate * this.config.explorationDecay
      );
      this.stats.explorationRate = this.config.explorationRate;

      // ADR-046: Auto-save to persistent store if enabled
      await this.autoSaveToPersistence();

      return this.stats;
    } catch (error) {
      throw new RLTrainingError(
        `Training failed for ${this.type}: ${(error as Error).message}`,
        this.type,
        error as Error
      );
    }
  }

  /**
   * Auto-save to persistent store based on interval (ADR-046)
   */
  private async autoSaveToPersistence(): Promise<void> {
    if (!this.isPersistenceEnabled()) return;
    if (this.persistenceConfig.autoSaveInterval <= 0) return;

    const episodesSinceLastSave = this.episodeCount - this.lastSaveEpisode;
    if (episodesSinceLastSave >= this.persistenceConfig.autoSaveInterval) {
      try {
        await this.saveToStore(this.persistenceConfig.agentId!, this.qValueStore ?? undefined);
        this.lastSaveEpisode = this.episodeCount;
      } catch (error) {
        // Log but don't fail training on persistence errors
        // eslint-disable-next-line no-console
        console.warn(`[${this.type}] Auto-save failed:`, (error as Error).message);
      }
    }
  }

  /**
   * Update algorithm parameters
   */
  async update(params: Partial<RLTrainingConfig>): Promise<void> {
    const oldConfig = { ...this.config };

    // Merge new parameters
    this.config = { ...this.config, ...params };

    // Validate parameters
    if (this.config.learningRate <= 0 || this.config.learningRate > 1) {
      throw new RLConfigError(`Invalid learning rate: ${this.config.learningRate}`, this.type);
    }

    if (this.config.discountFactor < 0 || this.config.discountFactor > 1) {
      throw new RLConfigError(`Invalid discount factor: ${this.config.discountFactor}`, this.type);
    }

    if (this.config.explorationRate < 0 || this.config.explorationRate > 1) {
      throw new RLConfigError(`Invalid exploration rate: ${this.config.explorationRate}`, this.type);
    }

    // Allow subclasses to handle parameter updates
    await this.handleConfigUpdate(oldConfig, this.config);
  }

  /**
   * Get current training statistics
   */
  getStats(): RLTrainingStats {
    return { ...this.stats };
  }

  /**
   * Reset algorithm state
   * Saves to persistence before resetting if enabled (ADR-046)
   */
  async reset(): Promise<void> {
    // ADR-046: Save current state before resetting
    if (this.isPersistenceEnabled() && this.episodeCount > 0) {
      await this.saveToStore(this.persistenceConfig.agentId!, this.qValueStore ?? undefined);
    }

    this.replayBuffer = [];
    this.episodeCount = 0;
    this.totalReward = 0;
    this.rewardHistory = [];
    this.lastSaveEpisode = 0;
    this.config.explorationRate = DEFAULT_TRAINING_CONFIG.explorationRate;
    this.stats = this.createInitialStats();

    await this.resetAlgorithm();
  }

  /**
   * Close algorithm and release resources (ADR-046)
   * Should be called when the algorithm is no longer needed
   */
  async close(): Promise<void> {
    // Save final state if persistence is enabled
    if (this.isPersistenceEnabled() && this.episodeCount > this.lastSaveEpisode) {
      await this.saveToStore(this.persistenceConfig.agentId!, this.qValueStore ?? undefined);
    }

    // Close the QValueStore
    if (this.qValueStore) {
      await this.qValueStore.close();
      this.qValueStore = null;
    }
  }

  /**
   * Export trained model
   */
  async exportModel(): Promise<Record<string, unknown>> {
    return {
      type: this.type,
      category: this.category,
      version: this.getVersion(),
      config: this.config,
      stats: this.stats,
      replayBufferSize: this.replayBuffer.length,
      exportedAt: new Date().toISOString(),
      customData: await this.exportCustomData(),
    };
  }

  /**
   * Import trained model
   */
  async importModel(model: Record<string, unknown>): Promise<void> {
    if (model.type !== this.type) {
      throw new RLConfigError(
        `Model type mismatch: expected ${this.type}, got ${model.type}`,
        this.type
      );
    }

    if (model.category !== this.category) {
      throw new RLConfigError(
        `Algorithm category mismatch: expected ${this.category}, got ${model.category}`,
        this.type
      );
    }

    // Import config if present
    if (model.config) {
      this.config = { ...this.config, ...model.config as Partial<RLTrainingConfig> };
    }

    // Import stats if present
    if (model.stats) {
      this.stats = { ...this.stats, ...model.stats as RLTrainingStats };
    }

    // Import custom data
    if (model.customData) {
      await this.importCustomData(model.customData as Record<string, unknown>);
    }

    this.initialized = true;
  }

  /**
   * Get algorithm info
   */
  getInfo(): RLAlgorithmInfo {
    const customInfo = this.getAlgorithmInfo();
    return {
      ...customInfo,
      stats: this.stats,
      hyperparameters: {
        ...customInfo.hyperparameters,
        learningRate: this.config.learningRate,
        discountFactor: this.config.discountFactor,
        explorationRate: this.config.explorationRate,
        batchSize: this.config.batchSize,
      },
    };
  }

  // ============================================================================
  // Q-Value Persistence (ADR-046)
  // ============================================================================

  /**
   * Save model state to QValueStore for cross-session persistence
   *
   * @param agentId - Unique agent identifier
   * @param store - QValueStore instance (creates default if not provided)
   */
  async saveToStore(agentId: string, store?: QValueStore): Promise<void> {
    const qStore = store ?? new QValueStore();
    await qStore.initialize();

    // Export model data
    const modelData = await this.exportModel();

    // Store as a single JSON blob in the Q-value store
    // Use special state_key format: __model_state__
    await qStore.setQValue(
      agentId,
      '__model_state__',
      '__weights__',
      0, // Q-value not used for model storage
      undefined,
      { algorithm: this.type, domain: JSON.stringify(modelData) }
    );
  }

  /**
   * Load model state from QValueStore
   *
   * @param agentId - Unique agent identifier
   * @param store - QValueStore instance (creates default if not provided)
   * @returns true if model was loaded, false if no saved state found
   */
  async loadFromStore(agentId: string, store?: QValueStore): Promise<boolean> {
    const qStore = store ?? new QValueStore();
    await qStore.initialize();

    try {
      // Check if we have stored model data
      const qValue = await qStore.getQValue(
        agentId,
        '__model_state__',
        '__weights__',
        this.type
      );

      // If q-value is 0, we might have stored data - need to get full entry
      const entry = await qStore.getEntry(agentId, '__model_state__', '__weights__', this.type);

      if (!entry?.domain) {
        return false;
      }

      const modelData = safeJsonParse<Record<string, unknown>>(entry.domain);
      await this.importModel(modelData);
      return true;
    } catch (e) {
      logger.debug('Model load from store failed', { algorithm: this.type, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  /**
   * Store individual Q-value for tabular algorithms
   *
   * @param agentId - Agent identifier
   * @param stateKey - State representation
   * @param actionKey - Action representation
   * @param qValue - Q-value to store
   * @param reward - Last reward received
   * @param store - QValueStore instance
   */
  async storeQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    qValue: number,
    reward?: number,
    store?: QValueStore
  ): Promise<void> {
    const qStore = store ?? new QValueStore();
    await qStore.initialize();
    await qStore.setQValue(agentId, stateKey, actionKey, qValue, reward, { algorithm: this.type });
  }

  /**
   * Retrieve stored Q-value for tabular algorithms
   *
   * @param agentId - Agent identifier
   * @param stateKey - State representation
   * @param actionKey - Action representation
   * @param store - QValueStore instance
   * @returns Q-value or null if not found
   */
  async retrieveQValue(
    agentId: string,
    stateKey: string,
    actionKey: string,
    store?: QValueStore
  ): Promise<number | null> {
    const qStore = store ?? new QValueStore();
    await qStore.initialize();
    try {
      const qValue = await qStore.getQValue(agentId, stateKey, actionKey, this.type);
      return qValue;
    } catch (e) {
      logger.debug('Q-value retrieval failed', { agentId, stateKey, actionKey, error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  // ============================================================================
  // Reward Calculation
  // ============================================================================

  /**
   * Calculate composite reward from context
   */
  protected calculateReward(context: RewardContext): RewardCalculation {
    const components: Record<string, number> = {};
    let totalReward = 0;
    const reasoning: string[] = [];

    for (const signal of this.rewardSignals) {
      const value = signal.calculate(context);
      components[signal.name] = value;
      totalReward += value;

      if (value !== 0) {
        reasoning.push(`${signal.name}: ${value.toFixed(3)} (${signal.description})`);
      }
    }

    return {
      totalReward: Math.max(-1, Math.min(1, totalReward)),
      components,
      reasoning: reasoning.join('; ') || 'No reward signals triggered',
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Add experience to replay buffer
   */
  protected addToReplayBuffer(experience: RLExperience): void {
    this.replayBuffer.push(experience);

    // Maintain buffer size
    if (this.replayBuffer.length > this.config.replayBufferSize) {
      this.replayBuffer.shift();
    }
  }

  /**
   * Sample random batch from replay buffer
   */
  protected sampleBatch(batchSize?: number): RLExperience[] {
    const size = batchSize || this.config.batchSize;
    const buffer = this.replayBuffer;

    if (buffer.length === 0) return [];
    if (buffer.length <= size) return [...buffer];

    // Random sampling
    const indices = new Set<number>();
    while (indices.size < Math.min(size, buffer.length)) {
      indices.add(Math.floor(Math.random() * buffer.length));
    }

    return Array.from(indices).map((i) => buffer[i]);
  }

  /**
   * Epsilon-greedy action selection
   */
  protected epsilonGreedy<T extends RLAction>(
    explorationAction: () => T,
    exploitationAction: () => T
  ): T {
    if (Math.random() < this.config.explorationRate) {
      return explorationAction();
    }
    return exploitationAction();
  }

  /**
   * Normalize state features
   */
  protected normalizeFeatures(features: number[]): number[] {
    if (features.length === 0) return [];

    const max = Math.max(...features.map(Math.abs));
    if (max === 0) return features;

    return features.map((f) => f / max);
  }

  /**
   * Create state key for Q-table lookup
   */
  protected stateToKey(state: RLState): string {
    const featuresStr = state.features
      .map((f, i) => `${i}:${Math.round(f * 100) / 100}`)
      .join(',');
    return `${state.id}|${featuresStr}`;
  }

  // ============================================================================
  // Optional Hooks for Subclasses
  // ============================================================================

  /**
   * Initialize algorithm (called before first training)
   * Attempts to load persisted state if persistence is enabled (ADR-046)
   */
  protected async initialize(): Promise<void> {
    // ADR-046: Try to load from persistent store if enabled
    if (this.isPersistenceEnabled()) {
      await this.initializePersistence();
      const loaded = await this.loadFromStore(this.persistenceConfig.agentId!);
      if (loaded) {
        // Successfully restored from persistence
        // eslint-disable-next-line no-console
        console.log(`[${this.type}] Loaded persisted state for agent: ${this.persistenceConfig.agentId}`);
      }
    }
    this.initialized = true;
  }

  /**
   * Initialize the QValueStore for persistence (ADR-046)
   */
  private async initializePersistence(): Promise<void> {
    if (!this.qValueStore) {
      this.qValueStore = new QValueStore();
      await this.qValueStore.initialize();
    }
  }

  /**
   * Reset algorithm-specific state
   */
  protected async resetAlgorithm(): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Handle config updates
   */
  protected async handleConfigUpdate(
    oldConfig: Required<RLTrainingConfig>,
    newConfig: Required<RLTrainingConfig>
  ): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Export custom algorithm data
   */
  protected async exportCustomData(): Promise<Record<string, unknown>> {
    return {};
  }

  /**
   * Import custom algorithm data
   */
  protected async importCustomData(data: Record<string, unknown>): Promise<void> {
    // Override in subclass if needed
  }

  /**
   * Get algorithm version
   */
  protected getVersion(): string {
    return '1.0.0';
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private createInitialStats(): RLTrainingStats {
    return {
      episode: 0,
      totalReward: 0,
      averageReward: 0,
      explorationRate: this.config.explorationRate,
      trainingTimeMs: 0,
      timestamp: new Date(),
    };
  }
}
