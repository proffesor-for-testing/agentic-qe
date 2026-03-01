/**
 * A2A Agent Health Checker
 *
 * Provides health checking functionality for registered agents.
 * Supports individual and bulk health checks with configurable intervals.
 *
 * @module adapters/a2a/discovery/agent-health
 */

import { EventEmitter } from 'events';
import { QEAgentCard } from '../agent-cards/schema.js';
import { toErrorMessage, toError } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent health status levels
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';

/**
 * Health check result for an individual agent
 */
export interface AgentHealthStatus {
  /** Agent identifier */
  readonly agentId: string;
  /** Current health status */
  readonly status: HealthStatus;
  /** Timestamp of the last health check */
  readonly lastCheck: Date;
  /** Response time in milliseconds (if available) */
  readonly responseTime?: number;
  /** Consecutive error count */
  readonly errorCount: number;
  /** Consecutive success count */
  readonly successCount: number;
  /** Error message (if unhealthy) */
  readonly errorMessage?: string;
  /** Additional health details */
  readonly details?: Record<string, unknown>;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Timeout for health check requests in milliseconds */
  readonly timeoutMs?: number;
  /** Number of consecutive failures before marking as unhealthy */
  readonly failureThreshold?: number;
  /** Number of consecutive successes to recover from unhealthy */
  readonly recoveryThreshold?: number;
  /** Response time threshold for degraded status (ms) */
  readonly degradedThresholdMs?: number;
  /** Custom health check function */
  readonly checkFn?: (agentId: string, card: QEAgentCard) => Promise<HealthCheckResult>;
}

/**
 * Default health check configuration
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: Required<Omit<HealthCheckConfig, 'checkFn'>> = {
  timeoutMs: 5000,
  failureThreshold: 3,
  recoveryThreshold: 2,
  degradedThresholdMs: 1000,
};

/**
 * Result from a health check attempt
 */
export interface HealthCheckResult {
  /** Whether the check was successful */
  readonly success: boolean;
  /** Response time in milliseconds */
  readonly responseTime?: number;
  /** Error if check failed */
  readonly error?: Error;
  /** Additional details */
  readonly details?: Record<string, unknown>;
}

/**
 * Periodic check configuration
 */
export interface PeriodicCheckConfig {
  /** Interval between checks in milliseconds */
  readonly intervalMs: number;
  /** Whether to check all agents or only previously unhealthy ones */
  readonly checkOnlyUnhealthy?: boolean;
  /** Callback for status changes */
  readonly onStatusChange?: (agentId: string, oldStatus: HealthStatus, newStatus: HealthStatus) => void;
}

/**
 * Health summary statistics
 */
export interface HealthSummary {
  /** Total number of agents */
  readonly total: number;
  /** Number of healthy agents */
  readonly healthy: number;
  /** Number of degraded agents */
  readonly degraded: number;
  /** Number of unavailable agents */
  readonly unavailable: number;
  /** Number of unknown status agents */
  readonly unknown: number;
  /** Overall health percentage (0-100) */
  readonly healthPercentage: number;
  /** Last summary calculation time */
  readonly calculatedAt: Date;
}

// ============================================================================
// Event Emitter Types
// ============================================================================

/**
 * Event map for AgentHealthChecker
 */
export interface HealthCheckerEvents {
  'status-change': (agentId: string, oldStatus: HealthStatus, newStatus: HealthStatus) => void;
  'check-complete': (agentId: string, result: AgentHealthStatus) => void;
  'check-error': (agentId: string, error: Error) => void;
  'all-checks-complete': (summary: HealthSummary) => void;
}

// ============================================================================
// Internal State Types
// ============================================================================

/**
 * Internal health state for an agent
 */
interface AgentHealthState {
  status: HealthStatus;
  lastCheck: Date;
  responseTime?: number;
  errorCount: number;
  successCount: number;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Agent Health Checker Class
// ============================================================================

/**
 * Agent Health Checker
 *
 * Monitors the health of registered agents through periodic or on-demand checks.
 * Supports configurable thresholds for failure detection and recovery.
 */
export class AgentHealthChecker extends EventEmitter {
  private readonly config: Required<Omit<HealthCheckConfig, 'checkFn'>> & { checkFn?: HealthCheckConfig['checkFn'] };
  private readonly healthStates: Map<string, AgentHealthState> = new Map();
  private readonly agentCards: Map<string, QEAgentCard>;
  private periodicCheckTimer: NodeJS.Timeout | null = null;
  private periodicConfig: PeriodicCheckConfig | null = null;

