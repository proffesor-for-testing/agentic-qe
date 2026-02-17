/**
 * Agentic QE v3 - Strange Loop Self-Healing
 * ADR-047: MinCut Self-Organizing QE Integration - Phase 1
 *
 * Implements the Strange Loop self-organization pattern:
 *   OBSERVE → MODEL → DECIDE → ACT
 *
 * This module enables the swarm to autonomously detect and heal
 * topology weaknesses by observing its own state, building a
 * self-model for prediction, deciding on reorganization actions,
 * and applying them while measuring improvement.
 *
 * Key Features:
 * - Continuous observation of swarm topology health
 * - Predictive self-model using exponential moving average
 * - Action selection based on risk/reward analysis
 * - Learning from action outcomes for future decisions
 *
 * Reference: RuVector MinCut Strange Loop Pattern
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName, DomainEvent } from '../../shared/types';
import { EventBus, AgentCoordinator } from '../../kernel/interfaces';
import { SwarmGraph, createSwarmGraph } from './swarm-graph';
import { MinCutCalculator, createMinCutCalculator } from './mincut-calculator';
import { MinCutHealthMonitor } from './mincut-health-monitor';
import { MinCutPersistence } from './mincut-persistence';
import { toErrorMessage } from '../../shared/error-utils.js';
import {
  SwarmObservation,
  SelfModelPrediction,
  ReorganizationAction,
  ReorganizationResult,
  WeakVertex,
  SwarmGraphSnapshot,
  MinCutHealthConfig,
} from './interfaces';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Strange Loop configuration
 */
export interface StrangeLoopConfig {
  /** Enable self-healing */
  enabled: boolean;

  /** Observation interval (ms) */
  observationIntervalMs: number;

  /** Minimum MinCut threshold to trigger healing */
  healingThreshold: number;

  /** Maximum healing actions per cycle */
  maxActionsPerCycle: number;

  /** Cooldown between healing actions on same vertex (ms) */
  vertexCooldownMs: number;

  /** Minimum confidence for model predictions */
  minPredictionConfidence: number;

  /** Learning rate for self-model updates */
  learningRate: number;

  /** Maximum consecutive no-ops before forcing action */
  maxConsecutiveNoOps: number;

  /** Risk tolerance (0-1, higher = more aggressive healing) */
  riskTolerance: number;
}

/**
 * Default Strange Loop configuration
 */
export const DEFAULT_STRANGE_LOOP_CONFIG: StrangeLoopConfig = {
  enabled: true,
  observationIntervalMs: 10000, // 10 seconds
  healingThreshold: 2.0,
  maxActionsPerCycle: 3,
  vertexCooldownMs: 60000, // 1 minute
  minPredictionConfidence: 0.6,
  learningRate: 0.1,
  maxConsecutiveNoOps: 5,
  riskTolerance: 0.5,
};

// ============================================================================
// Self-Model for Prediction
// ============================================================================

/**
 * Self-model for predicting future topology state
 * Uses exponential moving average and pattern learning
 */
class SelfModel {
  private minCutHistory: number[] = [];
  private predictionHistory: Array<{ predicted: number; actual: number }> = [];
  private actionEffects: Map<string, { totalImprovement: number; count: number }> = new Map();
  private learningRate: number;

  constructor(learningRate: number = 0.1) {
    this.learningRate = learningRate;
  }

  /**
   * Update model with new observation
   */
  observe(minCutValue: number): void {
    this.minCutHistory.push(minCutValue);

    // Keep last 100 observations
    if (this.minCutHistory.length > 100) {
      this.minCutHistory.shift();
    }
  }

