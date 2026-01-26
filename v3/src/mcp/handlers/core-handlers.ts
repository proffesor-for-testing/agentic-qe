/**
 * Agentic QE v3 - Core MCP Handlers
 * Fleet, status, and health handlers
 */

import { v4 as uuidv4 } from 'uuid';
import { QEKernel, DomainPlugin } from '../../kernel/interfaces';
import { QEKernelImpl } from '../../kernel/kernel';
import { DefaultPluginLoader } from '../../kernel/plugin-loader';
import { ALL_DOMAINS, DomainName } from '../../shared/types';
import { QueenCoordinator, createQueenCoordinator } from '../../coordination/queen-coordinator';

/**
 * User-facing QE domains (excludes internal 'coordination' domain)
 * Documentation refers to "12 DDD domains" - these are the QE-focused domains
 * The 'coordination' domain is internal infrastructure for Queen Coordinator
 */
const QE_USER_DOMAINS: readonly DomainName[] = ALL_DOMAINS.filter(
  (d) => d !== 'coordination'
) as DomainName[];
import { CrossDomainEventRouter } from '../../coordination/cross-domain-router';
import { resetServiceCaches } from '../../coordination/task-executor';
import { resetTaskExecutor } from './domain-handlers';
import { resetAllToolCaches } from '../tools/registry';
import { DefaultProtocolExecutor } from '../../coordination/protocol-executor';
import {
  ToolResult,
  FleetInitParams,
  FleetInitResult,
  FleetStatusParams,
  FleetStatusResult,
  FleetHealthParams,
  DomainStatusResult,
} from '../types';

// ============================================================================
// Fleet State
// ============================================================================

interface FleetState {
  fleetId: string | null;
  kernel: QEKernel | null;
  queen: QueenCoordinator | null;
  router: CrossDomainEventRouter | null;
  initialized: boolean;
  initTime: Date | null;
}

const state: FleetState = {
  fleetId: null,
  kernel: null,
  queen: null,
  router: null,
  initialized: false,
  initTime: null,
};

/**
 * Get current fleet state
 */
export function getFleetState(): FleetState {
  return state;
}

/**
 * Check if fleet is initialized
 */
export function isFleetInitialized(): boolean {
  return state.initialized && state.kernel !== null && state.queen !== null;
}

// ============================================================================
// Fleet Init Handler
// ============================================================================

