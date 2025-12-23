/**
 * Recovery Module - Error Recovery and Resilience
 * Provides circuit breakers, retry strategies, and coordinated recovery
 */

// Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerOpenError,
  getCircuitBreakerManager,
  resetCircuitBreakerManager,
} from './CircuitBreaker.js';

// Retry Strategy
export {
  RetryStrategy,
  RetryConfig,
  RetryResult,
  RetryContext,
  BackoffType,
  withRetry,
  createRetryable,
  RetryStrategies,
} from './RetryStrategy.js';

// Recovery Orchestrator
export {
  RecoveryOrchestrator,
  RecoveryStrategyType,
  RecoverableComponent,
  HealthStatus,
  RecoveryActionResult,
  ComponentHealth,
  RecoveryPolicy,
  RecoveryEvent,
  getRecoveryOrchestrator,
  resetRecoveryOrchestrator,
} from './RecoveryOrchestrator.js';
