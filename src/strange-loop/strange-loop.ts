/**
 * Strange Loop Orchestrator
 * ADR-031: Strange Loop Self-Awareness
 * ADR-052: Coherence Integration
 *
 * Orchestrates the complete self-awareness cycle:
 * Observe -> Model -> Decide -> Act -> (repeat)
 *
 * With ADR-052 coherence integration, the cycle becomes:
 * Observe -> Check Coherence -> Model -> Decide -> Act -> (repeat)
 *
 * "You look in a mirror. You see yourself looking.
 *  You adjust your hair *because* you saw it was messy.
 *  The act of observing changed what you observed."
 */

import { v4 as uuidv4 } from 'uuid';
import { LoggerFactory } from '../logging/index.js';
import type { Logger } from '../logging/index.js';
import type {
  SwarmHealthObservation,
  SelfHealingAction,
  ActionResult,
  SelfDiagnosis,
  StrangeLoopConfig,
  StrangeLoopStats,
  StrangeLoopEvent,
  StrangeLoopEventType,
  StrangeLoopEventListener,
  SwarmModelDelta,
  TrendDirection,
  AgentHealthMetrics,
  Contradiction,
  ComputeLane,
  CoherenceViolationData,
  CollapsePredictedData,
  BeliefReconciledData,
  CoherenceRestoredData,
  CoherenceState,
} from './types.js';
import { DEFAULT_STRANGE_LOOP_CONFIG } from './types.js';
import { SwarmObserver, AgentProvider, InMemoryAgentProvider } from './swarm-observer.js';
import { SwarmSelfModel } from './self-model.js';
import { SelfHealingController, ActionExecutor, NoOpActionExecutor } from './healing-controller.js';
import type { CommandRunner, InfraHealingConfig } from './infra-healing/types.js';
import type { InfraErrorSignature } from './infra-healing/types.js';
import { createInfraHealingOrchestratorSync, InfraHealingOrchestrator } from './infra-healing/infra-healing-orchestrator.js';
import { createInfraAwareAgentProvider } from './infra-healing/infra-aware-agent-provider.js';
import { createCompositeActionExecutor } from './infra-healing/composite-action-executor.js';
import type {
  ICoherenceService,
  CoherenceNode,
  CoherenceResult,
  CollapseRisk,
  SwarmState,
  Contradiction as CoherenceContradiction,
} from '../integrations/coherence/index.js';

// ============================================================================
// Belief Reconciler Interface
// ============================================================================

/**
 * Interface for reconciling contradicting beliefs across agents.
 * Implementations should resolve conflicts detected by the CoherenceService.
 */
export interface IBeliefReconciler {
  /**
   * Reconcile contradicting beliefs.
   * @param contradictions - Array of contradictions to resolve
   * @returns Result of reconciliation attempt
   */
  reconcile(contradictions: Contradiction[]): Promise<BeliefReconciliationResult>;
}

/**
 * Result of a belief reconciliation attempt
 */
export interface BeliefReconciliationResult {
  /** Number of contradictions successfully resolved */
  resolvedCount: number;
  /** Number of contradictions that could not be resolved */
  unresolvedCount: number;
  /** IDs of resolved contradictions (joined nodeIds) */
  resolvedContradictionIds: string[];
  /** Actions taken during reconciliation */
  actionsTaken: string[];
}

// ============================================================================
// Strange Loop Orchestrator
// ============================================================================

/**
 * Orchestrates the strange loop self-awareness cycle
 *
 * With ADR-052 coherence integration, the orchestrator can optionally:
 * - Check swarm coherence after each observation
 * - Emit coherence_violation events when beliefs are incoherent
 * - Trigger belief reconciliation when contradictions are detected
 * - Predict swarm collapse using spectral analysis
 */
const logger: Logger = LoggerFactory.create('StrangeLoop');

export class StrangeLoopOrchestrator {
  private observer: SwarmObserver;
  private model: SwarmSelfModel;
  private healer: SelfHealingController;
  private config: StrangeLoopConfig;

  // ADR-052: Optional coherence integration
  private coherenceService: ICoherenceService | null = null;
  private beliefReconciler: IBeliefReconciler | null = null;
  private lastCoherenceEnergy: number = 0;
  private incoherentSince: number | null = null;

  private running: boolean = false;
  private loopHandle: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private stats: StrangeLoopStats;
  private eventListeners: Map<StrangeLoopEventType, StrangeLoopEventListener[]> = new Map();
  private myAgentId: string;

