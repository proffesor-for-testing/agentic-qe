/**
 * GOAP Plan Executor for Agentic QE V3
 *
 * Executes GOAP plans step-by-step with:
 * - Agent spawning integration via configurable AgentSpawner interface
 * - Retry logic with configurable max retries
 * - Automatic replanning on failure
 * - World state tracking and persistence
 * - Execution history and statistics
 *
 * @module planning/plan-executor
 * @version 3.0.0
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  GOAPPlan,
  GOAPAction,
  ExecutionStep,
  V3WorldState,
  StateConditions,
  ActionEffects,
} from './types.js';
import { DEFAULT_V3_WORLD_STATE } from './types.js';
import type { GOAPPlanner } from './goap-planner.js';
import { getUnifiedMemory, type UnifiedMemoryManager } from '../kernel/unified-memory.js';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for plan execution
 */
export interface ExecutionConfig {
  /** Per-step retry count (default: 2) */
  maxRetries: number;
  /** Per-step timeout in milliseconds (default: 60000) */
  stepTimeoutMs: number;
  /** Auto-replan if step fails (default: true) */
  replanOnFailure: boolean;
  /** Execute independent steps in parallel (default: false) */
  parallelExecution: boolean;
  /** Record state before/after each step (default: true) */
  recordWorldState: boolean;
  /**
   * Use UnifiedMemoryManager instead of separate database (ADR-046)
   * When true, uses shared .agentic-qe/memory.db
   * When false, uses provided dbPath or in-memory database (legacy)
   * @default true
   */
  useUnified: boolean;
}

/**
 * Default execution configuration
 */
