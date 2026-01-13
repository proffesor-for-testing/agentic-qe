/**
 * RuVector Service Provider for V3 QE Dependency Injection
 *
 * Provides centralized access to @ruvector package services (SONA, Flash Attention, GNN)
 * with lazy instantiation, domain-specific configurations, and feature flag integration.
 *
 * @module integrations/ruvector/provider
 */

import type { DomainName } from '../../shared/types/index.js';
import type { EmbeddingDimension } from '../embeddings/base/types.js';
import {
  QESONA,
  createQESONA,
  createDomainQESONA,
  type QESONAConfig,
  QEFlashAttention,
  createQEFlashAttention,
  type QEFlashAttentionConfig,
  type QEWorkloadType,
  QEGNNEmbeddingIndex,
  type QEGNNLayerConfig,
} from './wrappers.js';
import {
  getRuVectorFeatureFlags,
  isSONAEnabled,
  isFlashAttentionEnabled,
  isGNNIndexEnabled,
  shouldLogMigrationMetrics,
} from './feature-flags.js';

// ============================================================================
// Configuration Interface
// ============================================================================

/**
 * Configuration for RuVector service provider
 *
 * @example
 * ```typescript
 * const config: RuVectorServiceConfig = {
 *   sonaEnabled: true,
 *   flashAttentionEnabled: true,
 *   gnnEnabled: true,
 *   defaultSONAConfig: { hiddenDim: 256 },
 *   defaultWorkload: 'test-similarity',
 * };
 * ```
 */
export interface RuVectorServiceConfig {
  /**
   * Enable SONA (Self-Optimizing Neural Architecture) service
   * Uses @ruvector/sona for pattern learning
   * @default true
   */
  sonaEnabled: boolean;

  /**
   * Enable Flash Attention service
   * Uses @ruvector/attention for SIMD-accelerated computation
   * @default true
   */
  flashAttentionEnabled: boolean;

  /**
   * Enable GNN Index service
   * Uses @ruvector/gnn for differentiable search
   * @default true
   */
  gnnEnabled: boolean;

  /**
   * Default SONA configuration for new instances
   */
  defaultSONAConfig?: Partial<QESONAConfig>;

  /**
   * Default Flash Attention workload type
   * @default 'test-similarity'
   */
  defaultWorkload?: QEWorkloadType;

  /**
   * Default Flash Attention configuration
   */
  defaultFlashAttentionConfig?: Partial<QEFlashAttentionConfig>;

  /**
   * Default GNN layer configuration
   */
  defaultGNNLayerConfig?: QEGNNLayerConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default service provider configuration
 */
const DEFAULT_SERVICE_CONFIG: RuVectorServiceConfig = {
  sonaEnabled: true,
  flashAttentionEnabled: true,
  gnnEnabled: true,
  defaultWorkload: 'test-similarity',
  defaultSONAConfig: {
    hiddenDim: 256,
    embeddingDim: 384,
    microLoraRank: 1,
    baseLoraRank: 8,
  },
  defaultGNNLayerConfig: {
    inputDim: 384,
    hiddenDim: 256,
    heads: 8,
    dropout: 0.1,
  },
};

// ============================================================================
// Domain Services Container
// ============================================================================

/**
 * Container for domain-specific RuVector services
 */
interface DomainServices {
  sona: QESONA | null;
  gnnIndex: QEGNNEmbeddingIndex | null;
}

// ============================================================================
// RuVector Service Provider (Singleton)
// ============================================================================

/**
 * Singleton service provider for @ruvector package integrations
 *
 * Provides centralized, lazy-instantiated access to:
 * - QESONA: Pattern learning and adaptation
 * - QEFlashAttention: SIMD-accelerated attention computation
 * - QEGNNEmbeddingIndex: Differentiable search with HNSW
 *
 * @example
 * ```typescript
 * // Get singleton instance
 * const provider = RuVectorServiceProvider.getInstance();
 *
 * // Configure (optional)
 * provider.configure({ sonaEnabled: true, gnnEnabled: false });
 *
 * // Get services
 * const sona = provider.getSONAForDomain('test-generation');
 * const flashAttn = await provider.getFlashAttention('test-similarity');
 * const gnnIndex = provider.getGNNIndex();
 * ```
 */
export class RuVectorServiceProvider {
  private static instance: RuVectorServiceProvider | null = null;

