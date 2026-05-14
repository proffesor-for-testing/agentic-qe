/**
 * Agentic QE v3 - Coherence Predict Collapse MCP Tool
 * ADR-052: Phase 4 Action A4.1
 *
 * qe/coherence/collapse - Predict swarm collapse risk
 *
 * Uses the CoherenceService's spectral analysis to predict potential
 * swarm collapse before it happens, enabling proactive mitigation.
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import {
  CoherenceService,
  createCoherenceService,
  wasmLoader,
  type SwarmState,
  type CollapseRisk,
  type AgentHealth,
  type Belief,
} from '../../../integrations/coherence/index.js';
import type { AgentType } from '../../../shared/types/index.js';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for collapse prediction
 */
export interface CoherenceCollapseParams {
  /** Current swarm state - simplified input format */
  swarmState: {
    /** Agent health information */
    agents: Array<{
      agentId: string;
      agentType?: string;
      health: number;
      errorCount?: number;
      successRate?: number;
    }>;
    /** Total active tasks */
    activeTasks: number;
    /** Pending tasks */
    pendingTasks: number;
    /** System-wide error rate (0-1) */
    errorRate: number;
    /** Resource utilization (0-1) */
    utilization: number;
  };
  /** Risk threshold for warning (0-1, default: 0.5) */
  riskThreshold?: number;
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown;
}

/**
 * Result of collapse prediction
 */
export interface CoherenceCollapseResult {
  /** Overall collapse risk (0-1, higher = more risk) */
  risk: number;
  /** Whether the swarm is at significant risk */
  isAtRisk: boolean;
  /** Risk level category */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Fiedler value (spectral gap - lower = more vulnerable) */
  fiedlerValue: number;
  /** Whether collapse is imminent */
  collapseImminent: boolean;
  /** Agents most vulnerable to failure */
  weakVertices: string[];
  /** Recommendations for mitigation */
  recommendations: string[];
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Whether fallback logic was used */
  usedFallback: boolean;
}

// ============================================================================
// Schema
// ============================================================================

