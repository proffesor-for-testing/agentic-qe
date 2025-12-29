/**
 * GOAP Task Orchestration Integration
 *
 * Integrates GOAP planning with task orchestration to replace
 * hardcoded workflow templates with dynamic plan generation.
 *
 * @module planning/integration/GOAPTaskOrchestration
 * @version 1.0.0
 */

import Database from 'better-sqlite3';
import { GOAPPlanner } from '../GOAPPlanner';
import { WorldState, DEFAULT_WORLD_STATE, GOAPAction, GOAPPlan } from '../types';
import {
  TASK_WORKFLOW_GOALS,
  TaskGoalDefinition,
  getGoalForType,
  customizeGoalConditions
} from '../goals/TaskWorkflowGoals';
import { orchestrationActions, getActionsForTaskType } from '../actions';
import { Logger } from '../../utils/Logger';
import { SecureRandom } from '../../utils/SecureRandom';

/**
 * Interface for agent registry to avoid circular dependency
 */
export interface AgentRegistryInterface {
  getSupportedMCPTypes(): string[];
  getAllAgents(): Array<{ id: string; mcpType: string; status: string }>;
  getAgentsByType(mcpType: string): Array<{ id: string; status: string }>;
}

/**
 * Orchestration context from task-orchestrate handler
 */
export interface OrchestrationContext {
  project?: string;
  branch?: string;
  environment?: 'development' | 'staging' | 'production';
  requirements?: string[];
  /** Custom thresholds */
  coverageThreshold?: number;
  securityThreshold?: number;
  performanceThreshold?: number;
  testPassingThreshold?: number;
  /** Time budget in seconds */
  timeBudgetSeconds?: number;
  /** Max agents available */
  maxAgents?: number;
}

/**
 * Task specification from task-orchestrate handler
 */
export interface TaskSpec {
  type: 'comprehensive-testing' | 'quality-gate' | 'defect-prevention' | 'performance-validation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  strategy: 'parallel' | 'sequential' | 'adaptive';
  maxAgents?: number;
  timeoutMinutes?: number;
}

/**
 * Workflow step generated from GOAP plan
 */
export interface GOAPWorkflowStep {
  id: string;
  name: string;
  type: string;
  dependencies: string[];
  estimatedDuration: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  assignedAgent?: string;
  goapActionId: string;  // Link back to GOAP action
  agentType: string;
  category: string;
  canRunParallel: boolean;
}

/**
 * Result of GOAP workflow generation
 */
export interface GOAPWorkflowResult {
  success: boolean;
  workflow: GOAPWorkflowStep[];
  planId: string;
  totalCost: number;
  estimatedDuration: number;
  goalDefinition: TaskGoalDefinition;
  alternativePaths: number;
  error?: string;
}

/**
 * GOAP Task Orchestration Integration
 */
export class GOAPTaskOrchestration {
  private planner: GOAPPlanner;
  private db: Database.Database;
  private logger: Logger;
  private initialized = false;
  private registry: AgentRegistryInterface | null = null;

  constructor(db: Database.Database, registry?: AgentRegistryInterface) {
    this.db = db;
    this.planner = new GOAPPlanner(db);
    this.logger = Logger.getInstance();
    this.registry = registry || null;
  }

  /**
   * Set or update the agent registry for fleet state population
   */
  setRegistry(registry: AgentRegistryInterface): void {
    this.registry = registry;
  }

