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
import { WorkflowOrchestrator } from '../../coordination/workflow-orchestrator';

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

// Import domain plugins that register workflow actions
import type { RequirementsValidationExtendedAPI } from '../../domains/requirements-validation/index.js';
import type { VisualAccessibilityAPI } from '../../domains/visual-accessibility/index.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Fleet State
// ============================================================================

export type TopologyType = 'hierarchical' | 'mesh' | 'ring' | 'adaptive';
export type AgentLevel = 'queen' | 'lead' | 'worker';

export interface AgentLevelInfo {
  agentId: string;
  domain: DomainName;
  level: AgentLevel;
  spawnedAt: Date;
}

interface FleetState {
  fleetId: string | null;
  kernel: QEKernel | null;
  queen: QueenCoordinator | null;
  router: CrossDomainEventRouter | null;
  workflowOrchestrator: WorkflowOrchestrator | null;
  initialized: boolean;
  initTime: Date | null;
  /** Active topology type */
  topology: TopologyType;
  /** Agent level assignments for hierarchical topology */
  agentLevels: Map<string, AgentLevelInfo>;
}

const state: FleetState = {
  fleetId: null,
  kernel: null,
  queen: null,
  router: null,
  workflowOrchestrator: null,
  initialized: false,
  initTime: null,
  topology: 'hierarchical',
  agentLevels: new Map(),
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

/**
 * Get the current fleet topology
 */
export function getFleetTopology(): TopologyType {
  return state.topology;
}

/**
 * Assign a level to a newly spawned agent based on topology.
 * In hierarchical topology:
 * - First agent per domain → 'lead'
 * - Subsequent agents in same domain → 'worker'
 */
export function assignAgentLevel(agentId: string, domain: DomainName): AgentLevel {
  if (state.topology !== 'hierarchical') {
    // Non-hierarchical topologies treat all agents as workers
    const info: AgentLevelInfo = { agentId, domain, level: 'worker', spawnedAt: new Date() };
    state.agentLevels.set(agentId, info);
    return 'worker';
  }

  // Check if there's already a lead for this domain
  const existingLead = Array.from(state.agentLevels.values()).find(
    a => a.domain === domain && a.level === 'lead'
  );

  const level: AgentLevel = existingLead ? 'worker' : 'lead';
  const info: AgentLevelInfo = { agentId, domain, level, spawnedAt: new Date() };
  state.agentLevels.set(agentId, info);

  return level;
}

/**
 * Get the level info for an agent
 */
export function getAgentLevel(agentId: string): AgentLevelInfo | undefined {
  return state.agentLevels.get(agentId);
}

/**
 * Get all agent levels (for debugging/metrics)
 */
export function getAllAgentLevels(): Map<string, AgentLevelInfo> {
  return state.agentLevels;
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

    // Create Workflow Orchestrator for workflow execution
    state.workflowOrchestrator = new WorkflowOrchestrator(
      state.kernel.eventBus,
      state.kernel.memory,
      state.kernel.coordinator
    );
    await state.workflowOrchestrator.initialize();

    // Register domain workflow actions (Issue #206)
    // This enables workflows like qcsd-ideation-swarm to execute their actions
    registerDomainWorkflowActions(state.kernel, state.workflowOrchestrator);

    state.initialized = true;
    state.initTime = new Date();
    state.topology = (params.topology as TopologyType) || 'hierarchical';
    state.agentLevels.clear();

    return {
      success: true,
      data: {
        fleetId: state.fleetId,
        topology: state.topology,
        maxAgents: params.maxAgents || 15,
        // Return user-facing domains (12) - coordination is internal
        enabledDomains: userFacingDomains,
        status: 'initialized',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialize fleet: ${toErrorMessage(error)}`,
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

    // Add teams summary (ADR-064)
    const teamManager = state.queen!.getDomainTeamManager?.();
    if (teamManager) {
      const teams = teamManager.listDomainTeams();
      let totalAgentsInTeams = 0;
      let healthyCount = 0;
      for (const team of teams) {
        totalAgentsInTeams += 1 + team.teammateIds.length;
        const health = teamManager.getTeamHealth(team.domain);
        if (health?.healthy) healthyCount++;
      }
      result.teams = {
        active: teams.length,
        totalAgentsInTeams,
        healthyCount,
      };
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
      error: `Failed to get fleet status: ${toErrorMessage(error)}`,
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
      error: `Failed to get fleet health: ${toErrorMessage(error)}`,
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

  if (state.workflowOrchestrator) {
    await state.workflowOrchestrator.dispose();
    state.workflowOrchestrator = null;
  }
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
  state.topology = 'hierarchical';
  state.agentLevels.clear();
}

// ============================================================================
// Domain Workflow Action Registration (Issue #206)
// ============================================================================

/**
 * Register domain-specific workflow actions with the WorkflowOrchestrator.
 * This enables workflows like qcsd-ideation-swarm to execute their actions.
 */
function registerDomainWorkflowActions(
  kernel: QEKernel,
  orchestrator: WorkflowOrchestrator
): void {
  // Register requirements-validation domain actions (including QCSD Ideation)
  const reqValAPI = kernel.getDomainAPI<RequirementsValidationExtendedAPI>('requirements-validation');
  if (reqValAPI?.registerWorkflowActions) {
    reqValAPI.registerWorkflowActions(orchestrator);
    console.log('[Fleet] Registered requirements-validation workflow actions (includes QCSD Ideation)');
  }

  // Register visual-accessibility domain actions
  const visA11yAPI = kernel.getDomainAPI<VisualAccessibilityAPI>('visual-accessibility');
  if (visA11yAPI?.registerWorkflowActions) {
    visA11yAPI.registerWorkflowActions(orchestrator);
    console.log('[Fleet] Registered visual-accessibility workflow actions');
  }
}
