/**
 * Agentic QE v3 - Kernel Test Utilities
 * Milestone 2.2: Shared mocking infrastructure for kernel unit tests
 *
 * Provides standardized mocks for:
 * - MemoryBackend (InMemory and Hybrid backends)
 * - PluginLoader (with factory registration)
 * - EventBus (with subscription tracking)
 * - AgentCoordinator (with spawn/stop tracking)
 * - Configuration helpers
 * - UnifiedMemoryManager (for persistence tests)
 */

import { vi, type Mock } from 'vitest';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  PluginLoader,
  DomainPlugin,
  Subscription,
  AgentInfo,
  AgentSpawnConfig,
  AgentFilter,
  StoreOptions,
  VectorSearchResult,
  DomainHealth,
  KernelConfig,
  KernelHealth,
} from '../../../src/kernel/interfaces';
import type {
  DomainEvent,
  DomainName,
  AgentStatus,
  Result,
} from '../../../src/shared/types';
import { ALL_DOMAINS } from '../../../src/shared/types';

// ============================================================================
// Mock MemoryBackend (InMemory style)
// ============================================================================

export interface MockInMemoryBackendExtensions {
  /** Get all stored values */
  getAllValues(): Map<string, unknown>;
  /** Get all vectors */
  getVectors(): Map<string, { embedding: number[]; metadata?: unknown }>;
  /** Pre-populate storage */
  setInitialState(data: Record<string, unknown>): void;
  /** Clear all state */
  reset(): void;
  /** Get stats */
  getStats(): { entries: number; vectors: number };
  /** Get cleanup interval state */
  isCleanupRunning(): boolean;
}

export type MockInMemoryBackend = MemoryBackend & MockInMemoryBackendExtensions;

