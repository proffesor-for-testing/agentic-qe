/**
 * Recovery Orchestrator
 * Coordinates error recovery across transport, memory, and orchestration systems
 */

import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitBreakerManager, CircuitState, getCircuitBreakerManager } from './CircuitBreaker.js';
import { RetryStrategy, RetryResult, RetryConfig } from './RetryStrategy.js';

/**
 * Recovery strategy types
 */
export type RecoveryStrategyType =
  | 'retry'
  | 'fallback'
  | 'circuit-break'
  | 'rollback'
  | 'graceful-degradation'
  | 'escalate';

/**
 * Component types that can be recovered
 */
export type RecoverableComponent =
  | 'transport'
  | 'memory'
  | 'orchestration'
  | 'agent'
  | 'workflow'
  | 'database';

/**
 * Health status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Recovery action result
 */
export interface RecoveryActionResult {
  success: boolean;
  strategy: RecoveryStrategyType;
  component: RecoverableComponent;
  action: string;
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Component health info
 */
export interface ComponentHealth {
  component: RecoverableComponent;
  status: HealthStatus;
  lastCheck: Date;
  errorRate: number;
  latencyP95: number;
  circuitState?: CircuitState;
  details?: Record<string, any>;
}

/**
 * Recovery policy configuration
 */
export interface RecoveryPolicy {
  /** Maximum recovery attempts per minute */
  maxRecoveryRate: number;
  /** Time to wait between recovery attempts */
  cooldownPeriod: number;
  /** When to escalate to manual intervention */
  escalationThreshold: number;
  /** Strategies in order of preference */
  strategyOrder: RecoveryStrategyType[];
  /** Component-specific overrides */
  componentOverrides?: Partial<Record<RecoverableComponent, Partial<RecoveryPolicy>>>;
}

/**
 * Recovery event
 */
export interface RecoveryEvent {
  timestamp: Date;
  component: RecoverableComponent;
  strategy: RecoveryStrategyType;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Fallback handler type
 */
export type FallbackHandler<T> = () => Promise<T>;

/**
 * Health check function type
 */
export type HealthChecker = (component: RecoverableComponent) => Promise<ComponentHealth>;

/**
 * Recovery Orchestrator Implementation
 */
export class RecoveryOrchestrator extends EventEmitter {
  private circuitBreakerManager: CircuitBreakerManager;
  private retryStrategies: Map<RecoverableComponent, RetryStrategy> = new Map();
  private fallbackHandlers: Map<string, FallbackHandler<any>> = new Map();
  private healthCheckers: Map<RecoverableComponent, HealthChecker> = new Map();
  private recoveryHistory: RecoveryEvent[] = [];
  private componentHealth: Map<RecoverableComponent, ComponentHealth> = new Map();
  private policy: RecoveryPolicy;
  private recoveryInProgress: Set<string> = new Set();
  private lastRecoveryAttempts: Map<string, number[]> = new Map();

  constructor(policy?: Partial<RecoveryPolicy>) {
    super();

    this.policy = {
      maxRecoveryRate: 10,
      cooldownPeriod: 5000,
      escalationThreshold: 5,
      strategyOrder: ['retry', 'fallback', 'circuit-break', 'graceful-degradation', 'rollback', 'escalate'],
      ...policy,
    };

    this.circuitBreakerManager = getCircuitBreakerManager();
    this.initializeDefaultStrategies();
  }

