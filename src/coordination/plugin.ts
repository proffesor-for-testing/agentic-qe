/**
 * Agentic QE v3 - Coordination Domain Plugin
 * Integrates the coordination layer into the kernel
 *
 * The coordination domain provides:
 * - Multi-agent swarm coordination
 * - Queen-led hierarchical orchestration
 * - Cross-domain workflow execution
 * - Protocol-based task management
 * - Claims-based work distribution
 */

import { DomainName, DomainEvent, ALL_DOMAINS } from '../shared/types/index.js';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
} from '../kernel/interfaces.js';
import { BaseDomainPlugin } from '../shared/base-domain-plugin.js';
import {
  IWorkflowOrchestrator,
  createWorkflowOrchestrator,
} from './workflow-orchestrator.js';

/**
 * Plugin configuration options
 */
export interface CoordinationPluginConfig {
  workflowConfig?: Record<string, unknown>;
}

/**
 * Public API for the coordination domain
 */
export interface CoordinationAPI {
  // Workflow methods
  listWorkflows(): Promise<unknown[]>;
}

/**
 * Coordination Domain Plugin
 *
 * Provides multi-agent coordination capabilities including:
 * - Queen-led hierarchical orchestration
 * - Workflow execution and management
 *
 * Note: The coordination layer is implemented differently from other domains.
 * It sits above the domain layer and provides orchestration capabilities
 * to all other domains.
 */
export class CoordinationPlugin extends BaseDomainPlugin {
  private workflowOrchestrator: IWorkflowOrchestrator | null = null;
  private readonly pluginConfig: CoordinationPluginConfig;

  constructor(
    eventBus: EventBus,
    memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: CoordinationPluginConfig = {}
  ) {
    super(eventBus, memory);
    this.pluginConfig = config;
  }

  // ==========================================================================
  // DomainPlugin Implementation
  // ==========================================================================

  get name(): DomainName {
    return 'coordination';
  }

  get version(): string {
    return '1.0.0';
  }

  get dependencies(): DomainName[] {
    // Coordination depends on all other domains for orchestration
    return ALL_DOMAINS.filter((d) => d !== 'coordination');
  }

  getAPI<T>(): T {
    return {
      // Workflow methods
      listWorkflows: async () => {
        if (!this.workflowOrchestrator) {
          throw new Error('Workflow orchestrator not initialized');
        }
        return this.workflowOrchestrator.listWorkflows();
      },
    } as T;
  }

  // ==========================================================================
  // Lifecycle Hooks
  // ==========================================================================

  protected async onInitialize(): Promise<void> {
    // Initialize workflow orchestrator
    this.workflowOrchestrator = createWorkflowOrchestrator(
      this.eventBus,
      this.memory,
      this.agentCoordinator,
      this.pluginConfig.workflowConfig
    );

    await this.workflowOrchestrator.initialize();

    this.updateHealth({
      status: 'healthy',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
    });
  }

  protected async onDispose(): Promise<void> {
    if (this.workflowOrchestrator) {
      await this.workflowOrchestrator.dispose();
      this.workflowOrchestrator = null;
    }
  }

  protected async onEvent(event: DomainEvent): Promise<void> {
    // Route coordination-specific events
    if (event.type.startsWith('coordination.')) {
      await this.handleCoordinationEvent(event);
    }
  }

  protected subscribeToEvents(): void {
    // Subscribe to coordination events
    this.eventBus.subscribe('coordination.workflow.execute', async (event) => {
      await this.handleEvent(event);
    });
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private async handleCoordinationEvent(event: DomainEvent): Promise<void> {
    const eventType = event.type.split('.')[1] as 'workflow';

    switch (eventType) {
      case 'workflow':
        await this.handleWorkflowEvent(event);
        break;
    }
  }

  private async handleWorkflowEvent(event: DomainEvent): Promise<void> {
    // Workflow event handling delegated to workflow orchestrator
    if (!this.workflowOrchestrator) return;
    // Implementation would handle specific workflow events
  }
}

/**
 * Factory function to create the coordination plugin
 */
export function createCoordinationPlugin(
  eventBus: EventBus,
  memory: MemoryBackend,
  coordinator: AgentCoordinator,
  config?: CoordinationPluginConfig
): CoordinationPlugin {
  return new CoordinationPlugin(eventBus, memory, coordinator, config);
}
