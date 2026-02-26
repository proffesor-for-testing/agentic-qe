/**
 * Agentic QE v3 - Neural GOAP Optimizer
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 5
 *
 * Implements Goal-Oriented Action Planning (GOAP) with neural learning
 * for intelligent QE swarm coordination.
 *
 * Key Components:
 * - GOAPState: Current world state representation
 * - GOAPGoal: Desired end states for QE
 * - GOAPAction: Available actions with preconditions and effects
 * - NeuralPlanner: ML-enhanced action planning
 * - GOAPController: Main orchestrator for goal achievement
 *
 * Integration:
 * - SwarmGraph for topology state
 * - StrangeLoopController for self-healing actions
 * - UnifiedMemoryManager for persistence
 *
 * Reference: ADR-047 MinCut GOAP Integration
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName, Priority, Severity, DomainEvent } from '../../shared/types';
import { EventBus, MemoryBackend } from '../../kernel/interfaces';
import { SwarmGraph } from './swarm-graph';
import { MinCutCalculator, createMinCutCalculator } from './mincut-calculator';
import { StrangeLoopController } from './strange-loop';
import { WeakVertex, ReorganizationAction, ReorganizationResult } from './interfaces';
import { toErrorMessage } from '../../shared/error-utils.js';
import { secureRandom } from '../../shared/utils/crypto-random.js';

// ============================================================================
// GOAP State - Current World State
// ============================================================================

/**
 * Current world state for QE GOAP planning
 */
export interface GOAPState {
  /** Test coverage percentage (0-100) */
  readonly coverage: number;

  /** Test pass rate (0-1) */
  readonly passRate: number;

  /** MinCut health value (higher = healthier topology) */
  readonly minCutHealth: number;

  /** Number of active agents */
  readonly activeAgents: number;

  /** Number of pending tests */
  readonly pendingTests: number;

  /** Number of failing tests */
  readonly failingTests: number;

  /** Average test execution time (ms) */
  readonly avgExecutionTime: number;

  /** Current weak vertices in topology */
  readonly weakVertices: number;

  /** Memory usage percentage (0-100) */
  readonly memoryUsage: number;

  /** Timestamp of state capture */
  readonly timestamp: Date;
}

/**
 * Create initial GOAP state with defaults
 */
export function createInitialState(partial?: Partial<GOAPState>): GOAPState {
  return {
    coverage: partial?.coverage ?? 0,
    passRate: partial?.passRate ?? 1,
    minCutHealth: partial?.minCutHealth ?? 0,
    activeAgents: partial?.activeAgents ?? 0,
    pendingTests: partial?.pendingTests ?? 0,
    failingTests: partial?.failingTests ?? 0,
    avgExecutionTime: partial?.avgExecutionTime ?? 0,
    weakVertices: partial?.weakVertices ?? 0,
    memoryUsage: partial?.memoryUsage ?? 0,
    timestamp: new Date(),
  };
}

// ============================================================================
// GOAP Goals - Desired End States
// ============================================================================

/**
 * Goal types for QE GOAP planning
 */
export type GOAPGoalType =
  | 'achieve_coverage'     // Target coverage percentage
  | 'fix_failures'         // Reduce failure count to 0
  | 'strengthen_topology'  // Increase MinCut value
  | 'optimize_performance' // Reduce execution time
  | 'scale_agents'         // Adjust agent count
  | 'reduce_weak_vertices'; // Heal topology weak points

/**
 * Goal definition with target conditions
 */
export interface GOAPGoal {
  /** Unique goal identifier */
  readonly id: string;

  /** Goal type */
  readonly type: GOAPGoalType;

  /** Target state conditions */
  readonly targetConditions: Partial<GOAPState>;

  /** Goal priority (lower = higher priority) */
  readonly priority: number;

  /** Maximum time to achieve goal (ms) */
  readonly timeout: number;

  /** Whether goal is achieved given current state */
  isAchieved(state: GOAPState): boolean;

  /** Calculate distance to goal (heuristic for A*) */
  distanceToGoal(state: GOAPState): number;
}

/**
 * Goal factory for common QE goals
 */