  /**
   * Execute operation with full recovery support
   */
  async executeWithRecovery<T>(
    component: RecoverableComponent,
    operationId: string,
    operation: () => Promise<T>,
    options?: {
      fallback?: FallbackHandler<T>;
      retryConfig?: Partial<RetryConfig>;
      bypassCircuitBreaker?: boolean;
    }
  ): Promise<T> {
    const circuitName = `${component}:${operationId}`;
    const breaker = this.circuitBreakerManager.getBreaker(circuitName);

    // Check if circuit breaker allows execution
    if (!options?.bypassCircuitBreaker && breaker.getState() === CircuitState.OPEN) {
      // Try fallback if available
      const fallbackKey = `${component}:${operationId}`;
      const fallback = options?.fallback || this.fallbackHandlers.get(fallbackKey);

      if (fallback) {
        this.emit('fallback-used', { component, operationId, reason: 'circuit-open' });
        return fallback();
      }

      throw new Error(`Circuit breaker is OPEN for ${circuitName} and no fallback available`);
    }

    // Execute with retry and circuit breaker
    const retryStrategy = this.getRetryStrategy(component, options?.retryConfig);

    try {
      const result = await retryStrategy.execute(async () => {
        return breaker.execute(operation);
      });

      if (result.success) {
        return result.result!;
      }

      // Retry exhausted, try fallback
      const fallbackKey = `${component}:${operationId}`;
      const fallback = options?.fallback || this.fallbackHandlers.get(fallbackKey);

      if (fallback) {
        this.emit('fallback-used', {
          component,
          operationId,
          reason: 'retry-exhausted',
          attempts: result.attempts
        });
        return fallback();
      }

      throw result.error || new Error('Operation failed after all retries');
    } catch (error) {
      // Record recovery event
      this.recordRecoveryEvent({
        timestamp: new Date(),
        component,
        strategy: 'retry',
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: 0,
      });

      throw error;
    }
  }

  /**
   * Attempt automatic recovery for a component
   */
  async attemptRecovery(
    component: RecoverableComponent,
    error: Error
  ): Promise<RecoveryActionResult> {
    const recoveryKey = `${component}:recovery`;

    // Check if recovery is already in progress
    if (this.recoveryInProgress.has(recoveryKey)) {
      return {
        success: false,
        strategy: 'retry',
        component,
        action: 'skipped',
        duration: 0,
        error: 'Recovery already in progress',
      };
    }

    // Check recovery rate limit
    if (!this.canAttemptRecovery(component)) {
      return {
        success: false,
        strategy: 'escalate',
        component,
        action: 'rate-limited',
        duration: 0,
        error: 'Recovery rate limit exceeded',
      };
    }

    this.recoveryInProgress.add(recoveryKey);
    const startTime = Date.now();

    try {
      // Get policy for component
      const policy = this.getComponentPolicy(component);

      // Try strategies in order
      for (const strategy of policy.strategyOrder) {
        const result = await this.executeRecoveryStrategy(component, strategy, error);

        if (result.success) {
          this.recordRecoveryEvent({
            timestamp: new Date(),
            component,
            strategy,
            success: true,
            duration: Date.now() - startTime,
          });

          this.emit('recovery-success', { component, strategy, duration: result.duration });
          return result;
        }
      }

      // All strategies failed
      const result: RecoveryActionResult = {
        success: false,
        strategy: 'escalate',
        component,
        action: 'all-strategies-failed',
        duration: Date.now() - startTime,
        error: 'All recovery strategies failed',
      };

      this.emit('recovery-failed', { component, error: error.message });
      return result;

    } finally {
      this.recoveryInProgress.delete(recoveryKey);
      this.recordRecoveryAttempt(component);
    }
  }

  /**
   * Register fallback handler
   */
  registerFallback<T>(
    component: RecoverableComponent,
    operationId: string,
    handler: FallbackHandler<T>
  ): void {
    this.fallbackHandlers.set(`${component}:${operationId}`, handler);
  }

  /**
   * Register health checker
   */
  registerHealthChecker(
    component: RecoverableComponent,
    checker: HealthChecker
  ): void {
    this.healthCheckers.set(component, checker);
  }

  /**
   * Check health of all components
   */
  async checkHealth(): Promise<Map<RecoverableComponent, ComponentHealth>> {
    const components: RecoverableComponent[] = [
      'transport', 'memory', 'orchestration', 'agent', 'workflow', 'database'
    ];

    for (const component of components) {
      const checker = this.healthCheckers.get(component);

      if (checker) {
        try {
          const health = await checker(component);
          this.componentHealth.set(component, health);
        } catch (error) {
          this.componentHealth.set(component, {
            component,
            status: 'unknown',
            lastCheck: new Date(),
            errorRate: 1,
            latencyP95: 0,
            details: { error: error instanceof Error ? error.message : String(error) },
          });
        }
      }
    }

    return new Map(this.componentHealth);
  }

