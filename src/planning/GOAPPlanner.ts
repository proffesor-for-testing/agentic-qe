/**
 * GOAP Planner - A* Search Algorithm for Goal-Oriented Action Planning
 *
 * Implements optimal plan finding using A* search with:
 * - Precondition checking
 * - Effect application
 * - Heuristic calculation
 * - Plan reconstruction
 *
 * @module planning/GOAPPlanner
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger';
import { SecureRandom } from '../utils/SecureRandom';
import {
  WorldState,
  StateConditions,
  ConditionOperators,
  ActionEffects,
  EffectOperators,
  GOAPAction,
  GOAPPlan,
  PlanConstraints,
  PlanNode,
  GOAPActionRecord,
  DEFAULT_WORLD_STATE
} from './types';
import { PlanSimilarity, SimilarPlan, PlanReuseStats } from './PlanSimilarity';

/**
 * GOAP Planner using A* search algorithm
 */
export class GOAPPlanner {
  private actionLibrary: GOAPAction[] = [];
  private db: Database.Database;
  private logger: Logger;
  private actionsLoaded = false;
  private planSimilarity: PlanSimilarity;
  private enablePlanReuse = true;  // Can be disabled for benchmarking A* directly

  constructor(db: Database.Database) {
    this.db = db;
    this.logger = Logger.getInstance();
    this.planSimilarity = new PlanSimilarity(db);
  }

  /**
   * Get PlanSimilarity instance for direct access
   */
  getPlanSimilarity(): PlanSimilarity {
    return this.planSimilarity;
  }

  /**
   * Enable or disable plan reuse (useful for benchmarking)
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
   * Load action library from database (merges with programmatic actions)
   */
  async loadActionsFromDatabase(): Promise<void> {
    if (this.actionsLoaded) return;

    try {
      const rows = this.db.prepare(`
        SELECT * FROM goap_actions ORDER BY category, cost ASC
      `).all() as GOAPActionRecord[];

      // Merge DB actions with existing programmatic actions (avoid duplicates)
      const existingIds = new Set(this.actionLibrary.map(a => a.id));
      const dbActions = rows
        .filter(row => !existingIds.has(row.id))
        .map(row => ({
          id: row.id,
          name: row.name,
          description: row.description || undefined,
          agentType: row.agent_type,
          preconditions: JSON.parse(row.preconditions),
          effects: JSON.parse(row.effects),
          cost: row.cost,
          durationEstimate: row.duration_estimate || undefined,
          successRate: row.success_rate,
          executionCount: row.execution_count,
          category: row.category as GOAPAction['category']
        }));

      this.actionLibrary.push(...dbActions);
      this.actionsLoaded = true;
      this.logger.debug(`[GOAPPlanner] Loaded ${dbActions.length} actions from database (total: ${this.actionLibrary.length})`);
    } catch (error) {
      this.logger.warn('[GOAPPlanner] Failed to load actions from database, keeping existing library', { error });
      // Keep existing actions instead of clearing
    }
  }

  /**
   * Add actions programmatically (for testing or bootstrap)
   */
  addActions(actions: GOAPAction[]): void {
    this.actionLibrary.push(...actions);
  }

  /**
   * Clear action library
   */
  clearActions(): void {
    this.actionLibrary = [];
    this.actionsLoaded = false;
  }

  /**
   * Get current action library
   */
  getActionLibrary(): GOAPAction[] {
    return [...this.actionLibrary];
  }