  private config: RuVectorServiceConfig;
  private globalSONA: QESONA | null = null;
  private globalFlashAttention: Map<QEWorkloadType, QEFlashAttention> = new Map();
  private globalGNNIndex: QEGNNEmbeddingIndex | null = null;
  private domainServices: Map<DomainName, DomainServices> = new Map();
  private initialized = false;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config?: Partial<RuVectorServiceConfig>) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
  }

  /**
   * Get singleton instance of RuVectorServiceProvider
   *
   * @param config - Optional configuration (only used on first call)
   * @returns Singleton provider instance
   *
   * @example
   * ```typescript
   * const provider = RuVectorServiceProvider.getInstance();
   *
   * // With initial config (only applies on first call)
   * const provider = RuVectorServiceProvider.getInstance({
   *   sonaEnabled: true,
   *   defaultWorkload: 'code-embedding',
   * });
   * ```
   */
  static getInstance(config?: Partial<RuVectorServiceConfig>): RuVectorServiceProvider {
    if (!RuVectorServiceProvider.instance) {
      RuVectorServiceProvider.instance = new RuVectorServiceProvider(config);
    }
    return RuVectorServiceProvider.instance;
  }

  /**
   * Reset singleton instance (for testing)
   *
   * @internal
   */
  static resetInstance(): void {
    if (RuVectorServiceProvider.instance) {
      RuVectorServiceProvider.instance.dispose();
    }
    RuVectorServiceProvider.instance = null;
  }

  /**
   * Configure the service provider
   *
   * Updates configuration and clears cached instances if needed.
   *
   * @param config - Partial configuration to merge
   *
   * @example
   * ```typescript
   * provider.configure({
   *   sonaEnabled: false,  // Disable SONA
   *   gnnEnabled: true,    // Enable GNN
   * });
   * ```
   */
  configure(config: Partial<RuVectorServiceConfig>): void {
    const previousConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Clear cached instances if relevant flags changed
    if (previousConfig.sonaEnabled !== this.config.sonaEnabled) {
      this.globalSONA = null;
      this.domainServices.forEach((services) => {
        services.sona = null;
      });
    }

    if (previousConfig.gnnEnabled !== this.config.gnnEnabled) {
      this.globalGNNIndex = null;
      this.domainServices.forEach((services) => {
        services.gnnIndex = null;
      });
    }

    if (previousConfig.flashAttentionEnabled !== this.config.flashAttentionEnabled) {
      this.globalFlashAttention.clear();
    }

    this.logMetric('config_updated', { previous: previousConfig, current: this.config });
  }

  /**
   * Get current configuration
   *
   * @returns Current configuration (immutable copy)
   */
  getConfig(): Readonly<RuVectorServiceConfig> {
    return { ...this.config };
  }

  // ========================================================================
  // SONA Services
  // ========================================================================

  /**
   * Get SONA instance for a specific domain
   *
   * Returns domain-specific SONA instance with lazy instantiation.
   * If SONA is disabled via config or feature flags, returns null.
   *
   * @param domain - QE domain name
   * @param config - Optional SONA configuration override
   * @returns QESONA instance or null if disabled
   *
   * @example
   * ```typescript
   * const sona = provider.getSONAForDomain('test-generation');
   * if (sona) {
   *   const pattern = await sona.adaptPattern(state, 'test-generation', 'test-generation');
   * }
   * ```
   */
  getSONAForDomain(
    domain: DomainName,
    config?: Partial<QESONAConfig>
  ): QESONA | null {
    // Check feature flags and config
    if (!this.config.sonaEnabled || !isSONAEnabled()) {
      this.logMetric('sona_disabled', { domain });
      return null;
    }

    // Get or create domain services container
    let domainSvc = this.domainServices.get(domain);
    if (!domainSvc) {
      domainSvc = { sona: null, gnnIndex: null };
      this.domainServices.set(domain, domainSvc);
    }

    // Lazy instantiation
    if (!domainSvc.sona) {
      const mergedConfig = {
        ...this.config.defaultSONAConfig,
        ...config,
      };
      domainSvc.sona = createDomainQESONA(domain, mergedConfig);
      this.logMetric('sona_created', { domain, config: mergedConfig });
    }

    return domainSvc.sona;
  }

  /**
   * Get global SONA instance (not domain-specific)
   *
   * @param config - Optional SONA configuration override
   * @returns QESONA instance or null if disabled
   *
   * @example
   * ```typescript
   * const globalSONA = provider.getGlobalSONA();
   * if (globalSONA) {
   *   const stats = globalSONA.getStats();
   * }
   * ```
   */
  getGlobalSONA(config?: Partial<QESONAConfig>): QESONA | null {
    if (!this.config.sonaEnabled || !isSONAEnabled()) {
      return null;
    }

    if (!this.globalSONA) {
      const mergedConfig = {
        ...this.config.defaultSONAConfig,
        ...config,
      };
      this.globalSONA = createQESONA(mergedConfig);
      this.logMetric('global_sona_created', { config: mergedConfig });
    }

    return this.globalSONA;
  }

  // ========================================================================
  // Flash Attention Services
  // ========================================================================

  /**
   * Get Flash Attention instance for a workload type
   *
   * Returns workload-specific Flash Attention instance with lazy instantiation.
   * If Flash Attention is disabled via config or feature flags, returns null.
   *
   * @param workload - QE workload type
   * @param config - Optional Flash Attention configuration override
   * @returns Promise resolving to QEFlashAttention instance or null
   *
   * @example
   * ```typescript
   * const flashAttn = await provider.getFlashAttention('test-similarity');
   * if (flashAttn) {
   *   const result = await flashAttn.computeFlashAttention(Q, K, V, seqLen, dim);
   * }
   * ```
   */
  async getFlashAttention(
    workload?: QEWorkloadType,
    config?: Partial<QEFlashAttentionConfig>
  ): Promise<QEFlashAttention | null> {
    // Check feature flags and config
    if (!this.config.flashAttentionEnabled || !isFlashAttentionEnabled()) {
      this.logMetric('flash_attention_disabled', { workload });
      return null;
    }

    const effectiveWorkload = workload ?? this.config.defaultWorkload ?? 'test-similarity';

    // Lazy instantiation with caching
    if (!this.globalFlashAttention.has(effectiveWorkload)) {
      const mergedConfig = {
        ...this.config.defaultFlashAttentionConfig,
        ...config,
      };
      const instance = await createQEFlashAttention(effectiveWorkload, mergedConfig);
      this.globalFlashAttention.set(effectiveWorkload, instance);
      this.logMetric('flash_attention_created', { workload: effectiveWorkload, config: mergedConfig });
    }

    return this.globalFlashAttention.get(effectiveWorkload)!;
  }

  // ========================================================================
  // GNN Index Services
  // ========================================================================

  /**
   * Get global GNN Embedding Index instance
   *
   * Returns singleton GNN index with lazy instantiation.
   * If GNN is disabled via config or feature flags, returns null.
   *
   * @returns QEGNNEmbeddingIndex instance or null if disabled
   *
   * @example
   * ```typescript
   * const gnnIndex = provider.getGNNIndex();
   * if (gnnIndex) {
   *   const results = gnnIndex.search(queryEmbedding, { limit: 10 });
   * }
   * ```
   */
  getGNNIndex(): QEGNNEmbeddingIndex | null {
    if (!this.config.gnnEnabled || !isGNNIndexEnabled()) {
      this.logMetric('gnn_index_disabled', {});
      return null;
    }

    if (!this.globalGNNIndex) {
      const dim = (this.config.defaultGNNLayerConfig?.inputDim ?? 384) as EmbeddingDimension;
      this.globalGNNIndex = new QEGNNEmbeddingIndex({
        dimension: dim,
        M: 16,
        efConstruction: 200,
        efSearch: 50,
      });
      this.logMetric('gnn_index_created', {});
    }

    return this.globalGNNIndex;
  }

  /**
   * Get domain-specific GNN Embedding Index
   *
   * Returns domain-specific GNN index with lazy instantiation.
   *
   * @param domain - QE domain name
   * @returns QEGNNEmbeddingIndex instance or null if disabled
   *
   * @example
   * ```typescript
   * const domainIndex = provider.getDomainGNNIndex('test-generation');
   * if (domainIndex) {
   *   domainIndex.initializeIndex('code');
   *   domainIndex.addEmbedding(embedding);
   * }
   * ```
   */
  getDomainGNNIndex(domain: DomainName): QEGNNEmbeddingIndex | null {
    if (!this.config.gnnEnabled || !isGNNIndexEnabled()) {
      return null;
    }

    // Get or create domain services container
    let domainSvc = this.domainServices.get(domain);
    if (!domainSvc) {
      domainSvc = { sona: null, gnnIndex: null };
      this.domainServices.set(domain, domainSvc);
    }

    // Lazy instantiation
    if (!domainSvc.gnnIndex) {
      const dim = (this.config.defaultGNNLayerConfig?.inputDim ?? 384) as EmbeddingDimension;
      domainSvc.gnnIndex = new QEGNNEmbeddingIndex({
        dimension: dim,
        M: 16,
        efConstruction: 200,
        efSearch: 50,
      });
      this.logMetric('domain_gnn_index_created', { domain });
    }

    return domainSvc.gnnIndex;
  }

  // ========================================================================
  // Lifecycle Management
  // ========================================================================

  /**
   * Initialize all services (eager loading)
   *
   * Pre-creates all service instances. Useful when you want to pay
   * initialization cost upfront rather than on first use.
   *
   * @param domains - List of domains to initialize
   *
   * @example
   * ```typescript
   * await provider.initializeAll(['test-generation', 'coverage-analysis']);
   * ```
   */
  async initializeAll(domains: DomainName[] = []): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logMetric('initializing_all', { domains });

    // Initialize global services
    this.getGlobalSONA();
    await this.getFlashAttention();
    this.getGNNIndex();

    // Initialize domain-specific services
    for (const domain of domains) {
      this.getSONAForDomain(domain);
      this.getDomainGNNIndex(domain);
    }

    this.initialized = true;
    this.logMetric('initialization_complete', { domains });
  }

  /**
   * Dispose all service instances
   *
   * Clears all cached instances and resets state.
   * Call this during application shutdown.
   *
   * @example
   * ```typescript
   * process.on('SIGTERM', () => {
   *   provider.dispose();
   * });
   * ```
   */
  dispose(): void {
    this.logMetric('disposing', {});

    // Dispose Flash Attention instances
    Array.from(this.globalFlashAttention.values()).forEach((instance) => {
      instance.dispose();
    });
    this.globalFlashAttention.clear();

    // Clear SONA instances
    if (this.globalSONA) {
      this.globalSONA.clear();
      this.globalSONA = null;
    }

    // Clear GNN index
    if (this.globalGNNIndex) {
      this.globalGNNIndex.clearAll();
      this.globalGNNIndex = null;
    }

    // Clear domain services
    Array.from(this.domainServices.values()).forEach((services) => {
      if (services.sona) {
        services.sona.clear();
      }
      if (services.gnnIndex) {
        services.gnnIndex.clearAll();
      }
    });
    this.domainServices.clear();

    this.initialized = false;
    this.logMetric('disposed', {});
  }

  /**
   * Get service statistics
   *
   * @returns Statistics about cached service instances
   */
  getStats(): {
    sonaInstances: number;
    flashAttentionInstances: number;
    gnnIndexInstances: number;
    domainCount: number;
    initialized: boolean;
  } {
    let sonaCount = this.globalSONA ? 1 : 0;
    let gnnCount = this.globalGNNIndex ? 1 : 0;

    Array.from(this.domainServices.values()).forEach((services) => {
      if (services.sona) sonaCount++;
      if (services.gnnIndex) gnnCount++;
    });

    return {
      sonaInstances: sonaCount,
      flashAttentionInstances: this.globalFlashAttention.size,
      gnnIndexInstances: gnnCount,
      domainCount: this.domainServices.size,
      initialized: this.initialized,
    };
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Log migration/usage metrics if enabled
   */
  private logMetric(event: string, data: Record<string, unknown>): void {
    if (shouldLogMigrationMetrics()) {
      console.log(`[RuVectorServiceProvider] ${event}:`, JSON.stringify(data));
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Get RuVector services for a specific domain
 *
 * Convenience factory function that returns all relevant services
 * for a given domain in a single call.
 *
 * @param domain - QE domain name
 * @param config - Optional service configuration
 * @returns Object containing domain-specific services
 *
 * @example
 * ```typescript
 * const services = await getDomainRuVectorServices('test-generation', {
 *   sonaEnabled: true,
 *   flashAttentionEnabled: true,
 *   gnnEnabled: true,
 * });
 *
 * if (services.sona) {
 *   const pattern = await services.sona.adaptPattern(state, 'test-generation', 'test-generation');
 * }
 *
 * if (services.flashAttention) {
 *   const result = await services.flashAttention.computeFlashAttention(Q, K, V, seqLen, dim);
 * }
 *
 * if (services.gnnIndex) {
 *   const results = services.gnnIndex.search(embedding);
 * }
 * ```
 */
export async function getDomainRuVectorServices(
  domain: DomainName,
  config?: Partial<RuVectorServiceConfig>
): Promise<{
  sona: QESONA | null;
  flashAttention: QEFlashAttention | null;
  gnnIndex: QEGNNEmbeddingIndex | null;
  provider: RuVectorServiceProvider;
}> {
  const provider = RuVectorServiceProvider.getInstance(config);

  if (config) {
    provider.configure(config);
  }

  // Map domain to appropriate workload type
  const workloadMap: Record<DomainName, QEWorkloadType> = {
    'test-generation': 'test-similarity',
    'test-execution': 'test-similarity',
    'coverage-analysis': 'coverage-analysis',
    'quality-assessment': 'test-similarity',
    'defect-intelligence': 'defect-matching',
    'requirements-validation': 'test-similarity',
    'code-intelligence': 'code-embedding',
    'security-compliance': 'test-similarity',
    'contract-testing': 'test-similarity',
    'visual-accessibility': 'test-similarity',
    'chaos-resilience': 'test-similarity',
    'learning-optimization': 'pattern-adaptation',
    'coordination': 'pattern-adaptation',
  };

  const workload = workloadMap[domain] ?? 'test-similarity';

  return {
    sona: provider.getSONAForDomain(domain),
    flashAttention: await provider.getFlashAttention(workload),
    gnnIndex: provider.getDomainGNNIndex(domain),
    provider,
  };
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get the singleton RuVectorServiceProvider instance
 *
 * @param config - Optional initial configuration
 * @returns Singleton provider instance
 */
export function getRuVectorProvider(
  config?: Partial<RuVectorServiceConfig>
): RuVectorServiceProvider {
  return RuVectorServiceProvider.getInstance(config);
}

/**
 * Check if RuVector services are enabled based on configuration and feature flags.
 *
 * NOTE: This checks if features are ENABLED, not if packages are AVAILABLE.
 * The @ruvector packages are dependencies and should always be available.
 * If they fail to load, that's a real error that should surface.
 *
 * Use this to check feature flags before attempting to use services.
 *
 * @returns Object indicating enabled state of each service type
 */
export function getRuVectorServiceAvailability(): {
  sona: boolean;
  flashAttention: boolean;
  gnnIndex: boolean;
} {
  const flags = getRuVectorFeatureFlags();
  const provider = RuVectorServiceProvider.getInstance();
  const config = provider.getConfig();

  return {
    sona: config.sonaEnabled && flags.useQESONA,
    flashAttention: config.flashAttentionEnabled && flags.useQEFlashAttention,
    gnnIndex: config.gnnEnabled && flags.useQEGNNIndex,
  };
}
