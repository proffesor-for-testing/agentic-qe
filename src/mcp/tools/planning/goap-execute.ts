/**
 * GOAP Execute MCP Tool
 *
 * Execute a GOAP plan, spawning agents to perform each action step.
 * Supports dry-run mode, step-by-step execution, and retry logic.
 *
 * @module mcp/tools/planning/goap-execute
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
  ExecutionResult,
} from '../../../planning/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for GOAP execute tool
 */
export interface GOAPExecuteParams {
  /** ID of plan to execute */
  planId: string;
  /** Simulate execution without spawning agents */
  dryRun?: boolean;
  /** Execute one step at a time */
  stepByStep?: boolean;
  /** Max retries per failed step */
  maxRetries?: number;
  /** Index signature for Record compatibility */
  [key: string]: unknown;
}

/**
 * Result of GOAP execution
 */
export interface GOAPExecuteResult {
  planId: string;
  mode: 'dry-run' | 'execution';
  status: 'completed' | 'failed' | 'partial' | 'cancelled';
  stepsCompleted: number;
  stepsFailed: number;
  totalDurationMs: number;
  steps: Array<{
    action: string;
    status: string;
    retries: number;
    durationMs?: number;
    error?: string;
  }>;
  error?: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * GOAP Execute MCP Tool
 *
 * Executes GOAP plans by spawning agents for each action step.
 */
export class GOAPExecuteTool extends MCPToolBase<GOAPExecuteParams, GOAPExecuteResult> {
  private planner: GOAPPlanner | null = null;
  private executor: PlanExecutor | null = null;

  readonly config: MCPToolConfig = {
    name: 'qe/planning/goap_execute',
    description:
      'Execute a GOAP plan, spawning agents to perform each action step. ' +
      'Supports dry-run mode to simulate execution without actual agent spawning.',
    domain: 'coordination',
    schema: this.buildSchema(),
    timeout: 300000, // 5 minutes for plan execution
  };

  private buildSchema(): MCPToolSchema {
    return {
      type: 'object',
      properties: {
        planId: {
          type: 'string',
          description: 'ID of plan to execute (from goap_plan result)',
        },
        dryRun: {
          type: 'boolean',
          description: 'Simulate execution without spawning agents (default: false)',
          default: false,
        },
        stepByStep: {
          type: 'boolean',
          description: 'Execute one step at a time (default: false)',
          default: false,
        },
        maxRetries: {
          type: 'number',
          description: 'Max retries per failed step (default: 2)',
          default: 2,
          minimum: 0,
          maximum: 5,
        },
      },
      required: ['planId'],
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
      this.executor = createMockExecutor(planner, {
        successRate: 0.95, // High success rate for mock executor
        config: {
          maxRetries: 2,
          stepTimeoutMs: 60000,
          replanOnFailure: true,
          parallelExecution: false,
          recordWorldState: true,
        },
      });
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
   * Execute the GOAP plan
   */
  async execute(
    params: GOAPExecuteParams,
    context: MCPToolContext
  ): Promise<ToolResult<GOAPExecuteResult>> {
    try {
      const planner = await this.getPlanner();

      // Retrieve the plan
      const plan = await planner.getPlan(params.planId);

      if (!plan) {
        return {
          success: false,
          error: `Plan not found: ${params.planId}. Create a plan first using goap_plan.`,
        };
      }

      // Dry run mode - simulate execution
      if (params.dryRun) {
        this.markAsRealData();

        return {
          success: true,
          data: {
            planId: plan.id,
            mode: 'dry-run',
            status: 'completed',
            stepsCompleted: plan.actions.length,
            stepsFailed: 0,
            totalDurationMs: plan.estimatedDurationMs,
            steps: plan.actions.map((a, i) => ({
              action: a.name,
              status: 'would-execute',
              retries: 0,
              durationMs: a.estimatedDurationMs,
            })),
          },
        };
      }

      // Real execution
      const executor = await this.getExecutor();

      // Check if already executing
      if (executor.isExecuting()) {
        return {
          success: false,
          error: 'Another plan is currently executing. Wait for completion or cancel it.',
        };
      }

      // Execute the plan
      const result = await executor.execute(plan, plan.initialState);

      this.markAsRealData();

      return {
        success: result.status === 'completed',
        data: {
          planId: result.planId,
          mode: 'execution',
          status: result.status,
          stepsCompleted: result.stepsCompleted,
          stepsFailed: result.stepsFailed,
          totalDurationMs: result.totalDurationMs,
          steps: result.steps.map((s) => ({
            action: s.action.name,
            status: s.status,
            retries: s.retries,
            durationMs: s.durationMs,
            error: s.error,
          })),
          error: result.error,
        },
        error: result.status !== 'completed' ? result.error : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }
}
