/**
 * Agentic QE v3 - Causal Discovery Engine
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Main engine for causal discovery and root cause analysis.
 * Uses STDP learning to automatically discover causal relationships between events.
 */

import {
  CausalDiscoveryConfig,
  DEFAULT_CAUSAL_CONFIG,
  TestEvent,
  TestEventType,
  CausalGraph,
  RootCauseAnalysis,
  CausalFactor,
  IndirectCause,
  InterventionPoint,
  CausalSummary,
} from './types';
import { CausalWeightMatrix } from './weight-matrix';
import { CausalGraphImpl } from './causal-graph';

/**
 * Causal Discovery Engine
 *
 * Observes event streams and learns causal relationships using STDP.
 * Provides root cause analysis for target events.
 */
export class CausalDiscoveryEngine {
  private readonly weightMatrix: CausalWeightMatrix;
  private eventHistory: TestEvent[] = [];
  private readonly config: CausalDiscoveryConfig;
  private firstEventTime: number = 0;
  private lastEventTime: number = 0;

  constructor(config: Partial<CausalDiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_CAUSAL_CONFIG, ...config };
    this.weightMatrix = new CausalWeightMatrix(this.config);
  }

  /**
   * Observe a single test event
   * Updates the weight matrix using STDP learning
   */
  observe(event: TestEvent): void {
    // Track timing
    if (this.firstEventTime === 0) {
      this.firstEventTime = event.timestamp;
    }
    this.lastEventTime = event.timestamp;

    // Update weight matrix
    this.weightMatrix.updateWeights(event);

    // Add to history
    this.eventHistory.push(event);

    // Prune old events to prevent memory bloat
    const cutoff = event.timestamp - this.config.timeWindow * 100;
    this.eventHistory = this.eventHistory.filter(e => e.timestamp > cutoff);

    // Limit history size
    if (this.eventHistory.length > this.config.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxHistorySize);
    }
  }

  /**
   * Observe a batch of events in chronological order
   */
  observeBatch(events: TestEvent[]): void {
    // Sort by timestamp
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    for (const event of sorted) {
      this.observe(event);
    }
  }

  /**
   * Perform root cause analysis for a target event type
   * Returns ranked causes, intervention points, and confidence
   */
  analyzeRootCause(targetEvent: TestEventType): RootCauseAnalysis {
    const graph = this.weightMatrix.extractCausalGraph();
    const observationCount = this.weightMatrix.getObservationCount();

    // Find direct causes (one hop away)
    const directCauseEdges = graph.edgesTo(targetEvent);
    const directCauses: CausalFactor[] = directCauseEdges.map(e => ({
      event: e.source,
      strength: e.strength,
      observations: e.observations,
    }));

    // Find indirect causes via transitive closure
    const closedGraph = graph.transitiveClosure();
    const indirectCauses: IndirectCause[] = [];

    for (const edge of closedGraph.edgesTo(targetEvent)) {
      // Skip if it's already a direct cause
      if (directCauses.some(dc => dc.event === edge.source)) continue;

      // Find the actual path
      const paths = graph.findPaths(edge.source, targetEvent);
      if (paths.length > 0) {
        indirectCauses.push({
          event: edge.source,
          strength: edge.strength,
          path: paths[0],
          depth: paths[0].length - 1,
        });
      }
    }

    // Sort by strength
    directCauses.sort((a, b) => b.strength - a.strength);
    indirectCauses.sort((a, b) => b.strength - a.strength);

    // Find optimal intervention points
    const interventionPoints = this.findInterventionPoints(graph, targetEvent);

    // Calculate confidence based on evidence
    const confidence = this.calculateConfidence(directCauses, indirectCauses, observationCount);

    return {
      targetEvent,
      directCauses,
      indirectCauses,
      interventionPoints,
      confidence,
      observationCount,
      analyzedAt: Date.now(),
    };
  }

  /**
   * Find optimal intervention points for a target event
   * Uses mincut-inspired heuristics to find bottleneck events
   */
  private findInterventionPoints(
    graph: CausalGraph,
    target: TestEventType
  ): InterventionPoint[] {
    const subgraph = (graph as CausalGraphImpl).getSubgraphTo(target);
    const interventionCandidates = (subgraph as CausalGraphImpl).findInterventionPoints(target, 10);

    const points: InterventionPoint[] = [];

    for (const candidate of interventionCandidates) {
      // Calculate what would be prevented by intervening here
      const reachableFromCandidate = subgraph.reachableFrom(candidate);
      const preventedEvents = Array.from(reachableFromCandidate).filter(
        e => e !== candidate
      );

      // Score based on how many downstream events would be affected
      const outEdges = subgraph.edgesFrom(candidate);
      const totalOutStrength = outEdges.reduce((sum, e) => sum + e.strength, 0);
      const score = Math.min(1, (preventedEvents.length * 0.2 + totalOutStrength) / 2);

      // Generate reason
      const reason = this.generateInterventionReason(candidate, preventedEvents, outEdges);

      points.push({
        event: candidate,
        score,
        reason,
        preventedEvents: preventedEvents as TestEventType[],
      });
    }

    // Sort by score
    return points.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  /**
   * Generate human-readable reason for intervention
   */
  private generateInterventionReason(
    event: TestEventType,
    prevented: TestEventType[],
    outEdges: { target: TestEventType; strength: number }[]
  ): string {
    if (outEdges.length === 0) {
      return `${event} is a leaf cause with no known downstream effects`;
    }

    const strongestTarget = outEdges[0].target;
    if (prevented.length <= 2) {
      return `Addressing ${event} would prevent ${prevented.join(', ')}`;
    }

    return `${event} is a key bottleneck affecting ${prevented.length} downstream events including ${strongestTarget}`;
  }

  /**
   * Calculate confidence score for the analysis
   */
  private calculateConfidence(
    directCauses: CausalFactor[],
    indirectCauses: IndirectCause[],
    observationCount: number
  ): number {
    // Base confidence from observation count
    let confidence = Math.min(1, observationCount / (this.config.minObservations * 10));

    // Boost confidence if we have strong direct causes
    if (directCauses.length > 0) {
      const maxStrength = Math.max(...directCauses.map(c => c.strength));
      confidence = Math.min(1, confidence + maxStrength * 0.3);
    }

    // Boost if we have converging evidence (multiple causes)
    if (directCauses.length + indirectCauses.length > 3) {
      confidence = Math.min(1, confidence + 0.1);
    }

    // Penalize if we have too few observations
    if (observationCount < this.config.minObservations) {
      confidence *= observationCount / this.config.minObservations;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get the current causal graph
   */
  getCausalGraph(): CausalGraph {
    return this.weightMatrix.extractCausalGraph();
  }

  /**
   * Predict which events are likely to cause a target event
   * Returns events that strongly cause the target (strength > threshold)
   */
  predictCauses(targetEvent: TestEventType, threshold: number = 0.5): TestEventType[] {
    const graph = this.weightMatrix.extractCausalGraph();

    return graph
      .edgesTo(targetEvent)
      .filter(e => e.strength > threshold)
      .map(e => e.source);
  }

  /**
   * Predict which events a source event is likely to cause
   */
  predictEffects(sourceEvent: TestEventType, threshold: number = 0.5): TestEventType[] {
    const graph = this.weightMatrix.extractCausalGraph();

    return graph
      .edgesFrom(sourceEvent)
      .filter(e => e.strength > threshold)
      .map(e => e.target);
  }

  /**
   * Get summary statistics about the causal discovery
   */
  getSummary(): CausalSummary {
    const graph = this.weightMatrix.extractCausalGraph();

    let causesCount = 0;
    let preventsCount = 0;
    let totalStrength = 0;
    let maxStrength = 0;

    for (const edge of graph.edges) {
      totalStrength += edge.strength;
      maxStrength = Math.max(maxStrength, edge.strength);
      if (edge.relation === 'causes') causesCount++;
      if (edge.relation === 'prevents') preventsCount++;
    }

    // Get strongest pairs
    const sortedEdges = [...graph.edges].sort((a, b) => b.strength - a.strength);
    const strongestPairs = sortedEdges.slice(0, 10).map(e => ({
      source: e.source,
      target: e.target,
      strength: e.strength,
    }));

    const observedTypes = this.weightMatrix.getObservedEventTypes();

    return {
      numRelationships: graph.edges.length,
      causesCount,
      preventsCount,
      avgStrength: graph.edges.length > 0 ? totalStrength / graph.edges.length : 0,
      maxStrength,
      eventsObserved: this.weightMatrix.getObservationCount(),
      uniqueEventTypes: observedTypes.length,
      observationTimeSpan: this.lastEventTime - this.firstEventTime,
      strongestPairs,
    };
  }

  /**
   * Apply decay to learned weights
   * Should be called periodically to prevent weight explosion
   */
  decay(): void {
    this.weightMatrix.decay();
  }

  /**
   * Reset all learned causal relationships
   */
  reset(): void {
    this.weightMatrix.reset();
    this.eventHistory = [];
    this.firstEventTime = 0;
    this.lastEventTime = 0;
  }

  /**
   * Get recently observed events for a specific type
   */
  getRecentEvents(eventType: TestEventType, limit: number = 10): TestEvent[] {
    return this.eventHistory
      .filter(e => e.type === eventType)
      .slice(-limit);
  }

  /**
   * Get all events in a time window
   */
  getEventsInWindow(startTime: number, endTime: number): TestEvent[] {
    return this.eventHistory.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime
    );
  }

  /**
   * Find the most likely root cause for a recent failure
   * Combines causal analysis with temporal proximity
   */
  findMostLikelyRootCause(
    failureEvent: TestEvent
  ): { event: TestEventType; probability: number } | null {
    const analysis = this.analyzeRootCause(failureEvent.type);

    if (analysis.directCauses.length === 0) {
      return null;
    }

    // Get events that occurred shortly before the failure
    const recentWindow = failureEvent.timestamp - this.config.timeWindow;
    const recentEvents = this.eventHistory.filter(
      e => e.timestamp >= recentWindow && e.timestamp < failureEvent.timestamp
    );

    // Score causes by both causal strength and temporal proximity
    const scoredCauses = analysis.directCauses
      .map(cause => {
        const recentOccurrences = recentEvents.filter(e => e.type === cause.event);
        const proximityBonus = recentOccurrences.length > 0 ? 0.2 : 0;
        return {
          event: cause.event,
          probability: Math.min(1, cause.strength + proximityBonus),
        };
      })
      .sort((a, b) => b.probability - a.probability);

    return scoredCauses[0] || null;
  }

  /**
   * Serialize the engine state to JSON
   */
  toJSON(): {
    config: CausalDiscoveryConfig;
    weights: Record<string, unknown>;
    history: TestEvent[];
    firstEventTime: number;
    lastEventTime: number;
  } {
    return {
      config: this.config,
      weights: this.weightMatrix.toJSON(),
      history: this.eventHistory,
      firstEventTime: this.firstEventTime,
      lastEventTime: this.lastEventTime,
    };
  }

  /**
   * Restore engine state from JSON
   */
  static fromJSON(data: {
    config?: Partial<CausalDiscoveryConfig>;
    weights?: Record<string, unknown>;
    history?: TestEvent[];
    firstEventTime?: number;
    lastEventTime?: number;
  }): CausalDiscoveryEngine {
    const engine = new CausalDiscoveryEngine(data.config);

    if (data.weights) {
      engine.weightMatrix.fromJSON(data.weights as Record<string, {
        weight: number;
        observations: number;
        lastUpdate: number;
        avgTimingDiff: number;
      }>);
    }

    if (data.history) {
      engine.eventHistory = data.history;
    }

    if (data.firstEventTime) {
      engine.firstEventTime = data.firstEventTime;
    }

    if (data.lastEventTime) {
      engine.lastEventTime = data.lastEventTime;
    }

    return engine;
  }

  /**
   * Get the configuration
   */
  getConfig(): CausalDiscoveryConfig {
    return { ...this.config };
  }

  /**
   * Get the observation count
   */
  getObservationCount(): number {
    return this.weightMatrix.getObservationCount();
  }
}
