/**
 * Agentic QE v3 - Swarm Topology Implementation
 * ADR-034: RL-based swarm topology optimization
 *
 * Implements a mutable swarm topology for the neural optimizer to modify.
 */

import type {
  SwarmTopology,
  TopologyAgent,
  TopologyConnection,
  AgentMetrics,
} from './types';

// ============================================================================
// Mutable Swarm Topology
// ============================================================================

/**
 * Mutable implementation of SwarmTopology for the neural optimizer
 */
export class MutableSwarmTopology implements SwarmTopology {
  /** Mutable agent list */
  private _agents: TopologyAgent[] = [];

  /** Mutable connection list */
  private _connections: TopologyConnection[] = [];

  /** Topology type */
  private _type: SwarmTopology['type'];

  /** Topology metadata */
  private _metadata: Record<string, unknown> = {};

  constructor(type: SwarmTopology['type'] = 'custom') {
    this._type = type;
  }

  // ============================================================================
  // Getters (readonly views)
  // ============================================================================

  get agents(): TopologyAgent[] {
    return this._agents;
  }

  get connections(): TopologyConnection[] {
    return this._connections;
  }

  get type(): SwarmTopology['type'] {
    return this._type;
  }

  get metadata(): Record<string, unknown> {
    return this._metadata;
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Add an agent to the topology
   */
  addAgent(agent: TopologyAgent): void {
    // Check if agent already exists
    if (this._agents.some((a) => a.id === agent.id)) {
      return;
    }
    this._agents.push(agent);
  }

  /**
   * Remove an agent and all its connections
   */
  removeAgent(agentId: string): boolean {
    const idx = this._agents.findIndex((a) => a.id === agentId);
    if (idx === -1) return false;

    // Remove all connections involving this agent
    this._connections = this._connections.filter(
      (c) => c.from !== agentId && c.to !== agentId
    );

    this._agents.splice(idx, 1);
    return true;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): TopologyAgent | undefined {
    return this._agents.find((a) => a.id === agentId);
  }

  /**
   * Update agent metrics
   */
  updateAgentMetrics(agentId: string, metrics: Partial<AgentMetrics>): void {
    const agent = this._agents.find((a) => a.id === agentId);
    if (agent && agent.metrics) {
      Object.assign(agent.metrics, metrics);
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(
    agentId: string,
    status: TopologyAgent['status']
  ): void {
    const idx = this._agents.findIndex((a) => a.id === agentId);
    if (idx !== -1) {
      // Create new agent with updated status (agents are readonly)
      this._agents[idx] = {
        ...this._agents[idx],
        status,
      };
    }
  }

  // ============================================================================
  // Connection Operations
  // ============================================================================

  /**
   * Add a connection between agents
   */
  addConnection(from: string, to: string, weight: number = 1.0): void {
    // Check if connection already exists
    if (this.hasConnection(from, to)) {
      return;
    }

    // Verify both agents exist
    if (!this.getAgent(from) || !this.getAgent(to)) {
      return;
    }

    this._connections.push({
      from,
      to,
      weight,
      active: true,
    });
  }

  /**
   * Remove a connection
   */
  removeConnection(from: string, to: string): boolean {
    const idx = this._connections.findIndex(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
    if (idx === -1) return false;

    this._connections.splice(idx, 1);
    return true;
  }

  /**
   * Update connection weight
   */
  updateConnectionWeight(from: string, to: string, delta: number): void {
    const conn = this._connections.find(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
    if (conn) {
      conn.weight = Math.max(0.01, Math.min(10, conn.weight + delta));
    }
  }

  /**
   * Set connection weight directly
   */
  setConnectionWeight(from: string, to: string, weight: number): void {
    const conn = this._connections.find(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
    if (conn) {
      conn.weight = Math.max(0.01, Math.min(10, weight));
    }
  }

  /**
   * Check if connection exists
   */
  hasConnection(from: string, to: string): boolean {
    return this._connections.some(
      (c) =>
        (c.from === from && c.to === to) || (c.from === to && c.to === from)
    );
  }

  /**
   * Get connections for an agent
   */
  getAgentConnections(agentId: string): TopologyConnection[] {
    return this._connections.filter(
      (c) => c.from === agentId || c.to === agentId
    );
  }

  /**
   * Get degree of an agent
   */
  getAgentDegree(agentId: string): number {
    return this.getAgentConnections(agentId).length;
  }

  /**
   * Get neighbors of an agent
   */
  getNeighbors(agentId: string): string[] {
    const neighbors: string[] = [];
    for (const conn of this._connections) {
      if (conn.from === agentId) neighbors.push(conn.to);
      else if (conn.to === agentId) neighbors.push(conn.from);
    }
    return neighbors;
  }

  // ============================================================================
  // Topology Metrics
  // ============================================================================

  /**
   * Calculate graph density
   */
  getDensity(): number {
    const n = this._agents.length;
    if (n < 2) return 0;

    const maxConnections = (n * (n - 1)) / 2;
    return this._connections.length / maxConnections;
  }

  /**
   * Calculate average degree
   */
  getAverageDegree(): number {
    if (this._agents.length === 0) return 0;

    const totalDegree = this._agents.reduce(
      (sum, agent) => sum + this.getAgentDegree(agent.id),
      0
    );
    return totalDegree / this._agents.length;
  }

  /**
   * Calculate minimum degree (approximates min-cut)
   */
  getMinDegree(): number {
    if (this._agents.length === 0) return 0;

    let minDegree = Infinity;
    for (const agent of this._agents) {
      const degree = this.getAgentDegree(agent.id);
      minDegree = Math.min(minDegree, degree);
    }
    return minDegree === Infinity ? 0 : minDegree;
  }

  /**
   * Calculate average connection weight
   */
  getAverageWeight(): number {
    if (this._connections.length === 0) return 0;

    const totalWeight = this._connections.reduce((sum, c) => sum + c.weight, 0);
    return totalWeight / this._connections.length;
  }

  /**
   * Calculate weight variance
   */
  getWeightVariance(): number {
    if (this._connections.length === 0) return 0;

    const avg = this.getAverageWeight();
    const squaredDiffs = this._connections.map((c) => (c.weight - avg) ** 2);
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / this._connections.length;
  }

  /**
   * Calculate clustering coefficient
   */
  getClusteringCoefficient(): number {
    if (this._agents.length < 3) return 0;

    let totalCoeff = 0;
    for (const agent of this._agents) {
      const neighbors = this.getNeighbors(agent.id);
      const k = neighbors.length;
      if (k < 2) continue;

      let triangles = 0;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          if (this.hasConnection(neighbors[i], neighbors[j])) {
            triangles++;
          }
        }
      }

      const possibleTriangles = (k * (k - 1)) / 2;
      totalCoeff += triangles / possibleTriangles;
    }

    return totalCoeff / this._agents.length;
  }

  /**
   * Get load statistics
   */
  getLoadStats(): { avg: number; variance: number; idle: number; overloaded: number } {
    if (this._agents.length === 0) {
      return { avg: 0, variance: 0, idle: 0, overloaded: 0 };
    }

    const loads = this._agents.map(
      (a) => a.metrics?.currentLoad ?? 0
    );
    const avg = loads.reduce((sum, l) => sum + l, 0) / loads.length;
    const variance =
      loads.reduce((sum, l) => sum + (l - avg) ** 2, 0) / loads.length;

    const idle = this._agents.filter((a) => a.status === 'idle').length;
    const overloaded = this._agents.filter(
      (a) => (a.metrics?.currentLoad ?? 0) > 0.8
    ).length;

    return { avg, variance, idle, overloaded };
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export topology to JSON
   */
  toJSON(): {
    type: string;
    agents: TopologyAgent[];
    connections: TopologyConnection[];
    metadata: Record<string, unknown>;
  } {
    return {
      type: this._type,
      agents: [...this._agents],
      connections: [...this._connections],
      metadata: { ...this._metadata },
    };
  }

  /**
   * Import topology from JSON
   */
  static fromJSON(data: {
    type?: string;
    agents: TopologyAgent[];
    connections: TopologyConnection[];
    metadata?: Record<string, unknown>;
  }): MutableSwarmTopology {
    const topology = new MutableSwarmTopology(
      (data.type as SwarmTopology['type']) || 'custom'
    );
    topology._agents = [...data.agents];
    topology._connections = [...data.connections];
    topology._metadata = data.metadata ? { ...data.metadata } : {};
    return topology;
  }

  /**
   * Create a copy of this topology
   */
  clone(): MutableSwarmTopology {
    return MutableSwarmTopology.fromJSON(this.toJSON());
  }
}

// ============================================================================
// Topology Builders
// ============================================================================

/**
 * Build a mesh topology where every agent connects to every other
 */
export function buildMeshTopology(
  agents: TopologyAgent[]
): MutableSwarmTopology {
  const topology = new MutableSwarmTopology('mesh');

  for (const agent of agents) {
    topology.addAgent(agent);
  }

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      topology.addConnection(agents[i].id, agents[j].id, 1.0);
    }
  }

  return topology;
}

/**
 * Build a ring topology
 */
export function buildRingTopology(
  agents: TopologyAgent[]
): MutableSwarmTopology {
  const topology = new MutableSwarmTopology('ring');

  for (const agent of agents) {
    topology.addAgent(agent);
  }

  for (let i = 0; i < agents.length; i++) {
    const next = (i + 1) % agents.length;
    topology.addConnection(agents[i].id, agents[next].id, 1.0);
  }

  return topology;
}

/**
 * Build a star topology with a central hub
 */
export function buildStarTopology(
  agents: TopologyAgent[],
  hubId: string
): MutableSwarmTopology {
  const topology = new MutableSwarmTopology('star');

  for (const agent of agents) {
    topology.addAgent(agent);
  }

  for (const agent of agents) {
    if (agent.id !== hubId) {
      topology.addConnection(hubId, agent.id, 1.0);
    }
  }

  return topology;
}

/**
 * Build a hierarchical topology with a coordinator and workers
 */
export function buildHierarchicalTopology(
  coordinator: TopologyAgent,
  workers: TopologyAgent[]
): MutableSwarmTopology {
  const topology = new MutableSwarmTopology('hierarchical');

  topology.addAgent(coordinator);
  for (const worker of workers) {
    topology.addAgent(worker);
    topology.addConnection(coordinator.id, worker.id, 1.0);
  }

  return topology;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an empty topology
 */
export function createTopology(
  type: SwarmTopology['type'] = 'custom'
): MutableSwarmTopology {
  return new MutableSwarmTopology(type);
}

/**
 * Create an agent with default metrics
 */
export function createAgent(
  id: string,
  type: string,
  options: Partial<TopologyAgent> = {}
): TopologyAgent {
  return {
    id,
    type,
    status: options.status || 'idle',
    domain: options.domain,
    capabilities: options.capabilities || [],
    metrics: options.metrics || {
      tasksCompleted: 0,
      avgTaskDurationMs: 0,
      successRate: 1.0,
      currentLoad: 0,
    },
  };
}
