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
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  GOAPPlanner,
  getSharedGOAPPlanner,
  PlanExecutor,
  createMockExecutor,
  getAllQEActions,
} from '../../../planning/index.js';
import {
  detectWorldState,
  defaultedFields,
  type WorldStateProvenance,
  type WorldStateSources,
} from './world-state.js';

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
 * World state status result.
 *
 * Issue #535: values that are not observed from a live source are reported
 * as `null` (not the planner's optimistic defaults such as securityScore
 * 100), and `provenance` names the source of every field.
 */
export interface WorldStateResult {
  coverage: {
    line: number | null;
    branch: number | null;
    function: number | null;
    measured: boolean;
    /** Coverage report the values were read from, when measured. */
    report?: { source: string; measuredAt: string };
  };
  quality: {
    testsPassing: number | null;
    securityScore: number | null;
    performanceScore: number | null;
  };
  fleet: {
    /** Whether a fleet (fleet_init) is running in this MCP server process. */
    initialized: boolean;
    activeAgents: number;
    maxAgents: number | null;
    availableAgents: string[];
  };
  resources: {
    timeRemaining: number | null;
    parallelSlots: number | null;
  };
  /** Dotted field path -> 'live' | 'measured' | 'caller' | 'default'. */
  provenance: WorldStateProvenance;
  /** Fields the planner would fill with DEFAULT_V3_WORLD_STATE assumptions. */
  defaultedFields: string[];
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

  /** World-state sources; injectable for tests (defaults read live state). */
  constructor(private readonly worldStateSources: WorldStateSources = {}) {
    super();
  }

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
    _context: MCPToolContext
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
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Get current world state.
   *
   * Issue #535: previously returned a static DEFAULT_V3_WORLD_STATE copy
   * (fleet.activeAgents always 0) and called markAsRealData() on it. Now
   * reads the live fleet and any coverage report, reports unobserved values
   * as null, and only claims 'real' when nothing was defaulted.
   */
  private async getWorldState(): Promise<ToolResult<GOAPStatusResult>> {
    const detected = await detectWorldState(this.worldStateSources);
    const { state, provenance } = detected;
    const observed = (field: string): boolean => provenance[field] !== 'default';
    const valueIfObserved = (field: string, value: number): number | null =>
      observed(field) ? value : null;

    const defaulted = defaultedFields(provenance);
    const exposedFields = [
      'coverage.line', 'coverage.branch', 'coverage.function',
      'quality.testsPassing', 'quality.securityScore', 'quality.performanceScore',
      'fleet.activeAgents', 'fleet.maxAgents',
      'resources.timeRemaining', 'resources.parallelSlots',
    ];
    if (exposedFields.every(observed)) {
      this.markAsRealData();
    } else {
      this.markAsEstimatedData();
    }

    return {
      success: true,
      data: {
        type: 'world',
        data: {
          coverage: {
            line: valueIfObserved('coverage.line', state.coverage.line),
            branch: valueIfObserved('coverage.branch', state.coverage.branch),
            function: valueIfObserved('coverage.function', state.coverage.function),
            measured: state.coverage.measured,
            ...(detected.coverageReport ? { report: detected.coverageReport } : {}),
          },
          quality: {
            testsPassing: valueIfObserved('quality.testsPassing', state.quality.testsPassing),
            securityScore: valueIfObserved('quality.securityScore', state.quality.securityScore),
            performanceScore: valueIfObserved('quality.performanceScore', state.quality.performanceScore),
          },
          fleet: {
            initialized: detected.fleetInitialized,
            activeAgents: state.fleet.activeAgents,
            maxAgents: valueIfObserved('fleet.maxAgents', state.fleet.maxAgents),
            availableAgents: [...state.fleet.availableAgents],
          },
          resources: {
            timeRemaining: valueIfObserved('resources.timeRemaining', state.resources.timeRemaining),
            parallelSlots: valueIfObserved('resources.parallelSlots', state.resources.parallelSlots),
          },
          provenance,
          defaultedFields: defaulted,
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
    _status?: string,
    _limit: number = 20
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
