/**
 * Agent Spawn Handler
 *
 * Handles spawning specialized QE agents with specific capabilities.
 * Coordinates with Claude Flow for agent lifecycle management.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from './base-handler.js';
import { AgentSpec } from '../tools.js';
import { AgentRegistry } from '../services/AgentRegistry.js';
import { HookExecutor } from '../services/HookExecutor.js';

export interface AgentSpawnArgs {
  spec: AgentSpec;
  fleetId?: string;
}

export interface AgentInstance {
  id: string;
  type: string;
  name: string;
  capabilities: string[];
  status: 'spawning' | 'active' | 'idle' | 'busy' | 'error' | 'terminated';
  resources: {
    memory: number;
    cpu: number;
    storage: number;
  };
  fleetId?: string;
  spawnedAt: string;
  lastActivity: string;
  metrics: {
    tasksCompleted: number;
    averageExecutionTime: number;
    successRate: number;
  };
}

export class AgentSpawnHandler extends BaseHandler {
  private activeAgents: Map<string, AgentInstance> = new Map();
  private agentTypeConfigs: Map<string, any> = new Map();
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;

  constructor(registry: AgentRegistry, hookExecutor: HookExecutor) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
    this.initializeAgentTypeConfigs();
  }

  async handle(args: AgentSpawnArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    this.log('info', 'Spawning QE agent', { requestId, spec: args.spec });

    try {
      // Validate required parameters
      this.validateRequired(args, ['spec']);
      this.validateAgentSpec(args.spec);

      const { result: agentInstance, executionTime } = await this.measureExecutionTime(
        () => this.spawnAgent(args.spec, args.fleetId)
      );

      this.log('info', `Agent spawned successfully in ${executionTime.toFixed(2)}ms`, {
        agentId: agentInstance.id,
        type: agentInstance.type,
        fleetId: agentInstance.fleetId
      });

      return this.createSuccessResponse(agentInstance, requestId);
    } catch (error) {
      this.log('error', 'Agent spawn failed', { error: error instanceof Error ? error.message : String(error) });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Agent spawn failed',
        requestId
      );
    }
  }

  private initializeAgentTypeConfigs(): void {
    this.agentTypeConfigs.set('test-generator', {
      defaultCapabilities: ['unit-test-generation', 'integration-test-generation', 'property-based-testing'],
      defaultResources: { memory: 512, cpu: 1, storage: 256 },
      specializations: ['boundary-analysis', 'edge-case-detection', 'test-data-synthesis']
    });

    this.agentTypeConfigs.set('coverage-analyzer', {
      defaultCapabilities: ['coverage-analysis', 'gap-identification', 'trend-analysis'],
      defaultResources: { memory: 256, cpu: 0.5, storage: 128 },
      specializations: ['critical-path-analysis', 'coverage-optimization', 'risk-assessment']
    });

    this.agentTypeConfigs.set('quality-gate', {
      defaultCapabilities: ['quality-metrics', 'threshold-enforcement', 'decision-making'],
      defaultResources: { memory: 128, cpu: 0.5, storage: 64 },
      specializations: ['composite-metrics', 'trend-monitoring', 'automated-decisions']
    });

    this.agentTypeConfigs.set('performance-tester', {
      defaultCapabilities: ['load-testing', 'stress-testing', 'bottleneck-detection'],
      defaultResources: { memory: 1024, cpu: 2, storage: 512 },
      specializations: ['resource-monitoring', 'baseline-comparison', 'regression-detection']
    });

    this.agentTypeConfigs.set('security-scanner', {
      defaultCapabilities: ['vulnerability-scanning', 'compliance-checking', 'security-testing'],
      defaultResources: { memory: 512, cpu: 1, storage: 256 },
      specializations: ['owasp-scanning', 'penetration-testing', 'compliance-validation']
    });

    this.agentTypeConfigs.set('chaos-engineer', {
      defaultCapabilities: ['failure-injection', 'resilience-testing', 'recovery-validation'],
      defaultResources: { memory: 256, cpu: 1, storage: 128 },
      specializations: ['controlled-chaos', 'blast-radius-control', 'disaster-recovery']
    });

    this.agentTypeConfigs.set('visual-tester', {
      defaultCapabilities: ['visual-regression', 'cross-browser-testing', 'accessibility-testing'],
      defaultResources: { memory: 1024, cpu: 1, storage: 1024 },
      specializations: ['screenshot-comparison', 'responsive-testing', 'wcag-compliance']
    });
  }

  private validateAgentSpec(spec: AgentSpec): void {
    const validTypes = Array.from(this.agentTypeConfigs.keys());
    if (!validTypes.includes(spec.type)) {
      throw new Error(`Invalid agent type: ${spec.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    if (!spec.capabilities || spec.capabilities.length === 0) {
      throw new Error('Agent must have at least one capability');
    }
  }

  private async spawnAgent(spec: AgentSpec, fleetId?: string): Promise<AgentInstance> {
    const agentId = `agent-${spec.type}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const typeConfig = this.agentTypeConfigs.get(spec.type)!;

    // Merge capabilities
    const capabilities = [
      ...typeConfig.defaultCapabilities,
      ...spec.capabilities.filter(cap => !typeConfig.defaultCapabilities.includes(cap))
    ];

    // Merge resources
    const resources = {
      ...typeConfig.defaultResources,
      ...spec.resources
    };

    // Execute pre-task hook
    await this.hookExecutor.executePreTask({
      description: `Spawning ${spec.type} agent`,
      agentType: spec.type
    });

    // Spawn agent via registry
    // Note: Cast to any to work around BaseAgentConfig type issue in AgentRegistry
    const { id, agent } = await this.registry.spawnAgent(spec.type, {
      name: spec.name || `${spec.type}-${agentId.split('-').pop()}`,
      description: `${spec.type} agent spawned via MCP`,
      capabilities,
      resources,
      fleetId
    } as any);

    // Register with Claude Flow if part of a fleet
    if (fleetId) {
      await this.registerWithFleet({
        id,
        type: spec.type,
        name: spec.name || `${spec.type}-${id.split('-').pop()}`,
        capabilities,
        status: 'active',
        resources,
        fleetId,
        spawnedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        metrics: { tasksCompleted: 0, averageExecutionTime: 0, successRate: 1.0 }
      }, fleetId);
    }

    // Execute post-task hook
    await this.hookExecutor.executePostTask({
      taskId: id,
      agentType: spec.type,
      results: { status: 'spawned', agentId: id }
    });

    // Get agent status and metrics from registry
    const agentStatus = agent.getStatus();
    const metrics = this.registry.getAgentMetrics(id);

    // Map agent status to instance status
    const instanceStatus: AgentInstance['status'] =
      agentStatus.status === 'active' ? 'active' :
      agentStatus.status === 'idle' ? 'idle' :
      agentStatus.status === 'busy' ? 'busy' :
      agentStatus.status === 'error' ? 'error' : 'active';

    // Create agent instance with real data
    const agentInstance: AgentInstance = {
      id,
      type: spec.type,
      name: spec.name || `${spec.type}-${id.split('-').pop()}`,
      capabilities,
      status: instanceStatus,
      resources,
      fleetId,
      spawnedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metrics: metrics ? {
        tasksCompleted: metrics.tasksCompleted,
        averageExecutionTime: metrics.averageExecutionTime,
        successRate: 1.0 // Calculate from error count if needed
      } : {
        tasksCompleted: 0,
        averageExecutionTime: 0,
        successRate: 1.0
      }
    };

    // Store agent instance
    this.activeAgents.set(id, agentInstance);

    return agentInstance;
  }

  private async initializeAgent(agent: AgentInstance): Promise<void> {
    this.log('info', 'Initializing agent capabilities', {
      agentId: agent.id,
      type: agent.type,
      capabilities: agent.capabilities
    });

    // Simulate agent setup based on type
    const setupTime = this.getSetupTimeForType(agent.type);
    await new Promise(resolve => setTimeout(resolve, setupTime));

    this.log('info', 'Agent capabilities initialized', { agentId: agent.id });
  }

  private async registerWithFleet(agent: AgentInstance, fleetId: string): Promise<void> {
    this.log('info', 'Registering agent with fleet', {
      agentId: agent.id,
      fleetId
    });

    // This would integrate with Claude Flow fleet coordination
    // For now, we simulate the registration
    await new Promise(resolve => setTimeout(resolve, 50));

    this.log('info', 'Agent registered with fleet', {
      agentId: agent.id,
      fleetId
    });
  }

  private getSetupTimeForType(type: string): number {
    const setupTimes: Record<string, number> = {
      'test-generator': 200,
      'coverage-analyzer': 100,
      'quality-gate': 50,
      'performance-tester': 300,
      'security-scanner': 250,
      'chaos-engineer': 150,
      'visual-tester': 400
    };
    return setupTimes[type] || 100;
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.activeAgents.get(agentId);
  }

  /**
   * List agents by fleet
   */
  listAgentsByFleet(fleetId: string): AgentInstance[] {
    return Array.from(this.activeAgents.values())
      .filter(agent => agent.fleetId === fleetId);
  }

  /**
   * List all active agents
   */
  listAgents(): AgentInstance[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentInstance['status']): boolean {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    agent.status = status;
    agent.lastActivity = new Date().toISOString();
    return true;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this.activeAgents.get(agentId);
    if (!agent) {
      return false;
    }

    this.log('info', 'Terminating agent', { agentId, type: agent.type });

    // Update status
    agent.status = 'terminated';

    // Clean up resources
    // In a real implementation, this would properly close agent connections and clean up

    this.activeAgents.delete(agentId);
    return true;
  }
}