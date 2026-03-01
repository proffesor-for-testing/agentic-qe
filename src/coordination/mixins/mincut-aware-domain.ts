/**
 * Agentic QE v3 - MinCut-Aware Domain Mixin
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Provides a reusable mixin that allows any domain coordinator to become
 * MinCut-aware, enabling topology-based routing and health monitoring.
 *
 * This mixin implements the IMinCutAwareDomain interface and can be applied
 * to any domain coordinator class via the factory function.
 */

import { DomainName } from '../../shared/types';
import {
  MinCutHealth,
  WeakVertex,
} from '../mincut/interfaces';
import { QueenMinCutBridge } from '../mincut/queen-integration';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Interface for MinCut-aware domain capabilities
 */
export interface IMinCutAwareDomain {
  /**
   * Set the MinCut bridge for topology awareness
   * Uses dependency injection pattern for testability
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void;

  /**
   * Check if the overall topology is healthy
   * Returns true if status is not 'critical'
   */
  isTopologyHealthy(): boolean;

  /**
   * Get weak vertices that belong to this domain
   * Filters the global weak vertices by domain name
   */
  getDomainWeakVertices(): WeakVertex[];

  /**
   * Check if this domain itself is a weak point in the topology
   * Returns true if any weak vertex belongs to this domain
   */
  isDomainWeakPoint(): boolean;

  /**
   * Get routing candidates excluding weak domains
   * Filters out domains that are currently weak points
   * @param targetDomains - List of potential target domains
   * @returns Filtered list of healthy domains for routing
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[];

  /**
   * Subscribe to topology health changes
   * @param callback - Function called when health status changes
   * @returns Unsubscribe function
   */
  onTopologyHealthChange(callback: (health: MinCutHealth) => void): () => void;
}

/**
 * Configuration for MinCut-aware domain behavior
 */
export interface MinCutAwareConfig {
  /**
   * Whether MinCut awareness is enabled
   * When false, the mixin operates in pass-through mode
   */
  enableMinCutAwareness: boolean;

  /**
   * Threshold (0-1) for considering topology healthy
   * Based on normalized MinCut value relative to healthy threshold
   */
  topologyHealthThreshold: number;

  /**
   * Whether to pause domain operations when topology is critical
   */
  pauseOnCriticalTopology: boolean;

  /**
   * List of domains this coordinator monitors for health
   * Empty array means monitor all domains
   */
  monitoredDomains: DomainName[];
}

/**
 * Default configuration for MinCut-aware domains
 */
export const DEFAULT_MINCUT_AWARE_CONFIG: MinCutAwareConfig = {
  enableMinCutAwareness: true,
  topologyHealthThreshold: 0.7,
  pauseOnCriticalTopology: false,
  monitoredDomains: [],
};

/** Maximum number of health listeners to prevent memory leaks */
const MAX_HEALTH_LISTENERS = 100;

// ============================================================================
// MinCut-Aware Domain Mixin
// ============================================================================

/**
 * Mixin class that adds MinCut awareness to any domain coordinator
 *
 * Usage:
 * ```typescript
 * class MyDomainCoordinator {
 *   private readonly minCutMixin: MinCutAwareDomainMixin;
 *
 *   constructor(domainName: DomainName) {
 *     this.minCutMixin = createMinCutAwareMixin(domainName);
 *   }
 *
 *   isTopologyHealthy() {
 *     return this.minCutMixin.isTopologyHealthy();
 *   }
 * }
 * ```
 */