  /**
   * Create a new StrangeLoopOrchestrator.
   *
   * @param provider - Agent provider for observing swarm state
   * @param executor - Action executor for healing actions
   * @param config - Optional configuration overrides
   * @param coherenceService - Optional CoherenceService for belief coherence checking (ADR-052)
   * @param beliefReconciler - Optional belief reconciler for resolving contradictions (ADR-052)
   */
  constructor(
    provider: AgentProvider,
    executor: ActionExecutor,
    config: Partial<StrangeLoopConfig> = {},
    coherenceService?: ICoherenceService,
    beliefReconciler?: IBeliefReconciler
  ) {
    this.config = { ...DEFAULT_STRANGE_LOOP_CONFIG, ...config };
    this.myAgentId = provider.getObserverId();

    this.observer = new SwarmObserver(provider);
    this.model = new SwarmSelfModel(this.config.historySize);
    this.healer = new SelfHealingController(this.model, executor, this.config);

    // ADR-052: Store optional coherence dependencies
    this.coherenceService = coherenceService ?? null;
    this.beliefReconciler = beliefReconciler ?? null;

    this.stats = this.initializeStats();
  }

  /**
   * Set the coherence service for belief coherence checking.
   * Can be called after construction to enable coherence integration.
   *
   * @param service - The CoherenceService instance
   */
  setCoherenceService(service: ICoherenceService): void {
    this.coherenceService = service;
    if (this.config.verboseLogging) {
      logger.info('Coherence service attached');
    }
  }

  /**
   * Set the belief reconciler for resolving contradictions.
   * Can be called after construction to enable reconciliation.
   *
   * @param reconciler - The belief reconciler instance
   */
  setBeliefReconciler(reconciler: IBeliefReconciler): void {
    this.beliefReconciler = reconciler;
    if (this.config.verboseLogging) {
      logger.info('Belief reconciler attached');
    }
  }

  /**
   * Check if coherence service is available.
   */
  hasCoherenceService(): boolean {
    return this.coherenceService !== null;
  }

  /**
   * Check if belief reconciler is available.
   */
  hasBeliefReconciler(): boolean {
    return this.beliefReconciler !== null;
  }

  /**
   * Start the strange loop
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.startTime = Date.now();

    this.emit('loop_started', { config: this.config });

    if (this.config.verboseLogging) {
      logger.info('Starting self-observation cycle');
    }

    // Run first cycle immediately
    await this.runCycle();

    // Schedule subsequent cycles
    this.loopHandle = setInterval(
      () => this.runCycle(),
      this.config.observationIntervalMs
    );
  }

  /**
   * Stop the strange loop
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.loopHandle) {
      clearInterval(this.loopHandle);
      this.loopHandle = null;
    }

    this.emit('loop_stopped', { stats: this.getStats() });

    if (this.config.verboseLogging) {
      logger.info('Stopped self-observation cycle');
    }
  }

  /**
   * Check if the loop is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a single observation-model-decide-act cycle
   *
   * With ADR-052 coherence integration, the cycle becomes:
   * 1. OBSERVE: Gather swarm state
   * 2. CHECK COHERENCE: Verify belief consistency (if service available)
   * 3. MODEL: Update internal representation
   * 4. DECIDE: Determine if healing is needed
   * 5. ACT: Execute healing actions
   */
  async runCycle(): Promise<{
    observation: SwarmHealthObservation;
    delta: SwarmModelDelta;
    actions: SelfHealingAction[];
    results: ActionResult[];
    coherenceResult?: CoherenceResult;
  }> {
    const cycleStart = Date.now();

    try {
      // OBSERVE: Gather swarm state
      const observation = await this.observer.observe();
      const observationDuration = Date.now() - cycleStart;

      this.stats.totalObservations++;
      this.stats.avgObservationDurationMs =
        (this.stats.avgObservationDurationMs * (this.stats.totalObservations - 1) +
          observationDuration) /
        this.stats.totalObservations;
      this.stats.lastObservationAt = observation.timestamp;
      this.stats.currentHealth = observation.overallHealth;

      this.emit('observation_complete', { observation, durationMs: observationDuration });

      // ADR-052: CHECK COHERENCE after observation
      let coherenceResult: CoherenceResult | undefined;
      if (this.coherenceService) {
        coherenceResult = await this.checkCoherenceAfterObservation(observation);
      }

      // MODEL: Update internal representation
      const delta = this.model.updateModel(observation);

      // Emit events for vulnerabilities
      for (const vuln of delta.newVulnerabilities) {
        this.stats.vulnerabilitiesDetected++;
        this.emit('vulnerability_detected', { vulnerability: vuln });
      }

      for (const vuln of delta.resolvedVulnerabilities) {
        this.stats.vulnerabilitiesResolved++;
        this.emit('vulnerability_resolved', { vulnerability: vuln });
      }

      // Track health changes
      const previousHealth = this.stats.currentHealth;
      this.stats.currentHealth = observation.overallHealth;
      this.stats.healthTrend = this.model.getHealthTrend();

      if (observation.overallHealth < previousHealth - 0.1) {
        this.emit('health_degraded', {
          previousHealth,
          currentHealth: observation.overallHealth,
        });
      } else if (observation.overallHealth > previousHealth + 0.1) {
        this.emit('health_improved', {
          previousHealth,
          currentHealth: observation.overallHealth,
        });
      }

      // DECIDE: Determine if healing is needed
      const actions = await this.healer.decide(observation);
      const results: ActionResult[] = [];

      if (actions.length > 0) {
        if (this.config.verboseLogging) {
          logger.info('Detected healing opportunities', { count: actions.length });
        }

        // ACT: Execute healing actions
        for (const action of actions) {
          if (action.priority === 'critical' || action.priority === 'high') {
            this.emit('healing_action_started', { action });

            const result = await this.healer.act(action);
            results.push(result);

            this.stats.totalActionsExecuted++;
            if (result.success) {
              this.stats.successfulActions++;
              this.emit('healing_action_completed', { action, result });
            } else {
              this.stats.failedActions++;
              this.emit('healing_action_failed', { action, result });
            }

            this.stats.avgActionDurationMs =
              (this.stats.avgActionDurationMs * (this.stats.totalActionsExecuted - 1) +
                result.durationMs) /
              this.stats.totalActionsExecuted;

            if (this.config.verboseLogging) {
              logger.info('Executed healing action', { type: action.type, message: result.message });
            }
          }
        }
      }

      // Track predictions
      const predictions = this.model.predictVulnerabilities();
      for (const prediction of predictions) {
        if (prediction.probability > this.config.predictionThreshold) {
          this.stats.predictionsMade++;
          this.emit('prediction_made', { prediction });
        }
      }

      return { observation, delta, actions, results, coherenceResult };
    } catch (error) {
      if (this.config.verboseLogging) {
        logger.error('Error in self-observation cycle', error instanceof Error ? error : undefined);
      }
      throw error;
    }
  }

