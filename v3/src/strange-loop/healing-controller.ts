/**
 * Self-Healing Controller
 * ADR-031: Strange Loop Self-Awareness
 *
 * Decides and executes healing actions based on observations and model analysis.
 * This is the "Decide" and "Act" steps in the strange loop.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SwarmHealthObservation,
  SelfHealingAction,
  SelfHealingActionType,
  ActionPriority,
  ActionResult,
  ExecutedAction,
  PredictedVulnerability,
  SwarmVulnerability,
  StrangeLoopConfig,
} from './types.js';
import { DEFAULT_STRANGE_LOOP_CONFIG } from './types.js';
import { SwarmSelfModel } from './self-model.js';

// ============================================================================
// Action Executor Interface
// ============================================================================

/**
 * Interface for executing healing actions on the swarm
 */
export interface ActionExecutor {
  /** Spawn a new agent */
  spawnAgent(agentId: string, config?: Record<string, unknown>): Promise<string>;

  /** Terminate an agent */
  terminateAgent(agentId: string): Promise<void>;

  /** Add a connection between agents */
  addConnection(sourceId: string, targetId: string): Promise<void>;

  /** Remove a connection between agents */
  removeConnection(sourceId: string, targetId: string): Promise<void>;

  /** Redistribute load from an agent */
  redistributeLoad(agentId: string): Promise<void>;

  /** Restart an agent */
  restartAgent(agentId: string): Promise<void>;

  /** Promote an agent to coordinator */
  promoteToCoordinator(agentId: string): Promise<void>;

  /** Demote a coordinator to worker */
  demoteCoordinator(agentId: string): Promise<void>;

  /** Get current swarm observation */
  observe(): Promise<SwarmHealthObservation>;
}

/**
 * Default no-op action executor for testing
 */
export class NoOpActionExecutor implements ActionExecutor {
  private mockObservation: SwarmHealthObservation | null = null;

  async spawnAgent(agentId: string): Promise<string> {
    return `${agentId}-spawned-${Date.now()}`;
  }

  async terminateAgent(): Promise<void> {
    // No-op
  }

  async addConnection(): Promise<void> {
    // No-op
  }

  async removeConnection(): Promise<void> {
    // No-op
  }

  async redistributeLoad(): Promise<void> {
    // No-op
  }

  async restartAgent(): Promise<void> {
    // No-op
  }

  async promoteToCoordinator(): Promise<void> {
    // No-op
  }

  async demoteCoordinator(): Promise<void> {
    // No-op
  }

  async observe(): Promise<SwarmHealthObservation> {
    if (!this.mockObservation) {
      throw new Error('No mock observation set');
    }
    return this.mockObservation;
  }

  setMockObservation(observation: SwarmHealthObservation): void {
    this.mockObservation = observation;
  }
}

// ============================================================================
// Self-Healing Controller
// ============================================================================

/**
 * Controls the self-healing process by deciding and executing actions
 */
export class SelfHealingController {
  private model: SwarmSelfModel;
  private executor: ActionExecutor;
  private config: StrangeLoopConfig;
  private actionHistory: ExecutedAction[] = [];
  private lastActionTime: number = 0;
  private pendingActions: SelfHealingAction[] = [];

  constructor(
    model: SwarmSelfModel,
    executor: ActionExecutor,
    config: Partial<StrangeLoopConfig> = {}
  ) {
    this.model = model;
    this.executor = executor;
    this.config = { ...DEFAULT_STRANGE_LOOP_CONFIG, ...config };
  }

