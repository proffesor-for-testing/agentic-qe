/**
 * Agentic QE v3 - Fleet Load Balancer
 * ADR-039: V3 QE MCP Optimization
 *
 * Provides intelligent load balancing for fleet operations:
 * - Least-connections routing
 * - Response-time weighted selection
 * - O(1) agent selection via hash index
 * - Health-aware routing
 */

// ============================================================================
// Types
// ============================================================================

export interface AgentLoadInfo {
  agentId: string;
  activeConnections: number;
  totalRequests: number;
  totalLatencyMs: number;
  avgResponseTimeMs: number;
  health: number; // 0-1 score
  lastUsedAt: number;
  isHealthy: boolean;
}

export type LoadBalancingStrategy = 'least-connections' | 'response-time' | 'round-robin' | 'random';

export interface LoadBalancerConfig {
  /** Load balancing strategy */
  strategy: LoadBalancingStrategy;

  /** Health threshold below which agent is excluded */
  healthThreshold: number;

  /** Maximum active connections per agent */
  maxConnectionsPerAgent: number;

  /** Enable health-aware routing */
  enableHealthRouting: boolean;

  /** stale agent timeout (ms) */
  staleTimeoutMs: number;
}

export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  strategy: 'least-connections',
  healthThreshold: 0.3,
  maxConnectionsPerAgent: 10,
  enableHealthRouting: true,
  staleTimeoutMs: 5 * 60 * 1000, // 5 minutes
};

export interface LoadBalancerStats {
  totalAgents: number;
  healthyAgents: number;
  totalRequests: number;
  totalLatencyMs: number;
  avgResponseTimeMs: number;
  strategyUsed: LoadBalancingStrategy;
}

// ============================================================================
// Load Balancer Implementation
// ============================================================================

