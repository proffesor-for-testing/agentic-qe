/**
 * Agentic QE v3 - MinCut Queen Coordinator Integration
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Integrates MinCut topology analysis with Queen Coordinator for:
 * - Real-time swarm topology health monitoring
 * - Automatic weak agent detection
 * - Health issue reporting
 * - Self-healing recommendations
 *
 * This module provides the bridge between:
 * - SwarmGraph (topology representation)
 * - MinCutHealthMonitor (health analysis)
 * - QueenCoordinator (orchestration)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainName,
  ALL_DOMAINS,
  Severity,
  DomainEvent,
} from '../../shared/types';
import {
  EventBus,
  AgentInfo,
  AgentCoordinator,
} from '../../kernel/interfaces';
import { QueenHealth, HealthIssue, QueenMetrics } from '../queen-coordinator';
import { SwarmGraph, createSwarmGraph } from './swarm-graph';
import { MinCutHealthMonitor, createMinCutHealthMonitor } from './mincut-health-monitor';
import { MinCutPersistence, createMinCutPersistence } from './mincut-persistence';
import {
  SwarmVertex,
  SwarmEdge,
  MinCutHealth,
  MinCutHealthConfig,
  WeakVertex,
  MinCutAlert,
  DEFAULT_MINCUT_HEALTH_CONFIG,
} from './interfaces';

// ============================================================================
// Queen-MinCut Integration Configuration
// ============================================================================

/**
 * Configuration for Queen-MinCut integration
 */
export interface QueenMinCutConfig extends MinCutHealthConfig {
  /** Whether to automatically update graph from agent events */
  autoUpdateFromEvents: boolean;

  /** Whether to persist MinCut data to database */
  persistData: boolean;

  /** How often to save snapshots (ms) */
  snapshotIntervalMs: number;

  /** Include MinCut health in Queen health checks */
  includeInQueenHealth: boolean;

  /** Minimum severity to report as Queen health issue */
  minHealthIssueSeverity: Severity;

  /**
   * External shared graph to use instead of creating a new one.
   * When provided, enables integration with MCP tools that share the same graph.
   * This ensures data added via MCP tools is visible to QueenCoordinator.
   */
  sharedGraph?: SwarmGraph;
}

/**
 * Default integration configuration
 */
export const DEFAULT_QUEEN_MINCUT_CONFIG: QueenMinCutConfig = {
  ...DEFAULT_MINCUT_HEALTH_CONFIG,
  autoUpdateFromEvents: true,
  persistData: true,
  snapshotIntervalMs: 60000, // 1 minute
  includeInQueenHealth: true,
  minHealthIssueSeverity: 'medium',
};

// ============================================================================
// Queen-MinCut Bridge
// ============================================================================

/**
 * Bridge between MinCut topology analysis and Queen Coordinator
 */
export class QueenMinCutBridge {
  private readonly config: QueenMinCutConfig;
  private readonly graph: SwarmGraph;
  private readonly monitor: MinCutHealthMonitor;
  private readonly persistence: MinCutPersistence;

  private eventSubscriptions: Array<() => void> = [];
  private snapshotTimer: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(
    private readonly eventBus: EventBus,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<QueenMinCutConfig> = {}
  ) {
    this.config = { ...DEFAULT_QUEEN_MINCUT_CONFIG, ...config };
    // Use shared graph if provided (enables MCP tools integration), otherwise create new
    this.graph = config.sharedGraph ?? createSwarmGraph();
    this.monitor = createMinCutHealthMonitor(this.graph, this.config, this.eventBus);
    this.persistence = createMinCutPersistence();
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Initialize the bridge
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize persistence
    if (this.config.persistData) {
      await this.persistence.initialize();
    }

    // Build initial graph from current agents
    await this.buildGraphFromAgents();

    // Subscribe to agent events if auto-update enabled
    if (this.config.autoUpdateFromEvents) {
      this.subscribeToEvents();
    }

    // Start health monitoring
    this.monitor.start();

    // Start snapshot persistence
    if (this.config.persistData) {
      this.startSnapshotTimer();
    }

    this.initialized = true;
  }

  /**
   * Dispose the bridge
   */
  async dispose(): Promise<void> {
    // Stop monitoring
    this.monitor.stop();

    // Stop snapshot timer
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }

    // Unsubscribe from events
    for (const unsubscribe of this.eventSubscriptions) {
      unsubscribe();
    }
    this.eventSubscriptions = [];

    // Save final snapshot
    if (this.config.persistData) {
      await this.saveSnapshot();
    }