  /**
   * Decide what healing actions to take based on observation
   */
  async decide(observation: SwarmHealthObservation): Promise<SelfHealingAction[]> {
    const actions: SelfHealingAction[] = [];

    // 1. Check for critical vulnerabilities first
    for (const vulnerability of observation.vulnerabilities) {
      const action = this.mapVulnerabilityToAction(vulnerability);
      if (action) {
        actions.push(action);
      }
    }

    // 2. Check bottleneck analysis from model
    const bottleneckAnalysis = this.model.findBottlenecks();
    for (const bottleneck of bottleneckAnalysis.bottlenecks) {
      if (bottleneck.criticality > 0.8) {
        actions.push({
          id: uuidv4(),
          type: 'spawn_redundant_agent',
          targetAgentId: bottleneck.agentId,
          priority: 'critical',
          estimatedImpact: 0.9,
          reversible: true,
          reason: `Critical bottleneck: ${bottleneck.agentId} affects ${bottleneck.affectedAgents.length} agents`,
          createdAt: Date.now(),
        });
      } else if (bottleneck.criticality > 0.5) {
        actions.push({
          id: uuidv4(),
          type: 'add_connection',
          targetAgentId: bottleneck.agentId,
          priority: 'high',
          estimatedImpact: 0.6,
          reversible: true,
          reason: `Bottleneck detected: ${bottleneck.agentId} (criticality: ${bottleneck.criticality.toFixed(2)})`,
          createdAt: Date.now(),
        });
      }
    }

    // 3. Check for predicted vulnerabilities if enabled
    if (this.config.predictiveHealingEnabled) {
      const predictions = this.model.predictVulnerabilities();
      for (const prediction of predictions) {
        if (prediction.probability > this.config.predictionThreshold) {
          const action = this.mapPredictionToAction(prediction);
          if (action) {
            actions.push(action);
          }
        }
      }
    }

    // 4. Check for overloaded agents
    for (const [agentId, health] of observation.agentHealth) {
      if (health.memoryUtilization > 0.9) {
        actions.push({
          id: uuidv4(),
          type: 'redistribute_load',
          targetAgentId: agentId,
          priority: 'high',
          estimatedImpact: 0.5,
          reversible: true,
          reason: `Agent ${agentId} memory critical: ${(health.memoryUtilization * 100).toFixed(0)}%`,
          createdAt: Date.now(),
        });
      }

      if (health.responsiveness < 0.3) {
        actions.push({
          id: uuidv4(),
          type: 'restart_agent',
          targetAgentId: agentId,
          priority: 'critical',
          estimatedImpact: 0.7,
          reversible: false,
          reason: `Agent ${agentId} unresponsive: ${(health.responsiveness * 100).toFixed(0)}%`,
          createdAt: Date.now(),
        });
      }
    }

    // 5. Deduplicate and prioritize
    const uniqueActions = this.deduplicateActions(actions);
    const prioritizedActions = this.prioritizeActions(uniqueActions);

    // 6. Limit to max actions per cycle
    return prioritizedActions.slice(0, this.config.maxActionsPerCycle);
  }