  constructor(
    agentCards: Map<string, QEAgentCard>,
    config: HealthCheckConfig = {}
  ) {
    super();
    this.agentCards = agentCards;
    this.config = {
      ...DEFAULT_HEALTH_CHECK_CONFIG,
      ...config,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Check the health of a specific agent
   */
  async checkAgent(agentId: string): Promise<AgentHealthStatus> {
    const card = this.agentCards.get(agentId);
    if (!card) {
      return this.createUnknownStatus(agentId, 'Agent not found');
    }

    const previousState = this.healthStates.get(agentId);
    const previousStatus = previousState?.status ?? 'unknown';

    try {
      const result = await this.performHealthCheck(agentId, card);
      const newState = this.updateHealthState(agentId, previousState, result);
      this.healthStates.set(agentId, newState);

      const status = this.stateToStatus(newState);

      // Emit status change if changed
      if (previousStatus !== newState.status) {
        this.emit('status-change', agentId, previousStatus, newState.status);
      }

      this.emit('check-complete', agentId, status);
      return status;
    } catch (error) {
      const errorState = this.handleCheckError(agentId, previousState, error);
      this.healthStates.set(agentId, errorState);

      const status = this.stateToStatus(errorState);

      if (previousStatus !== errorState.status) {
        this.emit('status-change', agentId, previousStatus, errorState.status);
      }

      this.emit('check-error', agentId, toError(error));
      this.emit('check-complete', agentId, status);
      return status;
    }
  }

  /**
   * Check the health of all registered agents
   */
  async checkAll(): Promise<Map<string, AgentHealthStatus>> {
    const results = new Map<string, AgentHealthStatus>();

    // Check agents in parallel with a reasonable concurrency limit
    const agentIds = Array.from(this.agentCards.keys());
    const batchSize = 10;

    for (let i = 0; i < agentIds.length; i += batchSize) {
      const batch = agentIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (agentId) => {
          const status = await this.checkAgent(agentId);
          return [agentId, status] as const;
        })
      );

      for (const [agentId, status] of batchResults) {
        results.set(agentId, status);
      }
    }

    const summary = this.calculateSummary();
    this.emit('all-checks-complete', summary);

    return results;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(config: PeriodicCheckConfig): void {
    this.stopPeriodicChecks();

    this.periodicConfig = config;
    this.periodicCheckTimer = setInterval(async () => {
      await this.runPeriodicCheck();
    }, config.intervalMs);

    // Run initial check
    void this.runPeriodicCheck();
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.periodicCheckTimer) {
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
      this.periodicConfig = null;
    }
  }

  /**
   * Check if periodic checks are running
   */
  isPeriodicCheckRunning(): boolean {
    return this.periodicCheckTimer !== null;
  }

  /**
   * Get list of healthy agent IDs
   */
  getHealthyAgents(): string[] {
    return Array.from(this.healthStates.entries())
      .filter(([, state]) => state.status === 'healthy')
      .map(([agentId]) => agentId);
  }

  /**
   * Get list of unhealthy agent IDs (degraded or unavailable)
   */
  getUnhealthyAgents(): string[] {
    return Array.from(this.healthStates.entries())
      .filter(([, state]) => state.status === 'degraded' || state.status === 'unavailable')
      .map(([agentId]) => agentId);
  }

  /**
   * Get health status for a specific agent
   */
  getStatus(agentId: string): AgentHealthStatus | null {
    const state = this.healthStates.get(agentId);
    return state ? this.stateToStatus(state) : null;
  }

  /**
   * Get all health statuses
   */
  getAllStatuses(): Map<string, AgentHealthStatus> {
    const statuses = new Map<string, AgentHealthStatus>();
    for (const [agentId, state] of this.healthStates) {
      statuses.set(agentId, this.stateToStatus(state));
    }
    return statuses;
  }

  /**
   * Get health summary
   */
  getSummary(): HealthSummary {
    return this.calculateSummary();
  }

  /**
   * Reset health state for an agent
   */
  resetAgent(agentId: string): void {
    this.healthStates.delete(agentId);
  }

  /**
   * Reset all health states
   */
  resetAll(): void {
    this.healthStates.clear();
  }