  /**
   * The agent observes itself being the bottleneck.
   * With ADR-052 coherence integration, also checks belief coherence.
   */
  async selfDiagnose(): Promise<SelfDiagnosis> {
    const observation = await this.observer.observe();
    const myId = this.myAgentId;

    const myHealth = observation.agentHealth.get(myId);
    const amIBottleneck = observation.connectivity.bottlenecks.includes(myId);

    const recommendations: string[] = [];
    if (amIBottleneck) {
      recommendations.push('Request backup agent');
      recommendations.push('Reduce task queue');
      recommendations.push('Offload connections');
    }

    if (myHealth) {
      if (myHealth.memoryUtilization > 0.8) {
        recommendations.push('Clear caches');
        recommendations.push('Reduce memory usage');
      }
      if (myHealth.queuedTasks > 10) {
        recommendations.push('Redistribute queued tasks');
      }
    }

    // Build base diagnosis
    const diagnosis: SelfDiagnosis = {
      agentId: myId,
      isHealthy: myHealth ? myHealth.responsiveness > 0.8 : true,
      isBottleneck: amIBottleneck,
      metrics: myHealth || this.getDefaultHealthMetrics(),
      recommendations,
      overallSwarmHealth: observation.overallHealth,
      diagnosedAt: Date.now(),
    };

    // ADR-052: Add coherence information if service is available and enabled
    if (this.coherenceService && this.config.coherenceEnabled) {
      try {
        // Convert agent health to coherence nodes
        const coherenceNodes: CoherenceNode[] = [];
        for (const [agentId, metrics] of observation.agentHealth) {
          const embedding = [
            metrics.responsiveness,
            metrics.taskCompletionRate,
            metrics.memoryUtilization,
            metrics.cpuUtilization,
            metrics.errorRate,
            metrics.degree / 10,
            metrics.queuedTasks / 100,
            metrics.isBottleneck ? 1.0 : 0.0,
          ];
          coherenceNodes.push({
            id: agentId,
            embedding,
            weight: metrics.responsiveness,
          });
        }

        const coherenceResult = await this.coherenceService.checkCoherence(coherenceNodes);

        diagnosis.coherenceEnergy = coherenceResult.energy;
        diagnosis.isCoherent = coherenceResult.isCoherent;
        diagnosis.computeLane = coherenceResult.lane as ComputeLane;
        diagnosis.contradictionCount = coherenceResult.contradictions?.length ?? 0;

        // Add coherence-based recommendations
        if (!coherenceResult.isCoherent) {
          recommendations.push('Resolve belief contradictions before proceeding');
          if (coherenceResult.lane === 'human') {
            recommendations.push('Escalate to human review due to high coherence energy');
          }
        }

        // Check for collapse risk if available
        if (this.coherenceService.predictCollapse) {
          const swarmState: SwarmState = {
            agents: Array.from(observation.agentHealth.entries()).map(([agentId, metrics]) => ({
              agentId,
              agentType: 'specialist',
              health: metrics.responsiveness,
              beliefs: [],
              lastActivity: new Date(metrics.lastHeartbeat),
              errorCount: Math.round(metrics.errorRate * 100),
              successRate: metrics.taskCompletionRate,
            })),
            activeTasks: Array.from(observation.agentHealth.values()).reduce(
              (sum, m) => sum + m.queuedTasks,
              0
            ),
            pendingTasks: 0,
            errorRate: observation.overallHealth < 0.5 ? 0.5 - observation.overallHealth : 0,
            utilization:
              Array.from(observation.agentHealth.values()).reduce(
                (sum, m) => sum + m.cpuUtilization,
                0
              ) / observation.agentHealth.size || 0,
            timestamp: new Date(observation.timestamp),
          };

          const collapseRisk = await this.coherenceService.predictCollapse(swarmState);
          if (collapseRisk && collapseRisk.collapseImminent) {
            diagnosis.collapseRiskPredicted = true;
            recommendations.push('WARNING: Swarm collapse predicted. Take immediate action.');
            for (const rec of collapseRisk.recommendations || []) {
              recommendations.push(rec);
            }
          } else {
            diagnosis.collapseRiskPredicted = false;
          }
        }
      } catch (error) {
        if (this.config.verboseLogging) {
          logger.error('Coherence check failed during self-diagnosis', error instanceof Error ? error : undefined);
        }
        // Continue with diagnosis even if coherence check fails
      }
    }

    return diagnosis;
  }

