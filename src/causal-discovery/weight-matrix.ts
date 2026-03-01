/**
 * Agentic QE v3 - Causal Weight Matrix
 * ADR-035: STDP-based spike timing correlation for root cause analysis
 *
 * Implements the core STDP (Spike-Timing Dependent Plasticity) learning rule:
 * - If event A consistently precedes event B (positive dt), weight A->B increases
 * - If event A consistently follows event B (negative dt), weight A->B decreases
 * - This naturally encodes Granger-like causality in the weight matrix
 */

import {
  CausalDiscoveryConfig,
  DEFAULT_CAUSAL_CONFIG,
  TestEvent,
  TestEventType,
  CausalGraph,
  CausalEdge,
  WeightEntry,
  WeightMatrixStats,
  STDPParams,
  DEFAULT_STDP_PARAMS,
} from './types';
import { CausalGraphImpl } from './causal-graph';

/**
 * Causal Weight Matrix using STDP learning rule
 *
 * The weight matrix W[i][j] represents the causal strength from event i to event j.
 * Positive weights indicate "causes" relationships, negative weights indicate "prevents".
 *
 * STDP Rule:
 * - W(dt) = A+ * exp(-dt/tau+) for dt > 0 (pre before post -> strengthen)
 * - W(dt) = -A- * exp(dt/tau-) for dt < 0 (post before pre -> weaken)
 */
export class CausalWeightMatrix {
  /** Weight entries keyed by "source->target" */
  private weights: Map<string, WeightEntry> = new Map();

  /** Last spike time for each event type */
  private lastSpikeTime: Map<TestEventType, number> = new Map();

  /** STDP parameters */
  private readonly stdpParams: STDPParams;

  /** Configuration */
  private readonly config: CausalDiscoveryConfig;

  /** Total observations counter */
  private observationCount: number = 0;

  constructor(
    config: Partial<CausalDiscoveryConfig> = {},
    stdpParams: Partial<STDPParams> = {}
  ) {
    this.config = { ...DEFAULT_CAUSAL_CONFIG, ...config };
    this.stdpParams = { ...DEFAULT_STDP_PARAMS, ...stdpParams };
  }

  /**
   * Get the edge key for a source-target pair
   */
  private getKey(source: TestEventType, target: TestEventType): string {
    return `${source}->${target}`;
  }

  /**
   * Parse an edge key back to source and target
   */
  private parseKey(key: string): { source: TestEventType; target: TestEventType } {
    const [source, target] = key.split('->') as [TestEventType, TestEventType];
    return { source, target };
  }

  /**
   * Get causal weight from source to target
   */
  getWeight(source: TestEventType, target: TestEventType): number {
    const entry = this.weights.get(this.getKey(source, target));
    return entry?.weight ?? 0;
  }

  /**
   * Get full weight entry for a source-target pair
   */
  getWeightEntry(source: TestEventType, target: TestEventType): WeightEntry | undefined {
    return this.weights.get(this.getKey(source, target));
  }

  /**
   * Set causal weight directly (for testing or initialization)
   */
  setWeight(source: TestEventType, target: TestEventType, weight: number): void {
    const key = this.getKey(source, target);
    const existing = this.weights.get(key);

    this.weights.set(key, {
      weight,
      observations: existing?.observations ?? 0,
      lastUpdate: Date.now(),
      avgTimingDiff: existing?.avgTimingDiff ?? 0,
    });
  }

  /**
   * STDP positive timing function (pre before post -> potentiation)
   * Returns weight change for positive timing difference
   */
  private stdpPositive(dt: number): number {
    if (dt <= 0 || dt > this.config.timeWindow) {
      return 0;
    }
    // Exponential decay: A+ * exp(-dt/tau+)
    return this.stdpParams.aPlus * Math.exp(-dt / this.stdpParams.tauPlus);
  }

  /**
   * STDP negative timing function (post before pre -> depression)
   * Returns weight change for negative timing difference
   */
  private stdpNegative(dt: number): number {
    if (dt <= 0 || dt > this.config.timeWindow) {
      return 0;
    }
    // Exponential decay: -A- * exp(-dt/tau-)
    return -this.stdpParams.aMinus * Math.exp(-dt / this.stdpParams.tauMinus);
  }

