/**
 * Agent Registry Service
 *
 * Central registry for managing QE agent instances spawned via MCP.
 * Bridges MCP tool calls to TypeScript agent implementations.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseAgent, BaseAgentConfig } from '../../agents/BaseAgent';
import { QEAgentFactory } from '../../agents';
import { QEAgentType, AgentContext, AgentCapability, AgentStatus, MemoryStore } from '../../types';
import { Logger } from '../../utils/Logger';
import { EventBus } from '../../core/EventBus';
import { SwarmMemoryManager } from '../../core/memory/SwarmMemoryManager';
import { getSharedMemoryManager } from '../../core/memory/MemoryManagerFactory';
import { Database } from '../../utils/Database';
import { SecureRandom } from '../../utils/SecureRandom';
import {
  SONALifecycleManager,
  getSONALifecycleManager,
  type SONALifecycleConfig,
  type TaskCompletionFeedback,
} from '../../agents/SONALifecycleManager';
import type { FeedbackEvent } from '../../learning/SONAFeedbackLoop';

export interface AgentRegistryConfig {
  maxAgents?: number;
  defaultTimeout?: number;
  enableMetrics?: boolean;
  /** Enable SONA lifecycle integration (Phase 2) */
  enableSONALifecycle?: boolean;
  /** SONA lifecycle configuration */
  sonaLifecycleConfig?: SONALifecycleConfig;
}

export interface RegisteredAgent {
  id: string;
  agent: BaseAgent;
  type: QEAgentType;
  mcpType: string;
  spawnedAt: Date;
  lastActivity: Date;
  tasksCompleted: number;
  totalExecutionTime: number;
  status: 'active' | 'idle' | 'busy' | 'error' | 'terminated';
}

// Simplified config for MCP handlers (not extending BaseAgentConfig)
export interface AgentSpawnConfig {
  name?: string;
  description?: string;
  capabilities?: string[];
  resources?: {
    memory?: number;
    cpu?: number;
    storage?: number;
  };
  fleetId?: string;
}

/**
 * AgentRegistry - Central management for QE agent instances
 *
 * Responsibilities:
 * - Create and track agent instances
 * - Map MCP types to QEAgentType enum
 * - Execute tasks on agents
 * - Collect agent metrics
 * - Handle agent lifecycle
 */
