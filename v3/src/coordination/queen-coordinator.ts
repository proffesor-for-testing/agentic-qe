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
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DomainName,
  DomainEvent,
  ALL_DOMAINS,
  Result,
  ok,
  err,
  Priority,
  AgentStatus,
  Severity,
} from '../shared/types';
import { CircularBuffer } from '../shared/utils/circular-buffer.js';
import {
  EventBus,
  AgentCoordinator,
  AgentInfo,
  DomainPlugin,
  DomainHealth,
  MemoryBackend,
  QEKernel,
  DomainTaskRequest,
  DomainTaskResult,
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
  QueenMinCutConfig,
} from './mincut/queen-integration';
import { MinCutHealth } from './mincut/interfaces';
import { getSharedMinCutGraph } from './mincut/shared-singleton';

// V3 Integration: TinyDancer intelligent model routing (TD-004, TD-005, TD-006)
import {
  QueenRouterAdapter,
  type QueenRouteDecision,
  type QueenRouterConfig,
} from '../routing/queen-integration.js';
import type { ClassifiableTask } from '../routing/task-classifier.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Task that can be assigned to domains
 */
export interface QueenTask {
  readonly id: string;
  readonly type: TaskType;
  readonly priority: Priority;
  readonly targetDomains: DomainName[];
  readonly payload: Record<string, unknown>;
  readonly timeout: number;
  readonly createdAt: Date;
  readonly requester?: string;
  readonly correlationId?: string;
}

export type TaskType =
  | 'generate-tests'
  | 'execute-tests'
  | 'analyze-coverage'
  | 'assess-quality'
  | 'predict-defects'
  | 'validate-requirements'
  | 'index-code'
  | 'scan-security'
  | 'validate-contracts'
  | 'test-accessibility'
  | 'run-chaos'
  | 'optimize-learning'
  | 'cross-domain-workflow'
  | 'protocol-execution';

/**
 * Task execution status
 */
export interface TaskExecution {
  readonly taskId: string;
  readonly task: QueenTask;
  readonly status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly assignedDomain?: DomainName;
  readonly assignedAgents: string[];
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly result?: unknown;
  readonly error?: string;
  readonly retryCount: number;
}

/**
 * Domain group for coordination
 */
export interface DomainGroup {
  readonly name: string;
  readonly domains: DomainName[];
  readonly priority: Priority;
  readonly description: string;
}

/**
 * Work stealing configuration
 */
export interface WorkStealingConfig {
  enabled: boolean;
  idleThreshold: number; // Time in ms before domain is considered idle
  loadThreshold: number; // Max pending tasks before stealing is triggered
  stealBatchSize: number; // Number of tasks to steal at once
  checkInterval: number; // How often to check for work stealing opportunities
}

/**
 * Queen Coordinator metrics
 */
export interface QueenMetrics {
  readonly tasksReceived: number;
  readonly tasksCompleted: number;
  readonly tasksFailed: number;
  readonly tasksStolen: number;
  readonly averageTaskDuration: number;
  readonly domainUtilization: Map<DomainName, number>;
  readonly agentUtilization: number;
  readonly protocolsExecuted: number;
  readonly workflowsExecuted: number;
  readonly uptime: number;
}

/**
 * Queen Coordinator configuration
 */
export interface QueenConfig {
  maxConcurrentTasks: number;
  defaultTaskTimeout: number;
  taskRetryLimit: number;
  workStealing: WorkStealingConfig;
  enableMetrics: boolean;
  metricsInterval: number;
  priorityWeights: Record<Priority, number>;
  /** V3 Integration: TinyDancer routing configuration */
  routing?: QueenRouterConfig;
  /** Enable intelligent model routing (default: true) */
  enableRouting?: boolean;
}

/**
 * Queen health status
 */
export interface QueenHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  domainHealth: Map<DomainName, DomainHealth>;
  totalAgents: number;
  activeAgents: number;
  pendingTasks: number;
  runningTasks: number;
  workStealingActive: boolean;
  lastHealthCheck: Date;
  issues: HealthIssue[];
}

export interface HealthIssue {
  domain?: DomainName;
  severity: Severity;
  message: string;
  timestamp: Date;
}

/**
 * Queen Coordinator interface
 */
export interface IQueenCoordinator {
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;

  // Task Management
  submitTask(task: Omit<QueenTask, 'id' | 'createdAt'>): Promise<Result<string, Error>>;
  cancelTask(taskId: string): Promise<Result<void, Error>>;
  getTaskStatus(taskId: string): TaskExecution | undefined;
  listTasks(filter?: TaskFilter): TaskExecution[];

  // Domain Coordination
  getDomainHealth(domain: DomainName): DomainHealth | undefined;
  getDomainLoad(domain: DomainName): number;
  getIdleDomains(): DomainName[];
  getBusyDomains(): DomainName[];

  // Work Stealing
  enableWorkStealing(): void;
  disableWorkStealing(): void;
  triggerWorkStealing(): Promise<number>;