  /**
   * Update weights based on a new event using asymmetric STDP rule
   *
   * For each pair (otherEvent, currentEvent):
   * - If otherEvent preceded currentEvent (dt > 0), strengthen otherEvent->currentEvent
   * - If currentEvent preceded otherEvent (dt < 0), weaken currentEvent->otherEvent
   */
  updateWeights(event: TestEvent): void {
    const currentTime = event.timestamp;
    const currentType = event.type;
    this.observationCount++;

    // Update weights based on timing relative to all other event types
    for (const [otherType, lastTime] of this.lastSpikeTime.entries()) {
      if (otherType === currentType) continue;

      const dt = currentTime - lastTime;

      if (dt > 0 && dt < this.config.timeWindow) {
        // Other event preceded this one -> otherType may CAUSE currentType
        // Apply potentiation to otherType->currentType edge
        const weightChange = this.stdpPositive(dt);
        if (weightChange > 0) {
          this.applyWeightChange(otherType, currentType, weightChange, dt);
        }
      } else if (dt < 0 && Math.abs(dt) < this.config.timeWindow) {
        // This event preceded other -> apply depression
        // This shouldn't happen in forward time, but handle for robustness
        const weightChange = this.stdpNegative(Math.abs(dt));
        if (weightChange !== 0) {
          this.applyWeightChange(currentType, otherType, weightChange, Math.abs(dt));
        }
      }
    }

    // Record this event's spike time
    this.lastSpikeTime.set(currentType, currentTime);
  }

  /**
   * Apply a weight change to an edge with proper tracking
   */
  private applyWeightChange(
    source: TestEventType,
    target: TestEventType,
    change: number,
    dt: number
  ): void {
    const key = this.getKey(source, target);
    const existing = this.weights.get(key);

    const currentWeight = existing?.weight ?? 0;
    const currentObs = existing?.observations ?? 0;
    const currentAvgDt = existing?.avgTimingDiff ?? 0;

    // Apply learning rate to weight change
    const scaledChange = change * this.config.learningRate;
    const newWeight = currentWeight + scaledChange;

    // Update running average of timing difference
    const newAvgDt = currentObs === 0 ? dt : (currentAvgDt * currentObs + dt) / (currentObs + 1);

    this.weights.set(key, {
      weight: newWeight,
      observations: currentObs + 1,
      lastUpdate: Date.now(),
      avgTimingDiff: newAvgDt,
    });
  }

  /**
   * Process a batch of events in chronological order
   */
  updateWeightsBatch(events: TestEvent[]): void {
    // Sort by timestamp to ensure proper temporal ordering
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
    for (const event of sortedEvents) {
      this.updateWeights(event);
    }
  }

  /**
   * Apply decay to all weights to prevent unbounded growth
   * Should be called periodically (e.g., after each batch of events)
   */
  decay(): void {
    const toDelete: string[] = [];

    for (const [key, entry] of this.weights.entries()) {
      const decayedWeight = entry.weight * (1 - this.config.decayRate);

      // Remove near-zero weights to maintain sparsity
      if (Math.abs(decayedWeight) < 0.001) {
        toDelete.push(key);
      } else {
        this.weights.set(key, {
          ...entry,
          weight: decayedWeight,
        });
      }
    }

    // Clean up negligible weights
    for (const key of toDelete) {
      this.weights.delete(key);
    }
  }

  /**
   * Apply decay based on elapsed time
   */
  decayByTime(elapsedMs: number): void {
    const decayFactor = Math.exp(-this.config.decayRate * elapsedMs / 1000);
    const toDelete: string[] = [];

    for (const [key, entry] of this.weights.entries()) {
      const decayedWeight = entry.weight * decayFactor;

      if (Math.abs(decayedWeight) < 0.001) {
        toDelete.push(key);
      } else {
        this.weights.set(key, {
          ...entry,
          weight: decayedWeight,
        });
      }
    }

    for (const key of toDelete) {
      this.weights.delete(key);
    }
  }

  /**
   * Extract causal graph from learned weights
   * Only includes edges above the causal threshold
   */
  extractCausalGraph(): CausalGraph {
    const nodes = new Set<TestEventType>();
    const edges: CausalEdge[] = [];

    for (const [key, entry] of this.weights.entries()) {
      const { source, target } = this.parseKey(key);

      // Only include edges above threshold
      if (Math.abs(entry.weight) > this.config.causalThreshold) {
        nodes.add(source);
        nodes.add(target);

        edges.push({
          source,
          target,
          strength: Math.abs(entry.weight),
          relation: entry.weight > 0 ? 'causes' : 'prevents',
          observations: entry.observations,
          lastObserved: entry.lastUpdate,
        });
      }
    }

    return new CausalGraphImpl(Array.from(nodes), edges);
  }

