/**
 * GOAP (Goal-Oriented Action Planning) Type Definitions
 *
 * Core types for the A* planning system used across:
 * - Quality Gate decisions
 * - Test Strategy generation
 * - Fleet Orchestration
 * - Failure Recovery
 *
 * @module planning/types
 * @version 1.0.0
 */

/**
 * World State - Observable state of the system
 */
export interface WorldState {
  // Test/Coverage State
  coverage: {
    line: number;           // 0-100
    branch: number;         // 0-100
    function: number;       // 0-100
    target: number;         // Required threshold
    measured?: boolean;     // True if coverage has been measured
  };

  // Quality State
  quality: {
    testsPassing: number;   // 0-100%
    securityScore: number;  // 0-100
    performanceScore: number; // 0-100
    technicalDebt: number;  // Days
    gateStatus?: 'pending' | 'passed' | 'failed' | 'exception_requested' | 'deferred';
    smokeTestsPassing?: boolean;
    criticalPathTested?: boolean;
    // Measurement flags - track what has been measured
    testsMeasured?: boolean;        // True if unit tests have been run
    integrationTested?: boolean;    // True if integration tests have been run
    securityMeasured?: boolean;     // True if security scan has been run
    performanceMeasured?: boolean;  // True if performance benchmark has been run
    complexityMeasured?: boolean;   // True if code complexity has been analyzed
    gateEvaluated?: boolean;        // True if quality gate has been evaluated
  };

  // Agent Fleet State
  fleet: {
    activeAgents: number;
    availableAgents: string[];  // Agent type IDs
    busyAgents: string[];
    agentTypes: Record<string, number>;  // Type -> count
    topologyOptimized?: boolean;         // True if topology has been optimized
  };

  // Resource Constraints
  resources: {
    timeRemaining: number;    // Seconds
    memoryAvailable: number;  // MB
    parallelSlots: number;    // Concurrent capacity
  };

  // Execution Context
  context: {
    environment: 'development' | 'staging' | 'production';
    changeSize: 'small' | 'medium' | 'large';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    previousFailures: number;
    projectId?: string;
    impactedFiles?: string[];
    suggestedTests?: string[];
    testPriority?: 'ranked';
    // Analysis flags - track what analysis has been done
    impactAnalyzed?: boolean;       // True if change impact has been analyzed
    coverageGapsAnalyzed?: boolean; // True if coverage gaps have been analyzed
    bddGenerated?: boolean;         // True if BDD scenarios have been generated
  };
}

/**
 * Condition operators for preconditions and goal conditions
 */
export interface ConditionOperators {
  gte?: number;           // Greater than or equal
  gt?: number;            // Greater than
  lte?: number;           // Less than or equal
  lt?: number;            // Less than
  eq?: any;               // Equal
  ne?: any;               // Not equal
  contains?: string;      // Array contains value
  exists?: boolean;       // Property exists
  in?: any[];             // Value in array
}

/**
 * State conditions - key-value pairs with operators
 */
export type StateConditions = Record<string, ConditionOperators | any>;

/**
 * Effect operators for action effects
 */
export interface EffectOperators {
  set?: any;              // Set to specific value (used for booleans and enums)
  increase?: number;      // Increase by amount
  decrease?: number;      // Decrease by amount
  increment?: number;     // Increment by 1 (or specified)
  decrement?: number;     // Decrement by 1 (or specified)
  add?: string;           // Add to array
  remove?: string;        // Remove from array
  // NOTE: 'update?: measured' was removed - we now use proper flag-based effects
  // where measurement actions set boolean flags (e.g., testsMeasured: { set: true })
}

/**
 * Action effects - state changes after action execution
 */
export type ActionEffects = Record<string, EffectOperators>;

/**
 * GOAP Action - Atomic operation with preconditions and effects
 */
export interface GOAPAction {
  id: string;
  name: string;
  description?: string;
  agentType: string;           // Which agent can execute
  preconditions: StateConditions;
  effects: ActionEffects;
  cost: number;                // Base action cost (1.0 = normal)
  durationEstimate?: number;   // Expected milliseconds
  successRate?: number;        // Historical success rate (0-1)
  executionCount?: number;     // Times executed
  category: 'test' | 'security' | 'performance' | 'process' | 'fleet' | 'analysis' | 'coverage';
}

/**
 * GOAP Goal - Target state to achieve
 */
