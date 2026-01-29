/**
 * Agentic QE v3 - Coordinator Test Utilities
 * Shared mocking infrastructure for domain coordinator unit tests
 *
 * Milestone 1.5: Provides standardized mocks for:
 * - EventBus (with subscription tracking and event history)
 * - MemoryBackend (with vector search capabilities)
 * - AgentCoordinator (with spawn/stop tracking)
 * - Router (for topology-aware routing)
 * - Queen integration (for task completion callbacks)
 * - MinCut and Consensus mixins
 */

import { vi, type Mock } from 'vitest';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  Subscription,
  AgentInfo,
  AgentSpawnConfig,
  AgentFilter,
  StoreOptions,
  VectorSearchResult,
  DomainHealth,
  DomainTaskRequest,
  DomainTaskResult,
  TaskCompletionCallback,
} from '../../../src/kernel/interfaces';
import type {
  DomainEvent,
  DomainName,
  AgentStatus,
  Result,
  Priority,
} from '../../../src/shared/types';

// ============================================================================
// Mock EventBus
// ============================================================================

export interface MockEventBusExtensions {
  /** Get all published events */
  getPublishedEvents(): DomainEvent[];
  /** Get events by type */
  getEventsByType(type: string): DomainEvent[];
  /** Get all active subscriptions */
  getSubscriptions(): Map<string, Set<(event: DomainEvent) => Promise<void>>>;
  /** Simulate receiving an event from another domain */
  simulateEvent<T>(type: string, source: DomainName, payload: T): Promise<void>;
  /** Clear all state */
  reset(): void;
}

export type MockEventBus = EventBus & MockEventBusExtensions;

export function createMockEventBus(): MockEventBus {
  const handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  const channelHandlers = new Map<DomainName, Set<(event: DomainEvent) => Promise<void>>>();
  const history: DomainEvent[] = [];

  const mockEventBus: MockEventBus = {
    publish: vi.fn(async <T>(event: DomainEvent<T>): Promise<void> => {
      history.push(event);

      // Notify type-specific handlers
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          await handler(event);
        }
      }

      // Notify channel handlers
      const channel = channelHandlers.get(event.source as DomainName);
      if (channel) {
        for (const handler of channel) {
          await handler(event);
        }
      }
    }),

    subscribe: vi.fn(<T>(eventType: string, handler: (event: DomainEvent<T>) => Promise<void>): Subscription => {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, new Set());
      }
      handlers.get(eventType)!.add(handler as any);

      return {
        unsubscribe: () => {
          handlers.get(eventType)?.delete(handler as any);
        },
        active: true,
      };
    }),

    subscribeToChannel: vi.fn((domain: DomainName, handler: (event: DomainEvent) => Promise<void>): Subscription => {
      if (!channelHandlers.has(domain)) {
        channelHandlers.set(domain, new Set());
      }
      channelHandlers.get(domain)!.add(handler);

      return {
        unsubscribe: () => {
          channelHandlers.get(domain)?.delete(handler);
        },
        active: true,
      };
    }),

    getHistory: vi.fn(async (): Promise<DomainEvent[]> => {
      return [...history];
    }),

    dispose: vi.fn(async (): Promise<void> => {
      handlers.clear();
      channelHandlers.clear();
    }),

    // Extensions
    getPublishedEvents(): DomainEvent[] {
      return [...history];
    },

    getEventsByType(type: string): DomainEvent[] {
      return history.filter(e => e.type === type);
    },

    getSubscriptions(): Map<string, Set<(event: DomainEvent) => Promise<void>>> {
      return new Map(handlers);
    },

    async simulateEvent<T>(type: string, source: DomainName, payload: T): Promise<void> {
      const event: DomainEvent<T> = {
        id: `test-event-${Date.now()}`,
        type,
        source,
        payload,
        timestamp: new Date(),
        correlationId: `correlation-${Date.now()}`,
      };

      // Trigger type handlers
      const typeHandlers = handlers.get(type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          await handler(event);
        }
      }

      // Trigger channel handlers
      const channel = channelHandlers.get(source);
      if (channel) {
        for (const handler of channel) {
          await handler(event);
        }
      }
    },

    reset(): void {
      history.length = 0;
      handlers.clear();
      channelHandlers.clear();
      vi.clearAllMocks();
    },
  };

  return mockEventBus;
}

// ============================================================================
// Mock MemoryBackend
// ============================================================================

export interface MockMemoryExtensions {
  /** Get all stored values */
  getAllValues(): Map<string, unknown>;
  /** Get all vectors */
  getVectors(): Map<string, { embedding: number[]; metadata?: unknown }>;
  /** Pre-populate storage */
  setInitialState(data: Record<string, unknown>): void;
  /** Clear all state */
  reset(): void;
}

