/**
 * TopologyMinCutAnalyzer
 *
 * Analyzes fleet topology using min-cut algorithms for:
 * - Single Point of Failure (SPOF) detection
 * - Topology resilience scoring
 * - Connectivity analysis
 * - Optimization recommendations
 *
 * Uses the code-intelligence MinCutAnalyzer internally.
 */

import { MinCutAnalyzer, MinCutGraphInput, MinCutResult } from '../../code-intelligence/analysis/mincut/index.js';
import { Logger } from '../../utils/Logger.js';
import {
  FleetTopology,
  TopologyNode,
  TopologyEdge,
  SPOFResult,
  ResilienceResult,
  TopologyAnalysisConfig,
  DEFAULT_TOPOLOGY_ANALYSIS_CONFIG,
  TopologyOptimization,
} from './types.js';

const logger = Logger.getInstance();

/**
 * Analyzes fleet topology for vulnerabilities and resilience
 */
export class TopologyMinCutAnalyzer {
  private minCutAnalyzer: MinCutAnalyzer;
  private config: Required<TopologyAnalysisConfig>;

  constructor(config: TopologyAnalysisConfig = {}) {
    this.config = { ...DEFAULT_TOPOLOGY_ANALYSIS_CONFIG, ...config };
    this.minCutAnalyzer = new MinCutAnalyzer({
      algorithm: 'auto',
      timeout: this.config.timeout,
      maxNodes: 500, // Fleet size limit
    });

    logger.info('TopologyMinCutAnalyzer initialized', { config: this.config });
  }

  /**
   * Analyze fleet topology for resilience and SPOFs
   *
   * @param topology - Fleet topology to analyze
   * @returns Comprehensive resilience analysis result
   */
  public async analyzeResilience(topology: FleetTopology): Promise<ResilienceResult> {
    const startTime = performance.now();

    // Convert topology to min-cut graph format
    const graph = this.topologyToGraph(topology);

    // Detect all SPOFs
    const spofs = await this.detectSpofs(topology, graph);

    // Calculate min-cut value
    let minCutValue = Infinity;
    let vulnerablePartitions: string[][] = [];

    if (graph.nodes.length >= 2 && graph.edges.length > 0) {
      try {
        const minCutResult = await this.minCutAnalyzer.computeMinCut(graph);
        minCutValue = minCutResult.cutValue;
        vulnerablePartitions = [minCutResult.partition1, minCutResult.partition2];
      } catch (error) {
        logger.warn('Min-cut computation failed', { error });
        minCutValue = 0;
      }
    }

    // Calculate resilience score
    const score = this.calculateResilienceScore(topology, spofs, minCutValue);

    // Get critical SPOFs
    const criticalSpofs = spofs.filter(s => s.severity === 'critical');

    // Generate recommendations
    const recommendations = this.generateRecommendations(topology, spofs, minCutValue);

    // Calculate grade
    const grade = this.calculateGrade(score, criticalSpofs.length);

    // Calculate average path redundancy
    const avgPathRedundancy = this.calculatePathRedundancy(topology);

    const computationTimeMs = performance.now() - startTime;

    return {
      score,
      minCutValue,
      avgPathRedundancy,
      spofs,
      criticalSpofs,
      vulnerablePartitions,
      grade,
      recommendations,
      computationTimeMs,
    };
  }

