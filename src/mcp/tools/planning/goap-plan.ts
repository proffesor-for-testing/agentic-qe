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
import { toErrorMessage } from '../../../shared/error-utils.js';
import {
  GOAPPlanner,
  getSharedGOAPPlanner,
  V3WorldState,
  StateConditions,
  PlanConstraints,
  validateMaxSteps,
} from '../../../planning/index.js';
import {
  detectWorldState,
  overlayCallerState,
  validateWorldStatePatch,
  defaultedFields,
  type WorldStatePatch,
  type WorldStateProvenance,
  type WorldStateSources,
} from './world-state.js';

/** Constraint keys goap_plan understands; anything else is rejected (#535). */
const KNOWN_CONSTRAINT_KEYS = [
  'maxCost',
  'maxDurationMs',
  'maxSteps',
  'requiredAgentTypes',
  'excludedActions',
] as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for GOAP plan tool
 */
export interface GOAPPlanParams {
  /** Goal name (named goal) or custom goal conditions object */
  goal: string | Record<string, unknown>;
  /** Current world state (auto-detected if not provided; may be partial) */
  currentState?: WorldStatePatch;
  /** Plan constraints */
  constraints?: {
    maxCost?: number;
    maxDurationMs?: number;
    /** Maximum number of plan steps (positive integer) */
    maxSteps?: number;
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
  /**
   * Where each start-state field came from ('live' | 'measured' | 'caller' |
   * 'default'). Issue #535: the plan is only as real as its start state.
   */
  stateProvenance: WorldStateProvenance;
  /** Start-state fields that were DEFAULT_V3_WORLD_STATE assumptions. */
  defaultedFields: string[];
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

  /** World-state sources; injectable for tests (defaults read live state). */
  constructor(private readonly worldStateSources: WorldStateSources = {}) {
    super();
  }

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
            maxSteps: {
              type: 'number',
              description: 'Maximum number of steps (actions) in the plan; positive integer',
              minimum: 1,
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
    _context: MCPToolContext
  ): Promise<ToolResult<GOAPPlanResult>> {
    try {
      // Issue #535: nested constraint properties aren't covered by the base
      // schema validation (and the MCP bridge only exposes top-level
      // params), so validate them here instead of silently ignoring them.
      const constraintError = this.validateConstraints(params.constraints);
      if (constraintError) {
        return { success: false, error: constraintError };
      }

      const planner = await this.getPlanner();

      // Resolve goal to conditions
      let goalConditions: StateConditions;

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
      } else {
        // Use custom goal conditions
        goalConditions = params.goal as StateConditions;
      }

      // Issue #535: start from the live/measured world state (not a static
      // DEFAULT_V3_WORLD_STATE copy), overlaid with any caller-supplied
      // fields, and keep track of which values are assumptions.
      if (params.currentState !== undefined) {
        const stateError = validateWorldStatePatch(params.currentState, [
          ...planner.getReferencedStateKeys(),
          ...Object.keys(goalConditions),
        ]);
        if (stateError) {
          return { success: false, error: `Invalid currentState: ${stateError}` };
        }
      }
      const detected = params.currentState
        ? overlayCallerState(await detectWorldState(this.worldStateSources), params.currentState)
        : await detectWorldState(this.worldStateSources);
      const currentState: V3WorldState = detected.state;
      const defaulted = defaultedFields(detected.provenance);

      // Build constraints
      const constraints: PlanConstraints | undefined = params.constraints
        ? {
            maxCost: params.constraints.maxCost,
            maxDurationMs: params.constraints.maxDurationMs,
            maxSteps: params.constraints.maxSteps,
            requiredAgentTypes: params.constraints.requiredAgentTypes,
            excludedActions: params.constraints.excludedActions,
          }
        : undefined;

      // Find plan using A* search
      const plan = await planner.findPlan(currentState, goalConditions, constraints);

      if (!plan) {
        const stepHint = constraints?.maxSteps !== undefined
          ? ` (maxSteps: ${constraints.maxSteps} — the goal may need more steps)`
          : '';
        return {
          success: false,
          error:
            `No valid plan found for the given goal and constraints${stepHint}. ` +
            'Try relaxing constraints or seeding more actions.',
        };
      }

      // The search is real; the start state is only 'real' if nothing in it
      // was an assumed default.
      if (defaulted.length === 0) {
        this.markAsRealData();
      } else {
        this.markAsEstimatedData();
      }

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
          stateProvenance: detected.provenance,
          defaultedFields: defaulted,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
      };
    }
  }

  /**
   * Validate `constraints` (issue #535): must be an object, only known keys,
   * numeric limits must be numbers, maxSteps a positive integer, and the
   * list constraints string arrays.
   */
  private validateConstraints(constraints: unknown): string | null {
    if (constraints === undefined || constraints === null) return null;
    if (typeof constraints !== 'object' || Array.isArray(constraints)) {
      return 'constraints must be an object';
    }
    const c = constraints as Record<string, unknown>;
    const unknownKeys = Object.keys(c).filter(
      (k) => !(KNOWN_CONSTRAINT_KEYS as readonly string[]).includes(k)
    );
    if (unknownKeys.length > 0) {
      return (
        `Unknown constraint(s): ${unknownKeys.join(', ')}. ` +
        `Supported constraints: ${KNOWN_CONSTRAINT_KEYS.join(', ')}`
      );
    }
    for (const key of ['maxCost', 'maxDurationMs'] as const) {
      const v = c[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
        return `constraints.${key} must be a non-negative number, got ${String(v)}`;
      }
    }
    const stepsError = validateMaxSteps(c.maxSteps);
    if (stepsError) return stepsError;
    for (const key of ['requiredAgentTypes', 'excludedActions'] as const) {
      const v = c[key];
      if (v !== undefined && (!Array.isArray(v) || !v.every((x) => typeof x === 'string'))) {
        return `constraints.${key} must be an array of strings`;
      }
    }
    return null;
  }
}