  // Agent Management
  listAllAgents(): AgentInfo[];
  getAgentsByDomain(domain: DomainName): AgentInfo[];
  requestAgentSpawn(domain: DomainName, type: string, capabilities: string[]): Promise<Result<string, Error>>;

  // Health & Metrics
  getHealth(): QueenHealth;
  getMetrics(): QueenMetrics;

  // Protocol & Workflow
  executeProtocol(protocolId: string, params?: Record<string, unknown>): Promise<Result<string, Error>>;
  executeWorkflow(workflowId: string, params?: Record<string, unknown>): Promise<Result<string, Error>>;
}

export interface TaskFilter {
  status?: TaskExecution['status'];
  domain?: DomainName;
  priority?: Priority;
  type?: TaskType;
  fromDate?: Date;
  toDate?: Date;
}

// ============================================================================
// Domain Groups (per Master Plan Section 4.1)
// ============================================================================

export const DOMAIN_GROUPS: DomainGroup[] = [
  {
    name: 'Core Testing',
    domains: ['test-generation', 'test-execution', 'coverage-analysis', 'quality-assessment'],
    priority: 'p0',
    description: 'Core testing workflow domains',
  },
  {
    name: 'Intelligence',
    domains: ['defect-intelligence', 'code-intelligence', 'requirements-validation', 'security-compliance'],
    priority: 'p0',
    description: 'Intelligence and analysis domains',
  },
  {
    name: 'Specialized',
    domains: ['contract-testing', 'visual-accessibility', 'chaos-resilience', 'learning-optimization'],
    priority: 'p1',
    description: 'Specialized testing domains',
  },
];