  /**
   * Predict future MinCut value
   */
  predict(): SelfModelPrediction {
    if (this.minCutHistory.length < 3) {
      const current = this.minCutHistory[this.minCutHistory.length - 1] ?? 0;
      return {
        predictedMinCut: current,
        predictedWeakVertices: [],
        confidence: 0.3,
        predictedAt: new Date(),
      };
    }

    // Exponential Moving Average prediction
    let ema = this.minCutHistory[0];
    const alpha = this.learningRate;

    for (let i = 1; i < this.minCutHistory.length; i++) {
      ema = alpha * this.minCutHistory[i] + (1 - alpha) * ema;
    }

    // Calculate trend
    const recent = this.minCutHistory.slice(-5);
    const oldAvg = this.minCutHistory.slice(-10, -5).reduce((a, b) => a + b, 0) / 5 || ema;
    const newAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const trend = newAvg - oldAvg;

    // Predict next value
    const predicted = ema + trend * 0.5;

    // Calculate confidence based on prediction accuracy
    const confidence = this.calculateConfidence();

    return {
      predictedMinCut: Math.max(0, predicted),
      predictedWeakVertices: [],
      confidence,
      predictedAt: new Date(),
    };
  }

  /**
   * Record prediction outcome for learning
   */
  recordOutcome(predicted: number, actual: number): void {
    this.predictionHistory.push({ predicted, actual });

    // Keep last 50 predictions
    if (this.predictionHistory.length > 50) {
      this.predictionHistory.shift();
    }
  }

  /**
   * Learn from action outcomes
   */
  learnFromAction(actionType: string, improvement: number): void {
    const current = this.actionEffects.get(actionType) || { totalImprovement: 0, count: 0 };
    current.totalImprovement += improvement;
    current.count += 1;
    this.actionEffects.set(actionType, current);
  }

  /**
   * Get expected improvement for an action type
   */
  getExpectedImprovement(actionType: string): number {
    const effect = this.actionEffects.get(actionType);
    if (!effect || effect.count === 0) {
      // Default expected improvements
      const defaults: Record<string, number> = {
        spawn_agent: 0.5,
        reinforce_edge: 0.3,
        remove_weak_vertex: 0.1,
        rebalance_load: 0.2,
        no_action: 0,
      };
      return defaults[actionType] ?? 0;
    }
    return effect.totalImprovement / effect.count;
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(): number {
    if (this.predictionHistory.length < 5) {
      return 0.5;
    }

    // Calculate mean absolute percentage error
    let totalError = 0;
    for (const { predicted, actual } of this.predictionHistory.slice(-10)) {
      if (actual !== 0) {
        totalError += Math.abs(predicted - actual) / Math.abs(actual);
      }
    }
    const mape = totalError / Math.min(10, this.predictionHistory.length);

    // Convert error to confidence (lower error = higher confidence)
    return Math.max(0.1, Math.min(0.95, 1 - mape));
  }
}

// ============================================================================
// Action Selector
// ============================================================================

/**
 * Selects the best reorganization action based on current state
 */
class ActionSelector {
  private readonly config: StrangeLoopConfig;
  private readonly selfModel: SelfModel;
  private readonly recentActions: Map<string, number> = new Map();
  private consecutiveNoOps = 0;

  constructor(config: StrangeLoopConfig, selfModel: SelfModel) {
    this.config = config;
    this.selfModel = selfModel;
  }

  /**
   * Select best action based on current observation
   */
  selectAction(
    observation: SwarmObservation,
    prediction: SelfModelPrediction,
    graph: SwarmGraph
  ): ReorganizationAction {
    const now = Date.now();

    // Check if healing is needed
    if (observation.minCutValue >= this.config.healingThreshold) {
      this.consecutiveNoOps++;
      if (this.consecutiveNoOps < this.config.maxConsecutiveNoOps) {
        return { type: 'no_action', reason: 'MinCut above threshold' };
      }
    }

    // Reset no-op counter
    this.consecutiveNoOps = 0;

    // Get candidate actions
    const candidates = this.generateCandidateActions(observation, graph);

    // Filter by cooldown
    const validCandidates = candidates.filter(action => {
      const key = this.getActionKey(action);
      const lastAction = this.recentActions.get(key);
      return !lastAction || (now - lastAction) > this.config.vertexCooldownMs;
    });

    if (validCandidates.length === 0) {
      return { type: 'no_action', reason: 'All candidates on cooldown' };
    }

    // Score and select best action
    const scored = validCandidates.map(action => ({
      action,
      score: this.scoreAction(action, observation, prediction),
    }));

    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0].action;

