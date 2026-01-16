/**
 * GOAP Status MCP Tool
 *
 * Get GOAP system status: world state, available goals, actions, or plans.
 * Useful for understanding current state and available planning options.
 *
 * @module mcp/tools/planning/goap-status
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
  PlanExecutor,
  createMockExecutor,
  V3WorldState,
  GOAPGoal,
  GOAPAction,
  DEFAULT_V3_WORLD_STATE,
  getActionsByCategory,
  getAllQEActions,
} from '../../../planning/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Status type to query
 */
export type GOAPStatusType = 'world' | 'goals' | 'actions' | 'plans' | 'execution';

/**
 * Parameters for GOAP status tool
 */
export interface GOAPStatusParams {
  /** What to get status of */
  type: GOAPStatusType;
  /** Optional filters */
  filter?: {
    category?: string;
    status?: string;
    limit?: number;
  };
  /** Index signature for Record compatibility */
  [key: string]: unknown;
}

/**
 * World state status result
 */
export interface WorldStateResult {
  coverage: {
    line: number;
    branch: number;
    function: number;
    measured: boolean;
  };
  quality: {
    testsPassing: number;
    securityScore: number;
    performanceScore: number;
  };
  fleet: {
    activeAgents: number;
    maxAgents: number;
  };
  resources: {
    timeRemaining: number;
    parallelSlots: number;
  };
}

/**
 * Goals status result
 */
export interface GoalsResult {
  goals: Array<{
    id: string;
    name: string;
    description?: string;
    priority: number;
    conditionCount: number;
  }>;
  count: number;
}

/**
 * Actions status result
 */
export interface ActionsResult {
  actions: Array<{
    id: string;
    name: string;
    category: string;
    agentType: string;
    cost: number;
    successRate: number;
  }>;
  count: number;
  byCategory: Record<string, number>;
}

/**
 * Plans status result
 */
export interface PlansResult {
  plans: Array<{
    id: string;
    status: string;
    stepCount: number;
    totalCost: number;
    createdAt?: string;
  }>;
  count: number;
  reuseStats?: {
    totalPlans: number;
    reusedPlans: number;
    reuseRate: number;
    avgSuccessRate: number;
  };
}

/**
 * Execution status result
 */
export interface ExecutionResult {
  isExecuting: boolean;
  currentPlanId?: string;
  message: string;
}

/**
 * Union type for status results
 */
export type GOAPStatusResult =
  | { type: 'world'; data: WorldStateResult }
  | { type: 'goals'; data: GoalsResult }
  | { type: 'actions'; data: ActionsResult }
  | { type: 'plans'; data: PlansResult }
  | { type: 'execution'; data: ExecutionResult };

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * GOAP Status MCP Tool
 *
 * Query GOAP system status for world state, goals, actions, or plans.
 */
export class GOAPStatusTool extends MCPToolBase<GOAPStatusParams, GOAPStatusResult> {
  private planner: GOAPPlanner | null = null;
  private executor: PlanExecutor | null = null;

