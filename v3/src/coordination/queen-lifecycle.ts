/**
 * Agentic QE v3 - Queen Lifecycle & State Management
 * Extracted from queen-coordinator.ts - Initialize/dispose subsystems,
 * state persistence, metrics collection, and task cleanup.
 */

import type { DomainName } from '../shared/types';
import type {
  DomainPlugin,
  MemoryBackend,
} from '../kernel/interfaces';
import type { CrossDomainRouter } from './interfaces';
import type { QueenMinCutBridge } from './mincut/queen-integration';
import type { IMinCutAwareDomain } from './mixins/mincut-aware-domain.js';
import type { TraceContext } from './agent-teams/tracing.js';
import type { WorkloadMetrics } from './dynamic-scaling/index.js';

import type {
  TaskExecution,
  QueenConfig,
  QueenTask,
  QueenMetrics,
} from './queen-types.js';

// ============================================================================
// MinCut type guard
// ============================================================================

/**
 * Type guard to check if a plugin supports MinCut integration
 * ADR-047: Uses proper typing instead of `as any`
 */
export function isMinCutAwarePlugin(plugin: DomainPlugin): plugin is DomainPlugin & IMinCutAwareDomain {
  return typeof (plugin as DomainPlugin & Partial<IMinCutAwareDomain>).setMinCutBridge === 'function';
}

// ============================================================================
// MinCut injection
// ============================================================================

/**
 * Inject MinCut bridge into all domain plugins that support it.
 * ADR-047: Enables domains to access topology health and participate in self-healing.
 */
export function injectMinCutBridgeIntoPlugins(
  domainPlugins: Map<DomainName, DomainPlugin>,
  bridge: QueenMinCutBridge,
): void {
  for (const [domainName, plugin] of domainPlugins) {
    if (isMinCutAwarePlugin(plugin)) {
      plugin.setMinCutBridge(bridge);
      console.log(`[QueenCoordinator] MinCut bridge injected into ${domainName}`);
    }
  }
}

// ============================================================================
// State persistence
// ============================================================================

/**
 * Load persisted state (queued tasks) from memory backend.
 */