// Task type to domain mapping
const TASK_DOMAIN_MAP: Record<TaskType, DomainName[]> = {
  'generate-tests': ['test-generation'],
  'execute-tests': ['test-execution'],
  'analyze-coverage': ['coverage-analysis'],
  'assess-quality': ['quality-assessment'],
  'predict-defects': ['defect-intelligence'],
  'validate-requirements': ['requirements-validation'],
  'index-code': ['code-intelligence'],
  'scan-security': ['security-compliance'],
  'validate-contracts': ['contract-testing'],
  'test-accessibility': ['visual-accessibility'],
  'run-chaos': ['chaos-resilience'],
  'optimize-learning': ['learning-optimization'],
  'cross-domain-workflow': ALL_DOMAINS as unknown as DomainName[],
  'protocol-execution': ALL_DOMAINS as unknown as DomainName[],
};

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: QueenConfig = {
  maxConcurrentTasks: 50,
  defaultTaskTimeout: 300000, // 5 minutes
  taskRetryLimit: 3,
  workStealing: {
    enabled: true,
    idleThreshold: 5000, // 5 seconds
    loadThreshold: 10,
    stealBatchSize: 3,
    checkInterval: 10000, // 10 seconds
  },
  enableMetrics: true,
  metricsInterval: 60000, // 1 minute
  priorityWeights: {
    p0: 100,
    p1: 50,
    p2: 25,
    p3: 10,
  },
  // V3 Integration: Enable intelligent model routing by default
  enableRouting: true,
};

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

  // Store subscription IDs for proper cleanup (PAP-003 memory leak fix)
  // These IDs are used to unsubscribe from events during dispose()
  private eventSubscriptionIds: string[] = [];

  // Atomic counter for concurrent task tracking (CC-002 race condition fix)
  // This counter is incremented/decremented atomically to prevent TOCTOU race conditions
  private runningTaskCounter = 0;

  // Metrics counters
  private tasksReceived = 0;
  private tasksCompleted = 0;
  private tasksFailed = 0;
  private tasksStolen = 0;
  // MEM-001 FIX: Use CircularBuffer instead of array to avoid O(n) shift() operations
  // CircularBuffer provides O(1) push with automatic oldest-entry overwrite
  private taskDurations = new CircularBuffer<number>(1000);
  private protocolsExecuted = 0;
  private workflowsExecuted = 0;

  // SEC-003 Simplified: Lightweight audit logging for task operations
  private readonly auditLogger: TaskAuditLogger;

  // ADR-047: MinCut topology health monitoring
  private minCutBridge: QueenMinCutBridge | null = null;

  // V3 Integration: TinyDancer intelligent model routing (TD-004, TD-005, TD-006)
  private tinyDancerRouter: QueenRouterAdapter | null = null;

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
    this.config = { ...DEFAULT_CONFIG, ...config };

    // SEC-003 Simplified: Initialize lightweight audit logger
    this.auditLogger = createTaskAuditLogger({
      enableConsoleLog: this.config.enableMetrics,
      maxEntries: 1000,
      logPrefix: '[QUEEN]',
    });

    // Initialize priority queues
    (['p0', 'p1', 'p2', 'p3'] as Priority[]).forEach(p => {
      this.taskQueue.set(p, []);
    });

    // V3 Integration: Initialize TinyDancer intelligent model routing (TD-004, TD-005, TD-006)
    // Routes tasks to optimal agent tiers (haiku/sonnet/opus) based on complexity
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

    // Initialize cross-domain router
    await this.router.initialize();

    // Subscribe to domain events for coordination
    this.subscribeToEvents();

    // Start work stealing if enabled
    if (this.config.workStealing.enabled) {
      this.startWorkStealing();
    }

    // Start metrics collection if enabled
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }

    // MEM-002 FIX: Start automatic cleanup of completed/failed tasks to prevent memory leak
    // Tasks map accumulates indefinitely without cleanup - run every 5 minutes, retain for 1 hour
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedTasks(3600000); // 1 hour retention
    }, 300000); // Run every 5 minutes
    this.cleanupTimer.unref(); // Don't block process exit

    // Load persisted state
    await this.loadState();

    // ADR-047: Initialize MinCut topology health monitoring
    // Use shared graph singleton for proper MCP tools integration
    this.minCutBridge = createQueenMinCutBridge(this.eventBus, this.agentCoordinator, {
      autoUpdateFromEvents: true,
      persistData: true,
      includeInQueenHealth: true,
      sharedGraph: getSharedMinCutGraph(), // Share graph with MCP tools
    });
    await this.minCutBridge.initialize();

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
    if (this.workStealingTimer) {
      clearInterval(this.workStealingTimer);
      this.workStealingTimer = null;
    }
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    // MEM-002 FIX: Clear the cleanup timer to prevent memory leaks
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // ADR-047: Dispose MinCut bridge
    if (this.minCutBridge) {
      await this.minCutBridge.dispose();
      this.minCutBridge = null;
    }

    // Save state
    await this.saveState();

    // Cancel all pending tasks
    for (const [taskId, execution] of this.tasks) {
      if (execution.status === 'queued' || execution.status === 'running') {
        await this.cancelTask(taskId);
      }
    }

    // Publish shutdown event
    await this.publishEvent('QueenShutdown', {
      timestamp: new Date(),
      metrics: this.getMetrics(),
    });

    // PAP-003 FIX: Unsubscribe from all events before disposing router
    // This prevents memory leaks by removing all event handlers
    for (const subscriptionId of this.eventSubscriptionIds) {
      this.router.unsubscribe(subscriptionId);
    }
    this.eventSubscriptionIds = [];

    // Dispose router
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

    // CC-002 FIX: Use atomic increment pattern to prevent TOCTOU race condition
    // Atomically reserve a slot by incrementing counter BEFORE the check
    this.runningTaskCounter++;

    try {
      // Check if we exceeded the limit (counter was already incremented)
      if (this.runningTaskCounter > this.config.maxConcurrentTasks) {
        // Release the reserved slot
        this.runningTaskCounter--;

        // Queue the task instead of rejecting
        this.enqueueTask(task);
        const execution: TaskExecution = {
          taskId,
          task,
          status: 'queued',
          assignedAgents: [],
          retryCount: 0,
        };
        this.tasks.set(taskId, execution);
        this.tasksReceived++;

        // SEC-003 Simplified: Log task submission and queuing
        this.auditLogger.logSubmit(taskId, { type: task.type, priority: task.priority });
        this.auditLogger.logQueue(taskId, this.getQueuePosition(task));

        await this.publishEvent('TaskQueued', { taskId, task, position: this.getQueuePosition(task) });
        return ok(taskId);
      }

      // SEC-003 Simplified: Log task submission
      this.auditLogger.logSubmit(taskId, { type: task.type, priority: task.priority });

      // Assign task to appropriate domain(s)
      const assignResult = await this.assignTask(task);
      if (!assignResult.success) {
        // Release the reserved slot on assignment failure
        this.runningTaskCounter--;
        return assignResult;
      }

      this.tasksReceived++;
      await this.publishEvent('TaskSubmitted', { taskId, task });

      return ok(taskId);
    } catch (error) {
      // Release the reserved slot on any exception
      this.runningTaskCounter--;
      throw error;
    }
  }

  async cancelTask(taskId: string): Promise<Result<void, Error>> {
    const execution = this.tasks.get(taskId);
    if (!execution) {
      return err(new Error(`Task not found: ${taskId}`));
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      return err(new Error(`Task already finished: ${taskId}`));
    }

    // CC-002 FIX: Decrement the atomic counter when cancelling a running task
    if (execution.status === 'running' || execution.status === 'assigned') {
      this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);
    }

    // Update status
    const updated: TaskExecution = {
      ...execution,
      status: 'cancelled',
      completedAt: new Date(),
    };
    this.tasks.set(taskId, updated);

    // Remove from queues
    this.removeFromQueues(execution.task);

    // Stop assigned agents if any
    for (const agentId of execution.assignedAgents) {
      await this.agentCoordinator.stop(agentId);
    }

    // SEC-003 Simplified: Log task cancellation
    this.auditLogger.logCancel(taskId);

    await this.publishEvent('TaskCancelled', { taskId });

    return ok(undefined);
  }

  getTaskStatus(taskId: string): TaskExecution | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(filter?: TaskFilter): TaskExecution[] {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.domain) {
        tasks = tasks.filter(t => t.assignedDomain === filter.domain);
      }
      if (filter.priority) {
        tasks = tasks.filter(t => t.task.priority === filter.priority);
      }
      if (filter.type) {
        tasks = tasks.filter(t => t.task.type === filter.type);
      }
      if (filter.fromDate) {
        tasks = tasks.filter(t => t.task.createdAt >= filter.fromDate!);
      }
      if (filter.toDate) {
        tasks = tasks.filter(t => t.task.createdAt <= filter.toDate!);
      }
    }

    return tasks;
  }

  // ============================================================================
  // Domain Coordination
  // ============================================================================

  getDomainHealth(domain: DomainName): DomainHealth | undefined {
    if (this.domainPlugins) {
      const plugin = this.domainPlugins.get(domain);
      return plugin?.getHealth();
    }

    // Fallback: compute from agent coordinator
    const agents = this.agentCoordinator.listAgents({ domain });
    const activeAgents = agents.filter(a => a.status === 'running').length;
    const idleAgents = agents.filter(a => a.status === 'idle').length;
    const failedAgents = agents.filter(a => a.status === 'failed').length;

    // Issue #205 fix: Determine status based on agent state
    // 'idle' is normal for ephemeral agent model (agents spawn on-demand)
    let status: DomainHealth['status'];
    if (failedAgents > 0 && failedAgents >= agents.length / 2) {
      status = 'unhealthy';
    } else if (failedAgents > 0) {
      status = 'degraded';
    } else if (activeAgents > 0) {
      status = 'healthy';
    } else {
      // No agents or all idle - normal for ephemeral agent model
      status = 'idle';
    }

    return {
      status,
      agents: {
        total: agents.length,
        active: activeAgents,
        idle: idleAgents,
        failed: failedAgents,
      },
      lastActivity: this.domainLastActivity.get(domain),
      errors: [],
    };
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
    const loadThreshold = this.config.workStealing.loadThreshold;
    return ALL_DOMAINS.filter(domain => this.getDomainLoad(domain) > loadThreshold);
  }

  // ============================================================================
  // Work Stealing Algorithm
  // ============================================================================

  enableWorkStealing(): void {
    if (!this.workStealingTimer) {
      this.startWorkStealing();
    }
  }

  disableWorkStealing(): void {
    if (this.workStealingTimer) {
      clearInterval(this.workStealingTimer);
      this.workStealingTimer = null;
    }
  }

  async triggerWorkStealing(): Promise<number> {
    let stolenCount = 0;
    const idleDomains = this.getIdleDomains();
    const busyDomains = this.getBusyDomains();

    if (idleDomains.length === 0 || busyDomains.length === 0) {
      return 0;
    }

    // Sort busy domains by load (highest first)
    busyDomains.sort((a, b) => this.getDomainLoad(b) - this.getDomainLoad(a));

    for (const busyDomain of busyDomains) {
      if (idleDomains.length === 0) break;

      const queue = this.domainQueues.get(busyDomain) || [];
      const stealCount = Math.min(queue.length, this.config.workStealing.stealBatchSize);

      for (let i = 0; i < stealCount && idleDomains.length > 0; i++) {
        // Find a task that can be handled by an idle domain
        const task = queue.find(t => this.canDomainHandleTask(idleDomains[0], t));

        if (task) {
          // Steal the task
          const stealerDomain = idleDomains.shift()!;
          this.removeFromQueues(task);

          // SEC-003 Simplified: Log work stealing for observability
          this.auditLogger.logSteal(task.id, busyDomain, stealerDomain);

          // Reassign to idle domain
          await this.assignTaskToDomain(task, stealerDomain);

          stolenCount++;
          this.tasksStolen++;

          await this.publishEvent('TaskStolen', {
            taskId: task.id,
            fromDomain: busyDomain,
            toDomain: stealerDomain,
          });
        }
      }
    }

    return stolenCount;
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
    domain: DomainName,
    type: string,
    capabilities: string[]
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Maximum concurrent agents reached (15)'));
    }

    const result = await this.agentCoordinator.spawn({
      name: `${domain}-${type}-${Date.now()}`,
      domain,
      type,
      capabilities,
    });

    if (result.success) {
      this.domainLastActivity.set(domain, new Date());
      await this.publishEvent('AgentSpawned', {
        agentId: result.value,
        domain,
        type,
        capabilities,
      });
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

    // Issue #205 fix: Only check enabled domains, not ALL_DOMAINS
    // This prevents alarming warnings for domains that aren't configured
    const enabledDomains = this.getEnabledDomains();

    for (const domain of enabledDomains) {
      const health = this.getDomainHealth(domain);
      if (health) {
        domainHealth.set(domain, health);
        // Issue #205 fix: 'idle' status is normal - don't report as issue
        if (health.status === 'unhealthy') {
          unhealthyCount++;
          issues.push({
            domain,
            severity: 'high',
            message: `Domain ${domain} is unhealthy`,
            timestamp: new Date(),
          });
        } else if (health.status === 'degraded') {
          degradedCount++;
          issues.push({
            domain,
            severity: 'medium',
            message: `Domain ${domain} is degraded`,
            timestamp: new Date(),
          });
        }
        // Note: 'idle' and 'healthy' don't generate issues
      }
    }

    const agents = this.agentCoordinator.listAgents();
    const activeAgents = agents.filter(a => a.status === 'running').length;
    const pendingTasks = this.getQueuedTaskCount();
    const runningTasks = this.getRunningTaskCount();

    // Issue #205 fix: Determine overall health
    // An idle system (no agents, no tasks) should show 'healthy', not 'degraded'
    let status: QueenHealth['status'] = 'healthy';
    if (unhealthyCount > 0) {
      status = 'unhealthy';
    } else if (degradedCount > enabledDomains.length / 2) {
      status = 'degraded';
    }
    // Note: All domains being 'idle' means system is ready, not degraded

    const baseHealth: QueenHealth = {
      status,
      domainHealth,
      totalAgents: agents.length,
      activeAgents,
      pendingTasks,
      runningTasks,
      workStealingActive: this.workStealingTimer !== null,
      lastHealthCheck: new Date(),
      issues,
    };

    // ADR-047: Extend health with MinCut topology data
    if (this.minCutBridge) {
      return this.minCutBridge.extendQueenHealth(baseHealth);
    }

    return baseHealth;
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

    // MEM-001 FIX: Use CircularBuffer's average() method for O(n) calculation
    // instead of array reduce which requires O(n) space for intermediate results
    const avgDuration = this.taskDurations.average();

    const baseMetrics: QueenMetrics = {
      tasksReceived: this.tasksReceived,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      tasksStolen: this.tasksStolen,
      averageTaskDuration: avgDuration,
      domainUtilization,
      agentUtilization,
      protocolsExecuted: this.protocolsExecuted,
      workflowsExecuted: this.workflowsExecuted,
      uptime: Date.now() - this.startTime.getTime(),
    };

    // ADR-047: Extend metrics with MinCut topology data
    if (this.minCutBridge) {
      return this.minCutBridge.extendQueenMetrics(baseMetrics);
    }

    return baseMetrics;
  }

  /**
   * Get MinCut bridge for direct topology access
   * ADR-047: Allows QE agents to access topology health directly
   */
  getMinCutBridge(): QueenMinCutBridge | null {
    return this.minCutBridge;
  }

  /**
   * Get TinyDancer router for direct routing access
   * TD-004/TD-005/TD-006: Allows QE agents to query routing decisions directly
   */
  getTinyDancerRouter(): QueenRouterAdapter | null {
    return this.tinyDancerRouter;
  }

  // ============================================================================
  // Protocol & Workflow
  // ============================================================================

  async executeProtocol(
    protocolId: string,
    params?: Record<string, unknown>
  ): Promise<Result<string, Error>> {
    if (!this.protocolExecutor) {
      return err(new Error('Protocol executor not configured'));
    }

    const result = await this.protocolExecutor.execute(protocolId, params);
    if (result.success) {
      this.protocolsExecuted++;
      await this.publishEvent('ProtocolExecuted', {
        protocolId,
        executionId: result.value.executionId,
      });
      return ok(result.value.executionId);
    }

    return result as Result<string, Error>;
  }

  async executeWorkflow(
    workflowId: string,
    params?: Record<string, unknown>
  ): Promise<Result<string, Error>> {
    if (!this.workflowExecutor) {
      return err(new Error('Workflow executor not configured'));
    }

    const result = await this.workflowExecutor.execute(workflowId, params);
    if (result.success) {
      this.workflowsExecuted++;
      await this.publishEvent('WorkflowExecuted', {
        workflowId,
        executionId: result.value.executionId,
      });
      return ok(result.value.executionId);
    }

    return result as Result<string, Error>;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Get list of enabled domains
   * Issue #205 fix: Used to only check enabled domains in health reporting
   */
  private getEnabledDomains(): DomainName[] {
    // If we have domain plugins loaded, use those as the source of truth
    if (this.domainPlugins && this.domainPlugins.size > 0) {
      return Array.from(this.domainPlugins.keys());
    }
    // Fallback to ALL_DOMAINS if no plugins loaded yet
    return [...ALL_DOMAINS];
  }

  private subscribeToEvents(): void {
    // PAP-003 FIX: Store subscription IDs for proper cleanup during dispose()
    // Clear any existing subscriptions first to prevent duplicates
    this.eventSubscriptionIds = [];

    // Listen for task completion events from domains
    for (const domain of ALL_DOMAINS) {
      const subscriptionId = this.router.subscribeToDoamin(domain, async (event) => {
        await this.handleDomainEvent(event);
      });
      this.eventSubscriptionIds.push(subscriptionId);
    }

    // Listen for specific coordination events
    const taskCompletedSubId = this.router.subscribeToEventType('TaskCompleted', async (event) => {
      await this.handleTaskCompleted(event);
    });
    this.eventSubscriptionIds.push(taskCompletedSubId);

    const taskFailedSubId = this.router.subscribeToEventType('TaskFailed', async (event) => {
      await this.handleTaskFailed(event);
    });
    this.eventSubscriptionIds.push(taskFailedSubId);

    const agentStatusSubId = this.router.subscribeToEventType('AgentStatusChanged', async (event) => {
      await this.handleAgentStatusChanged(event);
    });
    this.eventSubscriptionIds.push(agentStatusSubId);
  }

  private async handleDomainEvent(event: DomainEvent): Promise<void> {
    // Update domain activity
    this.domainLastActivity.set(event.source, new Date());

    // Check if this frees up capacity for queued tasks
    await this.processQueue();
  }

  private async handleTaskCompleted(event: DomainEvent): Promise<void> {
    const { taskId, result } = event.payload as { taskId: string; result: unknown };
    const execution = this.tasks.get(taskId);

    if (execution) {
      // CC-002 FIX: Decrement the atomic counter when task completes
      // Only decrement if task was running (not queued)
      if (execution.status === 'running' || execution.status === 'assigned') {
        this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);
      }

      const duration = execution.startedAt
        ? Date.now() - execution.startedAt.getTime()
        : 0;

      this.tasks.set(taskId, {
        ...execution,
        status: 'completed',
        completedAt: new Date(),
        result,
      });

      this.tasksCompleted++;
      // MEM-001 FIX: CircularBuffer automatically handles fixed-size limit
      // No need for manual shift() - O(1) push vs O(n) shift()
      this.taskDurations.push(duration);

      // SEC-003 Simplified: Log task completion
      this.auditLogger.logComplete(taskId, execution.assignedAgents[0]);
    }

    // Process queue for next task
    await this.processQueue();
  }

  private async handleTaskFailed(event: DomainEvent): Promise<void> {
    const { taskId, error } = event.payload as { taskId: string; error: string };
    const execution = this.tasks.get(taskId);

    if (execution) {
      // CC-002 FIX: Decrement the atomic counter when task fails
      // Only decrement if task was running (not already queued)
      if (execution.status === 'running' || execution.status === 'assigned') {
        this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);
      }

      // Check if we should retry
      if (execution.retryCount < this.config.taskRetryLimit) {
        // SEC-003 Simplified: Log failure for observability
        this.auditLogger.logFail(taskId, execution.assignedAgents[0], error);

        // Retry the task
        const retried: TaskExecution = {
          ...execution,
          status: 'queued',
          retryCount: execution.retryCount + 1,
          error,
        };
        this.tasks.set(taskId, retried);
        this.enqueueTask(execution.task);

        await this.publishEvent('TaskRetrying', {
          taskId,
          retryCount: retried.retryCount,
          error,
        });
      } else {
        // Mark as failed
        this.tasks.set(taskId, {
          ...execution,
          status: 'failed',
          completedAt: new Date(),
          error,
        });
        this.tasksFailed++;

        // SEC-003 Simplified: Log permanent failure
        this.auditLogger.logFail(taskId, execution.assignedAgents[0], error);
      }
    }

    await this.processQueue();
  }

  private async handleAgentStatusChanged(event: DomainEvent): Promise<void> {
    const { agentId: _agentId, status, domain } = event.payload as {
      agentId: string;
      status: AgentStatus;
      domain: DomainName;
    };

    this.domainLastActivity.set(domain, new Date());

    // If agent completed or failed, check for queued tasks
    if (status === 'completed' || status === 'failed') {
      await this.processQueue();
    }
  }

  /**
   * Handle task completion callback from domain plugin
   * Queen-Domain Integration Fix: Direct task execution callback handler
   */
  private async handleTaskCompletion(result: DomainTaskResult): Promise<void> {
    const execution = this.tasks.get(result.taskId);
    if (!execution) {
      console.warn(`[Queen] Received completion for unknown task: ${result.taskId}`);
      return;
    }

    // Update task status
    const updated: TaskExecution = {
      ...execution,
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date(),
      result: result.data,
      error: result.error,
    };
    this.tasks.set(result.taskId, updated);

    // Update counters
    if (result.success) {
      this.tasksCompleted++;
      this.taskDurations.push(result.duration);

      // SEC-003: Log task completion
      this.auditLogger.logComplete(result.taskId, execution.assignedAgents[0]);
    } else {
      this.tasksFailed++;

      // SEC-003: Log task failure
      this.auditLogger.logFail(result.taskId, execution.assignedAgents[0], result.error || 'Unknown error');
    }

    // CC-002: Decrement running task counter
    this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);

    // Stop assigned agents
    for (const agentId of execution.assignedAgents) {
      await this.agentCoordinator.stop(agentId);
    }

    // Publish event
    await this.publishEvent(result.success ? 'TaskCompleted' : 'TaskFailed', {
      taskId: result.taskId,
      domain: execution.assignedDomain,
      result: result.data,
      error: result.error,
      duration: result.duration,
    });

    // Process queue for next task
    await this.processQueue();
  }

  private async assignTask(task: QueenTask): Promise<Result<string, Error>> {
    const targetDomains = task.targetDomains.length > 0
      ? task.targetDomains
      : TASK_DOMAIN_MAP[task.type] || [];

    if (targetDomains.length === 0) {
      return err(new Error(`No domains configured for task type: ${task.type}`));
    }

    // Find the least loaded domain that can handle this task
    let bestDomain: DomainName | undefined;
    let lowestLoad = Infinity;

    for (const domain of targetDomains) {
      const load = this.getDomainLoad(domain);
      const health = this.getDomainHealth(domain);

      if (health?.status !== 'unhealthy' && load < lowestLoad) {
        lowestLoad = load;
        bestDomain = domain;
      }
    }

    if (!bestDomain) {
      return err(new Error('No healthy domain available for task'));
    }

    return this.assignTaskToDomain(task, bestDomain);
  }

  private async assignTaskToDomain(task: QueenTask, domain: DomainName): Promise<Result<string, Error>> {
    // V3 Integration: Use TinyDancer for intelligent model routing (TD-004, TD-005, TD-006)
    // Routes tasks to optimal agent tiers (haiku/sonnet/opus) based on complexity
    let routeDecision: QueenRouteDecision | undefined;
    if (this.tinyDancerRouter) {
      // Convert Priority to QETask priority format
      const priorityMap: Record<Priority, 'low' | 'normal' | 'high' | 'critical'> = {
        p0: 'critical',
        p1: 'high',
        p2: 'normal',
        p3: 'low',
      };
      const classifiableTask: ClassifiableTask = {
        description: `${task.type}: ${JSON.stringify(task.payload).slice(0, 200)}`,
        type: task.type,
        domain: domain as unknown as import('../learning/qe-patterns.js').QEDomain | undefined,
        priority: priorityMap[task.priority],
      };
      routeDecision = await this.tinyDancerRouter.route(classifiableTask);

      // Log routing decision for observability
      if (this.config.enableMetrics) {
        console.log(`[Queen] TinyDancer routing: ${task.type} → tier=${routeDecision.tier}, model=${routeDecision.model}, cost=$${routeDecision.estimatedCost.toFixed(4)}`);
      }
    }

    // Spawn an agent for this task if needed, using TinyDancer-recommended tier
    const agentType = routeDecision?.tier || 'task-worker';
    const spawnResult = await this.requestAgentSpawn(
      domain,
      agentType,
      ['task-execution', task.type, ...(routeDecision ? [`model:${routeDecision.model}`] : [])]
    );

    const agentIds: string[] = [];
    if (spawnResult.success) {
      agentIds.push(spawnResult.value);
    }

    const execution: TaskExecution = {
      taskId: task.id,
      task,
      status: 'running',
      assignedDomain: domain,
      assignedAgents: agentIds,
      startedAt: new Date(),
      retryCount: 0,
    };

    this.tasks.set(task.id, execution);
    this.domainLastActivity.set(domain, new Date());

    // SEC-003 Simplified: Log task assignment for observability
    for (const agentId of agentIds) {
      this.auditLogger.logAssign(task.id, agentId, domain);
    }

    await this.publishEvent('TaskAssigned', {
      taskId: task.id,
      domain,
      agentIds,
    });

    // INTEGRATION FIX: Invoke domain plugin directly for task execution
    if (this.domainPlugins) {
      const plugin = this.domainPlugins.get(domain);

      // Check if plugin supports direct task execution
      if (plugin?.executeTask && plugin.canHandleTask?.(task.type)) {
        // Build task request
        const request: DomainTaskRequest = {
          taskId: task.id,
          taskType: task.type,
          payload: task.payload,
          priority: task.priority,
          timeout: task.timeout,
          correlationId: task.correlationId,
        };

        // Execute task with callback to handleTaskCompletion
        const execResult = await plugin.executeTask(
          request,
          (result) => this.handleTaskCompletion(result)
        );

        if (!execResult.success) {
          // Domain rejected task - update status and decrement counter
          this.tasks.set(task.id, {
            ...execution,
            status: 'failed',
            error: execResult.error.message,
            completedAt: new Date(),
          });
          this.runningTaskCounter = Math.max(0, this.runningTaskCounter - 1);
          this.tasksFailed++;

          // SEC-003: Log rejection
          this.auditLogger.logFail(task.id, agentIds[0], execResult.error.message);

          return err(execResult.error);
        }

        // Task accepted and running - will complete via callback
        return ok(task.id);
      }

      // Fallback: Send event to plugin (for domains not yet updated)
      if (plugin) {
        try {
          await plugin.handleEvent({
            id: uuidv4(),
            type: 'TaskAssigned',
            timestamp: new Date(),
            source: 'queen-coordinator' as DomainName,
            correlationId: task.correlationId,
            payload: { task },
          });
          console.warn(`[Queen] Domain ${domain} has no executeTask handler, using event fallback`);
        } catch (error) {
          // Log but don't fail - domain will handle via event bus
          console.warn(`[Queen] Failed to invoke domain ${domain} event handler:`, error);
        }
      }
    }

    return ok(task.id);
  }

  private enqueueTask(task: QueenTask): void {
    const priorityQueue = this.taskQueue.get(task.priority);
    if (priorityQueue) {
      priorityQueue.push(task);
      // Sort by creation time within priority
      priorityQueue.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    // Also add to domain-specific queues
    for (const domain of task.targetDomains) {
      const domainQueue = this.domainQueues.get(domain);
      if (domainQueue) {
        domainQueue.push(task);
      }
    }
  }

  private removeFromQueues(task: QueenTask): void {
    // Remove from priority queue
    const priorityQueue = this.taskQueue.get(task.priority);
    if (priorityQueue) {
      const idx = priorityQueue.findIndex(t => t.id === task.id);
      if (idx !== -1) {
        priorityQueue.splice(idx, 1);
      }
    }

    // Remove from domain queues
    for (const domain of ALL_DOMAINS) {
      const domainQueue = this.domainQueues.get(domain);
      if (domainQueue) {
        const idx = domainQueue.findIndex(t => t.id === task.id);
        if (idx !== -1) {
          domainQueue.splice(idx, 1);
        }
      }
    }
  }

  private async processQueue(): Promise<void> {
    // CC-002 FIX: Use atomic counter for capacity check
    if (this.runningTaskCounter >= this.config.maxConcurrentTasks) {
      return;
    }

    // Process by priority (p0 first)
    for (const priority of ['p0', 'p1', 'p2', 'p3'] as Priority[]) {
      const queue = this.taskQueue.get(priority);
      if (!queue || queue.length === 0) continue;

      const task = queue.shift();
      if (task) {
        this.removeFromQueues(task);

        // CC-002 FIX: Increment counter before assigning queued task
        this.runningTaskCounter++;

        try {
          await this.assignTask(task);
        } catch (error) {
          // Decrement if assignment fails
          this.runningTaskCounter--;
          throw error;
        }

        // Check if we can process more using the atomic counter
        if (this.runningTaskCounter >= this.config.maxConcurrentTasks) {
          return;
        }
      }
    }
  }

  private getQueuePosition(task: QueenTask): number {
    let position = 0;

    // Count tasks ahead in higher priority queues
    for (const p of ['p0', 'p1', 'p2', 'p3'] as Priority[]) {
      const queue = this.taskQueue.get(p);
      if (queue) {
        if (p === task.priority) {
          position += queue.findIndex(t => t.id === task.id);
          break;
        }
        position += queue.length;
      }
    }

    return position;
  }

  private getRunningTaskCount(): number {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'running' || t.status === 'assigned')
      .length;
  }

  private getQueuedTaskCount(): number {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'queued')
      .length;
  }

  private canDomainHandleTask(domain: DomainName, task: QueenTask): boolean {
    const compatibleDomains = TASK_DOMAIN_MAP[task.type] || [];
    return compatibleDomains.includes(domain);
  }

  private startWorkStealing(): void {
    this.workStealingTimer = setInterval(async () => {
      await this.triggerWorkStealing();
    }, this.config.workStealing.checkInterval);
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(async () => {
      const metrics = this.getMetrics();
      await this.publishEvent('MetricsCollected', { metrics });

      // Store metrics in memory for historical analysis
      await this.memory.set(`queen:metrics:${Date.now()}`, metrics, {
        ttl: 86400000, // 24 hours
        namespace: 'queen-coordinator',
      });
    }, this.config.metricsInterval);
  }

  private async loadState(): Promise<void> {
    try {
      const state = await this.memory.get<{
        tasks: [string, TaskExecution][];
      }>('queen:state');

      if (state) {
        for (const [id, execution] of state.tasks) {
          // Only restore queued tasks
          if (execution.status === 'queued') {
            this.tasks.set(id, execution);
            this.enqueueTask(execution.task);
          }
        }
      }
    } catch {
      // Ignore errors loading state
    }
  }

  private async saveState(): Promise<void> {
    const queuedTasks = Array.from(this.tasks.entries())
      .filter(([, t]) => t.status === 'queued');

    await this.memory.set(
      'queen:state',
      { tasks: queuedTasks },
      { namespace: 'queen-coordinator', persist: true }
    );
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

  /**
   * MEM-002 FIX: Clean up completed/failed/cancelled tasks older than retention period
   * Prevents memory leak from tasks Map accumulating indefinitely.
   * Should be called periodically via cleanupTimer or manually for immediate cleanup.
   *
   * @param retentionMs - How long to retain completed tasks (default: 1 hour)
   * @returns Number of tasks cleaned up
   */
  cleanupCompletedTasks(retentionMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, execution] of this.tasks) {
      // Only clean up terminal states
      if (
        execution.status === 'completed' ||
        execution.status === 'failed' ||
        execution.status === 'cancelled'
      ) {
        // Use completedAt if available, otherwise startedAt, otherwise skip
        const completedTime = execution.completedAt?.getTime() ||
          execution.startedAt?.getTime() ||
          0;

        if (completedTime > 0 && now - completedTime > retentionMs) {
          this.tasks.delete(taskId);
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      console.log(`[QueenCoordinator] Cleaned up ${cleaned} old tasks (retention: ${retentionMs}ms)`);
    }

    return cleaned;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Queen Coordinator from a QE Kernel
 *
 * @param kernel - The QE Kernel instance
 * @param router - Cross-domain event router
 * @param protocolExecutor - Optional protocol executor for cross-domain protocols
 * @param workflowExecutor - Optional workflow executor
 * @param domainPlugins - Map of domain plugins for direct task execution (Integration Fix)
 * @param config - Optional configuration overrides
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
