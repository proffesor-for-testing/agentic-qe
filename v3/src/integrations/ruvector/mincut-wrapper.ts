/**
 * QE Wrapper for MinCut Calculator
 *
 * This wrapper provides a QE-specific interface on top of the TypeScript
 * MinCutCalculator (v3/src/coordination/mincut/mincut-calculator.ts).
 * Follows the same pattern as gnn-wrapper.ts and sona-wrapper.ts.
 *
 * ADR-068: Mincut-Gated Model Routing
 *
 * @module integrations/ruvector/mincut-wrapper
 */

import { MinCutCalculator } from '../../coordination/mincut/mincut-calculator.js';
import { SwarmGraph } from '../../coordination/mincut/swarm-graph.js';
import type { SwarmVertex, SwarmEdge } from '../../coordination/mincut/interfaces.js';

// ============================================================================
// QE-Specific MinCut Types
// ============================================================================

/**
 * Task graph node representing a task or agent in the routing context
 */
export interface TaskGraphNode {
  /** Unique node identifier */
  readonly id: string;

  /** Node label for display */
  readonly label: string;

  /**
   * Node type:
   * - 'task': A task to be routed
   * - 'agent': An agent in the fleet
   * - 'domain': A domain grouping
   */
  readonly type: 'task' | 'agent' | 'domain';

  /** Associated domain name */
  readonly domain?: string;

  /** Node weight (importance) */
  readonly weight: number;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Edge connecting two nodes in the task graph
 */
export interface TaskGraphEdge {
  /** Source node ID */
  readonly source: string;

  /** Target node ID */
  readonly target: string;

  /** Edge weight representing connection strength */
  readonly weight: number;

  /** Edge type */
  readonly edgeType: 'dependency' | 'communication' | 'coordination' | 'workflow';
}

/**
 * Task graph used for mincut-based routing analysis
 */
export interface TaskGraph {
  /** All nodes in the graph */
  readonly nodes: TaskGraphNode[];

  /** All edges in the graph */
  readonly edges: TaskGraphEdge[];
}

/**
 * An agent node in the fleet topology
 */
export interface AgentNode {
  /** Agent identifier */
  readonly id: string;

  /** Agent display name */
  readonly name: string;

  /** Agent domain */
  readonly domain: string;

  /** Agent capabilities */
  readonly capabilities: string[];

  /** IDs of agents this one depends on */
  readonly dependsOn: string[];

  /** Agent importance weight (0-1) */
  readonly weight: number;
}

/**
 * Routing tier determined by mincut analysis
 */
export interface RoutingTier {
  /** Numeric tier (1 = Haiku, 2 = Sonnet, 3+ = Opus) */
  readonly tier: number;

  /** Tier label */
  readonly label: string;

  /** Lambda value that determined this tier */
  readonly lambda: number;

  /** Normalized lambda (0-1) */
  readonly normalizedLambda: number;

  /** Confidence in the routing decision */
  readonly confidence: number;

  /** Explanation of why this tier was selected */
  readonly rationale: string;
}

/**
 * Health report from structural analysis
 */
export interface HealthReport {
  /** Overall lambda (min-cut value) */
  readonly lambda: number;

  /** Normalized lambda (0-1, higher = healthier) */
  readonly normalizedLambda: number;

  /** Whether the fleet is structurally healthy */
  readonly healthy: boolean;

  /** Vertices identified as weak points */
  readonly weakPoints: string[];

  /** Risk score (0-1, higher = riskier) */
  readonly riskScore: number;

  /** Number of connected components */
  readonly componentCount: number;

  /** Whether the graph is fully connected */
  readonly isConnected: boolean;

  /** Suggestions for improving structural health */
  readonly suggestions: string[];

  /** Timestamp of analysis */
  readonly analyzedAt: Date;
}

// ============================================================================
// QEMinCutService
// ============================================================================

/**
 * QE MinCut Service - Unified interface over the TypeScript MinCutCalculator
 *
 * Provides mincut-based graph analysis for routing decisions, fleet health
 * monitoring, and structural complexity assessment.
 *
 * @example
 * ```typescript
 * const service = new QEMinCutService();
 *
 * // Compute lambda for a task graph
 * const lambda = service.computeLambda(taskGraph);
 *
 * // Determine routing tier
 * const tier = service.computeRoutingTier('Implement auth flow', agents);
 *
 * // Get fleet health
 * const health = service.getStructuralHealth(taskGraph);
 * ```
 */
export class QEMinCutService {
  private readonly calculator: MinCutCalculator;

  constructor() {
    this.calculator = new MinCutCalculator();
  }

  /**
   * Compute the min-cut lambda value for a task graph.
   *
   * Lambda represents the minimum edge weight that must be removed to
   * disconnect the graph. Higher lambda = more connected = simpler routing.
   *
   * @param graph - The task graph to analyze
   * @returns The min-cut lambda value (0 if graph is empty/disconnected)
   */
  computeLambda(graph: TaskGraph): number {
    const swarmGraph = this.toSwarmGraph(graph);
    return this.calculator.getMinCutValue(swarmGraph);
  }