const DEFAULT_CONFIG: ExecutionConfig = {
  maxRetries: 2,
  stepTimeoutMs: 60000,
  replanOnFailure: true,
  parallelExecution: false,
  recordWorldState: true,
  useUnified: true, // ADR-046: Default to unified storage
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of executing a complete plan
 */
export interface ExecutionResult {
  /** Plan ID that was executed */
  planId: string;
  /** Overall execution status */
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  /** Number of steps completed successfully */
  stepsCompleted: number;
  /** Number of steps that failed */
  stepsFailed: number;
  /** Total execution duration in milliseconds */
  totalDurationMs: number;
  /** Final world state after execution */
  finalWorldState?: V3WorldState;
  /** Error message if execution failed */
  error?: string;
  /** Detailed step execution results */
  steps: ExecutedStep[];
}

/**
 * Extended execution step with runtime information
 */
export interface ExecutedStep extends ExecutionStep {
  /** Number of retries attempted */
  retries: number;
  /** Timestamp when step started */
  startedAt: Date;
  /** Timestamp when step completed */
  completedAt?: Date;
  /** Output from the agent that executed this step */
  agentOutput?: string;
}

// ============================================================================
// Agent Spawner Interface
// ============================================================================

/**
 * Result from spawning and executing an agent task
 */
export interface AgentSpawnResult {
  /** Unique agent identifier */
  agentId: string;
  /** Output produced by the agent */
  output: string;
  /** Whether the agent completed successfully */
  success: boolean;
  /** Error message if agent failed */
  error?: string;
}

/**
 * Interface for spawning agents to execute actions
 *
 * Implementations can integrate with:
 * - Claude Flow MCP tools (agent_spawn)
 * - V3 DefaultAgentCoordinator
 * - Mock implementations for testing
 */
export interface AgentSpawner {
  /**
   * Spawn an agent to execute a task
   * @param agentType - Type of agent to spawn (e.g., 'qe-test-generator', 'coder')
   * @param task - Task description for the agent
   * @returns Promise resolving to spawn result
   */
  spawn(agentType: string, task: string): Promise<AgentSpawnResult>;
}

// ============================================================================
// Database Record Types
// ============================================================================

interface ExecutionResultRecord {
  id: string;
  plan_id: string;
  status: string;
  steps_completed: number;
  steps_failed: number;
  total_duration_ms: number;
  final_world_state: string | null;
  error_message: string | null;
  created_at: string;
}

interface ExecutedStepRecord {
  id: string;
  execution_id: string;
  plan_id: string;
  action_id: string;
  step_order: number;
  status: string;
  retries: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  agent_id: string | null;
  agent_output: string | null;
  world_state_before: string | null;
  world_state_after: string | null;
  error_message: string | null;
}

// ============================================================================
// Plan Executor Class
// ============================================================================

/**
 * Executes GOAP plans step-by-step with agent integration
 *
 * Example usage:
 * ```typescript
 * const planner = new GOAPPlanner('./goap.db');
 * const spawner = new ClaudeFlowSpawner();
 * const executor = new PlanExecutor(planner, spawner, './execution.db');
 *
 * await executor.initialize();
 *
 * const plan = await planner.findPlan(currentState, goalConditions);
 * if (plan) {
 *   const result = await executor.execute(plan, currentState);
 *   console.log(`Execution ${result.status}: ${result.stepsCompleted}/${plan.actions.length} steps`);
 * }
 * ```
 */
export class PlanExecutor {
  private db!: Database.Database;
  private planner: GOAPPlanner;
  private spawner: AgentSpawner;
  private config: ExecutionConfig;
  private currentExecution: { planId: string; cancelled: boolean } | null = null;
  private initialized = false;
  private unifiedMemory: UnifiedMemoryManager | null = null;

  /**
   * Create a new Plan Executor
   *
   * @param planner - GOAPPlanner instance for replanning
   * @param spawner - AgentSpawner implementation for executing actions
   * @param dbPath - Path to SQLite database (defaults to in-memory, ignored if useUnified=true)
   * @param config - Execution configuration options
   */
  constructor(
    planner: GOAPPlanner,
    spawner: AgentSpawner,
    dbPath?: string,
    config?: Partial<ExecutionConfig>
  ) {
    this.planner = planner;
    this.spawner = spawner;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // ADR-046: Defer database initialization to initialize()
    // This allows async unified storage initialization
    if (!this.config.useUnified) {
      // Legacy mode: create separate database immediately
      this.db = new Database(dbPath ?? ':memory:');
      this.db.pragma('journal_mode = WAL');
    }
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the executor - creates database tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // ADR-046: Initialize unified storage if enabled
    if (this.config.useUnified) {
      try {
        this.unifiedMemory = getUnifiedMemory();
        await this.unifiedMemory.initialize();
        this.db = this.unifiedMemory.getDatabase();
        console.log(`[PlanExecutor] Using unified storage: ${this.unifiedMemory.getDbPath()}`);
        // Tables already created by UnifiedMemoryManager migration
      } catch (error) {
        console.warn('[PlanExecutor] Failed to initialize unified storage, falling back to in-memory:', error);
        this.db = new (await import('better-sqlite3')).default(':memory:');
        this.db.pragma('journal_mode = WAL');
        this.unifiedMemory = null;
        this.createTables();
      }
    } else {
      // Legacy mode: tables need to be created
      this.createTables();
    }

    this.initialized = true;
  }

  /**
   * Create execution tracking tables
   */
  private createTables(): void {
    // Execution results table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS execution_results (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        steps_completed INTEGER DEFAULT 0,
        steps_failed INTEGER DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        final_world_state TEXT,
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Executed steps table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executed_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        status TEXT NOT NULL,
        retries INTEGER DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        agent_id TEXT,
        agent_output TEXT,
        world_state_before TEXT,
        world_state_after TEXT,
        error_message TEXT,
        FOREIGN KEY (execution_id) REFERENCES execution_results(id)
      )
    `);

    // Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_exec_results_plan ON execution_results(plan_id);
      CREATE INDEX IF NOT EXISTS idx_exec_steps_execution ON executed_steps(execution_id);
      CREATE INDEX IF NOT EXISTS idx_exec_steps_action ON executed_steps(action_id);
    `);
  }

  // ==========================================================================
  // Plan Execution
  // ==========================================================================

  /**
   * Execute a GOAP plan
   *
   * @param plan - The plan to execute
   * @param initialState - Starting world state (defaults to plan's initial state)
   * @returns Execution result with status and step details
   */
  async execute(
    plan: GOAPPlan,
    initialState?: V3WorldState
  ): Promise<ExecutionResult> {
    await this.initialize();

    return this.executeWithCallbacks(
      plan,
      () => {},
      () => {},
      initialState
    );
  }

  /**
   * Execute a plan with callbacks for step progress
   *
   * @param plan - The plan to execute
   * @param onStepStart - Callback when a step begins
   * @param onStepComplete - Callback when a step completes
   * @param initialState - Starting world state
   * @returns Execution result
   */
  async executeWithCallbacks(
    plan: GOAPPlan,
    onStepStart: (step: ExecutionStep) => void,
    onStepComplete: (step: ExecutedStep) => void,
    initialState?: V3WorldState
  ): Promise<ExecutionResult> {
    await this.initialize();

    const startTime = Date.now();
    const executionId = `exec-${Date.now()}-${randomUUID().slice(0, 8)}`;
    this.currentExecution = { planId: plan.id, cancelled: false };

    const result: ExecutionResult = {
      planId: plan.id,
      status: 'completed',
      stepsCompleted: 0,
      stepsFailed: 0,
      totalDurationMs: 0,
      steps: [],
    };

    let currentState = initialState
      ? this.cloneState(initialState)
      : this.cloneState(plan.initialState);

    // Create execution steps from plan actions
    const steps: ExecutionStep[] = plan.actions.map((action, index) => ({
      id: `step-${Date.now()}-${randomUUID().slice(0, 8)}`,
      planId: plan.id,
      action,
      stepOrder: index,
      status: 'pending' as const,
    }));

    try {
      for (const step of steps) {
        // Check for cancellation
        if (this.currentExecution?.cancelled) {
          result.status = 'cancelled';
          result.error = 'Execution was cancelled';
          break;
        }

        // Record world state before execution
        if (this.config.recordWorldState) {
          step.worldStateBefore = this.cloneState(currentState);
        }

        // Notify step start
        onStepStart(step);

        // Execute with retries
        let success = false;
        let lastError: string | undefined;
        let retries = 0;
        let output: string | undefined;
        let agentId: string | undefined;
        const stepStartTime = Date.now();

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
          const execResult = await this.executeStep(step, currentState);

          if (execResult.success) {
            success = true;
            currentState = execResult.newState;
            output = execResult.output;
            agentId = execResult.agentId;
            break;
          }

          lastError = execResult.error;
          retries = attempt;

          // Wait before retry (exponential backoff)
          if (attempt < this.config.maxRetries) {
            await this.delay(Math.min(1000 * Math.pow(2, attempt), 5000));
          }
        }

        // Record executed step
        const executedStep: ExecutedStep = {
          ...step,
          status: success ? 'completed' : 'failed',
          retries,
          startedAt: new Date(stepStartTime),
          completedAt: new Date(),
          durationMs: Date.now() - stepStartTime,
          agentId,
          agentOutput: output,
          worldStateAfter: this.config.recordWorldState
            ? this.cloneState(currentState)
            : undefined,
          error: lastError,
        };

        result.steps.push(executedStep);
        onStepComplete(executedStep);

        if (success) {
          result.stepsCompleted++;
          await this.updateActionStats(step.action.id, true, executedStep.durationMs ?? 0);
        } else {
          result.stepsFailed++;
          await this.updateActionStats(step.action.id, false, 0);

          // Try to replan if configured
          if (this.config.replanOnFailure) {
            const newPlan = await this.replanFromFailure(
              plan,
              step.stepOrder,
              currentState
            );

            if (newPlan) {
              // Execute new plan recursively
              const replanResult = await this.executeWithCallbacks(
                newPlan,
                onStepStart,
                onStepComplete,
                currentState
              );

              result.steps.push(...replanResult.steps);
              result.stepsCompleted += replanResult.stepsCompleted;
              result.stepsFailed += replanResult.stepsFailed;

              if (replanResult.status === 'completed' && replanResult.finalWorldState) {
                currentState = replanResult.finalWorldState;
              } else {
                result.status = 'partial';
                result.error = `Replanning partially succeeded: ${replanResult.error || 'unknown error'}`;
              }
            } else {
              result.status = 'failed';
              result.error = `Step ${step.stepOrder} failed and replanning unsuccessful: ${lastError}`;
              break;
            }
          } else {
            result.status = 'failed';
            result.error = `Step ${step.stepOrder} failed: ${lastError}`;
            break;
          }
        }
      }

      result.finalWorldState = currentState;
      result.totalDurationMs = Date.now() - startTime;

      // Persist execution result
      await this.persistExecutionResult(executionId, result);

      return result;
    } finally {
      this.currentExecution = null;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: ExecutionStep,
    currentState: V3WorldState
  ): Promise<{
    success: boolean;
    newState: V3WorldState;
    output?: string;
    agentId?: string;
    error?: string;
  }> {
    const action = step.action;

    // Check preconditions
    if (!this.meetsConditions(currentState, action.preconditions)) {
      return {
        success: false,
        newState: currentState,
        error: `Preconditions not met for action: ${action.name}`,
      };
    }

    // Build task description
    const taskDescription = this.buildTaskDescription(action);

    try {
      // Execute with timeout
      const timeoutPromise = new Promise<AgentSpawnResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Step timeout after ${this.config.stepTimeoutMs}ms`)),
          this.config.stepTimeoutMs
        )
      );

      const spawnPromise = this.spawner.spawn(action.agentType, taskDescription);
      const agentResult = await Promise.race([spawnPromise, timeoutPromise]);

      if (agentResult.success) {
        // Apply action effects to world state
        const newState = this.applyEffects(currentState, action.effects);
        return {
          success: true,
          newState,
          output: agentResult.output,
          agentId: agentResult.agentId,
        };
      } else {
        return {
          success: false,
          newState: currentState,
          agentId: agentResult.agentId,
          error: agentResult.error || 'Agent execution failed',
        };
      }
    } catch (error) {
      return {
        success: false,
        newState: currentState,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build a task description for an agent
   */
  private buildTaskDescription(action: GOAPAction): string {
    let description = `Execute action: ${action.name}`;

    if (action.description) {
      description += `\n\nDescription: ${action.description}`;
    }

    description += `\n\nExpected effects:`;
    for (const [key, effect] of Object.entries(action.effects)) {
      if (typeof effect === 'object' && effect !== null) {
        if ('delta' in effect) {
          description += `\n- ${key}: change by ${effect.delta}`;
        } else if ('set' in effect) {
          description += `\n- ${key}: set to ${effect.set}`;
        }
      } else {
        description += `\n- ${key}: ${effect}`;
      }
    }

    return description;
  }

  // ==========================================================================
  // Replanning
  // ==========================================================================

  /**
   * Replan after a step failure
   *
   * @param originalPlan - The original plan that failed
   * @param failedStepIndex - Index of the step that failed
   * @param currentState - Current world state at failure point
   * @returns New plan or null if replanning fails
   */
  async replanFromFailure(
    originalPlan: GOAPPlan,
    failedStepIndex: number,
    currentState: V3WorldState
  ): Promise<GOAPPlan | null> {
    try {
      // Exclude the failed action from replanning
      const failedAction = originalPlan.actions[failedStepIndex];
      const excludedActions = [failedAction.id];

      // Try to find a new plan
      const newPlan = await this.planner.findPlan(
        currentState,
        originalPlan.goalState,
        { excludedActions }
      );

      return newPlan;
    } catch (error) {
      console.error('[PlanExecutor] Replanning failed:', error);
      return null;
    }
  }

  // ==========================================================================
  // Execution Control
  // ==========================================================================

  /**
   * Cancel the current execution
   */
  async cancel(): Promise<void> {
    if (this.currentExecution) {
      this.currentExecution.cancelled = true;
    }
  }

  /**
   * Check if currently executing
   */
  isExecuting(): boolean {
    return this.currentExecution !== null;
  }

  // ==========================================================================
  // Execution History
  // ==========================================================================

  /**
   * Get execution history
   *
   * @param planId - Filter by plan ID (optional)
   * @param limit - Maximum number of results (default: 100)
   * @returns Array of execution results
   */
  async getExecutionHistory(
    planId?: string,
    limit: number = 100
  ): Promise<ExecutionResult[]> {
    await this.initialize();

    let query = 'SELECT * FROM execution_results';
    const params: unknown[] = [];

    if (planId) {
      query += ' WHERE plan_id = ?';
      params.push(planId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as ExecutionResultRecord[];

    return Promise.all(
      rows.map(async (row) => {
        const steps = await this.getExecutedSteps(row.id);
        return {
          planId: row.plan_id,
          status: row.status as ExecutionResult['status'],
          stepsCompleted: row.steps_completed,
          stepsFailed: row.steps_failed,
          totalDurationMs: row.total_duration_ms,
          finalWorldState: row.final_world_state
            ? JSON.parse(row.final_world_state)
            : undefined,
          error: row.error_message ?? undefined,
          steps,
        };
      })
    );
  }

  /**
   * Get executed steps for an execution
   */
  private async getExecutedSteps(executionId: string): Promise<ExecutedStep[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM executed_steps WHERE execution_id = ? ORDER BY step_order`
      )
      .all(executionId) as ExecutedStepRecord[];

    return rows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      action: {
        id: row.action_id,
        name: '',
        agentType: '',
        preconditions: {},
        effects: {},
        cost: 1,
        successRate: 1,
        executionCount: 0,
        category: 'analysis' as const,
      },
      stepOrder: row.step_order,
      status: row.status as ExecutionStep['status'],
      durationMs: row.duration_ms ?? undefined,
      agentId: row.agent_id ?? undefined,
      error: row.error_message ?? undefined,
      retries: row.retries,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      agentOutput: row.agent_output ?? undefined,
      worldStateBefore: row.world_state_before
        ? JSON.parse(row.world_state_before)
        : undefined,
      worldStateAfter: row.world_state_after
        ? JSON.parse(row.world_state_after)
        : undefined,
    }));
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Persist execution result to database
   */
  private async persistExecutionResult(
    executionId: string,
    result: ExecutionResult
  ): Promise<void> {
    // Insert execution result
    this.db
      .prepare(
        `
      INSERT INTO execution_results (
        id, plan_id, status, steps_completed, steps_failed,
        total_duration_ms, final_world_state, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        executionId,
        result.planId,
        result.status,
        result.stepsCompleted,
        result.stepsFailed,
        result.totalDurationMs,
        result.finalWorldState ? JSON.stringify(result.finalWorldState) : null,
        result.error ?? null
      );

    // Insert executed steps
    const insertStep = this.db.prepare(`
      INSERT INTO executed_steps (
        id, execution_id, plan_id, action_id, step_order, status,
        retries, started_at, completed_at, duration_ms, agent_id,
        agent_output, world_state_before, world_state_after, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const step of result.steps) {
      insertStep.run(
        step.id,
        executionId,
        step.planId,
        step.action.id,
        step.stepOrder,
        step.status,
        step.retries,
        step.startedAt.toISOString(),
        step.completedAt?.toISOString() ?? null,
        step.durationMs ?? null,
        step.agentId ?? null,
        step.agentOutput ?? null,
        step.worldStateBefore ? JSON.stringify(step.worldStateBefore) : null,
        step.worldStateAfter ? JSON.stringify(step.worldStateAfter) : null,
        step.error ?? null
      );
    }
  }

  /**
   * Update action statistics after execution
   */
  private async updateActionStats(
    actionId: string,
    success: boolean,
    durationMs: number
  ): Promise<void> {
    try {
      // Delegate to planner if it has this method
      if ('updateActionStats' in this.planner) {
        await (this.planner as unknown as { updateActionStats: (id: string, success: boolean, duration: number) => Promise<void> })
          .updateActionStats(actionId, success, durationMs);
      }
    } catch (error) {
      // Non-critical - just log
      console.warn('[PlanExecutor] Failed to update action stats:', error);
    }
  }

  // ==========================================================================
  // State Helpers
  // ==========================================================================

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
   * Apply effects to create new state
   */
  private applyEffects(
    state: V3WorldState,
    effects: ActionEffects
  ): V3WorldState {
    const newState = this.cloneState(state);

    for (const [key, effect] of Object.entries(effects)) {
      this.applyEffect(newState, key, effect);
    }

    return newState;
  }

  /**
   * Apply a single effect
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
   * Protected against prototype pollution
   */
  private setStateValue(state: V3WorldState, key: string, value: unknown): void {
    const parts = key.split('.');

    // Prevent prototype pollution
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    for (const part of parts) {
      if (dangerousProps.includes(part)) {
        console.warn(`[PlanExecutor] Blocked prototype pollution attempt: ${key}`);
        return;
      }
    }

    let current: Record<string, unknown> = state as unknown as Record<
      string,
      unknown
    >;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] === undefined) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Deep clone world state
   */
  private cloneState(state: V3WorldState): V3WorldState {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Delay helper for exponential backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.currentExecution) {
      await this.cancel();
    }

    // ADR-046: Only close if NOT using unified storage (we don't own the connection)
    if (this.db) {
      if (!this.unifiedMemory) {
        this.db.close();
        console.log('[PlanExecutor] Database closed');
      } else {
        console.log('[PlanExecutor] Detached from unified storage (not closing shared connection)');
      }
    }

    this.unifiedMemory = null;
    this.initialized = false;
  }
}

