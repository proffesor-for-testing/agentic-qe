/**
 * Infrastructure-Aware Agent Provider
 * ADR-056: Infrastructure Self-Healing Extension
 *
 * Wraps an existing AgentProvider and enriches it with synthetic "agents"
 * representing infrastructure services. When a service is down (detected by
 * TestOutputObserver), the synthetic agent's health metrics reflect the failure,
 * causing the existing Strange Loop to detect it as a vulnerability and trigger
 * healing actions.
 */

import type { AgentNode, AgentHealthMetrics, CommunicationEdge } from '../types.js';
import type { AgentProvider } from '../swarm-observer.js';
import type { TestOutputObserver } from './test-output-observer.js';
import type { RecoveryPlaybook } from './recovery-playbook.js';

// ============================================================================
// Infrastructure-Aware Agent Provider
// ============================================================================

/**
 * Wraps an AgentProvider and adds synthetic infrastructure agents.
 * Each service in the recovery playbook becomes a synthetic agent.
 * Health metrics are derived from the TestOutputObserver's last observation.
 */
export class InfraAwareAgentProvider implements AgentProvider {
  private readonly delegate: AgentProvider;
  private readonly observer: TestOutputObserver;
  private readonly playbook: RecoveryPlaybook;
  private readonly prefix: string;

  constructor(
    delegate: AgentProvider,
    observer: TestOutputObserver,
    playbook: RecoveryPlaybook,
    infraAgentPrefix: string = 'infra-',
  ) {
    this.delegate = delegate;
    this.observer = observer;
    this.playbook = playbook;
    this.prefix = infraAgentPrefix;
  }

  /**
   * Get all agents: real swarm agents + synthetic infra agents.
   */
  async getAgents(): Promise<AgentNode[]> {
    const realAgents = await this.delegate.getAgents();
    const infraAgents = this.createInfraAgents();
    return [...realAgents, ...infraAgents];
  }

  /**
   * Get communication edges: real edges only (infra agents don't communicate).
   */
  async getEdges(): Promise<CommunicationEdge[]> {
    return this.delegate.getEdges();
  }

  /**
   * Get agent health. For infra agents, derive from observer state.
   */
  async getAgentHealth(agentId: string): Promise<AgentHealthMetrics> {
    if (agentId.startsWith(this.prefix)) {
      return this.getInfraAgentHealth(agentId);
    }
    return this.delegate.getAgentHealth(agentId);
  }

  /**
   * Get observer ID (delegates to wrapped provider).
   */
  getObserverId(): string {
    return this.delegate.getObserverId();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Create synthetic AgentNode for each service in the playbook.
   */
  private createInfraAgents(): AgentNode[] {
    const services = this.playbook.listServices();
    const failingServices = this.observer.getFailingServices();

    return services.map((serviceName) => ({
      id: `${this.prefix}${serviceName}`,
      type: 'infrastructure',
      role: 'specialist' as const,
      status: failingServices.has(serviceName) ? 'degraded' as const : 'active' as const,
      joinedAt: Date.now(),
      metadata: { serviceName, isInfraAgent: true },
    }));
  }

  /**
   * Get health metrics for a synthetic infra agent.
   * Failing services get responsiveness=0, healthy services get 1.0.
   */
  private getInfraAgentHealth(agentId: string): AgentHealthMetrics {
    const serviceName = agentId.replace(new RegExp(`^${this.prefix}`), '');
    const failingServices = this.observer.getFailingServices();
    const isFailing = failingServices.has(serviceName);

    return {
      responsiveness: isFailing ? 0.0 : 1.0,
      taskCompletionRate: isFailing ? 0.0 : 1.0,
      memoryUtilization: 0.1,
      cpuUtilization: 0.1,
      activeConnections: 0,
      isBottleneck: false,
      degree: 0,
      queuedTasks: 0,
      lastHeartbeat: isFailing ? 0 : Date.now(),
      errorRate: isFailing ? 1.0 : 0.0,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function for creating an InfraAwareAgentProvider.
 */
export function createInfraAwareAgentProvider(
  delegate: AgentProvider,
  observer: TestOutputObserver,
  playbook: RecoveryPlaybook,
  infraAgentPrefix?: string,
): InfraAwareAgentProvider {
  return new InfraAwareAgentProvider(delegate, observer, playbook, infraAgentPrefix);
}
