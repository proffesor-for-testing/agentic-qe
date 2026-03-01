/**
 * Swarm Observer
 * ADR-031: Strange Loop Self-Awareness
 *
 * Collects swarm state through self-observation. This is the "Observe" step
 * in the strange loop: Observe -> Model -> Decide -> Act
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  SwarmHealthObservation,
  SwarmTopology,
  ConnectivityMetrics,
  AgentHealthMetrics,
  SwarmVulnerability,
  AgentNode,
  CommunicationEdge,
} from './types.js';
import { TopologyAnalyzer } from './topology-analyzer.js';

// ============================================================================
// Agent Provider Interface
// ============================================================================

/**
 * Interface for retrieving agent information from the swarm
 */
export interface AgentProvider {
  /** Get all active agents */
  getAgents(): Promise<AgentNode[]>;

  /** Get communication edges between agents */
  getEdges(): Promise<CommunicationEdge[]>;

  /** Get health metrics for a specific agent */
  getAgentHealth(agentId: string): Promise<AgentHealthMetrics>;

  /** Get the current observer's agent ID */
  getObserverId(): string;
}

/**
 * Default in-memory agent provider for testing and simple deployments
 */
export class InMemoryAgentProvider implements AgentProvider {
  private agents: Map<string, AgentNode> = new Map();
  private edges: CommunicationEdge[] = [];
  private healthMetrics: Map<string, AgentHealthMetrics> = new Map();
  private observerId: string;

  constructor(observerId: string = 'observer-0') {
    this.observerId = observerId;
  }

  async getAgents(): Promise<AgentNode[]> {
    return Array.from(this.agents.values());
  }

  async getEdges(): Promise<CommunicationEdge[]> {
    return [...this.edges];
  }

  async getAgentHealth(agentId: string): Promise<AgentHealthMetrics> {
    const health = this.healthMetrics.get(agentId);
    if (!health) {
      // Return default healthy metrics
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
    return health;
  }

  getObserverId(): string {
    return this.observerId;
  }

  // Methods to populate the provider for testing
  addAgent(agent: AgentNode): void {
    this.agents.set(agent.id, agent);
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.healthMetrics.delete(agentId);
    // Remove related edges
    this.edges = this.edges.filter(
      e => e.source !== agentId && e.target !== agentId
    );
  }

  addEdge(edge: CommunicationEdge): void {
    this.edges.push(edge);
  }

  setHealthMetrics(agentId: string, metrics: AgentHealthMetrics): void {
    this.healthMetrics.set(agentId, metrics);
  }

  clear(): void {
    this.agents.clear();
    this.edges = [];
    this.healthMetrics.clear();
  }
}

// ============================================================================
// Swarm Observer
// ============================================================================

/**
 * Observes the swarm state and produces health observations
 */
export class SwarmObserver {
  private provider: AgentProvider;
  private topologyAnalyzer: TopologyAnalyzer;
  private lastObservation: SwarmHealthObservation | null = null;

  constructor(provider: AgentProvider) {
    this.provider = provider;
    this.topologyAnalyzer = new TopologyAnalyzer();
  }

  /**
   * Perform a complete observation of the swarm state
   */
  async observe(): Promise<SwarmHealthObservation> {
    const startTime = Date.now();
    const observationId = uuidv4();

    // 1. Gather topology
    const agents = await this.provider.getAgents();
    const edges = await this.provider.getEdges();

    const topology: SwarmTopology = {
      agents,
      edges,
      type: this.detectTopologyType(agents, edges),
      agentCount: agents.length,
      edgeCount: edges.length,
    };

    // 2. Gather health metrics for each agent
    const agentHealth = new Map<string, AgentHealthMetrics>();
    for (const agent of agents) {
      const health = await this.provider.getAgentHealth(agent.id);
      // Update degree based on actual edges
      health.degree = this.calculateDegree(agent.id, edges);
      agentHealth.set(agent.id, health);
    }

    // 3. Analyze connectivity
    const connectivity = this.topologyAnalyzer.analyzeConnectivity(topology);

    // 4. Mark bottlenecks in agent health
    for (const bottleneckId of connectivity.bottlenecks) {
      const health = agentHealth.get(bottleneckId);
      if (health) {
        health.isBottleneck = true;
      }
    }

    // 5. Detect vulnerabilities
    const vulnerabilities = this.detectVulnerabilities(
      topology,
      connectivity,
      agentHealth
    );

    // 6. Calculate overall health
    const overallHealth = this.calculateOverallHealth(
      connectivity,
      agentHealth,
      vulnerabilities
    );

    const observation: SwarmHealthObservation = {
      id: observationId,
      timestamp: startTime,
      observerId: this.provider.getObserverId(),
      topology,
      connectivity,
      agentHealth,
      vulnerabilities,
      overallHealth,
    };

    this.lastObservation = observation;
    return observation;
  }

