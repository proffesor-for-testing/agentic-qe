/**
 * Agentic QE v3 - Task Router Service
 * ADR-051: Integrates Model Router into MCP task execution flow
 *
 * This service bridges the Model Router with MCP task handlers,
 * ensuring routing decisions actually affect model selection.
 *
 * @module mcp/services/task-router
 */

import {
  createModelRouter,
  createModelRouterWithAgentBooster,
  type ModelRouter,
  type ModelRouterConfig,
  type RoutingDecision,
  type RoutingInput,
  type RouterMetrics,
  type ModelTier,
  TIER_METADATA,
} from '../../integrations/agentic-flow';

// ============================================================================
// Types
// ============================================================================

/**
 * Task routing result with execution recommendations
 */
export interface TaskRoutingResult {
  /** The routing decision from Model Router */
  readonly decision: RoutingDecision;

  /** Recommended execution strategy based on tier */
  readonly executionStrategy: 'booster' | 'haiku' | 'sonnet' | 'sonnet-extended' | 'opus';

  /** Whether to use Agent Booster for this task */
  readonly useAgentBooster: boolean;

  /** Model ID to use for execution */
  readonly modelId: string;

  /** Tier metadata for logging */
  readonly tierInfo: {
    readonly tier: ModelTier;
    readonly name: string;
    readonly typicalLatencyMs: number;
    readonly relativeCost: number;
  };

  /** Routing log entry for metrics */
  readonly logEntry: RoutingLogEntry;
}

/**
 * Routing log entry for metrics and debugging
 */
export interface RoutingLogEntry {
  readonly timestamp: Date;
  readonly taskDescription: string;
  readonly requestedTier?: ModelTier;
  readonly selectedTier: ModelTier;
  readonly modelId: string;
  readonly complexity: number;
  readonly confidence: number;
  readonly wasDowngraded: boolean;
  readonly agentBoosterEligible: boolean;
  readonly decisionTimeMs: number;
  readonly rationale: string;
}

/**
 * Task Router configuration
 */
export interface TaskRouterConfig {
  /** Whether routing is enabled (default: true) */
  readonly enabled: boolean;

  /** Whether to enable Agent Booster integration (default: true) */
  readonly enableAgentBooster: boolean;

  /** Whether to log routing decisions (default: true) */
  readonly enableLogging: boolean;

  /** Maximum routing log entries to keep (default: 1000) */
  readonly maxLogEntries: number;

  /** Model router configuration override */
  readonly modelRouterConfig?: Partial<ModelRouterConfig>;
}

/**
 * Default Task Router configuration
 */
export const DEFAULT_TASK_ROUTER_CONFIG: TaskRouterConfig = {
  enabled: true,
  enableAgentBooster: true,
  enableLogging: true,
  maxLogEntries: 1000,
};

// ============================================================================
// Task Router Service
// ============================================================================

/**
 * Task Router Service
 *
 * Integrates Model Router into MCP task execution flow.
 * Analyzes task complexity and routes to appropriate model tier.
 *
 * @example
 * ```typescript
 * const router = await TaskRouterService.getInstance();
 * const result = await router.routeTask({
 *   task: 'Implement authentication flow',
 *   domain: 'security-compliance',
 *   agentType: 'qe-security-scanner',
 * });
 *
 * console.log(`Route to ${result.tierInfo.name} (Tier ${result.decision.tier})`);
 * console.log(`Model: ${result.modelId}`);
 * ```
 */
export class TaskRouterService {
  private static instance: TaskRouterService | null = null;
  private static initializationPromise: Promise<TaskRouterService> | null = null;

  private readonly config: TaskRouterConfig;
  private readonly modelRouter: ModelRouter;
  private readonly routingLog: RoutingLogEntry[] = [];
  private disposed = false;

  private constructor(config: TaskRouterConfig, modelRouter: ModelRouter) {
    this.config = config;
    this.modelRouter = modelRouter;
  }