  /**
   * Get component health
   */
  getComponentHealth(component: RecoverableComponent): ComponentHealth | undefined {
    return this.componentHealth.get(component);
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(limit?: number): RecoveryEvent[] {
    const history = [...this.recoveryHistory].reverse();
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Get recovery statistics
   */
  getStats(): {
    totalRecoveries: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    successRate: number;
    byComponent: Record<string, { total: number; successful: number }>;
    byStrategy: Record<string, { total: number; successful: number }>;
  } {
    const total = this.recoveryHistory.length;
    const successful = this.recoveryHistory.filter(e => e.success).length;

    const byComponent: Record<string, { total: number; successful: number }> = {};
    const byStrategy: Record<string, { total: number; successful: number }> = {};

    for (const event of this.recoveryHistory) {
      // By component
      if (!byComponent[event.component]) {
        byComponent[event.component] = { total: 0, successful: 0 };
      }
      byComponent[event.component].total++;
      if (event.success) byComponent[event.component].successful++;

      // By strategy
      if (!byStrategy[event.strategy]) {
        byStrategy[event.strategy] = { total: 0, successful: 0 };
      }
      byStrategy[event.strategy].total++;
      if (event.success) byStrategy[event.strategy].successful++;
    }

    return {
      totalRecoveries: total,
      successfulRecoveries: successful,
      failedRecoveries: total - successful,
      successRate: total > 0 ? successful / total : 0,
      byComponent,
      byStrategy,
    };
  }

  /**
   * Reset circuit breakers for a component
   */
  resetCircuitBreakers(component?: RecoverableComponent): void {
    if (component) {
      const metrics = this.circuitBreakerManager.getAllMetrics();
      for (const [name] of metrics) {
        if (name.startsWith(component)) {
          this.circuitBreakerManager.getBreaker(name).reset();
        }
      }
    } else {
      this.circuitBreakerManager.resetAll();
    }
  }

  /**
   * Initialize default retry strategies per component
   */
  private initializeDefaultStrategies(): void {
    this.retryStrategies.set('transport', new RetryStrategy({
      maxAttempts: 4,
      initialDelay: 1000,
      backoffType: 'exponential',
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    }));

    this.retryStrategies.set('memory', new RetryStrategy({
      maxAttempts: 3,
      initialDelay: 500,
      backoffType: 'exponential',
      retryableErrors: ['SQLITE_BUSY', 'SQLITE_LOCKED'],
    }));

    this.retryStrategies.set('database', new RetryStrategy({
      maxAttempts: 3,
      initialDelay: 500,
      backoffType: 'exponential',
      retryableErrors: ['SQLITE_BUSY', 'connection', 'timeout'],
    }));

    this.retryStrategies.set('orchestration', new RetryStrategy({
      maxAttempts: 2,
      initialDelay: 2000,
      backoffType: 'linear',
    }));

    this.retryStrategies.set('agent', new RetryStrategy({
      maxAttempts: 2,
      initialDelay: 1000,
      backoffType: 'constant',
    }));

    this.retryStrategies.set('workflow', new RetryStrategy({
      maxAttempts: 3,
      initialDelay: 1000,
      backoffType: 'exponential',
    }));
  }

  /**
   * Get retry strategy for component
   */
  private getRetryStrategy(
    component: RecoverableComponent,
    overrides?: Partial<RetryConfig>
  ): RetryStrategy {
    const baseStrategy = this.retryStrategies.get(component);

    if (overrides && baseStrategy) {
      return new RetryStrategy({
        ...baseStrategy.getConfig(),
        ...overrides,
      });
    }

    return baseStrategy || new RetryStrategy();
  }

  /**
   * Get policy for component
   */
  private getComponentPolicy(component: RecoverableComponent): RecoveryPolicy {
    const override = this.policy.componentOverrides?.[component];
    if (override) {
      return { ...this.policy, ...override };
    }
    return this.policy;
  }

  /**
   * Execute a specific recovery strategy
   */
  private async executeRecoveryStrategy(
    component: RecoverableComponent,
    strategy: RecoveryStrategyType,
    error: Error
  ): Promise<RecoveryActionResult> {
    const startTime = Date.now();

    try {
      switch (strategy) {
        case 'retry':
          // Already handled by executeWithRecovery
          return {
            success: false,
            strategy,
            component,
            action: 'no-op',
            duration: 0,
          };

        case 'fallback':
          const fallback = this.fallbackHandlers.get(`${component}:default`);
          if (fallback) {
            await fallback();
            return {
              success: true,
              strategy,
              component,
              action: 'fallback-executed',
              duration: Date.now() - startTime,
            };
          }
          return {
            success: false,
            strategy,
            component,
            action: 'no-fallback-available',
            duration: 0,
          };

        case 'circuit-break':
          // Reset circuit breakers for component
          this.resetCircuitBreakers(component);
          return {
            success: true,
            strategy,
            component,
            action: 'circuits-reset',
            duration: Date.now() - startTime,
          };

        case 'graceful-degradation':
          this.emit('degradation-mode', { component, reason: error.message });
          return {
            success: true,
            strategy,
            component,
            action: 'degradation-activated',
            duration: Date.now() - startTime,
          };

        case 'rollback':
          this.emit('rollback-requested', { component, error: error.message });
          return {
            success: false, // Rollback is async, can't confirm success
            strategy,
            component,
            action: 'rollback-requested',
            duration: Date.now() - startTime,
          };

        case 'escalate':
          this.emit('escalation', { component, error: error.message });
          return {
            success: false,
            strategy,
            component,
            action: 'escalated',
            duration: Date.now() - startTime,
            metadata: { requiresManualIntervention: true },
          };

        default:
          return {
            success: false,
            strategy,
            component,
            action: 'unknown-strategy',
            duration: 0,
          };
      }
    } catch (strategyError) {
      return {
        success: false,
        strategy,
        component,
        action: 'strategy-failed',
        duration: Date.now() - startTime,
        error: strategyError instanceof Error ? strategyError.message : String(strategyError),
      };
    }
  }

  /**
   * Check if recovery can be attempted (rate limiting)
   */
  private canAttemptRecovery(component: RecoverableComponent): boolean {
    const key = `${component}:recovery`;
    const attempts = this.lastRecoveryAttempts.get(key) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Filter to last minute
    const recentAttempts = attempts.filter(t => t > oneMinuteAgo);
    this.lastRecoveryAttempts.set(key, recentAttempts);

    return recentAttempts.length < this.policy.maxRecoveryRate;
  }

  /**
   * Record recovery attempt for rate limiting
   */
  private recordRecoveryAttempt(component: RecoverableComponent): void {
    const key = `${component}:recovery`;
    const attempts = this.lastRecoveryAttempts.get(key) || [];
    attempts.push(Date.now());
    this.lastRecoveryAttempts.set(key, attempts);
  }

  /**
   * Record recovery event
   */
  private recordRecoveryEvent(event: RecoveryEvent): void {
    this.recoveryHistory.push(event);

    // Keep only last 1000 events
    if (this.recoveryHistory.length > 1000) {
      this.recoveryHistory = this.recoveryHistory.slice(-1000);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.removeAllListeners();
    this.recoveryHistory = [];
    this.componentHealth.clear();
    this.fallbackHandlers.clear();
    this.healthCheckers.clear();
  }
}

/**
 * Default recovery orchestrator instance
 */
let defaultOrchestrator: RecoveryOrchestrator | null = null;

/**
 * Get default recovery orchestrator
 */
export function getRecoveryOrchestrator(
  policy?: Partial<RecoveryPolicy>
): RecoveryOrchestrator {
  if (!defaultOrchestrator) {
    defaultOrchestrator = new RecoveryOrchestrator(policy);
  }
  return defaultOrchestrator;
}

/**
 * Reset default orchestrator (for testing)
 */
export function resetRecoveryOrchestrator(): void {
  if (defaultOrchestrator) {
    defaultOrchestrator.destroy();
    defaultOrchestrator = null;
  }
}