  /**
   * Get the last observation (if any)
   */
  getLastObservation(): SwarmHealthObservation | null {
    return this.lastObservation;
  }

  /**
   * Detect the type of topology based on structure
   */
  private detectTopologyType(
    agents: AgentNode[],
    edges: CommunicationEdge[]
  ): SwarmTopology['type'] {
    if (agents.length === 0) {
      return 'mesh';
    }

    // Check for star topology (one central node connected to all others)
    const degrees = new Map<string, number>();
    for (const agent of agents) {
      degrees.set(agent.id, 0);
    }
    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      if (edge.bidirectional) {
        degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
      }
    }

    const maxDegree = Math.max(...degrees.values());
    const avgDegree = agents.length > 0
      ? [...degrees.values()].reduce((a, b) => a + b, 0) / agents.length
      : 0;

    // Star: one node with high degree, others with degree 1
    if (maxDegree === agents.length - 1 && avgDegree < 2) {
      return 'star';
    }

    // Ring: all nodes have degree 2
    if (avgDegree === 2 && maxDegree === 2) {
      return 'ring';
    }

    // Hierarchical: check for coordinator nodes
    const coordinators = agents.filter(a => a.role === 'coordinator');
    if (coordinators.length > 0 && coordinators.length < agents.length / 2) {
      return 'hierarchical';
    }

    // Mesh: high connectivity
    const possibleEdges = agents.length * (agents.length - 1) / 2;
    const density = possibleEdges > 0 ? edges.length / possibleEdges : 0;
    if (density > 0.5) {
      return 'mesh';
    }

    return 'hybrid';
  }

  /**
   * Calculate degree (number of connections) for an agent
   */
  private calculateDegree(agentId: string, edges: CommunicationEdge[]): number {
    let degree = 0;
    for (const edge of edges) {
      if (edge.source === agentId) {
        degree++;
      }
      if (edge.target === agentId && edge.bidirectional) {
        degree++;
      }
    }
    return degree;
  }

  /**
   * Detect vulnerabilities in the swarm
   */
  private detectVulnerabilities(
    topology: SwarmTopology,
    connectivity: ConnectivityMetrics,
    agentHealth: Map<string, AgentHealthMetrics>
  ): SwarmVulnerability[] {
    const vulnerabilities: SwarmVulnerability[] = [];
    const now = Date.now();

    // 1. Check for bottlenecks (single points of failure)
    for (const bottleneckId of connectivity.bottlenecks) {
      const health = agentHealth.get(bottleneckId);
      vulnerabilities.push({
        type: 'bottleneck',
        severity: health ? 0.8 + (1 - health.responsiveness) * 0.2 : 0.9,
        affectedAgents: this.findDependentAgents(bottleneckId, topology),
        description: `Agent ${bottleneckId} is a single point of failure`,
        suggestedAction: 'spawn_redundant_agent',
        detectedAt: now,
      });
    }

    // 2. Check for isolated agents (degree 0 or 1)
    for (const [agentId, health] of agentHealth) {
      if (health.degree <= 1 && topology.agents.length > 2) {
        vulnerabilities.push({
          type: 'isolated_agent',
          severity: 0.6,
          affectedAgents: [agentId],
          description: `Agent ${agentId} has low connectivity (degree ${health.degree})`,
          suggestedAction: 'add_connection',
          detectedAt: now,
        });
      }
    }

    // 3. Check for overloaded agents
    for (const [agentId, health] of agentHealth) {
      if (health.memoryUtilization > 0.9 || health.cpuUtilization > 0.9) {
        vulnerabilities.push({
          type: 'overloaded_agent',
          severity: 0.7 + Math.max(health.memoryUtilization, health.cpuUtilization) * 0.3,
          affectedAgents: [agentId],
          description: `Agent ${agentId} is overloaded (memory: ${(health.memoryUtilization * 100).toFixed(0)}%, CPU: ${(health.cpuUtilization * 100).toFixed(0)}%)`,
          suggestedAction: 'redistribute_load',
          detectedAt: now,
        });
      }
    }

    // 4. Check for degraded connectivity
    if (connectivity.minCut <= 1 && topology.agents.length > 2) {
      vulnerabilities.push({
        type: 'degraded_connectivity',
        severity: 0.8,
        affectedAgents: connectivity.bottlenecks,
        description: `Swarm has low fault tolerance (min-cut = ${connectivity.minCut})`,
        suggestedAction: 'add_connection',
        detectedAt: now,
      });
    }

    // 5. Check for network partitions (multiple components)
    if (connectivity.components > 1) {
      vulnerabilities.push({
        type: 'network_partition',
        severity: 0.95,
        affectedAgents: topology.agents.map(a => a.id),
        description: `Swarm is partitioned into ${connectivity.components} disconnected components`,
        suggestedAction: 'add_connection',
        detectedAt: now,
      });
    }

    // 6. Check for degraded agents (low responsiveness)
    for (const [agentId, health] of agentHealth) {
      if (health.responsiveness < 0.5) {
        vulnerabilities.push({
          type: 'single_point_of_failure',
          severity: 0.75,
          affectedAgents: [agentId],
          description: `Agent ${agentId} is degraded (responsiveness: ${(health.responsiveness * 100).toFixed(0)}%)`,
          suggestedAction: 'restart_agent',
          detectedAt: now,
        });
      }
    }

    return vulnerabilities;
  }