  /**
   * Trigger an immediate observation
   */
  async triggerObservation(): Promise<SwarmHealthObservation> {
    return this.observer.observe();
  }

  /**
   * Get current statistics
   */
  getStats(): StrangeLoopStats {
    return {
      ...this.stats,
      uptimeMs: this.running ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Get the current model state
   */
  getModelState() {
    return this.model.getCurrentState();
  }

  /**
   * Get observation history
   */
  getObservationHistory() {
    return this.model.getHistory();
  }

  /**
   * Get action history
   */
  getActionHistory() {
    return this.healer.getActionHistory();
  }

  /**
   * Register an event listener
   */
  on(eventType: StrangeLoopEventType, listener: StrangeLoopEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(listener);
  }

  /**
   * Remove an event listener
   */
  off(eventType: StrangeLoopEventType, listener: StrangeLoopEventListener): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.model.clear();
    this.healer.clearHistory();
    this.stats = this.initializeStats();
  }

  // ============================================================================
  // ADR-062: Loop Detection Integration
  // ============================================================================

  /**
   * Handle a loop.detected event by triggering the Observe-Model-Decide-Act cycle.
   *
   * When a tool call loop is detected, this method emits a `loop_detected` event
   * and can trigger appropriate healing actions (steering the agent away from the loop).
   *
   * @param loopData - The loop detection result data
   */
  handleLoopDetected(loopData: {
    agentId: string;
    toolName: string;
    callCount: number;
    steeringMessage?: string;
  }): void {
    this.emit('loop_detected', {
      agentId: loopData.agentId,
      toolName: loopData.toolName,
      callCount: loopData.callCount,
      steeringMessage: loopData.steeringMessage,
      timestamp: Date.now(),
    });

    if (this.config.verboseLogging) {
      logger.info('Loop detected', {
        agentId: loopData.agentId,
        toolName: loopData.toolName,
        callCount: loopData.callCount,
      });
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Emit an event to listeners
   */
  private emit(type: StrangeLoopEventType, data: unknown): void {
    const event: StrangeLoopEvent = {
      type,
      timestamp: Date.now(),
      data,
      observerId: this.myAgentId,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          if (this.config.verboseLogging) {
            logger.error('Event listener error', error instanceof Error ? error : undefined);
          }
        }
      }
    }
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): StrangeLoopStats {
    return {
      totalObservations: 0,
      totalActionsExecuted: 0,
      successfulActions: 0,
      failedActions: 0,
      avgObservationDurationMs: 0,
      avgActionDurationMs: 0,
      vulnerabilitiesDetected: 0,
      vulnerabilitiesResolved: 0,
      predictionsMade: 0,
      accuratePredictions: 0,
      currentHealth: 1.0,
      healthTrend: 'stable',
      uptimeMs: 0,
      lastObservationAt: 0,

      // Coherence metrics (ADR-052)
      coherenceViolationCount: 0,
      avgCoherenceEnergy: 0,
      reconciliationSuccessRate: 1.0, // Start at 100% (no failures yet)
      lastCoherenceCheck: 0,
      collapseRiskHistory: [],
      currentCoherenceState: 'coherent' as CoherenceState,
      consensusVerifications: 0,
      invalidConsensusCount: 0,
    };
  }

  /**
   * Get default health metrics
   */
  private getDefaultHealthMetrics(): AgentHealthMetrics {
    return {
      responsiveness: 1.0,
      taskCompletionRate: 1.0,
      memoryUtilization: 0.3,
      cpuUtilization: 0.3,
      activeConnections: 0,
      isBottleneck: false,
      degree: 0,
      queuedTasks: 0,
      lastHeartbeat: Date.now(),
      errorRate: 0,
    };
  }

  // ============================================================================
  // ADR-052: Coherence Integration Methods
  // ============================================================================

  /**
   * Check coherence after an observation and update stats accordingly.
   * This method is called after each observation when a coherence service is available.
   *
   * @param observation - The swarm health observation to check coherence against
   * @returns The coherence result from the service
   */
  private async checkCoherenceAfterObservation(
    observation: SwarmHealthObservation
  ): Promise<CoherenceResult | undefined> {
    if (!this.coherenceService || !this.config.coherenceEnabled) {
      return undefined;
    }

    try {
      // Convert SwarmHealthObservation to CoherenceNode array for coherence service
      // Each agent's health metrics are encoded as a simple embedding for coherence checking
      const coherenceNodes: CoherenceNode[] = [];
      for (const [agentId, metrics] of observation.agentHealth) {
        // Create a simple embedding from health metrics
        // This allows coherence checking to detect agents with conflicting states
        const embedding = [
          metrics.responsiveness,
          metrics.taskCompletionRate,
          metrics.memoryUtilization,
          metrics.cpuUtilization,
          metrics.errorRate,
          metrics.degree / 10, // Normalize degree
          metrics.queuedTasks / 100, // Normalize queue
          metrics.isBottleneck ? 1.0 : 0.0,
        ];

        coherenceNodes.push({
          id: agentId,
          embedding,
          weight: metrics.responsiveness, // Weight by responsiveness
          metadata: {
            lastHeartbeat: metrics.lastHeartbeat,
            activeConnections: metrics.activeConnections,
          },
        });
      }

      // Check coherence using CoherenceNode array
      const coherenceResult = await this.coherenceService.checkCoherence(coherenceNodes);

      // Update coherence stats
      this.stats.lastCoherenceCheck = Date.now();

      // Update average coherence energy (rolling average)
      const totalChecks = this.stats.totalObservations;
      if (totalChecks > 1) {
        this.stats.avgCoherenceEnergy =
          (this.stats.avgCoherenceEnergy * (totalChecks - 1) + coherenceResult.energy) / totalChecks;
      } else {
        this.stats.avgCoherenceEnergy = coherenceResult.energy;
      }

      // Determine coherence state based on energy
      const previousState = this.stats.currentCoherenceState;
      if (coherenceResult.energy < 0.1) {
        this.stats.currentCoherenceState = 'coherent';
      } else if (coherenceResult.energy < this.config.coherenceThreshold) {
        this.stats.currentCoherenceState = 'uncertain';
      } else {
        this.stats.currentCoherenceState = 'incoherent';
      }

      // Check for coherence violation
      if (coherenceResult.energy >= this.config.coherenceThreshold) {
        this.stats.coherenceViolationCount++;

        // Track when incoherence started
        if (this.incoherentSince === null) {
          this.incoherentSince = Date.now();
        }

        // Convert coherence contradictions to local type for event emission
        const localContradictions: Contradiction[] = (coherenceResult.contradictions || []).map(
          (c: CoherenceContradiction) => ({
            nodeIds: c.nodeIds,
            severity: this.mapSeverity(c.severity),
            description: c.description,
            confidence: c.confidence,
            resolution: c.resolution,
          })
        );

        // Emit coherence violation event
        const violationData: CoherenceViolationData = {
          energy: coherenceResult.energy,
          lane: coherenceResult.lane,
          contradictions: localContradictions,
          timestamp: Date.now(),
          usedFallback: coherenceResult.usedFallback,
        };
        this.emit('coherence_violation', violationData);

        // Attempt reconciliation if we have contradictions and a reconciler
        if (localContradictions.length > 0 && this.beliefReconciler) {
          await this.attemptReconciliation(localContradictions);
        }
      } else if (previousState === 'incoherent' && this.stats.currentCoherenceState !== 'incoherent') {
        // Coherence restored
        const incoherentDuration = this.incoherentSince ? Date.now() - this.incoherentSince : 0;
        this.incoherentSince = null;

        const restoredData: CoherenceRestoredData = {
          previousEnergy: this.lastCoherenceEnergy,
          currentEnergy: coherenceResult.energy,
          incoherentDurationMs: incoherentDuration,
          restorationActions: [],
          timestamp: Date.now(),
        };
        this.emit('coherence_restored', restoredData);
      }

      // Store energy for next comparison
      this.lastCoherenceEnergy = coherenceResult.energy;

      // Check for collapse risk prediction
      await this.checkCollapseRiskFromObservation(observation);

      return coherenceResult;
    } catch (error) {
      if (this.config.verboseLogging) {
        logger.error('Coherence check failed', error instanceof Error ? error : undefined);
      }
      return undefined;
    }
  }

  /**
   * Map severity from coherence module to local type.
   * The coherence module uses 'info' | 'low' | 'medium' | 'high' | 'critical'
   * while we use 'low' | 'medium' | 'high' | 'critical'.
   */
  private mapSeverity(
    severity: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'info':
      case 'low':
        return 'low';
      case 'medium':
        return 'medium';
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      default:
        return 'medium';
    }
  }