export const GOAPGoals = {
  /**
   * Achieve target coverage percentage
   */
  achieveCoverage(targetCoverage: number, priority: number = 1): GOAPGoal {
    return {
      id: `coverage-${targetCoverage}-${uuidv4().slice(0, 8)}`,
      type: 'achieve_coverage',
      targetConditions: { coverage: targetCoverage },
      priority,
      timeout: 300000, // 5 minutes
      isAchieved: (state: GOAPState) => state.coverage >= targetCoverage,
      distanceToGoal: (state: GOAPState) => Math.max(0, targetCoverage - state.coverage),
    };
  },

  /**
   * Fix all failing tests
   */
  fixFailures(priority: number = 0): GOAPGoal {
    return {
      id: `fix-failures-${uuidv4().slice(0, 8)}`,
      type: 'fix_failures',
      targetConditions: { failingTests: 0, passRate: 1 },
      priority,
      timeout: 600000, // 10 minutes
      isAchieved: (state: GOAPState) => state.failingTests === 0 && state.passRate === 1,
      distanceToGoal: (state: GOAPState) => state.failingTests + (1 - state.passRate) * 100,
    };
  },

  /**
   * Strengthen topology to target MinCut value
   */
  strengthenTopology(targetMinCut: number, priority: number = 2): GOAPGoal {
    return {
      id: `topology-${targetMinCut}-${uuidv4().slice(0, 8)}`,
      type: 'strengthen_topology',
      targetConditions: { minCutHealth: targetMinCut, weakVertices: 0 },
      priority,
      timeout: 180000, // 3 minutes
      isAchieved: (state: GOAPState) =>
        state.minCutHealth >= targetMinCut && state.weakVertices === 0,
      distanceToGoal: (state: GOAPState) =>
        Math.max(0, targetMinCut - state.minCutHealth) + state.weakVertices,
    };
  },

  /**
   * Optimize performance to target execution time
   */
  optimizePerformance(targetTimeMs: number, priority: number = 3): GOAPGoal {
    return {
      id: `perf-${targetTimeMs}-${uuidv4().slice(0, 8)}`,
      type: 'optimize_performance',
      targetConditions: { avgExecutionTime: targetTimeMs },
      priority,
      timeout: 300000, // 5 minutes
      isAchieved: (state: GOAPState) => state.avgExecutionTime <= targetTimeMs,
      distanceToGoal: (state: GOAPState) =>
        Math.max(0, state.avgExecutionTime - targetTimeMs) / 1000,
    };
  },

  /**
   * Scale agents to target count
   */
  scaleAgents(targetCount: number, priority: number = 2): GOAPGoal {
    return {
      id: `scale-${targetCount}-${uuidv4().slice(0, 8)}`,
      type: 'scale_agents',
      targetConditions: { activeAgents: targetCount },
      priority,
      timeout: 120000, // 2 minutes
      isAchieved: (state: GOAPState) => state.activeAgents === targetCount,
      distanceToGoal: (state: GOAPState) => Math.abs(targetCount - state.activeAgents),
    };
  },

  /**
   * Reduce weak vertices to zero
   */
  healWeakVertices(priority: number = 1): GOAPGoal {
    return {
      id: `heal-vertices-${uuidv4().slice(0, 8)}`,
      type: 'reduce_weak_vertices',
      targetConditions: { weakVertices: 0 },
      priority,
      timeout: 180000, // 3 minutes
      isAchieved: (state: GOAPState) => state.weakVertices === 0,
      distanceToGoal: (state: GOAPState) => state.weakVertices,
    };
  },
};

// ============================================================================
// GOAP Actions - Available Operations
// ============================================================================

/**
 * Action types available for GOAP planning
 */
export type GOAPActionType =
  | 'generate_tests'     // Generate new tests to increase coverage
  | 'run_tests'          // Execute tests to update pass rate
  | 'spawn_agent'        // Spawn new agent to increase capacity
  | 'terminate_agent'    // Remove agent to reduce resource usage
  | 'heal_topology'      // Strengthen weak connections
  | 'rebalance_load'     // Redistribute work across agents
  | 'optimize_tests'     // Optimize test execution order
  | 'retry_failures'     // Retry failing tests
  | 'no_action';         // Do nothing (planning complete or no valid action)

/**
 * Precondition function type
 */
export type Precondition = (state: GOAPState) => boolean;

/**
 * Effect function type - returns new state after action
 */
export type Effect = (state: GOAPState) => GOAPState;

/**
 * GOAP Action definition
 */
export interface GOAPAction {
  /** Action type */
  readonly type: GOAPActionType;

  /** Human-readable name */
  readonly name: string;

  /** Action cost (lower = preferred) */
  readonly baseCost: number;

  /** Preconditions that must be true to execute */
  readonly preconditions: Precondition[];

  /** Expected effects on state */
  readonly effects: Effect;

  /** Parameters for action execution */
  readonly parameters?: Record<string, unknown>;

  /** Check if action is applicable in current state */
  isApplicable(state: GOAPState): boolean;

  /** Get dynamic cost based on state */
  getCost(state: GOAPState): number;

  /** Simulate effect on state (for planning) */
  simulate(state: GOAPState): GOAPState;
}

/**
 * Create a GOAP action with default implementations
 */
function createAction(config: {
  type: GOAPActionType;
  name: string;
  baseCost: number;
  preconditions: Precondition[];
  effects: Effect;
  parameters?: Record<string, unknown>;
  costModifier?: (state: GOAPState, baseCost: number) => number;
}): GOAPAction {
  return {
    type: config.type,
    name: config.name,
    baseCost: config.baseCost,
    preconditions: config.preconditions,
    effects: config.effects,
    parameters: config.parameters,
    isApplicable(state: GOAPState): boolean {
      return this.preconditions.every((p) => p(state));
    },
    getCost(state: GOAPState): number {
      const modifier = config.costModifier ?? ((_, base) => base);
      return modifier(state, this.baseCost);
    },
    simulate(state: GOAPState): GOAPState {
      return this.effects(state);
    },
  };
}

/**
 * Action factory for common QE actions
 */
