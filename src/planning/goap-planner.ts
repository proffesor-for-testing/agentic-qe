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
import { safeJsonParse } from '../shared/safe-json.js';
import { getUnifiedPersistence, type UnifiedPersistenceManager } from '../kernel/unified-persistence.js';
import type {
  V3WorldState,
  StateConditions,
  GOAPAction,
  GOAPGoal,
  GOAPPlan,
  PlanConstraints,
  GOAPActionRecord,
  GOAPGoalRecord,
  GOAPPlanRecord,
} from './types.js';
import { DEFAULT_MAX_PLAN_STEPS, validateMaxSteps } from './types.js';
import { getAllQEActions, QE_GOALS } from './actions/qe-action-library.js';

// ============================================================================
// MinHeap for A* Open Set (O(log n) insert/extract vs O(n log n) sort+shift)
// ============================================================================

/**
 * Binary min-heap ordered by a comparator function.
 * Used by A* search for efficient open-set management.
 */
class MinHeap<T> {
  private data: T[] = [];
  private readonly cmp: (a: T, b: T) => number;

  constructor(compareFn: (a: T, b: T) => number) {
    this.cmp = compareFn;
  }

  get length(): number {
    return this.data.length;
  }

  push(item: T): void {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cmp(this.data[i], this.data[parent]) < 0) {
        [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
        i = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    // eslint-disable-next-line no-constant-condition -- heap sift-down; loop breaks internally
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.cmp(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < n && this.cmp(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest !== i) {
        [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

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
  /** Sum of action estimates along this path, in milliseconds */
  estimatedDurationMs: number;
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
// Module-Level Constants (PERF-008: hoisted to avoid per-call allocation)
// ============================================================================

/** Properties that must never appear in state keys (prototype pollution guard). */
const DANGEROUS_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

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

    // A14: backfill real method/params/implemented bindings onto
    // already-seeded rows (matched by name — seed-time ids are random, not
    // stable across the qe-action-library.ts source) BEFORE loading into
    // the in-memory cache, so this.actions reflects current bindings even
    // for databases seeded before this feature existed, or before a given
    // action's binding was added to the library.
    this.backfillActionMethodBindings();
    this.backfillActionDurationEstimates();

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
      INSERT INTO goap_actions (id, name, description, category, preconditions, effects, cost, qe_domain, agent_type, method, params, implemented, estimated_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        action.agentType ?? null,
        action.method ?? null,
        action.params ? JSON.stringify(action.params) : null,
        action.implemented ? 1 : 0,
        action.estimatedDurationMs ?? null
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

  /**
   * A14: backfill method/params/implemented onto already-seeded action rows,
   * matched by `name` against the current qe-action-library.ts definitions.
   *
   * Action ids are randomly generated at seed time (`action-<timestamp>-
   * <uuid>`), not stable across the library source, so this can't match by
   * id. Only touches rows currently missing a binding the library now has
   * (`method IS NULL AND library.implemented`), so it's cheap and
   * idempotent on every initialize() call — and picks up newly-added real
   * bindings on already-seeded databases without requiring a full re-seed.
   */
  private backfillActionMethodBindings(): void {
    const db = this.ensureDb();
    const update = db.prepare(`
      UPDATE goap_actions SET method = ?, params = ?, implemented = 1
      WHERE name = ? AND (method IS NULL OR implemented = 0)
    `);

    for (const action of getAllQEActions()) {
      if (!action.implemented || !action.method) continue;
      update.run(action.method, action.params ? JSON.stringify(action.params) : '{}', action.name);
    }
  }

  /** Restore missing estimates only for unchanged legacy library definitions. */
  private backfillActionDurationEstimates(): void {
    const update = this.ensureDb().prepare(`
      UPDATE goap_actions SET estimated_duration_ms = ?
      WHERE estimated_duration_ms IS NULL AND name = ?
        AND agent_type IS ? AND category = ? AND qe_domain IS ?
        AND preconditions = ? AND effects = ?
        AND method IS ? AND params IS ? AND implemented = ?
    `);
    for (const action of getAllQEActions()) {
      if (action.estimatedDurationMs === undefined) continue;
      update.run(
        action.estimatedDurationMs, action.name, action.agentType ?? null,
        action.category, action.qeDomain ?? null,
        JSON.stringify(action.preconditions), JSON.stringify(action.effects),
        action.method ?? null, action.params ? JSON.stringify(action.params) : null,
        action.implemented ? 1 : 0
      );
    }
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
    // Issue #535: reject a malformed step cap up front rather than silently
    // ignoring it (maxSteps: 0 would otherwise mean "no plan ever").
    const maxStepsError = validateMaxSteps(constraints?.maxSteps);
    if (maxStepsError) {
      throw new Error(maxStepsError);
    }

    await this.initialize();

    const startTime = Date.now();

    // Try to reuse a similar plan first
    if (this.enablePlanReuse) {
      const reusedPlan = await this.findSimilarPlan(goal, 0.75);
      if (
        reusedPlan &&
        this.validatePlanForState(reusedPlan, currentState) &&
        this.planSatisfiesConstraints(reusedPlan, currentState, goal, constraints)
      ) {
        // Update reuse stats
        this.recordPlanReuse(reusedPlan.id, true);
        const clonedPlan: GOAPPlan = {
          ...reusedPlan,
          estimatedDurationMs: reusedPlan.actions.reduce(
            (sum, action) => sum + (action.estimatedDurationMs ?? 0), 0
          ),
          id: `plan-${Date.now()}-${randomUUID().slice(0, 8)}`,
          initialState: this.cloneState(currentState),
          reusedFrom: reusedPlan.id,
          status: 'pending',
        };
        // A14: persist so goap_execute can find this plan by id — findPlan()
        // previously only ever stored a reuse-lookup signature, never the
        // plan itself, so every returned planId 404'd on execute.
        await this.savePlan(clonedPlan);
        return clonedPlan;
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

    // A14: persist the plan itself (not just its reuse signature) so
    // goap_execute can find it by id — see savePlan() below.
    await this.savePlan(plan);

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

    // Use a binary min-heap for O(log n) extract-min instead of O(n log n) sort+shift.
    // Duplicate state entries are handled via lazy deletion: when a node is popped
    // whose state is already in the closed set, it is simply skipped. This is a
    // standard A* optimisation that preserves correctness.
    const openHeap = new MinHeap<PlanNode>((a, b) => a.f - b.f);
    const closedSet = new Set<string>();
    // O(1) duplicate detection: maps state hash → best g-cost seen in the open set.
    // Entries are added on insert, updated when a better path is found, and
    // removed when the node is popped (moved to the closed set).
    const openSetCosts = new Map<string, number>();
    // Under a duration budget, cheaper paths can be slower or deeper. Keep
    // nondominated labels rather than closing the entire state at its first cost.
    const durationLabels = new Map<string, PlanNode[]>();

    // Issue #535: cost-unit heuristic built once per search from the
    // actions that can actually move each goal key (see buildHeuristic).
    const heuristic = this.buildHeuristic(goal, availableActions);
    const startH = heuristic(start);
    if (!Number.isFinite(startH)) {
      return null; // some unmet goal key can never be changed by any action
    }

    // Initialize start node
    const startNode: PlanNode = {
      state: this.cloneState(start),
      action: null,
      parent: null,
      g: 0,
      h: startH,
      f: 0,
      depth: 0,
      estimatedDurationMs: 0,
    };
    startNode.f = startNode.g + startNode.h;
    openHeap.push(startNode);
    openSetCosts.set(this.hashState(start), 0);
    durationLabels.set(this.hashState(start), [startNode]);

    // Constraint defaults
    const maxIterations = 10000;
    // Issue #535: constraints.maxSteps caps the search depth (= plan length).
    const maxPlanLength = constraints?.maxSteps ?? DEFAULT_MAX_PLAN_STEPS;
    const maxCost = constraints?.maxCost ?? Infinity;
    const maxDuration = constraints?.maxDurationMs ?? Infinity;
    const boundedDuration = Number.isFinite(maxDuration);

    let iterations = 0;

    while (openHeap.length > 0 && iterations < maxIterations) {
      iterations++;

      // Get node with lowest f score — O(log n)
      const current = openHeap.pop()!;
      const stateKey = this.hashState(current.state);
      if (boundedDuration && !durationLabels.get(stateKey)?.includes(current)) {
        continue; // a later label dominates this queued path
      }

      // Check if goal reached
      if (this.meetsConditions(current.state, goal)) {
        return this.reconstructPlan(current);
      }

      if (!boundedDuration) {
        if (closedSet.has(stateKey)) {
          continue; // lazy deletion for the existing cost-only search
        }
        closedSet.add(stateKey);
        openSetCosts.delete(stateKey);
      }

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
        if (!boundedDuration && closedSet.has(newStateKey)) {
          continue;
        }

        // Calculate costs
        const g = current.g + this.getActionCost(action, current.state);
        const h = heuristic(newState);
        if (!Number.isFinite(h)) {
          continue; // dead end: an unmet goal key no action can change
        }
        const f = g + h;

        // Check cost constraints
        if (g > maxCost) {
          continue;
        }

        // Check duration constraints
        const estimatedDuration =
          current.estimatedDurationMs + (action.estimatedDurationMs ?? 0);
        if (estimatedDuration > maxDuration) {
          continue;
        }

        const next: PlanNode = {
          state: newState, action, parent: current, g, h, f,
          depth: current.depth + 1, estimatedDurationMs: estimatedDuration,
        };
        if (boundedDuration) {
          const labels = durationLabels.get(newStateKey) ?? [];
          if (labels.some((label) => label.g <= g &&
            label.estimatedDurationMs <= estimatedDuration && label.depth <= next.depth)) {
            continue;
          }
          durationLabels.set(newStateKey, [
            ...labels.filter((label) => !(g <= label.g &&
              estimatedDuration <= label.estimatedDurationMs && next.depth <= label.depth)),
            next,
          ]);
        } else {
          const prevG = openSetCosts.get(newStateKey);
          if (prevG !== undefined && g >= prevG) continue;
          openSetCosts.set(newStateKey, g);
        }
        openHeap.push(next);
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
   * Build an admissible, cost-unit A* heuristic for `goal` over `actions`.
   *
   * Issue #535: the previous heuristic was the raw percentage gap / 100 (e.g.
   * 0.9 for coverage 0 -> 90) while a single generate-coverage-tests step
   * costs ~5, so it carried almost no information and A* degenerated into
   * uniform-cost search: it enumerated every combination of the ~40 cheap
   * flag-setting library actions and hit the iteration cap before reaching
   * any deep goal. Now each unmet goal key contributes a lower bound on the
   * cost still needed to satisfy it:
   *   - numeric min/max gap reachable by deltas: ceil(gap / largest delta)
   *     steps x cheapest such action;
   *   - any key an action can `set` (primitive or {set}) directly: that
   *     action's cost (one step);
   *   - unmet key no action can move: Infinity (dead end, pruned).
   * The per-key bounds are combined with max(), which keeps the heuristic
   * admissible and consistent even when one action moves several keys.
   * Costs use the same base as getActionCost() (cost / successRate), whose
   * risk multiplier only ever increases cost, so the bound never overshoots.
   */
  private buildHeuristic(
    goal: StateConditions,
    actions: GOAPAction[]
  ): (state: V3WorldState) => number {
    interface KeyMovers {
      setCost: number;
      upDelta: number;
      upCost: number;
      downDelta: number;
      downCost: number;
    }
    const lowerBoundCost = (a: GOAPAction): number =>
      a.successRate > 0 && a.successRate < 1 ? a.cost / a.successRate : a.cost;

    const movers = new Map<string, KeyMovers>();
    for (const key of Object.keys(goal)) {
      const m: KeyMovers = { setCost: Infinity, upDelta: 0, upCost: Infinity, downDelta: 0, downCost: Infinity };
      for (const action of actions) {
        if (!Object.hasOwn(action.effects, key)) continue;
        const effect = action.effects[key];
        const c = lowerBoundCost(action);
        if (typeof effect !== 'object' || effect === null) {
          m.setCost = Math.min(m.setCost, c);
          continue;
        }
        if ('set' in effect && effect.set !== undefined) {
          m.setCost = Math.min(m.setCost, c);
        }
        if ('delta' in effect && typeof effect.delta === 'number') {
          if (effect.delta > 0) {
            m.upDelta = Math.max(m.upDelta, effect.delta);
            m.upCost = Math.min(m.upCost, c);
          } else if (effect.delta < 0) {
            m.downDelta = Math.max(m.downDelta, -effect.delta);
            m.downCost = Math.min(m.downCost, c);
          }
        }
      }
      movers.set(key, m);
    }

    return (state: V3WorldState): number => {
      let h = 0;
      for (const [key, condition] of Object.entries(goal)) {
        if (this.checkCondition(state, key, condition)) continue;
        const m = movers.get(key)!;
        const value = this.getStateValue(state, key);
        let bound = m.setCost;

        if (typeof value === 'number' && typeof condition === 'object' && condition !== null) {
          if ('min' in condition && typeof condition.min === 'number' && value < condition.min && m.upDelta > 0) {
            bound = Math.min(bound, Math.ceil((condition.min - value) / m.upDelta) * m.upCost);
          } else if ('max' in condition && typeof condition.max === 'number' && value > condition.max && m.downDelta > 0) {
            bound = Math.min(bound, Math.ceil((value - condition.max) / m.downDelta) * m.downCost);
          } else if ('eq' in condition && typeof condition.eq === 'number') {
            // An eq target can be hit by a delta in (at least) one step.
            bound = Math.min(bound, m.upCost, m.downCost);
          }
        } else if (typeof value === 'number' && typeof condition === 'number') {
          bound = Math.min(bound, m.upCost, m.downCost);
        }

        if (!Number.isFinite(bound)) return Infinity;
        h = Math.max(h, bound);
      }
      return h;
    };
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

    // PERF-008: Use module-level DANGEROUS_PROPS Set (avoids per-call allocation)
    for (const part of parts) {
      if (DANGEROUS_PROPS.has(part)) {
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
      if (!Object.hasOwn(current, part)) {
        const container = Object.create(null);
        Object.defineProperty(current, part, { value: container, writable: true, enumerable: true, configurable: true });
      }
      const desc = Object.getOwnPropertyDescriptor(current, part);
      if (!desc) return;
      current = desc.value as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];
    Object.defineProperty(current, finalKey, { value, writable: true, enumerable: true, configurable: true });
  }

  /**
   * Create hash of state for deduplication.
   *
   * Issue #535: this previously hashed a fixed list of known fields only, so
   * every action effect on any other key (coverage.gapsIdentified,
   * quality.unitTestsRun, fleet.specialistAvailable, ... — most of the
   * seeded action library) produced a successor state that hashed identical
   * to its already-closed parent and was pruned. That made e.g. the seeded
   * `achieve-90-percent-coverage` goal unplannable from any state (the
   * analyze-coverage-gaps -> generate-coverage-tests chain was unreachable).
   * Now every key in the state participates. Numbers are compared at 1e-6
   * precision; resources.timeRemaining is bucketed per minute, as before.
   */
  private hashState(state: V3WorldState): string {
    return GOAPPlanner.stableStateKey(state, '');
  }

  private static stableStateKey(value: unknown, path: string): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return String(value);
      // Keep fractional progress distinguishable (codex review: integer
      // rounding collapsed e.g. custom.progress 0 -> 0.4 into its parent);
      // only timeRemaining is bucketed (per minute) to bound the space.
      return path === 'resources.timeRemaining'
        ? String(Math.floor(value / 60))
        : String(Math.round(value * 1e6) / 1e6);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) {
      // Copy before sort to avoid mutating the state's own array.
      return `[${value.map((v) => GOAPPlanner.stableStateKey(v, path)).sort().join(',')}]`;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const parts = Object.keys(obj)
        .sort()
        .map((k) => `${k}:${GOAPPlanner.stableStateKey(obj[k], path ? `${path}.${k}` : k)}`);
      return `{${parts.join(',')}}`;
    }
    return typeof value;
  }

  /**
   * Deep clone world state.
   * PERF-008: Manual structured clone avoids JSON.parse/stringify overhead.
   * Safe because V3WorldState is a known, fixed-shape object with only
   * primitives, arrays of strings, and plain nested objects.
   */
  private cloneState(state: V3WorldState): V3WorldState {
    return {
      coverage: { ...state.coverage },
      quality: { ...state.quality },
      fleet: {
        ...state.fleet,
        availableAgents: [...state.fleet.availableAgents],
      },
      resources: { ...state.resources },
      context: { ...state.context },
      patterns: { ...state.patterns },
    };
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
        preconditions: safeJsonParse(row.preconditions),
        effects: safeJsonParse(row.effects),
        cost: row.cost,
        estimatedDurationMs: row.estimated_duration_ms ?? undefined,
        successRate: row.success_rate,
        executionCount: row.execution_count,
        category: row.category as GOAPAction['category'],
        qeDomain: row.qe_domain as GOAPAction['qeDomain'],
        method: row.method ?? undefined,
        params: row.params ? safeJsonParse(row.params) : undefined,
        implemented: row.implemented === 1,
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
        cost, estimated_duration_ms, success_rate, execution_count, category, qe_domain,
        method, params, implemented
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
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
        action.qeDomain ?? null,
        action.method ?? null,
        action.params ? JSON.stringify(action.params) : null,
        action.implemented ? 1 : 0
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
    _durationMs: number
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
   * State keys referenced by any loaded action's preconditions or effects
   * (seeded library plus custom actions added via addAction()). Used by the
   * goap_plan tool to validate caller-supplied world-state keys (#535).
   */
  getReferencedStateKeys(): string[] {
    const keys = new Set<string>();
    for (const action of this.actions.values()) {
      for (const k of Object.keys(action.preconditions)) keys.add(k);
      for (const k of Object.keys(action.effects)) keys.add(k);
    }
    return [...keys];
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

    const actionIds = safeJsonParse<string[]>(row.action_sequence);
    const actions = actionIds
      .map((id) => this.actions.get(id))
      .filter((a): a is GOAPAction => a !== undefined);

    return {
      id: row.id,
      goalId: row.goal_id ?? undefined,
      initialState: safeJsonParse(row.initial_state),
      goalState: safeJsonParse(row.goal_state),
      actions,
      totalCost: row.total_cost,
      estimatedDurationMs: row.estimated_duration_ms ?? 0,
      status: row.status as GOAPPlan['status'],
      reusedFrom: row.reused_from ?? undefined,
      similarityScore: row.similarity_score ?? undefined,
    };
  }

  /**
   * List persisted plan summaries without loading every plan into memory.
   * Count includes all rows matching the optional status, before pagination.
   */
  async listPlanSummaries(status?: string, limit = 20): Promise<{
    plans: Array<{ id: string; status: string; stepCount: number; totalCost: number; createdAt: string }>;
    count: number;
  }> {
    await this.initialize();
    const db = this.ensureDb();
    const where = status ? ' WHERE status = ?' : '';
    const args = status ? [status] : [];
    const boundedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.trunc(limit)))
      : 20;
    const { count } = db.prepare(`SELECT COUNT(*) AS count FROM goap_plans${where}`)
      .get(...args) as { count: number };
    const rows = db.prepare(`
      SELECT id, status, action_sequence, total_cost, created_at
      FROM goap_plans${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(...args, boundedLimit) as Array<Pick<
      GOAPPlanRecord, 'id' | 'status' | 'action_sequence' | 'total_cost' | 'created_at'
    >>;
    const plans = rows.map((row) => {
      const actionIds = safeJsonParse<unknown>(row.action_sequence);
      if (!Array.isArray(actionIds)) {
        throw new Error(`Invalid action sequence in GOAP plan ${row.id}`);
      }
      return {
        id: row.id,
        status: row.status,
        stepCount: actionIds.length,
        totalCost: row.total_cost,
        createdAt: row.created_at,
      };
    });
    return { plans, count };
  }

  /**
   * Find a similar plan by goal conditions
   */
  async findSimilarPlan(
    goal: StateConditions,
    _similarityThreshold = 0.75
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
   * Issue #535: a reused plan must honour the caller's constraints exactly
   * like a freshly searched one — otherwise a cached 11-step plan is handed
   * back for a `maxSteps: 3` request (or one using an excluded action, or
   * over budget). Also requires that replaying the plan from the current
   * state actually reaches the goal.
   */
  private planSatisfiesConstraints(
    plan: GOAPPlan,
    currentState: V3WorldState,
    goal: StateConditions,
    constraints?: PlanConstraints
  ): boolean {
    const maxSteps = constraints?.maxSteps ?? DEFAULT_MAX_PLAN_STEPS;
    if (plan.actions.length > maxSteps) return false;

    if (
      constraints?.maxDurationMs !== undefined &&
      plan.actions.reduce((sum, action) => sum + (action.estimatedDurationMs ?? 0), 0)
        > constraints.maxDurationMs
    ) {
      return false;
    }

    const allowed = new Set(this.getAvailableActions(constraints).map((a) => a.id));
    if (!plan.actions.every((a) => allowed.has(a.id))) return false;

    // Replay with the same effective cost fresh search enforces
    // (getActionCost: success-rate and risk adjusted), not raw totalCost.
    let state = this.cloneState(currentState);
    let effectiveCost = 0;
    for (const action of plan.actions) {
      effectiveCost += this.getActionCost(action, state);
      state = this.applyAction(state, action);
    }
    if (constraints?.maxCost !== undefined && effectiveCost > constraints.maxCost) {
      return false;
    }
    return this.meetsConditions(state, goal);
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
      conditions: safeJsonParse(row.conditions),
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
