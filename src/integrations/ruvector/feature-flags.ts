/**
 * RuVector Feature Flags for V3 QE Integration
 *
 * Controls which @ruvector package features are enabled for QE operations.
 * All flags default to true but can be disabled for debugging, testing,
 * or gradual rollout scenarios.
 *
 * Note: These are enable/disable flags for feature control, NOT error hiding.
 * If a dependency fails, it throws an error - we don't silently fall back.
 *
 * @module integrations/ruvector/feature-flags
 */

// ============================================================================
// Feature Flags Interface
// ============================================================================

/**
 * Feature flags controlling @ruvector package usage in QE
 *
 * @example
 * ```typescript
 * import { setRuVectorFeatureFlags, getRuVectorFeatureFlags } from './feature-flags';
 *
 * // Disable SONA for debugging
 * setRuVectorFeatureFlags({ useQESONA: false });
 *
 * // Check current flags
 * const flags = getRuVectorFeatureFlags();
 * if (flags.useQEFlashAttention) {
 *   // Use Flash Attention for similarity computation
 * }
 * ```
 */
export interface RuVectorFeatureFlags {
  /**
   * Enable QE SONA (Self-Optimizing Neural Architecture)
   * Uses @ruvector/sona for pattern learning and adaptation
   * @default true
   */
  useQESONA: boolean;

  /**
   * Enable QE Flash Attention
   * Uses @ruvector/attention for SIMD-accelerated attention computation
   * @default true
   */
  useQEFlashAttention: boolean;

  /**
   * Enable QE GNN Embedding Index
   * Uses @ruvector/gnn for differentiable search and HNSW indexing
   * @default true
   */
  useQEGNNIndex: boolean;

  /**
   * Log migration metrics when transitioning between implementations
   * Useful for tracking performance differences during rollout
   * @default true
   */
  logMigrationMetrics: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default feature flags - all enabled by default
 */
const DEFAULT_FEATURE_FLAGS: RuVectorFeatureFlags = {
  useQESONA: true,
  useQEFlashAttention: true,
  useQEGNNIndex: true,
  logMigrationMetrics: true,
};

// ============================================================================
// Internal State
// ============================================================================

/**
 * Current feature flags state (mutable for runtime configuration)
 */
let currentFeatureFlags: RuVectorFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

// ============================================================================
// Public API
// ============================================================================

/**
 * Get current RuVector feature flags
 *
 * @returns Current feature flag configuration (immutable copy)
 *
 * @example
 * ```typescript
 * const flags = getRuVectorFeatureFlags();
 * console.log(`SONA enabled: ${flags.useQESONA}`);
 * console.log(`Flash Attention enabled: ${flags.useQEFlashAttention}`);
 * console.log(`GNN Index enabled: ${flags.useQEGNNIndex}`);
 * ```
 */
export function getRuVectorFeatureFlags(): Readonly<RuVectorFeatureFlags> {
  return { ...currentFeatureFlags };
}

/**
 * Set RuVector feature flags
 *
 * Updates the current feature flags with the provided partial configuration.
 * Only specified flags are changed; others retain their current values.
 *
 * @param flags - Partial feature flag configuration to merge
 *
 * @example
 * ```typescript
 * // Disable SONA for debugging
 * setRuVectorFeatureFlags({ useQESONA: false });
 *
 * // Enable metrics logging only
 * setRuVectorFeatureFlags({
 *   useQESONA: false,
 *   useQEFlashAttention: false,
 *   useQEGNNIndex: false,
 *   logMigrationMetrics: true,
 * });
 * ```
 */
export function setRuVectorFeatureFlags(
  flags: Partial<RuVectorFeatureFlags>
): void {
  currentFeatureFlags = {
    ...currentFeatureFlags,
    ...flags,
  };
}

/**
 * Reset RuVector feature flags to defaults
 *
 * Restores all feature flags to their default values (all enabled).
 * Useful for cleanup after tests or debugging sessions.
 *
 * @example
 * ```typescript
 * // After tests
 * afterEach(() => {
 *   resetRuVectorFeatureFlags();
 * });
 * ```
 */
export function resetRuVectorFeatureFlags(): void {
  currentFeatureFlags = { ...DEFAULT_FEATURE_FLAGS };
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check if SONA is enabled
 * @returns true if useQESONA flag is set
 */
export function isSONAEnabled(): boolean {
  return currentFeatureFlags.useQESONA;
}

/**
 * Check if Flash Attention is enabled
 * @returns true if useQEFlashAttention flag is set
 */
export function isFlashAttentionEnabled(): boolean {
  return currentFeatureFlags.useQEFlashAttention;
}

/**
 * Check if GNN Index is enabled
 * @returns true if useQEGNNIndex flag is set
 */
export function isGNNIndexEnabled(): boolean {
  return currentFeatureFlags.useQEGNNIndex;
}

/**
 * Check if migration metrics logging is enabled
 * @returns true if logMigrationMetrics flag is set
 */
export function shouldLogMigrationMetrics(): boolean {
  return currentFeatureFlags.logMigrationMetrics;
}

// ============================================================================
// Environment Variable Support
// ============================================================================

/**
 * Initialize feature flags from environment variables
 *
 * Reads the following environment variables:
 * - RUVECTOR_USE_SONA: 'true'/'false'
 * - RUVECTOR_USE_FLASH_ATTENTION: 'true'/'false'
 * - RUVECTOR_USE_GNN_INDEX: 'true'/'false'
 * - RUVECTOR_LOG_MIGRATION_METRICS: 'true'/'false'
 *
 * @example
 * ```typescript
 * // In application startup
 * initFeatureFlagsFromEnv();
 * ```
 */
export function initFeatureFlagsFromEnv(): void {
  const envFlags: Partial<RuVectorFeatureFlags> = {};

  if (process.env.RUVECTOR_USE_SONA !== undefined) {
    envFlags.useQESONA = process.env.RUVECTOR_USE_SONA === 'true';
  }

  if (process.env.RUVECTOR_USE_FLASH_ATTENTION !== undefined) {
    envFlags.useQEFlashAttention = process.env.RUVECTOR_USE_FLASH_ATTENTION === 'true';
  }

  if (process.env.RUVECTOR_USE_GNN_INDEX !== undefined) {
    envFlags.useQEGNNIndex = process.env.RUVECTOR_USE_GNN_INDEX === 'true';
  }

  if (process.env.RUVECTOR_LOG_MIGRATION_METRICS !== undefined) {
    envFlags.logMigrationMetrics = process.env.RUVECTOR_LOG_MIGRATION_METRICS === 'true';
  }

  setRuVectorFeatureFlags(envFlags);
}

// ============================================================================
// Export Default Flags
// ============================================================================

export { DEFAULT_FEATURE_FLAGS };