  /**
   * Check collapse risk from observation data.
   * Converts observation to SwarmState format required by coherence service.
   */
  private async checkCollapseRiskFromObservation(
    observation: SwarmHealthObservation
  ): Promise<void> {
    if (!this.coherenceService?.predictCollapse) {
      return;
    }

    try {
      // Convert observation to SwarmState format
      const swarmState: SwarmState = {
        agents: Array.from(observation.agentHealth.entries()).map(([agentId, metrics]) => ({
          agentId,
          agentType: 'specialist', // Default type
          health: metrics.responsiveness,
          beliefs: [], // Empty beliefs for now
          lastActivity: new Date(metrics.lastHeartbeat),
          errorCount: Math.round(metrics.errorRate * 100),
          successRate: metrics.taskCompletionRate,
        })),
        activeTasks: Array.from(observation.agentHealth.values()).reduce(
          (sum, m) => sum + m.queuedTasks,
          0
        ),
        pendingTasks: 0,
        errorRate: observation.overallHealth < 0.5 ? 0.5 - observation.overallHealth : 0,
        utilization:
          Array.from(observation.agentHealth.values()).reduce(
            (sum, m) => sum + m.cpuUtilization,
            0
          ) / observation.agentHealth.size || 0,
        timestamp: new Date(observation.timestamp),
      };

      const collapseRisk = await this.coherenceService.predictCollapse(swarmState);
      this.updateCollapseRiskHistory(collapseRisk.risk);

      if (collapseRisk.collapseImminent || collapseRisk.risk > 0.7) {
        const collapsePredictedData: CollapsePredictedData = {
          risk: collapseRisk.risk,
          fiedlerValue: collapseRisk.fiedlerValue,
          collapseImminent: collapseRisk.collapseImminent,
          weakVertices: collapseRisk.weakVertices || [],
          recommendations: collapseRisk.recommendations || [],
          timestamp: Date.now(),
        };
        this.emit('collapse_predicted', collapsePredictedData);
      }
    } catch (error) {
      if (this.config.verboseLogging) {
        logger.warn('Collapse prediction failed', { error });
      }
    }
  }