export function createMockInMemoryBackend(): MockInMemoryBackend {
  const storage = new Map<string, { value: unknown; namespace: string; expiresAt?: number }>();
  const vectors = new Map<string, { embedding: number[]; metadata?: unknown }>();
  let cleanupRunning = false;

  const buildKey = (key: string, namespace?: string): string => {
    return namespace ? `${namespace}:${key}` : key;
  };

  const mockBackend: MockInMemoryBackend = {
    initialize: vi.fn(async (): Promise<void> => {
      cleanupRunning = true;
    }),

    dispose: vi.fn(async (): Promise<void> => {
      cleanupRunning = false;
      storage.clear();
      vectors.clear();
    }),

    set: vi.fn(async <T>(key: string, value: T, options?: StoreOptions): Promise<void> => {
      const fullKey = buildKey(key, options?.namespace);
      storage.set(fullKey, {
        value,
        namespace: options?.namespace ?? 'default',
        expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
      });
    }),

    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      const entry = storage.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        storage.delete(key);
        return undefined;
      }
      return entry.value as T;
    }),

    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),

    has: vi.fn(async (key: string): Promise<boolean> => {
      const entry = storage.get(key);
      if (!entry) return false;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        storage.delete(key);
        return false;
      }
      return true;
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

    vectorSearch: vi.fn(async (embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      const results: VectorSearchResult[] = [];
      for (const [key, data] of vectors) {
        const score = cosineSimilarity(embedding, data.embedding);
        results.push({ key, score, metadata: data.metadata });
      }
      return results.sort((a, b) => b.score - a.score).slice(0, k);
    }),

    storeVector: vi.fn(async (key: string, embedding: number[], metadata?: unknown): Promise<void> => {
      vectors.set(key, { embedding, metadata });
    }),

    // Extensions
    getAllValues(): Map<string, unknown> {
      const result = new Map<string, unknown>();
      for (const [key, entry] of storage) {
        result.set(key, entry.value);
      }
      return result;
    },

    getVectors(): Map<string, { embedding: number[]; metadata?: unknown }> {
      return new Map(vectors);
    },

    setInitialState(data: Record<string, unknown>): void {
      for (const [key, value] of Object.entries(data)) {
        storage.set(key, { value, namespace: 'default' });
      }
    },

    reset(): void {
      storage.clear();
      vectors.clear();
      cleanupRunning = false;
      vi.clearAllMocks();
    },

    getStats(): { entries: number; vectors: number } {
      return { entries: storage.size, vectors: vectors.size };
    },

    isCleanupRunning(): boolean {
      return cleanupRunning;
    },
  };

  return mockBackend;
}

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
  /** Simulate receiving an event */
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

      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          await handler(event);
        }
      }

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
      handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);

      return {
        unsubscribe: () => {
          handlers.get(eventType)?.delete(handler as (event: DomainEvent) => Promise<void>);
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

    getHistory: vi.fn(async (): Promise<DomainEvent[]> => [...history]),

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

      const typeHandlers = handlers.get(type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
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

export function createMockAgentCoordinator(maxAgentsLimit = 15): MockAgentCoordinator {
  const agents = new Map<string, AgentInfo>();
  let agentCounter = 0;
  let maxAgents = maxAgentsLimit;

  const mockCoordinator: MockAgentCoordinator = {
    spawn: vi.fn(async (config: AgentSpawnConfig): Promise<Result<string, Error>> => {
      const activeCount = Array.from(agents.values()).filter(a => a.status === 'running').length;
      if (activeCount >= maxAgents) {
        return { success: false, error: new Error(`Maximum concurrent agents (${maxAgents}) reached`) };
      }

      const id = `agent-${++agentCounter}`;
      const agent: AgentInfo = {
        id,
        name: config.name,
        type: config.type,
        domain: config.domain,
        status: 'running',
        startedAt: new Date(),
      };
      agents.set(id, agent);
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
      if (filter?.type) {
        result = result.filter(a => a.type === filter.type);
      }
      return result;
    }),

    stop: vi.fn(async (agentId: string): Promise<Result<void, Error>> => {
      const agent = agents.get(agentId);
      if (!agent) {
        return { success: false, error: new Error(`Agent ${agentId} not found`) };
      }
      agent.status = 'completed';
      return { success: true, value: undefined };
    }),

    getActiveCount: vi.fn((): number => {
      return Array.from(agents.values()).filter(a => a.status === 'running' || a.status === 'queued').length;
    }),

    canSpawn: vi.fn((): boolean => {
      const activeCount = Array.from(agents.values()).filter(a => a.status === 'running').length;
      return activeCount < maxAgents;
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
      maxAgents = maxAgentsLimit;
      vi.clearAllMocks();
    },
  };

  return mockCoordinator;
}

// ============================================================================
// Mock PluginLoader
// ============================================================================

export interface MockPluginExtensions {
  /** Get registered factories */
  getRegisteredFactories(): Map<DomainName, () => Promise<DomainPlugin>>;
  /** Get loaded plugins */
  getLoadedPlugins(): Map<DomainName, DomainPlugin>;
  /** Register a mock factory */
  registerMockFactory(domain: DomainName, plugin: DomainPlugin): void;
  /** Clear all state */
  reset(): void;
}

export type MockPluginLoader = PluginLoader & MockPluginExtensions;

export function createMockPluginLoader(): MockPluginLoader {
  const factories = new Map<DomainName, () => Promise<DomainPlugin>>();
  const plugins = new Map<DomainName, DomainPlugin>();
  const loading = new Map<DomainName, Promise<DomainPlugin>>();

  const mockLoader: MockPluginLoader = {
    load: vi.fn(async (domain: DomainName): Promise<DomainPlugin> => {
      // Return if already loaded
      const existing = plugins.get(domain);
      if (existing) return existing;

      // Check if loading
      const loadingPromise = loading.get(domain);
      if (loadingPromise) return loadingPromise;

      // Get factory
      const factory = factories.get(domain);
      if (!factory) {
        throw new Error(`No factory registered for domain: ${domain}`);
      }

      // Load
      const promise = factory();
      loading.set(domain, promise);

      try {
        const plugin = await promise;
        await plugin.initialize();
        plugins.set(domain, plugin);
        return plugin;
      } finally {
        loading.delete(domain);
      }
    }),

    unload: vi.fn(async (domain: DomainName): Promise<void> => {
      const plugin = plugins.get(domain);
      if (!plugin) return;

      // Check dependencies
      for (const [name, p] of plugins) {
        if (p.dependencies.includes(domain)) {
          throw new Error(`Cannot unload ${domain}: domain ${name} depends on it`);
        }
      }

      await plugin.dispose();
      plugins.delete(domain);
    }),

    isLoaded: vi.fn((domain: DomainName): boolean => {
      return plugins.has(domain);
    }),

    getLoaded: vi.fn((): DomainName[] => {
      return Array.from(plugins.keys());
    }),

    loadAll: vi.fn(async (): Promise<void> => {
      for (const domain of factories.keys()) {
        if (!plugins.has(domain)) {
          await mockLoader.load(domain);
        }
      }
    }),

    // Extensions
    getRegisteredFactories(): Map<DomainName, () => Promise<DomainPlugin>> {
      return new Map(factories);
    },

    getLoadedPlugins(): Map<DomainName, DomainPlugin> {
      return new Map(plugins);
    },

    registerMockFactory(domain: DomainName, plugin: DomainPlugin): void {
      factories.set(domain, async () => plugin);
    },

    reset(): void {
      factories.clear();
      plugins.clear();
      loading.clear();
      vi.clearAllMocks();
    },
  };

  return mockLoader;
}

// ============================================================================
// Mock DomainPlugin
// ============================================================================

export interface MockDomainPluginOptions {
  name: DomainName;
  version?: string;
  dependencies?: DomainName[];
  api?: unknown;
  initializeDelay?: number;
  shouldFailInit?: boolean;
}

export function createMockDomainPlugin(options: MockDomainPluginOptions): DomainPlugin {
  const { name, version = '1.0.0', dependencies = [], api = {}, initializeDelay = 0, shouldFailInit = false } = options;
  let ready = false;

  return {
    name,
    version,
    dependencies,

    initialize: vi.fn(async (): Promise<void> => {
      if (initializeDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, initializeDelay));
      }
      if (shouldFailInit) {
        throw new Error(`Failed to initialize plugin: ${name}`);
      }
      ready = true;
    }),

    dispose: vi.fn(async (): Promise<void> => {
      ready = false;
    }),

    isReady: vi.fn((): boolean => ready),

    getHealth: vi.fn((): DomainHealth => ({
      status: ready ? 'healthy' : 'idle',
      agents: { total: 0, active: 0, idle: 0, failed: 0 },
      errors: [],
    })),

    handleEvent: vi.fn(async (_event: DomainEvent): Promise<void> => {}),

    getAPI: vi.fn(<T>(): T => api as T),
  };
}

// ============================================================================
// Kernel Configuration Helpers
// ============================================================================

export function createTestKernelConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    maxConcurrentAgents: 15,
    memoryBackend: 'memory',
    hnswEnabled: false,
    lazyLoading: true,
    enabledDomains: [...ALL_DOMAINS],
    ...overrides,
  };
}