  /**
   * Determine the optimal routing tier based on task description and agent topology.
   *
   * Builds a task graph from the agent topology, computes lambda, and maps
   * the normalized lambda to a routing tier:
   * - lambda >= 0.8 (highly connected, simple) -> Tier 1 (Haiku)
   * - lambda 0.4-0.8 (moderate connectivity) -> Tier 2 (Sonnet)
   * - lambda < 0.4 (fragmented, complex) -> Tier 3 (Opus)
   *
   * @param taskDescription - Description of the task to route
   * @param agentTopology - Current agent fleet topology
   * @returns Routing tier recommendation
   */
  computeRoutingTier(
    taskDescription: string,
    agentTopology: AgentNode[]
  ): RoutingTier {
    // Build task graph from agent topology
    const graph = this.buildTaskGraphFromTopology(agentTopology);
    const swarmGraph = this.toSwarmGraph(graph);

    // Get raw lambda
    const rawLambda = this.calculator.getMinCutValue(swarmGraph);

    // Normalize lambda to 0-1 range
    // Use vertex count as normalization factor (fully connected = vertex count - 1)
    const maxPossibleLambda = Math.max(agentTopology.length - 1, 1);
    const normalizedLambda = Math.min(rawLambda / maxPossibleLambda, 1.0);

    // Determine tier based on normalized lambda
    const { tier, label } = this.lambdaToTier(normalizedLambda);

    // Compute confidence based on graph size and connectivity
    const confidence = this.computeConfidence(swarmGraph, normalizedLambda);

    const rationale = this.buildRationale(
      taskDescription,
      normalizedLambda,
      tier,
      agentTopology.length
    );

    return {
      tier,
      label,
      lambda: rawLambda,
      normalizedLambda,
      confidence,
      rationale,
    };
  }

  /**
   * Compute structural health of the agent fleet using mincut lambda.
   *
   * Uses Stoer-Wagner style analysis (via weighted degree heuristic) to
   * assess the robustness of the fleet topology.
   *
   * @param graph - The task graph to analyze
   * @returns Health report with lambda, weak points, and suggestions
   */
  getStructuralHealth(graph: TaskGraph): HealthReport {
    const swarmGraph = this.toSwarmGraph(graph);

    if (swarmGraph.isEmpty()) {
      return this.emptyHealthReport();
    }

    const rawLambda = this.calculator.getMinCutValue(swarmGraph);
    const stats = swarmGraph.getStats();
    const maxPossibleLambda = Math.max(stats.vertexCount - 1, 1);
    const normalizedLambda = Math.min(rawLambda / maxPossibleLambda, 1.0);

    // Find weak vertices
    const weakVertices = this.calculator.findWeakVertices(swarmGraph);
    const weakPoints = weakVertices.map(wv => wv.vertexId);

    // Compute risk score (inverse of normalized lambda)
    const riskScore = 1 - normalizedLambda;

    // Health threshold: lambda >= 0.4 normalized is healthy
    const healthy = normalizedLambda >= 0.4;

    // Generate suggestions
    const suggestions = this.generateHealthSuggestions(
      normalizedLambda,
      weakVertices.length,
      stats
    );

    return {
      lambda: rawLambda,
      normalizedLambda,
      healthy,
      weakPoints,
      riskScore,
      componentCount: stats.componentCount,
      isConnected: stats.isConnected,
      suggestions,
      analyzedAt: new Date(),
    };
  }

  // ==========================================================================
  // Graph Conversion
  // ==========================================================================

  /**
   * Convert a TaskGraph to a SwarmGraph for use with MinCutCalculator
   */
  toSwarmGraph(graph: TaskGraph): SwarmGraph {
    const swarmGraph = new SwarmGraph();

    // Add vertices
    for (const node of graph.nodes) {
      const vertex: SwarmVertex = {
        id: node.id,
        type: node.type === 'task' ? 'agent' : node.type === 'agent' ? 'agent' : 'domain',
        domain: node.domain as SwarmVertex['domain'],
        weight: node.weight,
        createdAt: new Date(),
        metadata: node.metadata,
      };
      swarmGraph.addVertex(vertex);
    }

    // Add edges
    for (const edge of graph.edges) {
      // Only add edges if both vertices exist
      if (swarmGraph.hasVertex(edge.source) && swarmGraph.hasVertex(edge.target)) {
        const swarmEdge: SwarmEdge = {
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          type: edge.edgeType === 'dependency' ? 'dependency'
            : edge.edgeType === 'communication' ? 'communication'
            : edge.edgeType === 'workflow' ? 'workflow'
            : 'coordination',
          bidirectional: edge.edgeType !== 'dependency',
        };
        swarmGraph.addEdge(swarmEdge);
      }
    }

    return swarmGraph;
  }