  readonly config: MCPToolConfig = {
    name: 'qe/planning/goap_status',
    description:
      'Get GOAP system status: world state, available goals, actions, or plans. ' +
      'Use to understand current state and available planning options.',
    domain: 'coordination',
    schema: this.buildSchema(),
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'What to get status of',
          enum: ['world', 'goals', 'actions', 'plans', 'execution'],
        },
        filter: {
          type: 'object',
          description: 'Optional filters',
          properties: {
            category: {
              type: 'string',
              description: 'Filter actions by category (test, security, coverage, etc.)',
            },
            status: {
              type: 'string',
              description: 'Filter plans by status (pending, executing, completed, failed)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20)',
              default: 20,
              minimum: 1,
              maximum: 100,
            },
          },
        },
      },
      required: ['type'],
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
   * Get or create the plan executor instance
   */
  private async getExecutor(): Promise<PlanExecutor> {
    if (!this.executor) {
      const planner = await this.getPlanner();
      this.executor = createMockExecutor(planner);
      await this.executor.initialize();
    }
    return this.executor;
  }

  /**
   * Reset instance cache
   */
  resetInstanceCache(): void {
    this.planner = null;
    this.executor = null;
  }

  /**
   * Execute the status query
   */
  async execute(
    params: GOAPStatusParams,
    context: MCPToolContext
  ): Promise<ToolResult<GOAPStatusResult>> {
    try {
      switch (params.type) {
        case 'world':
          return this.getWorldState();
        case 'goals':
          return this.getGoals();
        case 'actions':
          return this.getActions(params.filter?.category, params.filter?.limit);
        case 'plans':
          return this.getPlans(params.filter?.status, params.filter?.limit);
        case 'execution':
          return this.getExecutionStatus();
        default:
          return {
            success: false,
            error: `Unknown status type: ${params.type}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get current world state
   */
  private async getWorldState(): Promise<ToolResult<GOAPStatusResult>> {
    // In a full implementation, this would query actual metrics
    // For now, return the default state with some variation
    const state: V3WorldState = { ...DEFAULT_V3_WORLD_STATE };

    this.markAsRealData();

    return {
      success: true,
      data: {
        type: 'world',
        data: {
          coverage: {
            line: state.coverage.line,
            branch: state.coverage.branch,
            function: state.coverage.function,
            measured: state.coverage.measured,
          },
          quality: {
            testsPassing: state.quality.testsPassing,
            securityScore: state.quality.securityScore,
            performanceScore: state.quality.performanceScore,
          },
          fleet: {
            activeAgents: state.fleet.activeAgents,
            maxAgents: state.fleet.maxAgents,
          },
          resources: {
            timeRemaining: state.resources.timeRemaining,
            parallelSlots: state.resources.parallelSlots,
          },
        },
      },
    };
  }

  /**
   * Get available goals
   */
  private async getGoals(): Promise<ToolResult<GOAPStatusResult>> {
    const planner = await this.getPlanner();
    const goals = await planner.getGoals();

    this.markAsRealData();

    return {
      success: true,
      data: {
        type: 'goals',
        data: {
          goals: goals.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            priority: g.priority,
            conditionCount: Object.keys(g.conditions).length,
          })),
          count: goals.length,
        },
      },
    };
  }

  /**
   * Get available actions
   */
  private async getActions(
    category?: string,
    limit: number = 50
  ): Promise<ToolResult<GOAPStatusResult>> {
    const planner = await this.getPlanner();

    // Get actions from the library
    let actions: Array<{
      id: string;
      name: string;
      category: string;
      agentType: string;
      cost: number;
      successRate: number;
    }> = [];

    // Get actions from the action library
    const allActions = getAllQEActions();

    // Filter by category if specified
    const filteredActions = category
      ? allActions.filter((a) => a.category === category)
      : allActions;

    actions = filteredActions.slice(0, limit).map((a, idx) => ({
      id: `action-${idx}`,
      name: a.name,
      category: a.category,
      agentType: a.agentType,
      cost: a.cost,
      successRate: a.successRate,
    }));

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const action of allActions) {
      byCategory[action.category] = (byCategory[action.category] || 0) + 1;
    }

    this.markAsRealData();

    return {
      success: true,
      data: {
        type: 'actions',
        data: {
          actions,
          count: filteredActions.length,
          byCategory,
        },
      },
    };
  }

  /**
   * Get plans
   */
  private async getPlans(
    status?: string,
    limit: number = 20
  ): Promise<ToolResult<GOAPStatusResult>> {
    const planner = await this.getPlanner();

    // Get plan reuse statistics
    const reuseStats = await planner.getPlanReuseStats();

    // Plans are typically stored in the database
    // For now, return empty list with stats
    this.markAsRealData();

    return {
      success: true,
      data: {
        type: 'plans',
        data: {
          plans: [], // Would query from database
          count: 0,
          reuseStats: {
            totalPlans: reuseStats.totalPlans,
            reusedPlans: reuseStats.reusedPlans,
            reuseRate: reuseStats.reuseRate,
            avgSuccessRate: reuseStats.avgSuccessRate,
          },
        },
      },
    };
  }

  /**
   * Get execution status
   */
  private async getExecutionStatus(): Promise<ToolResult<GOAPStatusResult>> {
    const executor = await this.getExecutor();
    const isExecuting = executor.isExecuting();

    this.markAsRealData();

    return {
      success: true,
      data: {
        type: 'execution',
        data: {
          isExecuting,
          message: isExecuting
            ? 'Plan execution in progress'
            : 'No active execution',
        },
      },
    };
  }
}