  /**
   * Attempt to reconcile contradicting beliefs.
   *
   * @param contradictions - Array of contradictions to resolve
   */
  private async attemptReconciliation(contradictions: Contradiction[]): Promise<void> {
    if (!this.beliefReconciler) {
      return;
    }

    try {
      const result = await this.beliefReconciler.reconcile(contradictions);

      // Update reconciliation stats
      this.stats.consensusVerifications++;
      const totalAttempts = this.stats.consensusVerifications;
      const previousSuccessTotal = this.stats.reconciliationSuccessRate * (totalAttempts - 1);
      const currentSuccess = result.resolvedCount > 0 ? 1 : 0;
      this.stats.reconciliationSuccessRate = (previousSuccessTotal + currentSuccess) / totalAttempts;

      if (result.unresolvedCount > 0) {
        this.stats.invalidConsensusCount++;
      }

      // Emit reconciliation event
      const reconciledData: BeliefReconciledData = {
        reconciledContradictionIds: result.resolvedContradictionIds,
        resolvedCount: result.resolvedCount,
        remainingCount: result.unresolvedCount,
        newEnergy: this.lastCoherenceEnergy, // Will be updated in next check
        timestamp: Date.now(),
      };
      this.emit('belief_reconciled', reconciledData);

      if (this.config.verboseLogging) {
        logger.info('Reconciled contradictions', {
          resolved: result.resolvedCount,
          total: contradictions.length,
        });
      }
    } catch (error) {
      if (this.config.verboseLogging) {
        logger.error('Reconciliation failed', error instanceof Error ? error : undefined);
      }
      this.stats.invalidConsensusCount++;
    }
  }