  /**
   * Get or create the singleton TaskRouterService instance
   */
  static async getInstance(config?: Partial<TaskRouterConfig>): Promise<TaskRouterService> {
    // Return existing instance if available
    if (TaskRouterService.instance && !TaskRouterService.instance.disposed) {
      return TaskRouterService.instance;
    }

    // Wait for existing initialization if in progress
    if (TaskRouterService.initializationPromise) {
      return TaskRouterService.initializationPromise;
    }

    // Start new initialization
    TaskRouterService.initializationPromise = TaskRouterService.create(config);

    try {
      TaskRouterService.instance = await TaskRouterService.initializationPromise;
      return TaskRouterService.instance;
    } finally {
      TaskRouterService.initializationPromise = null;
    }
  }

  /**
   * Create a new TaskRouterService instance
   */
  private static async create(config?: Partial<TaskRouterConfig>): Promise<TaskRouterService> {
    const fullConfig: TaskRouterConfig = {
      ...DEFAULT_TASK_ROUTER_CONFIG,
      ...config,
    };

    let modelRouter: ModelRouter;

    if (fullConfig.enableAgentBooster) {
      // Initialize with Agent Booster support
      modelRouter = await createModelRouterWithAgentBooster(fullConfig.modelRouterConfig);
    } else {
      // Initialize without Agent Booster
      modelRouter = createModelRouter(fullConfig.modelRouterConfig);
    }

    const service = new TaskRouterService(fullConfig, modelRouter);

    // Log initialization
    if (fullConfig.enableLogging) {
      console.error(
        `[TaskRouter] Initialized with Agent Booster: ${fullConfig.enableAgentBooster}`
      );
    }

    return service;
  }

  /**
   * Route a task to the optimal model tier
   *
   * @param input - Task routing input
   * @returns Task routing result with execution recommendations
   */
  async routeTask(input: TaskRoutingInput): Promise<TaskRoutingResult> {
    if (!this.config.enabled) {
      return this.createDisabledResult(input);
    }

    if (this.disposed) {
      throw new Error('TaskRouterService has been disposed');
    }

    const routingInput: RoutingInput = {
      task: input.task,
      codeContext: input.codeContext,
      filePaths: input.filePaths,
      manualTier: input.manualTier,
      isCritical: input.isCritical,
      agentType: input.agentType,
      domain: input.domain,
      metadata: input.metadata,
    };

    const decision = await this.modelRouter.route(routingInput);

    const tierMeta = TIER_METADATA[decision.tier];
    const executionStrategy = this.mapTierToStrategy(decision.tier);

    const logEntry: RoutingLogEntry = {
      timestamp: decision.metadata.timestamp,
      taskDescription: input.task.slice(0, 200),
      requestedTier: input.manualTier,
      selectedTier: decision.tier,
      modelId: decision.modelId,
      complexity: decision.complexityAnalysis.overall,
      confidence: decision.confidence,
      wasDowngraded: decision.budgetDecision.wasDowngraded,
      agentBoosterEligible: decision.agentBoosterEligible,
      decisionTimeMs: decision.metadata.decisionTimeMs,
      rationale: decision.rationale,
    };

    // Always track log entries for metrics
    this.addLogEntry(logEntry);

    // Only output to console if logging is enabled
    if (this.config.enableLogging) {
      this.logRoutingDecision(logEntry);
    }

    return {
      decision,
      executionStrategy,
      useAgentBooster: decision.agentBoosterEligible,
      modelId: decision.modelId,
      tierInfo: {
        tier: decision.tier,
        name: tierMeta.name,
        typicalLatencyMs: tierMeta.typicalLatencyMs,
        relativeCost: tierMeta.relativeCost,
      },
      logEntry,
    };
  }

  /**
   * Quick route for simple use cases
   *
   * @param taskDescription - Task description string
   * @returns Routing result
   */
  async quickRoute(taskDescription: string): Promise<TaskRoutingResult> {
    return this.routeTask({ task: taskDescription });
  }

  /**
   * Route multiple tasks in batch
   *
   * @param inputs - Array of task routing inputs
   * @returns Array of routing results
   */
  async routeBatch(inputs: TaskRoutingInput[]): Promise<TaskRoutingResult[]> {
    return Promise.all(inputs.map((input) => this.routeTask(input)));
  }

  /**
   * Get routing metrics from the Model Router
   */
  getMetrics(): RouterMetrics {
    return this.modelRouter.getMetrics();
  }

