/**
 * GOAP (Goal-Oriented Action Planning) Type Definitions for Agentic QE V3
 *
 * Core types for the A* planning system used across:
 * - Quality Gate decisions
 * - Test Strategy generation
 * - Fleet Orchestration
 * - Failure Recovery
 *
 * Adapted from V2 with QE domain integration for V3.
 *
 * @module planning/types
 * @version 3.0.0
 */

import type { QEDomain } from '../learning/qe-patterns.js';

// ============================================================================
// World State - Observable state of the QE system
// ============================================================================

/**
 * V3 World State - Observable state of the QE system
 * Adapted from V2 WorldState with V3-specific additions
 */
export interface V3WorldState {
  // Test/Coverage State
  coverage: {
    /** Line coverage percentage (0-100) */
    line: number;
    /** Branch coverage percentage (0-100) */
    branch: number;
    /** Function coverage percentage (0-100) */
    function: number;
    /** Required coverage threshold */
    target: number;
    /** True if coverage has been measured */
    measured: boolean;
  };

  // Quality State
  quality: {
    /** Percentage of tests passing (0-100) */
    testsPassing: number;
    /** Total number of tests */
    totalTests: number;
    /** Security scan score (0-100) */
    securityScore: number;
    /** Performance benchmark score (0-100) */
    performanceScore: number;
  };

  // Agent Fleet State
  fleet: {
    /** Number of currently active agents */
    activeAgents: number;
    /** Available agent type identifiers */
    availableAgents: string[];
    /** Maximum allowed agents */
    maxAgents: number;
  };

  // Resource Constraints
  resources: {
    /** Time remaining in seconds */
    timeRemaining: number;
    /** Available memory in MB */
    memoryAvailable: number;
    /** Number of parallel execution slots */
    parallelSlots: number;
  };

  // Execution Context
  context: {
    /** Current environment */
    environment: 'development' | 'staging' | 'production';
    /** Current risk assessment level */
    riskLevel: 'low' | 'medium' | 'high';
  };

  // V3-specific: Pattern State
  patterns: {
    /** Number of patterns available */
    available: number;
    /** Number of reusable patterns */
    reusable: number;
  };
}

// ============================================================================
// Condition Operators - For preconditions and goal conditions
// ============================================================================

/**
 * State conditions - key-value pairs with operators
 * Supports primitive values or operator objects for complex conditions
 */
export interface StateConditions {
  [key: string]:
    | string
    | number
    | boolean
    | {
        /** Minimum value (inclusive) */
        min?: number;
        /** Maximum value (inclusive) */
        max?: number;
        /** Exact equality check */
        eq?: unknown;
      };
}

// ============================================================================
// Action Effects - State changes after action execution
// ============================================================================

/**
 * Action effects - state changes after action execution
 * Supports primitive values or delta/set operations
 */
export interface ActionEffects {
  [key: string]:
    | string
    | number
    | boolean
    | {
        /** Delta change (add/subtract) */
        delta?: number;
        /** Set to specific value */
        set?: unknown;
      };
}

// ============================================================================
// GOAP Action - Atomic operation with preconditions and effects
// ============================================================================

/**
 * GOAP Action - Atomic operation that can be executed by an agent
 */
export interface GOAPAction {
  /** Unique action identifier */
  id: string;

  /** Human-readable action name */
  name: string;

  /** Detailed description of what this action does */
  description?: string;

  /** Agent type that can execute this action */
  agentType: string;

  /** Required world state conditions to execute */
  preconditions: StateConditions;

  /** State changes after successful execution */
  effects: ActionEffects;

  /** Base action cost (1.0 = normal) */
  cost: number;

  /** Estimated execution time in milliseconds */
  estimatedDurationMs?: number;

  /** Historical success rate (0-1) */
  successRate: number;

  /** Number of times this action has been executed */
  executionCount: number;

  /** Action category for filtering and organization */
  category:
    | 'test'
    | 'security'
    | 'performance'
    | 'analysis'
    | 'coverage'
    | 'fleet'
    | 'quality';

  /** QE domain this action belongs to */
  qeDomain?: QEDomain;
}

// ============================================================================
// GOAP Goal - Target state to achieve
// ============================================================================

/**
 * GOAP Goal - Target state to achieve through planning
 */
export interface GOAPGoal {
  /** Unique goal identifier */
  id: string;

  /** Human-readable goal name */
  name: string;

  /** Detailed description of this goal */
  description?: string;

  /** Required world state conditions for goal satisfaction */
  conditions: StateConditions;

  /** Goal priority (1=low, 5=critical) */
  priority: number;

