/**
 * Agentic QE v3 - Domain Breaker Registry
 * ADR-064 Phase 2D: Registry managing circuit breakers for all DDD domains
 *
 * Provides centralized management of per-domain circuit breakers,
 * criticality-based preset configuration, cascade propagation,
 * and fleet-wide health summaries.
 */

import type {
  DomainCircuitBreakerConfig,
  DomainBreakerStats,
  DomainBreakerEvent,
  DomainBreakerStateChangeHandler,
  DomainBreakerHealthSummary,
  DomainCriticalityLevel,
  DomainCriticalityConfig,
} from './types.js';

import { toErrorMessage } from '../../shared/error-utils.js';
import {
  DomainCircuitBreaker,
  DEFAULT_DOMAIN_BREAKER_CONFIG,
} from './domain-circuit-breaker.js';

// ============================================================================
// Criticality Presets
// ============================================================================

/**
 * Predefined circuit breaker configurations for different domain criticality levels.
 *
 * - critical (P0): Tight thresholds, fast recovery. Used for core QE domains.
 * - standard (P1): Balanced thresholds. Used for important but non-critical domains.
 * - lenient (P2): High tolerance, slower to open. Used for auxiliary domains.
 */
export const DOMAIN_CRITICALITY_CONFIGS: DomainCriticalityConfig = {
  critical: {
    failureThreshold: 2,
    resetTimeoutMs: 30_000,        // 30s - fast recovery for critical domains
    halfOpenSuccessThreshold: 2,
    failureWindowMs: 60_000,       // 1 minute window
    cascadeEnabled: false,
    cascadeTargets: undefined,
  },
  standard: {
    failureThreshold: 3,
    resetTimeoutMs: 60_000,        // 1 minute
    halfOpenSuccessThreshold: 2,
    failureWindowMs: 120_000,      // 2 minute window
    cascadeEnabled: false,
    cascadeTargets: undefined,
  },
  lenient: {
    failureThreshold: 5,
    resetTimeoutMs: 120_000,       // 2 minutes - slower recovery
    halfOpenSuccessThreshold: 3,
    failureWindowMs: 300_000,      // 5 minute window
    cascadeEnabled: false,
    cascadeTargets: undefined,
  },
};

// ============================================================================
// Default Domain Criticality Assignments
// ============================================================================

/**
 * Default criticality assignments for each of the 13 DDD domains.
 * Maps each domain to its criticality level for preset configuration.
 */
export const DOMAIN_CRITICALITY: Record<string, DomainCriticalityLevel> = {
  'test-generation': 'critical',
  'test-execution': 'critical',
  'coverage-analysis': 'critical',
  'quality-assessment': 'critical',
  'security-compliance': 'critical',
  'defect-intelligence': 'standard',
  'requirements-validation': 'standard',
  'code-intelligence': 'standard',
  'contract-testing': 'standard',
  'visual-accessibility': 'lenient',
  'chaos-resilience': 'lenient',
  'learning-optimization': 'lenient',
  'enterprise-integration': 'standard',
};

// ============================================================================
// Domain Breaker Registry
// ============================================================================

/**
 * Registry managing circuit breakers for all DDD domains.
 *
 * Provides centralized access to per-domain breakers, fleet-wide health
 * monitoring, criticality-based configuration, and cascade propagation.
 *
 * @example
 * ```typescript
 * const registry = new DomainBreakerRegistry();
 *
 * // Check if a domain can accept work
 * if (registry.canExecuteInDomain('test-generation')) {
 *   await registry.executeInDomain('test-generation', () => runTests());
 * }
 *
 * // Get fleet health
 * const summary = registry.getHealthSummary();
 * console.log(`${summary.healthy}/${summary.total} domains healthy`);
 * ```
 */
export class DomainBreakerRegistry {
  private readonly breakers: Map<string, DomainCircuitBreaker> = new Map();
  private readonly defaultConfig: DomainCircuitBreakerConfig;
  private readonly globalHandlers: Set<DomainBreakerStateChangeHandler> = new Set();

