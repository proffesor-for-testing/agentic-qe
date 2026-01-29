/**
 * Coordination Module Constants
 *
 * Centralizes all magic numbers used in coordination components including
 * consensus engine, model providers, MinCut algorithms, and task execution.
 *
 * @see ADR-047: MinCut Graph Snapshots
 * @see MM-001: Multi-Model Consensus
 */

// ============================================================================
// Consensus Engine Constants
// ============================================================================

export const CONSENSUS_CONSTANTS = {
  /**
   * Default timeout for model inference calls in milliseconds.
   * 60 seconds allows for complex reasoning tasks.
   */
  MODEL_TIMEOUT_MS: 60000, // 1 minute

  /**
   * Extended timeout for Ollama local models (can be slower).
   * 5 minutes accommodates larger models on consumer hardware.
   */
  OLLAMA_TIMEOUT_MS: 300000, // 5 minutes

  /**
   * Connection test timeout for Ollama server.
   * Quick check to verify server is reachable.
   */
  OLLAMA_CONNECTION_TEST_TIMEOUT_MS: 10000,

  /**
   * Health check timeout for model availability.
   * 5 seconds for quick availability verification.
   */
  HEALTH_CHECK_TIMEOUT_MS: 5000,

  /**
   * Cache duration for health check results.
   * 1 minute prevents excessive health polling.
   */
  HEALTH_CACHE_TTL_MS: 60000, // 1 minute

  /**
   * Default retry delay between failed API calls.
   * 1 second provides reasonable backoff.
   */
  DEFAULT_RETRY_DELAY_MS: 1000,

  /**
   * Extended retry delay for Ollama (local model issues).
   * 2 seconds allows for model loading.
   */
  OLLAMA_RETRY_DELAY_MS: 2000,

  /**
   * Default number of retry attempts for failed operations.
   */
  DEFAULT_RETRY_ATTEMPTS: 3,

  /**
   * Default maximum tokens for consensus verification prompts.
   */
  DEFAULT_MAX_TOKENS: 4096,

  /**
   * Maximum context tokens for Ollama num_ctx.
   */
  OLLAMA_CONTEXT_SIZE: 4096,

  /**
   * Small token limit for quick classification tasks.
   */
  CLASSIFICATION_MAX_TOKENS: 10,
} as const;

// ============================================================================
// Task Execution Constants
// ============================================================================

export const TASK_CONSTANTS = {
  /**
   * Default task execution timeout in milliseconds.
   * 60 seconds covers most task types.
   */
  DEFAULT_TASK_TIMEOUT_MS: 60000, // 1 minute

  /**
   * Extended timeout for long-running tasks.
   * 2 minutes for complex multi-step operations.
   */
  EXTENDED_TASK_TIMEOUT_MS: 120000, // 2 minutes

  /**
   * Short timeout for quick operations.
   * 30 seconds for simple tasks.
   */
  QUICK_TASK_TIMEOUT_MS: 30000, // 30 seconds

  /**
   * Very short timeout for health checks.
   * 10 seconds for quick verification.
   */
  HEALTH_CHECK_TIMEOUT_MS: 10000,

  /**
   * Default estimated task duration for unknown tasks.
   * 5 seconds as baseline estimate.
   */
  DEFAULT_ESTIMATED_DURATION_MS: 5000,

  /**
   * Default available time for time-boxed operations.
   * 1 minute window for batch operations.
   */
  DEFAULT_AVAILABLE_TIME_MS: 60000, // 1 minute

  /**
   * Threshold for considering a task as "large batch".
   * Tasks with more items may need consensus verification.
   */
  LARGE_BATCH_THRESHOLD: 10,

  /**
   * Maximum workers for parallel execution.
   */
  MAX_WORKERS: 32,
} as const;

// ============================================================================
// MinCut Algorithm Constants
// ============================================================================

export const MINCUT_CONSTANTS = {
  /**
   * Default history window for MinCut statistics.
   * 1 hour provides recent performance data.
   */
  DEFAULT_HISTORY_WINDOW_MS: 3600000, // 1 hour

  /**
   * Extended history window for healing success rate.
   * 24 hours provides longer-term trend data.
   */
  HEALING_HISTORY_WINDOW_MS: 86400000, // 24 hours

  /**
   * Default prediction accuracy window in iterations.
   */
  PREDICTION_ACCURACY_WINDOW: 100,

  /**
   * Maximum number of health listeners per domain.
   */
  MAX_HEALTH_LISTENERS: 100,
} as const;

// ============================================================================
// Learning Configuration Constants
// ============================================================================

export const LEARNING_CONSTANTS = {
  /**
   * Minimum similarity threshold for pattern matching.
   * 0.85 ensures high-quality pattern matches.
   */
  MIN_PATTERN_SIMILARITY: 0.85,

  /**
   * State size for reinforcement learning models.
   */
  DEFAULT_STATE_SIZE: 10,

  /**
   * Hidden layer configuration for neural networks.
   */
  HIDDEN_LAYER_SIZE: 64,

  /**
   * Maximum patterns to cache in memory.
   */
  MAX_CACHED_PATTERNS: 5000,

  /**
   * Auto-save interval for pattern persistence.
   * 1 minute prevents data loss.
   */
  AUTO_SAVE_INTERVAL_MS: 60000, // 1 minute

  /**
   * Default training interval for online learning.
   */
  TRAINING_INTERVAL: 10,

  /**
   * Context length for sequence models.
   */
  CONTEXT_LENGTH: 10,

  /**
   * Embedding dimension for feature vectors.
   */
  EMBEDDING_DIM: 128,
} as const;

// ============================================================================
// Ollama Server Constants
// ============================================================================

export const OLLAMA_CONSTANTS = {
  /**
   * Default Ollama server URL.
   */
  DEFAULT_BASE_URL: 'http://localhost:11434',

  /**
   * Default Ollama server port.
   */
  DEFAULT_PORT: 11434,
} as const;

// ============================================================================
// Confidence Thresholds
// ============================================================================

export const CONFIDENCE_CONSTANTS = {
  /**
   * High confidence threshold for model assessments.
   * Above 80% indicates strong certainty.
   */
  HIGH_CONFIDENCE_THRESHOLD: 0.8,

  /**
   * Medium confidence threshold for model assessments.
   * 50-79% indicates moderate certainty.
   */
  MEDIUM_CONFIDENCE_THRESHOLD: 0.5,

  /**
   * Threshold for triggering consensus verification.
   * 0.85 ensures only high-impact decisions need verification.
   */
  CONSENSUS_VERIFICATION_THRESHOLD: 0.85,

  /**
   * Factor for scaling confidence with batch size.
   * Larger batches require higher confidence.
   */
  BATCH_CONFIDENCE_SCALE: 100,
} as const;

// Type exports for const assertion inference
export type ConsensusConstants = typeof CONSENSUS_CONSTANTS;
export type TaskConstants = typeof TASK_CONSTANTS;
export type MincutConstants = typeof MINCUT_CONSTANTS;
export type LearningConstants = typeof LEARNING_CONSTANTS;
export type OllamaConstants = typeof OLLAMA_CONSTANTS;
export type ConfidenceConstants = typeof CONFIDENCE_CONSTANTS;