class LoadBalancerImpl {
  private readonly agents: Map<string, AgentLoadInfo> = new Map();
  private readonly config: LoadBalancerConfig;
  private roundRobinIndex = 0;
  private totalRequests = 0;
  private totalLatencyMs = 0;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    this.config = { ...DEFAULT_LOAD_BALANCER_CONFIG, ...config };
  }

  /**
   * Register an agent with the load balancer
   */
  registerAgent(agentId: string): void {
    if (this.agents.has(agentId)) {
      return;
    }

    this.agents.set(agentId, {
      agentId,
      activeConnections: 0,
      totalRequests: 0,
      totalLatencyMs: 0,
      avgResponseTimeMs: 0,
      health: 1.0,
      lastUsedAt: Date.now(),
      isHealthy: true,
    });
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  /**
   * Select an agent using configured strategy (O(1) operation)
   */
  selectAgent(agentIds?: string[]): string | null {
    const candidates = agentIds
      ? agentIds.map(id => this.agents.get(id)).filter((a): a is AgentLoadInfo => a !== undefined)
      : Array.from(this.agents.values());

    if (candidates.length === 0) {
      return null;
    }

    // Filter to healthy agents if enabled
    let healthyCandidates = this.config.enableHealthRouting
      ? candidates.filter(a => a.isHealthy && a.health >= this.config.healthThreshold)
      : candidates;

    // If no healthy agents, use all candidates as fallback
    if (healthyCandidates.length === 0) {
      healthyCandidates = candidates;
    }

    // Apply strategy
    let selected: AgentLoadInfo;

    switch (this.config.strategy) {
      case 'least-connections':
        selected = this.selectLeastConnections(healthyCandidates);
        break;
      case 'response-time':
        selected = this.selectByResponseTime(healthyCandidates);
        break;
      case 'round-robin':
        selected = this.selectRoundRobin(healthyCandidates);
        break;
      case 'random':
        selected = this.selectRandom(healthyCandidates);
        break;
      default:
        selected = healthyCandidates[0];
    }

    // Update selected agent
    selected.activeConnections++;
    selected.lastUsedAt = Date.now();

    this.totalRequests++;

    return selected.agentId;
  }

  /**
   * Record a request completion for metrics
   */
  recordRequest(agentId: string, latencyMs: number, success: boolean): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    agent.activeConnections = Math.max(0, agent.activeConnections - 1);
    agent.totalRequests++;
    agent.totalLatencyMs += latencyMs;
    agent.avgResponseTimeMs = agent.totalLatencyMs / agent.totalRequests;

    this.totalLatencyMs += latencyMs;

    // Update health based on success rate and latency
    if (!success) {
      agent.health = Math.max(0, agent.health - 0.1);
    } else {
      agent.health = Math.min(1, agent.health + 0.01);
    }

    // Latency-based health adjustment
    if (latencyMs > 5000) {
      agent.health = Math.max(0, agent.health - 0.05);
    } else if (latencyMs < 100) {
      agent.health = Math.min(1, agent.health + 0.02);
    }

    agent.isHealthy = agent.health >= this.config.healthThreshold;
  }

  /**
   * Get load info for a specific agent
   */
  getAgentLoad(agentId: string): AgentLoadInfo | null {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agent loads
   */
  getAllAgentLoads(): AgentLoadInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get load balancer statistics
   */
  getStats(): LoadBalancerStats {
    const healthyCount = Array.from(this.agents.values()).filter(a => a.isHealthy).length;
    const avgResponseTime = this.totalRequests > 0
      ? this.totalLatencyMs / this.totalRequests
      : 0;

    return {
      totalAgents: this.agents.size,
      healthyAgents: healthyCount,
      totalRequests: this.totalRequests,
      totalLatencyMs: this.totalLatencyMs,
      avgResponseTimeMs: avgResponseTime,
      strategyUsed: this.config.strategy,
    };
  }

  /**
   * Prune stale agents
   */
  pruneStaleAgents(): number {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [id, agent] of this.agents.entries()) {
      if (now - agent.lastUsedAt > this.config.staleTimeoutMs && agent.activeConnections === 0) {
        pruned.push(id);
      }
    }

    for (const id of pruned) {
      this.agents.delete(id);
    }

    return pruned.length;
  }

  /**
   * Update agent health directly
   */
  setAgentHealth(agentId: string, health: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.health = Math.max(0, Math.min(1, health));
      agent.isHealthy = agent.health >= this.config.healthThreshold;
    }
  }

  /**
   * Change load balancing strategy
   */
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.config.strategy = strategy;
  }

  /**
   * Reset the load balancer
   */
  reset(): void {
    this.agents.clear();
    this.roundRobinIndex = 0;
    this.totalRequests = 0;
    this.totalLatencyMs = 0;
  }

  // ============================================================================
  // Private Methods - Selection Strategies
  // ============================================================================

  private selectLeastConnections(candidates: AgentLoadInfo[]): AgentLoadInfo {
    // O(n) scan but n is typically small (<100)
    let selected = candidates[0];
    let minConnections = selected.activeConnections;

    for (let i = 1; i < candidates.length; i++) {
      const agent = candidates[i];
      if (agent.activeConnections < minConnections) {
        minConnections = agent.activeConnections;
        selected = agent;
      }
    }

    return selected;
  }

  private selectByResponseTime(candidates: AgentLoadInfo[]): AgentLoadInfo {
    // Weight by inverse response time (lower is better)
    let selected = candidates[0];
    let bestScore = this.calculateResponseTimeScore(selected);

    for (let i = 1; i < candidates.length; i++) {
      const agent = candidates[i];
      const score = this.calculateResponseTimeScore(agent);
      if (score > bestScore) {
        bestScore = score;
        selected = agent;
      }
    }

    return selected;
  }

  private selectRoundRobin(candidates: AgentLoadInfo[]): AgentLoadInfo {
    const index = this.roundRobinIndex % candidates.length;
    this.roundRobinIndex++;
    return candidates[index];
  }

  private selectRandom(candidates: AgentLoadInfo[]): AgentLoadInfo {
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  private calculateResponseTimeScore(agent: AgentLoadInfo): number {
    // Higher score = better
    // Score = 1 / (avgResponseTime + 1) * health
    const latencyScore = 1 / (agent.avgResponseTimeMs + 1);
    return latencyScore * agent.health;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultLoadBalancer: LoadBalancerImpl | null = null;

export function getLoadBalancer(config?: Partial<LoadBalancerConfig>): LoadBalancerImpl {
  if (!defaultLoadBalancer) {
    defaultLoadBalancer = new LoadBalancerImpl(config);
  }
  return defaultLoadBalancer;
}

export function resetLoadBalancer(): void {
  if (defaultLoadBalancer) {
    defaultLoadBalancer.reset();
  }
}

// ============================================================================
// Exports
// ============================================================================

export { LoadBalancerImpl };

/**
 * Create a new load balancer instance (for testing/isolated balancers)
 */
export function createLoadBalancer(config?: Partial<LoadBalancerConfig>): LoadBalancerImpl {
  return new LoadBalancerImpl(config);
}