const COHERENCE_COLLAPSE_SCHEMA: MCPToolSchema = {
  type: 'object',
  properties: {
    swarmState: {
      type: 'object',
      description: 'Current state of the swarm including agents and task info',
    },
    riskThreshold: {
      type: 'number',
      description: 'Risk threshold for warning (0-1, default: 0.5)',
      default: 0.5,
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['swarmState'],
};

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Coherence Predict Collapse Tool
 *
 * Uses Prime Radiant's spectral analysis to predict swarm collapse risk
 * before it happens, enabling proactive mitigation.
 *
 * @example
 * ```typescript
 * const result = await tool.invoke({
 *   swarmState: {
 *     agents: [
 *       { agentId: 'agent-1', health: 0.9, errorCount: 2 },
 *       { agentId: 'agent-2', health: 0.7, errorCount: 5 },
 *     ],
 *     activeTasks: 10,
 *     pendingTasks: 3,
 *     errorRate: 0.05,
 *     utilization: 0.6,
 *   },
 *   riskThreshold: 0.6,
 * });
 *
 * if (result.data.isAtRisk) {
 *   console.log('Collapse risk detected:', result.data.riskLevel);
 *   console.log('Recommendations:', result.data.recommendations);
 * }
 * ```
 */
export class CoherenceCollapseTool extends MCPToolBase<
  CoherenceCollapseParams,
  CoherenceCollapseResult
> {
  readonly config: MCPToolConfig = {
    name: 'qe/coherence/collapse',
    description:
      'Predict swarm collapse risk using spectral analysis. ' +
      'Identifies vulnerable vertices and provides mitigation recommendations.',
    domain: 'learning-optimization',
    schema: COHERENCE_COLLAPSE_SCHEMA,
    streaming: false,
    timeout: 30000,
  };

  private coherenceService: CoherenceService | null = null;

  /**
   * Get or create the CoherenceService instance
   */
  private async getService(): Promise<CoherenceService> {
    if (!this.coherenceService) {
      this.coherenceService = await createCoherenceService(wasmLoader);
    }
    return this.coherenceService;
  }

  /**
   * Reset instance cache (called when fleet is disposed)
   */
  resetInstanceCache(): void {
    if (this.coherenceService) {
      this.coherenceService.dispose();
      this.coherenceService = null;
    }
  }

  /**
   * Execute collapse prediction
   */
  async execute(
    params: CoherenceCollapseParams,
    context: MCPToolContext
  ): Promise<ToolResult<CoherenceCollapseResult>> {
    const startTime = Date.now();
    const { swarmState, riskThreshold = 0.5 } = params;

    // Validate swarm state
    if (!swarmState) {
      return {
        success: false,
        error: 'swarmState is required',
      };
    }

    if (!swarmState.agents || swarmState.agents.length < 1) {
      return {
        success: false,
        error: 'At least one agent is required in swarmState',
      };
    }

    try {
      // Get service
      const service = await this.getService();

      // Convert to SwarmState format expected by the service.
      // Default any missing numeric fields to safe values so degenerate inputs
      // can't propagate NaN into risk scoring (issue #470).
      const state: SwarmState = {
        agents: swarmState.agents.map((a): AgentHealth => ({
          agentId: a.agentId,
          agentType: (a.agentType || 'worker') as AgentType,
          health: Number.isFinite(a.health) ? a.health : 1.0,
          beliefs: [] as Belief[],
          lastActivity: new Date(),
          errorCount: a.errorCount ?? 0,
          successRate: Number.isFinite(a.successRate) ? a.successRate! : 1.0,
        })),
        activeTasks: Number.isFinite(swarmState.activeTasks) ? swarmState.activeTasks : 0,
        pendingTasks: Number.isFinite(swarmState.pendingTasks) ? swarmState.pendingTasks : 0,
        errorRate: Number.isFinite(swarmState.errorRate) ? swarmState.errorRate : 0,
        utilization: Number.isFinite(swarmState.utilization) ? swarmState.utilization : 0,
        timestamp: new Date(),
      };

      // Predict collapse using spectral analysis
      const result: CollapseRisk = await service.predictCollapse(state);

      // Determine risk level
      const safeRisk = Number.isFinite(result.risk) ? result.risk : 0;
      const riskLevel = this.categorizeRisk(safeRisk);

      // Generate enhanced recommendations
      const recommendations = [
        ...result.recommendations,
        ...this.generateAdditionalRecommendations(result, swarmState),
      ];

      const executionTimeMs = Date.now() - startTime;

      this.markAsRealData();

      // Derive isAtRisk from riskLevel rather than raw risk, so the two
      // can never disagree (issue #470). When risk is non-finite we treat
      // it as "low" — categorizeRisk falls back to 0 above.
      const isAtRisk = riskLevel === 'high' || riskLevel === 'critical' ||
        (riskLevel === 'medium' && safeRisk >= riskThreshold);

      return {
        success: true,
        data: {
          risk: safeRisk,
          isAtRisk,
          riskLevel,
          fiedlerValue: result.fiedlerValue,
          collapseImminent: result.collapseImminent,
          weakVertices: result.weakVertices,
          recommendations,
          executionTimeMs,
          usedFallback: result.usedFallback,
        },
      };
    } catch (error) {
      // Check if WASM is unavailable - provide heuristic fallback
      if (
        error instanceof Error &&
        error.message.includes('WASM')
      ) {
        const fallbackResult = this.heuristicAnalysis(
          swarmState,
          riskThreshold
        );

        this.markAsDemoData(context, 'WASM module unavailable');

        return {
          success: true,
          data: {
            ...fallbackResult,
            recommendations: [
              'Running in fallback mode (heuristic analysis)',
              'Install prime-radiant-advanced-wasm for spectral collapse prediction',
              ...fallbackResult.recommendations,
            ],
            usedFallback: true,
            executionTimeMs: Date.now() - startTime,
          },
        };
      }

      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Categorize risk level
   *
   * Non-finite inputs (NaN, null, undefined coerced) fall back to 'low'
   * rather than tripping the default-arm and returning 'critical' for
   * degenerate input (issue #470).
   */
  private categorizeRisk(risk: number): 'low' | 'medium' | 'high' | 'critical' {
    if (!Number.isFinite(risk)) return 'low';
    if (risk < 0.25) return 'low';
    if (risk < 0.5) return 'medium';
    if (risk < 0.75) return 'high';
    return 'critical';
  }

  /**
   * Generate additional recommendations based on context
   */
  private generateAdditionalRecommendations(
    result: CollapseRisk,
    state: CoherenceCollapseParams['swarmState']
  ): string[] {
    const recommendations: string[] = [];

    // High error rate
    if (state.errorRate > 0.1) {
      recommendations.push(
        `High system error rate (${(state.errorRate * 100).toFixed(1)}%) - investigate root causes`
      );
    }

    // High utilization
    if (state.utilization > 0.85) {
      recommendations.push(
        `High resource utilization (${(state.utilization * 100).toFixed(1)}%) - consider scaling`
      );
    }

    // Task backlog
    if (state.pendingTasks > state.activeTasks * 2) {
      recommendations.push(
        `Large task backlog (${state.pendingTasks} pending) - may need more agents`
      );
    }

    // Unhealthy agents
    const unhealthyAgents = state.agents.filter((a) => a.health < 0.5);
    if (unhealthyAgents.length > 0) {
      recommendations.push(
        `${unhealthyAgents.length} agent(s) with low health - consider replacement`
      );
    }

    // Critical risk
    if (result.risk >= 0.75) {
      recommendations.unshift(
        '⚠️ CRITICAL: Immediate action required to prevent collapse'
      );
    }

    return recommendations;
  }

  /**
   * Heuristic analysis fallback when WASM is unavailable
   */
  private heuristicAnalysis(
    state: CoherenceCollapseParams['swarmState'],
    riskThreshold: number
  ): Omit<CoherenceCollapseResult, 'usedFallback' | 'executionTimeMs'> {
    let risk = 0;
    const recommendations: string[] = [];
    const weakVertices: string[] = [];

    // Default missing numeric fields so degenerate input (e.g. agents without
    // a `health` value) doesn't propagate NaN through the score (issue #470).
    const errorRate = Number.isFinite(state.errorRate) ? state.errorRate : 0;
    const utilization = Number.isFinite(state.utilization) ? state.utilization : 0;
    const pendingTasks = Number.isFinite(state.pendingTasks) ? state.pendingTasks : 0;
    const activeTasks = Number.isFinite(state.activeTasks) ? state.activeTasks : 0;

    // Factor: Average agent health
    const healths = state.agents.map(a => Number.isFinite(a.health) ? a.health : 1.0);
    const avgHealth = healths.length > 0
      ? healths.reduce((sum, h) => sum + h, 0) / healths.length
      : 1.0;
    risk += (1 - avgHealth) * 0.3;

    // Factor: Error rate
    risk += Math.min(0.25, errorRate * 2.5);

    // Factor: Utilization
    if (utilization > 0.7) {
      risk += (utilization - 0.7) * 0.5;
    }

    // Factor: Task pressure
    const taskPressure = pendingTasks / Math.max(1, activeTasks);
    if (taskPressure > 1) {
      risk += Math.min(0.2, (taskPressure - 1) * 0.1);
    }

    // Identify weak agents (using sanitized health values)
    state.agents.forEach((agent, i) => {
      if (healths[i] < 0.5 || (agent.errorCount ?? 0) > 5) {
        weakVertices.push(agent.agentId);
      }
    });

    risk = Math.min(1, risk);

    // Generate recommendations
    if (risk >= riskThreshold) {
      recommendations.push('Consider reducing task load');
      recommendations.push('Monitor agent health closely');
    }

    if (weakVertices.length > 0) {
      recommendations.push(`Reinforce weak agents: ${weakVertices.join(', ')}`);
    }

    if (risk < 0.25) {
      recommendations.push('Swarm appears stable - continue normal operations');
    }

    const riskLevel = this.categorizeRisk(risk);
    // Keep isAtRisk consistent with riskLevel (issue #470)
    const isAtRisk = riskLevel === 'high' || riskLevel === 'critical' ||
      (riskLevel === 'medium' && risk >= riskThreshold);

    return {
      risk,
      isAtRisk,
      riskLevel,
      fiedlerValue: 0, // Can't compute without spectral analysis
      collapseImminent: risk >= 0.75,
      weakVertices,
      recommendations,
    };
  }
}

/**
 * Create a CoherenceCollapseTool instance
 */
export function createCoherenceCollapseTool(): CoherenceCollapseTool {
  return new CoherenceCollapseTool();
}