export const GOAPActions = {
  /**
   * Generate tests to increase coverage
   */
  generateTests(coverageIncrease: number = 5): GOAPAction {
    return createAction({
      type: 'generate_tests',
      name: 'Generate Tests',
      baseCost: 10,
      preconditions: [
        (state) => state.coverage < 100,
        (state) => state.activeAgents > 0,
      ],
      effects: (state) => ({
        ...state,
        coverage: Math.min(100, state.coverage + coverageIncrease),
        pendingTests: state.pendingTests + 10,
        timestamp: new Date(),
      }),
      parameters: { coverageIncrease },
      costModifier: (state, base) => {
        // Higher cost as coverage approaches 100%
        return base * (1 + state.coverage / 100);
      },
    });
  },

  /**
   * Run tests to update pass rate
   */
  runTests(): GOAPAction {
    return createAction({
      type: 'run_tests',
      name: 'Run Tests',
      baseCost: 5,
      preconditions: [(state) => state.pendingTests > 0 || state.failingTests > 0],
      effects: (state) => ({
        ...state,
        pendingTests: 0,
        passRate: Math.min(1, state.passRate + 0.1),
        failingTests: Math.max(0, state.failingTests - 5),
        timestamp: new Date(),
      }),
    });
  },

  /**
   * Spawn new agent
   */
  spawnAgent(domain: DomainName = 'test-execution'): GOAPAction {
    return createAction({
      type: 'spawn_agent',
      name: `Spawn ${domain} Agent`,
      baseCost: 15,
      preconditions: [
        (state) => state.activeAgents < 20, // Max agents limit
        (state) => state.memoryUsage < 80,  // Memory threshold
      ],
      effects: (state) => ({
        ...state,
        activeAgents: state.activeAgents + 1,
        minCutHealth: state.minCutHealth + 0.5,
        memoryUsage: state.memoryUsage + 5,
        timestamp: new Date(),
      }),
      parameters: { domain },
      costModifier: (state, base) => {
        // Higher cost when many agents already exist
        return base * (1 + state.activeAgents / 10);
      },
    });
  },

  /**
   * Terminate agent to reduce resources
   */
  terminateAgent(): GOAPAction {
    return createAction({
      type: 'terminate_agent',
      name: 'Terminate Agent',
      baseCost: 8,
      preconditions: [
        (state) => state.activeAgents > 1, // Keep at least one agent
      ],
      effects: (state) => ({
        ...state,
        activeAgents: state.activeAgents - 1,
        memoryUsage: Math.max(0, state.memoryUsage - 5),
        timestamp: new Date(),
      }),
    });
  },

  /**
   * Heal topology weak points
   */
  healTopology(): GOAPAction {
    return createAction({
      type: 'heal_topology',
      name: 'Heal Topology',
      baseCost: 12,
      preconditions: [
        (state) => state.weakVertices > 0 || state.minCutHealth < 3.0,
      ],
      effects: (state) => ({
        ...state,
        minCutHealth: state.minCutHealth + 0.5,
        weakVertices: Math.max(0, state.weakVertices - 1),
        timestamp: new Date(),
      }),
      costModifier: (state, base) => {
        // Lower cost when topology is critical
        return base * (state.minCutHealth / 3.0);
      },
    });
  },

  /**
   * Rebalance load across agents
   */
  rebalanceLoad(): GOAPAction {
    return createAction({
      type: 'rebalance_load',
      name: 'Rebalance Load',
      baseCost: 7,
      preconditions: [
        (state) => state.activeAgents >= 2,
        (state) => state.avgExecutionTime > 100,
      ],
      effects: (state) => ({
        ...state,
        avgExecutionTime: state.avgExecutionTime * 0.8,
        minCutHealth: state.minCutHealth + 0.2,
        timestamp: new Date(),
      }),
    });
  },

  /**
   * Optimize test execution order
   */
  optimizeTests(): GOAPAction {
    return createAction({
      type: 'optimize_tests',
      name: 'Optimize Test Order',
      baseCost: 6,
      preconditions: [
        (state) => state.avgExecutionTime > 50,
        (state) => state.pendingTests > 0,
      ],
      effects: (state) => ({
        ...state,
        avgExecutionTime: state.avgExecutionTime * 0.7,
        timestamp: new Date(),
      }),
    });
  },

  /**
   * Retry failing tests
   */
  retryFailures(): GOAPAction {
    return createAction({
      type: 'retry_failures',
      name: 'Retry Failed Tests',
      baseCost: 4,
      preconditions: [(state) => state.failingTests > 0],
      effects: (state) => ({
        ...state,
        failingTests: Math.floor(state.failingTests * 0.7),
        passRate: Math.min(1, state.passRate + 0.05),
        timestamp: new Date(),
      }),
    });
  },

  /**
   * No action (terminal state or no valid action)
   */
  noAction(reason: string = 'No action needed'): GOAPAction {
    return createAction({
      type: 'no_action',
      name: 'No Action',
      baseCost: 0,
      preconditions: [],
      effects: (state) => state,
      parameters: { reason },
    });
  },
};

// ============================================================================
// Neural Planner - ML-Enhanced Planning
// ============================================================================

/**
 * Neural network weight for action cost prediction
 */
interface NeuralWeight {
  /** Action type */
  actionType: GOAPActionType;
  /** State feature weights */
  featureWeights: number[];
  /** Bias term */
  bias: number;
  /** Learning rate */
  learningRate: number;
  /** Usage count for confidence */
  usageCount: number;
}

/**
 * Planning node for A* search
 */
interface PlanningNode {
  /** Current state */
  state: GOAPState;
  /** Actions taken to reach this state */
  actions: GOAPAction[];
  /** Cost so far (g) */
  gCost: number;
  /** Heuristic to goal (h) */
  hCost: number;
  /** Total cost (f = g + h) */
  fCost: number;
}

