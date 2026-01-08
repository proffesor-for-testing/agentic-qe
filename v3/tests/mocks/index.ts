/**
 * Test Mocks for Agentic QE v3
 * Provides mock implementations for kernel interfaces
 */

import { vi } from 'vitest';
import { EventBus, MemoryBackend, AgentCoordinator, Subscription, AgentInfo, AgentSpawnConfig } from '../../src/kernel/interfaces';
import { DomainEvent, DomainName, AgentStatus, Result } from '../../src/shared/types';

/**
 * Create a mock EventBus
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
 * Create a mock MemoryBackend
 */
export function createMockMemory(): MemoryBackend {
  const storage = new Map<string, { value: unknown; embedding?: number[]; metadata?: Record<string, unknown> }>();

  return {
    store: vi.fn(async (key: string, value: unknown, embedding?: number[]): Promise<void> => {
      storage.set(key, { value, embedding });
    }),

    retrieve: vi.fn(async (key: string): Promise<unknown | undefined> => {
      return storage.get(key)?.value;
    }),

    search: vi.fn(async (embedding: number[], k: number): Promise<Array<{ key: string; value: unknown; similarity: number }>> => {
      const results: Array<{ key: string; value: unknown; similarity: number }> = [];

      for (const [key, data] of storage) {
        if (data.embedding) {
          // Calculate cosine similarity
          const similarity = cosineSimilarity(embedding, data.embedding);
          results.push({ key, value: data.value, similarity });
        }
      }

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k);
    }),

    delete: vi.fn(async (key: string): Promise<boolean> => {
      return storage.delete(key);
    }),

    clear: vi.fn(async (): Promise<void> => {
      storage.clear();
    }),

    keys: vi.fn(async (pattern?: string): Promise<string[]> => {
      const allKeys = Array.from(storage.keys());
      if (!pattern) return allKeys;

      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return allKeys.filter(k => regex.test(k));
    }),

    size: vi.fn(async (): Promise<number> => {
      return storage.size;
    }),

    dispose: vi.fn(async (): Promise<void> => {
      storage.clear();
    }),
  };
}

/**
 * Create a mock AgentCoordinator
 */
export function createMockAgentCoordinator(): AgentCoordinator {
  const agents = new Map<string, AgentInfo>();
  let agentCounter = 0;

  return {
    spawn: vi.fn(async (config: AgentSpawnConfig): Promise<Result<string, Error>> => {
      const id = config.id || `agent-${++agentCounter}`;
      const agent: AgentInfo = {
        id,
        type: config.type,
        domain: config.domain,
        status: 'idle',
        spawnedAt: new Date(),
        capabilities: config.capabilities || [],
      };
      agents.set(id, agent);
      return { success: true, value: id };
    }),

    getStatus: vi.fn((agentId: string): AgentStatus | undefined => {
      const agent = agents.get(agentId);
      return agent?.status;
    }),

    listAgents: vi.fn((): AgentInfo[] => {
      return Array.from(agents.values());
    }),

    terminate: vi.fn(async (agentId: string): Promise<boolean> => {
      return agents.delete(agentId);
    }),

    assignTask: vi.fn(async (agentId: string, task: unknown): Promise<Result<void, Error>> => {
      const agent = agents.get(agentId);
      if (!agent) {
        return { success: false, error: new Error(`Agent ${agentId} not found`) };
      }
      agent.status = 'running';
      // Simulate task completion
      setTimeout(() => {
        if (agents.has(agentId)) {
          agents.get(agentId)!.status = 'idle';
        }
      }, 100);
      return { success: true, value: undefined };
    }),

    getMetrics: vi.fn((): Record<string, unknown> => {
      return {
        totalAgents: agents.size,
        activeAgents: Array.from(agents.values()).filter(a => a.status === 'running').length,
        idleAgents: Array.from(agents.values()).filter(a => a.status === 'idle').length,
      };
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

/**
 * Create a spy wrapper around an existing object
 */
export function spyOnObject<T extends object>(obj: T): T {
  const spied = { ...obj } as T;

  for (const key of Object.keys(obj)) {
    const value = (obj as any)[key];
    if (typeof value === 'function') {
      (spied as any)[key] = vi.fn(value.bind(obj));
    }
  }

  return spied;
}
