/**
 * Agentic QE v3 - MinCut Routing Service
 * ADR-068: Mincut-Gated Model Routing
 *
 * Implements routing logic that uses lambda from QEMinCutService
 * to determine the optimal model tier for a task. Builds a task graph
 * from the current agent fleet topology, computes lambda (structural
 * complexity), and routes based on lambda thresholds.
 *
 * @module mcp/services/mincut-routing-service
 */

import {
  QEMinCutService,
  createQEMinCutService,
  type AgentNode,
  type TaskGraph,
  type RoutingTier,
  type HealthReport,
} from '../../integrations/ruvector/mincut-wrapper.js';

// Re-export types needed by consumers (e.g., task-router.ts)
export type { AgentNode, TaskGraph, RoutingTier, HealthReport } from '../../integrations/ruvector/mincut-wrapper.js';

import type { ModelTier } from '../../integrations/agentic-flow/model-router/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for mincut-based routing
 */
export interface MinCutRoutingInput {
  /** Task description */
  readonly task: string;

  /** Domain context */
  readonly domain?: string;

  /** Agent type making the request */
  readonly agentType?: string;

  /** Current agent fleet topology (if known) */
  readonly agentTopology?: AgentNode[];

  /** Pre-built task graph (if available) */
  readonly taskGraph?: TaskGraph;

  /** Whether the task is critical */
  readonly isCritical?: boolean;
}

/**
 * Result of mincut-based routing
 */
export interface MinCutRoutingResult {
  /** Recommended model tier (0-4 numeric) */
  readonly modelTier: ModelTier;

  /** Tier label for display */
  readonly tierLabel: string;

  /** Raw lambda value from mincut computation */
  readonly lambda: number;

  /** Normalized lambda (0-1) */
  readonly normalizedLambda: number;

  /** Confidence in the routing decision */
  readonly confidence: number;

  /** Human-readable rationale */
  readonly rationale: string;

  /** Whether mincut routing was used (vs fallback) */
  readonly usedMinCut: boolean;

  /** Structural health of the fleet at routing time */
  readonly healthSnapshot?: HealthReport;

  /** Time taken for routing decision (ms) */
  readonly decisionTimeMs: number;
}

/**
 * Configuration for the MinCut Routing Service
 */
export interface MinCutRoutingConfig {
  /** Whether mincut routing is enabled (default: true) */
  readonly enabled: boolean;

  /** Lambda threshold for Tier 1/Haiku (>= this value) (default: 0.8) */
  readonly haikuThreshold: number;

  /** Lambda threshold for Tier 2/Sonnet (>= this value, < haikuThreshold) (default: 0.4) */
  readonly sonnetThreshold: number;

  /** Whether to include health snapshot in results (default: false) */
  readonly includeHealthSnapshot: boolean;

  /** Whether to log routing decisions to stderr (default: true) */
  readonly enableLogging: boolean;

  /** Default agent topology to use when none is provided */
  readonly defaultTopology?: AgentNode[];
}

/**
 * Default configuration
 */
export const DEFAULT_MINCUT_ROUTING_CONFIG: MinCutRoutingConfig = {
  enabled: true,
  haikuThreshold: 0.8,
  sonnetThreshold: 0.4,
  includeHealthSnapshot: false,
  enableLogging: true,
};

// ============================================================================
// MinCut Routing Service
// ============================================================================

/**
 * MinCut Routing Service
 *
 * Routes tasks to model tiers based on mincut lambda analysis of the
 * agent fleet topology.
 *
 * Lambda thresholds:
 * - lambda >= 0.8 (highly connected) -> Tier 1 (Haiku)
 * - lambda 0.4-0.8 (moderate) -> Tier 2 (Sonnet)
 * - lambda < 0.4 (fragmented) -> Tier 3 (Sonnet-Extended) or Tier 4 (Opus)
 *
 * Critical tasks are always routed to at least Tier 2.
 *
 * @example
 * ```typescript
 * const service = new MinCutRoutingService();
 * const result = service.route({
 *   task: 'Implement authentication flow',
 *   agentTopology: agents,
 * });
 * console.log(`Route to ${result.tierLabel} (Tier ${result.modelTier})`);
 * ```
 */
export class MinCutRoutingService {
  private readonly config: MinCutRoutingConfig;
  private readonly minCutService: QEMinCutService;

  constructor(config?: Partial<MinCutRoutingConfig>) {
    this.config = { ...DEFAULT_MINCUT_ROUTING_CONFIG, ...config };
    this.minCutService = createQEMinCutService();
  }

