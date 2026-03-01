/**
 * SpreadingActivation - Activation Propagation for Dream Engine
 * ADR-021: QE ReasoningBank - Dream Cycle Integration
 *
 * Implements spreading activation algorithm for concept association discovery.
 * Simulates neural activation patterns seen in memory consolidation during sleep.
 *
 * Features:
 * - Weighted activation spreading through concept graph
 * - Configurable decay, spread factor, and noise levels
 * - Novel association detection from co-activated nodes
 * - Dream mode with random activation injection
 *
 * @module learning/dream/spreading-activation
 */

import type {
  ConceptNode,
  ConceptEdge,
  ConceptGraphStats,
} from './types.js';
import { secureRandom, secureRandomInt } from '../../shared/utils/crypto-random.js';

// ============================================================================
// Utility: Quickselect (O(n) average k-th smallest)
// ============================================================================

/**
 * In-place quickselect: rearranges arr so arr[k] is the k-th smallest value.
 * Returns arr[k]. Average O(n), worst O(n²) but rare with random pivot.
 */
function quickselect(arr: number[], k: number): number {
  if (k < 0 || k >= arr.length) return arr[0] ?? 0;

  let left = 0;
  let right = arr.length - 1;

  while (left < right) {
    // Median-of-three pivot selection
    const mid = (left + right) >> 1;
    if (arr[mid] < arr[left]) { const t = arr[left]; arr[left] = arr[mid]; arr[mid] = t; }
    if (arr[right] < arr[left]) { const t = arr[left]; arr[left] = arr[right]; arr[right] = t; }
    if (arr[mid] < arr[right]) { const t = arr[mid]; arr[mid] = arr[right]; arr[right] = t; }
    const pivot = arr[right];

    let i = left;
    for (let j = left; j < right; j++) {
      if (arr[j] <= pivot) {
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        i++;
      }
    }
    const t = arr[i]; arr[i] = arr[right]; arr[right] = t;

    if (i === k) return arr[i];
    if (i < k) left = i + 1;
    else right = i - 1;
  }

  return arr[left];
}

// ============================================================================
// History Bounds Constants (Milestone 3.3)
// ============================================================================

/**
 * Maximum number of unique nodes to track in activation history.
 * When exceeded, oldest entries are trimmed to 80% of this limit.
 * Prevents unbounded memory growth in long-running sessions.
 */
export const MAX_ACTIVATION_HISTORY_ENTRIES = 10000;

/**
 * Maximum number of co-activation pairs to track.
 * When exceeded, least-counted pairs are removed to 80% of this limit.
 * Prevents unbounded memory growth from co-activation tracking.
 */
export const MAX_COACTIVATION_ENTRIES = 50000;

/**
 * Trim percentage - when bounds exceeded, reduce to this fraction of max
 */
export const HISTORY_TRIM_TARGET_RATIO = 0.8;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for spreading activation
 */
export interface ActivationConfig {
  /** How fast activation decays each iteration (0.1 = 10% decay). Default: 0.1 */
  decayRate: number;

  /** How much activation spreads to neighbors (0.5 = 50%). Default: 0.5 */
  spreadFactor: number;

  /** Minimum activation level to spread from a node. Default: 0.1 */
  threshold: number;

  /** Maximum iterations to prevent infinite loops. Default: 20 */
  maxIterations: number;

  /** Random noise level for dream exploration (0-1). Default: 0.05 */
  noiseLevel: number;
}

/**
 * Default activation configuration
 */
export const DEFAULT_ACTIVATION_CONFIG: ActivationConfig = {
  decayRate: 0.1,
  spreadFactor: 0.5,
  threshold: 0.1,
  maxIterations: 20,
  noiseLevel: 0.05,
};

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a spreading activation cycle
 */
export interface ActivationResult {
  /** Number of spread iterations performed */
  iterations: number;

  /** Number of nodes that became activated (above threshold) */
  nodesActivated: number;

  /** Peak activation level reached during spread */
  peakActivation: number;

  /** List of activated nodes with their final activation levels */
  activatedNodes: Array<{ nodeId: string; activation: number }>;

  /** Novel associations discovered from co-activation */
  novelAssociations: Array<{ source: string; target: string; strength: number }>;
}

// ============================================================================
// ConceptGraph Interface (minimal required interface)
// ============================================================================

/**
 * Minimal interface for ConceptGraph required by SpreadingActivation.
 * This allows the spreading activation to work with any graph implementation
 * that satisfies this contract.
 */