  /**
   * Get all edges for a specific source event
   */
  getEdgesFrom(source: TestEventType): CausalEdge[] {
    const edges: CausalEdge[] = [];

    for (const [key, entry] of this.weights.entries()) {
      const parsed = this.parseKey(key);
      if (parsed.source === source && Math.abs(entry.weight) > this.config.causalThreshold) {
        edges.push({
          source: parsed.source,
          target: parsed.target,
          strength: Math.abs(entry.weight),
          relation: entry.weight > 0 ? 'causes' : 'prevents',
          observations: entry.observations,
          lastObserved: entry.lastUpdate,
        });
      }
    }

    return edges.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get all edges pointing to a specific target event
   */
  getEdgesTo(target: TestEventType): CausalEdge[] {
    const edges: CausalEdge[] = [];

    for (const [key, entry] of this.weights.entries()) {
      const parsed = this.parseKey(key);
      if (parsed.target === target && Math.abs(entry.weight) > this.config.causalThreshold) {
        edges.push({
          source: parsed.source,
          target: parsed.target,
          strength: Math.abs(entry.weight),
          relation: entry.weight > 0 ? 'causes' : 'prevents',
          observations: entry.observations,
          lastObserved: entry.lastUpdate,
        });
      }
    }

    return edges.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get statistics about the weight matrix
   */
  getStats(): WeightMatrixStats {
    let nonZeroWeights = 0;
    let sumAbsWeight = 0;
    let maxAbsWeight = 0;
    let totalObservations = 0;

    for (const entry of this.weights.values()) {
      if (Math.abs(entry.weight) > this.config.causalThreshold) {
        nonZeroWeights++;
        sumAbsWeight += Math.abs(entry.weight);
        maxAbsWeight = Math.max(maxAbsWeight, Math.abs(entry.weight));
        totalObservations += entry.observations;
      }
    }

    const numEventTypes = this.lastSpikeTime.size;
    const totalPossible = numEventTypes * (numEventTypes - 1);

    return {
      nonZeroWeights,
      totalPossible,
      sparsity: totalPossible > 0 ? 1 - nonZeroWeights / totalPossible : 1,
      avgAbsWeight: nonZeroWeights > 0 ? sumAbsWeight / nonZeroWeights : 0,
      maxAbsWeight,
      totalObservations,
    };
  }

  /**
   * Get the total number of observations
   */
  getObservationCount(): number {
    return this.observationCount;
  }

  /**
   * Get all unique event types that have been observed
   */
  getObservedEventTypes(): TestEventType[] {
    return Array.from(this.lastSpikeTime.keys());
  }

  /**
   * Reset the weight matrix to initial state
   */
  reset(): void {
    this.weights.clear();
    this.lastSpikeTime.clear();
    this.observationCount = 0;
  }

  /**
   * Serialize the weight matrix to a JSON-compatible object
   */
  toJSON(): Record<string, WeightEntry> {
    const result: Record<string, WeightEntry> = {};
    for (const [key, entry] of this.weights.entries()) {
      result[key] = entry;
    }
    return result;
  }

  /**
   * Deserialize from a JSON object
   */
  fromJSON(data: Record<string, WeightEntry>): void {
    this.weights.clear();
    for (const [key, entry] of Object.entries(data)) {
      this.weights.set(key, entry);
    }
  }

  /**
   * Merge weights from another matrix (for distributed learning)
   */
  merge(other: CausalWeightMatrix, mergeRatio: number = 0.5): void {
    // Get all unique keys from both matrices
    const allKeys = new Set([...this.weights.keys()]);
    const otherData = other.toJSON();
    for (const key of Object.keys(otherData)) {
      allKeys.add(key);
    }

    for (const key of allKeys) {
      const thisEntry = this.weights.get(key);
      const otherEntry = otherData[key];

      if (thisEntry && otherEntry) {
        // Average the weights based on merge ratio
        const mergedWeight =
          thisEntry.weight * (1 - mergeRatio) + otherEntry.weight * mergeRatio;
        const mergedObs = thisEntry.observations + otherEntry.observations;
        const mergedAvgDt =
          (thisEntry.avgTimingDiff * thisEntry.observations +
            otherEntry.avgTimingDiff * otherEntry.observations) /
          mergedObs;

        this.weights.set(key, {
          weight: mergedWeight,
          observations: mergedObs,
          lastUpdate: Math.max(thisEntry.lastUpdate, otherEntry.lastUpdate),
          avgTimingDiff: mergedAvgDt,
        });
      } else if (otherEntry) {
        // Only in other, scale by merge ratio
        this.weights.set(key, {
          ...otherEntry,
          weight: otherEntry.weight * mergeRatio,
        });
      }
      // If only in this, no change needed
    }
  }
}