export async function loadState(
  memory: MemoryBackend,
  tasks: Map<string, TaskExecution>,
  enqueueTask: (task: QueenTask) => void,
): Promise<void> {
  try {
    const state = await memory.get<{
      tasks: [string, TaskExecution][];
    }>('queen:state');

    if (state) {
      for (const [id, execution] of state.tasks) {
        if (execution.status === 'queued') {
          tasks.set(id, execution);
          enqueueTask(execution.task);
        }
      }
    }
  } catch (error) {
    console.debug('[QueenCoordinator] State loading failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Save current state (queued tasks) to memory backend.
 */
export async function saveState(
  memory: MemoryBackend,
  tasks: Map<string, TaskExecution>,
): Promise<void> {
  const queuedTasks = Array.from(tasks.entries())
    .filter(([, t]) => t.status === 'queued');

  await memory.set(
    'queen:state',
    { tasks: queuedTasks },
    { namespace: 'queen-coordinator', persist: true },
  );
}

// ============================================================================
// Metrics collection timer
// ============================================================================

export interface MetricsCollectionContext {
  readonly config: QueenConfig;
  readonly memory: MemoryBackend;

  // Dynamic scaler
  readonly dynamicScaler: import('./dynamic-scaling/index.js').DynamicScaler | null;

  // Callbacks
  getMetrics(): QueenMetrics;
  publishEvent(type: string, payload: Record<string, unknown>): Promise<void>;
  getQueuedTaskCount(): number;
  getActiveAgentCount(): number;
  getIdleAgentCount(): number;
  getAverageTaskDuration(): number;
  getTasksReceived(): number;
  getTasksFailed(): number;
  getTasksCompleted(): number;
}

/**
 * Start the metrics collection interval timer.
 * ADR-064 Phase 4C: Also feeds workload metrics to dynamic scaler.
 */
export function startMetricsCollectionTimer(ctx: MetricsCollectionContext): NodeJS.Timeout {
  return setInterval(async () => {
    const metrics = ctx.getMetrics();
    await ctx.publishEvent('MetricsCollected', { metrics });

    await ctx.memory.set(`queen:metrics:${Date.now()}`, metrics, {
      ttl: 86400000, // 24 hours
      namespace: 'queen-coordinator',
    });

    // ADR-064 Phase 4C: Feed workload metrics to dynamic scaler
    if (ctx.dynamicScaler) {
      try {
        const avgDuration = ctx.getAverageTaskDuration();

        const workloadMetrics: WorkloadMetrics = {
          queueDepth: ctx.getQueuedTaskCount(),
          activeAgents: ctx.getActiveAgentCount(),
          idleAgents: ctx.getIdleAgentCount(),
          avgTaskDurationMs: avgDuration,
          errorRate: ctx.getTasksReceived() > 0
            ? ctx.getTasksFailed() / ctx.getTasksReceived()
            : 0,
          throughput: metrics.uptime > 0
            ? (ctx.getTasksCompleted() / (metrics.uptime / 1000))
            : 0,
          timestamp: Date.now(),
        };

        ctx.dynamicScaler.recordMetrics(workloadMetrics);
        const decision = ctx.dynamicScaler.evaluate();
        if (decision && decision.action !== 'maintain') {
          console.log(`[QueenCoordinator] Dynamic scaler: ${decision.action} to ${decision.targetAgents} agents — ${decision.reason}`);
          ctx.dynamicScaler.execute(decision).catch(scaleErr => {
            console.warn('[QueenCoordinator] Dynamic scaling execution error:', scaleErr);
          });
        }
      } catch (scaleError) {
        console.warn('[QueenCoordinator] Dynamic scaler metrics error:', scaleError);
      }
    }
  }, ctx.config.metricsInterval);
}

// ============================================================================
// Task cleanup
// ============================================================================

/**
 * MEM-002 FIX: Clean up completed/failed/cancelled tasks older than retention period.
 * MEM-003 FIX: Also enforces max-size guard on taskTraceContexts.
 *
 * @returns Number of tasks cleaned up
 */
export function cleanupCompletedTasks(
  tasks: Map<string, TaskExecution>,
  taskTraceContexts: Map<string, TraceContext>,
  retentionMs: number = 3600000,
): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [taskId, execution] of tasks) {
    if (
      execution.status === 'completed' ||
      execution.status === 'failed' ||
      execution.status === 'cancelled'
    ) {
      const completedTime = execution.completedAt?.getTime() ||
        execution.startedAt?.getTime() ||
        0;

      if (completedTime > 0 && now - completedTime > retentionMs) {
        tasks.delete(taskId);
        taskTraceContexts.delete(taskId);
        cleaned++;
      }
    }
  }

  // MEM-003 FIX: Enforce max-size guard on taskTraceContexts (FIFO eviction)
  const MAX_TRACE_CONTEXTS = 10000;
  if (taskTraceContexts.size > MAX_TRACE_CONTEXTS) {
    const excess = taskTraceContexts.size - MAX_TRACE_CONTEXTS;
    const keysIterator = taskTraceContexts.keys();
    for (let i = 0; i < excess; i++) {
      const oldest = keysIterator.next().value;
      if (oldest !== undefined) {
        taskTraceContexts.delete(oldest);
      }
    }
    console.log(`[QueenCoordinator] Evicted ${excess} oldest trace contexts (max: ${MAX_TRACE_CONTEXTS})`);
  }

  if (cleaned > 0) {
    console.log(`[QueenCoordinator] Cleaned up ${cleaned} old tasks (retention: ${retentionMs}ms)`);
  }

  return cleaned;
}

// ============================================================================
// Enabled domains helper
// ============================================================================

/**
 * Get list of enabled domains.
 * Issue #205 fix: Used to only check enabled domains in health reporting.
 */
export function getEnabledDomains(
  domainPlugins: Map<DomainName, DomainPlugin> | undefined,
  allDomains: readonly DomainName[],
): DomainName[] {
  if (domainPlugins && domainPlugins.size > 0) {
    return Array.from(domainPlugins.keys());
  }
  return [...allDomains];
}