export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private logger: Logger;
  private config: AgentRegistryConfig;
  private nextAgentId: number = 1;
  private eventBus: EventBus;
  private memoryStore: SwarmMemoryManager;
  private factory: QEAgentFactory;
  private sonaLifecycleManager?: SONALifecycleManager;

  constructor(config: AgentRegistryConfig = {}) {
    this.config = {
      maxAgents: config.maxAgents || 50,
      defaultTimeout: config.defaultTimeout || 300000, // 5 minutes
      enableMetrics: config.enableMetrics !== false,
      enableSONALifecycle: config.enableSONALifecycle !== false,
      sonaLifecycleConfig: config.sonaLifecycleConfig
    };
    this.logger = Logger.getInstance();

    // Initialize infrastructure
    this.eventBus = new EventBus();
    // Use singleton pattern to ensure all components share the same database connection
    // This prevents data fragmentation where data written by one component isn't visible to others
    this.memoryStore = getSharedMemoryManager('.agentic-qe/memory.db');

    // Initialize memory store database (non-blocking initialization)
    // This prevents "Database not initialized" warnings when agents spawn
    this.initializeMemoryStore().catch(error => {
      this.logger.warn('Failed to initialize memory store:', error);
    });

    // Create factory with infrastructure
    this.factory = new QEAgentFactory({
      eventBus: this.eventBus,
      memoryStore: this.memoryStore as any, // SwarmMemoryManager extends MemoryStore interface
      context: this.createDefaultContext()
    });

    // Phase 2: Initialize SONA lifecycle manager
    if (this.config.enableSONALifecycle) {
      this.sonaLifecycleManager = getSONALifecycleManager(this.config.sonaLifecycleConfig);
      this.logger.info('SONA lifecycle integration enabled');
    }
  }

  /**
   * Initialize the memory store database
   * Called automatically in constructor, but can be called explicitly if needed
   */
  private async initializeMemoryStore(): Promise<void> {
    try {
      await this.memoryStore.initialize();
      this.logger.info('AgentRegistry memory store initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AgentRegistry memory store:', error);
      // Don't throw - allow graceful degradation (memory will work without database)
    }
  }

  /**
   * Create default agent context
   */
  private createDefaultContext(): AgentContext {
    return {
      id: `registry-${Date.now()}`,
      type: 'registry',
      status: AgentStatus.INITIALIZING
    };
  }

  /**
   * Create agent-specific context
   */
  private createAgentContext(mcpType: string, agentId: string): AgentContext {
    return {
      id: agentId,
      type: mcpType,
      status: AgentStatus.ACTIVE,
      metadata: {
        workingDirectory: process.cwd(),
        environment: process.env.NODE_ENV || 'development'
      }
    };
  }

  /**
   * Map string capabilities to AgentCapability objects
   */
  private mapCapabilities(capabilities: string[]): AgentCapability[] {
    return capabilities.map((cap) => ({
      name: cap,
      version: '1.0.0',
      description: `${cap} capability`
    }));
  }

  /**
   * Spawn a new QE agent from MCP specification
   *
   * @param mcpType - MCP agent type string (e.g., 'test-generator')
   * @param config - Agent configuration
   * @returns Spawned agent ID and instance
   */
  async spawnAgent(
    mcpType: string,
    config: AgentSpawnConfig
  ): Promise<{ id: string; agent: BaseAgent }> {
    // Check agent limit
    if (this.agents.size >= this.config.maxAgents!) {
      throw new Error(`Agent limit reached: ${this.config.maxAgents}`);
    }

    // Map MCP type to QEAgentType
    const agentType = this.mapMCPTypeToQEAgentType(mcpType);
    if (!agentType) {
      throw new Error(`Unknown MCP agent type: ${mcpType}`);
    }

    // Generate unique agent ID
    const agentId = this.generateAgentId(mcpType);

    this.logger.info(`Spawning agent: ${agentId} (type: ${mcpType} -> ${agentType})`);

    try {
      // Create full BaseAgentConfig with infrastructure
      const fullConfig: BaseAgentConfig = {
        type: agentType,
        capabilities: config.capabilities
          ? this.mapCapabilities(config.capabilities)
          : [],
        context: this.createAgentContext(mcpType, agentId),
        memoryStore: this.memoryStore as unknown as MemoryStore,
        eventBus: this.eventBus,
        // Enable learning and Q-learning for all agents
        enableLearning: true,
        learningConfig: {
          enabled: true,
          learningRate: 0.1,
          discountFactor: 0.95,
          explorationRate: 0.3,
          minExplorationRate: 0.01,
          explorationDecay: 0.995
        }
      };

      // Create agent via factory instance method with additional config
      const agent = await this.factory.createAgent(agentType, {
        ...fullConfig,
        name: config.name || agentId,
        description: config.description || `${mcpType} agent spawned via MCP`
      });

      // Initialize agent
      await agent.initialize();

      // Register agent
      const registeredAgent: RegisteredAgent = {
        id: agentId,
        agent,
        type: agentType,
        mcpType,
        spawnedAt: new Date(),
        lastActivity: new Date(),
        tasksCompleted: 0,
        totalExecutionTime: 0,
        status: 'idle'
      };

      this.agents.set(agentId, registeredAgent);

      // Phase 2: SONA lifecycle hook - onAgentSpawn
      if (this.sonaLifecycleManager) {
        try {
          await this.sonaLifecycleManager.onAgentSpawn(agentId, agentType);
          this.logger.info(`SONA context initialized for agent ${agentId}`);
        } catch (error) {
          this.logger.warn(`Failed to initialize SONA for agent ${agentId}:`, error);
          // Continue without SONA - not critical
        }
      }

      this.logger.info(`Agent spawned successfully: ${agentId}`);

      return { id: agentId, agent };
    } catch (error) {
      this.logger.error(`Failed to spawn agent ${agentId}:`, error);
      throw new Error(`Agent spawn failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get an agent by ID
   *
   * @param agentId - Agent ID
   * @returns Agent instance or undefined
   */
  getAgent(agentId: string): BaseAgent | undefined {
    const registered = this.agents.get(agentId);
    if (registered) {
      registered.lastActivity = new Date();
    }
    return registered?.agent;
  }

  /**
   * Get registered agent metadata
   *
   * @param agentId - Agent ID
   * @returns Registered agent metadata or undefined
   */
  getRegisteredAgent(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Execute a task on a specific agent
   *
   * @param agentId - Agent ID
   * @param task - Task to execute (can be raw task or TaskAssignment)
   * @returns Task result
   */
  async executeTask(agentId: string, task: any): Promise<any> {
    const registered = this.agents.get(agentId);
    if (!registered) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.logger.info(`Executing task on agent ${agentId}:`, { taskType: task.taskType || task.task?.type });

    const startTime = Date.now();
    registered.status = 'busy';

    try {
      // Convert raw task to proper TaskAssignment format if needed
      // BaseAgent.executeTask() expects TaskAssignment { id, task: QETask, agentId, assignedAt, status }
      const taskAssignment = this.ensureTaskAssignment(task, agentId);

      const result = await registered.agent.executeTask(taskAssignment);

      // Update metrics
      const executionTime = Date.now() - startTime;
      registered.tasksCompleted++;
      registered.totalExecutionTime += executionTime;
      registered.lastActivity = new Date();
      registered.status = 'idle';

      // Phase 2: SONA lifecycle hook - onTaskComplete
      if (this.sonaLifecycleManager) {
        const feedback: TaskCompletionFeedback = {
          task: taskAssignment.task,
          success: true,
          duration: executionTime,
          quality: result?.quality,
          result: result,
          patternsUsed: result?.patternsUsed,
        };

        try {
          await this.sonaLifecycleManager.onTaskComplete(agentId, feedback);
        } catch (error) {
          this.logger.warn(`SONA task completion hook failed for ${agentId}:`, error);
          // Continue - don't break execution flow
        }
      }

      this.logger.info(`Task completed on agent ${agentId} in ${executionTime}ms`);

      return result;
    } catch (error) {
      registered.status = 'error';

      // Phase 2: SONA lifecycle hook - onTaskComplete (failure)
      if (this.sonaLifecycleManager) {
        const executionTime = Date.now() - startTime;
        const feedback: TaskCompletionFeedback = {
          task: task.task || task,
          success: false,
          duration: executionTime,
          error: error instanceof Error ? error : new Error(String(error)),
        };

        try {
          await this.sonaLifecycleManager.onTaskComplete(agentId, feedback);
        } catch (sonaError) {
          this.logger.warn(`SONA task completion hook failed for ${agentId}:`, sonaError);
          // Continue - don't mask original error
        }
      }

      this.logger.error(`Task failed on agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure task is in proper TaskAssignment format
   * Converts raw task payloads to the format BaseAgent.executeTask() expects
   */
  private ensureTaskAssignment(task: any, agentId: string): any {
    // If already a TaskAssignment (has 'task' property with QETask structure), return as-is
    if (task.task && typeof task.task === 'object' && task.task.type) {
      return task;
    }

    // Convert raw task to TaskAssignment format
    const taskId = `task-${Date.now()}-${SecureRandom.generateId(6)}`;

    return {
      id: taskId,
      task: {
        id: taskId,
        type: task.taskType || task.type || 'generic',
        payload: task.payload || task,
        priority: task.priority || 5,
        status: 'pending',
        description: task.description || `Task for agent ${agentId}`,
        context: task.context || {},
        requirements: task.requirements || {}
      },
      agentId: agentId,
      assignedAt: new Date(),
      status: 'assigned'
    };
  }

  /**
   * Terminate an agent
   *
   * @param agentId - Agent ID
   */
  async terminateAgent(agentId: string): Promise<void> {
    const registered = this.agents.get(agentId);
    if (!registered) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.logger.info(`Terminating agent: ${agentId}`);

    try {
      // Phase 2: SONA lifecycle hook - cleanup before termination
      if (this.sonaLifecycleManager) {
        try {
          await this.sonaLifecycleManager.cleanupAgent(agentId);
          this.logger.info(`SONA context cleaned up for agent ${agentId}`);
        } catch (error) {
          this.logger.warn(`Failed to cleanup SONA for agent ${agentId}:`, error);
          // Continue with termination
        }
      }

      // Call public terminate method instead of protected cleanup
      // The agent will handle cleanup internally
      await registered.agent.terminate();
      registered.status = 'terminated';
      this.agents.delete(agentId);

      this.logger.info(`Agent terminated: ${agentId}`);
    } catch (error) {
      this.logger.error(`Failed to terminate agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get all active agents
   *
   * @returns Array of registered agents
   */
  getAllAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   *
   * @param mcpType - MCP agent type
   * @returns Array of agents matching type
   */
  getAgentsByType(mcpType: string): RegisteredAgent[] {
    return Array.from(this.agents.values()).filter(
      (registered) => registered.mcpType === mcpType
    );
  }

  /**
   * Get agent metrics
   *
   * @param agentId - Agent ID
   * @returns Agent metrics
   */
  getAgentMetrics(agentId: string): {
    tasksCompleted: number;
    averageExecutionTime: number;
    uptime: number;
    status: string;
  } | undefined {
    const registered = this.agents.get(agentId);
    if (!registered) return undefined;

    const uptime = Date.now() - registered.spawnedAt.getTime();
    const averageExecutionTime =
      registered.tasksCompleted > 0
        ? registered.totalExecutionTime / registered.tasksCompleted
        : 0;

    return {
      tasksCompleted: registered.tasksCompleted,
      averageExecutionTime,
      uptime,
      status: registered.status
    };
  }

  /**
   * Phase 2: Get SONA metrics for an agent
   *
   * @param agentId - Agent ID
   * @returns SONA metrics or undefined
   */
  async getSONAMetrics(agentId: string): Promise<any> {
    if (!this.sonaLifecycleManager) {
      return undefined;
    }

    return await this.sonaLifecycleManager.getMetrics(agentId);
  }

  /**
   * Phase 2: Record feedback for an agent
   *
   * @param agentId - Agent ID
   * @param event - Feedback event
   */
  async recordFeedback(agentId: string, event: FeedbackEvent): Promise<void> {
    if (!this.sonaLifecycleManager) {
      this.logger.warn('SONA lifecycle not enabled, cannot record feedback');
      return;
    }

    await this.sonaLifecycleManager.onFeedback(agentId, event);
  }

  /**
   * Phase 2: Manually trigger training for an agent
   *
   * @param agentId - Agent ID
   * @param iterations - Number of training iterations
   * @returns Training result
   */
  async trainAgent(agentId: string, iterations: number = 10): Promise<any> {
    if (!this.sonaLifecycleManager) {
      throw new Error('SONA lifecycle not enabled');
    }

    return await this.sonaLifecycleManager.train(agentId, iterations);
  }

  /**
   * Phase 2: Get SONA lifecycle statistics
   *
   * @returns Lifecycle statistics
   */
  getSONAStatistics(): any {
    if (!this.sonaLifecycleManager) {
      return {
        enabled: false,
        totalAgents: 0,
        totalSuccessfulTasks: 0,
        totalFailedTasks: 0,
        averageSuccessRate: 0,
        totalConsolidations: 0,
        ruvLLMAvailable: false,
      };
    }

    return {
      enabled: true,
      ...this.sonaLifecycleManager.getStatistics(),
    };
  }

  /**
   * Get registry statistics
   *
   * @returns Registry statistics
   */
  getStatistics(): {
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    busyAgents: number;
    errorAgents: number;
    totalTasks: number;
    averageTaskTime: number;
  } {
    const agents = Array.from(this.agents.values());

    const stats = {
      totalAgents: agents.length,
      activeAgents: agents.filter((a) => a.status !== 'terminated').length,
      idleAgents: agents.filter((a) => a.status === 'idle').length,
      busyAgents: agents.filter((a) => a.status === 'busy').length,
      errorAgents: agents.filter((a) => a.status === 'error').length,
      totalTasks: agents.reduce((sum, a) => sum + a.tasksCompleted, 0),
      averageTaskTime: 0
    };

    const totalTime = agents.reduce((sum, a) => sum + a.totalExecutionTime, 0);
    if (stats.totalTasks > 0) {
      stats.averageTaskTime = totalTime / stats.totalTasks;
    }

    return stats;
  }

  /**
   * Clear all agents (cleanup)
   */
  async clearAll(): Promise<void> {
    this.logger.info('Clearing all agents from registry');

    const agentIds = Array.from(this.agents.keys());
    for (const agentId of agentIds) {
      try {
        await this.terminateAgent(agentId);
      } catch (error) {
        this.logger.warn(`Failed to terminate agent ${agentId} during clearAll:`, error);
      }
    }

    this.agents.clear();
    this.logger.info('All agents cleared from registry');
  }

  /**
   * Generate unique agent ID
   *
   * @param mcpType - MCP agent type
   * @returns Unique agent ID
   */
  private generateAgentId(mcpType: string): string {
    const timestamp = Date.now();
    const random = SecureRandom.generateId(9);
    const id = this.nextAgentId++;
    return `${mcpType}-${id}-${timestamp}-${random}`;
  }

  /**
   * Map MCP agent type to QEAgentType enum
   *
   * @param mcpType - MCP agent type string
   * @returns QEAgentType enum value or undefined
   */
  private mapMCPTypeToQEAgentType(mcpType: string): QEAgentType | undefined {
    const mapping: Record<string, QEAgentType> = {
      // Core Testing Agents (6)
      'test-generator': QEAgentType.TEST_GENERATOR,
      'test-executor': QEAgentType.TEST_EXECUTOR,
      'coverage-analyzer': QEAgentType.COVERAGE_ANALYZER,
      'quality-gate': QEAgentType.QUALITY_GATE,
      'performance-tester': QEAgentType.PERFORMANCE_TESTER,
      'security-scanner': QEAgentType.SECURITY_SCANNER,

      // Strategic Planning Agents (3)
      'requirements-validator': QEAgentType.REQUIREMENTS_VALIDATOR,
      'deployment-validator': QEAgentType.DEPLOYMENT_READINESS,
      'production-analyzer': QEAgentType.PRODUCTION_INTELLIGENCE,

      // Specialized Testing Agents (3)
      'fleet-commander': QEAgentType.FLEET_COMMANDER,
      'chaos-engineer': QEAgentType.CHAOS_ENGINEER,
      'visual-tester': QEAgentType.VISUAL_TESTER,

      // Optimization Agents (4)
      'regression-analyzer': QEAgentType.REGRESSION_RISK_ANALYZER,
      'data-generator': QEAgentType.TEST_DATA_ARCHITECT,
      'contract-validator': QEAgentType.API_CONTRACT_VALIDATOR,
      'flaky-test-detector': QEAgentType.FLAKY_TEST_HUNTER,

      // Quality Experience (QX) Agent
      'qx-partner': QEAgentType.QX_PARTNER,

      // Accessibility Testing Agent
      'accessibility-ally': QEAgentType.ACCESSIBILITY_ALLY,
      'a11y-ally': QEAgentType.ACCESSIBILITY_ALLY,

      // Workflow step type mappings (for task orchestration)
      'code-analyzer': QEAgentType.QUALITY_ANALYZER,
      'metrics-collector': QEAgentType.QUALITY_ANALYZER,
      'defect-predictor': QEAgentType.QUALITY_ANALYZER,
      'report-generator': QEAgentType.QUALITY_ANALYZER,
      'generic-agent': QEAgentType.QUALITY_ANALYZER
    };

    return mapping[mcpType];
  }

  /**
   * Get supported MCP agent types
   *
   * @returns Array of supported MCP types
   */
  getSupportedMCPTypes(): string[] {
    return [
      'test-generator',
      'test-executor',
      'coverage-analyzer',
      'quality-gate',
      'performance-tester',
      'security-scanner',
      'requirements-validator',
      'deployment-validator',
      'production-analyzer',
      'fleet-commander',
      'chaos-engineer',
      'visual-tester',
      'regression-analyzer',
      'data-generator',
      'contract-validator',
      'flaky-test-detector',
      'qx-partner',
      'accessibility-ally',
      'a11y-ally'
    ];
  }

  /**
   * Check if MCP type is supported
   *
   * @param mcpType - MCP agent type
   * @returns True if supported
   */
  isSupportedMCPType(mcpType: string): boolean {
    return this.mapMCPTypeToQEAgentType(mcpType) !== undefined;
  }
}

/**
 * Singleton instance for global access
 */
let globalRegistry: AgentRegistry | null = null;

/**
 * Get or create global agent registry
 *
 * @param config - Optional configuration
 * @returns Global agent registry instance
 */
export function getAgentRegistry(config?: AgentRegistryConfig): AgentRegistry {
  if (!globalRegistry) {
    globalRegistry = new AgentRegistry(config);
  }
  return globalRegistry;
}

/**
 * Reset global agent registry (for testing)
 */
export function resetAgentRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clearAll().catch(console.error);
    globalRegistry = null;
  }
}