  /**
   * Detect Single Points of Failure in the topology
   *
   * A SPOF is a node whose removal disconnects part of the graph.
   *
   * @param topology - Fleet topology
   * @param graph - Graph representation (optional, will be computed if not provided)
   * @returns Array of SPOF results
   */
  public async detectSpofs(
    topology: FleetTopology,
    graph?: MinCutGraphInput
  ): Promise<SPOFResult[]> {
    const graphInput = graph || this.topologyToGraph(topology);
    const spofs: SPOFResult[] = [];
    const totalNodes = topology.nodes.length;

    // For each node, check if removing it disconnects the graph
    for (const node of topology.nodes) {
      // Skip if not analyzing all SPOFs and node is not a coordinator
      if (!this.config.analyzeAllSpofs && node.role !== 'coordinator') {
        continue;
      }

      // Create graph without this node
      const reducedGraph = this.removeNodeFromGraph(graphInput, node.id);

      // Skip if graph becomes too small
      if (reducedGraph.nodes.length < 2) {
        continue;
      }

      // Check connectivity by computing min-cut
      const isConnected = await this.isGraphConnected(reducedGraph);

      if (!isConnected) {
        // This node is a SPOF - find affected agents
        const components = this.findConnectedComponents(reducedGraph);
        const largestComponent = components.reduce(
          (a, b) => (a.length > b.length ? a : b),
          []
        );
        const disconnectedAgents = topology.nodes
          .filter(n => n.id !== node.id && !largestComponent.includes(n.id))
          .map(n => n.id);

        const affectedAgents = disconnectedAgents.length;
        const impactPercentage = (affectedAgents / totalNodes) * 100;

        // Determine severity
        const severity = this.determineSPOFSeverity(
          node,
          affectedAgents,
          totalNodes
        );

        spofs.push({
          agentId: node.id,
          agentType: node.type,
          severity,
          affectedAgents,
          impactPercentage,
          disconnectedAgents,
          recommendations: this.generateSPOFRecommendations(node, affectedAgents),
        });
      }
    }

    // Sort by severity and impact
    return spofs.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff =
        severityOrder[b.severity] - severityOrder[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.affectedAgents - a.affectedAgents;
    });
  }

  /**
   * Get topology optimization suggestions
   *
   * @param topology - Current fleet topology
   * @param resilienceResult - Optional pre-computed resilience result
   * @returns Array of optimization suggestions
   */
  public async suggestOptimizations(
    topology: FleetTopology,
    resilienceResult?: ResilienceResult
  ): Promise<TopologyOptimization[]> {
    const result = resilienceResult || await this.analyzeResilience(topology);
    const optimizations: TopologyOptimization[] = [];

    // Add redundant connections for critical SPOFs
    for (const spof of result.criticalSpofs) {
      const spofNode = topology.nodes.find(n => n.id === spof.agentId);
      if (!spofNode) continue;

      // Find potential backup coordinators
      const potentialBackups = topology.nodes.filter(
        n =>
          n.id !== spof.agentId &&
          n.role !== 'observer' &&
          n.status === 'active' &&
          !spof.disconnectedAgents.includes(n.id)
      );

      if (potentialBackups.length > 0) {
        const backup = potentialBackups[0];

        // Suggest adding direct connections from disconnected agents to backup
        for (const disconnectedId of spof.disconnectedAgents.slice(0, 3)) {
          optimizations.push({
            type: 'add-edge',
            description: `Add backup connection from ${disconnectedId} to ${backup.id} to prevent ${spof.agentId} from being a SPOF`,
            expectedImprovement: 0.15,
            effort: 'low',
            priority: 'critical',
            implementation: {
              sourceId: disconnectedId,
              targetId: backup.id,
              connectionType: 'coordination',
            },
          });
        }
      }
    }

    // Suggest mesh connections for hierarchical topologies with low resilience
    if (topology.mode === 'hierarchical' && result.score < 0.5) {
      optimizations.push({
        type: 'restructure',
        description: 'Consider switching to hybrid topology for better resilience',
        expectedImprovement: 0.25,
        effort: 'high',
        priority: 'high',
      });
    }

    // Suggest adding backup coordinators if only one exists
    const coordinators = topology.nodes.filter(n => n.role === 'coordinator');
    if (coordinators.length === 1) {
      optimizations.push({
        type: 'add-node',
        description: 'Add a backup coordinator to eliminate single coordinator SPOF',
        expectedImprovement: 0.3,
        effort: 'medium',
        priority: 'critical',
      });
    }

    // Sort by priority and expected improvement
    return optimizations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.expectedImprovement - a.expectedImprovement;
    });
  }

  /**
   * Convert fleet topology to min-cut graph format
   */
  private topologyToGraph(topology: FleetTopology): MinCutGraphInput {
    const nodes = topology.nodes
      .filter(n => n.status !== 'failed')
      .map(n => ({
        id: n.id,
        label: `${n.type}:${n.role}`,
        properties: {
          type: n.type,
          role: n.role,
          status: n.status,
          priority: n.priority,
        },
      }));

    const nodeIds = new Set(nodes.map(n => n.id));

    const edges = topology.edges
      .filter(e =>
        nodeIds.has(e.sourceId) &&
        nodeIds.has(e.targetId) &&
        this.config.connectionTypes.includes(e.connectionType)
      )
      .map(e => ({
        source: e.sourceId,
        target: e.targetId,
        weight: e.weight,
      }));

    // For bidirectional edges, add reverse direction
    const bidirectionalEdges: typeof edges = [];
    for (const e of topology.edges) {
      if (
        e.bidirectional &&
        nodeIds.has(e.sourceId) &&
        nodeIds.has(e.targetId)
      ) {
        bidirectionalEdges.push({
          source: e.targetId,
          target: e.sourceId,
          weight: e.weight,
        });
      }
    }

    return {
      nodes,
      edges: [...edges, ...bidirectionalEdges],
      directed: false, // Min-cut works on undirected graphs
    };
  }

  /**
   * Remove a node from the graph
   */
  private removeNodeFromGraph(
    graph: MinCutGraphInput,
    nodeId: string
  ): MinCutGraphInput {
    return {
      nodes: graph.nodes.filter(n => n.id !== nodeId),
      edges: graph.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      ),
      directed: graph.directed,
    };
  }

  /**
   * Check if graph is connected using BFS
   */
  private async isGraphConnected(graph: MinCutGraphInput): Promise<boolean> {
    if (graph.nodes.length === 0) return true;
    if (graph.nodes.length === 1) return true;

    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    for (const node of graph.nodes) {
      adj.set(node.id, new Set());
    }
    for (const edge of graph.edges) {
      adj.get(edge.source)?.add(edge.target);
      adj.get(edge.target)?.add(edge.source);
    }

    // BFS from first node
    const visited = new Set<string>();
    const queue = [graph.nodes[0].id];
    visited.add(graph.nodes[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return visited.size === graph.nodes.length;
  }

  /**
   * Find connected components in the graph
   */
  private findConnectedComponents(graph: MinCutGraphInput): string[][] {
    const components: string[][] = [];
    const visited = new Set<string>();

    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    for (const node of graph.nodes) {
      adj.set(node.id, new Set());
    }
    for (const edge of graph.edges) {
      adj.get(edge.source)?.add(edge.target);
      adj.get(edge.target)?.add(edge.source);
    }

    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;

      const component: string[] = [];
      const queue = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        const neighbors = adj.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      components.push(component);
    }

    return components;
  }

  /**
   * Calculate resilience score (0-1)
   */
  private calculateResilienceScore(
    topology: FleetTopology,
    spofs: SPOFResult[],
    minCutValue: number
  ): number {
    const n = topology.nodes.length;
    if (n === 0) return 1;
    if (n === 1) return 1;

    // Factors that contribute to resilience:
    // 1. Min-cut value relative to node count (edge connectivity)
    const edgeConnectivity = Math.min(minCutValue / n, 1);

    // 2. Inverse of SPOF count
    const criticalSpofs = spofs.filter(s => s.severity === 'critical').length;
    const spofPenalty = Math.max(0, 1 - criticalSpofs * 0.2);

    // 3. Average SPOF impact
    const avgImpact =
      spofs.length > 0
        ? spofs.reduce((sum, s) => sum + s.impactPercentage, 0) / spofs.length / 100
        : 0;
    const impactScore = 1 - avgImpact;

    // 4. Coordinator redundancy
    const coordinators = topology.nodes.filter(n => n.role === 'coordinator');
    const coordinatorRedundancy = Math.min(coordinators.length / 2, 1);

    // Weighted average
    const score =
      edgeConnectivity * 0.3 +
      spofPenalty * 0.3 +
      impactScore * 0.2 +
      coordinatorRedundancy * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate average path redundancy
   */
  private calculatePathRedundancy(topology: FleetTopology): number {
    const n = topology.nodes.length;
    if (n < 2) return 1;

    // Count edges per node (degree)
    const degrees = new Map<string, number>();
    for (const node of topology.nodes) {
      degrees.set(node.id, 0);
    }
    for (const edge of topology.edges) {
      degrees.set(edge.sourceId, (degrees.get(edge.sourceId) || 0) + 1);
      if (edge.bidirectional) {
        degrees.set(edge.targetId, (degrees.get(edge.targetId) || 0) + 1);
      }
    }

    // Average degree
    const totalDegree = Array.from(degrees.values()).reduce((a, b) => a + b, 0);
    const avgDegree = totalDegree / n;

    // Path redundancy approximation: avg degree / 2 (for undirected)
    return avgDegree / 2;
  }

  /**
   * Determine SPOF severity
   */
  private determineSPOFSeverity(
    node: TopologyNode,
    affectedAgents: number,
    totalNodes: number
  ): SPOFResult['severity'] {
    const impactRatio = affectedAgents / totalNodes;

    // Coordinators have higher severity
    const isCoordinator = node.role === 'coordinator';
    const isCriticalPriority = node.priority === 'critical';

    if (impactRatio > 0.5 || (isCoordinator && impactRatio > 0.3)) {
      return 'critical';
    }
    if (impactRatio > 0.3 || (isCoordinator && impactRatio > 0.1)) {
      return 'high';
    }
    if (impactRatio > 0.1 || isCriticalPriority) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate recommendations for overall topology
   */
  private generateRecommendations(
    topology: FleetTopology,
    spofs: SPOFResult[],
    minCutValue: number
  ): string[] {
    const recommendations: string[] = [];

    // Critical SPOF recommendations
    const criticalSpofs = spofs.filter(s => s.severity === 'critical');
    if (criticalSpofs.length > 0) {
      recommendations.push(
        `CRITICAL: ${criticalSpofs.length} critical SPOF(s) detected. ` +
          `Add redundant connections to mitigate: ${criticalSpofs.map(s => s.agentId).join(', ')}`
      );
    }

    // Low min-cut value
    if (minCutValue < 2 && topology.nodes.length > 3) {
      recommendations.push(
        'Edge connectivity is low. Consider adding cross-connections between agent clusters.'
      );
    }

    // Single coordinator
    const coordinators = topology.nodes.filter(n => n.role === 'coordinator');
    if (coordinators.length === 1) {
      recommendations.push(
        'Only one coordinator exists. Add a backup coordinator for fault tolerance.'
      );
    }

    // Hierarchical topology with many agents
    if (topology.mode === 'hierarchical' && topology.nodes.length > 20) {
      recommendations.push(
        'Hierarchical topology with >20 agents may have scalability issues. ' +
          'Consider hybrid or mesh topology.'
      );
    }

    // High number of workers per coordinator
    const workers = topology.nodes.filter(n => n.role === 'worker');
    if (coordinators.length > 0 && workers.length / coordinators.length > 15) {
      recommendations.push(
        `High worker-to-coordinator ratio (${(workers.length / coordinators.length).toFixed(1)}:1). ` +
          'Consider adding more coordinators.'
      );
    }

    return recommendations;
  }

  /**
   * Generate recommendations for specific SPOF
   */
  private generateSPOFRecommendations(
    node: TopologyNode,
    affectedAgents: number
  ): string[] {
    const recommendations: string[] = [];

    if (node.role === 'coordinator') {
      recommendations.push(
        'Add a backup coordinator that can take over if this one fails.'
      );
      recommendations.push(
        'Implement leader election protocol for automatic failover.'
      );
    }

    if (affectedAgents > 5) {
      recommendations.push(
        `Add direct connections from affected agents to alternative coordinators.`
      );
    }

    recommendations.push(
      `Consider implementing heartbeat monitoring for ${node.id} with automatic recovery.`
    );

    return recommendations;
  }

  /**
   * Calculate topology grade (A-F)
   */
  private calculateGrade(
    score: number,
    criticalSpofs: number
  ): ResilienceResult['grade'] {
    if (criticalSpofs > 0) {
      return criticalSpofs >= 3 ? 'F' : 'D';
    }
    if (score >= 0.9) return 'A';
    if (score >= 0.75) return 'B';
    if (score >= 0.6) return 'C';
    if (score >= 0.4) return 'D';
    return 'F';
  }
}
