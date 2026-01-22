/**
 * GOAP Planner - A* Search Algorithm for Goal-Oriented Action Planning
 *
 * Implements optimal plan finding using A* search with:
 * - Precondition checking with rich condition operators
 * - Effect application with delta/set operations
 * - Admissible heuristic calculation
 * - Plan reconstruction and caching
 * - Similar plan reuse for performance optimization
 *
 * @module planning/goap-planner
 * @version 3.0.0
 */

import type { Database as DatabaseType } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../kernel/unified-persistence.js';
import type {
  V3WorldState,
  StateConditions,
  ActionEffects,
  GOAPAction,
  GOAPGoal,
  GOAPPlan,
  ExecutionStep,
  PlanConstraints,
  GOAPActionRecord,
  GOAPGoalRecord,
  GOAPPlanRecord,
  GOAPExecutionStepRecord,
} from './types.js';
import { DEFAULT_V3_WORLD_STATE } from './types.js';
import { getAllQEActions, QE_GOALS, toGOAPAction } from './actions/qe-action-library.js';

// ============================================================================
// Internal Types
// ============================================================================

/**
 * A* Search Node for planning
 */
interface PlanNode {
  /** Current world state at this node */
  state: V3WorldState;
  /** Action that led to this node (null for start) */
  action: GOAPAction | null;
  /** Parent node in the search tree */
  parent: PlanNode | null;
  /** Cost from start to this node (g-score) */
  g: number;
  /** Heuristic cost to goal (h-score) */
  h: number;
  /** Total cost: g + h (f-score) */
  f: number;
  /** Depth in the search tree */
  depth: number;
}

/**
 * Plan signature for similarity matching
 */
interface PlanSignature {
  id: string;
  planId: string;
  goalHash: string;
  stateVector: number[];
  actionSequence: string[];
  totalCost: number;
  successRate: number;
  usageCount: number;
  createdAt: string;
}

/**
 * Similar plan result
 */
interface SimilarPlan {
  planId: string;
  signature: PlanSignature;
  similarityScore: number;
  goalMatch: boolean;
}

/**
 * Plan reuse statistics
 */
interface PlanReuseStats {
  totalPlans: number;
  reusedPlans: number;
  reuseRate: number;
  avgSuccessRate: number;
}

// ============================================================================
// GOAPPlanner Class
// ============================================================================

/**
 * GOAP Planner using A* search algorithm
 *
 * Example usage:
 * ```typescript
 * const planner = new GOAPPlanner('./goap.db');
 * await planner.initialize();
 *
 * const plan = await planner.findPlan(
 *   currentState,
 *   { 'coverage.line': { min: 80 } }
 * );
 *
 * if (plan) {
 *   console.log(`Found plan with ${plan.actions.length} actions`);
 * }
 * ```
 */
export class GOAPPlanner {
  private db: DatabaseType | null = null;
  private persistence: UnifiedPersistenceManager | null = null;
  private actions: Map<string, GOAPAction> = new Map();
  private initialized = false;
  private enablePlanReuse = true;

  /**
   * Create a new GOAP Planner (uses unified persistence)
   */
  constructor() {
    // Database initialized in initialize()
  }

  /**
   * Get database instance, throwing if not initialized
   */
  private ensureDb(): DatabaseType {
    if (!this.db) {
      throw new Error('GOAPPlanner not initialized - call initialize() first');
    }
    return this.db;
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the planner - uses unified persistence, seeds default actions
   * ADR-046: Auto-seeds QE actions if database is empty
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use unified persistence
    this.persistence = getUnifiedPersistence();
    if (!this.persistence.isInitialized()) {
      await this.persistence.initialize();
    }
    this.db = this.persistence.getDatabase();

    // ADR-046: Auto-seed QE actions if database is empty
    const actionCount = this.ensureDb().prepare('SELECT COUNT(*) as count FROM goap_actions').get() as { count: number };
    if (actionCount.count === 0) {
      this.seedDefaultActions();
    }

    await this.loadActions();
    this.initialized = true;
    console.log(`[GOAPPlanner] Initialized: ${this.persistence.getDbPath()}`);
  }