  /**
   * Ensure GOAP schema exists (creates missing tables)
   */
  ensureSchema(): void {
    // Create goap_execution_steps if missing
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goap_execution_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        world_state_before TEXT,
        world_state_after TEXT,
        status TEXT DEFAULT 'pending',
        started_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        agent_id TEXT,
        FOREIGN KEY (plan_id) REFERENCES goap_plans (id),
        FOREIGN KEY (action_id) REFERENCES goap_actions (id)
      )
    `);

    // Create indexes if missing
    try {
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_goap_execution_plan ON goap_execution_steps (plan_id)');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_goap_execution_action ON goap_execution_steps (action_id)');
    } catch {
      // Indexes may already exist
    }

    this.logger.debug('[GOAPPlanner] Schema ensured');
  }

  /**
   * Seed actions to database (upsert - won't duplicate)
   * Call this with allActions to persist the action library
   */
  seedActions(actions: GOAPAction[]): number {
    this.ensureSchema();

    const upsert = this.db.prepare(`
      INSERT INTO goap_actions (
        id, name, description, agent_type, preconditions, effects,
        cost, duration_estimate, success_rate, execution_count, category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        agent_type = excluded.agent_type,
        preconditions = excluded.preconditions,
        effects = excluded.effects,
        cost = excluded.cost,
        duration_estimate = excluded.duration_estimate,
        category = excluded.category,
        updated_at = CURRENT_TIMESTAMP
    `);

    let seeded = 0;
    const insertMany = this.db.transaction((actionsToSeed: GOAPAction[]) => {
      for (const action of actionsToSeed) {
        upsert.run(
          action.id,
          action.name,
          action.description || null,
          action.agentType,
          JSON.stringify(action.preconditions),
          JSON.stringify(action.effects),
          action.cost,
          action.durationEstimate || null,
          action.successRate ?? 1.0,
          action.executionCount ?? 0,
          action.category
        );
        seeded++;
      }
    });

    insertMany(actions);
    this.logger.info(`[GOAPPlanner] Seeded ${seeded} actions to database`);
    return seeded;
  }

  /**
   * Get action count from database
   */
  getActionCountFromDatabase(): number {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM goap_actions').get() as { count: number };
    return result.count;
  }

  /**
   * A* search to find optimal plan from current to goal state
   * Phase 5: First checks for reusable similar plans before running A*
   */
  async findPlan(
    currentState: WorldState,
    goalConditions: StateConditions,
    constraints?: PlanConstraints
  ): Promise<GOAPPlan | null> {
    await this.loadActionsFromDatabase();

    const startTime = Date.now();

    // Phase 5: Check for reusable similar plans first (O(log n) vs O(n) A* search)
    if (this.enablePlanReuse) {
      const reusedPlan = await this.tryReuseSimilarPlan(currentState, goalConditions, constraints);
      if (reusedPlan) {
        this.logger.info('[GOAPPlanner] Reused similar plan', {
          planId: reusedPlan.id,
          actions: reusedPlan.actions.length,
          totalCost: reusedPlan.totalCost,
          elapsedMs: Date.now() - startTime
        });
        return reusedPlan;
      }
    }

    const openSet: PlanNode[] = [];
    const closedSet = new Set<string>();

    // Start node
    const startNode: PlanNode = {
      state: this.cloneState(currentState),
      gCost: 0,
      hCost: this.calculateHeuristic(currentState, goalConditions),
      fCost: 0,
      action: null,
      parent: null,
      depth: 0
    };
    startNode.fCost = startNode.gCost + startNode.hCost;
    openSet.push(startNode);

    let iterations = 0;
    const maxIterations = constraints?.maxIterations ?? 10000;
    const timeoutMs = constraints?.timeoutMs ?? 5000;
    const maxPlanLength = constraints?.maxPlanLength ?? 20;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        this.logger.warn('[GOAPPlanner] Planning timeout exceeded', {
          timeoutMs,
          iterations,
          elapsed: Date.now() - startTime
        });
        break;
      }

      // Get node with lowest fCost
      openSet.sort((a, b) => a.fCost - b.fCost);
      const current = openSet.shift()!;

      // Check if goal reached
      if (this.goalMet(current.state, goalConditions)) {
        const plan = this.reconstructPlan(current, goalConditions);
        this.logger.info('[GOAPPlanner] Plan found', {
          iterations,
          actions: plan.actions.length,
          totalCost: plan.totalCost,
          elapsedMs: Date.now() - startTime
        });
        return plan;
      }

      // Check max depth
      if (current.depth >= maxPlanLength) {
        continue;
      }

      const stateKey = this.stateHash(current.state);
      if (closedSet.has(stateKey)) {
        continue;
      }
      closedSet.add(stateKey);

      // Expand neighbors (applicable actions)
      const applicableActions = this.getApplicableActions(current.state, constraints);

      for (const action of applicableActions) {
        const nextState = this.applyAction(current.state, action);
        const nextStateKey = this.stateHash(nextState);

        if (closedSet.has(nextStateKey)) continue;

        const gCost = current.gCost + this.getActionCost(action, current.state);
        const hCost = this.calculateHeuristic(nextState, goalConditions);

        const existingNode = openSet.find(n => this.stateHash(n.state) === nextStateKey);

        if (!existingNode || gCost < existingNode.gCost) {
          const newNode: PlanNode = {
            state: nextState,
            gCost,
            hCost,
            fCost: gCost + hCost,
            action,
            parent: current,
            depth: current.depth + 1
          };

          if (existingNode) {
            Object.assign(existingNode, newNode);
          } else {
            openSet.push(newNode);
          }
        }
      }
    }

    this.logger.warn('[GOAPPlanner] No plan found', {
      iterations,
      closedSetSize: closedSet.size,
      elapsedMs: Date.now() - startTime
    });
    return null;
  }

  /**
   * Phase 5: Try to reuse a similar plan from the signature cache
   * Returns null if no suitable plan found, otherwise returns reconstructed plan
   */
  private async tryReuseSimilarPlan(
    currentState: WorldState,
    goalConditions: StateConditions,
    constraints?: PlanConstraints
  ): Promise<GOAPPlan | null> {
    try {
      // Find similar plans (target: <100ms)
      const similarPlans = await this.planSimilarity.findSimilarPlans(
        goalConditions,
        currentState,
        { minSimilarity: 0.75, maxCandidates: 3 }
      );

      if (similarPlans.length === 0) {
        return null;
      }

      // Try best match first (sorted by goal match, then similarity)
      for (const similar of similarPlans) {
        // Validate the action sequence is still valid
        const actions = this.reconstructActionsFromSequence(
          similar.signature.actionSequence,
          constraints
        );

        if (actions.length === 0) {
          this.logger.debug('[GOAPPlanner] Similar plan has no valid actions', {
            planId: similar.planId
          });
          continue;
        }

        // Verify preconditions can be met from current state
        if (!this.validateActionSequence(currentState, actions)) {
          this.logger.debug('[GOAPPlanner] Similar plan action sequence invalid for current state', {
            planId: similar.planId
          });
          continue;
        }

        // Create reused plan with new ID
        const reusedPlanId = `plan-reuse-${Date.now()}-${SecureRandom.randomString(6)}`;
        const plan: GOAPPlan = {
          id: reusedPlanId,
          actions,
          totalCost: similar.signature.totalCost,
          estimatedDuration: actions.reduce((sum, a) => sum + (a.durationEstimate ?? 0), 0),
          goalConditions,
          reusedFromPlanId: similar.planId,  // Track provenance
          similarityScore: similar.similarityScore
        };

        this.logger.info('[GOAPPlanner] Found reusable plan', {
          originalPlanId: similar.planId,
          reusedPlanId,
          similarity: similar.similarityScore.toFixed(3),
          goalMatch: similar.goalMatch,
          actions: actions.length
        });

        return plan;
      }

      return null;
    } catch (error) {
      this.logger.warn('[GOAPPlanner] Error in plan reuse check, falling back to A*', { error });
      return null;
    }
  }

  /**
   * Reconstruct action objects from action ID sequence
   */
  private reconstructActionsFromSequence(
    actionSequence: string[],
    constraints?: PlanConstraints
  ): GOAPAction[] {
    const actions: GOAPAction[] = [];
    const excludedActions = new Set(constraints?.excludedActions || []);
    const allowedCategories = constraints?.allowedCategories
      ? new Set(constraints.allowedCategories)
      : null;

    for (const actionId of actionSequence) {
      if (excludedActions.has(actionId)) continue;

      const action = this.actionLibrary.find(a => a.id === actionId);
      if (!action) continue;

      if (allowedCategories && !allowedCategories.has(action.category)) continue;

      actions.push(action);
    }

    return actions;
  }

  /**
   * Validate that action sequence can be executed from current state
   */
  private validateActionSequence(
    initialState: WorldState,
    actions: GOAPAction[]
  ): boolean {
    let currentState = this.cloneState(initialState);

    for (const action of actions) {
      if (!this.preconditionsMet(currentState, action.preconditions)) {
        return false;
      }
      currentState = this.applyAction(currentState, action);
    }

    return true;
  }

  /**
   * Store plan signature for future reuse
   * Call this after successful plan execution
   */
  storePlanSignature(
    plan: GOAPPlan,
    initialState: WorldState
  ): void {
    try {
      this.planSimilarity.storePlanSignature(
        plan.id,
        plan.goalConditions,
        initialState,
        plan.actions,
        plan.totalCost
      );
    } catch (error) {
      this.logger.warn('[GOAPPlanner] Failed to store plan signature', {
        planId: plan.id,
        error
      });
    }
  }

  /**
   * Record plan reuse outcome (for learning)
   */
  recordPlanReuseOutcome(planId: string, success: boolean): void {
    this.planSimilarity.recordPlanReuse(planId, success);
  }

  /**
   * Get plan reuse statistics
   */
  getPlanReuseStats(): PlanReuseStats {
    return this.planSimilarity.getReuseStats();
  }

  /**
   * Calculate heuristic distance to goal (admissible)
   */
  private calculateHeuristic(state: WorldState, goal: StateConditions): number {
    let distance = 0;

    for (const [key, condition] of Object.entries(goal)) {
      const currentValue = this.getStateValue(state, key);
      const condObj = condition as ConditionOperators;

      if (condObj.gte !== undefined) {
        if (typeof currentValue === 'number' && currentValue < condObj.gte) {
          distance += (condObj.gte - currentValue) / 100; // Normalize
        }
      }

      if (condObj.gt !== undefined) {
        if (typeof currentValue === 'number' && currentValue <= condObj.gt) {
          distance += (condObj.gt - currentValue + 1) / 100;
        }
      }

      if (condObj.lte !== undefined) {
        if (typeof currentValue === 'number' && currentValue > condObj.lte) {
          distance += (currentValue - condObj.lte) / 100;
        }
      }

      if (condObj.lt !== undefined) {
        if (typeof currentValue === 'number' && currentValue >= condObj.lt) {
          distance += (currentValue - condObj.lt + 1) / 100;
        }
      }

      if (condObj.eq !== undefined) {
        if (currentValue !== condObj.eq) {
          distance += 1;
        }
      }

      if (condObj.ne !== undefined) {
        if (currentValue === condObj.ne) {
          distance += 1;
        }
      }

      if (condObj.contains !== undefined) {
        if (Array.isArray(currentValue) && !currentValue.includes(condObj.contains)) {
          distance += 1;
        }
      }

      if (condObj.exists !== undefined) {
        const exists = currentValue !== undefined && currentValue !== null;
        if (condObj.exists !== exists) {
          distance += 1;
        }
      }
    }

    return distance;
  }

  /**
   * Check if goal conditions are met
   */
  goalMet(state: WorldState, goal: StateConditions): boolean {
    return this.conditionsMet(state, goal);
  }

  /**
   * Check if all conditions are satisfied
   */
  conditionsMet(state: WorldState, conditions: StateConditions): boolean {
    for (const [key, condition] of Object.entries(conditions)) {
      if (!this.checkCondition(state, key, condition as ConditionOperators)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check a single condition
   */
  private checkCondition(state: WorldState, key: string, condition: ConditionOperators): boolean {
    const value = this.getStateValue(state, key);

    if (condition.gte !== undefined && (typeof value !== 'number' || value < condition.gte)) {
      return false;
    }

    if (condition.gt !== undefined && (typeof value !== 'number' || value <= condition.gt)) {
      return false;
    }

    if (condition.lte !== undefined && (typeof value !== 'number' || value > condition.lte)) {
      return false;
    }

    if (condition.lt !== undefined && (typeof value !== 'number' || value >= condition.lt)) {
      return false;
    }

    if (condition.eq !== undefined && value !== condition.eq) {
      return false;
    }

    if (condition.ne !== undefined && value === condition.ne) {
      return false;
    }

    if (condition.contains !== undefined) {
      if (!Array.isArray(value) || !value.includes(condition.contains)) {
        return false;
      }
    }

    if (condition.exists !== undefined) {
      const exists = value !== undefined && value !== null;
      if (condition.exists !== exists) {
        return false;
      }
    }

    if (condition.in !== undefined) {
      if (!condition.in.includes(value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if action preconditions are met
   */
  preconditionsMet(state: WorldState, preconditions: StateConditions): boolean {
    return this.conditionsMet(state, preconditions);
  }

  /**
   * Get actions whose preconditions are satisfied
   */
  private getApplicableActions(
    state: WorldState,
    constraints?: PlanConstraints
  ): GOAPAction[] {
    return this.actionLibrary.filter(action => {
      // Check preconditions
      if (!this.preconditionsMet(state, action.preconditions)) {
        return false;
      }

      // Check category constraints
      if (constraints?.allowedCategories) {
        if (!constraints.allowedCategories.includes(action.category)) {
          return false;
        }
      }

      // Check excluded actions
      if (constraints?.excludedActions) {
        if (constraints.excludedActions.includes(action.id)) {
          return false;
        }
      }

      // Check preferred agent types (boost, don't exclude)
      // This is handled in cost calculation instead

      return true;
    });
  }

  /**
   * Calculate effective action cost
   */
  private getActionCost(action: GOAPAction, state: WorldState): number {
    let cost = action.cost;

    // Adjust based on success rate (prefer reliable actions)
    if (action.successRate !== undefined && action.successRate < 1) {
      cost = cost / action.successRate;
    }

    // Adjust for critical risk level (increase cost of risky actions)
    if (state.context.riskLevel === 'critical') {
      if (action.category === 'process') {
        cost *= 2; // Discourage process shortcuts in critical situations
      }
    }

    return cost;
  }

  /**
   * Apply action effects to state
   */
  applyAction(state: WorldState, action: GOAPAction): WorldState {
    const newState = this.cloneState(state);

    for (const [key, effect] of Object.entries(action.effects)) {
      this.applyEffect(newState, key, effect as EffectOperators);
    }

    return newState;
  }

  /**
   * Apply a single effect to state
   */
  private applyEffect(state: WorldState, key: string, effect: EffectOperators): void {
    if (effect.set !== undefined) {
      this.setStateValue(state, key, effect.set);
    }

    if (effect.increase !== undefined) {
      const current = this.getStateValue(state, key) ?? 0;
      if (typeof current === 'number') {
        this.setStateValue(state, key, Math.min(100, current + effect.increase));
      }
    }

    if (effect.decrease !== undefined) {
      const current = this.getStateValue(state, key) ?? 0;
      if (typeof current === 'number') {
        this.setStateValue(state, key, Math.max(0, current - effect.decrease));
      }
    }

    if (effect.increment !== undefined) {
      const current = this.getStateValue(state, key) ?? 0;
      if (typeof current === 'number') {
        this.setStateValue(state, key, current + effect.increment);
      }
    }

    if (effect.decrement !== undefined) {
      const current = this.getStateValue(state, key) ?? 0;
      if (typeof current === 'number') {
        this.setStateValue(state, key, Math.max(0, current - effect.decrement));
      }
    }

    if (effect.add !== undefined) {
      const current = this.getStateValue(state, key) ?? [];
      if (Array.isArray(current) && !current.includes(effect.add)) {
        this.setStateValue(state, key, [...current, effect.add]);
      }
    }

    if (effect.remove !== undefined) {
      const current = this.getStateValue(state, key) ?? [];
      if (Array.isArray(current)) {
        this.setStateValue(state, key, current.filter(v => v !== effect.remove));
      }
    }

    // NOTE: { update: 'measured' } was removed as it was a semantic hack
    // that allowed the same action to repeat infinitely. We now use proper
    // flag-based effects where measurement actions set boolean flags that
    // enable improvement actions. This ensures each measurement action
    // can only run once (precondition: flag == false, effect: flag = true).
  }

  /**
   * Get value from nested state using dot notation
   */
  getStateValue(state: WorldState, key: string): any {
    const parts = key.split('.');
    let current: any = state;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set value in nested state using dot notation
   */
  private setStateValue(state: WorldState, key: string, value: any): void {
    const parts = key.split('.');
    let current: any = state;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Create hash of state for deduplication
   */
  private stateHash(state: WorldState): string {
    // Hash all metrics that affect planning, including measurement flags
    const key = {
      coverage: state.coverage.line,
      coverageMeasured: state.coverage.measured ?? false,
      tests: state.quality.testsPassing,
      testsMeasured: state.quality.testsMeasured ?? false,
      integrationTested: state.quality.integrationTested ?? false,
      security: state.quality.securityScore,
      securityMeasured: state.quality.securityMeasured ?? false,
      performance: state.quality.performanceScore,
      performanceMeasured: state.quality.performanceMeasured ?? false,
      complexityMeasured: state.quality.complexityMeasured ?? false,
      gateEvaluated: state.quality.gateEvaluated ?? false,
      gateStatus: state.quality.gateStatus,
      agents: state.fleet.activeAgents,
      availableTypes: state.fleet.availableAgents.sort().join(','),
      time: Math.floor(state.resources.timeRemaining / 60) // Round to minutes
    };
    return JSON.stringify(key);
  }

  /**
   * Deep clone world state
   */
  private cloneState(state: WorldState): WorldState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Reconstruct plan from goal node
   */
  private reconstructPlan(
    goalNode: PlanNode,
    goalConditions: StateConditions
  ): GOAPPlan {
    const actions: GOAPAction[] = [];
    let current: PlanNode | null = goalNode;

    while (current && current.action) {
      actions.unshift(current.action);
      current = current.parent;
    }

    const planId = `plan-${Date.now()}-${SecureRandom.randomString(6)}`;

    return {
      id: planId,
      actions,
      totalCost: goalNode.gCost,
      estimatedDuration: actions.reduce((sum, a) => sum + (a.durationEstimate ?? 0), 0),
      goalConditions
    };
  }

  /**
   * Persist plan to database
   */
  async persistPlan(plan: GOAPPlan, initialState: WorldState, goalId?: string): Promise<void> {
    try {
      this.db.prepare(`
        INSERT INTO goap_plans (
          id, goal_id, initial_state, goal_state, action_sequence,
          total_cost, estimated_duration, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      `).run(
        plan.id,
        goalId || null,
        JSON.stringify(initialState),
        JSON.stringify(plan.goalConditions),
        JSON.stringify(plan.actions.map(a => a.id)),
        plan.totalCost,
        plan.estimatedDuration
      );

      this.logger.info('[GOAPPlanner] Plan persisted', { planId: plan.id });
    } catch (error) {
      this.logger.error('[GOAPPlanner] Failed to persist plan', { planId: plan.id, error });
    }
  }

  /**
   * Update action success rate based on execution outcome
   */
  async updateActionSuccessRate(actionId: string, success: boolean): Promise<void> {
    try {
      const action = this.db.prepare(`
        SELECT success_rate, execution_count FROM goap_actions WHERE id = ?
      `).get(actionId) as { success_rate: number; execution_count: number } | undefined;

      if (!action) return;

      const newCount = action.execution_count + 1;
      const newRate = (action.success_rate * action.execution_count + (success ? 1 : 0)) / newCount;

      this.db.prepare(`
        UPDATE goap_actions
        SET success_rate = ?, execution_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newRate, newCount, actionId);

      // Update in-memory library
      const memAction = this.actionLibrary.find(a => a.id === actionId);
      if (memAction) {
        memAction.successRate = newRate;
        memAction.executionCount = newCount;
      }
    } catch (error) {
      this.logger.warn('[GOAPPlanner] Failed to update action success rate', { actionId, error });
    }
  }

  /**
   * Find alternative plans (for presenting options)
   */
  async findAlternativePlans(
    currentState: WorldState,
    goalConditions: StateConditions,
    constraints?: PlanConstraints,
    maxAlternatives = 3
  ): Promise<GOAPPlan[]> {
    const plans: GOAPPlan[] = [];
    const usedActions = new Set<string>();

    for (let i = 0; i < maxAlternatives + 1; i++) {
      const plan = await this.findPlan(currentState, goalConditions, {
        ...constraints,
        excludedActions: [...(constraints?.excludedActions || []), ...Array.from(usedActions)]
      });

      if (plan) {
        plans.push(plan);
        // Exclude first action of this plan for next iteration
        if (plan.actions.length > 0) {
          usedActions.add(plan.actions[0].id);
        }
      } else {
        break;
      }
    }

    return plans;
  }
}

/**
 * Get shared GOAPPlanner instance
 */
let sharedPlanner: GOAPPlanner | null = null;

export function getSharedGOAPPlanner(db: Database.Database): GOAPPlanner {
  if (!sharedPlanner) {
    sharedPlanner = new GOAPPlanner(db);
  }
  return sharedPlanner;
}

export function resetSharedGOAPPlanner(): void {
  sharedPlanner = null;
}