  /**
   * Initialize the integration (create tables, register actions)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('[GOAPTaskOrchestration] Initializing...');

    // Ensure GOAP tables exist
    await this.ensureTablesExist();

    // Register orchestration actions
    await this.registerOrchestrationActions();

    this.initialized = true;
    this.logger.info('[GOAPTaskOrchestration] Initialized', {
      actionsRegistered: orchestrationActions.length
    });
  }

  /**
   * Generate a dynamic workflow for a task using GOAP planning
   */
  async generateWorkflow(
    task: TaskSpec,
    context: OrchestrationContext = {}
  ): Promise<GOAPWorkflowResult> {
    await this.initialize();

    this.logger.info('[GOAPTaskOrchestration] Generating workflow', {
      taskType: task.type,
      strategy: task.strategy,
      context
    });

    try {
      // Get and customize goal definition
      const baseGoal = getGoalForType(task.type);
      const goal = customizeGoalConditions(baseGoal, {
        coverageThreshold: context.coverageThreshold,
        securityThreshold: context.securityThreshold,
        performanceThreshold: context.performanceThreshold,
        testPassingThreshold: context.testPassingThreshold,
        requirements: context.requirements
      });

      // Build initial world state
      const worldState = this.buildWorldState(task, context);

      // Get applicable actions for this task type
      const applicableActions = getActionsForTaskType(task.type);

      // Set planner constraints
      const constraints = {
        maxIterations: 5000,
        timeoutMs: 10000,
        allowedCategories: goal.allowedCategories,
        maxPlanLength: 10
      };

      // Generate GOAP plan
      const plan = await this.planner.findPlan(
        worldState,
        goal.conditions,
        constraints
      );

      if (!plan) {
        this.logger.warn('[GOAPTaskOrchestration] No plan found', { taskType: task.type });
        return {
          success: false,
          workflow: [],
          planId: '',
          totalCost: 0,
          estimatedDuration: 0,
          goalDefinition: goal,
          alternativePaths: 0,
          error: `No viable plan found for task type: ${task.type}`
        };
      }

      // Convert GOAP plan to workflow steps
      const workflow = this.convertPlanToWorkflow(plan, task.strategy);

      // Persist plan for tracking
      const planId = await this.persistPlan(plan, task, context);

      // Find alternative paths for resilience
      const alternatives = await this.findAlternativePaths(plan, worldState, goal, constraints);

      this.logger.info('[GOAPTaskOrchestration] Workflow generated', {
        planId,
        steps: workflow.length,
        totalCost: plan.totalCost,
        alternatives: alternatives.length
      });

      return {
        success: true,
        workflow,
        planId,
        totalCost: plan.totalCost,
        estimatedDuration: plan.estimatedDuration,
        goalDefinition: goal,
        alternativePaths: alternatives.length
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('[GOAPTaskOrchestration] Workflow generation failed', { error: errorMsg });
      return {
        success: false,
        workflow: [],
        planId: '',
        totalCost: 0,
        estimatedDuration: 0,
        goalDefinition: getGoalForType(task.type),
        alternativePaths: 0,
        error: errorMsg
      };
    }
  }

  /**
   * Build initial world state from task and context
   *
   * IMPORTANT: Fleet state is populated from AgentRegistry if available.
   * This enables GOAP to make decisions based on actual agent availability.
   */
  private buildWorldState(task: TaskSpec, context: OrchestrationContext): WorldState {
    const timeBudget = context.timeBudgetSeconds || (task.timeoutMinutes || 30) * 60;
    const parallelSlots = context.maxAgents || task.maxAgents || 4;

    // Query actual fleet state from registry
    const fleetState = this.buildFleetState();

    return {
      ...DEFAULT_WORLD_STATE,
      coverage: {
        line: 0,
        branch: 0,
        function: 0,
        target: context.coverageThreshold || 80,
        measured: false
      },
      quality: {
        testsPassing: 0,
        securityScore: 0,
        performanceScore: 0,
        technicalDebt: 0,
        // Measurement flags - all false initially
        testsMeasured: false,
        integrationTested: false,
        securityMeasured: false,
        performanceMeasured: false,
        complexityMeasured: false,
        gateEvaluated: false
      },
      fleet: fleetState,
      resources: {
        timeRemaining: timeBudget,
        memoryAvailable: 2048,
        parallelSlots
      },
      context: {
        environment: context.environment || 'development',
        changeSize: 'medium',
        riskLevel: this.mapPriorityToRisk(task.priority),
        previousFailures: 0,
        impactAnalyzed: false,
        coverageGapsAnalyzed: false,
        bddGenerated: false
      }
    };
  }

  /**
   * Build fleet state from AgentRegistry
   *
   * Maps agent types to GOAP-compatible format.
   * If no registry is available, returns default agent types based on orchestration actions.
   */
  private buildFleetState(): WorldState['fleet'] {
    if (this.registry) {
      try {
        // Get actual agents from registry
        const allAgents = this.registry.getAllAgents();
        const supportedTypes = this.registry.getSupportedMCPTypes();

        // Separate available (idle) vs busy agents
        const availableAgents: string[] = [];
        const busyAgents: string[] = [];
        const agentTypes: Record<string, number> = {};

        for (const agent of allAgents) {
          if (agent.status === 'idle' || agent.status === 'available') {
            availableAgents.push(agent.mcpType);
          } else if (agent.status === 'busy' || agent.status === 'running') {
            busyAgents.push(agent.id);
          }

          // Count by type
          agentTypes[agent.mcpType] = (agentTypes[agent.mcpType] || 0) + 1;
        }

        // If no agents spawned yet, add supported types as "available"
        // This allows planning to proceed knowing agents CAN be spawned
        if (availableAgents.length === 0 && supportedTypes.length > 0) {
          // Add supported types that match our action requirements
          const actionAgentTypes = new Set(orchestrationActions.map(a => a.agentType));
          for (const type of supportedTypes) {
            if (actionAgentTypes.has(type)) {
              availableAgents.push(type);
            }
          }
        }

        this.logger.debug('[GOAPTaskOrchestration] Fleet state from registry', {
          activeAgents: allAgents.length,
          availableAgents: availableAgents.length,
          busyAgents: busyAgents.length
        });

        return {
          activeAgents: allAgents.length,
          availableAgents,
          busyAgents,
          agentTypes,
          topologyOptimized: allAgents.length > 0
        };
      } catch (error) {
        this.logger.warn('[GOAPTaskOrchestration] Failed to query registry, using defaults', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Default: assume all action agent types are available (can be spawned on demand)
    const defaultAgentTypes = [...new Set(orchestrationActions.map(a => a.agentType))];

    return {
      activeAgents: 0,
      availableAgents: defaultAgentTypes, // GOAP assumes agents can be spawned
      busyAgents: [],
      agentTypes: {},
      topologyOptimized: false
    };
  }

  /**
   * Map task priority to risk level
   */
  private mapPriorityToRisk(priority: TaskSpec['priority']): WorldState['context']['riskLevel'] {
    const mapping: Record<TaskSpec['priority'], WorldState['context']['riskLevel']> = {
      'low': 'low',
      'medium': 'medium',
      'high': 'high',
      'critical': 'critical'
    };
    return mapping[priority];
  }

  /**
   * Convert GOAP plan to workflow steps with proper dependencies
   */
  private convertPlanToWorkflow(plan: GOAPPlan, strategy: TaskSpec['strategy']): GOAPWorkflowStep[] {
    const workflow: GOAPWorkflowStep[] = [];
    const actionDependencyMap = new Map<string, string[]>();

    // Build dependency map based on preconditions and effects
    this.buildDependencyMap(plan.actions, actionDependencyMap);

    for (let i = 0; i < plan.actions.length; i++) {
      const action = plan.actions[i];
      const stepId = `${action.id}-${Date.now()}-${i}`;

      // Get dependencies based on strategy
      let dependencies: string[] = [];
      if (strategy === 'sequential') {
        // Sequential: each step depends on previous
        if (i > 0) {
          dependencies = [workflow[i - 1].id];
        }
      } else {
        // Parallel/Adaptive: use actual dependency analysis
        dependencies = this.resolveDependencies(action, workflow, actionDependencyMap);
      }

      const step: GOAPWorkflowStep = {
        id: stepId,
        name: action.name,
        type: this.getStepTypeFromAction(action),
        dependencies,
        estimatedDuration: action.durationEstimate || 300,
        status: 'pending',
        goapActionId: action.id,
        agentType: action.agentType,
        category: action.category,
        canRunParallel: dependencies.length === 0 || strategy === 'parallel'
      };

      workflow.push(step);
    }

    return workflow;
  }

  /**
   * Build dependency map based on action preconditions and effects
   */
  private buildDependencyMap(
    actions: GOAPAction[],
    dependencyMap: Map<string, string[]>
  ): void {
    for (const action of actions) {
      const deps: string[] = [];

      // Find actions whose effects satisfy this action's preconditions
      for (const [precondKey] of Object.entries(action.preconditions)) {
        for (const otherAction of actions) {
          if (otherAction.id === action.id) continue;

          for (const [effectKey, effect] of Object.entries(otherAction.effects)) {
            if (effectKey === precondKey) {
              // Check if effect sets a flag that precondition requires
              const effectObj = effect as { set?: boolean };
              if (effectObj?.set === true) {
                deps.push(otherAction.id);
                break;
              }
            }
          }
        }
      }

      dependencyMap.set(action.id, [...new Set(deps)]);
    }
  }

  /**
   * Resolve dependencies for a step based on completed workflow steps
   */
  private resolveDependencies(
    action: GOAPAction,
    currentWorkflow: GOAPWorkflowStep[],
    dependencyMap: Map<string, string[]>
  ): string[] {
    const actionDeps = dependencyMap.get(action.id) || [];
    const resolvedDeps: string[] = [];

    for (const depActionId of actionDeps) {
      // Find the workflow step that corresponds to this action
      const depStep = currentWorkflow.find(s => s.goapActionId === depActionId);
      if (depStep) {
        resolvedDeps.push(depStep.id);
      }
    }

    return resolvedDeps;
  }

  /**
   * Map GOAP action category to step type
   */
  private getStepTypeFromAction(action: GOAPAction): string {
    const typeMapping: Record<string, string> = {
      'analysis': 'analysis',
      'test': action.name.includes('Generate') ? 'test-generation' : 'test-execution',
      'coverage': 'coverage-analysis',
      'security': 'security-analysis',
      'performance': 'performance-testing',
      'process': 'decision-making',
      'fleet': 'resource-management'
    };

    return typeMapping[action.category] || action.category;
  }

  /**
   * Find alternative paths for resilience
   */
  private async findAlternativePaths(
    primaryPlan: GOAPPlan,
    worldState: WorldState,
    goal: TaskGoalDefinition,
    constraints: any
  ): Promise<GOAPPlan[]> {
    const alternatives: GOAPPlan[] = [];

    // Try to find alternatives by excluding actions one at a time
    for (const action of primaryPlan.actions) {
      // Skip measurement actions - they're usually required
      const isMeasurement = Object.entries(action.effects).some(([key, effect]) => {
        const effectObj = effect as { set?: boolean };
        return effectObj?.set === true && (
          key.includes('Measured') || key.includes('Tested') || key.includes('Evaluated')
        );
      });

      if (isMeasurement) continue;

      try {
        const altPlan = await this.planner.findPlan(worldState, goal.conditions, {
          ...constraints,
          excludedActions: [action.id]
        });

        if (altPlan && altPlan.actions.length > 0) {
          // Only add if it's actually different
          const isDifferent = altPlan.actions.some((a: GOAPAction) =>
            !primaryPlan.actions.find((pa: GOAPAction) => pa.id === a.id)
          );
          if (isDifferent) {
            alternatives.push(altPlan);
          }
        }
      } catch {
        // Ignore failures finding alternatives
      }

      // Limit alternatives
      if (alternatives.length >= 3) break;
    }

    return alternatives;
  }

  /**
   * Persist plan to database
   */
  private async persistPlan(
    plan: GOAPPlan,
    task: TaskSpec,
    context: OrchestrationContext
  ): Promise<string> {
    const planId = `orch-plan-${Date.now()}-${SecureRandom.generateId(6)}`;

    try {
      this.db.prepare(`
        INSERT INTO goap_plans (
          id, goal_id, sequence, initial_state, goal_state,
          action_sequence, total_cost, estimated_duration,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(
        planId,
        TASK_WORKFLOW_GOALS[task.type].id,
        JSON.stringify(plan.actions.map((a: GOAPAction) => a.id)),
        JSON.stringify(context),
        JSON.stringify(TASK_WORKFLOW_GOALS[task.type].conditions),
        JSON.stringify(plan.actions.map((a: GOAPAction) => ({ id: a.id, name: a.name, cost: a.cost }))),
        plan.totalCost,
        plan.estimatedDuration,
        Date.now()
      );
    } catch (error) {
      this.logger.warn('[GOAPTaskOrchestration] Failed to persist plan', { planId, error });
    }

    return planId;
  }

  /**
   * Ensure GOAP tables exist
   */
  private async ensureTablesExist(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goap_actions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        agent_type TEXT NOT NULL,
        preconditions TEXT NOT NULL,
        effects TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 1.0,
        duration_estimate INTEGER,
        success_rate REAL DEFAULT 1.0,
        execution_count INTEGER DEFAULT 0,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS goap_plans (
        id TEXT PRIMARY KEY,
        goal_id TEXT,
        sequence TEXT NOT NULL,
        initial_state TEXT,
        goal_state TEXT,
        action_sequence TEXT,
        total_cost REAL,
        estimated_duration INTEGER,
        actual_duration INTEGER,
        status TEXT DEFAULT 'pending',
        success INTEGER,
        failure_reason TEXT,
        execution_trace TEXT,
        replanned_from TEXT,
        created_at INTEGER,
        executed_at DATETIME,
        completed_at DATETIME,
        started_at DATETIME
      );
    `);
  }

  /**
   * Register orchestration actions in database
   */
  private async registerOrchestrationActions(): Promise<void> {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO goap_actions (
        id, name, description, agent_type, preconditions, effects,
        cost, duration_estimate, category, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    const insertMany = this.db.transaction((actions: GOAPAction[]) => {
      for (const action of actions) {
        insertStmt.run(
          action.id,
          action.name,
          action.description || '',
          action.agentType,
          JSON.stringify(action.preconditions),
          JSON.stringify(action.effects),
          action.cost,
          action.durationEstimate || null,
          action.category
        );
      }
    });

    insertMany(orchestrationActions);
  }

  /**
   * Close database connection
   */
  close(): void {
    // Database is managed externally, don't close here
  }
}

/**
 * Factory function to create GOAPTaskOrchestration
 */
export function createGOAPTaskOrchestration(dbPath: string): GOAPTaskOrchestration {
  const db = new (require('better-sqlite3'))(dbPath);
  return new GOAPTaskOrchestration(db);
}