  /** QE domain this goal belongs to */
  qeDomain?: QEDomain;
}

// ============================================================================
// GOAP Plan - Sequence of actions to achieve goal
// ============================================================================

/**
 * GOAP Plan - Computed sequence of actions to achieve a goal
 */
export interface GOAPPlan {
  /** Unique plan identifier */
  id: string;

  /** Goal this plan achieves (if associated) */
  goalId?: string;

  /** World state when planning started */
  initialState: V3WorldState;

  /** Target state conditions */
  goalState: StateConditions;

  /** Ordered sequence of actions to execute */
  actions: GOAPAction[];

  /** Total computed cost of the plan */
  totalCost: number;

  /** Estimated total duration in milliseconds */
  estimatedDurationMs: number;

  /** Current plan status */
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

  /** Original plan ID if this plan was reused */
  reusedFrom?: string;

  /** Similarity score when reused (0-1) */
  similarityScore?: number;
}

// ============================================================================
// Execution Step - Individual step in plan execution
// ============================================================================

/**
 * Execution Step - Individual step during plan execution
 */
export interface ExecutionStep {
  /** Unique step identifier */
  id: string;

  /** Plan this step belongs to */
  planId: string;

  /** Action being executed */
  action: GOAPAction;

  /** Order of this step in the plan (0-indexed) */
  stepOrder: number;

  /** World state before this step executed */
  worldStateBefore?: V3WorldState;

  /** World state after this step executed */
  worldStateAfter?: V3WorldState;

  /** Current step status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

  /** Actual execution duration in milliseconds */
  durationMs?: number;

  /** Agent that executed this step */
  agentId?: string;

  /** Error message if step failed */
  error?: string;
}

// ============================================================================
// Plan Constraints - Limits for A* search
// ============================================================================

/**
 * Plan Constraints - Limits and preferences for A* search
 */
export interface PlanConstraints {
  /** Maximum total cost allowed */
  maxCost?: number;

  /** Maximum total duration in milliseconds */
  maxDurationMs?: number;

  /** Only use actions that these agent types can execute */
  requiredAgentTypes?: string[];

  /** Exclude these specific action IDs */
  excludedActions?: string[];

  /** Prefer actions in these QE domains */
  preferredQeDomains?: QEDomain[];
}

// ============================================================================
// Default World State
// ============================================================================

/**
 * Default world state for initialization
 */
export const DEFAULT_V3_WORLD_STATE: V3WorldState = {
  coverage: {
    line: 0,
    branch: 0,
    function: 0,
    target: 80,
    measured: false,
  },
  quality: {
    testsPassing: 0,
    totalTests: 0,
    securityScore: 100,
    performanceScore: 100,
  },
  fleet: {
    activeAgents: 0,
    availableAgents: [],
    maxAgents: 8,
  },
  resources: {
    timeRemaining: 3600, // 1 hour default
    memoryAvailable: 4096, // 4GB default
    parallelSlots: 4,
  },
  context: {
    environment: 'development',
    riskLevel: 'medium',
  },
  patterns: {
    available: 0,
    reusable: 0,
  },
};

// ============================================================================
// Database Record Types (for SQLite persistence)
// ============================================================================

/**
 * Database record for goap_goals table
 */
export interface GOAPGoalRecord {
  id: string;
  name: string;
  description: string | null;
  conditions: string; // JSON
  priority: number;
  qe_domain: string | null;
  created_at: string;
}

/**
 * Database record for goap_actions table
 */
export interface GOAPActionRecord {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  preconditions: string; // JSON
  effects: string; // JSON
  cost: number;
  estimated_duration_ms: number | null;
  success_rate: number;
  execution_count: number;
  category: string;
  qe_domain: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database record for goap_plans table
 */
export interface GOAPPlanRecord {
  id: string;
  goal_id: string | null;
  initial_state: string; // JSON
  goal_state: string; // JSON
  action_sequence: string; // JSON array of action IDs
  total_cost: number;
  estimated_duration_ms: number | null;
  status: string;
  reused_from: string | null;
  similarity_score: number | null;
  created_at: string;
  executed_at: string | null;
  completed_at: string | null;
}

/**
 * Database record for goap_execution_steps table
 */
export interface GOAPExecutionStepRecord {
  id: string;
  plan_id: string;
  action_id: string;
  step_order: number;
  world_state_before: string | null; // JSON
  world_state_after: string | null; // JSON
  status: string;
  duration_ms: number | null;
  agent_id: string | null;
  error_message: string | null;
  created_at: string;
}