export async function handleFleetInit(
  params: FleetInitParams
): Promise<ToolResult<FleetInitResult>> {
  try {
    // If already initialized, return existing fleet
    if (state.initialized && state.kernel && state.queen) {
      return {
        success: true,
        data: {
          fleetId: state.fleetId!,
          topology: params.topology || 'hierarchical',
          maxAgents: params.maxAgents || 15,
          // Show only user-facing QE domains (12 domains, excludes internal 'coordination')
          enabledDomains: (params.enabledDomains || QE_USER_DOMAINS) as DomainName[],
          status: 'ready',
        },
      };
    }

    // Create new fleet ID
    state.fleetId = `fleet-${uuidv4().slice(0, 8)}`;

    // Determine enabled domains
    // Use QE_USER_DOMAINS (12 domains) for user-facing output, but internally still enable all 13
    // The 'coordination' domain is used by Queen Coordinator internally
    const enabledDomains: DomainName[] = params.enabledDomains || [...ALL_DOMAINS];
    const userFacingDomains: DomainName[] = enabledDomains.filter(d => d !== 'coordination') as DomainName[];

    // Create kernel
    state.kernel = new QEKernelImpl({
      maxConcurrentAgents: params.maxAgents || 15,
      memoryBackend: params.memoryBackend || 'hybrid',
      hnswEnabled: true,
      lazyLoading: params.lazyLoading !== false,
      enabledDomains,
    });

    await state.kernel.initialize();

    // Create cross-domain router
    state.router = new CrossDomainEventRouter(state.kernel.eventBus);
    await state.router.initialize();

    // Create protocol executor
    const getDomainAPI = <T>(domain: DomainName): T | undefined => {
      return state.kernel!.getDomainAPI<T>(domain);
    };
    const protocolExecutor = new DefaultProtocolExecutor(
      state.kernel.eventBus,
      state.kernel.memory,
      getDomainAPI
    );

    // INTEGRATION FIX: Build domain plugins map for direct task execution
    // Load all enabled domains to ensure plugins are available
    const pluginLoader = state.kernel.plugins as DefaultPluginLoader;
    await pluginLoader.loadAll();

    // Build domain plugins map from loaded plugins
    const domainPlugins = new Map<DomainName, DomainPlugin>();
    for (const domain of pluginLoader.getLoaded()) {
      const plugin = pluginLoader.getPlugin(domain);
      if (plugin) {
        domainPlugins.set(domain, plugin);
      }
    }

    // Create Queen Coordinator with domain plugins for direct task execution
    state.queen = createQueenCoordinator(
      state.kernel,
      state.router,
      protocolExecutor,
      undefined, // workflowExecutor
      domainPlugins // INTEGRATION FIX: Pass domain plugins
    );
    await state.queen.initialize();

    state.initialized = true;
    state.initTime = new Date();

    return {
      success: true,
      data: {
        fleetId: state.fleetId,
        topology: params.topology || 'hierarchical',
        maxAgents: params.maxAgents || 15,
        // Return user-facing domains (12) - coordination is internal
        enabledDomains: userFacingDomains,
        status: 'initialized',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialize fleet: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Fleet Status Handler
// ============================================================================

export async function handleFleetStatus(
  params: FleetStatusParams
): Promise<ToolResult<FleetStatusResult>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  try {
    const health = state.queen!.getHealth();
    const metrics = state.queen!.getMetrics();

    const result: FleetStatusResult = {
      status: health.status,
      uptime: metrics.uptime,
      agents: {
        total: health.totalAgents,
        active: health.activeAgents,
        idle: health.totalAgents - health.activeAgents,
      },
      tasks: {
        pending: health.pendingTasks,
        running: health.runningTasks,
        completed: metrics.tasksCompleted,
        failed: metrics.tasksFailed,
      },
    };

    // Add domain status if requested
    if (params.includeDomains) {
      const domains: DomainStatusResult[] = [];
      for (const [domain, domainHealth] of health.domainHealth) {
        domains.push({
          domain,
          status: domainHealth.status,
          agents: domainHealth.agents.total,
          load: state.queen!.getDomainLoad(domain),
        });
      }
      result.domains = domains;
    }

    // Add metrics if requested
    if (params.includeMetrics) {
      result.metrics = {
        tasksReceived: metrics.tasksReceived,
        tasksCompleted: metrics.tasksCompleted,
        tasksFailed: metrics.tasksFailed,
        agentUtilization: metrics.agentUtilization,
        averageTaskDuration: metrics.averageTaskDuration,
      };
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get fleet status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Fleet Health Handler
// ============================================================================

export async function handleFleetHealth(
  params: FleetHealthParams
): Promise<ToolResult<Record<string, unknown>>> {
  if (!isFleetInitialized()) {
    return {
      success: false,
      error: 'Fleet not initialized. Call fleet_init first.',
    };
  }

  try {
    if (params.domain) {
      // Get specific domain health
      const domainHealth = state.queen!.getDomainHealth(params.domain);
      if (!domainHealth) {
        return {
          success: false,
          error: `Domain not found: ${params.domain}`,
        };
      }

      return {
        success: true,
        data: {
          domain: params.domain,
          status: domainHealth.status,
          agents: domainHealth.agents,
          errors: domainHealth.errors,
          lastActivity: domainHealth.lastActivity?.toISOString(),
        },
      };
    }

    // Get overall health
    const health = state.queen!.getHealth();

    const result: Record<string, unknown> = {
      status: health.status,
      totalAgents: health.totalAgents,
      activeAgents: health.activeAgents,
      pendingTasks: health.pendingTasks,
      runningTasks: health.runningTasks,
      workStealingActive: health.workStealingActive,
      lastHealthCheck: health.lastHealthCheck.toISOString(),
    };

    if (params.detailed) {
      // Add detailed domain health
      const domainDetails: Record<string, unknown> = {};
      for (const [domain, domainHealth] of health.domainHealth) {
        domainDetails[domain] = {
          status: domainHealth.status,
          agents: domainHealth.agents,
          errors: domainHealth.errors.length,
          lastActivity: domainHealth.lastActivity?.toISOString(),
        };
      }
      result.domains = domainDetails;

      // Add issues
      result.issues = health.issues.map((issue) => ({
        severity: issue.severity,
        message: issue.message,
        domain: issue.domain,
        timestamp: issue.timestamp.toISOString(),
      }));
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get fleet health: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// ============================================================================
// Fleet Dispose
// ============================================================================

export async function disposeFleet(): Promise<void> {
  // Reset all cached services and tool instances to prevent stale memory backend references
  resetServiceCaches();
  resetTaskExecutor();
  resetAllToolCaches();

  if (state.queen) {
    await state.queen.dispose();
    state.queen = null;
  }
  if (state.router) {
    await state.router.dispose();
    state.router = null;
  }
  if (state.kernel) {
    await state.kernel.dispose();
    state.kernel = null;
  }
  state.initialized = false;
  state.fleetId = null;
  state.initTime = null;
}