export class MinCutAwareDomainMixin implements IMinCutAwareDomain {
  private bridge: QueenMinCutBridge | null = null;
  private readonly config: MinCutAwareConfig;
  private readonly domainName: DomainName;
  private healthListeners: Set<(health: MinCutHealth) => void> = new Set();
  private lastHealthStatus: MinCutHealth['status'] | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    domainName: DomainName,
    config: Partial<MinCutAwareConfig> = {}
  ) {
    this.domainName = domainName;
    this.config = { ...DEFAULT_MINCUT_AWARE_CONFIG, ...config };
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Set the MinCut bridge via dependency injection
   */
  setMinCutBridge(bridge: QueenMinCutBridge): void {
    if (this.bridge) {
      this.stopHealthMonitoring();
    }

    this.bridge = bridge;

    if (this.config.enableMinCutAwareness && this.healthListeners.size > 0) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Get the current MinCut bridge
   */
  getMinCutBridge(): QueenMinCutBridge | null {
    return this.bridge;
  }

  /**
   * Check if a MinCut bridge is connected
   */
  hasBridge(): boolean {
    return this.bridge !== null;
  }

  /**
   * Get the domain name this mixin is associated with
   */
  getDomainName(): DomainName {
    return this.domainName;
  }

  /**
   * Get current configuration
   */
  getConfig(): MinCutAwareConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MinCutAwareConfig>): void {
    Object.assign(this.config, config);

    // Restart health monitoring if awareness was toggled
    if ('enableMinCutAwareness' in config) {
      if (config.enableMinCutAwareness && this.bridge && this.healthListeners.size > 0) {
        this.startHealthMonitoring();
      } else {
        this.stopHealthMonitoring();
      }
    }
  }

  /**
   * Dispose the mixin and clean up resources
   */
  dispose(): void {
    this.stopHealthMonitoring();
    this.healthListeners.clear();
    this.bridge = null;
    this.lastHealthStatus = null;
  }

  // ==========================================================================
  // IMinCutAwareDomain Implementation
  // ==========================================================================

  /**
   * Check if topology is healthy
   * Returns true if MinCut awareness is disabled or status is not 'critical'
   */
  isTopologyHealthy(): boolean {
    if (!this.config.enableMinCutAwareness || !this.bridge) {
      return true; // Assume healthy when awareness is disabled or no bridge
    }

    const health = this.bridge.getMinCutHealth();
    return health.status !== 'critical';
  }

  /**
   * Get weak vertices belonging to this domain
   */
  getDomainWeakVertices(): WeakVertex[] {
    if (!this.bridge) {
      return [];
    }

    const allWeakVertices = this.bridge.getWeakVertices();

    return allWeakVertices.filter(vertex =>
      vertex.vertex.domain === this.domainName
    );
  }

  /**
   * Check if this domain is a weak point in the topology
   */
  isDomainWeakPoint(): boolean {
    const domainWeakVertices = this.getDomainWeakVertices();
    return domainWeakVertices.length > 0;
  }

  /**
   * Get topology-based routing excluding weak domains
   */
  getTopologyBasedRouting(targetDomains: DomainName[]): DomainName[] {
    if (!this.config.enableMinCutAwareness || !this.bridge) {
      return targetDomains; // Return all when awareness is disabled
    }

    const weakVertices = this.bridge.getWeakVertices();

    // Extract domains that are weak
    const weakDomains = new Set<DomainName>();
    for (const vertex of weakVertices) {
      if (vertex.vertex.domain) {
        weakDomains.add(vertex.vertex.domain);
      }
    }

    // Filter out weak domains from routing candidates
    return targetDomains.filter(domain => !weakDomains.has(domain));
  }

  /**
   * Subscribe to topology health changes
   * @throws Error if max listeners limit is reached
   */
  onTopologyHealthChange(callback: (health: MinCutHealth) => void): () => void {
    // Prevent memory leaks from unbounded listener growth
    if (this.healthListeners.size >= MAX_HEALTH_LISTENERS) {
      console.error(
        `[MinCutAwareDomain] Max health listeners (${MAX_HEALTH_LISTENERS}) reached for ${this.domainName}. ` +
        `Ensure listeners are properly unsubscribed.`
      );
      throw new Error(`Max health listeners (${MAX_HEALTH_LISTENERS}) exceeded`);
    }

    this.healthListeners.add(callback);

    // Start monitoring if this is the first listener and we have a bridge
    if (this.healthListeners.size === 1 && this.bridge && this.config.enableMinCutAwareness) {
      this.startHealthMonitoring();
    }

    // Return unsubscribe function
    return () => {
      this.healthListeners.delete(callback);

      // Stop monitoring if no more listeners
      if (this.healthListeners.size === 0) {
        this.stopHealthMonitoring();
      }
    };
  }

  // ==========================================================================
  // Extended Methods
  // ==========================================================================

  /**
   * Get the current MinCut health snapshot
   */
  getCurrentHealth(): MinCutHealth | null {
    if (!this.bridge) {
      return null;
    }
    return this.bridge.getMinCutHealth();
  }

  /**
   * Get the current MinCut value
   */
  getMinCutValue(): number | null {
    if (!this.bridge) {
      return null;
    }
    return this.bridge.getMinCutValue();
  }

  /**
   * Check if operations should be paused due to critical topology
   */
  shouldPauseOperations(): boolean {
    if (!this.config.pauseOnCriticalTopology) {
      return false;
    }
    return !this.isTopologyHealthy();
  }

  /**
   * Get domains that are healthy for routing
   * Convenience method that considers monitored domains
   */
  getHealthyRoutingDomains(): DomainName[] {
    const domainsToCheck = this.config.monitoredDomains.length > 0
      ? this.config.monitoredDomains
      : this.getAllDomains();

    return this.getTopologyBasedRouting(domainsToCheck);
  }

  /**
   * Get normalized health score (0-1)
   * Based on MinCut value relative to healthy threshold
   */
  getNormalizedHealthScore(): number {
    if (!this.bridge) {
      return 1.0; // Assume healthy when no bridge
    }

    const health = this.bridge.getMinCutHealth();

    if (health.healthyThreshold <= 0) {
      return health.minCutValue > 0 ? 1.0 : 0.0;
    }

    // Normalize: minCutValue / healthyThreshold, capped at 1.0
    return Math.min(1.0, health.minCutValue / health.healthyThreshold);
  }

  /**
   * Check if health score meets threshold
   */
  meetsHealthThreshold(): boolean {
    return this.getNormalizedHealthScore() >= this.config.topologyHealthThreshold;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Start monitoring health changes
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }

    // Check health periodically and notify listeners on change
    this.healthCheckInterval = setInterval(() => {
      this.checkAndNotifyHealthChange();
    }, 5000); // Check every 5 seconds

    // Immediate first check
    this.checkAndNotifyHealthChange();
  }

  /**
   * Stop monitoring health changes
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Check health and notify listeners if status changed
   */
  private checkAndNotifyHealthChange(): void {
    if (!this.bridge) {
      return;
    }

    const health = this.bridge.getMinCutHealth();

    // Only notify if status changed
    if (health.status !== this.lastHealthStatus) {
      this.lastHealthStatus = health.status;

      // Notify all listeners
      for (const listener of this.healthListeners) {
        try {
          listener(health);
        } catch (error) {
          console.error('Error in health change listener:', error);
        }
      }
    }
  }

  /**
   * Get all domain names
   */
  private getAllDomains(): DomainName[] {
    return [
      'test-generation',
      'test-execution',
      'coverage-analysis',
      'quality-assessment',
      'defect-intelligence',
      'requirements-validation',
      'code-intelligence',
      'security-compliance',
      'contract-testing',
      'visual-accessibility',
      'chaos-resilience',
      'learning-optimization',
      'coordination',
    ];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a MinCut-aware domain mixin instance
 *
 * @param domainName - The domain this mixin is associated with
 * @param config - Optional configuration overrides
 * @returns MinCutAwareDomainMixin instance
 *
 * @example
 * ```typescript
 * const mixin = createMinCutAwareMixin('test-generation', {
 *   pauseOnCriticalTopology: true,
 *   topologyHealthThreshold: 0.8,
 * });
 *
 * // Later, inject the bridge
 * mixin.setMinCutBridge(queenMinCutBridge);
 *
 * // Use the mixin
 * if (mixin.isTopologyHealthy()) {
 *   // Proceed with normal operations
 * }
 * ```
 */
export function createMinCutAwareMixin(
  domainName: DomainName,
  config?: Partial<MinCutAwareConfig>
): MinCutAwareDomainMixin {
  return new MinCutAwareDomainMixin(domainName, config);
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an object implements IMinCutAwareDomain
 */
export function isMinCutAwareDomain(obj: unknown): obj is IMinCutAwareDomain {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const domain = obj as Record<string, unknown>;

  return (
    typeof domain.setMinCutBridge === 'function' &&
    typeof domain.isTopologyHealthy === 'function' &&
    typeof domain.getDomainWeakVertices === 'function' &&
    typeof domain.isDomainWeakPoint === 'function' &&
    typeof domain.getTopologyBasedRouting === 'function' &&
    typeof domain.onTopologyHealthChange === 'function'
  );
}