// ============================================================================
// Mock Agent Spawner (for testing)
// ============================================================================

/**
 * Mock implementation of AgentSpawner for testing
 */
export class MockAgentSpawner implements AgentSpawner {
  private successRate: number;
  private executionDelay: number;

  constructor(options?: { successRate?: number; executionDelay?: number }) {
    this.successRate = options?.successRate ?? 1.0;
    this.executionDelay = options?.executionDelay ?? 100;
  }

  async spawn(agentType: string, task: string): Promise<AgentSpawnResult> {
    // Simulate execution time
    await new Promise((resolve) => setTimeout(resolve, this.executionDelay));

    const success = Math.random() < this.successRate;
    const agentId = `mock-agent-${randomUUID().slice(0, 8)}`;

    if (success) {
      return {
        agentId,
        output: `Successfully executed task for ${agentType}: ${task.slice(0, 50)}...`,
        success: true,
      };
    } else {
      return {
        agentId,
        output: '',
        success: false,
        error: `Simulated failure for ${agentType}`,
      };
    }
  }
}

// ============================================================================
// Claude Flow Agent Spawner
// ============================================================================

/**
 * AgentSpawner implementation using Claude Flow MCP tools
 *
 * This is a reference implementation - actual integration would use
 * the MCP client to call agent_spawn and execute tasks.
 */