  /**
   * Seed default QE actions and goals (ADR-046)
   * Uses direct DB insertion to avoid recursive initialize() calls
   */
  private seedDefaultActions(): void {
    // Seed all QE actions from the library using direct insertion
    const allActions = getAllQEActions();
    const db = this.ensureDb();
    const insertAction = db.prepare(`
      INSERT INTO goap_actions (id, name, description, category, preconditions, effects, cost, qe_domain, agent_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const action of allActions) {
      const id = `action-${Date.now()}-${randomUUID().slice(0, 8)}`;
      insertAction.run(
        id,
        action.name,
        action.description,
        action.category,
        JSON.stringify(action.preconditions),
        JSON.stringify(action.effects),
        action.cost,
        action.qeDomain ?? null,
        action.agentType ?? null
      );
    }

    // Seed QE goals using direct insertion
    const insertGoal = db.prepare(`
      INSERT INTO goap_goals (id, name, description, conditions, priority, qe_domain)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const goal of QE_GOALS) {
      const id = `goal-${Date.now()}-${randomUUID().slice(0, 8)}`;
      insertGoal.run(
        id,
        goal.name,
        goal.description,
        JSON.stringify(goal.conditions),
        goal.priority,
        goal.qeDomain ?? null
      );
    }

    // eslint-disable-next-line no-console
    console.log(`[GOAPPlanner] Seeded ${allActions.length} actions and ${QE_GOALS.length} goals`);
  }

  // ==========================================================================
  // Core Planning - A* Search
  // ==========================================================================

  /**
   * Find an optimal plan using A* search
   *
   * @param currentState - Current world state
   * @param goal - Target state conditions
   * @param constraints - Optional planning constraints
   * @returns Optimal plan or null if no plan found
   */
  async findPlan(
    currentState: V3WorldState,
    goal: StateConditions,
    constraints?: PlanConstraints
  ): Promise<GOAPPlan | null> {
    await this.initialize();

    const startTime = Date.now();

    // Try to reuse a similar plan first
    if (this.enablePlanReuse) {
      const reusedPlan = await this.findSimilarPlan(goal, 0.75);
      if (reusedPlan && this.validatePlanForState(reusedPlan, currentState)) {
        // Update reuse stats
        this.recordPlanReuse(reusedPlan.id, true);
        return {
          ...reusedPlan,
          id: `plan-${Date.now()}-${randomUUID().slice(0, 8)}`,
          initialState: this.cloneState(currentState),
          reusedFrom: reusedPlan.id,
          status: 'pending',
        };
      }
    }

    // Get available actions
    const availableActions = this.getAvailableActions(constraints);

    // Run A* search
    const actionSequence = this.aStarSearch(
      currentState,
      goal,
      availableActions,
      constraints
    );

    if (!actionSequence) {
      return null;
    }

    // Build plan
    const plan: GOAPPlan = {
      id: `plan-${Date.now()}-${randomUUID().slice(0, 8)}`,
      initialState: this.cloneState(currentState),
      goalState: goal,
      actions: actionSequence,
      totalCost: actionSequence.reduce((sum, a) => sum + a.cost, 0),
      estimatedDurationMs: actionSequence.reduce(
        (sum, a) => sum + (a.estimatedDurationMs ?? 0),
        0
      ),
      status: 'pending',
    };

    // Store plan signature for future reuse
    await this.storePlanSignature(plan);

    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > 500) {
      console.warn(`[GOAPPlanner] Plan finding took ${elapsedMs}ms (target: <500ms)`);
    }