    // Record action time
    this.recentActions.set(this.getActionKey(selected), now);

    return selected;
  }

  /**
   * Generate candidate actions based on weak vertices
   */
  private generateCandidateActions(
    observation: SwarmObservation,
    graph: SwarmGraph
  ): ReorganizationAction[] {
    const actions: ReorganizationAction[] = [];

    // For each weak vertex, generate possible actions
    for (const weak of observation.weakVertices.slice(0, 5)) {
      // Option 1: Reinforce edge to well-connected vertex
      const strongVertices = this.findStrongVertices(graph, weak.vertexId);
      for (const target of strongVertices.slice(0, 2)) {
        actions.push({
          type: 'reinforce_edge',
          source: weak.vertexId,
          target,
          weightIncrease: 0.5,
        });
      }

      // Option 2: Spawn agent in same domain if isolated
      if (weak.weightedDegree < 0.5 && weak.vertex.domain) {
        actions.push({
          type: 'spawn_agent',
          domain: weak.vertex.domain,
          capabilities: weak.vertex.capabilities ?? [],
        });
      }

      // Option 3: Rebalance load if overloaded
      if (weak.riskScore > 0.7) {
        const lessLoadedAgent = this.findLessLoadedAgent(graph, weak.vertexId);
        if (lessLoadedAgent) {
          actions.push({
            type: 'rebalance_load',
            fromAgent: weak.vertexId,
            toAgent: lessLoadedAgent,
          });
        }
      }
    }

    // Always include no_action as fallback
    actions.push({ type: 'no_action', reason: 'Conservative approach' });

    return actions;
  }

  /**
   * Score an action based on expected improvement and risk
   */
  private scoreAction(
    action: ReorganizationAction,
    observation: SwarmObservation,
    prediction: SelfModelPrediction
  ): number {
    const expectedImprovement = this.selfModel.getExpectedImprovement(action.type);

    // Adjust for confidence
    const confidenceAdjusted = expectedImprovement * prediction.confidence;

    // Risk factor based on action type
    const riskFactors: Record<string, number> = {
      no_action: 1.0,
      reinforce_edge: 0.9,
      rebalance_load: 0.7,
      spawn_agent: 0.5,
      remove_weak_vertex: 0.3,
    };
    const riskFactor = riskFactors[action.type] ?? 0.5;

    // Final score combines improvement, confidence, and risk tolerance
    return confidenceAdjusted * (riskFactor * (1 - this.config.riskTolerance) +
      this.config.riskTolerance);
  }

  /**
   * Find strongly connected vertices
   */
  private findStrongVertices(graph: SwarmGraph, excludeId: string): string[] {
    const vertices = graph.getVertices()
      .filter(v => v.id !== excludeId)
      .map(v => ({
        id: v.id,
        degree: graph.weightedDegree(v.id),
      }))
      .sort((a, b) => b.degree - a.degree);

    return vertices.slice(0, 3).map(v => v.id);
  }

  /**
   * Find less loaded agent for rebalancing
   */
  private findLessLoadedAgent(graph: SwarmGraph, excludeId: string): string | undefined {
    const agents = graph.getVertices()
      .filter(v => v.type === 'agent' && v.id !== excludeId)
      .map(v => ({
        id: v.id,
        taskCount: (v.metadata?.taskCount as number) ?? 0,
      }))
      .sort((a, b) => a.taskCount - b.taskCount);

    return agents[0]?.id;
  }

