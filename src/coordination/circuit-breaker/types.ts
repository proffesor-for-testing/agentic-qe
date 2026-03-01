/**
 * Agentic QE v3 - Domain Circuit Breaker Types
 * ADR-064 Phase 2D: Domain-level circuit breakers for DDD bounded contexts
 *
 * Defines types for circuit breakers that isolate failing QE domains
 * (test-generation, security-compliance, etc.) from the fleet.
 * Separate from the LLM provider circuit breaker in shared/llm/.
 */

// ============================================================================
// State Types
// ============================================================================

/**
 * Circuit breaker state for a domain.
 * - closed: Normal operation, requests pass through
 * - open: Failures exceeded threshold, requests rejected immediately
 * - half-open: Testing recovery, limited requests allowed
 */
export type DomainBreakerState = 'closed' | 'open' | 'half-open';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for a single domain circuit breaker.
 * All properties are readonly to enforce immutability after creation.
 */
export interface DomainCircuitBreakerConfig {
  /** Number of failures within the window before opening circuit (default: 3) */
  readonly failureThreshold: number;
  /** Time in ms before transitioning from open to half-open (default: 60000) */
  readonly resetTimeoutMs: number;
  /** Successes needed in half-open state to close circuit (default: 2) */
  readonly halfOpenSuccessThreshold: number;
  /** Time window in ms for counting failures (default: 120000) */
  readonly failureWindowMs: number;
  /** Whether to cascade open state to dependent domains (default: false) */
  readonly cascadeEnabled: boolean;
  /** Domains that should also open when this domain opens */
  readonly cascadeTargets?: readonly string[];
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Runtime statistics for a domain circuit breaker.
 */
export interface DomainBreakerStats {
  /** Domain name this breaker protects */
  readonly domain: string;
  /** Current breaker state */
  readonly state: DomainBreakerState;
  /** Total requests attempted (including rejected) */
  readonly totalRequests: number;
  /** Total successful requests */
  readonly successCount: number;
  /** Total failed requests */
  readonly failureCount: number;
  /** Requests rejected due to open circuit */
  readonly rejectedCount: number;
  /** Timestamp of the most recent failure, if any */
  readonly lastFailureTime?: number;
  /** Timestamp of the most recent success, if any */
  readonly lastSuccessTime?: number;
  /** Timestamp when circuit was opened, if currently open */
  readonly openedAt?: number;
  /** Milliseconds until circuit transitions to half-open (only when open) */
  readonly timeUntilHalfOpen?: number;
  /** Consecutive successes in half-open state */
  readonly consecutiveSuccesses: number;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Event emitted when a domain circuit breaker changes state or rejects a request.
 */
export interface DomainBreakerEvent {
  /** Type of event */
  readonly type: 'state-change' | 'request-rejected' | 'cascade-triggered';
  /** Domain this event pertains to */
  readonly domain: string;
  /** Previous state (for state-change events) */
  readonly previousState?: DomainBreakerState;
  /** New state (for state-change events) */
  readonly newState?: DomainBreakerState;
  /** When the event occurred */
  readonly timestamp: number;
  /** Additional context */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Callback signature for state change handlers.
 */
export type DomainBreakerStateChangeHandler = (event: DomainBreakerEvent) => void;

// ============================================================================
// Criticality Presets
// ============================================================================

/**
 * Predefined configurations for different domain criticality levels.
 * P0/critical domains have tighter thresholds and faster recovery;
 * P2/lenient domains tolerate more failures before opening.
 */
export interface DomainCriticalityConfig {
  /** P0 domains: tighter thresholds, faster recovery */
  readonly critical: DomainCircuitBreakerConfig;
  /** P1 domains: standard thresholds */
  readonly standard: DomainCircuitBreakerConfig;
  /** P2 domains: more lenient, slower to open */
  readonly lenient: DomainCircuitBreakerConfig;
}

/**
 * Criticality level for a domain.
 */
export type DomainCriticalityLevel = 'critical' | 'standard' | 'lenient';

// ============================================================================
// Health Summary
// ============================================================================

/**
 * Aggregate health summary across all domain circuit breakers.
 */
export interface DomainBreakerHealthSummary {
  /** Number of domains with circuit closed (healthy) */
  readonly healthy: number;
  /** Number of domains in half-open state (degraded) */
  readonly degraded: number;
  /** Number of domains with circuit open */
  readonly open: number;
  /** Total number of tracked domains */
  readonly total: number;
}
