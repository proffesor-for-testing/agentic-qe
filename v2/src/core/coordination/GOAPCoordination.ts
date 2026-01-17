import { EventEmitter } from 'events';
import { SwarmMemoryManager } from '../memory/SwarmMemoryManager';

export interface WorldState {
  [key: string]: unknown;
}

export interface Goal {
  id: string;
  conditions: WorldState;
  priority: number;
}

export interface Action {
  id: string;
  cost: number;
  preconditions: WorldState;
  effects: WorldState;
  execute: () => Promise<void>;
}

export interface Plan {
  goal: Goal;
  actions: Action[];
  totalCost: number;
  state: 'pending' | 'executing' | 'completed' | 'failed';
}

/**
 * Serializable version of Plan for memory storage
 * Actions are stored by ID since execute functions cannot be serialized
 */
interface SerializablePlan {
  goal: Goal;
  actionIds: string[];
  totalCost: number;
  state: 'pending' | 'executing' | 'completed' | 'failed';
}

/**
 * Type guard to check if a value is a SerializablePlan
 */
function isSerializablePlan(value: unknown): value is SerializablePlan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    'goal' in obj &&
    'actionIds' in obj &&
    Array.isArray(obj.actionIds) &&
    'totalCost' in obj &&
    typeof obj.totalCost === 'number' &&
    'state' in obj &&
    typeof obj.state === 'string' &&
    ['pending', 'executing', 'completed', 'failed'].includes(obj.state)
  );
}

/**
 * GOAPCoordination - Goal-Oriented Action Planning for agent task coordination
 *
 * Uses A* pathfinding to find optimal action sequences to achieve goals
 *
 * Features:
 * - Dynamic goal prioritization
 * - Cost-based action planning
 * - World state management
 * - Plan execution tracking
 */
export class GOAPCoordination extends EventEmitter {
  private actions: Map<string, Action> = new Map();
  private currentWorldState: WorldState = {};

  constructor(private memory: SwarmMemoryManager) {
    super();
  }

  /**
   * Register an action that can be used in planning
   */
  registerAction(action: Action): void {
    this.actions.set(action.id, action);
  }

  /**
   * Update the current world state
   */
  async updateWorldState(updates: Partial<WorldState>): Promise<void> {
    this.currentWorldState = { ...this.currentWorldState, ...updates };

    await this.memory.store('goap:world-state', this.currentWorldState, {
      partition: 'goap_state'
    });

    this.emit('goap:world-state-updated', this.currentWorldState);
  }

  /**
   * Get current world state
   */
  getWorldState(): WorldState {
    return { ...this.currentWorldState };
  }

  /**
   * Plan actions to achieve a goal using A* algorithm
   */
  async planForGoal(goal: Goal): Promise<Plan | null> {
    const startState = { ...this.currentWorldState };
    const plan = this.findPlanAStar(startState, goal.conditions);

    if (!plan) {
      this.emit('goap:planning-failed', { goal, reason: 'No valid plan found' });
      return null;
    }

    const planObj: Plan = {
      goal,
      actions: plan.actions,
      totalCost: plan.cost,
      state: 'pending'
    };

    // Store serializable version (actions by ID, not full objects with functions)
    const serializablePlan: SerializablePlan = {
      goal,
      actionIds: plan.actions.map(a => a.id),
      totalCost: plan.cost,
      state: 'pending'
    };

    await this.memory.store(
      `goap:plan:${goal.id}`,
      serializablePlan as unknown as Record<string, unknown>,
      {
        partition: 'goap_plans',
        ttl: 3600 // 1 hour
      }
    );

    this.emit('goap:plan-created', planObj);

    return planObj;
  }