  /**
   * Get routing log entries
   *
   * @param limit - Maximum entries to return (default: 100)
   * @param offset - Starting offset (default: 0)
   */
  getRoutingLog(limit = 100, offset = 0): RoutingLogEntry[] {
    return this.routingLog.slice(offset, offset + limit);
  }

  /**
   * Get routing statistics summary
   */
  getRoutingStats(): RoutingStats {
    const entries = this.routingLog;

    if (entries.length === 0) {
      return this.createEmptyStats();
    }

    const byTier = new Map<ModelTier, number>();
    let totalComplexity = 0;
    let totalDecisionTimeMs = 0;
    let downgradeCount = 0;
    let agentBoosterCount = 0;

    for (const entry of entries) {
      byTier.set(entry.selectedTier, (byTier.get(entry.selectedTier) || 0) + 1);
      totalComplexity += entry.complexity;
      totalDecisionTimeMs += entry.decisionTimeMs;
      if (entry.wasDowngraded) downgradeCount++;
      if (entry.agentBoosterEligible) agentBoosterCount++;
    }

    const tierDistribution: Partial<Record<ModelTier, number>> = {};
    for (const [tier, count] of byTier) {
      tierDistribution[tier] = count / entries.length;
    }

    return {
      totalRouted: entries.length,
      avgComplexity: totalComplexity / entries.length,
      avgDecisionTimeMs: totalDecisionTimeMs / entries.length,
      downgradeRate: downgradeCount / entries.length,
      agentBoosterRate: agentBoosterCount / entries.length,
      tierDistribution,
      period: {
        start: entries[0].timestamp,
        end: entries[entries.length - 1].timestamp,
      },
    };
  }

  /**
   * Reset routing log and metrics
   */
  reset(): void {
    this.routingLog.length = 0;
    this.modelRouter.resetMetrics();

    if (this.config.enableLogging) {
      console.error('[TaskRouter] Reset routing log and metrics');
    }
  }

  /**
   * Dispose the service and release resources
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    await this.modelRouter.dispose();
    TaskRouterService.instance = null;

    if (this.config.enableLogging) {
      console.error('[TaskRouter] Disposed');
    }
  }

  /**
   * Check if routing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && !this.disposed;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Map tier to execution strategy
   */
  private mapTierToStrategy(
    tier: ModelTier
  ): 'booster' | 'haiku' | 'sonnet' | 'sonnet-extended' | 'opus' {
    switch (tier) {
      case 0:
        return 'booster';
      case 1:
        return 'haiku';
      case 2:
        return 'sonnet';
      case 3:
        return 'sonnet-extended';
      case 4:
        return 'opus';
      default:
        return 'sonnet'; // Fallback
    }
  }

  /**
   * Add entry to routing log
   */
  private addLogEntry(entry: RoutingLogEntry): void {
    this.routingLog.push(entry);

    // Trim log if over limit
    if (this.routingLog.length > this.config.maxLogEntries) {
      this.routingLog.splice(0, this.routingLog.length - this.config.maxLogEntries);
    }
  }

  /**
   * Log routing decision to stderr
   */
  private logRoutingDecision(entry: RoutingLogEntry): void {
    const tierName = TIER_METADATA[entry.selectedTier].name;
    const prefix = entry.agentBoosterEligible ? '[AgentBooster]' : `[Tier${entry.selectedTier}]`;

    console.error(
      `[TaskRouter] ${prefix} ${tierName} | ` +
        `Complexity: ${entry.complexity.toFixed(0)} | ` +
        `Confidence: ${(entry.confidence * 100).toFixed(0)}% | ` +
        `Time: ${entry.decisionTimeMs.toFixed(1)}ms` +
        (entry.wasDowngraded ? ' [DOWNGRADED]' : '')
    );
  }

