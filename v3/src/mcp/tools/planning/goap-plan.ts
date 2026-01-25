/**
 * GOAP Plan MCP Tool
 *
 * Find optimal action plan to achieve a QE goal using A* search.
 * Supports named goals and custom goal conditions with plan constraints.
 *
 * @module mcp/tools/planning/goap-plan
 * @version 3.0.0
 */

import {
  MCPToolBase,
  MCPToolConfig,
  MCPToolContext,
  MCPToolSchema,
} from '../base.js';
import { ToolResult } from '../../types.js';
import {
  GOAPPlanner,
  getSharedGOAPPlanner,
  V3WorldState,
  StateConditions,
  PlanConstraints,
  DEFAULT_V3_WORLD_STATE,
} from '../../../planning/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for GOAP plan tool
 */
export interface GOAPPlanParams {
  /** Goal name (named goal) or custom goal conditions object */
  goal: string | Record<string, unknown>;
  /** Current world state (auto-detected if not provided) */
  currentState?: V3WorldState;
  /** Plan constraints */
  constraints?: {
    maxCost?: number;
    maxDurationMs?: number;
    requiredAgentTypes?: string[];
    excludedActions?: string[];
  };
  /** Index signature for Record compatibility */
  [key: string]: unknown;
}

/**
 * Result of GOAP planning
 */
export interface GOAPPlanResult {
  planId: string;
  goal: string | Record<string, unknown>;
  actions: Array<{
    name: string;
    agentType: string;
    cost: number;
    category: string;
    description?: string;
  }>;
  totalCost: number;
  estimatedDurationMs: number;
  stepCount: number;
  reusedFrom?: string;
  similarityScore?: number;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * GOAP Plan MCP Tool
 *
 * Finds optimal action sequences to achieve QE goals using A* search.
 */
export class GOAPPlanTool extends MCPToolBase<GOAPPlanParams, GOAPPlanResult> {
  private planner: GOAPPlanner | null = null;

  readonly config: MCPToolConfig = {
    name: 'qe/planning/goap_plan',
    description:
      'Find optimal action plan to achieve a QE goal using A* search. ' +
      'Supports named goals (e.g., "achieve-90-percent-coverage") or custom goal conditions.',
    domain: 'coordination',
    schema: this.buildSchema(),
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description:
            'Goal name (e.g., "achieve-90-percent-coverage") or custom goal conditions as JSON object',
        },
        currentState: {
          type: 'object',
          description:
            'Current world state (auto-detected if not provided). ' +
            'Contains coverage, quality, fleet, resources, context, and patterns.',
        },
        constraints: {
          type: 'object',
          description: 'Plan constraints',
          properties: {
            maxCost: {
              type: 'number',
              description: 'Maximum total cost allowed',
            },
            maxDurationMs: {
              type: 'number',
              description: 'Maximum total duration in milliseconds',
            },
            requiredAgentTypes: {
              type: 'array',
              description: 'Only use actions that these agent types can execute',
              items: { type: 'string', description: 'Agent type' },
            },
            excludedActions: {
              type: 'array',
              description: 'Exclude these specific action IDs',
              items: { type: 'string', description: 'Action ID' },
            },
          },
        },
      },
      required: ['goal'],
    };
  }

  /**
   * Get or create the GOAP planner instance
   */
  private async getPlanner(): Promise<GOAPPlanner> {
    if (!this.planner) {
      this.planner = getSharedGOAPPlanner();
      await this.planner.initialize();
    }
    return this.planner;
  }

  /**
   * Reset instance cache
   */
  resetInstanceCache(): void {
    this.planner = null;
  }

  /**
   * Execute the GOAP planning
   */
  async execute(
    params: GOAPPlanParams,
    context: MCPToolContext
  ): Promise<ToolResult<GOAPPlanResult>> {
    try {
      const planner = await this.getPlanner();

      // Resolve goal to conditions
      let goalConditions: StateConditions;
      let goalName: string;

      if (typeof params.goal === 'string') {
        // Look up named goal
        const namedGoals = await planner.getGoals();
        const found = namedGoals.find((g) => g.name === params.goal);

        if (!found) {
          const availableGoals = namedGoals.map((g) => g.name).join(', ');
          return {
            success: false,
            error: `Unknown goal: ${params.goal}. Available goals: ${availableGoals || 'none (seed actions first)'}`,
          };
        }

        goalConditions = found.conditions;
        goalName = found.name;
      } else {
        // Use custom goal conditions
        goalConditions = params.goal as StateConditions;
        goalName = 'custom';
      }

      // Get current state or use default
      const currentState = params.currentState || await this.detectCurrentState();

      // Build constraints
      const constraints: PlanConstraints | undefined = params.constraints
        ? {
            maxCost: params.constraints.maxCost,
            maxDurationMs: params.constraints.maxDurationMs,
            requiredAgentTypes: params.constraints.requiredAgentTypes,
            excludedActions: params.constraints.excludedActions,
          }
        : undefined;

      // Find plan using A* search
      const plan = await planner.findPlan(currentState, goalConditions, constraints);

      if (!plan) {
        return {
          success: false,
          error:
            'No valid plan found for the given goal and constraints. ' +
            'Try relaxing constraints or seeding more actions.',
        };
      }

      // Mark as real data
      this.markAsRealData();

      return {
        success: true,
        data: {
          planId: plan.id,
          goal: params.goal,
          actions: plan.actions.map((a) => ({
            name: a.name,
            agentType: a.agentType,
            cost: a.cost,
            category: a.category,
            description: a.description,
          })),
          totalCost: plan.totalCost,
          estimatedDurationMs: plan.estimatedDurationMs,
          stepCount: plan.actions.length,
          reusedFrom: plan.reusedFrom,
          similarityScore: plan.similarityScore,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Detect current world state
   * In a full implementation, this would integrate with actual QE metrics
   */
  private async detectCurrentState(): Promise<V3WorldState> {
    // Return default state for now
    // Real implementation would query:
    // - Coverage metrics from coverage-analysis domain
    // - Test results from test-execution domain
    // - Security scores from security-compliance domain
    // - Fleet status from coordination
    return { ...DEFAULT_V3_WORLD_STATE };
  }
}