    this.initialized = false;
  }

  // ==========================================================================
  // Graph Building
  // ==========================================================================

  /**
   * Build graph from current agent state
   * Note: When using a shared graph, we DON'T clear it because MCP tools
   * may have already added data that we need to preserve.
   */
  async buildGraphFromAgents(): Promise<void> {
    // Only clear if NOT using a shared graph (preserves MCP-added data)
    if (!this.config.sharedGraph) {
      this.graph.clear();
    }

    // Get all agents from coordinator
    const agents = this.agentCoordinator.listAgents();

    // Add domain coordinator vertices (one per domain)
    for (const domain of ALL_DOMAINS) {
      this.graph.addVertex({
        id: `domain:${domain}`,
        type: 'domain',
        domain,
        weight: 2.0, // Higher weight for domain coordinators
        createdAt: new Date(),
      });
    }

    // Add agent vertices
    for (const agent of agents) {
      this.addAgentVertex(agent);
    }

    // Add edges based on coordination patterns
    this.buildCoordinationEdges(agents);
  }

  /**
   * Add an agent as a vertex
   */
  private addAgentVertex(agent: AgentInfo): void {
    // Extract optional properties from agent (may be present in extended AgentInfo)
    const extendedAgent = agent as AgentInfo & {
      capabilities?: string[];
      taskCount?: number;
      health?: number;
    };

    const vertex: SwarmVertex = {
      id: `agent:${agent.id}`,
      type: 'agent',
      domain: agent.domain,
      capabilities: extendedAgent.capabilities,
      weight: 1.0,
      createdAt: agent.startedAt ?? new Date(),
      metadata: {
        status: agent.status,
        taskCount: extendedAgent.taskCount ?? 0,
        health: extendedAgent.health ?? 1.0,
      },
    };

    this.graph.addVertex(vertex);

    // Connect to domain coordinator
    if (agent.domain) {
      const domainVertexId = `domain:${agent.domain}`;
      if (this.graph.hasVertex(domainVertexId)) {
        this.graph.addEdge({
          source: `agent:${agent.id}`,
          target: domainVertexId,
          weight: 1.0,
          type: 'coordination',
          bidirectional: true,
        });
      }
    }
  }

  /**
   * Build coordination edges between agents
   */
  private buildCoordinationEdges(agents: AgentInfo[]): void {
    // Group agents by domain
    const domainAgents = new Map<DomainName, AgentInfo[]>();
    for (const agent of agents) {
      if (agent.domain) {
        const existing = domainAgents.get(agent.domain) || [];
        existing.push(agent);
        domainAgents.set(agent.domain, existing);
      }
    }

    // Connect agents within same domain (mesh within domain)
    for (const [_, domainAgentList] of domainAgents) {
      for (let i = 0; i < domainAgentList.length; i++) {
        for (let j = i + 1; j < domainAgentList.length; j++) {
          this.graph.addEdge({
            source: `agent:${domainAgentList[i].id}`,
            target: `agent:${domainAgentList[j].id}`,
            weight: 0.5, // Lower weight for peer connections
            type: 'communication',
            bidirectional: true,
          });
        }
      }
    }

    // Connect domain coordinators based on workflow dependencies
    const workflowEdges: Array<[DomainName, DomainName]> = [
      ['test-generation', 'test-execution'],
      ['test-execution', 'coverage-analysis'],
      ['coverage-analysis', 'quality-assessment'],
      ['quality-assessment', 'defect-intelligence'],
      ['requirements-validation', 'test-generation'],
      ['code-intelligence', 'test-generation'],
      ['security-compliance', 'quality-assessment'],
      ['contract-testing', 'test-execution'],
      ['visual-accessibility', 'quality-assessment'],
      ['chaos-resilience', 'test-execution'],
      ['learning-optimization', 'defect-intelligence'],
    ];

    for (const [source, target] of workflowEdges) {
      const sourceId = `domain:${source}`;
      const targetId = `domain:${target}`;
      if (this.graph.hasVertex(sourceId) && this.graph.hasVertex(targetId)) {
        this.graph.addEdge({
          source: sourceId,
          target: targetId,
          weight: 1.5, // Higher weight for workflow dependencies
          type: 'workflow',
          bidirectional: false,
        });
      }
    }
  }

  // ==========================================================================
  // Event Handling
  // ==========================================================================

  /**
   * Subscribe to relevant events
   */
  private subscribeToEvents(): void {
    // Agent spawned
    const onAgentSpawned = async (event: DomainEvent) => {
      const { agentId, domain, type, capabilities } = event.payload as {
        agentId: string;
        domain: DomainName;
        type: string;
        capabilities: string[];
      };

      // Cast to extended AgentInfo with optional properties
      this.addAgentVertex({
        id: agentId,
        name: `${domain}-${type}`,
        domain,
        type,
        status: 'running',
        startedAt: new Date(),
        capabilities,
        health: 1.0,
        taskCount: 0,
      } as AgentInfo & { capabilities?: string[]; health?: number; taskCount?: number });

      // Record in persistence
      if (this.config.persistData) {
        await this.persistence.recordHistory({
          minCutValue: this.monitor.getMinCutValue(),
          vertexCount: this.graph.vertexCount,
          edgeCount: this.graph.edgeCount,
        });
      }
    };

    // Agent stopped/terminated
    const onAgentTerminated = async (event: DomainEvent) => {
      const { agentId } = event.payload as { agentId: string };
      this.graph.removeVertex(`agent:${agentId}`);

      // Check if this degraded MinCut
      const health = this.monitor.checkHealth();
      if (health.status === 'critical') {
        await this.reportHealthIssue({
          severity: 'high',
          message: `Agent ${agentId} termination caused critical MinCut degradation`,
          timestamp: new Date(),
        });
      }
    };

    // Agent status changed
    const onAgentStatusChanged = async (event: DomainEvent) => {
      const { agentId, status, domain } = event.payload as {
        agentId: string;
        status: string;
        domain: DomainName;
      };

      const vertexId = `agent:${agentId}`;
      const vertex = this.graph.getVertex(vertexId);

      if (vertex) {
        // Update vertex with new status
        this.graph.addVertex({
          ...vertex,
          metadata: {
            ...vertex.metadata,
            status,
          },
        });
      }
    };

    // Task coordination (agent-to-agent communication)
    const onTaskCoordination = async (event: DomainEvent) => {
      const { fromAgent, toAgent, messageType } = event.payload as {
        fromAgent: string;
        toAgent: string;
        messageType: string;
      };

      const sourceId = `agent:${fromAgent}`;
      const targetId = `agent:${toAgent}`;

      if (this.graph.hasVertex(sourceId) && this.graph.hasVertex(targetId)) {
        const existingEdge = this.graph.getEdge(sourceId, targetId);
        if (existingEdge) {
          // Increase weight for active communication
          this.graph.addEdge({
            ...existingEdge,
            weight: Math.min(existingEdge.weight + 0.1, 3.0),
            lastActivity: new Date(),
            messageCount: (existingEdge.messageCount ?? 0) + 1,
          });
        } else {
          // Create new edge
          this.graph.addEdge({
            source: sourceId,
            target: targetId,
            weight: 0.5,
            type: 'communication',
            bidirectional: true,
            lastActivity: new Date(),
            messageCount: 1,
          });
        }
      }
    };

    // Subscribe to events (would use eventBus.subscribe in real implementation)
    // For now, we store the handlers for cleanup
    this.eventSubscriptions.push(() => {
      // Cleanup placeholder - actual unsubscribe would go here
    });
  }

  // ==========================================================================
  // Health Integration
  // ==========================================================================

  /**
   * Get MinCut health for inclusion in Queen health
   */
  getMinCutHealth(): MinCutHealth {
    return this.monitor.getHealth();
  }

  /**
   * Issue #205 fix: Check if topology is empty/fresh (no agents spawned yet)
   *
   * Note: Domain coordinator vertices and workflow edges are always created,
   * so we check for actual agent vertices instead of raw counts.
   */
  private isEmptyTopology(): boolean {
    // Empty if no agent vertices (domain coordinators don't count - they're always present)
    const agentVertices = this.graph.getVerticesByType('agent');
    return agentVertices.length === 0;
  }

  /**
   * Convert MinCut alerts to Queen health issues
   */
  getHealthIssuesFromMinCut(): HealthIssue[] {
    // Issue #205 fix: Don't report issues for fresh/empty topology
    // Empty topology is expected for fresh installs - not an error condition
    if (this.isEmptyTopology()) {
      return [];
    }

    const alerts = this.monitor.getActiveAlerts();
    const issues: HealthIssue[] = [];

    for (const alert of alerts) {
      // Map MinCut severity to Queen severity
      const severity = this.mapSeverity(alert.severity);

      // Only include if meets minimum severity
      if (this.severityValue(severity) >= this.severityValue(this.config.minHealthIssueSeverity)) {
        issues.push({
          severity,
          message: `MinCut: ${alert.message}`,
          timestamp: alert.timestamp,
        });
      }
    }

    // Add issues for weak vertices
    const weakVertices = this.monitor.getWeakVertices();
    for (const weak of weakVertices.slice(0, 3)) { // Top 3 weak vertices
      if (weak.riskScore > 0.7) {
        issues.push({
          severity: 'high',
          message: `Weak agent topology: ${weak.reason} (risk: ${(weak.riskScore * 100).toFixed(0)}%)`,
          timestamp: new Date(),
          domain: weak.vertex.domain,
        });
      }
    }

    return issues;
  }

  /**
   * Extend Queen health with MinCut metrics
   */
  extendQueenHealth(baseHealth: QueenHealth): QueenHealth & { minCut?: MinCutHealth } {
    if (!this.config.includeInQueenHealth) {
      return baseHealth;
    }

    const minCutHealth = this.getMinCutHealth();
    const minCutIssues = this.getHealthIssuesFromMinCut();

    // Issue #205 fix: Only degrade status for actual critical issues
    // 'idle' status is normal for fresh installs - don't degrade health
    let status = baseHealth.status;
    if (minCutHealth.status === 'critical' && status === 'healthy') {
      status = 'degraded';
    }
    // Note: 'idle' status does NOT trigger degradation - it's expected for fresh systems

    return {
      ...baseHealth,
      status,
      issues: [...baseHealth.issues, ...minCutIssues],
      minCut: minCutHealth,
    };
  }

  /**
   * Extend Queen metrics with MinCut data
   */
  extendQueenMetrics(baseMetrics: QueenMetrics): QueenMetrics & {
    minCutValue?: number;
    weakVertexCount?: number;
    topologyDensity?: number;
  } {
    const health = this.monitor.getHealth();
    const stats = this.graph.getStats();

    return {
      ...baseMetrics,
      minCutValue: health.minCutValue,
      weakVertexCount: health.weakVertexCount,
      topologyDensity: stats.density,
    };
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save current graph snapshot
   */
  private async saveSnapshot(): Promise<void> {
    if (!this.config.persistData) return;

    const snapshot = this.graph.snapshot();
    await this.persistence.saveSnapshot(snapshot);
  }

  /**
   * Start periodic snapshot saving
   */
  private startSnapshotTimer(): void {
    this.snapshotTimer = setInterval(async () => {
      await this.saveSnapshot();

      // Also record history
      await this.persistence.recordHistory({
        minCutValue: this.monitor.getMinCutValue(),
        vertexCount: this.graph.vertexCount,
        edgeCount: this.graph.edgeCount,
      });
    }, this.config.snapshotIntervalMs);
  }

  // ==========================================================================
  // Graph Access
  // ==========================================================================

  /**
   * Get the swarm graph
   */
  getGraph(): SwarmGraph {
    return this.graph;
  }

  /**
   * Get the health monitor
   */
  getMonitor(): MinCutHealthMonitor {
    return this.monitor;
  }

  /**
   * Get the persistence layer
   */
  getPersistence(): MinCutPersistence {
    return this.persistence;
  }

  /**
   * Get current MinCut value
   */
  getMinCutValue(): number {
    return this.monitor.getMinCutValue();
  }

  /**
   * Get weak vertices
   */
  getWeakVertices(): WeakVertex[] {
    return this.monitor.getWeakVertices();
  }

  /**
   * Check if topology is critical
   */
  isTopologyCritical(): boolean {
    return this.monitor.isCritical();
  }

  // ==========================================================================
  // Manual Graph Updates
  // ==========================================================================

  /**
   * Manually add a vertex
   */
  addVertex(vertex: SwarmVertex): void {
    this.graph.addVertex(vertex);
  }

  /**
   * Manually add an edge
   */
  addEdge(edge: SwarmEdge): void {
    this.graph.addEdge(edge);
  }

  /**
   * Manually remove a vertex
   */
  removeVertex(vertexId: string): boolean {
    return this.graph.removeVertex(vertexId);
  }

  /**
   * Refresh graph from current agents
   */
  async refreshGraph(): Promise<void> {
    await this.buildGraphFromAgents();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private async reportHealthIssue(issue: HealthIssue): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: 'MinCutHealthIssue',
      source: 'mincut-bridge' as DomainName,
      timestamp: new Date(),
      payload: { issue },
    });
  }

  private mapSeverity(minCutSeverity: Severity): Severity {
    return minCutSeverity;
  }

  private severityValue(severity: Severity): number {
    const values: Record<Severity, number> = {
      critical: 5,
      high: 4,
      medium: 3,
      low: 2,
      info: 1,
    };
    return values[severity];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Queen-MinCut bridge
 */
export function createQueenMinCutBridge(
  eventBus: EventBus,
  agentCoordinator: AgentCoordinator,
  config?: Partial<QueenMinCutConfig>
): QueenMinCutBridge {
  return new QueenMinCutBridge(eventBus, agentCoordinator, config);
}