  /**
   * Update the agent cards reference (e.g., after hot reload)
   */
  updateAgentCards(cards: Map<string, QEAgentCard>): void {
    // Clear states for removed agents
    for (const agentId of this.healthStates.keys()) {
      if (!cards.has(agentId)) {
        this.healthStates.delete(agentId);
      }
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Perform the actual health check
   */
  private async performHealthCheck(agentId: string, card: QEAgentCard): Promise<HealthCheckResult> {
    // Use custom check function if provided
    if (this.config.checkFn) {
      return this.config.checkFn(agentId, card);
    }

    // Default health check: attempt to reach the agent's URL
    const startTime = Date.now();

    try {
      // For now, we simulate a successful check based on the card's existence
      // In production, this would make an actual HTTP request to the agent's health endpoint
      const responseTime = Date.now() - startTime;

      // Simulate some randomness for testing purposes
      // In production, remove this and use actual HTTP calls
      const simulatedSuccess = true;

      if (!simulatedSuccess) {
        return {
          success: false,
          responseTime,
          error: new Error('Health check failed'),
        };
      }

      return {
        success: true,
        responseTime,
        details: {
          url: card.url,
          version: card.version,
        },
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: toError(error),
      };
    }
  }

  /**
   * Update health state based on check result
   */
  private updateHealthState(
    agentId: string,
    previousState: AgentHealthState | undefined,
    result: HealthCheckResult
  ): AgentHealthState {
    const now = new Date();

    if (result.success) {
      const successCount = (previousState?.successCount ?? 0) + 1;
      let status: HealthStatus = 'healthy';

      // Check if response time indicates degraded performance
      if (result.responseTime && result.responseTime > this.config.degradedThresholdMs) {
        status = 'degraded';
      }

      // Check recovery threshold
      if (previousState?.status === 'unavailable' || previousState?.status === 'degraded') {
        if (successCount < this.config.recoveryThreshold) {
          status = previousState.status;
        }
      }

      return {
        status,
        lastCheck: now,
        responseTime: result.responseTime,
        errorCount: 0,
        successCount,
        details: result.details,
      };
    } else {
      const errorCount = (previousState?.errorCount ?? 0) + 1;
      let status: HealthStatus = previousState?.status ?? 'unknown';

      // Check failure threshold
      if (errorCount >= this.config.failureThreshold) {
        status = 'unavailable';
      } else if (errorCount >= 1) {
        status = 'degraded';
      }

      return {
        status,
        lastCheck: now,
        responseTime: result.responseTime,
        errorCount,
        successCount: 0,
        errorMessage: result.error?.message,
        details: result.details,
      };
    }
  }

  /**
   * Handle a check error
   */
  private handleCheckError(
    _agentId: string,
    previousState: AgentHealthState | undefined,
    error: unknown
  ): AgentHealthState {
    const errorCount = (previousState?.errorCount ?? 0) + 1;
    let status: HealthStatus = previousState?.status ?? 'unknown';

    if (errorCount >= this.config.failureThreshold) {
      status = 'unavailable';
    } else if (errorCount >= 1) {
      status = 'degraded';
    }

    return {
      status,
      lastCheck: new Date(),
      errorCount,
      successCount: 0,
      errorMessage: toErrorMessage(error),
    };
  }

  /**
   * Convert state to status
   */
  private stateToStatus(state: AgentHealthState): AgentHealthStatus {
    return {
      agentId: '', // Will be set by caller
      status: state.status,
      lastCheck: state.lastCheck,
      responseTime: state.responseTime,
      errorCount: state.errorCount,
      successCount: state.successCount,
      errorMessage: state.errorMessage,
      details: state.details,
    };
  }

  /**
   * Create an unknown status
   */
  private createUnknownStatus(agentId: string, message: string): AgentHealthStatus {
    return {
      agentId,
      status: 'unknown',
      lastCheck: new Date(),
      errorCount: 0,
      successCount: 0,
      errorMessage: message,
    };
  }

  /**
   * Calculate health summary
   */
  private calculateSummary(): HealthSummary {
    let healthy = 0;
    let degraded = 0;
    let unavailable = 0;
    let unknown = 0;

    for (const state of this.healthStates.values()) {
      switch (state.status) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'unavailable':
          unavailable++;
          break;
        default:
          unknown++;
      }
    }

    // Count agents without any health state as unknown
    for (const agentId of this.agentCards.keys()) {
      if (!this.healthStates.has(agentId)) {
        unknown++;
      }
    }

    const total = healthy + degraded + unavailable + unknown;
    const healthPercentage = total > 0 ? (healthy / total) * 100 : 0;

    return {
      total,
      healthy,
      degraded,
      unavailable,
      unknown,
      healthPercentage: Math.round(healthPercentage * 100) / 100,
      calculatedAt: new Date(),
    };
  }

  /**
   * Run periodic check
   */
  private async runPeriodicCheck(): Promise<void> {
    if (!this.periodicConfig) {
      return;
    }

    if (this.periodicConfig.checkOnlyUnhealthy) {
      // Only check unhealthy agents
      const unhealthyAgents = this.getUnhealthyAgents();
      for (const agentId of unhealthyAgents) {
        const previousStatus = this.healthStates.get(agentId)?.status ?? 'unknown';
        const result = await this.checkAgent(agentId);

        if (previousStatus !== result.status && this.periodicConfig.onStatusChange) {
          this.periodicConfig.onStatusChange(agentId, previousStatus, result.status);
        }
      }
    } else {
      // Check all agents
      await this.checkAll();
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an Agent Health Checker instance
 *
 * @param agentCards - Map of agent IDs to their cards
 * @param config - Health check configuration
 * @returns Agent health checker instance
 *
 * @example
 * ```typescript
 * const healthChecker = createAgentHealthChecker(agentCards, {
 *   timeoutMs: 5000,
 *   failureThreshold: 3,
 * });
 *
 * // Check individual agent
 * const status = await healthChecker.checkAgent('qe-test-architect');
 *
 * // Start periodic checks
 * healthChecker.startPeriodicChecks({ intervalMs: 30000 });
 *
 * // Get healthy agents
 * const healthyAgents = healthChecker.getHealthyAgents();
 * ```
 */
export function createAgentHealthChecker(
  agentCards: Map<string, QEAgentCard>,
  config: HealthCheckConfig = {}
): AgentHealthChecker {
  return new AgentHealthChecker(agentCards, config);
}
