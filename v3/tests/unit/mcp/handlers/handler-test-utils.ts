/**
 * Test utilities for MCP Handler unit tests
 * Provides mock fleet states, dependencies, and helpers
 */

import { vi } from 'vitest';
import type {
  QueenCoordinator,
  TaskExecution,
  QueenTask,
  TaskType,
} from '../../../../src/coordination/queen-coordinator';
import type {
  QEKernel,
  MemoryBackend,
  EventBus,
  AgentCoordinator,
  Subscription,
  AgentInfo,
  AgentSpawnConfig,
  AgentFilter,
  StoreOptions,
  VectorSearchResult,
} from '../../../../src/kernel/interfaces';
import type {
  DomainName,
  DomainEvent,
  Result,
  AgentStatus,
  Priority,
} from '../../../../src/shared/types';

// ============================================================================
// Mock Fleet State
// ============================================================================

export interface MockFleetState {
  fleetId: string | null;
  kernel: MockQEKernel | null;
  queen: MockQueenCoordinator | null;
  initialized: boolean;
  initTime: Date | null;
}

export function createMockFleetState(options: {
  initialized?: boolean;
  fleetId?: string;
} = {}): MockFleetState {
  const initialized = options.initialized ?? true;

  if (!initialized) {
    return {
      fleetId: null,
      kernel: null,
      queen: null,
      initialized: false,
      initTime: null,
    };
  }

  return {
    fleetId: options.fleetId ?? 'fleet-test-1234',
    kernel: createMockKernel(),
    queen: createMockQueenCoordinator(),
    initialized: true,
    initTime: new Date(),
  };
}

// ============================================================================
// Mock Queen Coordinator
// ============================================================================

export interface MockQueenCoordinator {
  submitTask: ReturnType<typeof vi.fn>;
  getTaskStatus: ReturnType<typeof vi.fn>;
  listTasks: ReturnType<typeof vi.fn>;
  cancelTask: ReturnType<typeof vi.fn>;
  requestAgentSpawn: ReturnType<typeof vi.fn>;
  listAllAgents: ReturnType<typeof vi.fn>;
  getAgentsByDomain: ReturnType<typeof vi.fn>;
  getHealth: ReturnType<typeof vi.fn>;
  getMetrics: ReturnType<typeof vi.fn>;
  getDomainHealth: ReturnType<typeof vi.fn>;
  getDomainLoad: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;

  // Internal state for tests
  _tasks: Map<string, TaskExecution>;
  _agents: AgentInfo[];
  _taskCounter: number;
  _agentCounter: number;
}