  /**
   * Create result when routing is disabled
   */
  private createDisabledResult(input: TaskRoutingInput): TaskRoutingResult {
    const defaultTier: ModelTier = 2; // Sonnet as default
    const tierMeta = TIER_METADATA[defaultTier];

    const logEntry: RoutingLogEntry = {
      timestamp: new Date(),
      taskDescription: input.task.slice(0, 200),
      selectedTier: defaultTier,
      modelId: tierMeta.exampleModels[0],
      complexity: 50,
      confidence: 0.5,
      wasDowngraded: false,
      agentBoosterEligible: false,
      decisionTimeMs: 0,
      rationale: 'Routing disabled - using default tier',
    };

    return {
      decision: {
        tier: defaultTier,
        modelId: tierMeta.exampleModels[0],
        complexityAnalysis: {
          overall: 50,
          codeComplexity: 50,
          reasoningComplexity: 50,
          scopeComplexity: 50,
          confidence: 0.5,
          signals: {
            hasArchitectureScope: false,
            hasSecurityScope: false,
            requiresMultiStepReasoning: false,
            requiresCrossDomainCoordination: false,
            isMechanicalTransform: false,
            requiresCreativity: false,
            keywordMatches: { simple: [], moderate: [], complex: [], critical: [] },
          },
          recommendedTier: defaultTier,
          alternateTiers: [],
          explanation: 'Routing disabled',
        },
        budgetDecision: {
          allowed: true,
          reason: 'Routing disabled',
          requestedTier: defaultTier,
          approvedTier: defaultTier,
          wasDowngraded: false,
          estimatedCostUsd: 0,
          currentUsage: {
            tier: defaultTier,
            costSpentTodayUsd: 0,
            requestsThisHour: 0,
            requestsToday: 0,
            budgetUtilization: 0,
            isExceeded: false,
            isNearLimit: false,
            resetTime: new Date(),
            remainingBudgetUsd: 100,
            remainingRequestsThisHour: 100,
            remainingRequestsToday: 1000,
          },
          warnings: [],
        },
        confidence: 0.5,
        rationale: 'Routing disabled - using default tier',
        agentBoosterEligible: false,
        alternativeTiers: [],
        metadata: {
          timestamp: new Date(),
          decisionTimeMs: 0,
          fromCache: false,
        },
        warnings: ['Routing is disabled'],
      },
      executionStrategy: 'sonnet',
      useAgentBooster: false,
      modelId: tierMeta.exampleModels[0],
      tierInfo: {
        tier: defaultTier,
        name: tierMeta.name,
        typicalLatencyMs: tierMeta.typicalLatencyMs,
        relativeCost: tierMeta.relativeCost,
      },
      logEntry,
    };
  }

  /**
   * Create empty stats object
   */
  private createEmptyStats(): RoutingStats {
    const now = new Date();
    return {
      totalRouted: 0,
      avgComplexity: 0,
      avgDecisionTimeMs: 0,
      downgradeRate: 0,
      agentBoosterRate: 0,
      tierDistribution: {},
      period: {
        start: now,
        end: now,
      },
    };
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

/**
 * Task routing input (simplified from RoutingInput)
 */
export interface TaskRoutingInput {
  /** Task description */
  readonly task: string;

  /** Optional code context for analysis */
  readonly codeContext?: string;

  /** Optional file paths being modified */
  readonly filePaths?: string[];

  /** Manual tier override */
  readonly manualTier?: ModelTier;

  /** Whether this is a critical task */
  readonly isCritical?: boolean;

  /** Agent type making the request */
  readonly agentType?: string;

  /** Domain of the requesting agent */
  readonly domain?: string;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Routing statistics summary
 */
export interface RoutingStats {
  readonly totalRouted: number;
  readonly avgComplexity: number;
  readonly avgDecisionTimeMs: number;
  readonly downgradeRate: number;
  readonly agentBoosterRate: number;
  readonly tierDistribution: Partial<Record<ModelTier, number>>;
  readonly period: {
    readonly start: Date;
    readonly end: Date;
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Get or create the TaskRouterService singleton
 */
export async function getTaskRouter(
  config?: Partial<TaskRouterConfig>
): Promise<TaskRouterService> {
  return TaskRouterService.getInstance(config);
}

/**
 * Quick route a task using the default TaskRouterService
 */
export async function routeTask(
  task: string,
  options?: Omit<TaskRoutingInput, 'task'>
): Promise<TaskRoutingResult> {
  const router = await getTaskRouter();
  return router.routeTask({ task, ...options });
}

/**
 * Check if TaskRouterService is available
 */
export function isTaskRouterAvailable(): boolean {
  return true; // Always available after initialization
}