  /**
   * Get unique key for action (for cooldown tracking)
   */
  private getActionKey(action: ReorganizationAction): string {
    switch (action.type) {
      case 'spawn_agent':
        return `spawn:${action.domain}`;
      case 'reinforce_edge':
        return `reinforce:${action.source}:${action.target}`;
      case 'remove_weak_vertex':
        return `remove:${action.vertexId}`;
      case 'rebalance_load':
        return `rebalance:${action.fromAgent}:${action.toAgent}`;
      case 'no_action':
        return 'no_action';
    }
  }
}

// ============================================================================
// Strange Loop Controller
// ============================================================================

/**
 * Strange Loop Self-Healing Controller
 * Orchestrates the Observe → Model → Decide → Act cycle
 */
export class StrangeLoopController {
  private readonly config: StrangeLoopConfig;
  private readonly graph: SwarmGraph;
  private readonly calculator: MinCutCalculator;
  private readonly selfModel: SelfModel;
  private readonly actionSelector: ActionSelector;
  private readonly persistence: MinCutPersistence;
  private readonly eventBus?: EventBus;
  private readonly agentCoordinator?: AgentCoordinator;

  private cycleTimer: NodeJS.Timeout | null = null;
  private iteration = 0;
  private running = false;
  private observations: SwarmObservation[] = [];
  private results: ReorganizationResult[] = [];