export interface GOAPGoal {
  id: string;
  name: string;
  description?: string;
  conditions: StateConditions; // Required world state
  priority: number;            // 1=low, 5=critical
  costWeight?: number;         // Multiplier for action costs
  deadlineSeconds?: number;    // Optional time constraint
}

/**
 * GOAP Plan - Sequence of actions to achieve goal
 */
export interface GOAPPlan {
  id: string;
  goalId?: string;
  actions: GOAPAction[];
  totalCost: number;
  estimatedDuration: number;
  goalConditions: StateConditions;
  initialState?: WorldState;
  status?: 'pending' | 'executing' | 'completed' | 'failed' | 'replanned';
  alternativePaths?: GOAPPlan[];
}

/**
 * Plan constraints for A* search
 */
export interface PlanConstraints {
  maxIterations?: number;      // Max A* iterations
  timeoutMs?: number;          // Planning timeout
  allowedCategories?: string[]; // Only use actions in these categories
  excludedActions?: string[];  // Skip these action IDs
  maxPlanLength?: number;      // Max actions in plan
  preferredAgentTypes?: string[]; // Prefer these agent types
}

/**
 * A* Search Node
 */
export interface PlanNode {
  state: WorldState;
  gCost: number;       // Cost from start
  hCost: number;       // Heuristic to goal
  fCost: number;       // g + h
  action: GOAPAction | null;
  parent: PlanNode | null;
  depth: number;       // Plan depth
}

/**
 * Executed action result
 */
export interface ExecutedAction {
  action: GOAPAction;
  success: boolean;
  result?: any;
  error?: string;
  stateBefore: WorldState;
  stateAfter: WorldState;
  executionTimeMs: number;
  agentId?: string;
}

/**
 * Execution progress event
 */
export interface ExecutionStep {
  type: 'action-started' | 'action-completed' | 'action-failed' | 'replanning' | 'plan-completed';
  actionId?: string;
  progress: number;           // 0-1
  failedActionId?: string;
  newPlanLength?: number;
  message?: string;
}

/**
 * Plan execution result
 */
export interface ExecutionResult {
  success: boolean;
  executedActions: ExecutedAction[];
  finalState: WorldState;
  failedAtAction?: string;
  reason?: string;
  totalExecutionTimeMs?: number;
  replannedCount?: number;
}

/**
 * Database record types
 */
export interface GOAPGoalRecord {
  id: string;
  name: string;
  description: string | null;
  conditions: string;          // JSON
  priority: number;
  cost_weight: number;
  deadline_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface GOAPActionRecord {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  preconditions: string;       // JSON
  effects: string;             // JSON
  cost: number;
  duration_estimate: number | null;
  success_rate: number;
  execution_count: number;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface GOAPPlanRecord {
  id: string;
  goal_id: string;
  initial_state: string;       // JSON
  goal_state: string;          // JSON
  action_sequence: string;     // JSON
  total_cost: number;
  estimated_duration: number | null;
  actual_duration: number | null;
  status: string;
  success: number | null;      // SQLite boolean
  failure_reason: string | null;
  execution_trace: string | null; // JSON
  replanned_from: string | null;
  created_at: string;
  executed_at: string | null;
  completed_at: string | null;
}

export interface GOAPExecutionStepRecord {
  id: string;
  plan_id: string;
  action_id: string;
  step_order: number;
  world_state_before: string | null;  // JSON
  world_state_after: string | null;   // JSON
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  agent_id: string | null;
}

/**
 * Default world state for initialization
 */
export const DEFAULT_WORLD_STATE: WorldState = {
  coverage: {
    line: 0,
    branch: 0,
    function: 0,
    target: 80,
    measured: false
  },
  quality: {
    testsPassing: 0,
    securityScore: 100,
    performanceScore: 100,
    technicalDebt: 0,
    gateStatus: 'pending',
    // All measurement flags start false - must run measurement actions first
    testsMeasured: false,
    integrationTested: false,
    securityMeasured: false,
    performanceMeasured: false,
    complexityMeasured: false,
    gateEvaluated: false
  },
  fleet: {
    activeAgents: 0,
    availableAgents: [],
    busyAgents: [],
    agentTypes: {},
    topologyOptimized: false
  },
  resources: {
    timeRemaining: 3600,  // 1 hour default
    memoryAvailable: 4096, // 4GB default
    parallelSlots: 4
  },
  context: {
    environment: 'development',
    changeSize: 'medium',
    riskLevel: 'medium',
    previousFailures: 0,
    impactAnalyzed: false,
    coverageGapsAnalyzed: false,
    bddGenerated: false
  }
};