/**
 * Plan result from neural planner
 */
export interface GOAPPlan {
  /** Planned actions in order */
  readonly actions: GOAPAction[];
  /** Starting state */
  readonly initialState: GOAPState;
  /** Expected final state */
  readonly expectedFinalState: GOAPState;
  /** Total planned cost */
  readonly totalCost: number;
  /** Planning confidence (0-1) */
  readonly confidence: number;
  /** Goal being pursued */
  readonly goal: GOAPGoal;
  /** Planning duration (ms) */
  readonly planningTimeMs: number;
  /** Whether plan achieves goal */
  readonly achievesGoal: boolean;
}

/**
 * Neural Planner Configuration
 */
export interface NeuralPlannerConfig {
  /** Learning rate for neural weights */
  learningRate: number;
  /** Maximum planning iterations */
  maxIterations: number;
  /** Maximum plan length */
  maxPlanLength: number;
  /** Exploration factor for action selection */
  explorationFactor: number;
  /** Minimum confidence threshold */
  minConfidence: number;
}

/**
 * Default neural planner configuration
 */
export const DEFAULT_NEURAL_PLANNER_CONFIG: NeuralPlannerConfig = {
  learningRate: 0.05,
  maxIterations: 1000,
  maxPlanLength: 20,
  explorationFactor: 0.1,
  minConfidence: 0.3,
};

/**
 * Neural Planner - ML-enhanced GOAP planning
 *
 * Uses A* search with neural network-adjusted costs
 * and learns from execution outcomes.
 */
export class NeuralPlanner {
  private readonly config: NeuralPlannerConfig;
  private readonly weights: Map<GOAPActionType, NeuralWeight> = new Map();
  private readonly actionHistory: Array<{
    action: GOAPActionType;
    stateBefore: GOAPState;
    stateAfter: GOAPState;
    actualCost: number;
    success: boolean;
  }> = [];
  private readonly availableActions: GOAPAction[];

  constructor(
    actions: GOAPAction[] = [],
    config: Partial<NeuralPlannerConfig> = {}
  ) {
    this.config = { ...DEFAULT_NEURAL_PLANNER_CONFIG, ...config };
    this.availableActions = actions.length > 0 ? actions : this.getDefaultActions();
    this.initializeWeights();
  }

  /**
   * Get default set of actions
   */
  private getDefaultActions(): GOAPAction[] {
    return [
      GOAPActions.generateTests(),
      GOAPActions.runTests(),
      GOAPActions.spawnAgent(),
      GOAPActions.terminateAgent(),
      GOAPActions.healTopology(),
      GOAPActions.rebalanceLoad(),
      GOAPActions.optimizeTests(),
      GOAPActions.retryFailures(),
    ];
  }

  /**
   * Initialize neural weights for each action type
   */
  private initializeWeights(): void {
    const actionTypes: GOAPActionType[] = [
      'generate_tests',
      'run_tests',
      'spawn_agent',
      'terminate_agent',
      'heal_topology',
      'rebalance_load',
      'optimize_tests',
      'retry_failures',
      'no_action',
    ];

    for (const actionType of actionTypes) {
      this.weights.set(actionType, {
        actionType,
        featureWeights: new Array(9).fill(0.1), // 9 state features
        bias: 0,
        learningRate: this.config.learningRate,
        usageCount: 0,
      });
    }
  }

  /**
   * Extract features from state for neural network
   */
  private extractFeatures(state: GOAPState): number[] {
    return [
      state.coverage / 100,          // Normalized coverage
      state.passRate,                 // Already 0-1
      state.minCutHealth / 5,        // Normalized (assuming max 5)
      state.activeAgents / 20,       // Normalized (max 20)
      state.pendingTests / 100,      // Normalized
      state.failingTests / 50,       // Normalized
      state.avgExecutionTime / 1000, // Normalized (seconds)
      state.weakVertices / 10,       // Normalized
      state.memoryUsage / 100,       // Already percentage
    ];
  }

  /**
   * Predict adjusted cost for action using neural network
   */
  private predictCost(action: GOAPAction, state: GOAPState): number {
    const weights = this.weights.get(action.type);
    if (!weights) {
      return action.getCost(state);
    }

    const features = this.extractFeatures(state);
    const baseCost = action.getCost(state);

    // Neural adjustment: weighted sum of features
    let adjustment = weights.bias;
    for (let i = 0; i < features.length; i++) {
      adjustment += features[i] * weights.featureWeights[i];
    }

    // Apply adjustment with exploration noise
    const noise = secureRandom() < this.config.explorationFactor
      ? (secureRandom() - 0.5) * baseCost * 0.2
      : 0;

    return Math.max(0.1, baseCost + adjustment + noise);
  }