export interface ConceptGraph {
  /** Get a concept node by ID */
  getConcept(id: string): ConceptNode | undefined;

  /** Get all concept nodes */
  getAllConcepts(minActivation?: number): ConceptNode[];

  /** Get nodes above a certain activation threshold */
  getActiveNodes(threshold: number): ConceptNode[];

  /** Get outgoing edges from a node */
  getEdges(nodeId: string): ConceptEdge[];

  /** Check if an edge exists between two nodes */
  getEdge(source: string, target: string): ConceptEdge | undefined;

  /** Set the activation level of a node */
  setActivation(nodeId: string, level: number): void;

  /** Apply decay to all activation levels */
  decayActivations(factor: number): void;

  /** Get graph statistics */
  getStats(): ConceptGraphStats;
}

// ============================================================================
// SpreadingActivation Class
// ============================================================================

/**
 * SpreadingActivation implements neural-inspired activation spreading
 * for concept association discovery.
 *
 * @example
 * ```typescript
 * const activation = new SpreadingActivation(graph, {
 *   decayRate: 0.1,
 *   spreadFactor: 0.5,
 *   threshold: 0.1,
 * });
 *
 * // Spread from seed nodes
 * const result = await activation.spread(['pattern-1', 'pattern-2']);
 *
 * // Or run dream mode for random exploration
 * const dreamResult = await activation.dream(5000);
 * ```
 */
export class SpreadingActivation {
  private readonly graph: ConceptGraph;
  private readonly config: ActivationConfig;
  private activationHistory: Map<string, number[]> = new Map();
  private coActivationCounts: Map<string, number> = new Map();