export function createMockQueenCoordinator(): MockQueenCoordinator {
  const tasks = new Map<string, TaskExecution>();
  const agents: AgentInfo[] = [];
  let taskCounter = 0;
  let agentCounter = 0;

  const mockQueen: MockQueenCoordinator = {
    _tasks: tasks,
    _agents: agents,
    _taskCounter: taskCounter,
    _agentCounter: agentCounter,

    submitTask: vi.fn(async (task: QueenTask): Promise<Result<string, Error>> => {
      const taskId = `task-${++mockQueen._taskCounter}`;
      const execution: TaskExecution = {
        taskId,
        task: {
          ...task,
          createdAt: new Date(),
        },
        status: 'queued',
        assignedAgents: [],
      };
      tasks.set(taskId, execution);
      return { success: true, value: taskId };
    }),

    getTaskStatus: vi.fn((taskId: string): TaskExecution | undefined => {
      return tasks.get(taskId);
    }),

    listTasks: vi.fn((filter?: { status?: string; priority?: Priority; domain?: DomainName }): TaskExecution[] => {
      let result = Array.from(tasks.values());
      if (filter?.status) {
        result = result.filter(t => t.status === filter.status);
      }
      if (filter?.priority) {
        result = result.filter(t => t.task.priority === filter.priority);
      }
      if (filter?.domain) {
        result = result.filter(t => t.assignedDomain === filter.domain);
      }
      return result;
    }),

    cancelTask: vi.fn(async (taskId: string): Promise<Result<void, Error>> => {
      const task = tasks.get(taskId);
      if (!task) {
        return { success: false, error: new Error(`Task ${taskId} not found`) };
      }
      task.status = 'cancelled';
      return { success: true, value: undefined };
    }),

    requestAgentSpawn: vi.fn(async (
      domain: DomainName,
      type: string,
      capabilities: string[]
    ): Promise<Result<string, Error>> => {
      const agentId = `agent-${++mockQueen._agentCounter}`;
      agents.push({
        id: agentId,
        domain,
        type,
        status: 'idle',
        name: `${domain}-${type}`,
        startedAt: new Date(),
      });
      return { success: true, value: agentId };
    }),

    listAllAgents: vi.fn((): AgentInfo[] => {
      return [...agents];
    }),

    getAgentsByDomain: vi.fn((domain: DomainName): AgentInfo[] => {
      return agents.filter(a => a.domain === domain);
    }),

    getHealth: vi.fn(() => ({
      status: 'healthy' as const,
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'running').length,
      pendingTasks: Array.from(tasks.values()).filter(t => t.status === 'queued').length,
      runningTasks: Array.from(tasks.values()).filter(t => t.status === 'running').length,
      workStealingActive: false,
      lastHealthCheck: new Date(),
      domainHealth: new Map(),
      issues: [],
    })),

    getMetrics: vi.fn(() => ({
      uptime: 1000,
      tasksReceived: tasks.size,
      tasksCompleted: Array.from(tasks.values()).filter(t => t.status === 'completed').length,
      tasksFailed: Array.from(tasks.values()).filter(t => t.status === 'failed').length,
      agentUtilization: 0.5,
      averageTaskDuration: 100,
    })),

    getDomainHealth: vi.fn((domain: DomainName) => ({
      status: 'healthy' as const,
      agents: { total: 2, active: 1, idle: 1 },
      errors: [],
      lastActivity: new Date(),
    })),

    getDomainLoad: vi.fn((domain: DomainName) => 0.3),

    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {
      tasks.clear();
      agents.length = 0;
    }),
  };

  return mockQueen;
}

// ============================================================================
// Mock QE Kernel
// ============================================================================

export interface MockQEKernel {
  memory: MockMemoryBackend;
  eventBus: MockEventBus;
  agents: MockAgentCoordinator;
  plugins: { loadAll: ReturnType<typeof vi.fn>; getLoaded: ReturnType<typeof vi.fn>; getPlugin: ReturnType<typeof vi.fn> };
  getDomainAPI: ReturnType<typeof vi.fn>;
  initialize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function createMockKernel(): MockQEKernel {
  return {
    memory: createMockMemoryBackend(),
    eventBus: createMockEventBus(),
    agents: createMockAgentCoordinator(),
    plugins: {
      loadAll: vi.fn(async () => {}),
      getLoaded: vi.fn(() => []),
      getPlugin: vi.fn(() => undefined),
    },
    getDomainAPI: vi.fn(() => undefined),
    initialize: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
}

// ============================================================================
// Mock Memory Backend
// ============================================================================

export interface MockMemoryBackend {
  storage: Map<string, unknown>;
  vectors: Map<string, { embedding: number[]; metadata?: unknown }>;
  initialize: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
  search: ReturnType<typeof vi.fn>;
  vectorSearch: ReturnType<typeof vi.fn>;
  storeVector: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function createMockMemoryBackend(): MockMemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata?: unknown }>();

  return {
    storage,
    vectors,

    initialize: vi.fn(async () => {}),

    set: vi.fn(async <T>(key: string, value: T, options?: StoreOptions): Promise<void> => {
      storage.set(key, value);
    }),

    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),

    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),

    has: vi.fn(async (key: string): Promise<boolean> => {
      return storage.has(key);
    }),