  constructor(
    graph: SwarmGraph,
    persistence: MinCutPersistence,
    config: Partial<StrangeLoopConfig> = {},
    eventBus?: EventBus,
    agentCoordinator?: AgentCoordinator
  ) {
    this.config = { ...DEFAULT_STRANGE_LOOP_CONFIG, ...config };
    this.graph = graph;
    this.calculator = createMinCutCalculator();
    this.selfModel = new SelfModel(this.config.learningRate);
    this.actionSelector = new ActionSelector(this.config, this.selfModel);
    this.persistence = persistence;
    this.eventBus = eventBus;
    this.agentCoordinator = agentCoordinator;
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Start the Strange Loop cycle
   */
  start(): void {
    if (this.running || !this.config.enabled) return;

    this.running = true;
    this.cycleTimer = setInterval(
      () => this.runCycle(),
      this.config.observationIntervalMs
    );

    // Run initial cycle
    this.runCycle();
  }

  /**
   * Stop the Strange Loop cycle
   */
  stop(): void {
    if (this.cycleTimer) {
      clearInterval(this.cycleTimer);
      this.cycleTimer = null;
    }
    this.running = false;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ==========================================================================
  // Strange Loop Cycle
  // ==========================================================================

  /**
   * Run one complete Strange Loop cycle
   */
  async runCycle(): Promise<ReorganizationResult | null> {
    const startTime = Date.now();
    this.iteration++;

    try {
      // PHASE 1: OBSERVE
      const observation = this.observe();
      this.observations.push(observation);

      // Keep last 100 observations
      if (this.observations.length > 100) {
        this.observations.shift();
      }

      // PHASE 2: MODEL
      const prediction = this.model(observation);

      // PHASE 3: DECIDE
      const action = this.decide(observation, prediction);

      // PHASE 4: ACT
      const result = await this.act(action, observation.minCutValue);

      // Learn from outcome
      if (result.success) {
        this.selfModel.learnFromAction(action.type, result.improvement);
        this.selfModel.recordOutcome(prediction.predictedMinCut, result.minCutAfter);
      }

      // Store results
      this.results.push(result);
      if (this.results.length > 100) {
        this.results.shift();
      }

      // ADR-047: Persist healing action
      if (result.success) {
        await this.persistence.recordHealingAction({
          ...result,
          triggeredBy: 'strange-loop-cycle',
        }).catch(e =>
          console.warn('[StrangeLoopController] Failed to persist healing action:', e)
        );
      }

      // Persist observation
      await this.persistence.recordObservation({
        iteration: this.iteration,
        minCutValue: observation.minCutValue,
        weakVertices: observation.weakVertices,
        snapshotId: undefined,
        prediction,
      });

      // Emit event
      await this.emitEvent('mincut.healing.completed', observation.minCutValue, { result });

      return result;
    } catch (error) {
      await this.emitEvent('mincut.healing.failed', 0, {
        error: toErrorMessage(error),
      });
      return null;
    }
  }

  // ==========================================================================
  // OBSERVE: Collect Current State
  // ==========================================================================

  /**
   * OBSERVE phase: Collect current topology state
   */
  private observe(): SwarmObservation {
    const minCutValue = this.calculator.getMinCutValue(this.graph);
    const weakVertices = this.calculator.findWeakVertices(this.graph);
    const snapshot = this.graph.snapshot();

    // Update self-model with observation
    this.selfModel.observe(minCutValue);

    return {
      id: uuidv4(),
      timestamp: new Date(),
      minCutValue,
      weakVertices,
      graphSnapshot: snapshot,
      iteration: this.iteration,
    };
  }

  // ==========================================================================
  // MODEL: Build/Update Self-Model
  // ==========================================================================

  /**
   * MODEL phase: Use self-model to predict future state
   */
  private model(observation: SwarmObservation): SelfModelPrediction {
    const prediction = this.selfModel.predict();

    // Add predicted weak vertices based on current trends
    const predictedWeakVertices = observation.weakVertices
      .filter(v => v.riskScore > 0.5)
      .map(v => v.vertexId);

    return {
      ...prediction,
      predictedWeakVertices,
    };
  }

  // ==========================================================================
  // DECIDE: Choose Reorganization Action
  // ==========================================================================

  /**
   * DECIDE phase: Select best reorganization action
   */
  private decide(
    observation: SwarmObservation,
    prediction: SelfModelPrediction
  ): ReorganizationAction {
    // Check confidence threshold
    if (prediction.confidence < this.config.minPredictionConfidence) {
      return { type: 'no_action', reason: 'Low prediction confidence' };
    }

    return this.actionSelector.selectAction(observation, prediction, this.graph);
  }

  // ==========================================================================
  // ACT: Apply Reorganization Action
  // ==========================================================================

  /**
   * ACT phase: Apply selected action and measure improvement
   */
  private async act(
    action: ReorganizationAction,
    minCutBefore: number
  ): Promise<ReorganizationResult> {
    const startTime = Date.now();

    if (action.type === 'no_action') {
      return {
        action,
        success: true,
        minCutBefore,
        minCutAfter: minCutBefore,
        improvement: 0,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      await this.executeAction(action);

      const minCutAfter = this.calculator.getMinCutValue(this.graph);
      const improvement = minCutAfter - minCutBefore;

      return {
        action,
        success: true,
        minCutBefore,
        minCutAfter,
        improvement,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        action,
        success: false,
        minCutBefore,
        minCutAfter: minCutBefore,
        improvement: 0,
        error: toErrorMessage(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute specific action
   */
  private async executeAction(action: ReorganizationAction): Promise<void> {
    switch (action.type) {
      case 'spawn_agent':
        await this.executeSpawnAgent(action.domain, action.capabilities);
        break;

      case 'reinforce_edge':
        this.executeReinforceEdge(action.source, action.target, action.weightIncrease);
        break;

      case 'remove_weak_vertex':
        this.executeRemoveVertex(action.vertexId);
        break;

      case 'rebalance_load':
        await this.executeRebalanceLoad(action.fromAgent, action.toAgent);
        break;

      case 'no_action':
        // Do nothing
        break;
    }
  }

  /**
   * Execute spawn agent action
   */
  private async executeSpawnAgent(domain: DomainName, capabilities: string[]): Promise<void> {
    if (!this.agentCoordinator) {
      throw new Error('Agent coordinator not available for spawning');
    }

    // In real implementation, this would use agentCoordinator.spawnAgent
    // For now, we add a vertex to represent the new agent
    const agentId = `agent:${uuidv4().slice(0, 8)}`;
    this.graph.addVertex({
      id: agentId,
      type: 'agent',
      domain,
      capabilities,
      weight: 1.0,
      createdAt: new Date(),
    });

    // Connect to domain coordinator
    const domainVertexId = `domain:${domain}`;
    if (this.graph.hasVertex(domainVertexId)) {
      this.graph.addEdge({
        source: agentId,
        target: domainVertexId,
        weight: 1.0,
        type: 'coordination',
        bidirectional: true,
      });
    }
  }

  /**
   * Execute reinforce edge action
   */
  private executeReinforceEdge(source: string, target: string, weightIncrease: number): void {
    const existingEdge = this.graph.getEdge(source, target);

    if (existingEdge) {
      // Increase existing edge weight
      this.graph.addEdge({
        ...existingEdge,
        weight: existingEdge.weight + weightIncrease,
      });
    } else {
      // Create new edge
      this.graph.addEdge({
        source,
        target,
        weight: weightIncrease,
        type: 'coordination',
        bidirectional: true,
      });
    }
  }

  /**
   * Execute remove vertex action (careful!)
   */
  private executeRemoveVertex(vertexId: string): void {
    // Only remove if truly isolated
    const degree = this.graph.weightedDegree(vertexId);
    if (degree < 0.1) {
      this.graph.removeVertex(vertexId);
    }
  }

  /**
   * Execute rebalance load action
   */
  private async executeRebalanceLoad(fromAgent: string, toAgent: string): Promise<void> {
    // In real implementation, this would coordinate task redistribution
    // For now, we just strengthen the edge between agents
    this.executeReinforceEdge(fromAgent, toAgent, 0.3);
  }

  // ==========================================================================
  // Status & Metrics
  // ==========================================================================

  /**
   * Get current iteration
   */
  getIteration(): number {
    return this.iteration;
  }

  /**
   * Get recent observations
   */
  getObservations(limit: number = 10): SwarmObservation[] {
    return this.observations.slice(-limit);
  }

  /**
   * Get recent results
   */
  getResults(limit: number = 10): ReorganizationResult[] {
    return this.results.slice(-limit);
  }

  /**
   * Get healing statistics
   */
  getStats(): {
    totalCycles: number;
    successfulActions: number;
    failedActions: number;
    totalImprovement: number;
    averageImprovement: number;
    actionCounts: Record<string, number>;
  } {
    const actionCounts: Record<string, number> = {};
    let successfulActions = 0;
    let failedActions = 0;
    let totalImprovement = 0;

    for (const result of this.results) {
      actionCounts[result.action.type] = (actionCounts[result.action.type] || 0) + 1;

      if (result.success && result.action.type !== 'no_action') {
        successfulActions++;
        totalImprovement += result.improvement;
      } else if (!result.success) {
        failedActions++;
      }
    }

    return {
      totalCycles: this.iteration,
      successfulActions,
      failedActions,
      totalImprovement,
      averageImprovement: successfulActions > 0 ? totalImprovement / successfulActions : 0,
      actionCounts,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): StrangeLoopConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  /**
   * Emit Strange Loop event
   */
  private async emitEvent(
    type: string,
    minCutValue: number,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.eventBus) return;

    const event: DomainEvent = {
      id: uuidv4(),
      type,
      source: 'coordination',
      timestamp: new Date(),
      correlationId: uuidv4(),
      payload: {
        iteration: this.iteration,
        minCutValue,
        ...payload,
      },
    };

    try {
      await this.eventBus.publish(event);
    } catch (error) {
      console.error('Failed to publish Strange Loop event:', error);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Strange Loop controller
 */
export function createStrangeLoopController(
  graph: SwarmGraph,
  persistence: MinCutPersistence,
  config?: Partial<StrangeLoopConfig>,
  eventBus?: EventBus,
  agentCoordinator?: AgentCoordinator
): StrangeLoopController {
  return new StrangeLoopController(graph, persistence, config, eventBus, agentCoordinator);
}
