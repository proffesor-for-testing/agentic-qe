/**
 * Agentic QE v3 - Consensus Engine Factory
 * MM-010: Factory functions for creating consensus engines
 *
 * Provides convenient factory functions for creating consensus engines
 * with automatic provider registration from environment variables.
 *
 * @see docs/plans/AQE_V3_IMPROVEMENTS_PLAN.md - Phase 2: Multi-Model Verification
 */

import {
  ConsensusEngine,
  ConsensusEngineConfig,
  ModelProvider,
  DEFAULT_CONSENSUS_CONFIG,
} from './interfaces';
import { ConsensusEngineImpl } from './consensus-engine';
import {
  ModelProviderRegistry,
  createProviderRegistry,
} from './model-provider';
import {
  registerProvidersFromEnv,
  registerAllProviders,
  type RegisterProvidersConfig,
} from './providers';
import { ConsensusStrategyType } from './strategies';

// ============================================================================
// Factory Configuration
// ============================================================================

/**
 * Configuration for creating a consensus engine
 */
export interface CreateConsensusEngineConfig {
  /** Engine configuration */
  engineConfig?: Partial<ConsensusEngineConfig>;

  /** Consensus strategy to use */
  strategy?: ConsensusStrategyType;

  /** Provider registry (if not provided, creates from environment) */
  registry?: ModelProviderRegistry;

  /** Manual provider configuration (overrides environment detection) */
  providers?: RegisterProvidersConfig;

  /** Specific model providers to use (overrides all other options) */
  models?: ModelProvider[];

  /** Enable logging for providers */
  enableLogging?: boolean;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a consensus engine with providers from environment variables
 *
 * Automatically detects and registers providers based on environment variables:
 * - ANTHROPIC_API_KEY: Enables Claude provider
 * - OPENAI_API_KEY: Enables OpenAI provider
 * - GOOGLE_API_KEY: Enables Gemini provider
 *
 * @param config - Optional engine configuration
 * @returns Configured consensus engine
 *
 * @example
 * ```typescript
 * // Auto-detect providers from environment
 * const engine = createConsensusEngine();
 *
 * // Verify a security finding
 * const result = await engine.verify(finding);
 * ```
 *
 * @example
 * ```typescript
 * // Custom configuration with weighted strategy
 * const engine = createConsensusEngine({
 *   engineConfig: {
 *     defaultThreshold: 0.7,
 *     minModels: 3,
 *   },
 *   strategy: 'weighted',
 *   enableLogging: true,
 * });
 * ```
 */
export function createConsensusEngine(
  config: CreateConsensusEngineConfig = {}
): ConsensusEngine {
  const {
    engineConfig = {},
    strategy = 'majority',
    registry,
    providers,
    models,
    enableLogging = false,
  } = config;

  // Create or use provided registry
  let providerRegistry: ModelProviderRegistry;

  if (registry) {
    // Use provided registry
    providerRegistry = registry;
  } else if (models && models.length > 0) {
    // Create registry from explicit models
    providerRegistry = createProviderRegistry(models);
  } else if (providers) {
    // Register providers from explicit configuration
    providerRegistry = registerAllProviders({
      ...providers,
      enableLogging: providers.enableLogging ?? enableLogging,
    });
  } else {
    // Auto-detect from environment
    providerRegistry = registerProvidersFromEnv(enableLogging);
  }

  // Merge with default config
  const finalConfig: ConsensusEngineConfig = {
    ...DEFAULT_CONSENSUS_CONFIG,
    ...engineConfig,
  };

  // Create engine
  return new ConsensusEngineImpl(providerRegistry, finalConfig, strategy);
}

/**
 * Create a consensus engine with specific providers
 *
 * @param providers - Array of model providers
 * @param config - Optional engine configuration
 * @param strategy - Consensus strategy (default: 'majority')
 * @returns Configured consensus engine
 *
 * @example
 * ```typescript
 * const claudeProvider = createClaudeProvider({ apiKey: 'sk-...' });
 * const openaiProvider = createOpenAIProvider({ apiKey: 'sk-...' });
 *
 * const engine = createConsensusEngineWithProviders(
 *   [claudeProvider, openaiProvider],
 *   { minModels: 2 },
 *   'weighted'
 * );
 * ```
 */
export function createConsensusEngineWithProviders(
  providers: ModelProvider[],
  config?: Partial<ConsensusEngineConfig>,
  strategy: ConsensusStrategyType = 'majority'
): ConsensusEngine {
  return createConsensusEngine({
    models: providers,
    engineConfig: config,
    strategy,
  });
}

/**
 * Create a consensus engine for testing with mock providers
 *
 * @param mockProviders - Array of mock providers
 * @param config - Optional engine configuration
 * @returns Consensus engine for testing
 *
 * @example
 * ```typescript
 * const mock1 = createMockProvider({ id: 'mock1', defaultAssessment: 'confirmed' });
 * const mock2 = createMockProvider({ id: 'mock2', defaultAssessment: 'confirmed' });
 *
 * const engine = createTestConsensusEngine([mock1, mock2]);
 * ```
 */
export function createTestConsensusEngine(
  mockProviders: ModelProvider[],
  config?: Partial<ConsensusEngineConfig>
): ConsensusEngine {
  return createConsensusEngineWithProviders(mockProviders, config);
}

/**
 * Create a consensus engine for critical security findings
 *
 * Uses unanimous strategy and requires all models to agree.
 * Best for high-stakes security decisions.
 *
 * @param config - Optional engine configuration
 * @returns Consensus engine with unanimous strategy
 *
 * @example
 * ```typescript
 * const engine = createCriticalConsensusEngine({
 *   engineConfig: { minModels: 3 },
 * });
 *
 * // Requires unanimous agreement
 * const result = await engine.verify(criticalFinding);
 * ```
 */
export function createCriticalConsensusEngine(
  config: CreateConsensusEngineConfig = {}
): ConsensusEngine {
  return createConsensusEngine({
    ...config,
    strategy: 'unanimous',
    engineConfig: {
      minModels: 3,
      verifySeverities: ['critical'],
      humanReviewThreshold: 0.8,
      ...config.engineConfig,
    },
  });
}

/**
 * Create a consensus engine optimized for cost efficiency
 *
 * Uses weighted strategy and configures for cost-effective operation.
 *
 * @param config - Optional engine configuration
 * @returns Cost-optimized consensus engine
 *
 * @example
 * ```typescript
 * const engine = createCostOptimizedEngine();
 * // Uses minimum models, weighted voting
 * ```
 */
export function createCostOptimizedEngine(
  config: CreateConsensusEngineConfig = {}
): ConsensusEngine {
  return createConsensusEngine({
    ...config,
    strategy: 'weighted',
    engineConfig: {
      minModels: 2,
      maxModels: 2,
      maxCostPerVerification: 0.10, // 10 cents max
      ...config.engineConfig,
    },
  });
}

/**
 * Create a consensus engine for high-accuracy verification
 *
 * Uses weighted strategy with multiple models for maximum accuracy.
 *
 * @param config - Optional engine configuration
 * @returns High-accuracy consensus engine
 *
 * @example
 * ```typescript
 * const engine = createHighAccuracyEngine();
 * // Uses 3+ models, weighted voting
 * ```
 */
export function createHighAccuracyEngine(
  config: CreateConsensusEngineConfig = {}
): ConsensusEngine {
  return createConsensusEngine({
    ...config,
    strategy: 'weighted',
    engineConfig: {
      minModels: 3,
      maxModels: 5,
      defaultThreshold: 0.75,
      humanReviewThreshold: 0.7,
      ...config.engineConfig,
    },
  });
}
