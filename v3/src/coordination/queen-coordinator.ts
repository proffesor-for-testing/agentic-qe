/**
 * Agentic QE v3 - Queen Coordinator
 * The sovereign orchestrator of the hierarchical hive operations.
 * Manages 12 domain coordinators, work stealing, and cross-domain workflows.
 *
 * Per Master Plan Section 4.1:
 * - Agent #1 in the hierarchy
 * - Coordinates 47 agents across 12 domains
 * - Implements work stealing for load balancing
 * - Orchestrates cross-domain protocols
 *
 * Implementation split across:
 * - queen-types.ts: Types, interfaces, constants, config
 * - queen-event-handlers.ts: Domain/task/agent event handling, pattern training
 * - queen-task-management.ts: Task assignment, queue ops, domain routing
 * - queen-work-stealing.ts: Work stealing algorithm
 * - queen-lifecycle.ts: Initialize/dispose, state persistence, cleanup
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainName,
  ALL_DOMAINS,
  Result,
  ok,
  err,
  Priority,
} from '../shared/types';
import { CircularBuffer } from '../shared/utils/index.js';
import {
  EventBus,
  AgentCoordinator,
  AgentInfo,
  DomainPlugin,
  DomainHealth,
  MemoryBackend,
  QEKernel,
} from '../kernel/interfaces';
import {
  CrossDomainRouter,
  ProtocolExecutor,
  WorkflowExecutor,
} from './interfaces';
import { TaskAuditLogger, createTaskAuditLogger } from './services';
import {
  QueenMinCutBridge,
  createQueenMinCutBridge,
} from './mincut/queen-integration';
import { getSharedMinCutGraph } from './mincut/shared-singleton';

// V3 Integration: TinyDancer intelligent model routing (TD-004, TD-005, TD-006)
import {
  QueenRouterAdapter,
} from '../routing/queen-integration.js';

// V3 Integration: @claude-flow/guidance governance (ADR-058)
import { queenGovernanceAdapter, type TaskGovernanceContext } from '../governance/index.js';

// ADR-064 Integration: Agent Teams, Circuit Breakers, Fleet Tiers
import { createAgentTeamsAdapter, AgentTeamsAdapter } from './agent-teams/index.js';
import { DomainTeamManager, createDomainTeamManager } from './agent-teams/domain-team-manager.js';
import { DomainBreakerRegistry, createDomainBreakerRegistry } from './circuit-breaker/index.js';
import { TierSelector, createTierSelector } from './fleet-tiers/index.js';
import type { FleetTier, TierSelectionContext } from './fleet-tiers/index.js';

// ADR-064 Phase 3: Learning & Observability
import type { IQEReasoningBank } from '../learning/qe-reasoning-bank.js';
import { TaskCompletedHook } from '../hooks/task-completed-hook.js';
import { ReasoningBankPatternStore } from '../hooks/reasoning-bank-pattern-store.js';

// ADR-064 Phase 3: Distributed Tracing
import { TraceCollector, createTraceCollector } from './agent-teams/tracing.js';
import type { TraceContext } from './agent-teams/tracing.js';

// ADR-064 Phase 4: Competing Hypotheses, Federation, Dynamic Scaling
import { HypothesisManager, createHypothesisManager } from './competing-hypotheses/index.js';
import { FederationMailbox, createFederationMailbox } from './federation/index.js';
import { DynamicScaler, createDynamicScaler } from './dynamic-scaling/index.js';

// Types, interfaces, constants, and config
import {
  TASK_DOMAIN_MAP,
  DEFAULT_QUEEN_CONFIG,
  initializeTaskDomainMap,
} from './queen-types.js';

// Re-export all types for external consumers
export type {
  QueenTask,
  TaskType,
  TaskExecution,
  DomainGroup,
  WorkStealingConfig,
  QueenMetrics,
  QueenConfig,
  QueenHealth,
  HealthIssue,
  IQueenCoordinator,
  TaskFilter,
} from './queen-types.js';
export { DOMAIN_GROUPS, TASK_DOMAIN_MAP } from './queen-types.js';

import type {
  QueenTask,
  TaskExecution,
  QueenMetrics,
  QueenConfig,
  QueenHealth,
  HealthIssue,
  IQueenCoordinator,
  TaskFilter,
} from './queen-types.js';

// Extracted modules
import { subscribeToEvents, computeDomainHealthFromAgents } from './queen-event-handlers.js';
import {
  enqueueTask, removeFromQueues, getQueuePosition, processQueue,
  listTasks as listTasksImpl, assignTask, assignTaskToDomain,
} from './queen-task-management.js';
import type { QueenTaskContext } from './queen-task-management.js';
import { triggerWorkStealing as triggerWorkStealingImpl, startWorkStealingTimer } from './queen-work-stealing.js';
import type { QueenWorkStealingContext } from './queen-work-stealing.js';
import {
  isMinCutAwarePlugin, injectMinCutBridgeIntoPlugins,
  loadState, saveState, startMetricsCollectionTimer,
  cleanupCompletedTasks as cleanupCompletedTasksImpl, getEnabledDomains,
} from './queen-lifecycle.js';
import type { QueenEventHandlerContext } from './queen-event-handlers.js';

// Initialize TASK_DOMAIN_MAP entries that need ALL_DOMAINS
initializeTaskDomainMap(ALL_DOMAINS);

// ============================================================================
// Queen Coordinator Implementation
// ============================================================================

export class QueenCoordinator implements IQueenCoordinator {
  private readonly config: QueenConfig;
  private readonly tasks: Map<string, TaskExecution> = new Map();
  private readonly taskQueue: Map<Priority, QueenTask[]> = new Map();
  private readonly domainQueues: Map<DomainName, QueenTask[]> = new Map();
  private readonly domainLastActivity: Map<DomainName, Date> = new Map();

  private initialized = false;
  private workStealingTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private startTime: Date = new Date();

  // PAP-003: Store subscription IDs for proper cleanup
  private eventSubscriptionIds: string[] = [];

  // CC-002: Atomic counter for concurrent task tracking
  private runningTaskCounter = 0;

  // Metrics counters
  private tasksReceived = 0;
  private tasksCompleted = 0;
  private tasksFailed = 0;
  private tasksStolen = 0;
  private taskDurations = new CircularBuffer<number>(1000);
  private protocolsExecuted = 0;
  private workflowsExecuted = 0;

  // SEC-003: Lightweight audit logging
  private readonly auditLogger: TaskAuditLogger;

  // ADR-047: MinCut topology health monitoring
  private minCutBridge: QueenMinCutBridge | null = null;

  // V3: TinyDancer intelligent model routing
  private tinyDancerRouter: QueenRouterAdapter | null = null;

  // ADR-064: Subsystems
  private domainBreakerRegistry: DomainBreakerRegistry | null = null;
  private domainTeamManager: DomainTeamManager | null = null;
  private agentTeamsAdapter: AgentTeamsAdapter | null = null;
  private tierSelector: TierSelector | null = null;
  private taskCompletedHook: TaskCompletedHook | null = null;
  private traceCollector: TraceCollector | null = null;
  private readonly taskTraceContexts = new Map<string, TraceContext>();
  private hypothesisManager: HypothesisManager | null = null;
  private federationMailbox: FederationMailbox | null = null;
  private dynamicScaler: DynamicScaler | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly agentCoordinator: AgentCoordinator,
    private readonly memory: MemoryBackend,
    private readonly router: CrossDomainRouter,
    private readonly protocolExecutor?: ProtocolExecutor,
    private readonly workflowExecutor?: WorkflowExecutor,
    private readonly domainPlugins?: Map<DomainName, DomainPlugin>,
    config: Partial<QueenConfig> = {}
  ) {
    this.config = { ...DEFAULT_QUEEN_CONFIG, ...config };

    this.auditLogger = createTaskAuditLogger({
      enableConsoleLog: this.config.enableMetrics,
      maxEntries: 1000,
      logPrefix: '[QUEEN]',
    });

    // Initialize priority queues
    (['p0', 'p1', 'p2', 'p3'] as Priority[]).forEach(p => {
      this.taskQueue.set(p, []);
    });

    // V3: Initialize TinyDancer routing
    if (this.config.enableRouting !== false) {
      this.tinyDancerRouter = new QueenRouterAdapter(this.config.routing);
    }

    // Initialize domain queues
    ALL_DOMAINS.forEach(domain => {
      this.domainQueues.set(domain, []);
      this.domainLastActivity.set(domain, new Date());
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.startTime = new Date();
    await this.router.initialize();

    // Subscribe to domain events
    this.subscribeToEvents();

    // Start work stealing if enabled
    if (this.config.workStealing.enabled) {
      this.workStealingTimer = startWorkStealingTimer(
        this.config,
        () => this.triggerWorkStealing().then(() => {}),
      );
    }

    // Start metrics collection if enabled
    if (this.config.enableMetrics) {
      this.metricsTimer = startMetricsCollectionTimer(this.createMetricsContext());
    }

    // MEM-002 FIX: Automatic cleanup of completed/failed tasks
    this.cleanupTimer = setInterval(() => {
      cleanupCompletedTasksImpl(this.tasks, this.taskTraceContexts, 3600000);
    }, 300000);
    this.cleanupTimer.unref();

    // Load persisted state
    await loadState(this.memory, this.tasks, (task) => this.enqueueTaskInternal(task));

    // ADR-047: Initialize MinCut topology health monitoring
    this.minCutBridge = createQueenMinCutBridge(this.eventBus, this.agentCoordinator, {
      autoUpdateFromEvents: true,
      persistData: true,
      includeInQueenHealth: true,
      sharedGraph: getSharedMinCutGraph(),
    });
    await this.minCutBridge.initialize();

    // Inject MinCut bridge into domain plugins
    if (this.domainPlugins) {
      injectMinCutBridgeIntoPlugins(this.domainPlugins, this.minCutBridge);
    }

    // ADR-058: Initialize governance adapter
    try {
      await queenGovernanceAdapter.initialize();
      console.log('[QueenCoordinator] Governance adapter initialized');
    } catch (govError) {
      console.warn('[QueenCoordinator] Governance initialization failed (continuing):', govError);
    }

    // ADR-064: Initialize subsystems (non-fatal failures)
    this.initializeSubsystems();

    // Publish initialization event
    await this.publishEvent('QueenInitialized', {
      timestamp: new Date(),
      config: this.config,
      domains: ALL_DOMAINS,
    });

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    // Stop timers
    if (this.workStealingTimer) { clearInterval(this.workStealingTimer); this.workStealingTimer = null; }
    if (this.metricsTimer) { clearInterval(this.metricsTimer); this.metricsTimer = null; }
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }

    // ADR-047: Dispose MinCut bridge
    if (this.minCutBridge) { await this.minCutBridge.dispose(); this.minCutBridge = null; }

    // ADR-064: Dispose subsystems
    if (this.domainTeamManager) { this.domainTeamManager.dispose(); this.domainTeamManager = null; }
    if (this.agentTeamsAdapter) { this.agentTeamsAdapter.shutdown(); this.agentTeamsAdapter = null; }
    this.domainBreakerRegistry = null;
    this.tierSelector = null;

    if (this.traceCollector) { this.traceCollector.dispose(); this.traceCollector = null; }
    if (this.hypothesisManager) { this.hypothesisManager.dispose(); this.hypothesisManager = null; }
    if (this.federationMailbox) { this.federationMailbox.dispose(); this.federationMailbox = null; }
    if (this.dynamicScaler) { this.dynamicScaler.dispose(); this.dynamicScaler = null; }

    await saveState(this.memory, this.tasks);

    // Cancel all pending tasks
    for (const [taskId, execution] of this.tasks) {
      if (execution.status === 'queued' || execution.status === 'running') {
        await this.cancelTask(taskId);
      }
    }

    await this.publishEvent('QueenShutdown', { timestamp: new Date(), metrics: this.getMetrics() });

    // PAP-003: Unsubscribe from all events
    for (const subscriptionId of this.eventSubscriptionIds) {
      this.router.unsubscribe(subscriptionId);
    }
    this.eventSubscriptionIds = [];

    await this.router.dispose();
    this.initialized = false;
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  async submitTask(taskInput: Omit<QueenTask, 'id' | 'createdAt'>): Promise<Result<string, Error>> {
    if (!this.initialized) {
      return err(new Error('Queen Coordinator not initialized'));
    }

    const taskId = `task_${uuidv4()}`;
    const task: QueenTask = {
      ...taskInput,
      id: taskId,
      createdAt: new Date(),
      timeout: taskInput.timeout || this.config.defaultTaskTimeout,
    };

    // ADR-058: Governance check
    const governanceContext: TaskGovernanceContext = {
      taskId: task.id,
      taskType: task.type,
      agentId: task.requester || 'unknown',
      domain: task.targetDomains[0] || 'test-generation',
      priority: task.priority,
      payload: task.payload,
    };

    try {
      const governanceDecision = await queenGovernanceAdapter.beforeTaskExecution(governanceContext);
      if (!governanceDecision.allowed) {
        this.auditLogger.logFail(taskId, 'governance', governanceDecision.reason || 'Governance check failed');
        await this.publishEvent('TaskRejected', {
          taskId, reason: governanceDecision.reason, escalate: governanceDecision.escalate,
        });
        return err(new Error(`Task blocked by governance: ${governanceDecision.reason}`));
      }
    } catch (govError) {
      console.warn('[QueenCoordinator] Governance check error (continuing):', govError);
    }

    // CC-002: Atomic increment before capacity check
    this.runningTaskCounter++;

    try {
      if (this.runningTaskCounter > this.config.maxConcurrentTasks) {
        this.runningTaskCounter--;
        return this.queueTask(task);
      }

      this.auditLogger.logSubmit(taskId, { type: task.type, priority: task.priority });

      // ADR-064: Fleet tier selection
      this.selectFleetTier(task);

      // ADR-064 Phase 3: Start trace
      this.startTaskTrace(task, taskId);

      // Assign task to domain
      const assignResult = await assignTask(this.createTaskContext(), task);
      if (!assignResult.success) {
        this.runningTaskCounter--;
        return assignResult;
      }

      this.tasksReceived++;
      await this.publishEvent('TaskSubmitted', { taskId, task });

      return ok(taskId);
    } catch (error) {
      this.runningTaskCounter--;
      throw error;
    }
  }

  async cancelTask(taskId: string): Promise<Result<void, Error>> {
    const execution = this.tasks.get(taskId);
    if (!execution) return err(new Error(`Task not found: ${taskId}`));
    if (execution.status === 'completed' || execution.status === 'failed') {
      return err(new Error(`Task already finished: ${taskId}`));
    }

    if (execution.status === 'running' || execution.status === 'assigned') {
      this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);
    }

    this.tasks.set(taskId, { ...execution, status: 'cancelled', completedAt: new Date() });
    removeFromQueues(this.taskQueue, this.domainQueues, execution.task);

    for (const agentId of execution.assignedAgents) {
      await this.agentCoordinator.stop(agentId);
    }

    this.auditLogger.logCancel(taskId);
    await this.publishEvent('TaskCancelled', { taskId });

    return ok(undefined);
  }

  getTaskStatus(taskId: string): TaskExecution | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(filter?: TaskFilter): TaskExecution[] {
    return listTasksImpl(this.tasks, filter);
  }

  // ============================================================================
  // Domain Coordination
  // ============================================================================

  getDomainHealth(domain: DomainName): DomainHealth | undefined {
    if (this.domainPlugins) {
      const plugin = this.domainPlugins.get(domain);
      if (plugin) return plugin.getHealth();
    }
    return computeDomainHealthFromAgents(
      this.agentCoordinator, domain, this.domainLastActivity.get(domain),
    );
  }

  getDomainLoad(domain: DomainName): number {
    const queue = this.domainQueues.get(domain) || [];
    const runningTasks = Array.from(this.tasks.values())
      .filter(t => t.assignedDomain === domain && t.status === 'running');
    return queue.length + runningTasks.length;
  }

  getIdleDomains(): DomainName[] {
    const now = Date.now();
    const idleThreshold = this.config.workStealing.idleThreshold;
    return ALL_DOMAINS.filter(domain => {
      const lastActivity = this.domainLastActivity.get(domain);
      const load = this.getDomainLoad(domain);
      return load === 0 && lastActivity && (now - lastActivity.getTime()) > idleThreshold;
    });
  }

  getBusyDomains(): DomainName[] {
    return ALL_DOMAINS.filter(domain => this.getDomainLoad(domain) > this.config.workStealing.loadThreshold);
  }

  // ============================================================================
  // Work Stealing
  // ============================================================================

  enableWorkStealing(): void {
    if (!this.workStealingTimer) {
      this.workStealingTimer = startWorkStealingTimer(
        this.config,
        () => this.triggerWorkStealing().then(() => {}),
      );
    }
  }

  disableWorkStealing(): void {
    if (this.workStealingTimer) {
      clearInterval(this.workStealingTimer);
      this.workStealingTimer = null;
    }
  }

  async triggerWorkStealing(): Promise<number> {
    return triggerWorkStealingImpl(this.createWorkStealingContext());
  }

  // ============================================================================
  // Agent Management
  // ============================================================================

  listAllAgents(): AgentInfo[] {
    return this.agentCoordinator.listAgents();
  }

  getAgentsByDomain(domain: DomainName): AgentInfo[] {
    return this.agentCoordinator.listAgents({ domain });
  }

  async requestAgentSpawn(
    domain: DomainName, type: string, capabilities: string[],
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Maximum concurrent agents reached (15)'));
    }

    const result = await this.agentCoordinator.spawn({
      name: `${domain}-${type}-${Date.now()}`, domain, type, capabilities,
    });

    if (result.success) {
      this.domainLastActivity.set(domain, new Date());
      await this.publishEvent('AgentSpawned', { agentId: result.value, domain, type, capabilities });
    }

    return result;
  }

  // ============================================================================
  // Health & Metrics
  // ============================================================================

  getHealth(): QueenHealth {
    const domainHealth = new Map<DomainName, DomainHealth>();
    const issues: HealthIssue[] = [];
    let unhealthyCount = 0;
    let degradedCount = 0;

    const enabledDomains = getEnabledDomains(this.domainPlugins, ALL_DOMAINS);

    for (const domain of enabledDomains) {
      const health = this.getDomainHealth(domain);
      if (health) {
        domainHealth.set(domain, health);
        if (health.status === 'unhealthy') {
          unhealthyCount++;
          issues.push({ domain, severity: 'high', message: `Domain ${domain} is unhealthy`, timestamp: new Date() });
        } else if (health.status === 'degraded') {
          degradedCount++;
          issues.push({ domain, severity: 'medium', message: `Domain ${domain} is degraded`, timestamp: new Date() });
        }
      }
    }

    const agents = this.agentCoordinator.listAgents();
    const activeAgents = agents.filter(a => a.status === 'running').length;

    let status: QueenHealth['status'] = 'healthy';
    if (unhealthyCount > 0) status = 'unhealthy';
    else if (degradedCount > enabledDomains.length / 2) status = 'degraded';

    const baseHealth: QueenHealth = {
      status, domainHealth,
      totalAgents: agents.length, activeAgents,
      pendingTasks: this.getQueuedTaskCount(), runningTasks: this.getRunningTaskCount(),
      workStealingActive: this.workStealingTimer !== null,
      lastHealthCheck: new Date(), issues,
    };

    return this.minCutBridge ? this.minCutBridge.extendQueenHealth(baseHealth) : baseHealth;
  }

  getMetrics(): QueenMetrics {
    const domainUtilization = new Map<DomainName, number>();
    let totalLoad = 0;

    for (const domain of ALL_DOMAINS) {
      const load = this.getDomainLoad(domain);
      domainUtilization.set(domain, load);
      totalLoad += load;
    }

    const agents = this.agentCoordinator.listAgents();
    const activeAgents = agents.filter(a => a.status === 'running').length;
    const agentUtilization = agents.length > 0 ? activeAgents / agents.length : 0;
    const avgDuration = this.taskDurations.average();

    const baseMetrics: QueenMetrics = {
      tasksReceived: this.tasksReceived, tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed, tasksStolen: this.tasksStolen,
      averageTaskDuration: avgDuration, domainUtilization, agentUtilization,
      protocolsExecuted: this.protocolsExecuted, workflowsExecuted: this.workflowsExecuted,
      uptime: Date.now() - this.startTime.getTime(),
    };

    return this.minCutBridge ? this.minCutBridge.extendQueenMetrics(baseMetrics) : baseMetrics;
  }

  // ============================================================================
  // Subsystem Accessors
  // ============================================================================

  getMinCutBridge(): QueenMinCutBridge | null { return this.minCutBridge; }

  injectMinCutBridgeIntoDomain(domainName: DomainName): boolean {
    if (!this.minCutBridge) {
      console.warn(`[QueenCoordinator] Cannot inject MinCut bridge: bridge not initialized`);
      return false;
    }
    if (!this.domainPlugins) {
      console.warn(`[QueenCoordinator] Cannot inject MinCut bridge: no domain plugins registered`);
      return false;
    }
    const plugin = this.domainPlugins.get(domainName);
    if (!plugin) {
      console.warn(`[QueenCoordinator] Cannot inject MinCut bridge: domain ${domainName} not found`);
      return false;
    }
    if (isMinCutAwarePlugin(plugin)) {
      plugin.setMinCutBridge(this.minCutBridge);
      console.log(`[QueenCoordinator] MinCut bridge injected into ${domainName} (late binding)`);
      return true;
    }
    console.warn(`[QueenCoordinator] Domain ${domainName} does not support MinCut integration`);
    return false;
  }

  getTinyDancerRouter(): QueenRouterAdapter | null { return this.tinyDancerRouter; }
  getDomainBreakerRegistry(): DomainBreakerRegistry | null { return this.domainBreakerRegistry; }
  getDomainTeamManager(): DomainTeamManager | null { return this.domainTeamManager; }
  getTierSelector(): TierSelector | null { return this.tierSelector; }
  getTraceCollector(): TraceCollector | null { return this.traceCollector; }
  getHypothesisManager(): HypothesisManager | null { return this.hypothesisManager; }
  getFederationMailbox(): FederationMailbox | null { return this.federationMailbox; }
  getDynamicScaler(): DynamicScaler | null { return this.dynamicScaler; }

  connectReasoningBank(bank: IQEReasoningBank): void {
    const adapter = new ReasoningBankPatternStore(bank);
    this.taskCompletedHook = new TaskCompletedHook({}, adapter);
    console.log('[QueenCoordinator] ReasoningBank connected for pattern training');
  }

  // ============================================================================
  // Protocol & Workflow
  // ============================================================================

  async executeProtocol(protocolId: string, params?: Record<string, unknown>): Promise<Result<string, Error>> {
    if (!this.protocolExecutor) return err(new Error('Protocol executor not configured'));
    const result = await this.protocolExecutor.execute(protocolId, params);
    if (result.success) {
      this.protocolsExecuted++;
      await this.publishEvent('ProtocolExecuted', { protocolId, executionId: result.value.executionId });
      return ok(result.value.executionId);
    }
    return result as Result<string, Error>;
  }

  async executeWorkflow(workflowId: string, params?: Record<string, unknown>): Promise<Result<string, Error>> {
    if (!this.workflowExecutor) return err(new Error('Workflow executor not configured'));
    const result = await this.workflowExecutor.execute(workflowId, params);
    if (result.success) {
      this.workflowsExecuted++;
      await this.publishEvent('WorkflowExecuted', { workflowId, executionId: result.value.executionId });
      return ok(result.value.executionId);
    }
    return result as Result<string, Error>;
  }

  // ============================================================================
  // Public cleanup (also exposed for tests)
  // ============================================================================

  cleanupCompletedTasks(retentionMs: number = 3600000): number {
    return cleanupCompletedTasksImpl(this.tasks, this.taskTraceContexts, retentionMs);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /** Kept as a method so tests that cast to `{ subscribeToEvents() }` still work. */
  private subscribeToEvents(): void {
    this.eventSubscriptionIds = subscribeToEvents(this.createEventHandlerContext(), ALL_DOMAINS);
  }

  private enqueueTaskInternal(task: QueenTask): void {
    enqueueTask(this.taskQueue, this.domainQueues, task);
  }

  private async publishEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.eventBus.publish({
      id: uuidv4(),
      type: `Queen${type}`,
      timestamp: new Date(),
      source: 'queen-coordinator' as DomainName,
      payload,
    });
  }

  private queueTask(task: QueenTask): Result<string, Error> {
    this.enqueueTaskInternal(task);
    const execution: TaskExecution = {
      taskId: task.id, task, status: 'queued', assignedAgents: [], retryCount: 0,
    };
    this.tasks.set(task.id, execution);
    this.tasksReceived++;

    this.auditLogger.logSubmit(task.id, { type: task.type, priority: task.priority });
    this.auditLogger.logQueue(task.id, getQueuePosition(this.taskQueue, task));

    // Fire-and-forget event (queuing is sync from caller's perspective)
    this.publishEvent('TaskQueued', { taskId: task.id, task, position: getQueuePosition(this.taskQueue, task) });
    return ok(task.id);
  }

  private selectFleetTier(task: QueenTask): FleetTier | undefined {
    if (!this.tierSelector) return undefined;
    try {
      const tierContext: TierSelectionContext = {
        trigger: task.payload?.trigger as TierSelectionContext['trigger'] ?? 'manual',
        changedFiles: task.payload?.changedFiles as number | undefined,
        affectedDomains: task.targetDomains,
        severity: task.priority === 'p0' ? 'critical' : task.priority === 'p1' ? 'high' : undefined,
        isHotfix: task.payload?.isHotfix as boolean | undefined,
      };
      const tierResult = this.tierSelector.selectTier(tierContext);
      console.log(`[Queen] Fleet tier: ${tierResult.selectedTier} (${tierResult.reason})`);
      return tierResult.selectedTier;
    } catch (tierError) {
      console.warn('[QueenCoordinator] Tier selection error (continuing):', tierError);
      return undefined;
    }
  }

  private startTaskTrace(task: QueenTask, taskId: string): void {
    if (!this.traceCollector) return;
    try {
      const { context } = this.traceCollector.startTrace({
        operationName: task.type,
        agentId: task.requester || 'queen',
        domain: task.targetDomains[0] || 'test-generation',
        tags: { taskId, priority: task.priority },
      });
      const MAX_TRACE_CONTEXTS = 10000;
      if (this.taskTraceContexts.size >= MAX_TRACE_CONTEXTS) {
        const oldest = this.taskTraceContexts.keys().next().value;
        if (oldest !== undefined) this.taskTraceContexts.delete(oldest);
      }
      this.taskTraceContexts.set(taskId, context);
    } catch (traceError) {
      console.warn('[QueenCoordinator] Trace start error (continuing):', traceError);
    }
  }

  private getRunningTaskCount(): number {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running' || t.status === 'assigned').length;
  }

  private getQueuedTaskCount(): number {
    return Array.from(this.tasks.values()).filter(t => t.status === 'queued').length;
  }

  /** Initialize ADR-064 subsystems (all non-fatal). */
  private initializeSubsystems(): void {
    if (this.config.enableCircuitBreakers !== false) {
      try {
        this.domainBreakerRegistry = createDomainBreakerRegistry();
        console.log('[QueenCoordinator] Domain circuit breaker registry initialized');
      } catch (e) { console.warn('[QueenCoordinator] Circuit breaker initialization failed (continuing):', e); }
    }
    if (this.config.enableDomainTeams !== false) {
      try {
        this.agentTeamsAdapter = createAgentTeamsAdapter();
        this.agentTeamsAdapter.initialize();
        this.domainTeamManager = createDomainTeamManager(this.agentTeamsAdapter);
        console.log('[QueenCoordinator] Domain team manager initialized');
      } catch (e) { console.warn('[QueenCoordinator] Domain team manager initialization failed (continuing):', e); }
    }
    if (this.config.enableFleetTiers !== false) {
      try {
        this.tierSelector = createTierSelector();
        console.log('[QueenCoordinator] Fleet tier selector initialized');
      } catch (e) { console.warn('[QueenCoordinator] Tier selector initialization failed (continuing):', e); }
    }
    try {
      this.traceCollector = createTraceCollector();
      console.log('[QueenCoordinator] Trace collector initialized');
    } catch (e) { console.warn('[QueenCoordinator] Trace collector initialization failed (continuing):', e); }
    try {
      this.hypothesisManager = createHypothesisManager();
      this.federationMailbox = createFederationMailbox();
      this.dynamicScaler = createDynamicScaler();
      console.log('[QueenCoordinator] Phase 4 modules initialized (hypotheses, federation, scaling)');
    } catch (e) { console.warn('[QueenCoordinator] Phase 4 initialization failed (continuing):', e); }
  }

  // ============================================================================
  // Context Factories (bridge between class state and extracted modules)
  // Uses arrow-captured `self` to correctly proxy mutable counters.
  // ============================================================================

  private createEventHandlerContext(): QueenEventHandlerContext {
    const self = this;
    return {
      config: self.config, tasks: self.tasks,
      domainLastActivity: self.domainLastActivity,
      auditLogger: self.auditLogger, router: self.router,
      agentCoordinator: self.agentCoordinator,
      get runningTaskCounter() { return self.runningTaskCounter; },
      set runningTaskCounter(v) { self.runningTaskCounter = v; },
      get tasksCompleted() { return self.tasksCompleted; },
      set tasksCompleted(v) { self.tasksCompleted = v; },
      get tasksFailed() { return self.tasksFailed; },
      set tasksFailed(v) { self.tasksFailed = v; },
      taskDurations: self.taskDurations,
      get domainBreakerRegistry() { return self.domainBreakerRegistry; },
      get traceCollector() { return self.traceCollector; },
      taskTraceContexts: self.taskTraceContexts,
      get taskCompletedHook() { return self.taskCompletedHook; },
      get hypothesisManager() { return self.hypothesisManager; },
      processQueue: () => processQueue(self.createTaskContext()),
      enqueueTask: (task) => self.enqueueTaskInternal(task),
    };
  }

  private createTaskContext(): QueenTaskContext {
    const self = this;
    return {
      config: self.config, tasks: self.tasks,
      taskQueue: self.taskQueue, domainQueues: self.domainQueues,
      domainLastActivity: self.domainLastActivity,
      auditLogger: self.auditLogger, agentCoordinator: self.agentCoordinator,
      domainPlugins: self.domainPlugins,
      get runningTaskCounter() { return self.runningTaskCounter; },
      set runningTaskCounter(v) { self.runningTaskCounter = v; },
      get tasksReceived() { return self.tasksReceived; },
      set tasksReceived(v) { self.tasksReceived = v; },
      get tasksCompleted() { return self.tasksCompleted; },
      set tasksCompleted(v) { self.tasksCompleted = v; },
      get tasksFailed() { return self.tasksFailed; },
      set tasksFailed(v) { self.tasksFailed = v; },
      taskDurations: self.taskDurations,
      get tinyDancerRouter() { return self.tinyDancerRouter; },
      get domainBreakerRegistry() { return self.domainBreakerRegistry; },
      get domainTeamManager() { return self.domainTeamManager; },
      get tierSelector() { return self.tierSelector; },
      get traceCollector() { return self.traceCollector; },
      taskTraceContexts: self.taskTraceContexts,
      requestAgentSpawn: (d, t, c) => self.requestAgentSpawn(d, t, c),
      publishEvent: (t, p) => self.publishEvent(t, p),
      getDomainLoad: (d) => self.getDomainLoad(d),
      getDomainHealth: (d) => self.getDomainHealth(d),
    };
  }

  private createWorkStealingContext(): QueenWorkStealingContext {
    const self = this;
    return {
      config: self.config, domainQueues: self.domainQueues,
      auditLogger: self.auditLogger,
      get tasksStolen() { return self.tasksStolen; },
      set tasksStolen(v) { self.tasksStolen = v; },
      getIdleDomains: () => self.getIdleDomains(),
      getBusyDomains: () => self.getBusyDomains(),
      getDomainLoad: (d) => self.getDomainLoad(d),
      removeFromQueues: (t) => removeFromQueues(self.taskQueue, self.domainQueues, t),
      assignTaskToDomain: (t, d) => assignTaskToDomain(self.createTaskContext(), t, d).then(() => {}),
      publishEvent: (t, p) => self.publishEvent(t, p),
    };
  }

  private createMetricsContext() {
    const self = this;
    return {
      config: self.config, memory: self.memory,
      get dynamicScaler() { return self.dynamicScaler; },
      getMetrics: () => self.getMetrics(),
      publishEvent: (t: string, p: Record<string, unknown>) => self.publishEvent(t, p),
      getQueuedTaskCount: () => self.getQueuedTaskCount(),
      getActiveAgentCount: () => self.agentCoordinator.listAgents().filter(a => a.status === 'running').length,
      getIdleAgentCount: () => self.agentCoordinator.listAgents().filter(a => a.status === 'idle').length,
      getAverageTaskDuration: () => self.taskDurations.average(),
      getTasksReceived: () => self.tasksReceived,
      getTasksFailed: () => self.tasksFailed,
      getTasksCompleted: () => self.tasksCompleted,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Queen Coordinator from a QE Kernel
 */
export function createQueenCoordinator(
  kernel: QEKernel,
  router: CrossDomainRouter,
  protocolExecutor?: ProtocolExecutor,
  workflowExecutor?: WorkflowExecutor,
  domainPlugins?: Map<DomainName, DomainPlugin>,
  config?: Partial<QueenConfig>
): QueenCoordinator {
  return new QueenCoordinator(
    kernel.eventBus,
    kernel.coordinator,
    kernel.memory,
    router,
    protocolExecutor,
    workflowExecutor,
    domainPlugins,
    config
  );
}
