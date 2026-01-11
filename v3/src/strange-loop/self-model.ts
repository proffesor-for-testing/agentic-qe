/**
 * Swarm Self-Model
 * ADR-031: Strange Loop Self-Awareness
 *
 * Maintains an internal model of the swarm state, tracks history,
 * and predicts future vulnerabilities based on trends.
 */

import type {
  SwarmHealthObservation,
  SwarmModelState,
  SwarmModelDelta,
  TrendAnalysis,
  TrendDirection,
  PredictedVulnerability,
  BottleneckAnalysis,
  BottleneckInfo,
  AgentHealthMetrics,
  SwarmVulnerability,
  SerializedSwarmHealthObservation,
} from './types.js';
import { TopologyAnalyzer } from './topology-analyzer.js';

// ============================================================================
// Swarm Self-Model
// ============================================================================

/**
 * Maintains an internal representation of the swarm state
 * and provides trend analysis and vulnerability prediction.
 */
export class SwarmSelfModel {
  private observationHistory: SwarmHealthObservation[] = [];
  private currentState: SwarmModelState | null = null;
  private topologyAnalyzer: TopologyAnalyzer;
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
    this.topologyAnalyzer = new TopologyAnalyzer();
  }

  /**
   * Update the model with a new observation
   */
  updateModel(observation: SwarmHealthObservation): SwarmModelDelta {
    const previousState = this.currentState;

    // Compute delta before updating
    const delta = this.computeDelta(previousState, observation);

    // Update current state
    this.currentState = {
      topology: observation.topology,
      connectivity: observation.connectivity,
      agentHealth: observation.agentHealth,
      activeVulnerabilities: observation.vulnerabilities,
      lastUpdated: observation.timestamp,
      version: previousState ? previousState.version + 1 : 1,
    };

    // Add to history
    this.observationHistory.push(observation);

    // Trim history if needed
    while (this.observationHistory.length > this.maxHistorySize) {
      this.observationHistory.shift();
    }

    return delta;
  }

  /**
   * Get the current model state
   */
  getCurrentState(): SwarmModelState | null {
    return this.currentState;
  }

  /**
   * Get the observation history
   */
  getHistory(): readonly SwarmHealthObservation[] {
    return this.observationHistory;
  }

  /**
   * Find bottleneck agents using min-cut analysis
   */
  findBottlenecks(): BottleneckAnalysis {
    if (!this.currentState) {
      return {
        bottlenecks: [],
        overallHealth: 1.0,
        minCut: 0,
        analyzedAt: Date.now(),
      };
    }

    return this.topologyAnalyzer.analyzeBottlenecks(this.currentState.topology);
  }

  /**
   * Predict future vulnerabilities based on trends
   */
  predictVulnerabilities(): PredictedVulnerability[] {
    if (this.observationHistory.length < 3) {
      return [];
    }

    const predictions: PredictedVulnerability[] = [];

    // 1. Analyze connectivity trend
    const minCutValues = this.observationHistory.map(o => o.connectivity.minCut);
    const minCutTrend = this.analyzeTrend(minCutValues);

    if (minCutTrend.direction === 'decreasing' && minCutTrend.rate > 0.1) {
      const timeToThreshold = this.estimateTimeToThreshold(
        minCutValues,
        minCutTrend,
        1 // Threshold: minCut = 1
      );

      predictions.push({
        type: 'connectivity_degradation',
        probability: Math.min(minCutTrend.rate * 2 * minCutTrend.confidence, 0.95),
        timeToOccurrence: timeToThreshold,
        suggestedAction: 'add_redundant_connections',
        confidence: minCutTrend.confidence,
      });
    }

    // 2. Analyze overall health trend
    const healthValues = this.observationHistory.map(o => o.overallHealth);
    const healthTrend = this.analyzeTrend(healthValues);

    if (healthTrend.direction === 'decreasing' && healthTrend.rate > 0.05) {
      const timeToThreshold = this.estimateTimeToThreshold(
        healthValues,
        healthTrend,
        0.5 // Threshold: health = 0.5
      );

      predictions.push({
        type: 'connectivity_degradation',
        probability: Math.min(healthTrend.rate * 3 * healthTrend.confidence, 0.9),
        timeToOccurrence: timeToThreshold,
        suggestedAction: 'scale_up',
        confidence: healthTrend.confidence,
      });
    }

    // 3. Analyze agent-specific health trends
    const agentHealthHistory = this.aggregateAgentHealth();

    for (const [agentId, healthHistory] of agentHealthHistory) {
      if (healthHistory.length < 3) continue;

      const responsivenessValues = healthHistory.map(h => h.responsiveness);
      const responsivenessTrend = this.analyzeTrend(responsivenessValues);

      if (responsivenessTrend.direction === 'decreasing' && responsivenessTrend.rate > 0.15) {
        const timeToThreshold = this.estimateTimeToThreshold(
          responsivenessValues,
          responsivenessTrend,
          0.5 // Threshold: responsiveness = 0.5
        );

        predictions.push({
          type: 'agent_degradation',
          agentId,
          probability: Math.min(responsivenessTrend.rate * 2.5 * responsivenessTrend.confidence, 0.9),
          timeToOccurrence: timeToThreshold,
          suggestedAction: 'spawn_backup_agent',
          confidence: responsivenessTrend.confidence,
        });
      }

      // Check memory utilization trend
      const memoryValues = healthHistory.map(h => h.memoryUtilization);
      const memoryTrend = this.analyzeTrend(memoryValues);

      if (memoryTrend.direction === 'increasing' && memoryTrend.rate > 0.1) {
        const timeToThreshold = this.estimateTimeToThreshold(
          memoryValues,
          memoryTrend,
          0.95 // Threshold: memory = 95%
        );

        predictions.push({
          type: 'overload_imminent',
          agentId,
          probability: Math.min(memoryTrend.rate * 2 * memoryTrend.confidence, 0.85),
          timeToOccurrence: timeToThreshold,
          suggestedAction: 'redistribute_load',
          confidence: memoryTrend.confidence,
        });
      }
    }

    // 4. Check for partition risk
    const componentValues = this.observationHistory.map(o => o.connectivity.components);
    const componentTrend = this.analyzeTrend(componentValues);

    if (componentTrend.direction === 'increasing' && componentTrend.rate > 0) {
      predictions.push({
        type: 'partition_risk',
        probability: Math.min(componentTrend.rate * 4 * componentTrend.confidence, 0.8),
        timeToOccurrence: this.estimateTimeToThreshold(componentValues, componentTrend, 2),
        suggestedAction: 'add_cross_component_connections',
        confidence: componentTrend.confidence,
      });
    }

    // Sort by probability descending
    predictions.sort((a, b) => b.probability - a.probability);

    return predictions;
  }

  /**
   * Analyze trend in a series of values
   */
  analyzeTrend(values: number[]): TrendAnalysis {
    if (values.length < 2) {
      return {
        direction: 'stable',
        rate: 0,
        confidence: 0,
        dataPoints: values.length,
      };
    }

    // Calculate linear regression
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
      sumY2 += values[i] * values[i];
    }

    // Slope of the regression line
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    // Correlation coefficient (R)
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
    );
    const r = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;

    // Determine direction
    let direction: TrendDirection;
    if (Math.abs(slope) < 0.01) {
      direction = 'stable';
    } else if (slope > 0) {
      direction = 'increasing';
    } else {
      direction = 'decreasing';
    }

    // Confidence based on correlation strength
    const confidence = Math.abs(r);

    return {
      direction,
      rate: Math.abs(slope),
      confidence,
      dataPoints: n,
    };
  }

  /**
   * Estimate time until a threshold is reached
   */
  private estimateTimeToThreshold(
    values: number[],
    trend: TrendAnalysis,
    threshold: number
  ): number {
    if (values.length === 0 || trend.rate === 0) {
      return Infinity;
    }

    const currentValue = values[values.length - 1];
    const timeDelta = this.getAverageObservationInterval();

    // Calculate how many observations until threshold
    let valueDiff: number;
    if (trend.direction === 'decreasing') {
      valueDiff = currentValue - threshold;
    } else {
      valueDiff = threshold - currentValue;
    }

    if (valueDiff <= 0) {
      return 0; // Already past threshold
    }

    const observationsNeeded = valueDiff / trend.rate;
    return observationsNeeded * timeDelta;
  }

  /**
   * Get average time between observations
   */
  private getAverageObservationInterval(): number {
    if (this.observationHistory.length < 2) {
      return 5000; // Default 5 seconds
    }

    let totalInterval = 0;
    for (let i = 1; i < this.observationHistory.length; i++) {
      totalInterval +=
        this.observationHistory[i].timestamp -
        this.observationHistory[i - 1].timestamp;
    }

    return totalInterval / (this.observationHistory.length - 1);
  }

  /**
   * Aggregate agent health across observations
   */
  aggregateAgentHealth(): Map<string, AgentHealthMetrics[]> {
    const healthByAgent = new Map<string, AgentHealthMetrics[]>();

    for (const observation of this.observationHistory) {
      for (const [agentId, health] of observation.agentHealth) {
        if (!healthByAgent.has(agentId)) {
          healthByAgent.set(agentId, []);
        }
        healthByAgent.get(agentId)!.push(health);
      }
    }

    return healthByAgent;
  }

  /**
   * Compute delta between previous state and new observation
   */
  private computeDelta(
    previousState: SwarmModelState | null,
    observation: SwarmHealthObservation
  ): SwarmModelDelta {
    if (!previousState) {
      return {
        agentsAdded: observation.topology.agents.map(a => a.id),
        agentsRemoved: [],
        edgesAdded: observation.topology.edgeCount,
        edgesRemoved: 0,
        connectivityDelta: observation.connectivity.minCut,
        newVulnerabilities: observation.vulnerabilities,
        resolvedVulnerabilities: [],
        isSignificant: true,
      };
    }

    // Find added and removed agents
    const previousAgentIds = new Set(previousState.topology.agents.map(a => a.id));
    const currentAgentIds = new Set(observation.topology.agents.map(a => a.id));

    const agentsAdded = observation.topology.agents
      .filter(a => !previousAgentIds.has(a.id))
      .map(a => a.id);

    const agentsRemoved = previousState.topology.agents
      .filter(a => !currentAgentIds.has(a.id))
      .map(a => a.id);

    // Calculate edge changes
    const edgeDelta =
      observation.topology.edgeCount - previousState.topology.edgeCount;

    // Calculate connectivity change
    const connectivityDelta =
      observation.connectivity.minCut - previousState.connectivity.minCut;

    // Find new and resolved vulnerabilities
    const previousVulnKeys = new Set(
      previousState.activeVulnerabilities.map(v =>
        `${v.type}:${v.affectedAgents.sort().join(',')}`
      )
    );

    const currentVulnKeys = new Set(
      observation.vulnerabilities.map(v =>
        `${v.type}:${v.affectedAgents.sort().join(',')}`
      )
    );

    const newVulnerabilities = observation.vulnerabilities.filter(
      v => !previousVulnKeys.has(`${v.type}:${v.affectedAgents.sort().join(',')}`)
    );

    const resolvedVulnerabilities = previousState.activeVulnerabilities.filter(
      v => !currentVulnKeys.has(`${v.type}:${v.affectedAgents.sort().join(',')}`)
    );

    // Determine if changes are significant
    const isSignificant =
      agentsAdded.length > 0 ||
      agentsRemoved.length > 0 ||
      Math.abs(connectivityDelta) >= 1 ||
      newVulnerabilities.length > 0 ||
      resolvedVulnerabilities.length > 0;

    return {
      agentsAdded,
      agentsRemoved,
      edgesAdded: edgeDelta > 0 ? edgeDelta : 0,
      edgesRemoved: edgeDelta < 0 ? -edgeDelta : 0,
      connectivityDelta,
      newVulnerabilities,
      resolvedVulnerabilities,
      isSignificant,
    };
  }

  /**
   * Get health trend over recent observations
   */
  getHealthTrend(): TrendDirection {
    const healthValues = this.observationHistory.map(o => o.overallHealth);
    const trend = this.analyzeTrend(healthValues);
    return trend.direction;
  }

  /**
   * Get current overall health
   */
  getCurrentHealth(): number {
    if (this.observationHistory.length === 0) {
      return 1.0;
    }
    return this.observationHistory[this.observationHistory.length - 1].overallHealth;
  }

  /**
   * Clear all history and state
   */
  clear(): void {
    this.observationHistory = [];
    this.currentState = null;
  }

  /**
   * Export history for persistence
   */
  exportHistory(): SerializedSwarmHealthObservation[] {
    return this.observationHistory.map(o => ({
      ...o,
      agentHealth: Array.from(o.agentHealth.entries()),
    }));
  }

  /**
   * Import history from persistence
   */
  importHistory(history: SerializedSwarmHealthObservation[]): void {
    this.observationHistory = history.map(o => ({
      ...o,
      agentHealth: new Map(o.agentHealth),
    }));

    // Rebuild current state from latest observation
    if (this.observationHistory.length > 0) {
      const latest = this.observationHistory[this.observationHistory.length - 1];
      this.currentState = {
        topology: latest.topology,
        connectivity: latest.connectivity,
        agentHealth: latest.agentHealth,
        activeVulnerabilities: latest.vulnerabilities,
        lastUpdated: latest.timestamp,
        version: this.observationHistory.length,
      };
    }
  }
}

/**
 * Create a new swarm self-model
 */
export function createSwarmSelfModel(maxHistorySize?: number): SwarmSelfModel {
  return new SwarmSelfModel(maxHistorySize);
}