  /**
   * Route a task using mincut-based analysis
   *
   * @param input - Routing input with task and topology information
   * @returns Routing result with tier recommendation
   */
  route(input: MinCutRoutingInput): MinCutRoutingResult {
    const startTime = Date.now();

    if (!this.config.enabled) {
      return this.createFallbackResult(input, startTime, 'MinCut routing disabled');
    }

    // Determine the topology to use
    const topology = input.agentTopology || this.config.defaultTopology;

    // If no topology available, fall back
    if (!topology || topology.length === 0) {
      return this.createFallbackResult(
        input,
        startTime,
        'No agent topology available for mincut analysis'
      );
    }

    try {
      // Compute routing tier via mincut
      const routingTier = this.minCutService.computeRoutingTier(
        input.task,
        topology
      );

      // Map to ModelTier (0-4 numeric)
      let modelTier = this.routingTierToModelTier(routingTier.tier);

      // Critical tasks get at least Tier 2
      if (input.isCritical && modelTier < 2) {
        modelTier = 2 as ModelTier;
      }

      const tierLabel = this.modelTierToLabel(modelTier);

      // Optionally compute health snapshot
      let healthSnapshot: HealthReport | undefined;
      if (this.config.includeHealthSnapshot) {
        const graph = input.taskGraph
          || this.minCutService.buildTaskGraphFromTopology(topology);
        healthSnapshot = this.minCutService.getStructuralHealth(graph);
      }

      const decisionTimeMs = Date.now() - startTime;

      const result: MinCutRoutingResult = {
        modelTier,
        tierLabel,
        lambda: routingTier.lambda,
        normalizedLambda: routingTier.normalizedLambda,
        confidence: routingTier.confidence,
        rationale: routingTier.rationale,
        usedMinCut: true,
        healthSnapshot,
        decisionTimeMs,
      };

      if (this.config.enableLogging) {
        this.logDecision(result);
      }

      return result;
    } catch (error) {
      return this.createFallbackResult(
        input,
        startTime,
        `MinCut routing error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the underlying QEMinCutService for direct access
   */
  getMinCutService(): QEMinCutService {
    return this.minCutService;
  }

  /**
   * Check if mincut routing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Convert routing tier (1-3) to ModelTier (0-4)
   */
  private routingTierToModelTier(routingTier: number): ModelTier {
    switch (routingTier) {
      case 1: return 1 as ModelTier; // Haiku
      case 2: return 2 as ModelTier; // Sonnet
      case 3: return 4 as ModelTier; // Opus
      default: return 2 as ModelTier; // Default to Sonnet
    }
  }

  /**
   * Get human-readable label for a ModelTier
   */
  private modelTierToLabel(tier: ModelTier): string {
    switch (tier) {
      case 0: return 'Booster';
      case 1: return 'Haiku';
      case 2: return 'Sonnet';
      case 3: return 'Sonnet-Extended';
      case 4: return 'Opus';
      default: return 'Sonnet';
    }
  }

  /**
   * Create a fallback result when mincut routing cannot be used
   */
  private createFallbackResult(
    input: MinCutRoutingInput,
    startTime: number,
    reason: string
  ): MinCutRoutingResult {
    const defaultTier: ModelTier = input.isCritical ? 2 as ModelTier : 2 as ModelTier;

    return {
      modelTier: defaultTier,
      tierLabel: 'Sonnet',
      lambda: 0,
      normalizedLambda: 0,
      confidence: 0.3,
      rationale: `Fallback to Sonnet: ${reason}`,
      usedMinCut: false,
      decisionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Log routing decision to stderr
   */
  private logDecision(result: MinCutRoutingResult): void {
    const source = result.usedMinCut ? 'MinCut' : 'Fallback';
    console.error(
      `[MinCutRouter] [${source}] Tier ${result.modelTier} (${result.tierLabel}) | ` +
      `Lambda: ${result.normalizedLambda.toFixed(3)} | ` +
      `Confidence: ${(result.confidence * 100).toFixed(0)}% | ` +
      `Time: ${result.decisionTimeMs}ms`
    );
  }
}

// ============================================================================
// Factory & Convenience Functions
// ============================================================================

/**
 * Create a MinCutRoutingService instance
 */
export function createMinCutRoutingService(
  config?: Partial<MinCutRoutingConfig>
): MinCutRoutingService {
  return new MinCutRoutingService(config);
}

/**
 * Quick route a task using mincut analysis.
 * Convenience function for one-off routing decisions.
 *
 * @param task - Task description
 * @param agentTopology - Current agent fleet topology
 * @returns Routing result
 */
export function routeWithMinCut(
  task: string,
  agentTopology: AgentNode[]
): MinCutRoutingResult {
  const service = createMinCutRoutingService({ enableLogging: false });
  return service.route({ task, agentTopology });
}
