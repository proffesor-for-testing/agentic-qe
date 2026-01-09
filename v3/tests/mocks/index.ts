/**
 * Test Mocks for Agentic QE v3
 * Provides mock implementations matching actual kernel interfaces
 */

import { vi } from 'vitest';
import {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  Subscription,
  AgentInfo,
  AgentSpawnConfig,
  AgentFilter,
  StoreOptions,
  VectorSearchResult,
} from '../../src/kernel/interfaces';
import { DomainEvent, DomainName, AgentStatus, Result } from '../../src/shared/types';

/**
 * Create a mock EventBus matching the actual interface
 */
export function createMockEventBus(): EventBus {
  const handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  const channelHandlers = new Map<DomainName, Set<(event: DomainEvent) => Promise<void>>>();
  const history: DomainEvent[] = [];

  return {
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
  };
}

/**
 * Create a mock MemoryBackend matching the actual interface
 */
export function createMockMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();
  const vectors = new Map<string, { embedding: number[]; metadata?: unknown }>();

  return {
    // Initializable
    initialize: vi.fn(async (): Promise<void> => {}),

    // Core methods matching actual interface
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

    // Vector search methods
    vectorSearch: vi.fn(async (embedding: number[], k: number): Promise<VectorSearchResult[]> => {
      const results: VectorSearchResult[] = [];

      for (const [key, data] of vectors) {
        const similarity = cosineSimilarity(embedding, data.embedding);
        results.push({ key, similarity, metadata: data.metadata });
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
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
  };
}

/**
 * Create a mock AgentCoordinator matching the actual interface
 */
export function createMockAgentCoordinator(): AgentCoordinator {
  const agents = new Map<string, AgentInfo>();
  let agentCounter = 0;

  return {
    spawn: vi.fn(async (config: AgentSpawnConfig): Promise<Result<string, Error>> => {
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
      return agents.size < 15; // Max concurrent agents
    }),

    dispose: vi.fn(async (): Promise<void> => {
      agents.clear();
    }),
  };
}

/**
 * Helper: Calculate cosine similarity between two vectors
 */
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