export type MockMemory = MemoryBackend & MockMemoryExtensions;

export function createMockMemory(): MockMemory {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata?: unknown }>();

  const mockMemory: MockMemory = {
    // Initializable
    initialize: vi.fn(async (): Promise<void> => {}),

    // Core methods
    set: vi.fn(async <T>(key: string, value: T, _options?: StoreOptions): Promise<void> => {
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

    count: vi.fn(async (namespace: string): Promise<number> => {
      const prefix = namespace + ':';
      return Array.from(storage.keys()).filter(k => k.startsWith(prefix)).length;
    }),

    hasCodeIntelligenceIndex: vi.fn(async (): Promise<boolean> => {
      return Array.from(storage.keys()).some(k => k.startsWith('code-intelligence:kg:'));
    }),

    // Vector search
    vectorSearch: vi.fn(async (embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      const results: VectorSearchResult[] = [];

      for (const [key, data] of vectors) {
        const score = cosineSimilarity(embedding, data.embedding);
        results.push({ key, score, metadata: data.metadata });
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    }),

    storeVector: vi.fn(async (key: string, embedding: number[], metadata?: unknown): Promise<void> => {
      vectors.set(key, { embedding, metadata });
    }),

    // Disposable
    dispose: vi.fn(async (): Promise<void> => {
      storage.clear();
      vectors.clear();
    }),

    // Extensions
    getAllValues(): Map<string, unknown> {
      return new Map(storage);
    },

    getVectors(): Map<string, { embedding: number[]; metadata?: unknown }> {
      return new Map(vectors);
    },

    setInitialState(data: Record<string, unknown>): void {
      for (const [key, value] of Object.entries(data)) {
        storage.set(key, value);
      }
    },

    reset(): void {
      storage.clear();
      vectors.clear();
      vi.clearAllMocks();
    },
  };

  return mockMemory;
}

// ============================================================================
// Mock AgentCoordinator
// ============================================================================

export interface MockAgentCoordinatorExtensions {
  /** Get all spawned agents */
  getAgents(): Map<string, AgentInfo>;
  /** Set agent status */
  setAgentStatus(agentId: string, status: AgentStatus): void;
  /** Simulate agent failure */
  simulateAgentFailure(agentId: string): void;
  /** Set max agents limit */
  setMaxAgents(max: number): void;
  /** Clear all state */
  reset(): void;
}

export type MockAgentCoordinator = AgentCoordinator & MockAgentCoordinatorExtensions;

export function createMockAgentCoordinator(): MockAgentCoordinator {
  const agents = new Map<string, AgentInfo>();
  let agentCounter = 0;
  let maxAgents = 15;

  const mockCoordinator: MockAgentCoordinator = {
    spawn: vi.fn(async (config: AgentSpawnConfig): Promise<Result<string, Error>> => {
      if (agents.size >= maxAgents) {
        return { success: false, error: new Error('Agent limit reached') };
      }

      const id = `agent-${++agentCounter}`;
      const agent: AgentInfo = {
        id,
        name: config.name,
        type: config.type,
        domain: config.domain,
        status: 'idle',
        startedAt: new Date(),
      };
      agents.set(id, agent);
      return { success: true, value: id };
    }),

    getStatus: vi.fn((agentId: string): AgentStatus | undefined => {
      const agent = agents.get(agentId);
      return agent?.status;
    }),

    listAgents: vi.fn((filter?: AgentFilter): AgentInfo[] => {
      let result = Array.from(agents.values());
      if (filter?.domain) {
        result = result.filter(a => a.domain === filter.domain);
      }
      if (filter?.status) {
        result = result.filter(a => a.status === filter.status);
      }
      if (filter?.type) {
        result = result.filter(a => a.type === filter.type);
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

    canSpawn: vi.fn((): boolean => {
      return agents.size < maxAgents;
    }),

    dispose: vi.fn(async (): Promise<void> => {
      agents.clear();
    }),

    // Extensions
    getAgents(): Map<string, AgentInfo> {
      return new Map(agents);
    },

    setAgentStatus(agentId: string, status: AgentStatus): void {
      const agent = agents.get(agentId);
      if (agent) {
        agent.status = status;
      }
    },

    simulateAgentFailure(agentId: string): void {
      const agent = agents.get(agentId);
      if (agent) {
        agent.status = 'failed';
      }
    },

    setMaxAgents(max: number): void {
      maxAgents = max;
    },

    reset(): void {
      agents.clear();
      agentCounter = 0;
      maxAgents = 15;
      vi.clearAllMocks();
    },
  };

  return mockCoordinator;
}

// ============================================================================
// Mock Queen Integration
// ============================================================================

export interface MockQueenIntegration {
  /** Completed tasks */
  completedTasks: DomainTaskResult[];
  /** Create a task request */
  createTaskRequest(taskType: string, payload: Record<string, unknown>): DomainTaskRequest;
  /** Create a completion callback that records results */
  createCompletionCallback(): TaskCompletionCallback;
  /** Get last completed task */
  getLastCompletedTask(): DomainTaskResult | undefined;
  /** Reset state */
  reset(): void;
}

export function createMockQueenIntegration(): MockQueenIntegration {
  let taskCounter = 0;
  const completedTasks: DomainTaskResult[] = [];

  return {
    completedTasks,

    createTaskRequest(taskType: string, payload: Record<string, unknown>): DomainTaskRequest {
      return {
        taskId: `task-${++taskCounter}`,
        taskType,
        payload,
        priority: 'p2' as Priority,
        timeout: 60000,
        correlationId: `correlation-${taskCounter}`,
      };
    },

    createCompletionCallback(): TaskCompletionCallback {
      return async (result: DomainTaskResult): Promise<void> => {
        completedTasks.push(result);
      };
    },

    getLastCompletedTask(): DomainTaskResult | undefined {
      return completedTasks[completedTasks.length - 1];
    },

    reset(): void {
      taskCounter = 0;
      completedTasks.length = 0;
    },
  };
}

// ============================================================================
// Mock MinCut Bridge
// ============================================================================

export interface MockMinCutBridge {
  topologyStatus: 'healthy' | 'degraded' | 'critical';
  weakVertices: Array<{ domain: DomainName; agentId: string }>;
  setTopologyStatus(status: 'healthy' | 'degraded' | 'critical'): void;
  addWeakVertex(domain: DomainName, agentId: string): void;
  isHealthy(): boolean;
  getWeakVertices(): Array<{ domain: DomainName; agentId: string }>;
  reset(): void;
}

export function createMockMinCutBridge(): MockMinCutBridge {
  let topologyStatus: 'healthy' | 'degraded' | 'critical' = 'healthy';
  const weakVertices: Array<{ domain: DomainName; agentId: string }> = [];

  return {
    get topologyStatus() {
      return topologyStatus;
    },
    set topologyStatus(status) {
      topologyStatus = status;
    },

    get weakVertices() {
      return weakVertices;
    },

    setTopologyStatus(status: 'healthy' | 'degraded' | 'critical'): void {
      topologyStatus = status;
    },

    addWeakVertex(domain: DomainName, agentId: string): void {
      weakVertices.push({ domain, agentId });
    },

    isHealthy(): boolean {
      return topologyStatus === 'healthy';
    },

    getWeakVertices(): Array<{ domain: DomainName; agentId: string }> {
      return [...weakVertices];
    },

    reset(): void {
      topologyStatus = 'healthy';
      weakVertices.length = 0;
    },
  };
}

// ============================================================================
// Mock Consensus Engine
// ============================================================================

export interface MockConsensusEngine {
  verificationResults: Map<string, 'verified' | 'rejected' | 'inconclusive'>;
  verifyCount: number;
  setVerificationResult(findingType: string, result: 'verified' | 'rejected' | 'inconclusive'): void;
  isAvailable(): boolean;
  getVerifyCount(): number;
  reset(): void;
}

export function createMockConsensusEngine(): MockConsensusEngine {
  const verificationResults = new Map<string, 'verified' | 'rejected' | 'inconclusive'>();
  let verifyCount = 0;

  return {
    verificationResults,

    get verifyCount() {
      return verifyCount;
    },

    setVerificationResult(findingType: string, result: 'verified' | 'rejected' | 'inconclusive'): void {
      verificationResults.set(findingType, result);
    },

    isAvailable(): boolean {
      return true;
    },

    getVerifyCount(): number {
      return verifyCount;
    },

    reset(): void {
      verificationResults.clear();
      verifyCount = 0;
    },
  };
}

// ============================================================================
// Test Coordinator Factory
// ============================================================================

export interface CoordinatorTestContext {
  eventBus: MockEventBus;
  memory: MockMemory;
  agentCoordinator: MockAgentCoordinator;
  queen: MockQueenIntegration;
  minCutBridge: MockMinCutBridge;
  consensusEngine: MockConsensusEngine;
}

/**
 * Create a complete test context with all mocks initialized
 */
export function createCoordinatorTestContext(): CoordinatorTestContext {
  return {
    eventBus: createMockEventBus(),
    memory: createMockMemory(),
    agentCoordinator: createMockAgentCoordinator(),
    queen: createMockQueenIntegration(),
    minCutBridge: createMockMinCutBridge(),
    consensusEngine: createMockConsensusEngine(),
  };
}

/**
 * Reset all mocks in a test context
 */
export function resetTestContext(ctx: CoordinatorTestContext): void {
  ctx.eventBus.reset();
  ctx.memory.reset();
  ctx.agentCoordinator.reset();
  ctx.queen.reset();
  ctx.minCutBridge.reset();
  ctx.consensusEngine.reset();
}

// ============================================================================
// Coordinator Health Assertions
// ============================================================================

export function createHealthyDomainHealth(domain: DomainName): DomainHealth {
  return {
    status: 'healthy',
    agents: {
      total: 2,
      active: 1,
      idle: 1,
      failed: 0,
    },
    lastActivity: new Date(),
    errors: [],
  };
}

export function createIdleDomainHealth(): DomainHealth {
  return {
    status: 'idle',
    agents: {
      total: 0,
      active: 0,
      idle: 0,
      failed: 0,
    },
    errors: [],
  };
}

export function createDegradedDomainHealth(errors: string[]): DomainHealth {
  return {
    status: 'degraded',
    agents: {
      total: 3,
      active: 1,
      idle: 1,
      failed: 1,
    },
    lastActivity: new Date(),
    errors,
  };
}

// ============================================================================
// Event Assertion Helpers
// ============================================================================

export function expectEventPublished(
  eventBus: MockEventBus,
  eventType: string,
  matchPayload?: Record<string, unknown>
): void {
  const events = eventBus.getEventsByType(eventType);
  if (events.length === 0) {
    throw new Error(`Expected event '${eventType}' to be published, but it was not`);
  }

  if (matchPayload) {
    const matchFound = events.some(e => {
      const payload = e.payload as Record<string, unknown>;
      return Object.entries(matchPayload).every(
        ([key, value]) => payload[key] === value
      );
    });

    if (!matchFound) {
      throw new Error(
        `Expected event '${eventType}' with payload matching ${JSON.stringify(matchPayload)}, ` +
        `but found: ${JSON.stringify(events.map(e => e.payload))}`
      );
    }
  }
}

export function expectNoEventPublished(eventBus: MockEventBus, eventType: string): void {
  const events = eventBus.getEventsByType(eventType);
  if (events.length > 0) {
    throw new Error(
      `Expected no '${eventType}' events, but found ${events.length}: ` +
      `${JSON.stringify(events.map(e => e.payload))}`
    );
  }
}

export function expectSubscription(eventBus: MockEventBus, eventType: string): void {
  const subscriptions = eventBus.getSubscriptions();
  if (!subscriptions.has(eventType)) {
    throw new Error(`Expected subscription to '${eventType}' but none found`);
  }
}

// ============================================================================
// Agent Assertion Helpers
// ============================================================================

export function expectAgentSpawned(
  coordinator: MockAgentCoordinator,
  domain: DomainName,
  type?: string
): void {
  const agents = coordinator.getAgents();
  const matchingAgents = Array.from(agents.values()).filter(a => {
    if (a.domain !== domain) return false;
    if (type && a.type !== type) return false;
    return true;
  });

  if (matchingAgents.length === 0) {
    throw new Error(
      `Expected agent in domain '${domain}'${type ? ` of type '${type}'` : ''} to be spawned, ` +
      `but found: ${JSON.stringify(Array.from(agents.values()).map(a => ({ domain: a.domain, type: a.type })))}`
    );
  }
}

export function expectNoAgentsSpawned(coordinator: MockAgentCoordinator): void {
  const agents = coordinator.getAgents();
  if (agents.size > 0) {
    throw new Error(
      `Expected no agents to be spawned, but found ${agents.size}: ` +
      `${JSON.stringify(Array.from(agents.values()).map(a => a.name))}`
    );
  }
}

// ============================================================================
// Memory Assertion Helpers
// ============================================================================

export function expectMemoryStored(
  memory: MockMemory,
  keyPattern: string | RegExp,
  matchValue?: unknown
): void {
  const values = memory.getAllValues();
  const pattern = typeof keyPattern === 'string'
    ? new RegExp(keyPattern.replace(/\*/g, '.*'))
    : keyPattern;

  const matchingKeys = Array.from(values.keys()).filter(k => pattern.test(k));

  if (matchingKeys.length === 0) {
    throw new Error(
      `Expected key matching '${keyPattern}' to be stored, ` +
      `but found: ${JSON.stringify(Array.from(values.keys()))}`
    );
  }

  if (matchValue !== undefined) {
    const matchFound = matchingKeys.some(k => {
      const stored = values.get(k);
      return JSON.stringify(stored) === JSON.stringify(matchValue);
    });

    if (!matchFound) {
      throw new Error(
        `Expected value matching ${JSON.stringify(matchValue)}, ` +
        `but found: ${JSON.stringify(matchingKeys.map(k => values.get(k)))}`
      );
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Wait for async operations to complete
 */
export function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create a delay for timing tests
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