  /**
   * Update collapse risk history, maintaining the configured history size.
   *
   * @param risk - The new collapse risk value (0-1)
   */
  private updateCollapseRiskHistory(risk: number): void {
    this.stats.collapseRiskHistory.push(risk);

    // Trim to configured size
    while (this.stats.collapseRiskHistory.length > this.config.collapseRiskHistorySize) {
      this.stats.collapseRiskHistory.shift();
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Options for creating a StrangeLoopOrchestrator with coherence integration.
 */
export interface StrangeLoopOrchestratorOptions {
  /** Agent provider for observing swarm state */
  provider: AgentProvider;
  /** Action executor for healing actions */
  executor: ActionExecutor;
  /** Optional configuration overrides */
  config?: Partial<StrangeLoopConfig>;
  /** Optional CoherenceService for belief coherence checking (ADR-052) */
  coherenceService?: ICoherenceService;
  /** Optional belief reconciler for resolving contradictions (ADR-052) */
  beliefReconciler?: IBeliefReconciler;
}

/**
 * Create a strange loop orchestrator.
 *
 * @param provider - Agent provider for observing swarm state
 * @param executor - Action executor for healing actions
 * @param config - Optional configuration overrides
 */
export function createStrangeLoopOrchestrator(
  provider: AgentProvider,
  executor: ActionExecutor,
  config?: Partial<StrangeLoopConfig>
): StrangeLoopOrchestrator {
  return new StrangeLoopOrchestrator(provider, executor, config);
}

/**
 * Create a strange loop orchestrator with coherence integration (ADR-052).
 *
 * @param options - Configuration options including coherence dependencies
 * @returns Configured StrangeLoopOrchestrator with coherence integration
 *
 * @example
 * ```typescript
 * const orchestrator = createStrangeLoopWithCoherence({
 *   provider: agentProvider,
 *   executor: actionExecutor,
 *   config: { verboseLogging: true },
 *   coherenceService: await createCoherenceService(wasmLoader),
 *   beliefReconciler: myReconciler,
 * });
 *
 * orchestrator.on('coherence_violation', (event) => {
 *   console.log('Beliefs incoherent:', event.data);
 * });
 *
 * await orchestrator.start();
 * ```
 */
export function createStrangeLoopWithCoherence(
  options: StrangeLoopOrchestratorOptions
): StrangeLoopOrchestrator {
  return new StrangeLoopOrchestrator(
    options.provider,
    options.executor,
    options.config,
    options.coherenceService,
    options.beliefReconciler
  );
}

/**
 * Create a strange loop orchestrator with in-memory components (for testing).
 *
 * @param observerId - ID of the observer agent
 * @param config - Optional configuration overrides
 * @returns Object containing orchestrator, provider, and executor
 */
export function createInMemoryStrangeLoop(
  observerId: string = 'observer-0',
  config?: Partial<StrangeLoopConfig>
): {
  orchestrator: StrangeLoopOrchestrator;
  provider: InMemoryAgentProvider;
  executor: NoOpActionExecutor;
} {
  const provider = new InMemoryAgentProvider(observerId);
  const executor = new NoOpActionExecutor();
  const orchestrator = new StrangeLoopOrchestrator(provider, executor, config);

  return { orchestrator, provider, executor };
}

/**
 * Create a strange loop orchestrator with in-memory components and coherence (for testing).
 *
 * @param observerId - ID of the observer agent
 * @param config - Optional configuration overrides
 * @param coherenceService - Optional CoherenceService for belief coherence checking
 * @param beliefReconciler - Optional belief reconciler for resolving contradictions
 * @returns Object containing orchestrator, provider, and executor
 */
export function createInMemoryStrangeLoopWithCoherence(
  observerId: string = 'observer-0',
  config?: Partial<StrangeLoopConfig>,
  coherenceService?: ICoherenceService,
  beliefReconciler?: IBeliefReconciler
): {
  orchestrator: StrangeLoopOrchestrator;
  provider: InMemoryAgentProvider;
  executor: NoOpActionExecutor;
} {
  const provider = new InMemoryAgentProvider(observerId);
  const executor = new NoOpActionExecutor();
  const orchestrator = new StrangeLoopOrchestrator(
    provider,
    executor,
    config,
    coherenceService,
    beliefReconciler
  );

  return { orchestrator, provider, executor };
}

// ============================================================================
// Infrastructure Self-Healing Integration (ADR-057)
// ============================================================================

/**
 * Options for creating a StrangeLoopOrchestrator with infrastructure self-healing.
 */
export interface InfraHealingIntegrationOptions {
  /** Agent provider for observing swarm state */
  provider: AgentProvider;
  /** Action executor for swarm healing actions (will be wrapped with CompositeActionExecutor) */
  executor: ActionExecutor;
  /** Command runner for shell execution (inject NoOpCommandRunner for tests) */
  commandRunner: CommandRunner;
  /** YAML playbook content (string) */
  playbook: string;
  /** Custom error signatures (extends defaults) */
  customSignatures?: readonly InfraErrorSignature[];
  /** Variable overrides for playbook interpolation */
  variables?: Record<string, string>;
  /** Strange Loop configuration overrides */
  config?: Partial<StrangeLoopConfig>;
  /** Infrastructure healing configuration overrides */
  infraConfig?: Partial<InfraHealingConfig>;
  /** Prefix for synthetic infra agent IDs (default: 'infra-') */
  infraAgentPrefix?: string;
}

/**
 * Create a StrangeLoopOrchestrator with infrastructure self-healing wired in.
 *
 * This is the real integration point — it wraps the provider with
 * InfraAwareAgentProvider and the executor with CompositeActionExecutor,
 * so infrastructure failures detected by TestOutputObserver surface as
 * degraded synthetic agents and healing actions route through the playbook.
 *
 * @example
 * ```typescript
 * const { orchestrator, infraHealing } = createStrangeLoopWithInfraHealing({
 *   provider: new InMemoryAgentProvider('obs-0'),
 *   executor: new NoOpActionExecutor(),
 *   commandRunner: new ShellCommandRunner(),
 *   playbook: fs.readFileSync('./recovery-playbook.yaml', 'utf-8'),
 * });
 *
 * // Feed test output → infra failures become degraded synthetic agents
 * infraHealing.feedTestOutput(testStderr);
 *
 * // Strange Loop cycle detects degraded infra agents → heals via playbook
 * await orchestrator.runCycle();
 * ```
 */
export function createStrangeLoopWithInfraHealing(
  options: InfraHealingIntegrationOptions,
): {
  orchestrator: StrangeLoopOrchestrator;
  infraHealing: InfraHealingOrchestrator;
} {
  // 1. Create the infra healing orchestrator (observer + playbook + lock + executor)
  const infraHealing = createInfraHealingOrchestratorSync({
    commandRunner: options.commandRunner,
    playbook: options.playbook,
    customSignatures: options.customSignatures,
    variables: options.variables,
    config: options.infraConfig,
  });

  // 2. Wrap the provider — adds synthetic infra agents whose health
  //    reflects the observer's failure state (responsiveness=0 when down)
  const wrappedProvider = createInfraAwareAgentProvider(
    options.provider,
    infraHealing.getObserver(),
    infraHealing.getPlaybook(),
    options.infraAgentPrefix,
  );

  // 3. Wrap the executor — routes restart_agent for infra-* agents to
  //    InfraActionExecutor for playbook-driven recovery
  const wrappedExecutor = createCompositeActionExecutor(
    options.executor,
    infraHealing.getExecutor(),
  );

  // 4. Create the Strange Loop with wrapped dependencies
  const orchestrator = new StrangeLoopOrchestrator(
    wrappedProvider,
    wrappedExecutor,
    options.config,
  );

  return { orchestrator, infraHealing };
}

/**
 * Create a StrangeLoopOrchestrator with in-memory components and infrastructure
 * self-healing wired in. Convenience factory for testing.
 */
export function createInMemoryStrangeLoopWithInfraHealing(
  observerId: string = 'observer-0',
  commandRunner: CommandRunner,
  playbook: string,
  config?: Partial<StrangeLoopConfig>,
): {
  orchestrator: StrangeLoopOrchestrator;
  provider: InMemoryAgentProvider;
  infraHealing: InfraHealingOrchestrator;
} {
  const provider = new InMemoryAgentProvider(observerId);
  const executor = new NoOpActionExecutor();

  const { orchestrator, infraHealing } = createStrangeLoopWithInfraHealing({
    provider,
    executor,
    commandRunner,
    playbook,
    config,
  });

  return { orchestrator, provider, infraHealing };
}