    search: vi.fn(async (pattern: string, limit?: number): Promise<string[]> => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches = Array.from(storage.keys()).filter(k => regex.test(k));
      return limit ? matches.slice(0, limit) : matches;
    }),

    vectorSearch: vi.fn(async (embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      return [];
    }),

    storeVector: vi.fn(async (key: string, embedding: number[], metadata?: unknown): Promise<void> => {
      vectors.set(key, { embedding, metadata });
    }),

    dispose: vi.fn(async () => {
      storage.clear();
      vectors.clear();
    }),
  };
}

// ============================================================================
// Mock Event Bus
// ============================================================================

export interface MockEventBus {
  handlers: Map<string, Set<(event: DomainEvent) => Promise<void>>>;
  publishedEvents: DomainEvent[];
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  subscribeToChannel: ReturnType<typeof vi.fn>;
  getHistory: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function createMockEventBus(): MockEventBus {
  const handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  const publishedEvents: DomainEvent[] = [];

  return {
    handlers,
    publishedEvents,

    publish: vi.fn(async <T>(event: DomainEvent<T>): Promise<void> => {
      publishedEvents.push(event);
    }),

    subscribe: vi.fn(<T>(eventType: string, handler: (event: DomainEvent<T>) => Promise<void>): Subscription => {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, new Set());
      }
      handlers.get(eventType)!.add(handler as any);
      return {
        unsubscribe: () => handlers.get(eventType)?.delete(handler as any),
        active: true,
      };
    }),

    subscribeToChannel: vi.fn((domain: DomainName, handler: (event: DomainEvent) => Promise<void>): Subscription => {
      return {
        unsubscribe: () => {},
        active: true,
      };
    }),

    getHistory: vi.fn(async (): Promise<DomainEvent[]> => {
      return [...publishedEvents];
    }),

    dispose: vi.fn(async () => {
      handlers.clear();
      publishedEvents.length = 0;
    }),
  };
}

// ============================================================================
// Mock Agent Coordinator
// ============================================================================

