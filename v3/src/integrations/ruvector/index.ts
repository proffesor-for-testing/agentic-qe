/**
 * Agentic QE v3 - RuVector Integration
 *
 * RuVector provides ML-based code intelligence for QE.
 * This is an OPTIONAL dependency - all features work without it.
 *
 * Integration Points per ADR-017:
 * | RuVector Feature      | QE Application                    |
 * |----------------------|-----------------------------------|
 * | Q-Learning Router    | Route test tasks to optimal agents|
 * | AST Complexity       | Prioritize tests by code complexity|
 * | Diff Risk Classification | Target tests at high-risk changes |
 * | Coverage Routing     | Test coverage-aware agent selection|
 * | Graph Boundaries     | Focus integration tests at module boundaries |
 *
 * @example
 * ```typescript
 * import { createRuVectorClient, RuVectorConfig } from '@agentic-qe/v3/integrations/ruvector';
 *
 * // Create client with optional RuVector
 * const client = await createRuVectorClient({
 *   enabled: true,  // Set to false for fallback-only mode
 *   endpoint: 'http://localhost:8080',
 *   fallbackEnabled: true,
 * });
 *
 * // All methods work with or without RuVector
 * const router = client.getQLearningRouter();
 * const result = await router.routeTask(task); // Uses ML or fallback
 * ```
 */

// ============================================================================
// Public Interfaces
// ============================================================================

export type {
  // Configuration
  RuVectorConfig,
  RuVectorHealthResult,
  RuVectorConnectionStatus,

  // Client Interface
  RuVectorClient,

  // Q-Learning Router
  QLearningRouter,
  QLearningState,
  QLearningAction,
  TestTask,
  AgentRoutingResult,

  // AST Complexity
  ASTComplexityAnalyzer,
  FileComplexityResult,
  ComplexityMetrics,

  // Diff Risk Classifier
  DiffRiskClassifier,
  RiskClassification,
  DiffContext,
  FileChange,

  // Coverage Router
  CoverageRouter,
  CoverageRoutingResult,
  FileCoverage,
  CoverageGap,

  // Graph Boundaries
  GraphBoundariesAnalyzer,
  GraphBoundariesResult,
  ModuleBoundary,
  BoundaryCrossing,
  ModuleDependency,
} from './interfaces';

// Export constants
export { DEFAULT_RUVECTOR_CONFIG } from './interfaces';

// Export errors
export {
  RuVectorError,
  RuVectorUnavailableError,
  RuVectorTimeoutError,
  RuVectorConfigError,
} from './interfaces';

// ============================================================================
// Factory Functions
// ============================================================================

export { createQLearningRouter } from './q-learning-router';
export { createASTComplexityAnalyzer } from './ast-complexity';
export { createDiffRiskClassifier } from './diff-risk-classifier';
export { createCoverageRouter } from './coverage-router';
export { createGraphBoundariesAnalyzer } from './graph-boundaries';
export { createFallbackComponents } from './fallback';

// ============================================================================
// Implementation Classes (for advanced usage)
// ============================================================================

export { RuVectorQLearningRouter, type QLearningParams } from './q-learning-router';
export { RuVectorASTComplexityAnalyzer, type ComplexityThresholds } from './ast-complexity';
export { RuVectorDiffRiskClassifier, type RiskPatterns } from './diff-risk-classifier';
export { RuVectorCoverageRouter, type CoverageThresholds } from './coverage-router';
export { RuVectorGraphBoundariesAnalyzer, type GraphConfig } from './graph-boundaries';

// Fallback implementations
export {
  FallbackQLearningRouter,
  FallbackASTComplexityAnalyzer,
  FallbackDiffRiskClassifier,
  FallbackCoverageRouter,
  FallbackGraphBoundariesAnalyzer,
} from './fallback';

// ============================================================================
// Client Factory
// ============================================================================

import type {
  RuVectorConfig,
  RuVectorClient,
  RuVectorHealthResult,
  QLearningRouter,
  ASTComplexityAnalyzer,
  DiffRiskClassifier,
  CoverageRouter,
  GraphBoundariesAnalyzer,
} from './interfaces';
import { DEFAULT_RUVECTOR_CONFIG, RuVectorUnavailableError } from './interfaces';
import { createQLearningRouter } from './q-learning-router';
import { createASTComplexityAnalyzer } from './ast-complexity';
import { createDiffRiskClassifier } from './diff-risk-classifier';
import { createCoverageRouter } from './coverage-router';
import { createGraphBoundariesAnalyzer } from './graph-boundaries';

/**
 * Default RuVector client implementation
 * Provides unified access to all RuVector features with graceful fallback
 */
class DefaultRuVectorClient implements RuVectorClient {
  private readonly config: Required<RuVectorConfig>;
  private _qLearningRouter: QLearningRouter | null = null;
  private _astComplexityAnalyzer: ASTComplexityAnalyzer | null = null;
  private _diffRiskClassifier: DiffRiskClassifier | null = null;
  private _coverageRouter: CoverageRouter | null = null;
  private _graphBoundaries: GraphBoundariesAnalyzer | null = null;
  private _initialized = false;
  private _available: boolean | null = null;
  private _lastHealthCheck: RuVectorHealthResult | null = null;

