/**
 * Fleet Initialization Handler
 *
 * Handles the initialization of QE agent fleets with specified topology and configuration.
 * Integrates with Claude Flow coordination patterns.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { BaseHandler, HandlerResponse } from './base-handler.js';
import { FleetConfig } from '../tools.js';
import { AgentRegistry } from '../services/AgentRegistry.js';
import { HookExecutor } from '../services/HookExecutor.js';
import { SecureRandom } from '../../utils/SecureRandom.js';
import { AgentSpawnHandler } from './agent-spawn.js';
import { QEAgentType } from '../../types/index.js';

export interface FleetInitArgs {
  config: FleetConfig;
  projectContext?: {
    repositoryUrl?: string;
    language?: string;
    buildSystem?: string;
  };
  /** Enable agent pool warmup during initialization (default: true) */
  enablePoolWarmup?: boolean;
  /** Agent types to pre-warm in pool */
  warmupTypes?: QEAgentType[];
}

export interface FleetInstance {
  id: string;
  topology: string;
  maxAgents: number;
  currentAgents: number;
  status: 'initializing' | 'active' | 'scaling' | 'error';
  coordinationChannels: string[];
  createdAt: string;
  configuration: FleetConfig;
  /** Pool warmup status */
  poolWarmup?: {
    enabled: boolean;
    warmedTypes: QEAgentType[];
    warmupTimeMs: number;
    poolStats?: {
      totalAgents: number;
      availableAgents: number;
    };
  };
}

export class FleetInitHandler extends BaseHandler {
  private activeFleets: Map<string, FleetInstance> = new Map();
  private registry: AgentRegistry;
  private hookExecutor: HookExecutor;
  private spawnHandler: AgentSpawnHandler | null = null;

  /** Default types to warm up during fleet initialization */
  private static readonly DEFAULT_WARMUP_TYPES: QEAgentType[] = [
    QEAgentType.TEST_GENERATOR,
    QEAgentType.COVERAGE_ANALYZER,
    QEAgentType.QUALITY_GATE,
  ];

  constructor(registry: AgentRegistry, hookExecutor: HookExecutor) {
    super();
    this.registry = registry;
    this.hookExecutor = hookExecutor;
  }

  /**
   * Set the spawn handler for pool warmup integration
   * This allows fleet init to trigger pool warmup during initialization
   */
  setSpawnHandler(spawnHandler: AgentSpawnHandler): void {
    this.spawnHandler = spawnHandler;
  }

  async handle(args: FleetInitArgs): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    this.log('info', 'Initializing QE fleet', { requestId, config: args.config });

