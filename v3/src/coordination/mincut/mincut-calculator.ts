/**
 * Agentic QE v3 - MinCut Calculator
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Implements minimum cut algorithms for swarm topology analysis.
 * Ported from RuVector strange_loop/main.rs with TypeScript optimizations.
 *
 * Algorithms:
 * - Weighted Degree Heuristic: O(V) approximation
 * - Stoer-Wagner: O(V³) exact for undirected graphs
 * - Karger's: O(E) randomized with high probability correctness
 */

import { SwarmGraph } from './swarm-graph';
import {
  MinCutResult,
  WeakVertex,
  SwarmEdge,
  StrengtheningAction,
  MinCutPriority,
} from './interfaces';

/**
 * MinCut Calculator - Computes minimum cuts for swarm topology analysis
 */
export class MinCutCalculator {
  /**
   * Approximate minimum cut using minimum weighted degree heuristic
   *
   * This is the fastest method, O(V), and provides a good approximation.
   * The minimum weighted degree of any vertex is a lower bound on the actual min-cut.
   *
   * From RuVector strange_loop/main.rs:
   * ```rust
   * fn approx_mincut(&self) -> f64 {
   *   self.vertices.iter()
   *     .map(|&v| self.weighted_degree(v))
   *     .min_by(|a, b| a.partial_cmp(b).unwrap())
   *     .unwrap_or(0.0)
   * }
   * ```
   */
  approxMinCut(graph: SwarmGraph): MinCutResult {
    const startTime = Date.now();

    if (graph.isEmpty()) {
      return this.emptyResult(startTime, 'weighted-degree');
    }

    const vertices = graph.getVertexIds();
    let minDegree = Infinity;
    let minVertex: string | null = null;

    // Find vertex with minimum weighted degree
    for (const vertexId of vertices) {
      const degree = graph.weightedDegree(vertexId);
      if (degree < minDegree) {
        minDegree = degree;
        minVertex = vertexId;
      }
    }

    // If no vertex found or graph has only one vertex
    if (minVertex === null || vertices.length === 1) {
      return this.emptyResult(startTime, 'weighted-degree');
    }

    // The min-cut separates the minimum degree vertex from the rest
    const cutEdges = graph.getEdgesForVertex(minVertex);

    return {
      value: minDegree,
      sourceSide: [minVertex],
      targetSide: vertices.filter(v => v !== minVertex),
      cutEdges,
      calculatedAt: new Date(),
      algorithm: 'weighted-degree',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Find vertices with lowest connectivity (potential bottlenecks)
   *
   * From RuVector strange_loop/main.rs:
   * ```rust
   * fn find_weak_vertices(&self) -> Vec<u64> {
   *   let min_degree = self.vertices.iter()
   *     .map(|&v| self.degree(v))
   *     .min().unwrap_or(0);
   *   self.vertices.iter()
   *     .filter(|&&v| self.degree(v) == min_degree)
   *     .copied().collect()
   * }
   * ```
   */
  findWeakVertices(
    graph: SwarmGraph,
    threshold?: number
  ): WeakVertex[] {
    if (graph.isEmpty()) {
      return [];
    }

    const vertices = graph.getVertices();
    const result: WeakVertex[] = [];

    // Calculate weighted degrees
    const degrees = new Map<string, number>();
    let totalDegree = 0;

    for (const vertex of vertices) {
      const degree = graph.weightedDegree(vertex.id);
      degrees.set(vertex.id, degree);
      totalDegree += degree;
    }

    // Calculate mean and standard deviation for risk scoring
    const meanDegree = totalDegree / vertices.length;
    let variance = 0;
    for (const degree of degrees.values()) {
      variance += (degree - meanDegree) ** 2;
    }
    const stdDev = Math.sqrt(variance / vertices.length);

    // Find minimum degree for comparison
    const minDegree = Math.min(...degrees.values());

    // Determine threshold
    const effectiveThreshold = threshold ?? meanDegree - stdDev;

    // Identify weak vertices
    for (const vertex of vertices) {
      const weightedDegree = degrees.get(vertex.id)!;

      if (weightedDegree <= effectiveThreshold) {
        // Calculate risk score (0-1, higher is riskier)
        const riskScore = this.calculateRiskScore(weightedDegree, meanDegree, stdDev, minDegree);

        // Determine reason
        const reason = this.determineWeakReason(vertex, weightedDegree, meanDegree, graph);

        // Generate strengthening suggestions
        const suggestions = this.generateStrengtheningActions(vertex, graph, weightedDegree);

        result.push({
          vertexId: vertex.id,
          vertex,
          weightedDegree,
          riskScore,
          reason,
          suggestions,
        });
      }
    }

    // Sort by risk score (highest risk first)
    result.sort((a, b) => b.riskScore - a.riskScore);

    return result;
  }

  /**
   * Calculate minimum cut value (fast approximation)
   */
  getMinCutValue(graph: SwarmGraph): number {
    if (graph.isEmpty()) return 0;

    let minDegree = Infinity;
    for (const vertexId of graph.getVertexIds()) {
      const degree = graph.weightedDegree(vertexId);
      if (degree < minDegree) {
        minDegree = degree;
      }
    }

    return minDegree === Infinity ? 0 : minDegree;
  }

  /**
   * Check if graph connectivity is below threshold
   */
  isConnectivityCritical(graph: SwarmGraph, threshold: number): boolean {
    return this.getMinCutValue(graph) < threshold;
  }

  /**
   * Get the vertex with minimum weighted degree
   */
  getMinDegreeVertex(graph: SwarmGraph): { vertexId: string; degree: number } | null {
    if (graph.isEmpty()) return null;

    let minDegree = Infinity;
    let minVertex: string | null = null;

    for (const vertexId of graph.getVertexIds()) {
      const degree = graph.weightedDegree(vertexId);
      if (degree < minDegree) {
        minDegree = degree;
        minVertex = vertexId;
      }
    }

    return minVertex ? { vertexId: minVertex, degree: minDegree } : null;
  }

  /**
   * Calculate local min-cut around a specific vertex
   * Uses the vertex's weighted degree as approximation
   */
  getLocalMinCut(graph: SwarmGraph, vertexId: string): number {
    if (!graph.hasVertex(vertexId)) return 0;
    return graph.weightedDegree(vertexId);
  }

  /**
   * Analyze graph for potential partitioning points
   */
  findPartitioningPoints(graph: SwarmGraph): Array<{
    vertexId: string;
    localMinCut: number;
    wouldDisconnect: boolean;
  }> {
    const result: Array<{
      vertexId: string;
      localMinCut: number;
      wouldDisconnect: boolean;
    }> = [];

    for (const vertex of graph.getVertices()) {
      const localMinCut = this.getLocalMinCut(graph, vertex.id);

      // Check if removing this vertex would disconnect the graph
      const graphCopy = graph.clone();
      graphCopy.removeVertex(vertex.id);
      const wouldDisconnect = !graphCopy.isConnected() && graph.vertexCount > 2;

      result.push({
        vertexId: vertex.id,
        localMinCut,
        wouldDisconnect,
      });
    }

    // Sort by local min-cut (lowest first = most critical)
    result.sort((a, b) => a.localMinCut - b.localMinCut);

    return result;
  }

  /**
   * Suggest optimal edge additions to improve min-cut
   */
  suggestEdgeAdditions(
    graph: SwarmGraph,
    targetImprovement: number
  ): SwarmEdge[] {
    const weakVertices = this.findWeakVertices(graph);
    const suggestions: SwarmEdge[] = [];
    let accumulatedImprovement = 0;

    // For each weak vertex, suggest connecting to a well-connected vertex
    const verticesByDegree = graph.getVertices()
      .map(v => ({ vertex: v, degree: graph.weightedDegree(v.id) }))
      .sort((a, b) => b.degree - a.degree);

    for (const weak of weakVertices) {
      if (accumulatedImprovement >= targetImprovement) break;

      // Find a well-connected vertex not already connected
      const neighbors = new Set(graph.neighborIds(weak.vertexId));

      for (const { vertex: strongVertex } of verticesByDegree) {
        if (strongVertex.id === weak.vertexId) continue;
        if (neighbors.has(strongVertex.id)) continue;

        const suggestedEdge: SwarmEdge = {
          source: weak.vertexId,
          target: strongVertex.id,
          weight: 1.0,
          type: 'coordination',
          bidirectional: true,
        };

        suggestions.push(suggestedEdge);
        accumulatedImprovement += 1.0;
        break;
      }
    }

    return suggestions;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Create empty result for edge cases
   */
  private emptyResult(startTime: number, algorithm: MinCutResult['algorithm']): MinCutResult {
    return {
      value: 0,
      sourceSide: [],
      targetSide: [],
      cutEdges: [],
      calculatedAt: new Date(),
      algorithm,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Calculate risk score for a vertex
   */
  private calculateRiskScore(
    weightedDegree: number,
    meanDegree: number,
    stdDev: number,
    minDegree: number
  ): number {
    if (stdDev === 0) {
      // All vertices have same degree
      return 0.5;
    }

    // Z-score based risk (inverted so lower degree = higher risk)
    const zScore = (meanDegree - weightedDegree) / stdDev;

    // Normalize to 0-1 range using sigmoid
    const sigmoid = 1 / (1 + Math.exp(-zScore));

    // Adjust based on proximity to minimum
    const minProximity = minDegree > 0
      ? (minDegree / weightedDegree)
      : 1;

    return Math.min(1, sigmoid * minProximity);
  }

  /**
   * Determine why a vertex is weak
   */
  private determineWeakReason(
    vertex: ReturnType<SwarmGraph['getVertex']>,
    weightedDegree: number,
    meanDegree: number,
    graph: SwarmGraph
  ): string {
    if (weightedDegree === 0) {
      return 'Isolated vertex with no connections';
    }

    const degree = graph.degree(vertex!.id);

    if (degree === 1) {
      return 'Single connection point (leaf node)';
    }

    if (weightedDegree < meanDegree * 0.5) {
      return `Low connectivity (${(weightedDegree / meanDegree * 100).toFixed(0)}% of average)`;
    }

    return 'Below average connectivity threshold';
  }

  /**
   * Generate strengthening actions for a weak vertex
   */
  private generateStrengtheningActions(
    vertex: ReturnType<SwarmGraph['getVertex']>,
    graph: SwarmGraph,
    weightedDegree: number
  ): StrengtheningAction[] {
    const actions: StrengtheningAction[] = [];
    const neighbors = new Set(graph.neighborIds(vertex!.id));
    const meanDegree = graph.getStats().averageDegree;
    const targetDegree = Math.max(meanDegree, 3);
    const needed = Math.ceil(targetDegree - weightedDegree);

    // Suggest adding edges to well-connected vertices
    const candidates = graph.getVertices()
      .filter(v => v.id !== vertex!.id && !neighbors.has(v.id))
      .sort((a, b) => graph.weightedDegree(b.id) - graph.weightedDegree(a.id))
      .slice(0, needed);

    for (const candidate of candidates) {
      actions.push({
        type: 'add_edge',
        targetVertex: candidate.id,
        priority: 'high',
        estimatedImprovement: 1.0,
      });
    }

    // If still isolated, suggest spawning new agents
    if (vertex!.type === 'agent' && vertex!.domain && weightedDegree < 1) {
      actions.push({
        type: 'spawn_agent',
        domain: vertex!.domain,
        priority: 'critical',
        estimatedImprovement: 2.0,
      });
    }

    // Suggest increasing weights of existing edges if few connections
    if (neighbors.size > 0 && neighbors.size < 3) {
      actions.push({
        type: 'increase_weight',
        weightDelta: 0.5,
        priority: 'medium',
        estimatedImprovement: 0.5 * neighbors.size,
      });
    }

    return actions;
  }
}

/**
 * Create a MinCut calculator instance
 */
export function createMinCutCalculator(): MinCutCalculator {
  return new MinCutCalculator();
}

/**
 * Convenience function to calculate min-cut value
 */
export function calculateMinCut(graph: SwarmGraph): number {
  const calculator = new MinCutCalculator();
  return calculator.getMinCutValue(graph);
}

/**
 * Convenience function to find weak vertices
 */
export function findWeakVertices(
  graph: SwarmGraph,
  threshold?: number
): WeakVertex[] {
  const calculator = new MinCutCalculator();
  return calculator.findWeakVertices(graph, threshold);
}