  constructor(defaultConfig?: Partial<DomainCircuitBreakerConfig>) {
    this.defaultConfig = { ...DEFAULT_DOMAIN_BREAKER_CONFIG, ...defaultConfig };
  }

  // --------------------------------------------------------------------------
  // Breaker Access
  // --------------------------------------------------------------------------

  /**
   * Get or create a circuit breaker for a domain.
   * If the domain has a known criticality level, the breaker is created
   * with the corresponding preset configuration.
   *
   * @param domain - Domain name to get/create a breaker for
   * @returns The circuit breaker instance for the domain
   */
  getBreaker(domain: string): DomainCircuitBreaker {
    let breaker = this.breakers.get(domain);

    if (!breaker) {
      // Apply criticality preset if known, otherwise use default
      const criticality = DOMAIN_CRITICALITY[domain];
      const config = criticality
        ? { ...this.defaultConfig, ...DOMAIN_CRITICALITY_CONFIGS[criticality] }
        : this.defaultConfig;

      breaker = new DomainCircuitBreaker(domain, config);
      this.breakers.set(domain, breaker);

      // Wire up cascade and global event forwarding
      breaker.onStateChange((event) => this.handleBreakerEvent(event));

      console.log(
        `[DomainBreakerRegistry] Created breaker for '${domain}' ` +
        `(criticality: ${criticality ?? 'default'})`
      );
    }

    return breaker;
  }

  /**
   * Override configuration for a specific domain breaker.
   * Replaces the existing breaker with a new one using the given config.
   *
   * @param domain - Domain to configure
   * @param config - Partial configuration overrides
   */
  configureBreaker(domain: string, config: Partial<DomainCircuitBreakerConfig>): void {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const breaker = new DomainCircuitBreaker(domain, mergedConfig);
    breaker.onStateChange((event) => this.handleBreakerEvent(event));
    this.breakers.set(domain, breaker);

    console.log(
      `[DomainBreakerRegistry] Reconfigured breaker for '${domain}'`
    );
  }