    try {
      // Execute pre-task hook
      await this.hookExecutor.executePreTask({
        description: `Initialize QE fleet with ${args.config.topology} topology`,
        agentType: 'fleet-coordinator'
      });

      // Validate required parameters
      this.validateRequired(args, ['config']);
      this.validateFleetConfig(args.config);

      const enablePoolWarmup = args.enablePoolWarmup !== false;
      const { result: fleetInstance, executionTime } = await this.measureExecutionTime(
        () => this.initializeFleet(
          args.config,
          args.projectContext,
          enablePoolWarmup,
          args.warmupTypes
        )
      );

      // Execute post-task hook
      await this.hookExecutor.executePostTask({
        taskId: fleetInstance.id,
        results: {
          fleetId: fleetInstance.id,
          topology: fleetInstance.topology,
          maxAgents: fleetInstance.maxAgents,
          status: fleetInstance.status,
          poolWarmup: fleetInstance.poolWarmup
        }
      });

      this.log('info', `Fleet initialized successfully in ${executionTime.toFixed(2)}ms`, {
        fleetId: fleetInstance.id,
        topology: fleetInstance.topology,
        maxAgents: fleetInstance.maxAgents,
        poolWarmup: fleetInstance.poolWarmup
          ? {
              enabled: true,
              warmupTimeMs: fleetInstance.poolWarmup.warmupTimeMs,
              agentsWarmed: fleetInstance.poolWarmup.poolStats?.totalAgents,
            }
          : { enabled: false }
      });

      return this.createSuccessResponse(fleetInstance, requestId);
    } catch (error) {
      this.log('error', 'Fleet initialization failed', { error: error instanceof Error ? error.message : String(error) });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Fleet initialization failed',
        requestId
      );
    }
  }

  private validateFleetConfig(config: FleetConfig): void {
    const validTopologies = ['hierarchical', 'mesh', 'ring', 'adaptive'];
    if (!validTopologies.includes(config.topology)) {
      throw new Error(`Invalid topology: ${config.topology}. Must be one of: ${validTopologies.join(', ')}`);
    }

    if (config.maxAgents < 5 || config.maxAgents > 50) {
      throw new Error('maxAgents must be between 5 and 50');
    }
  }

  private async initializeFleet(
    config: FleetConfig,
    projectContext?: any,
    enablePoolWarmup: boolean = true,
    warmupTypes?: QEAgentType[]
  ): Promise<FleetInstance> {
    const fleetId = `fleet-${Date.now()}-${SecureRandom.generateId(5)}`;

    // Create coordination channels based on topology
    const coordinationChannels = this.createCoordinationChannels(config.topology, fleetId);

    const fleetInstance: FleetInstance = {
      id: fleetId,
      topology: config.topology,
      maxAgents: config.maxAgents,
      currentAgents: 0,
      status: 'initializing',
      coordinationChannels,
      createdAt: new Date().toISOString(),
      configuration: config
    };

    // Store fleet configuration in registry metadata
    // The registry is already initialized and ready to spawn agents

    // Simulate Claude Flow integration
    await this.integrateWithClaudeFlow(fleetInstance, projectContext);

    // Pool warmup during fleet initialization (Phase 3 D1)
    if (enablePoolWarmup && this.spawnHandler) {
      const typesToWarm = warmupTypes || FleetInitHandler.DEFAULT_WARMUP_TYPES;
      this.log('info', 'Warming up agent pool during fleet init', {
        fleetId,
        types: typesToWarm,
      });

      const warmupStart = Date.now();
      await this.spawnHandler.warmupPool(typesToWarm);
      const warmupTime = Date.now() - warmupStart;

      const poolStats = this.spawnHandler.getPoolStats();
      fleetInstance.poolWarmup = {
        enabled: true,
        warmedTypes: typesToWarm,
        warmupTimeMs: warmupTime,
        poolStats: poolStats
          ? {
              totalAgents: poolStats.totalAgents,
              availableAgents: poolStats.availableAgents,
            }
          : undefined,
      };

      this.log('info', 'Pool warmup completed', {
        fleetId,
        warmupTimeMs: warmupTime,
        poolStats: fleetInstance.poolWarmup.poolStats,
      });
    }

    // Store fleet instance
    this.activeFleets.set(fleetId, fleetInstance);

    // Update current agents from registry
    fleetInstance.currentAgents = this.registry.getStatistics().totalAgents;

    // Mark as active
    fleetInstance.status = 'active';

    return fleetInstance;
  }

  private createCoordinationChannels(topology: string, fleetId: string): string[] {
    const baseChannels = [
      `${fleetId}-command`,
      `${fleetId}-status`,
      `${fleetId}-metrics`
    ];

    switch (topology) {
      case 'hierarchical':
        return [...baseChannels, `${fleetId}-hierarchy`, `${fleetId}-delegation`];
      case 'mesh':
        return [...baseChannels, `${fleetId}-peer-to-peer`, `${fleetId}-gossip`];
      case 'ring':
        return [...baseChannels, `${fleetId}-ring`, `${fleetId}-circular`];
      case 'adaptive':
        return [...baseChannels, `${fleetId}-adaptive`, `${fleetId}-dynamic`];
      default:
        return baseChannels;
    }
  }

  private async integrateWithClaudeFlow(fleet: FleetInstance, projectContext?: any): Promise<void> {
    // Simulate Claude Flow swarm initialization
    this.log('info', 'Integrating with Claude Flow coordination', { fleetId: fleet.id });

    // This would integrate with actual Claude Flow MCP tools
    // For now, we simulate the coordination setup
    await new Promise(resolve => setTimeout(resolve, 100));

    this.log('info', 'Claude Flow integration completed', {
      fleetId: fleet.id,
      channels: fleet.coordinationChannels.length
    });
  }

  /**
   * Get fleet by ID
   */
  getFleet(fleetId: string): FleetInstance | undefined {
    return this.activeFleets.get(fleetId);
  }

  /**
   * List all active fleets
   */
  listFleets(): FleetInstance[] {
    return Array.from(this.activeFleets.values());
  }

  /**
   * Destroy a fleet
   */
  async destroyFleet(fleetId: string): Promise<boolean> {
    const fleet = this.activeFleets.get(fleetId);
    if (!fleet) {
      return false;
    }

    this.log('info', 'Destroying fleet', { fleetId });

    // Clean up coordination channels
    // In a real implementation, this would properly close Claude Flow connections

    this.activeFleets.delete(fleetId);
    return true;
  }
}