  /**
   * Execute a plan
   */
  async executePlan(planId: string): Promise<boolean> {
    const storedPlan = await this.memory.retrieve(`goap:plan:${planId}`, {
      partition: 'goap_plans'
    });

    if (!storedPlan) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Validate and narrow the type
    if (!isSerializablePlan(storedPlan)) {
      throw new Error(`Plan ${planId} has invalid format`);
    }

    // Reconstruct actions from IDs
    const actions: Action[] = [];
    for (const actionId of storedPlan.actionIds) {
      const action = this.actions.get(actionId);
      if (!action) {
        throw new Error(`Action ${actionId} not found in registered actions`);
      }
      actions.push(action);
    }

    // Create the full Plan object for execution
    const plan: Plan = {
      goal: storedPlan.goal,
      actions,
      totalCost: storedPlan.totalCost,
      state: 'executing'
    };

    // Update state in memory
    const updatedSerializablePlan: SerializablePlan = {
      goal: storedPlan.goal,
      actionIds: storedPlan.actionIds,
      totalCost: storedPlan.totalCost,
      state: 'executing'
    };
    await this.memory.store(
      `goap:plan:${planId}`,
      updatedSerializablePlan as unknown as Record<string, unknown>,
      {
        partition: 'goap_plans'
      }
    );

    this.emit('goap:plan-executing', plan);

    try {
      for (const action of plan.actions) {
        // Verify preconditions
        if (!this.checkConditions(this.currentWorldState, action.preconditions)) {
          throw new Error(`Preconditions not met for action ${action.id}`);
        }

        // Execute action
        await action.execute();

        // Apply effects to world state
        await this.updateWorldState(action.effects);

        this.emit('goap:action-completed', { plan, action });
      }

      plan.state = 'completed';
      const completedSerializablePlan: SerializablePlan = {
        goal: storedPlan.goal,
        actionIds: storedPlan.actionIds,
        totalCost: storedPlan.totalCost,
        state: 'completed'
      };
      await this.memory.store(
        `goap:plan:${planId}`,
        completedSerializablePlan as unknown as Record<string, unknown>,
        {
          partition: 'goap_plans'
        }
      );

      this.emit('goap:plan-completed', plan);
      return true;

    } catch (error) {
      plan.state = 'failed';
      const failedSerializablePlan: SerializablePlan = {
        goal: storedPlan.goal,
        actionIds: storedPlan.actionIds,
        totalCost: storedPlan.totalCost,
        state: 'failed'
      };
      await this.memory.store(
        `goap:plan:${planId}`,
        failedSerializablePlan as unknown as Record<string, unknown>,
        {
          partition: 'goap_plans'
        }
      );

      this.emit('goap:plan-failed', { plan, error });
      return false;
    }
  }

  /**
   * A* pathfinding to find optimal action sequence
   */
  private findPlanAStar(
    startState: WorldState,
    goalConditions: WorldState
  ): { actions: Action[]; cost: number } | null {
    interface Node {
      state: WorldState;
      actions: Action[];
      cost: number;
      heuristic: number;
    }

    const openSet: Node[] = [{
      state: startState,
      actions: [],
      cost: 0,
      heuristic: this.calculateHeuristic(startState, goalConditions)
    }];

    const closedSet = new Set<string>();

    while (openSet.length > 0) {
      // Sort by f(n) = g(n) + h(n)
      openSet.sort((a, b) => (a.cost + a.heuristic) - (b.cost + b.heuristic));

      const current = openSet.shift()!;
      const stateKey = JSON.stringify(current.state);

      if (closedSet.has(stateKey)) {
        continue;
      }

      closedSet.add(stateKey);

      // Check if goal is reached
      if (this.checkConditions(current.state, goalConditions)) {
        return {
          actions: current.actions,
          cost: current.cost
        };
      }

      // Explore neighbors (applicable actions)
      for (const action of Array.from(this.actions.values())) {
        if (this.checkConditions(current.state, action.preconditions)) {
          const newState = { ...current.state, ...action.effects };
          const newActions = [...current.actions, action];
          const newCost = current.cost + action.cost;

          openSet.push({
            state: newState,
            actions: newActions,
            cost: newCost,
            heuristic: this.calculateHeuristic(newState, goalConditions)
          });
        }
      }
    }

    return null; // No plan found
  }

  /**
   * Check if current state meets required conditions
   */
  private checkConditions(state: WorldState, conditions: WorldState): boolean {
    return Object.entries(conditions).every(([key, value]) => {
      return state[key] === value;
    });
  }

  /**
   * Calculate heuristic (estimated cost to goal)
   * Simple implementation: count of unmet conditions
   */
  private calculateHeuristic(state: WorldState, goal: WorldState): number {
    return Object.entries(goal).filter(([key, value]) => state[key] !== value).length;
  }

  /**
   * Get all registered actions
   */
  getActions(): Action[] {
    return Array.from(this.actions.values());
  }
}