  /**
   * Build a TaskGraph from agent topology
   */
  buildTaskGraphFromTopology(agents: AgentNode[]): TaskGraph {
    const nodes: TaskGraphNode[] = agents.map(agent => ({
      id: agent.id,
      label: agent.name,
      type: 'agent' as const,
      domain: agent.domain,
      weight: agent.weight,
    }));

    const edges: TaskGraphEdge[] = [];
    const agentIds = new Set(agents.map(a => a.id));

    for (const agent of agents) {
      for (const depId of agent.dependsOn) {
        if (agentIds.has(depId)) {
          edges.push({
            source: agent.id,
            target: depId,
            weight: 1.0,
            edgeType: 'dependency',
          });
        }
      }
    }

    // Add coordination edges between agents in the same domain
    const domainGroups = new Map<string, string[]>();
    for (const agent of agents) {
      const group = domainGroups.get(agent.domain) || [];
      group.push(agent.id);
      domainGroups.set(agent.domain, group);
    }

    for (const [, group] of domainGroups) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          edges.push({
            source: group[i],
            target: group[j],
            weight: 0.5,
            edgeType: 'coordination',
          });
        }
      }
    }

    return { nodes, edges };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Map normalized lambda to routing tier
   */
  private lambdaToTier(normalizedLambda: number): { tier: number; label: string } {
    if (normalizedLambda >= 0.8) {
      return { tier: 1, label: 'Haiku' };
    }
    if (normalizedLambda >= 0.4) {
      return { tier: 2, label: 'Sonnet' };
    }
    return { tier: 3, label: 'Opus' };
  }

  /**
   * Compute confidence in the routing decision
   */
  private computeConfidence(graph: SwarmGraph, normalizedLambda: number): number {
    const stats = graph.getStats();

    // Low confidence if graph is too small
    if (stats.vertexCount < 3) {
      return 0.4;
    }

    // High confidence if lambda is clearly in a tier range (not near boundary)
    const distFromBoundary = Math.min(
      Math.abs(normalizedLambda - 0.4),
      Math.abs(normalizedLambda - 0.8)
    );

    // Scale: 0.0 distance from boundary = 0.5 confidence, 0.2+ = 0.95
    const boundaryConfidence = Math.min(0.95, 0.5 + distFromBoundary * 2.25);

    // Also consider graph density for confidence
    const densityFactor = Math.min(1.0, stats.density * 2);

    return Math.min(0.99, boundaryConfidence * (0.7 + 0.3 * densityFactor));
  }

  /**
   * Build human-readable rationale for the routing decision
   */
  private buildRationale(
    taskDescription: string,
    normalizedLambda: number,
    tier: number,
    agentCount: number
  ): string {
    const taskPreview = taskDescription.slice(0, 80);
    const connectivity = normalizedLambda >= 0.8 ? 'highly connected'
      : normalizedLambda >= 0.4 ? 'moderately connected'
      : 'fragmented';

    const tierName = tier === 1 ? 'Haiku' : tier === 2 ? 'Sonnet' : 'Opus';

    return (
      `Task "${taskPreview}" routed to ${tierName} (Tier ${tier}). ` +
      `Fleet topology is ${connectivity} (lambda=${normalizedLambda.toFixed(3)}) ` +
      `across ${agentCount} agents.`
    );
  }

  /**
   * Generate health improvement suggestions
   */
  private generateHealthSuggestions(
    normalizedLambda: number,
    weakCount: number,
    stats: { vertexCount: number; isConnected: boolean; componentCount: number }
  ): string[] {
    const suggestions: string[] = [];

    if (!stats.isConnected) {
      suggestions.push(
        `Graph has ${stats.componentCount} disconnected components. ` +
        'Add cross-domain coordination edges to improve connectivity.'
      );
    }

    if (normalizedLambda < 0.2) {
      suggestions.push(
        'Critical: Fleet connectivity is very low. Consider spawning coordination agents.'
      );
    } else if (normalizedLambda < 0.4) {
      suggestions.push(
        'Warning: Fleet connectivity is below healthy threshold. Reinforce weak connections.'
      );
    }

    if (weakCount > 0) {
      suggestions.push(
        `${weakCount} weak point(s) detected. Add redundant connections to these agents.`
      );
    }

    if (stats.vertexCount < 3) {
      suggestions.push(
        'Fleet has fewer than 3 agents. MinCut analysis is most useful with larger topologies.'
      );
    }

    return suggestions;
  }

  /**
   * Create an empty health report for empty graphs
   */
  private emptyHealthReport(): HealthReport {
    return {
      lambda: 0,
      normalizedLambda: 0,
      healthy: false,
      weakPoints: [],
      riskScore: 1.0,
      componentCount: 0,
      isConnected: true,
      suggestions: ['No agents in fleet. Spawn agents to build a topology.'],
      analyzedAt: new Date(),
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new QEMinCutService instance
 */
export function createQEMinCutService(): QEMinCutService {
  return new QEMinCutService();
}