export interface MockAgentCoordinator {
  agents: Map<string, AgentInfo>;
  spawn: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
  listAgents: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  getActiveCount: ReturnType<typeof vi.fn>;
  canSpawn: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

export function createMockAgentCoordinator(): MockAgentCoordinator {
  const agents = new Map<string, AgentInfo>();
  let counter = 0;

  return {
    agents,

    spawn: vi.fn(async (config: AgentSpawnConfig): Promise<Result<string, Error>> => {
      const id = `agent-${++counter}`;
      agents.set(id, {
        id,
        name: config.name,
        type: config.type,
        domain: config.domain,
        status: 'idle',
        startedAt: new Date(),
      });
      return { success: true, value: id };
    }),

    getStatus: vi.fn((agentId: string): AgentStatus | undefined => {
      return agents.get(agentId)?.status;
    }),

    listAgents: vi.fn((filter?: AgentFilter): AgentInfo[] => {
      let result = Array.from(agents.values());
      if (filter?.domain) {
        result = result.filter(a => a.domain === filter.domain);
      }
      if (filter?.status) {
        result = result.filter(a => a.status === filter.status);
      }
      return result;
    }),

    stop: vi.fn(async (agentId: string): Promise<Result<void, Error>> => {
      if (agents.delete(agentId)) {
        return { success: true, value: undefined };
      }
      return { success: false, error: new Error(`Agent ${agentId} not found`) };
    }),

    getActiveCount: vi.fn((): number => {
      return Array.from(agents.values()).filter(a => a.status === 'running').length;
    }),

    canSpawn: vi.fn((): boolean => agents.size < 15),

    dispose: vi.fn(async () => {
      agents.clear();
    }),
  };
}

// ============================================================================
// Mock Task Router (ADR-051)
// ============================================================================

export interface MockTaskRouter {
  routeTask: ReturnType<typeof vi.fn>;
  getRoutingStats: ReturnType<typeof vi.fn>;
  getMetrics: ReturnType<typeof vi.fn>;
  getRoutingLog: ReturnType<typeof vi.fn>;
}

export function createMockTaskRouter(): MockTaskRouter {
  return {
    routeTask: vi.fn(async (params: { task: string; domain?: string }) => ({
      decision: {
        tier: 2,
        complexityAnalysis: {
          overall: 0.5,
          codeComplexity: 0.4,
          reasoningComplexity: 0.5,
          scopeComplexity: 0.6,
        },
        confidence: 0.85,
        rationale: 'Medium complexity task',
        warnings: [],
        budgetDecision: {
          allowed: true,
          wasDowngraded: false,
          estimatedCostUsd: 0.01,
        },
        metadata: {
          decisionTimeMs: 5,
        },
      },
      tierInfo: { name: 'Haiku' },
      modelId: 'claude-3-haiku',
      executionStrategy: 'single',
      useAgentBooster: false,
    })),

    getRoutingStats: vi.fn(() => ({
      totalRouted: 10,
      byTier: { 0: 1, 1: 2, 2: 5, 3: 2 },
      avgConfidence: 0.82,
    })),

    getMetrics: vi.fn(() => ({
      totalDecisions: 10,
      avgDecisionTimeMs: 8,
      agentBoosterStats: {
        eligible: 3,
        used: 2,
        successRate: 0.95,
      },
      budgetStats: {
        totalSpentUsd: 0.50,
        budgetUtilization: 0.1,
        downgradeCount: 1,
      },
    })),

    getRoutingLog: vi.fn((limit?: number) => []),
  };
}

// ============================================================================
// Mock Metrics Collector
// ============================================================================

export interface MockMetricsCollector {
  getResourceStats: ReturnType<typeof vi.fn>;
  getAgentTaskStats: ReturnType<typeof vi.fn>;
  getRetryStats: ReturnType<typeof vi.fn>;
  getWorkersUsed: ReturnType<typeof vi.fn>;
  getWorkerEfficiency: ReturnType<typeof vi.fn>;
  getLoadBalanceScore: ReturnType<typeof vi.fn>;
  getTestDurations: ReturnType<typeof vi.fn>;
}

export function createMockMetricsCollector(): MockMetricsCollector {
  return {
    getResourceStats: vi.fn((agentId?: string) => ({
      cpu: 0.25,
      memory: 0.40,
    })),

    getAgentTaskStats: vi.fn((agentId: string) => ({
      tasksCompleted: 10,
      averageTime: 150,
      successRate: 0.95,
    })),

    getRetryStats: vi.fn(() => ({
      totalRetries: 5,
      successfulRetries: 4,
      maxRetriesReached: 1,
    })),

    getWorkersUsed: vi.fn(() => 4),
    getWorkerEfficiency: vi.fn(() => 0.85),
    getLoadBalanceScore: vi.fn(() => 0.90),
    getTestDurations: vi.fn((count: number) => Array(count).fill(200)),
  };
}

// ============================================================================
// Mock Load Balancer (ADR-039)
// ============================================================================

export interface MockLoadBalancer {
  registerAgent: ReturnType<typeof vi.fn>;
  selectAgent: ReturnType<typeof vi.fn>;
  getAgentLoad: ReturnType<typeof vi.fn>;
}

export function createMockLoadBalancer(): MockLoadBalancer {
  return {
    registerAgent: vi.fn((agentId: string) => {}),
    selectAgent: vi.fn((domain: DomainName) => 'agent-1'),
    getAgentLoad: vi.fn((agentId: string) => 0.5),
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to wait for async operations to settle
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Helper to create a task execution for testing
 */
export function createTaskExecution(overrides: Partial<TaskExecution> = {}): TaskExecution {
  return {
    taskId: 'task-1',
    task: {
      type: 'generate-tests' as TaskType,
      priority: 'p1' as Priority,
      targetDomains: [],
      payload: {},
      timeout: 60000,
      createdAt: new Date(),
    },
    status: 'queued',
    assignedAgents: [],
    ...overrides,
  };
}

/**
 * Helper to create an agent info for testing
 */
export function createAgentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    name: 'test-agent',
    type: 'worker',
    domain: 'test-generation' as DomainName,
    status: 'idle',
    startedAt: new Date(),
    ...overrides,
  };
}