  constructor(graph: ConceptGraph, config: Partial<ActivationConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_ACTIVATION_CONFIG, ...config };
  }

  // ==========================================================================
  // Core Spreading
  // ==========================================================================

  /**
   * Spread activation from seed nodes through the concept graph.
   *
   * Algorithm:
   * 1. Initialize seed nodes with activation
   * 2. For each iteration:
   *    a. For each active node, spread activation to neighbors (weighted by edge weight)
   *    b. Apply decay to all nodes
   *    c. Inject small random noise for exploration
   * 3. Track co-activated nodes for novel association detection
   * 4. Stop when stable or max iterations reached
   *
   * @param seedNodes - Array of node IDs to seed with initial activation
   * @param seedActivation - Initial activation level for seed nodes. Default: 1.0
   * @returns Activation result with statistics and discovered associations
   */
  async spread(
    seedNodes: string[],
    seedActivation: number = 1.0,
    deadlineMs?: number
  ): Promise<ActivationResult> {
    // Validate seed nodes
    const validSeeds = seedNodes.filter((id) => this.graph.getConcept(id) !== undefined);

    if (validSeeds.length === 0) {
      return {
        iterations: 0,
        nodesActivated: 0,
        peakActivation: 0,
        activatedNodes: [],
        novelAssociations: [],
      };
    }

    // Initialize seed nodes with activation
    for (const nodeId of validSeeds) {
      this.graph.setActivation(nodeId, seedActivation);
      this.recordActivation(nodeId, seedActivation);
    }

    let iterations = 0;
    let peakActivation = seedActivation;
    let previousActiveCount = 0;
    let stableIterations = 0;

    // Spread activation iteratively
    while (iterations < this.config.maxIterations) {
      // Respect time deadline if provided
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        break;
      }

      const nodesUpdated = await this.spreadIteration();

      // Track peak activation
      const activeNodes = this.graph.getActiveNodes(this.config.threshold);
      for (const node of activeNodes) {
        if (node.activationLevel > peakActivation) {
          peakActivation = node.activationLevel;
        }
      }

      // Check for stability (converged)
      if (activeNodes.length === previousActiveCount && nodesUpdated === 0) {
        stableIterations++;
        if (stableIterations >= 3) {
          break; // Converged
        }
      } else {
        stableIterations = 0;
      }

      previousActiveCount = activeNodes.length;
      iterations++;
    }

    // Collect final activated nodes
    const activatedNodes = this.graph
      .getActiveNodes(this.config.threshold)
      .map((node) => ({
        nodeId: node.id,
        activation: node.activationLevel,
      }))
      .sort((a, b) => b.activation - a.activation);

    // Find novel associations
    const novelAssociations = await this.findNovelAssociations(this.config.threshold);

    // Trim history to prevent unbounded growth (Milestone 3.3)
    this.trimHistory();

    return {
      iterations,
      nodesActivated: activatedNodes.length,
      peakActivation,
      activatedNodes,
      novelAssociations: novelAssociations.map((a) => ({
        source: a.source.id,
        target: a.target.id,
        strength: a.coActivation,
      })),
    };
  }

  // ==========================================================================
  // Dream Mode
  // ==========================================================================

  /**
   * Dream mode: Random activation with increased noise.
   * Simulates the "reduced logical filtering" of REM sleep.
   *
   * During dreaming:
   * - Random nodes are periodically activated
   * - Activation spreads with higher noise
   * - Novel associations are discovered from unexpected co-activations
   *
   * @param durationMs - How long to dream in milliseconds
   * @returns Activation result from the dream cycle
   */
  async dream(durationMs: number): Promise<ActivationResult> {
    const startTime = Date.now();
    const allNovelAssociations: Array<{
      source: string;
      target: string;
      strength: number;
    }> = [];
    let totalIterations = 0;
    let maxPeakActivation = 0;
    const activatedNodeSet = new Set<string>();

    // Get all available concepts
    const allConcepts = this.graph.getAllConcepts(0);

    if (allConcepts.length === 0) {
      return {
        iterations: 0,
        nodesActivated: 0,
        peakActivation: 0,
        activatedNodes: [],
        novelAssociations: [],
      };
    }

    // Dream loop with strict time enforcement
    const deadlineMs = startTime + durationMs;

    while (Date.now() < deadlineMs) {
      // Randomly select a concept to activate
      const randomIndex = secureRandomInt(0, allConcepts.length);
      const randomNode = allConcepts[randomIndex];

      if (randomNode) {
        // Apply noise to activation (dream-style random boost)
        const noiseBoost = this.config.noiseLevel + secureRandom() * this.config.noiseLevel * 2;
        const currentActivation = randomNode.activationLevel;
        const newActivation = Math.min(1, currentActivation + noiseBoost + 0.3);

        this.graph.setActivation(randomNode.id, newActivation);

        // Spread from this random activation (with deadline to prevent overrun)
        const result = await this.spread([randomNode.id], newActivation, deadlineMs);
        totalIterations += result.iterations;

        if (result.peakActivation > maxPeakActivation) {
          maxPeakActivation = result.peakActivation;
        }

        // Collect activated nodes
        for (const activated of result.activatedNodes) {
          activatedNodeSet.add(activated.nodeId);
        }

        // Collect novel associations
        for (const assoc of result.novelAssociations) {
          allNovelAssociations.push(assoc);
        }
      }

      // Check deadline again before sleeping
      if (Date.now() >= deadlineMs) break;

      // Small delay to prevent CPU spike
      await this.sleep(50 + secureRandom() * 50);
    }

    // Deduplicate and sort novel associations
    const uniqueAssociations = this.deduplicateAssociations(allNovelAssociations);

    // Collect final activated nodes
    const activatedNodes = Array.from(activatedNodeSet)
      .map((id) => {
        const node = this.graph.getConcept(id);
        return {
          nodeId: id,
          activation: node?.activationLevel ?? 0,
        };
      })
      .filter((n) => n.activation > 0)
      .sort((a, b) => b.activation - a.activation);

    // Trim history after dream cycle to prevent unbounded growth (Milestone 3.3)
    this.trimHistory();

    return {
      iterations: totalIterations,
      nodesActivated: activatedNodes.length,
      peakActivation: maxPeakActivation,
      activatedNodes,
      novelAssociations: uniqueAssociations.slice(0, 20), // Top 20
    };
  }

  // ==========================================================================
  // Novel Association Detection
  // ==========================================================================

  /**
   * Find novel associations from co-activated nodes.
   *
   * Novel associations are pairs of nodes that:
   * 1. Are both highly activated (above minActivation)
   * 2. Either have no existing edge, or have a weak edge
   * 3. Haven't been frequently co-activated before
   *
   * @param minActivation - Minimum activation level to consider. Default: threshold
   * @returns Array of novel associations with source, target, and co-activation strength
   */
  async findNovelAssociations(
    minActivation?: number
  ): Promise<
    Array<{
      source: ConceptNode;
      target: ConceptNode;
      coActivation: number;
      isNovel: boolean;
    }>
  > {
    const threshold = minActivation ?? this.config.threshold;
    let activeNodes = this.graph.getActiveNodes(threshold);

    if (activeNodes.length < 2) {
      return [];
    }

    // Cap active nodes to avoid O(n²) pair enumeration (only top 10 results returned)
    const MAX_ACTIVE_NODES = 200;
    if (activeNodes.length > MAX_ACTIVE_NODES) {
      activeNodes = activeNodes
        .sort((a, b) => b.activationLevel - a.activationLevel)
        .slice(0, MAX_ACTIVE_NODES);
    }

    const associations: Array<{
      source: ConceptNode;
      target: ConceptNode;
      coActivation: number;
      isNovel: boolean;
    }> = [];

    // Find pairs of co-activated nodes
    for (let i = 0; i < activeNodes.length; i++) {
      for (let j = i + 1; j < activeNodes.length; j++) {
        const nodeA = activeNodes[i];
        const nodeB = activeNodes[j];

        // Calculate co-activation strength (geometric mean of activations)
        const coActivation = Math.sqrt(
          nodeA.activationLevel * nodeB.activationLevel
        );

        // Check if edge exists
        const existingEdge = this.graph.getEdge(nodeA.id, nodeB.id);
        const reverseEdge = this.graph.getEdge(nodeB.id, nodeA.id);
        const hasEdge = existingEdge !== undefined || reverseEdge !== undefined;

        // Determine novelty (no edge or weak edge = novel)
        const edgeWeight = existingEdge?.weight ?? reverseEdge?.weight ?? 0;
        const isNovel = !hasEdge || edgeWeight < 0.3;

        // Only add if co-activation is significant
        if (coActivation > 0.3) {
          associations.push({
            source: nodeA,
            target: nodeB,
            coActivation,
            isNovel,
          });

          // Track co-activation for history
          this.trackCoActivation(nodeA.id, nodeB.id);
        }
      }
    }

    // Sort by novelty and co-activation strength
    return associations
      .sort((a, b) => {
        // Novel associations first, then by co-activation strength
        if (a.isNovel !== b.isNovel) {
          return a.isNovel ? -1 : 1;
        }
        return b.coActivation - a.coActivation;
      })
      .slice(0, 10); // Top 10 associations
  }

  // ==========================================================================
  // State Management
  // ==========================================================================

  /**
   * Reset all activations to zero and clear history
   */
  async reset(): Promise<void> {
    const allNodes = this.graph.getAllConcepts(0);
    for (const node of allNodes) {
      this.graph.setActivation(node.id, 0);
    }
    this.activationHistory.clear();
    this.coActivationCounts.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): ActivationConfig {
    return { ...this.config };
  }

  // ==========================================================================
  // History Bounds Management (Milestone 3.3)
  // ==========================================================================

  /**
   * Trim activation history when it exceeds MAX_ACTIVATION_HISTORY_ENTRIES.
   * Removes oldest entries (based on Map insertion order) to reach 80% of max.
   * This prevents unbounded memory growth in long-running sessions.
   */
  private trimActivationHistory(): void {
    if (this.activationHistory.size <= MAX_ACTIVATION_HISTORY_ENTRIES) {
      return;
    }

    const targetSize = Math.floor(MAX_ACTIVATION_HISTORY_ENTRIES * HISTORY_TRIM_TARGET_RATIO);
    const entriesToRemove = this.activationHistory.size - targetSize;

    // Maps maintain insertion order, so first entries are oldest
    const keys = Array.from(this.activationHistory.keys()).slice(0, entriesToRemove);
    for (const key of keys) {
      this.activationHistory.delete(key);
    }
  }

  /**
   * Trim co-activation counts when they exceed MAX_COACTIVATION_ENTRIES.
   * Removes least-frequent pairs to reach 80% of max.
   * This prevents unbounded memory growth from co-activation tracking.
   */
  private trimCoActivationCounts(): void {
    if (this.coActivationCounts.size <= MAX_COACTIVATION_ENTRIES) {
      return;
    }

    const targetSize = Math.floor(MAX_COACTIVATION_ENTRIES * HISTORY_TRIM_TARGET_RATIO);
    const entriesToRemove = this.coActivationCounts.size - targetSize;

    // O(n) quickselect to find threshold instead of O(n log n) full sort
    const values = Array.from(this.coActivationCounts.values());
    const threshold = quickselect(values, entriesToRemove - 1);

    // Remove entries at or below threshold
    const toDelete: string[] = [];
    for (const [key, count] of this.coActivationCounts) {
      if (toDelete.length >= entriesToRemove) break;
      if (count <= threshold) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.coActivationCounts.delete(key);
    }
  }

  /**
   * Trim both history maps if they exceed their bounds.
   * Should be called after each activation cycle.
   */
  private trimHistory(): void {
    this.trimActivationHistory();
    this.trimCoActivationCounts();
  }

  /**
   * Get current history sizes for monitoring/testing.
   * @returns Object with activation history and co-activation counts sizes
   */
  getHistorySizes(): { activationHistorySize: number; coActivationCountsSize: number } {
    return {
      activationHistorySize: this.activationHistory.size,
      coActivationCountsSize: this.coActivationCounts.size,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Perform one iteration of activation spreading
   * @returns Number of nodes that had their activation updated
   */
  private async spreadIteration(): Promise<number> {
    const activeNodes = this.graph.getActiveNodes(this.config.threshold);
    let nodesUpdated = 0;

    // Collect all activation updates first (to avoid modifying during iteration)
    const updates: Array<{ nodeId: string; newActivation: number }> = [];

    for (const activeNode of activeNodes) {
      const edges = this.graph.getEdges(activeNode.id);

      for (const edge of edges) {
        const targetNode = this.graph.getConcept(edge.target);
        if (!targetNode) continue;

        // Calculate spread amount
        const spreadAmount =
          activeNode.activationLevel * edge.weight * this.config.spreadFactor;

        // Only spread if significant
        if (spreadAmount > 0.01) {
          const currentActivation = targetNode.activationLevel;
          const newActivation = Math.min(1, currentActivation + spreadAmount);

          updates.push({ nodeId: edge.target, newActivation });
        }
      }
    }

    // Apply updates
    for (const update of updates) {
      const currentNode = this.graph.getConcept(update.nodeId);
      if (currentNode && update.newActivation > currentNode.activationLevel) {
        this.graph.setActivation(update.nodeId, update.newActivation);
        this.recordActivation(update.nodeId, update.newActivation);
        nodesUpdated++;
      }
    }

    // Apply decay to all nodes
    this.applyDecay();

    // Inject noise for exploration
    this.injectNoise();

    return nodesUpdated;
  }

  /**
   * Apply decay to all activation levels
   */
  private applyDecay(): void {
    // Use the decay method on the graph
    // decayRate of 0.1 means 10% decay, so multiply by 0.9
    const decayFactor = 1 - this.config.decayRate;
    this.graph.decayActivations(decayFactor);
  }

  /**
   * Inject small random noise to activations for exploration
   */
  private injectNoise(): void {
    if (this.config.noiseLevel <= 0) return;

    const allNodes = this.graph.getAllConcepts(0);
    for (const node of allNodes) {
      if (node.activationLevel > 0) {
        // Add small random noise (positive or negative)
        const noise = (secureRandom() - 0.5) * 2 * this.config.noiseLevel;
        const newActivation = Math.max(0, Math.min(1, node.activationLevel + noise));
        this.graph.setActivation(node.id, newActivation);
      }
    }
  }

  /**
   * Record activation level for history tracking
   */
  private recordActivation(nodeId: string, level: number): void {
    const history = this.activationHistory.get(nodeId) || [];
    history.push(level);

    // Keep only recent history (last 50 activations)
    if (history.length > 50) {
      history.shift();
    }

    this.activationHistory.set(nodeId, history);
  }

  /**
   * Track co-activation between two nodes
   */
  private trackCoActivation(nodeA: string, nodeB: string): void {
    const key = [nodeA, nodeB].sort().join(':');
    const count = this.coActivationCounts.get(key) || 0;
    this.coActivationCounts.set(key, count + 1);
  }

  /**
   * Deduplicate associations by keeping the strongest
   */
  private deduplicateAssociations(
    associations: Array<{ source: string; target: string; strength: number }>
  ): Array<{ source: string; target: string; strength: number }> {
    const unique = new Map<string, { source: string; target: string; strength: number }>();

    for (const assoc of associations) {
      const key = [assoc.source, assoc.target].sort().join(':');
      const existing = unique.get(key);

      if (!existing || assoc.strength > existing.strength) {
        unique.set(key, assoc);
      }
    }

    return Array.from(unique.values()).sort((a, b) => b.strength - a.strength);
  }

  /**
   * Helper to sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default SpreadingActivation;
