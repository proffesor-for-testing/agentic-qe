/**
 * Strange Loop Orchestrator
 * ADR-031: Strange Loop Self-Awareness
 *
 * Orchestrates the complete self-awareness cycle:
 * Observe -> Model -> Decide -> Act -> (repeat)
 *
 * "You look in a mirror. You see yourself looking.
 *  You adjust your hair *because* you saw it was messy.
 *  The act of observing changed what you observed."
 */

import { v4 as uuidv4 } from 'uuid';
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
} from './types.js';
import { DEFAULT_STRANGE_LOOP_CONFIG } from './types.js';
import { SwarmObserver, AgentProvider, InMemoryAgentProvider } from './swarm-observer.js';
import { SwarmSelfModel } from './self-model.js';
import { SelfHealingController, ActionExecutor, NoOpActionExecutor } from './healing-controller.js';

// ============================================================================
// Strange Loop Orchestrator
// ============================================================================

/**
 * Orchestrates the strange loop self-awareness cycle
 */
export class StrangeLoopOrchestrator {
  private observer: SwarmObserver;
  private model: SwarmSelfModel;
  private healer: SelfHealingController;
  private config: StrangeLoopConfig;

  private running: boolean = false;
  private loopHandle: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private stats: StrangeLoopStats;
  private eventListeners: Map<StrangeLoopEventType, StrangeLoopEventListener[]> = new Map();
  private myAgentId: string;

  constructor(
    provider: AgentProvider,
    executor: ActionExecutor,
    config: Partial<StrangeLoopConfig> = {}
  ) {
    this.config = { ...DEFAULT_STRANGE_LOOP_CONFIG, ...config };
    this.myAgentId = provider.getObserverId();

    this.observer = new SwarmObserver(provider);
    this.model = new SwarmSelfModel(this.config.historySize);
    this.healer = new SelfHealingController(this.model, executor, this.config);

    this.stats = this.initializeStats();
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
      console.log('[StrangeLoop] Starting self-observation cycle');
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
      console.log('[StrangeLoop] Stopped self-observation cycle');
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
   */
  async runCycle(): Promise<{
    observation: SwarmHealthObservation;
    delta: SwarmModelDelta;
    actions: SelfHealingAction[];
    results: ActionResult[];
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
          console.log(`[StrangeLoop] Detected ${actions.length} healing opportunities`);
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
              console.log(`[StrangeLoop] Executed ${action.type}: ${result.message}`);
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

      return { observation, delta, actions, results };
    } catch (error) {
      if (this.config.verboseLogging) {
        console.error('[StrangeLoop] Error in self-observation cycle:', error);
      }
      throw error;
    }
  }

  /**
   * The agent observes itself being the bottleneck
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

    return {
      agentId: myId,
      isHealthy: myHealth ? myHealth.responsiveness > 0.8 : true,
      isBottleneck: amIBottleneck,
      metrics: myHealth || this.getDefaultHealthMetrics(),
      recommendations,
      overallSwarmHealth: observation.overallHealth,
      diagnosedAt: Date.now(),
    };
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
            console.error(`[StrangeLoop] Event listener error:`, error);
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
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a strange loop orchestrator
 */
export function createStrangeLoopOrchestrator(
  provider: AgentProvider,
  executor: ActionExecutor,
  config?: Partial<StrangeLoopConfig>
): StrangeLoopOrchestrator {
  return new StrangeLoopOrchestrator(provider, executor, config);
}

/**
 * Create a strange loop orchestrator with in-memory components (for testing)
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