    return plan;
  }

  /**
   * A* search implementation
   *
   * @param start - Starting world state
   * @param goal - Target conditions
   * @param availableActions - Actions that can be used
   * @param constraints - Optional constraints
   * @returns Sequence of actions or null if no plan found
   */
  private aStarSearch(
    start: V3WorldState,
    goal: StateConditions,
    availableActions: GOAPAction[],
    constraints?: PlanConstraints
  ): GOAPAction[] | null {
    // Early termination: Check if any action can affect the goal properties
    if (!this.canAnyActionAffectGoal(availableActions, goal)) {
      return null;
    }

    const openSet: PlanNode[] = [];
    const closedSet = new Set<string>();

    // Initialize start node
    const startNode: PlanNode = {
      state: this.cloneState(start),
      action: null,
      parent: null,
      g: 0,
      h: this.calculateHeuristic(start, goal),
      f: 0,
      depth: 0,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    // Constraint defaults
    const maxIterations = 10000;
    const maxPlanLength = 20;
    const maxCost = constraints?.maxCost ?? Infinity;
    const maxDuration = constraints?.maxDurationMs ?? Infinity;

    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Get node with lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;

      // Check if goal reached
      if (this.meetsConditions(current.state, goal)) {
        return this.reconstructPlan(current);
      }

      // Generate state hash for closed set
      const stateKey = this.hashState(current.state);
      if (closedSet.has(stateKey)) {
        continue;
      }
      closedSet.add(stateKey);

      // Check depth limit
      if (current.depth >= maxPlanLength) {
        continue;
      }

      // Expand neighbors (applicable actions)
      for (const action of availableActions) {
        // Check preconditions
        if (!this.meetsConditions(current.state, action.preconditions)) {
          continue;
        }

        // Apply action to get new state
        const newState = this.applyAction(current.state, action);
        const newStateKey = this.hashState(newState);

        // Skip if already visited
        if (closedSet.has(newStateKey)) {
          continue;
        }

        // Calculate costs
        const g = current.g + this.getActionCost(action, current.state);
        const h = this.calculateHeuristic(newState, goal);
        const f = g + h;

        // Check cost constraints
        if (g > maxCost) {
          continue;
        }

        // Check duration constraints
        const estimatedDuration =
          current.depth * 1000 + (action.estimatedDurationMs ?? 0);
        if (estimatedDuration > maxDuration) {
          continue;
        }

        // Check if better path to this state exists
        const existingIdx = openSet.findIndex(
          (n) => this.hashState(n.state) === newStateKey
        );

        if (existingIdx >= 0) {
          if (g < openSet[existingIdx].g) {
            // Better path found - update
            openSet[existingIdx] = {
              state: newState,
              action,
              parent: current,
              g,
              h,
              f,
              depth: current.depth + 1,
            };
          }
        } else {
          // Add new node
          openSet.push({
            state: newState,
            action,
            parent: current,
            g,
            h,
            f,
            depth: current.depth + 1,
          });
        }
      }
    }

    // No plan found
    return null;
  }

  /**
   * Check if any available action can affect the goal properties
   * Used for early termination when no action can help reach the goal
   */
  private canAnyActionAffectGoal(
    availableActions: GOAPAction[],
    goal: StateConditions
  ): boolean {
    const goalKeys = Object.keys(goal);

    for (const action of availableActions) {
      for (const effectKey of Object.keys(action.effects)) {
        // Check if any effect key matches a goal key (or is a prefix/suffix)
        for (const goalKey of goalKeys) {
          if (effectKey === goalKey || effectKey.startsWith(goalKey) || goalKey.startsWith(effectKey)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Reconstruct action sequence from goal node
   */
  private reconstructPlan(goalNode: PlanNode): GOAPAction[] {
    const actions: GOAPAction[] = [];
    let current: PlanNode | null = goalNode;

    while (current && current.action) {
      actions.unshift(current.action);
      current = current.parent;
    }

    return actions;
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Apply action effects to state
   */
  private applyAction(state: V3WorldState, action: GOAPAction): V3WorldState {
    const newState = this.cloneState(state);

    for (const [key, effect] of Object.entries(action.effects)) {
      this.applyEffect(newState, key, effect);
    }

    return newState;
  }

  /**
   * Apply a single effect to state
   */
  private applyEffect(
    state: V3WorldState,
    key: string,
    effect: string | number | boolean | { delta?: number; set?: unknown }
  ): void {
    // Primitive effect - set directly
    if (
      typeof effect === 'string' ||
      typeof effect === 'number' ||
      typeof effect === 'boolean'
    ) {
      this.setStateValue(state, key, effect);
      return;
    }

    // Object effect with operators
    if (typeof effect === 'object' && effect !== null) {
      const currentValue = this.getStateValue(state, key);

      if ('set' in effect && effect.set !== undefined) {
        this.setStateValue(state, key, effect.set);
      }

      if ('delta' in effect && effect.delta !== undefined) {
        if (typeof currentValue === 'number') {
          // Clamp between 0 and 100 for percentage values
          const newValue = Math.max(0, Math.min(100, currentValue + effect.delta));
          this.setStateValue(state, key, newValue);
        }
      }
    }
  }

  /**
   * Check if state meets all conditions
   */
  private meetsConditions(
    state: V3WorldState,
    conditions: StateConditions
  ): boolean {
    for (const [key, condition] of Object.entries(conditions)) {
      if (!this.checkCondition(state, key, condition)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check a single condition
   */
  private checkCondition(
    state: V3WorldState,
    key: string,
    condition:
      | string
      | number
      | boolean
      | { min?: number; max?: number; eq?: unknown }
  ): boolean {
    const value = this.getStateValue(state, key);

    // Primitive condition - exact match
    if (
      typeof condition === 'string' ||
      typeof condition === 'number' ||
      typeof condition === 'boolean'
    ) {
      return value === condition;
    }

    // Object condition with operators
    if (typeof condition === 'object' && condition !== null) {
      if ('min' in condition && condition.min !== undefined) {
        if (typeof value !== 'number' || value < condition.min) {
          return false;
        }
      }

      if ('max' in condition && condition.max !== undefined) {
        if (typeof value !== 'number' || value > condition.max) {
          return false;
        }
      }

      if ('eq' in condition && condition.eq !== undefined) {
        if (value !== condition.eq) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate heuristic distance to goal (admissible)
   */
  private calculateHeuristic(
    state: V3WorldState,
    goal: StateConditions
  ): number {
    let distance = 0;

    for (const [key, condition] of Object.entries(goal)) {
      const currentValue = this.getStateValue(state, key);

      if (
        typeof condition === 'object' &&
        condition !== null &&
        'min' in condition
      ) {
        const minValue = condition.min as number;
        if (typeof currentValue === 'number' && currentValue < minValue) {
          // Normalize distance (percentage points to heuristic units)
          distance += (minValue - currentValue) / 100;
        }
      }

      if (
        typeof condition === 'object' &&
        condition !== null &&
        'max' in condition
      ) {
        const maxValue = condition.max as number;
        if (typeof currentValue === 'number' && currentValue > maxValue) {
          distance += (currentValue - maxValue) / 100;
        }
      }

      if (
        typeof condition === 'object' &&
        condition !== null &&
        'eq' in condition
      ) {
        if (currentValue !== condition.eq) {
          distance += 1;
        }
      }

      // Primitive conditions
      if (
        typeof condition === 'string' ||
        typeof condition === 'number' ||
        typeof condition === 'boolean'
      ) {
        if (currentValue !== condition) {
          distance += 1;
        }
      }
    }

    return distance;
  }

  /**
   * Get value from nested state using dot notation
   */
  private getStateValue(state: V3WorldState, key: string): unknown {
    const parts = key.split('.');
    let current: unknown = state;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Set value in nested state using dot notation
   * Protected against prototype pollution using Object.defineProperty
   */
  private setStateValue(state: V3WorldState, key: string, value: unknown): void {
    const parts = key.split('.');

    // Prevent prototype pollution - use Set for O(1) lookup
    const dangerousProps = new Set(['__proto__', 'constructor', 'prototype']);
    for (const part of parts) {
      if (dangerousProps.has(part)) {
        console.warn(`[GOAPPlanner] Blocked prototype pollution attempt: ${key}`);
        return;
      }
    }

    let current: Record<string, unknown> = state as unknown as Record<
      string,
      unknown
    >;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      // Use Object.hasOwn for safe property check
      if (!Object.hasOwn(current, part)) {
        // Use Object.defineProperty for safe assignment
        Object.defineProperty(current, part, {
          value: Object.create(null),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      current = current[part] as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];
    // Use Object.defineProperty for safe final assignment
    Object.defineProperty(current, finalKey, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Create hash of state for deduplication
   */
  private hashState(state: V3WorldState): string {
    const key = {
      // Coverage
      coverageLine: Math.round(state.coverage.line),
      coverageBranch: Math.round(state.coverage.branch),
      coverageFunc: Math.round(state.coverage.function),
      coverageMeasured: state.coverage.measured,

      // Quality
      testsPassing: Math.round(state.quality.testsPassing),
      securityScore: Math.round(state.quality.securityScore),
      performanceScore: Math.round(state.quality.performanceScore),

      // Fleet
      activeAgents: state.fleet.activeAgents,
      availableAgents: state.fleet.availableAgents.sort().join(','),

      // Resources (rounded to reduce state space)
      timeRemaining: Math.floor(state.resources.timeRemaining / 60),
      parallelSlots: state.resources.parallelSlots,

      // Context
      environment: state.context.environment,
      riskLevel: state.context.riskLevel,
    };

    return JSON.stringify(key);
  }

  /**
   * Deep clone world state
   */
  private cloneState(state: V3WorldState): V3WorldState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Calculate effective action cost (adjusted for success rate)
   */
  private getActionCost(action: GOAPAction, state: V3WorldState): number {
    let cost = action.cost;

    // Adjust based on success rate (prefer reliable actions)
    if (action.successRate < 1) {
      cost = cost / action.successRate;
    }

    // Increase cost of risky actions in high-risk contexts
    if (state.context.riskLevel === 'high') {
      if (action.category === 'performance' || action.category === 'fleet') {
        cost *= 1.5;
      }
    }

    return cost;
  }

  // ==========================================================================
  // Action Management
  // ==========================================================================

  /**
   * Load actions from database
   */
  async loadActions(): Promise<void> {
    const rows = this.ensureDb()
      .prepare('SELECT * FROM goap_actions ORDER BY category, cost')
      .all() as GOAPActionRecord[];

    this.actions.clear();

    for (const row of rows) {
      const action: GOAPAction = {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        agentType: row.agent_type,
        preconditions: JSON.parse(row.preconditions),
        effects: JSON.parse(row.effects),
        cost: row.cost,
        estimatedDurationMs: row.estimated_duration_ms ?? undefined,
        successRate: row.success_rate,
        executionCount: row.execution_count,
        category: row.category as GOAPAction['category'],
        qeDomain: row.qe_domain as GOAPAction['qeDomain'],
      };

      this.actions.set(action.id, action);
    }
  }

  /**
   * Add a new action
   */
  async addAction(
    action: Omit<GOAPAction, 'id' | 'executionCount'>
  ): Promise<string> {
    await this.initialize();

    const id = `action-${Date.now()}-${randomUUID().slice(0, 8)}`;

    this.ensureDb()
      .prepare(
        `
      INSERT INTO goap_actions (
        id, name, description, agent_type, preconditions, effects,
        cost, estimated_duration_ms, success_rate, execution_count, category, qe_domain
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `
      )
      .run(
        id,
        action.name,
        action.description ?? null,
        action.agentType,
        JSON.stringify(action.preconditions),
        JSON.stringify(action.effects),
        action.cost,
        action.estimatedDurationMs ?? null,
        action.successRate,
        action.category,
        action.qeDomain ?? null
      );

    // Update in-memory cache
    const fullAction: GOAPAction = {
      ...action,
      id,
      executionCount: 0,
    };
    this.actions.set(id, fullAction);

    return id;
  }

  /**
   * Update action statistics after execution
   */
  async updateActionStats(
    actionId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    await this.initialize();

    const action = this.actions.get(actionId);
    if (!action) return;

    const newCount = action.executionCount + 1;
    const newRate =
      (action.successRate * action.executionCount + (success ? 1 : 0)) /
      newCount;

    this.ensureDb()
      .prepare(
        `
      UPDATE goap_actions
      SET success_rate = ?, execution_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `
      )
      .run(newRate, newCount, actionId);

    // Update in-memory cache
    action.successRate = newRate;
    action.executionCount = newCount;
  }

  /**
   * Get actions by category
   */
  async getActionsByCategory(
    category: GOAPAction['category']
  ): Promise<GOAPAction[]> {
    await this.initialize();

    return Array.from(this.actions.values()).filter(
      (a) => a.category === category
    );
  }

  /**
   * Get available actions based on constraints
   */
  private getAvailableActions(constraints?: PlanConstraints): GOAPAction[] {
    let actions = Array.from(this.actions.values());

    if (constraints?.requiredAgentTypes?.length) {
      actions = actions.filter((a) =>
        constraints.requiredAgentTypes!.includes(a.agentType)
      );
    }

    if (constraints?.excludedActions?.length) {
      actions = actions.filter(
        (a) => !constraints.excludedActions!.includes(a.id)
      );
    }

    return actions;
  }

  // ==========================================================================
  // Plan Persistence
  // ==========================================================================

  /**
   * Save plan to database
   */
  async savePlan(plan: GOAPPlan): Promise<void> {
    await this.initialize();

    this.ensureDb()
      .prepare(
        `
      INSERT OR REPLACE INTO goap_plans (
        id, goal_id, initial_state, goal_state, action_sequence,
        total_cost, estimated_duration_ms, status, reused_from, similarity_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        plan.id,
        plan.goalId ?? null,
        JSON.stringify(plan.initialState),
        JSON.stringify(plan.goalState),
        JSON.stringify(plan.actions.map((a) => a.id)),
        plan.totalCost,
        plan.estimatedDurationMs,
        plan.status,
        plan.reusedFrom ?? null,
        plan.similarityScore ?? null
      );
  }

  /**
   * Get plan by ID
   */
  async getPlan(planId: string): Promise<GOAPPlan | null> {
    await this.initialize();

    const row = this.ensureDb()
      .prepare('SELECT * FROM goap_plans WHERE id = ?')
      .get(planId) as GOAPPlanRecord | undefined;

    if (!row) return null;

    const actionIds = JSON.parse(row.action_sequence) as string[];
    const actions = actionIds
      .map((id) => this.actions.get(id))
      .filter((a): a is GOAPAction => a !== undefined);

    return {
      id: row.id,
      goalId: row.goal_id ?? undefined,
      initialState: JSON.parse(row.initial_state),
      goalState: JSON.parse(row.goal_state),
      actions,
      totalCost: row.total_cost,
      estimatedDurationMs: row.estimated_duration_ms ?? 0,
      status: row.status as GOAPPlan['status'],
      reusedFrom: row.reused_from ?? undefined,
      similarityScore: row.similarity_score ?? undefined,
    };
  }

  /**
   * Find a similar plan by goal conditions
   */
  async findSimilarPlan(
    goal: StateConditions,
    similarityThreshold = 0.75
  ): Promise<GOAPPlan | null> {
    await this.initialize();

    const goalHash = this.hashGoalConditions(goal);

    // Look for exact goal match first
    const exactMatch = this.ensureDb()
      .prepare(
        `
      SELECT * FROM goap_plan_signatures
      WHERE goal_hash = ? AND success_rate >= 0.5
      ORDER BY usage_count DESC, success_rate DESC
      LIMIT 1
    `
      )
      .get(goalHash) as
      | { plan_id: string; success_rate: number; usage_count: number }
      | undefined;

    if (exactMatch) {
      const plan = await this.getPlan(exactMatch.plan_id);
      if (plan) {
        return {
          ...plan,
          similarityScore: 1.0,
        };
      }
    }

    // No similar plan found
    return null;
  }

  /**
   * Store plan signature for future reuse
   */
  private async storePlanSignature(plan: GOAPPlan): Promise<void> {
    const goalHash = this.hashGoalConditions(plan.goalState);
    const stateVector = this.extractStateVector(plan.initialState);

    this.ensureDb()
      .prepare(
        `
      INSERT OR REPLACE INTO goap_plan_signatures (
        id, plan_id, goal_hash, state_vector, action_sequence, total_cost
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        `sig-${Date.now()}-${randomUUID().slice(0, 8)}`,
        plan.id,
        goalHash,
        JSON.stringify(stateVector),
        JSON.stringify(plan.actions.map((a) => a.id)),
        plan.totalCost
      );
  }

  /**
   * Record plan reuse outcome
   */
  private recordPlanReuse(planId: string, success: boolean): void {
    const db = this.ensureDb();
    const current = db
      .prepare(
        'SELECT success_rate, usage_count FROM goap_plan_signatures WHERE plan_id = ?'
      )
      .get(planId) as { success_rate: number; usage_count: number } | undefined;

    if (!current) return;

    const newCount = current.usage_count + 1;
    const alpha = 0.1;
    const newRate =
      current.success_rate * (1 - alpha) + (success ? 1 : 0) * alpha;

    db
      .prepare(
        `
      UPDATE goap_plan_signatures
      SET usage_count = ?, success_rate = ?
      WHERE plan_id = ?
    `
      )
      .run(newCount, newRate, planId);
  }

  /**
   * Validate that a plan can be executed from current state
   */
  private validatePlanForState(
    plan: GOAPPlan,
    currentState: V3WorldState
  ): boolean {
    let state = this.cloneState(currentState);

    for (const action of plan.actions) {
      if (!this.meetsConditions(state, action.preconditions)) {
        return false;
      }
      state = this.applyAction(state, action);
    }

    return true;
  }

  /**
   * Hash goal conditions for comparison
   */
  private hashGoalConditions(conditions: StateConditions): string {
    const sorted = this.sortObjectKeys(conditions);
    return JSON.stringify(sorted);
  }

  /**
   * Sort object keys recursively
   */
  private sortObjectKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => this.sortObjectKeys(item));

    return Object.keys(obj)
      .sort()
      .reduce((result: Record<string, unknown>, key) => {
        result[key] = this.sortObjectKeys((obj as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  /**
   * Extract feature vector from state for similarity comparison
   */
  private extractStateVector(state: V3WorldState): number[] {
    return [
      state.coverage.line / 100,
      state.coverage.branch / 100,
      state.coverage.function / 100,
      state.coverage.measured ? 1 : 0,
      state.quality.testsPassing / 100,
      state.quality.securityScore / 100,
      state.quality.performanceScore / 100,
      Math.min(state.fleet.activeAgents / 10, 1),
      Math.min(state.resources.timeRemaining / 3600, 1),
      Math.min(state.resources.parallelSlots / 8, 1),
    ];
  }

  // ==========================================================================
  // Goal Management
  // ==========================================================================

  /**
   * Add a new goal
   */
  async addGoal(goal: Omit<GOAPGoal, 'id'>): Promise<string> {
    await this.initialize();

    const id = `goal-${Date.now()}-${randomUUID().slice(0, 8)}`;

    this.ensureDb()
      .prepare(
        `
      INSERT INTO goap_goals (id, name, description, conditions, priority, qe_domain)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        goal.name,
        goal.description ?? null,
        JSON.stringify(goal.conditions),
        goal.priority,
        goal.qeDomain ?? null
      );

    return id;
  }

  /**
   * Get all goals
   */
  async getGoals(): Promise<GOAPGoal[]> {
    await this.initialize();

    const rows = this.ensureDb()
      .prepare('SELECT * FROM goap_goals ORDER BY priority DESC')
      .all() as GOAPGoalRecord[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      conditions: JSON.parse(row.conditions),
      priority: row.priority,
      qeDomain: row.qe_domain as GOAPGoal['qeDomain'],
    }));
  }

  // ==========================================================================
  // Plan Reuse Configuration
  // ==========================================================================

  /**
   * Enable or disable plan reuse
   */
  setPlanReuseEnabled(enabled: boolean): void {
    this.enablePlanReuse = enabled;
  }

  /**
   * Check if plan reuse is enabled
   */
  isPlanReuseEnabled(): boolean {
    return this.enablePlanReuse;
  }

  /**
   * Get plan reuse statistics
   */
  async getPlanReuseStats(): Promise<PlanReuseStats> {
    await this.initialize();

    const db = this.ensureDb();

    const total = db
      .prepare('SELECT COUNT(*) as count FROM goap_plan_signatures')
      .get() as { count: number };

    const reused = db
      .prepare(
        'SELECT COUNT(*) as count FROM goap_plan_signatures WHERE usage_count > 0'
      )
      .get() as { count: number };

    const avgSuccess = db
      .prepare(
        'SELECT AVG(success_rate) as avg FROM goap_plan_signatures WHERE usage_count > 0'
      )
      .get() as { avg: number | null };

    return {
      totalPlans: total.count,
      reusedPlans: reused.count,
      reuseRate: total.count > 0 ? reused.count / total.count : 0,
      avgSuccessRate: avgSuccess.avg ?? 0,
    };
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Release resources (does NOT close the shared database)
   */
  async close(): Promise<void> {
    this.actions.clear();
    this.db = null;
    this.persistence = null;
    this.initialized = false;
  }
}

// ============================================================================
// Shared Instance
// ============================================================================

let sharedPlanner: GOAPPlanner | null = null;

/**
 * Get shared GOAPPlanner instance (uses unified persistence)
 */
export function getSharedGOAPPlanner(): GOAPPlanner {
  if (!sharedPlanner) {
    sharedPlanner = new GOAPPlanner();
  }
  return sharedPlanner;
}

/**
 * Reset shared planner instance
 */
export function resetSharedGOAPPlanner(): void {
  if (sharedPlanner) {
    sharedPlanner.close();
  }
  sharedPlanner = null;
}