  /**
   * Plan to achieve goal from current state using A* search
   */
  plan(initialState: GOAPState, goal: GOAPGoal): GOAPPlan {
    const startTime = Date.now();

    // Check if already at goal
    if (goal.isAchieved(initialState)) {
      return {
        actions: [],
        initialState,
        expectedFinalState: initialState,
        totalCost: 0,
        confidence: 1.0,
        goal,
        planningTimeMs: Date.now() - startTime,
        achievesGoal: true,
      };
    }

    // A* search
    const openSet: PlanningNode[] = [];
    const closedSet = new Set<string>();

    // Initial node
    const initialNode: PlanningNode = {
      state: initialState,
      actions: [],
      gCost: 0,
      hCost: goal.distanceToGoal(initialState),
      fCost: goal.distanceToGoal(initialState),
    };
    openSet.push(initialNode);

    let iterations = 0;
    let bestNode = initialNode;

    while (openSet.length > 0 && iterations < this.config.maxIterations) {
      iterations++;

      // Get node with lowest fCost
      openSet.sort((a, b) => a.fCost - b.fCost);
      const current = openSet.shift()!;

      // Check if goal reached
      if (goal.isAchieved(current.state)) {
        return this.createPlan(current, initialState, goal, startTime, true);
      }

      // Track best node so far
      if (current.hCost < bestNode.hCost) {
        bestNode = current;
      }

      // Generate state hash for closed set
      const stateHash = this.hashState(current.state);
      if (closedSet.has(stateHash)) {
        continue;
      }
      closedSet.add(stateHash);

      // Check plan length limit
      if (current.actions.length >= this.config.maxPlanLength) {
        continue;
      }

      // Expand with applicable actions
      for (const action of this.availableActions) {
        if (!action.isApplicable(current.state)) {
          continue;
        }

        const newState = action.simulate(current.state);
        const actionCost = this.predictCost(action, current.state);
        const newGCost = current.gCost + actionCost;
        const newHCost = goal.distanceToGoal(newState);

        const newNode: PlanningNode = {
          state: newState,
          actions: [...current.actions, action],
          gCost: newGCost,
          hCost: newHCost,
          fCost: newGCost + newHCost,
        };

        openSet.push(newNode);
      }
    }

    // Return best partial plan if goal not reached
    return this.createPlan(bestNode, initialState, goal, startTime, false);
  }

  /**
   * Create plan result from planning node
   */
  private createPlan(
    node: PlanningNode,
    initialState: GOAPState,
    goal: GOAPGoal,
    startTime: number,
    achievesGoal: boolean
  ): GOAPPlan {
    // Calculate confidence based on usage counts and goal distance
    const confidence = this.calculateConfidence(node, goal);

    return {
      actions: node.actions,
      initialState,
      expectedFinalState: node.state,
      totalCost: node.gCost,
      confidence,
      goal,
      planningTimeMs: Date.now() - startTime,
      achievesGoal,
    };
  }

  /**
   * Calculate confidence in plan
   */
  private calculateConfidence(node: PlanningNode, goal: GOAPGoal): number {
    if (node.actions.length === 0) {
      return goal.isAchieved(node.state) ? 1.0 : 0.1;
    }

    // Base confidence from goal progress
    const initialDistance = goal.distanceToGoal(node.state);
    const baseConfidence = Math.max(0, 1 - initialDistance / 100);

    // Adjust for action usage counts (more usage = more confident)
    let usageSum = 0;
    for (const action of node.actions) {
      const weights = this.weights.get(action.type);
      usageSum += Math.min(100, weights?.usageCount ?? 0);
    }
    const avgUsage = usageSum / node.actions.length;
    const usageConfidence = Math.min(1, avgUsage / 50);

    // Combine factors
    return Math.min(0.99, baseConfidence * 0.7 + usageConfidence * 0.3);
  }

  /**
   * Generate hash for state (for closed set)
   */
  private hashState(state: GOAPState): string {
    return `${Math.round(state.coverage)}-${Math.round(state.passRate * 100)}-${
      Math.round(state.minCutHealth * 10)
    }-${state.activeAgents}-${state.failingTests}-${state.weakVertices}`;
  }

  /**
   * Learn from action outcome
   */
  learn(
    action: GOAPActionType,
    stateBefore: GOAPState,
    stateAfter: GOAPState,
    actualCost: number,
    success: boolean
  ): void {
    const weights = this.weights.get(action);
    if (!weights) return;

    // Record in history
    this.actionHistory.push({
      action,
      stateBefore,
      stateAfter,
      actualCost,
      success,
    });

    // Keep history bounded
    if (this.actionHistory.length > 1000) {
      this.actionHistory.shift();
    }

    // Update usage count
    weights.usageCount++;

    // Calculate prediction error
    const features = this.extractFeatures(stateBefore);
    const baseAction = this.availableActions.find((a) => a.type === action);
    if (!baseAction) return;

    const predictedCost = this.predictCost(baseAction, stateBefore);
    const error = actualCost - predictedCost;

    // Gradient descent update
    for (let i = 0; i < features.length; i++) {
      weights.featureWeights[i] +=
        weights.learningRate * error * features[i] * (success ? 1 : -1);
    }
    weights.bias += weights.learningRate * error * (success ? 1 : -1);
  }

  /**
   * Get expected improvement for action
   */
  getExpectedImprovement(actionType: GOAPActionType): number {
    const history = this.actionHistory.filter((h) => h.action === actionType && h.success);
    if (history.length === 0) {
      // Default expected improvements
      const defaults: Record<GOAPActionType, number> = {
        generate_tests: 5,
        run_tests: 0.1,
        spawn_agent: 0.5,
        terminate_agent: -0.2,
        heal_topology: 0.5,
        rebalance_load: 0.3,
        optimize_tests: 0.2,
        retry_failures: 0.1,
        no_action: 0,
      };
      return defaults[actionType] ?? 0;
    }

    // Calculate average improvement from history
    let totalImprovement = 0;
    for (const entry of history.slice(-20)) {
      totalImprovement += entry.stateAfter.minCutHealth - entry.stateBefore.minCutHealth;
    }
    return totalImprovement / history.length;
  }