export function createMinimalKernelConfig(overrides?: Partial<KernelConfig>): KernelConfig {
  return {
    maxConcurrentAgents: 5,
    memoryBackend: 'memory',
    hnswEnabled: false,
    lazyLoading: true,
    enabledDomains: ['test-generation', 'test-execution'] as DomainName[],
    ...overrides,
  };
}

// ============================================================================
// Kernel Test Context
// ============================================================================

export interface KernelTestContext {
  eventBus: MockEventBus;
  memory: MockInMemoryBackend;
  coordinator: MockAgentCoordinator;
  pluginLoader: MockPluginLoader;
}

export function createKernelTestContext(): KernelTestContext {
  return {
    eventBus: createMockEventBus(),
    memory: createMockInMemoryBackend(),
    coordinator: createMockAgentCoordinator(),
    pluginLoader: createMockPluginLoader(),
  };
}

export function resetKernelTestContext(ctx: KernelTestContext): void {
  ctx.eventBus.reset();
  ctx.memory.reset();
  ctx.coordinator.reset();
  ctx.pluginLoader.reset();
}

// ============================================================================
// Assertion Helpers
// ============================================================================

export function expectMemoryInitialized(memory: MockInMemoryBackend): void {
  expect(memory.initialize).toHaveBeenCalled();
}

export function expectMemoryDisposed(memory: MockInMemoryBackend): void {
  expect(memory.dispose).toHaveBeenCalled();
}

export function expectPluginLoaded(loader: MockPluginLoader, domain: DomainName): void {
  expect(loader.isLoaded(domain)).toBe(true);
}

export function expectPluginNotLoaded(loader: MockPluginLoader, domain: DomainName): void {
  expect(loader.isLoaded(domain)).toBe(false);
}

export function expectAgentSpawned(coordinator: MockAgentCoordinator, domain: DomainName): void {
  const agents = coordinator.getAgents();
  const matching = Array.from(agents.values()).filter(a => a.domain === domain);
  expect(matching.length).toBeGreaterThan(0);
}

export function expectEventPublished(eventBus: MockEventBus, eventType: string): void {
  const events = eventBus.getEventsByType(eventType);
  expect(events.length).toBeGreaterThan(0);
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

export function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a test database path that is unique per test
 */
export function createTestDbPath(testName: string): string {
  return `/tmp/aqe-test-${testName}-${Date.now()}.db`;
}

/**
 * Clean up test database files
 */
export async function cleanupTestDb(dbPath: string): Promise<void> {
  const fs = await import('fs');
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  } catch {
    // Ignore cleanup errors
  }
}