  constructor(config: Partial<RuVectorConfig> = {}) {
    this.config = { ...DEFAULT_RUVECTOR_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Check RuVector availability
    this._available = await this.checkAvailability();

    // Initialize components (they handle fallback internally)
    this._qLearningRouter = createQLearningRouter(this.config);
    this._astComplexityAnalyzer = createASTComplexityAnalyzer(this.config);
    this._diffRiskClassifier = createDiffRiskClassifier(this.config);
    this._coverageRouter = createCoverageRouter(this.config);
    this._graphBoundaries = createGraphBoundariesAnalyzer(this.config);

    this._initialized = true;
  }

  async dispose(): Promise<void> {
    this._qLearningRouter = null;
    this._astComplexityAnalyzer = null;
    this._diffRiskClassifier = null;
    this._coverageRouter = null;
    this._graphBoundaries = null;
    this._initialized = false;
    this._available = null;
  }

  async isAvailable(): Promise<boolean> {
    if (this._available !== null) return this._available;
    this._available = await this.checkAvailability();
    return this._available;
  }

  async getHealth(): Promise<RuVectorHealthResult> {
    const lastChecked = new Date();

    if (!this.config.enabled) {
      return {
        status: 'unavailable',
        features: ['fallback-only'],
        lastChecked,
        error: 'RuVector is disabled by configuration',
      };
    }

    try {
      const isAvailable = await this.isAvailable();

      if (isAvailable) {
        this._lastHealthCheck = {
          status: 'connected',
          version: '1.0.0', // Would come from actual RuVector
          features: [
            'q-learning-router',
            'ast-complexity',
            'diff-risk-classifier',
            'coverage-router',
            'graph-boundaries',
          ],
          latencyMs: 10, // Would be measured
          lastChecked,
        };
      } else {
        this._lastHealthCheck = {
          status: 'disconnected',
          features: ['fallback-only'],
          lastChecked,
          error: 'RuVector service not reachable',
        };
      }
    } catch (error) {
      this._lastHealthCheck = {
        status: 'error',
        features: ['fallback-only'],
        lastChecked,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    return this._lastHealthCheck;
  }

  getQLearningRouter(): QLearningRouter {
    this.ensureInitialized();
    return this._qLearningRouter!;
  }

  getASTComplexityAnalyzer(): ASTComplexityAnalyzer {
    this.ensureInitialized();
    return this._astComplexityAnalyzer!;
  }

  getDiffRiskClassifier(): DiffRiskClassifier {
    this.ensureInitialized();
    return this._diffRiskClassifier!;
  }

  getCoverageRouter(): CoverageRouter {
    this.ensureInitialized();
    return this._coverageRouter!;
  }

  getGraphBoundaries(): GraphBoundariesAnalyzer {
    this.ensureInitialized();
    return this._graphBoundaries!;
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new RuVectorUnavailableError(
        'RuVector client not initialized. Call initialize() first.'
      );
    }
  }

  private async checkAvailability(): Promise<boolean> {
    if (!this.config.enabled) return false;

    // In a real implementation, this would check if RuVector service is reachable
    // For now, we simulate availability based on configuration
    try {
      // Simulate availability check
      // Would actually ping this.config.endpoint
      return this.config.enabled;
    } catch {
      return false;
    }
  }
}

/**
 * Create a RuVector client with optional ML capabilities
 *
 * @example
 * ```typescript
 * // Full ML capabilities (when RuVector is available)
 * const client = await createRuVectorClient({ enabled: true });
 *
 * // Fallback-only mode (no ML, rule-based logic)
 * const fallbackClient = await createRuVectorClient({ enabled: false });
 *
 * // Both work the same way:
 * const router = client.getQLearningRouter();
 * const result = await router.routeTask(task);
 * console.log(result.usedFallback); // true if RuVector unavailable
 * ```
 */
export async function createRuVectorClient(
  config: Partial<RuVectorConfig> = {}
): Promise<RuVectorClient> {
  const client = new DefaultRuVectorClient(config);
  await client.initialize();
  return client;
}

/**
 * Create a RuVector client synchronously (must call initialize() manually)
 */
export function createRuVectorClientSync(
  config: Partial<RuVectorConfig> = {}
): RuVectorClient {
  return new DefaultRuVectorClient(config);
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Quick check if RuVector integration is available
 */
export async function isRuVectorAvailable(
  config: Partial<RuVectorConfig> = {}
): Promise<boolean> {
  if (!config.enabled && config.enabled !== undefined) return false;

  const client = await createRuVectorClient(config);
  try {
    return await client.isAvailable();
  } finally {
    await client.dispose();
  }
}

/**
 * Get RuVector status summary
 */
export async function getRuVectorStatus(
  config: Partial<RuVectorConfig> = {}
): Promise<{
  available: boolean;
  mode: 'ml' | 'fallback';
  features: string[];
}> {
  const client = await createRuVectorClient(config);
  try {
    const health = await client.getHealth();
    return {
      available: health.status === 'connected',
      mode: health.status === 'connected' ? 'ml' : 'fallback',
      features: health.features,
    };
  } finally {
    await client.dispose();
  }
}

// ============================================================================
// @ruvector Package Wrappers (SONA, Flash Attention, GNN)
// ============================================================================

// QE Wrappers for @ruvector packages
export * from './wrappers';

// ============================================================================
// Service Provider (Dependency Injection)
// ============================================================================

export {
  RuVectorServiceProvider,
  getDomainRuVectorServices,
  getRuVectorProvider,
  getRuVectorServiceAvailability,
  type RuVectorServiceConfig,
} from './provider';

// ============================================================================
// Feature Flags
// ============================================================================

export {
  getRuVectorFeatureFlags,
  setRuVectorFeatureFlags,
  resetRuVectorFeatureFlags,
  isSONAEnabled,
  isFlashAttentionEnabled,
  isGNNIndexEnabled,
  shouldLogMigrationMetrics,
  initFeatureFlagsFromEnv,
  DEFAULT_FEATURE_FLAGS,
  type RuVectorFeatureFlags,
} from './feature-flags';
