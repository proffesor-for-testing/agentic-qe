/**
 * Agentic QE v3 - Domain Circuit Breaker Module
 * ADR-064 Phase 2D: Domain-level circuit breakers for DDD bounded contexts
 *
 * Provides circuit breaker isolation for each QE domain, preventing
 * cascading failures across the fleet. Separate from the LLM provider
 * circuit breaker in shared/llm/.
 *
 * @example
 * ```typescript
 * import {
 *   createDomainBreakerRegistry,
 *   createDomainCircuitBreaker,
 * } from './coordination/circuit-breaker/index.js';
 *
 * // Registry-based usage (recommended for fleet management)
 * const registry = createDomainBreakerRegistry();
 * await registry.executeInDomain('test-generation', () => generateTests());
 *
 * // Standalone usage (single domain)
 * const breaker = createDomainCircuitBreaker('security-compliance');
 * await breaker.execute(() => runSecurityScan());
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  DomainBreakerState,
  DomainCircuitBreakerConfig,
  DomainBreakerStats,
  DomainBreakerEvent,
  DomainBreakerStateChangeHandler,
  DomainCriticalityConfig,
  DomainCriticalityLevel,
  DomainBreakerHealthSummary,
} from './types.js';

// ============================================================================
// Class & Constant Exports
// ============================================================================

export {
  DomainCircuitBreaker,
  DomainCircuitOpenError,
  DEFAULT_DOMAIN_BREAKER_CONFIG,
} from './domain-circuit-breaker.js';

export {
  DomainBreakerRegistry,
  DOMAIN_CRITICALITY_CONFIGS,
  DOMAIN_CRITICALITY,
} from './breaker-registry.js';

// ============================================================================
// Factory Functions
// ============================================================================

import type { DomainCircuitBreakerConfig } from './types.js';
import { DomainCircuitBreaker } from './domain-circuit-breaker.js';
import { DomainBreakerRegistry } from './breaker-registry.js';

/**
 * Create a standalone circuit breaker for a single domain.
 *
 * @param domain - Domain name (e.g. 'test-generation', 'security-compliance')
 * @param config - Optional partial configuration overrides
 * @returns A new DomainCircuitBreaker instance
 */
export function createDomainCircuitBreaker(
  domain: string,
  config?: Partial<DomainCircuitBreakerConfig>,
): DomainCircuitBreaker {
  return new DomainCircuitBreaker(domain, config);
}

/**
 * Create a registry managing circuit breakers for all DDD domains.
 *
 * @param config - Optional partial default configuration for all breakers
 * @returns A new DomainBreakerRegistry instance
 */
export function createDomainBreakerRegistry(
  config?: Partial<DomainCircuitBreakerConfig>,
): DomainBreakerRegistry {
  return new DomainBreakerRegistry(config);
}