  /**
   * Find agents that depend on a given agent
   */
  private findDependentAgents(agentId: string, topology: SwarmTopology): string[] {
    const dependent: string[] = [];

    // Simple: all directly connected agents are dependent
    for (const edge of topology.edges) {
      if (edge.source === agentId && !dependent.includes(edge.target)) {
        dependent.push(edge.target);
      }
      if (edge.target === agentId && !dependent.includes(edge.source)) {
        dependent.push(edge.source);
      }
    }

    return dependent;
  }

  /**
   * Calculate overall swarm health score (0-1)
   */
  private calculateOverallHealth(
    connectivity: ConnectivityMetrics,
    agentHealth: Map<string, AgentHealthMetrics>,
    vulnerabilities: SwarmVulnerability[]
  ): number {
    let health = 1.0;

    // Factor 1: Connectivity health (30% weight)
    const connectivityScore = Math.min(connectivity.minCut / 3, 1); // Normalized to max of 3
    health -= (1 - connectivityScore) * 0.3;

    // Factor 2: Average agent health (40% weight)
    if (agentHealth.size > 0) {
      let totalAgentHealth = 0;
      for (const metrics of agentHealth.values()) {
        const agentScore =
          metrics.responsiveness * 0.4 +
          metrics.taskCompletionRate * 0.3 +
          (1 - metrics.memoryUtilization) * 0.15 +
          (1 - metrics.errorRate) * 0.15;
        totalAgentHealth += agentScore;
      }
      const avgAgentHealth = totalAgentHealth / agentHealth.size;
      health -= (1 - avgAgentHealth) * 0.4;
    }

    // Factor 3: Vulnerability impact (30% weight)
    if (vulnerabilities.length > 0) {
      const maxSeverity = Math.max(...vulnerabilities.map(v => v.severity));
      const avgSeverity =
        vulnerabilities.reduce((sum, v) => sum + v.severity, 0) / vulnerabilities.length;
      const vulnScore = 1 - (maxSeverity * 0.6 + avgSeverity * 0.4);
      health -= (1 - vulnScore) * 0.3;
    }

    return Math.max(0, Math.min(1, health));
  }
}

/**
 * Create a swarm observer with the given provider
 */
export function createSwarmObserver(provider: AgentProvider): SwarmObserver {
  return new SwarmObserver(provider);
}

/**
 * Create a swarm observer with an in-memory provider
 */
export function createInMemorySwarmObserver(
  observerId: string = 'observer-0'
): { observer: SwarmObserver; provider: InMemoryAgentProvider } {
  const provider = new InMemoryAgentProvider(observerId);
  const observer = new SwarmObserver(provider);
  return { observer, provider };
}