  /**
   * Configure a domain breaker using a criticality preset.
   *
   * @param domain - Domain to configure
   * @param level - Criticality level: 'critical', 'standard', or 'lenient'
   */
  configureCriticality(domain: string, level: DomainCriticalityLevel): void {
    const presetConfig = DOMAIN_CRITICALITY_CONFIGS[level];
    this.configureBreaker(domain, presetConfig);

    console.log(
      `[DomainBreakerRegistry] Set '${domain}' criticality to '${level}'`
    );
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Quick check whether a domain can accept requests.
   *
   * @param domain - Domain to check
   * @returns true if the circuit is closed or half-open
   */
  canExecuteInDomain(domain: string): boolean {
    return this.getBreaker(domain).canExecute();
  }

  /**
   * Execute a function within a domain's circuit breaker protection.
   *
   * @param domain - Domain to execute in
   * @param fn - Async function to execute
   * @returns The result of the function
   * @throws {DomainCircuitOpenError} If the domain circuit is open
   */
  async executeInDomain<T>(domain: string, fn: () => Promise<T>): Promise<T> {
    return this.getBreaker(domain).execute(fn);
  }

  // --------------------------------------------------------------------------
  // Statistics & Health
  // --------------------------------------------------------------------------

  /**
   * Get statistics for all tracked domain circuit breakers.
   *
   * @returns Map of domain name to breaker stats
   */
  getAllStats(): Map<string, DomainBreakerStats> {
    const stats = new Map<string, DomainBreakerStats>();
    for (const [domain, breaker] of this.breakers) {
      stats.set(domain, breaker.getStats());
    }
    return stats;
  }

  /**
   * Get domains whose circuits are currently open (unhealthy).
   *
   * @returns Array of domain names with open circuits
   */
  getOpenDomains(): string[] {
    const open: string[] = [];
    for (const [domain, breaker] of this.breakers) {
      if (breaker.getState() === 'open') {
        open.push(domain);
      }
    }
    return open;
  }

  /**
   * Get domains whose circuits are currently closed (healthy).
   *
   * @returns Array of domain names with closed circuits
   */
  getHealthyDomains(): string[] {
    const healthy: string[] = [];
    for (const [domain, breaker] of this.breakers) {
      if (breaker.getState() === 'closed') {
        healthy.push(domain);
      }
    }
    return healthy;
  }

  /**
   * Get domains whose circuits are currently half-open (degraded/recovering).
   *
   * @returns Array of domain names with half-open circuits
   */
  getDegradedDomains(): string[] {
    const degraded: string[] = [];
    for (const [domain, breaker] of this.breakers) {
      if (breaker.getState() === 'half-open') {
        degraded.push(domain);
      }
    }
    return degraded;
  }

  /**
   * Get an aggregate health summary across all tracked domains.
   *
   * @returns Health summary with counts by state
   */
  getHealthSummary(): DomainBreakerHealthSummary {
    let healthy = 0;
    let degraded = 0;
    let open = 0;

    for (const breaker of this.breakers.values()) {
      const state = breaker.getState();
      switch (state) {
        case 'closed':
          healthy++;
          break;
        case 'half-open':
          degraded++;
          break;
        case 'open':
          open++;
          break;
      }
    }

    return {
      healthy,
      degraded,
      open,
      total: this.breakers.size,
    };
  }

  // --------------------------------------------------------------------------
  // Reset
  // --------------------------------------------------------------------------

  /**
   * Reset all domain circuit breakers to the closed state.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    console.log(
      `[DomainBreakerRegistry] Reset all ${this.breakers.size} breakers`
    );
  }

  /**
   * Reset a specific domain's circuit breaker to the closed state.
   *
   * @param domain - Domain to reset
   */
  reset(domain: string): void {
    const breaker = this.breakers.get(domain);
    if (breaker) {
      breaker.reset();
    }
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  /**
   * Register a callback that fires on state changes from any domain breaker.
   *
   * @param handler - Callback invoked for all state change events
   * @returns Unsubscribe function to remove the handler
   */
  onAnyStateChange(handler: DomainBreakerStateChangeHandler): () => void {
    this.globalHandlers.add(handler);
    return () => {
      this.globalHandlers.delete(handler);
    };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  /**
   * Handle events from individual breakers: forward to global handlers
   * and propagate cascades when configured.
   */
  private handleBreakerEvent(event: DomainBreakerEvent): void {
    // Forward to global handlers
    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch (err) {
        console.log(
          `[DomainBreakerRegistry] Global handler error: ` +
          `${toErrorMessage(err)}`
        );
      }
    }

    // Handle cascade on state-change to open
    if (event.type === 'state-change' && event.newState === 'open') {
      this.propagateCascade(event.domain);
    }
  }

  /**
   * Propagate cascade open to dependent domains when configured.
   */
  private propagateCascade(sourceDomain: string): void {
    const sourceBreaker = this.breakers.get(sourceDomain);
    if (!sourceBreaker) {
      return;
    }

    const config = sourceBreaker.getConfig();
    if (!config.cascadeEnabled || !config.cascadeTargets?.length) {
      return;
    }

    for (const targetDomain of config.cascadeTargets) {
      // Avoid self-cascade
      if (targetDomain === sourceDomain) {
        continue;
      }

      const targetBreaker = this.getBreaker(targetDomain);
      const targetState = targetBreaker.getState();

      // Only cascade to domains that are not already open
      if (targetState !== 'open') {
        console.log(
          `[DomainBreakerRegistry] Cascading open from '${sourceDomain}' to '${targetDomain}'`
        );
        targetBreaker.forceOpen();

        // Emit cascade event through global handlers
        const cascadeEvent: DomainBreakerEvent = {
          type: 'cascade-triggered',
          domain: targetDomain,
          timestamp: Date.now(),
          metadata: {
            sourceDomain,
            cascadedFrom: sourceDomain,
          },
        };

        for (const handler of this.globalHandlers) {
          try {
            handler(cascadeEvent);
          } catch (err) {
            console.log(
              `[DomainBreakerRegistry] Cascade event handler error: ` +
              `${toErrorMessage(err)}`
            );
          }
        }
      }
    }
  }
}
