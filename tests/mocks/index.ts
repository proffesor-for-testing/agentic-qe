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
import type {
  LLMProvider,
  LLMProviderType,
  LLMResponse,
  EmbeddingResponse,
  CompletionResponse,
  HealthCheckResult,
  Message,
  GenerateOptions,
  EmbedOptions,
  CompleteOptions,
  LLMConfig,
} from '../../src/shared/llm/interfaces';

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

// ============================================================================
// LLM Provider mock (ADR-043 wiring)
// ============================================================================

/**
 * Behavior options for createMockLLMProvider().
 */
export interface MockLLMProviderOptions {
  /** Provider type to identify as. Default: 'claude' */
  type?: LLMProviderType;
  /** Static response content. Default: 'mock response'. */
  content?: string;
  /** Override per-call: function called with the input, returns content. */
  contentFor?: (input: string | Message[], options?: GenerateOptions) => string;
  /** Latency in ms (simulated). Default: 0. */
  latencyMs?: number;
  /** Whether isAvailable/healthCheck report success. Default: true. */
  healthy?: boolean;
  /** Force the provider to throw on generate/embed/complete. Default: false. */
  failing?: boolean;
}

/**
 * Stats observed by a mock provider — used by tests to assert that
 * the LLM-enhancement code paths actually ran.
 */
export interface MockLLMProviderStats {
  generateCalls: number;
  embedCalls: number;
  completeCalls: number;
  lastInput?: string | Message[];
  lastOptions?: GenerateOptions | EmbedOptions | CompleteOptions;
}

/**
 * Create a mock LLMProvider. Returns the provider plus its observed
 * call stats so tests can assert on them.
 */
export function createMockLLMProvider(
  opts: MockLLMProviderOptions = {}
): { provider: LLMProvider; stats: MockLLMProviderStats } {
  const stats: MockLLMProviderStats = {
    generateCalls: 0,
    embedCalls: 0,
    completeCalls: 0,
  };
  const type = opts.type ?? 'claude';
  const baseContent = opts.content ?? 'mock response';
  const latency = opts.latencyMs ?? 0;
  const healthy = opts.healthy ?? true;
  const failing = opts.failing ?? false;
  const maybeFail = (): void => {
    if (failing) throw new Error(`mock provider ${type} configured to fail`);
  };

  const provider: LLMProvider = {
    type,
    name: `Mock ${type}`,
    isAvailable: vi.fn(async () => healthy),
    healthCheck: vi.fn(async (): Promise<HealthCheckResult> => ({
      healthy,
      latencyMs: latency,
      models: ['mock-model'],
    })),
    generate: vi.fn(async (input: string | Message[], options?: GenerateOptions): Promise<LLMResponse> => {
      stats.generateCalls++;
      stats.lastInput = input;
      stats.lastOptions = options;
      maybeFail();
      if (latency > 0) await new Promise((r) => setTimeout(r, latency));
      const content = opts.contentFor ? opts.contentFor(input, options) : baseContent;
      return {
        content,
        model: options?.model ?? 'mock-model',
        provider: type,
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0, currency: 'USD' },
        latencyMs: latency,
        finishReason: 'stop',
        cached: false,
        requestId: `mock-${stats.generateCalls}`,
      };
    }),
    embed: vi.fn(async (text: string, options?: EmbedOptions): Promise<EmbeddingResponse> => {
      stats.embedCalls++;
      stats.lastInput = text;
      stats.lastOptions = options;
      maybeFail();
      return {
        embedding: new Array(8).fill(0).map((_, i) => i / 8),
        model: options?.model ?? 'mock-embed',
        provider: type,
        tokenCount: text.length,
        latencyMs: latency,
        cached: false,
      };
    }),
    complete: vi.fn(async (prompt: string, options?: CompleteOptions): Promise<CompletionResponse> => {
      stats.completeCalls++;
      stats.lastInput = prompt;
      stats.lastOptions = options;
      maybeFail();
      return {
        completion: opts.content ?? 'mock completion',
        model: options?.model ?? 'mock-model',
        provider: type,
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        latencyMs: latency,
        cached: false,
      };
    }),
    getConfig: vi.fn((): LLMConfig => ({ model: 'mock-model' })),
    getSupportedModels: vi.fn(() => ['mock-model']),
    getCostPerToken: vi.fn(() => ({ input: 0, output: 0 })),
    dispose: vi.fn(async () => {}),
  };

  return { provider, stats };
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