export class ClaudeFlowSpawner implements AgentSpawner {
  private coordinator?: {
    spawn: (config: { name: string; domain: string; type: string; capabilities: string[] }) => Promise<{ success: boolean; value?: string; error?: Error }>;
    stop: (agentId: string) => Promise<void>;
  };

  constructor(coordinator?: unknown) {
    // Allow injection of coordinator for integration
    this.coordinator = coordinator as typeof this.coordinator;
  }

  async spawn(agentType: string, task: string): Promise<AgentSpawnResult> {
    const agentId = `cf-${agentType}-${randomUUID().slice(0, 8)}`;

    try {
      if (this.coordinator) {
        // Use injected coordinator
        const result = await this.coordinator.spawn({
          name: `${agentType}-executor`,
          domain: this.mapAgentTypeToDomain(agentType),
          type: agentType,
          capabilities: this.getCapabilities(agentType),
        });

        if (result.success && result.value) {
          return {
            agentId: result.value,
            output: `Executed: ${task}`,
            success: true,
          };
        } else {
          return {
            agentId,
            output: '',
            success: false,
            error: result.error?.message || 'Spawn failed',
          };
        }
      } else {
        // Fallback: simulate execution
        // In real implementation, this would call MCP tools
        return {
          agentId,
          output: `[ClaudeFlow] Would execute: ${task}`,
          success: true,
        };
      }
    } catch (error) {
      return {
        agentId,
        output: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private mapAgentTypeToDomain(agentType: string): string {
    const domainMap: Record<string, string> = {
      'qe-test-generator': 'test-generation',
      'qe-coverage-analyzer': 'coverage-analysis',
      'qe-security-scanner': 'security-compliance',
      'qe-performance-tester': 'chaos-resilience',
      'qe-quality-gate': 'quality-assessment',
      'coder': 'code-intelligence',
      'tester': 'test-generation',
      'researcher': 'learning-optimization',
    };

    return domainMap[agentType] || 'learning-optimization';
  }

  private getCapabilities(agentType: string): string[] {
    const capabilityMap: Record<string, string[]> = {
      'qe-test-generator': ['test-generation', 'code-analysis'],
      'qe-coverage-analyzer': ['coverage-analysis', 'gap-detection'],
      'qe-security-scanner': ['vulnerability-scanning', 'security-testing'],
      'qe-performance-tester': ['load-testing', 'performance-analysis'],
      'qe-quality-gate': ['quality-assessment', 'gate-evaluation'],
    };

    return capabilityMap[agentType] || ['generic-execution'];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a PlanExecutor with mock spawner for testing
 */
export function createMockExecutor(
  planner: GOAPPlanner,
  options?: {
    dbPath?: string;
    successRate?: number;
    config?: Partial<ExecutionConfig>;
  }
): PlanExecutor {
  const spawner = new MockAgentSpawner({
    successRate: options?.successRate ?? 1.0,
  });

  return new PlanExecutor(planner, spawner, options?.dbPath, options?.config);
}

/**
 * Create a PlanExecutor with Claude Flow integration
 */
export function createClaudeFlowExecutor(
  planner: GOAPPlanner,
  coordinator?: unknown,
  options?: {
    dbPath?: string;
    config?: Partial<ExecutionConfig>;
  }
): PlanExecutor {
  const spawner = new ClaudeFlowSpawner(coordinator);

  return new PlanExecutor(
    planner,
    spawner,
    options?.dbPath,
    options?.config
  );
}