  /**
   * Get neural weights for inspection/debugging
   */
  getWeights(): Map<GOAPActionType, NeuralWeight> {
    return new Map(this.weights);
  }

  /**
   * Get action history for analysis
   */
  getHistory(limit: number = 100): typeof this.actionHistory {
    return this.actionHistory.slice(-limit);
  }
}

// ============================================================================
// GOAP Controller - Main Orchestrator
// ============================================================================

/**
 * GOAP Controller Configuration
 */
export interface GOAPControllerConfig {
  /** Enable automatic planning */
  enabled: boolean;
  /** Planning interval (ms) */
  planningIntervalMs: number;
  /** Maximum concurrent goals */
  maxConcurrentGoals: number;
  /** Replan on failure */
  replanOnFailure: boolean;
  /** Maximum replan attempts */
  maxReplanAttempts: number;
  /** Neural planner config */
  plannerConfig: Partial<NeuralPlannerConfig>;
}

/**
 * Default GOAP controller configuration
 */
export const DEFAULT_GOAP_CONTROLLER_CONFIG: GOAPControllerConfig = {
  enabled: true,
  planningIntervalMs: 30000, // 30 seconds
  maxConcurrentGoals: 3,
  replanOnFailure: true,
  maxReplanAttempts: 3,
  plannerConfig: DEFAULT_NEURAL_PLANNER_CONFIG,
};

/**
 * Plan execution result
 */
export interface PlanExecutionResult {
  /** Original plan */
  plan: GOAPPlan;
  /** Actions successfully executed */
  executedActions: GOAPAction[];
  /** Final state achieved */
  finalState: GOAPState;
  /** Whether goal was achieved */
  goalAchieved: boolean;
  /** Execution errors */
  errors: string[];
  /** Total execution time (ms) */
  executionTimeMs: number;
}

/**
 * GOAP Controller - Orchestrates goal-oriented action planning
 *
 * Integrates with:
 * - SwarmGraph for topology state
 * - StrangeLoopController for self-healing
 * - MemoryBackend for persistence
 */
export class GOAPController {
  private readonly config: GOAPControllerConfig;
  private readonly planner: NeuralPlanner;
  private readonly graph: SwarmGraph;
  private readonly calculator: MinCutCalculator;
  private readonly strangeLoop?: StrangeLoopController;
  private readonly memory?: MemoryBackend;
  private readonly eventBus?: EventBus;