  /**
   * Execute a healing action
   */
  async act(action: SelfHealingAction): Promise<ActionResult> {
    const startTime = Date.now();

    // Check cooldown
    if (startTime - this.lastActionTime < this.config.actionCooldownMs) {
      return {
        action,
        success: false,
        message: 'Action skipped due to cooldown',
        durationMs: 0,
        error: 'cooldown',
        executedAt: startTime,
      };
    }

    let result: ActionResult;

    try {
      switch (action.type) {
        case 'spawn_redundant_agent':
          result = await this.executeSpawnRedundantAgent(action);
          break;

        case 'add_connection':
          result = await this.executeAddConnection(action);
          break;

        case 'remove_connection':
          result = await this.executeRemoveConnection(action);
          break;

        case 'redistribute_load':
          result = await this.executeRedistributeLoad(action);
          break;

        case 'restart_agent':
          result = await this.executeRestartAgent(action);
          break;

        case 'isolate_agent':
          result = await this.executeIsolateAgent(action);
          break;

        case 'promote_to_coordinator':
          result = await this.executePromoteToCoordinator(action);
          break;

        case 'demote_coordinator':
          result = await this.executeDemoteCoordinator(action);
          break;

        case 'trigger_failover':
          result = await this.executeTriggerFailover(action);
          break;

        case 'scale_up':
          result = await this.executeScaleUp(action);
          break;

        case 'scale_down':
          result = await this.executeScaleDown(action);
          break;

        case 'rebalance_topology':
          result = await this.executeRebalanceTopology(action);
          break;

        // ADR-056: Infrastructure actions — delegated to executor.
        // When wired via createStrangeLoopWithInfraHealing(), the executor
        // is CompositeActionExecutor which routes to InfraActionExecutor.
        case 'restart_service': {
          const infraStartTime = Date.now();
          try {
            await this.executor.restartAgent(action.targetAgentId ?? '');
            result = {
              action,
              success: true,
              message: `Infrastructure action '${action.type}' delegated to executor`,
              durationMs: Date.now() - infraStartTime,
              executedAt: infraStartTime,
            };
          } catch (infraError) {
            result = {
              action,
              success: false,
              message: `Infrastructure action failed: ${infraError instanceof Error ? infraError.message : 'Unknown'}`,
              durationMs: Date.now() - infraStartTime,
              error: infraError instanceof Error ? infraError.message : 'unknown',
              executedAt: infraStartTime,
            };
          }
          break;
        }

        default:
          result = {
            action,
            success: false,
            message: `Unknown action type: ${action.type}`,
            durationMs: Date.now() - startTime,
            error: 'unknown_action_type',
            executedAt: startTime,
          };
      }

      // Update last action time on successful execution
      if (result.success) {
        this.lastActionTime = Date.now();
      }
    } catch (error) {
      result = {
        action,
        success: false,
        message: `Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'unknown',
        executedAt: startTime,
      };
    }

    // Record in history
    this.actionHistory.push({
      action,
      result,
      healthImproved: false, // Will be updated by orchestrator
      healthDelta: 0,
    });

    return result;
  }

  /**
   * Get action history
   */
  getActionHistory(): readonly ExecutedAction[] {
    return this.actionHistory;
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory = [];
  }

  /**
   * Update the health delta for the last action
   */
  updateLastActionHealthDelta(healthDelta: number): void {
    if (this.actionHistory.length > 0) {
      const lastAction = this.actionHistory[this.actionHistory.length - 1];
      lastAction.healthDelta = healthDelta;
      lastAction.healthImproved = healthDelta > 0;
    }
  }

  // ============================================================================
  // Action Execution Implementations
  // ============================================================================

  private async executeSpawnRedundantAgent(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    const newAgentId = await this.executor.spawnAgent(
      `${targetId}-redundant`,
      { cloneFrom: targetId }
    );

    // Add connection between new agent and target
    await this.executor.addConnection(newAgentId, targetId);

    return {
      action,
      success: true,
      message: `Spawned redundant agent ${newAgentId} to backup ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeAddConnection(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;
    const secondaryId = action.secondaryTargetId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    // If no secondary target, we'll connect to a nearby agent
    // For now, this is handled by the executor
    if (secondaryId) {
      await this.executor.addConnection(targetId, secondaryId);
    } else {
      // Connect to a high-degree node (simplified)
      await this.executor.addConnection(targetId, 'coordinator-0');
    }

    return {
      action,
      success: true,
      message: `Added connection for ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeRemoveConnection(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;
    const secondaryId = action.secondaryTargetId;

    if (!targetId || !secondaryId) {
      return {
        action,
        success: false,
        message: 'Both source and target agent IDs required',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.removeConnection(targetId, secondaryId);

    return {
      action,
      success: true,
      message: `Removed connection between ${targetId} and ${secondaryId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeRedistributeLoad(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.redistributeLoad(targetId);

    return {
      action,
      success: true,
      message: `Redistributed load from ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeRestartAgent(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.restartAgent(targetId);

    return {
      action,
      success: true,
      message: `Restarted agent ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeIsolateAgent(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    // Isolate by terminating
    await this.executor.terminateAgent(targetId);

    return {
      action,
      success: true,
      message: `Isolated agent ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executePromoteToCoordinator(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.promoteToCoordinator(targetId);

    return {
      action,
      success: true,
      message: `Promoted ${targetId} to coordinator`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeDemoteCoordinator(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.demoteCoordinator(targetId);

    return {
      action,
      success: true,
      message: `Demoted coordinator ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeTriggerFailover(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    // Spawn replacement before terminating
    const newAgentId = await this.executor.spawnAgent(`${targetId}-failover`);
    await this.executor.terminateAgent(targetId);

    return {
      action,
      success: true,
      message: `Triggered failover: ${targetId} -> ${newAgentId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeScaleUp(action: SelfHealingAction): Promise<ActionResult> {
    const startTime = Date.now();

    // Spawn a new worker agent
    const newAgentId = await this.executor.spawnAgent(`worker-${Date.now()}`);

    return {
      action,
      success: true,
      message: `Scaled up: spawned ${newAgentId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeScaleDown(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();
    const targetId = action.targetAgentId;

    if (!targetId) {
      return {
        action,
        success: false,
        message: 'No target agent ID specified for scale down',
        durationMs: Date.now() - startTime,
        error: 'missing_target',
        executedAt: startTime,
      };
    }

    await this.executor.terminateAgent(targetId);

    return {
      action,
      success: true,
      message: `Scaled down: terminated ${targetId}`,
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  private async executeRebalanceTopology(
    action: SelfHealingAction
  ): Promise<ActionResult> {
    const startTime = Date.now();

    // This would involve complex topology restructuring
    // For now, just redistribute load across all agents
    await this.executor.redistributeLoad('*');

    return {
      action,
      success: true,
      message: 'Rebalanced topology',
      durationMs: Date.now() - startTime,
      executedAt: startTime,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Map a vulnerability to a healing action
   */
  private mapVulnerabilityToAction(
    vulnerability: SwarmVulnerability
  ): SelfHealingAction | null {
    const typeToAction: Record<SwarmVulnerability['type'], SelfHealingActionType | null> = {
      bottleneck: 'spawn_redundant_agent',
      isolated_agent: 'add_connection',
      overloaded_agent: 'redistribute_load',
      single_point_of_failure: 'spawn_redundant_agent',
      network_partition: 'add_connection',
      degraded_connectivity: 'add_connection',
      // ADR-056: Infrastructure vulnerabilities — routed through CompositeActionExecutor
      // to InfraActionExecutor for playbook-driven recovery
      db_connection_failure: 'restart_service',
      service_unreachable: 'restart_service',
      dns_resolution_failure: 'restart_service',
      port_bind_failure: 'restart_service',
      out_of_memory: 'restart_service',
      disk_full: 'restart_service',
      certificate_expired: 'restart_service',
      infra_timeout: 'restart_service',
    };

    let actionType = typeToAction[vulnerability.type];
    if (!actionType) return null;

    const targetAgentId = vulnerability.affectedAgents[0];

    // ADR-056: Synthetic infra agents don't participate in swarm topology.
    // Only fire restart_service when the agent is actually degraded.
    if (targetAgentId?.startsWith('infra-') && actionType !== 'restart_service') {
      if (vulnerability.type === 'single_point_of_failure') {
        // Agent responsiveness dropped — override to restart_service
        // so CompositeActionExecutor routes to InfraActionExecutor
        actionType = 'restart_service';
      } else {
        // Suppress topology actions (isolated_agent, bottleneck, etc.)
        // for infra agents — they don't have real swarm connections
        return null;
      }
    }

    const priority = this.severityToPriority(vulnerability.severity);

    return {
      id: uuidv4(),
      type: actionType,
      targetAgentId,
      priority,
      estimatedImpact: vulnerability.severity,
      reversible: true,
      reason: vulnerability.description,
      triggeringVulnerability: vulnerability,
      createdAt: Date.now(),
    };
  }

  /**
   * Map a prediction to a healing action
   */
  private mapPredictionToAction(
    prediction: PredictedVulnerability
  ): SelfHealingAction | null {
    const typeToAction: Record<PredictedVulnerability['type'], SelfHealingActionType> = {
      connectivity_degradation: 'add_connection',
      agent_degradation: 'spawn_redundant_agent',
      overload_imminent: 'redistribute_load',
      partition_risk: 'add_connection',
    };

    const actionType = typeToAction[prediction.type];

    return {
      id: uuidv4(),
      type: actionType,
      targetAgentId: prediction.agentId,
      priority: this.probabilityToPriority(prediction.probability),
      estimatedImpact: prediction.probability * 0.8,
      reversible: true,
      reason: `Predicted ${prediction.type}: ${(prediction.probability * 100).toFixed(0)}% probability`,
      createdAt: Date.now(),
    };
  }

  /**
   * Convert severity to priority
   */
  private severityToPriority(severity: number): ActionPriority {
    if (severity >= 0.9) return 'critical';
    if (severity >= 0.7) return 'high';
    if (severity >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Convert probability to priority
   */
  private probabilityToPriority(probability: number): ActionPriority {
    if (probability >= 0.9) return 'high';
    if (probability >= 0.7) return 'medium';
    return 'low';
  }

  /**
   * Deduplicate actions (same type + target)
   */
  private deduplicateActions(actions: SelfHealingAction[]): SelfHealingAction[] {
    const seen = new Map<string, SelfHealingAction>();

    for (const action of actions) {
      const key = `${action.type}:${action.targetAgentId || 'global'}`;
      const existing = seen.get(key);

      // Keep the higher priority action
      if (!existing || this.comparePriority(action.priority, existing.priority) > 0) {
        seen.set(key, action);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Prioritize actions by priority and estimated impact
   */
  private prioritizeActions(actions: SelfHealingAction[]): SelfHealingAction[] {
    return actions.sort((a, b) => {
      // First by priority
      const priorityDiff = this.comparePriority(b.priority, a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by estimated impact
      return b.estimatedImpact - a.estimatedImpact;
    });
  }

  /**
   * Compare priorities (higher value = higher priority)
   */
  private comparePriority(a: ActionPriority, b: ActionPriority): number {
    const priorityOrder: Record<ActionPriority, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    return priorityOrder[a] - priorityOrder[b];
  }
}

/**
 * Create a self-healing controller
 */
export function createSelfHealingController(
  model: SwarmSelfModel,
  executor: ActionExecutor,
  config?: Partial<StrangeLoopConfig>
): SelfHealingController {
  return new SelfHealingController(model, executor, config);
}