  private activeGoals: GOAPGoal[] = [];
  private activePlans: Map<string, GOAPPlan> = new Map();
  private executionResults: PlanExecutionResult[] = [];
  private planningTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    graph: SwarmGraph,
    config: Partial<GOAPControllerConfig> = {},
    strangeLoop?: StrangeLoopController,
    memory?: MemoryBackend,
    eventBus?: EventBus
  ) {
    this.config = { ...DEFAULT_GOAP_CONTROLLER_CONFIG, ...config };
    this.graph = graph;
    this.calculator = createMinCutCalculator();
    this.strangeLoop = strangeLoop;
    this.memory = memory;
    this.eventBus = eventBus;
    this.planner = new NeuralPlanner([], this.config.plannerConfig);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start GOAP controller
   */
  async start(): Promise<void> {
    if (this.running || !this.config.enabled) return;

    this.running = true;

    // Load persisted state
    await this.loadState();

    // Start planning loop
    this.planningTimer = setInterval(
      () => this.planningCycle(),
      this.config.planningIntervalMs
    );

    await this.emitEvent('goap.started', {});
  }

  /**
   * Stop GOAP controller
   */
  async stop(): Promise<void> {
    if (this.planningTimer) {
      clearInterval(this.planningTimer);
      this.planningTimer = null;
    }
    this.running = false;

    // Persist state
    await this.saveState();

    await this.emitEvent('goap.stopped', {});
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Goal Management
  // ==========================================================================

  /**
   * Add a goal to pursue
   */
  addGoal(goal: GOAPGoal): void {
    if (this.activeGoals.length >= this.config.maxConcurrentGoals) {
      // Remove lowest priority goal
      this.activeGoals.sort((a, b) => a.priority - b.priority);
      const removed = this.activeGoals.pop();
      if (removed) {
        this.activePlans.delete(removed.id);
      }
    }

    this.activeGoals.push(goal);
    this.activeGoals.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a goal
   */
  removeGoal(goalId: string): boolean {
    const index = this.activeGoals.findIndex((g) => g.id === goalId);
    if (index >= 0) {
      this.activeGoals.splice(index, 1);
      this.activePlans.delete(goalId);
      return true;
    }
    return false;
  }

  /**
   * Get active goals
   */
  getActiveGoals(): GOAPGoal[] {
    return [...this.activeGoals];
  }

  // ==========================================================================
  // Planning
  // ==========================================================================

  /**
   * Create a plan for a goal
   */
  plan(goal: GOAPGoal): GOAPPlan {
    const currentState = this.getCurrentState();
    const plan = this.planner.plan(currentState, goal);
    this.activePlans.set(goal.id, plan);
    return plan;
  }

  /**
   * Run one planning cycle
   */
  private async planningCycle(): Promise<void> {
    const currentState = this.getCurrentState();

    for (const goal of this.activeGoals) {
      // Check if goal achieved
      if (goal.isAchieved(currentState)) {
        this.removeGoal(goal.id);
        await this.emitEvent('goap.goal_achieved', { goalId: goal.id, goalType: goal.type });
        continue;
      }

      // Check if we need to (re)plan
      const existingPlan = this.activePlans.get(goal.id);
      if (!existingPlan || !existingPlan.achievesGoal) {
        const newPlan = this.plan(goal);
        if (newPlan.actions.length > 0) {
          await this.execute(newPlan);
        }
      }
    }
  }

  // ==========================================================================
  // Execution
  // ==========================================================================

  /**
   * Execute a plan
   */
  async execute(plan: GOAPPlan): Promise<PlanExecutionResult> {
    const startTime = Date.now();
    const executedActions: GOAPAction[] = [];
    const errors: string[] = [];
    let currentState = this.getCurrentState();
    let replanAttempts = 0;

    for (const action of plan.actions) {
      // Check if action still applicable
      if (!action.isApplicable(currentState)) {
        if (this.config.replanOnFailure && replanAttempts < this.config.maxReplanAttempts) {
          replanAttempts++;
          const newPlan = this.plan(plan.goal);
          if (newPlan.actions.length > 0) {
            return this.execute(newPlan);
          }
        }
        errors.push(`Action ${action.name} no longer applicable`);
        break;
      }

      try {
        // Execute action
        const result = await this.executeAction(action, currentState);
        executedActions.push(action);

        // Update state
        const newState = this.getCurrentState();

        // Learn from outcome
        const actualCost = Date.now() - startTime; // Simplified cost
        this.planner.learn(action.type, currentState, newState, actualCost / 1000, result.success);

        currentState = newState;

        // Check if goal achieved early
        if (plan.goal.isAchieved(currentState)) {
          break;
        }
      } catch (error) {
        const errorMsg = toErrorMessage(error);
        errors.push(`Action ${action.name} failed: ${errorMsg}`);

        if (this.config.replanOnFailure && replanAttempts < this.config.maxReplanAttempts) {
          replanAttempts++;
          const newPlan = this.plan(plan.goal);
          if (newPlan.actions.length > 0) {
            return this.execute(newPlan);
          }
        }
        break;
      }
    }

    const result: PlanExecutionResult = {
      plan,
      executedActions,
      finalState: currentState,
      goalAchieved: plan.goal.isAchieved(currentState),
      errors,
      executionTimeMs: Date.now() - startTime,
    };

    this.executionResults.push(result);
    if (this.executionResults.length > 100) {
      this.executionResults.shift();
    }

    await this.emitEvent('goap.plan_executed', {
      goalId: plan.goal.id,
      actionsExecuted: executedActions.length,
      goalAchieved: result.goalAchieved,
    });

    return result;
  }

  /**
   * Execute a single action
   */
  private async executeAction(
    action: GOAPAction,
    state: GOAPState
  ): Promise<{ success: boolean; newState: GOAPState }> {
    switch (action.type) {
      case 'generate_tests':
        // Integrate with test generation domain
        return { success: true, newState: action.simulate(state) };

      case 'run_tests':
        // Integrate with test execution domain
        return { success: true, newState: action.simulate(state) };

      case 'spawn_agent':
        // Integrate with SwarmGraph
        if (this.strangeLoop) {
          const domain = (action.parameters?.domain as DomainName) ?? 'test-execution';
          this.graph.addVertex({
            id: `agent:${uuidv4().slice(0, 8)}`,
            type: 'agent',
            domain,
            capabilities: [],
            weight: 1.0,
            createdAt: new Date(),
          });
        }
        return { success: true, newState: action.simulate(state) };

      case 'terminate_agent':
        // Find and remove least connected agent
        const weakVertices = this.calculator.findWeakVertices(this.graph);
        if (weakVertices.length > 0) {
          const weakestAgent = weakVertices.find((v) => v.vertex.type === 'agent');
          if (weakestAgent) {
            this.graph.removeVertex(weakestAgent.vertexId);
          }
        }
        return { success: true, newState: action.simulate(state) };

      case 'heal_topology':
        // Delegate to Strange Loop
        if (this.strangeLoop && this.strangeLoop.isRunning()) {
          await this.strangeLoop.runCycle();
        }
        return { success: true, newState: action.simulate(state) };

      case 'rebalance_load':
        // Reinforce edges between agents
        const agents = this.graph.getVerticesByType('agent');
        if (agents.length >= 2) {
          const sorted = agents.sort(
            (a, b) => this.graph.weightedDegree(a.id) - this.graph.weightedDegree(b.id)
          );
          const weak = sorted[0];
          const strong = sorted[sorted.length - 1];
          if (!this.graph.hasEdge(weak.id, strong.id)) {
            this.graph.addEdge({
              source: weak.id,
              target: strong.id,
              weight: 0.5,
              type: 'coordination',
              bidirectional: true,
            });
          }
        }
        return { success: true, newState: action.simulate(state) };

      case 'optimize_tests':
      case 'retry_failures':
        // Simulated execution
        return { success: true, newState: action.simulate(state) };

      case 'no_action':
        return { success: true, newState: state };

      default:
        return { success: false, newState: state };
    }
  }

  /**
   * Replan for a goal
   */
  replan(goalId: string): GOAPPlan | null {
    const goal = this.activeGoals.find((g) => g.id === goalId);
    if (!goal) return null;

    const newPlan = this.plan(goal);
    this.activePlans.set(goalId, newPlan);
    return newPlan;
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Get current world state from SwarmGraph and integrations
   */
  getCurrentState(): GOAPState {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    const weakVertices = this.calculator.findWeakVertices(this.graph);
    const stats = this.graph.getStats();

    return {
      coverage: 0, // Would come from coverage domain
      passRate: 1, // Would come from test execution
      minCutHealth: minCutValue,
      activeAgents: this.graph.getVerticesByType('agent').length,
      pendingTests: 0, // Would come from test execution
      failingTests: 0, // Would come from test execution
      avgExecutionTime: 0, // Would come from test execution
      weakVertices: weakVertices.length,
      memoryUsage: 0, // Would come from system metrics
      timestamp: new Date(),
    };
  }

  /**
   * Learn from execution outcome
   */
  learn(outcome: PlanExecutionResult): void {
    for (let i = 0; i < outcome.executedActions.length; i++) {
      const action = outcome.executedActions[i];
      const stateBefore =
        i === 0 ? outcome.plan.initialState : outcome.executedActions[i - 1].simulate(outcome.plan.initialState);
      const stateAfter =
        i === outcome.executedActions.length - 1
          ? outcome.finalState
          : outcome.executedActions[i + 1]?.simulate(stateBefore) ?? outcome.finalState;

      this.planner.learn(
        action.type,
        stateBefore,
        stateAfter,
        1, // Simplified cost
        outcome.errors.length === 0
      );
    }
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save state to memory backend
   */
  private async saveState(): Promise<void> {
    if (!this.memory) return;

    try {
      await this.memory.set('goap:goals', this.activeGoals.map((g) => ({
        id: g.id,
        type: g.type,
        priority: g.priority,
        targetConditions: g.targetConditions,
      })));

      await this.memory.set('goap:weights', Object.fromEntries(this.planner.getWeights()));
      await this.memory.set('goap:history', this.planner.getHistory(100));
    } catch (error) {
      console.error('Failed to save GOAP state:', error);
    }
  }

  /**
   * Load state from memory backend
   */
  private async loadState(): Promise<void> {
    if (!this.memory) return;

    try {
      // Goals are reconstructed, weights and history could be loaded
      // This is a simplified implementation
    } catch (error) {
      console.error('Failed to load GOAP state:', error);
    }
  }

  // ==========================================================================
  // Status & Metrics
  // ==========================================================================

  /**
   * Get controller configuration
   */
  getConfig(): GOAPControllerConfig {
    return { ...this.config };
  }

  /**
   * Get active plans
   */
  getActivePlans(): Map<string, GOAPPlan> {
    return new Map(this.activePlans);
  }

  /**
   * Get execution results
   */
  getExecutionResults(limit: number = 10): PlanExecutionResult[] {
    return this.executionResults.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeGoals: number;
    activePlans: number;
    totalExecutions: number;
    successfulExecutions: number;
    averageExecutionTime: number;
  } {
    const successful = this.executionResults.filter((r) => r.goalAchieved).length;
    const totalTime = this.executionResults.reduce((sum, r) => sum + r.executionTimeMs, 0);

    return {
      activeGoals: this.activeGoals.length,
      activePlans: this.activePlans.size,
      totalExecutions: this.executionResults.length,
      successfulExecutions: successful,
      averageExecutionTime:
        this.executionResults.length > 0 ? totalTime / this.executionResults.length : 0,
    };
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  /**
   * Emit GOAP event
   */
  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type,
      source: 'coordination',
      timestamp: new Date(),
      correlationId: uuidv4(),
      payload,
    };

    try {
      await this.eventBus.publish(event);
    } catch (error) {
      console.error('Failed to publish GOAP event:', error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Neural GOAP Planner
 */
export function createNeuralPlanner(
  actions?: GOAPAction[],
  config?: Partial<NeuralPlannerConfig>
): NeuralPlanner {
  return new NeuralPlanner(actions, config);
}

/**
 * Create a GOAP Controller
 */
export function createGOAPController(
  graph: SwarmGraph,
  config?: Partial<GOAPControllerConfig>,
  strangeLoop?: StrangeLoopController,
  memory?: MemoryBackend,
  eventBus?: EventBus
): GOAPController {
  return new GOAPController(graph, config, strangeLoop, memory, eventBus);
}

/**
 * Create a standard set of GOAP actions
 */
export function createStandardActions(): GOAPAction[] {
  return [
    GOAPActions.generateTests(5),
    GOAPActions.generateTests(10),
    GOAPActions.runTests(),
    GOAPActions.spawnAgent('test-execution'),
    GOAPActions.spawnAgent('test-generation'),
    GOAPActions.terminateAgent(),
    GOAPActions.healTopology(),
    GOAPActions.rebalanceLoad(),
    GOAPActions.optimizeTests(),
    GOAPActions.retryFailures(),
  ];
}
