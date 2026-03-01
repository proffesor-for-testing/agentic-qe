/**
 * N8n Agent Factory
 *
 * Factory for creating and managing n8n v2 agents with v3 integration.
 * Actually instantiates real v2 agents from the compiled dist output.
 *
 * IMPORTANT: This requires v2 to be built first (`npm run build` in root)
 */

import { randomUUID } from 'crypto';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import type { N8nAgentType } from './types.js';
import { N8N_TO_V3_DOMAIN_MAP } from './workflow-mapper.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Types (matching v2 agent interfaces)
// ============================================================================

/**
 * V2 N8n API Configuration
 */
export interface V2N8nAPIConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
}

/**
 * V2 Agent Context
 */
export interface V2AgentContext {
  id?: string;
  type?: string;
  status?: string;
  projectId?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for creating an n8n agent
 */
export interface N8nAgentFactoryConfig {
  /** N8n API configuration (required for agents that call n8n) */
  n8nConfig?: V2N8nAPIConfig;
  /** Memory store for cross-agent learning */
  memoryStore?: unknown;
  /** Event bus for coordination */
  eventBus?: unknown;
  /** Project context */
  context?: V2AgentContext;
}

/**
 * V2 Agent base interface (subset of N8nBaseAgent)
 * Note: V2 agents use context properties, not getter methods
 */
export interface V2AgentInstance {
  /** Agent context with type and status */
  context: {
    id: string;
    type: string;
    status: string;
    projectId?: string;
    environment?: string;
    metadata?: Record<string, unknown>;
  };
  /** Execute a task (agent-specific implementation) */
  execute?(task: unknown): Promise<unknown>;
  /** Test connection to n8n */
  testConnection?(): Promise<boolean>;
  /** Dispose agent resources */
  dispose?(): Promise<void>;
}

/**
 * Agent instance wrapper with v3 integration
 */
export interface N8nAgentInstance {
  type: N8nAgentType;
  id: string;
  agent: V2AgentInstance | null;
  capabilities: string[];
  primaryDomain: string;
  /** Whether the agent was successfully instantiated */
  isLive: boolean;
}

/**
 * Agent pool status
 */
export interface AgentPoolStatus {
  totalAgents: number;
  activeAgents: number;
  liveAgents: number;
  availableTypes: N8nAgentType[];
  byType: Record<string, number>;
}

/**
 * V2 createN8nAgent function signature
 */
type CreateN8nAgentFn = (
  type: N8nAgentType,
  options: {
    n8nConfig?: V2N8nAPIConfig;
    memoryStore?: unknown;
    eventBus?: unknown;
    context?: V2AgentContext;
  }
) => V2AgentInstance;

// ============================================================================
// Minimal MemoryStore Implementation (for V2 agent compatibility)
// ============================================================================

/**
 * Minimal in-memory store that satisfies V2 MemoryStore interface.
 * This allows agents to instantiate without requiring SwarmMemoryManager.
 * Learning features will be disabled, but basic agent functionality works.
 */
class MinimalMemoryStore {
  private data: Map<string, { value: unknown; expiresAt?: number }> = new Map();

  async store(key: string, value: unknown, ttl?: number): Promise<void> {
    const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
    this.data.set(key, { value, expiresAt });
  }

  async retrieve(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, namespace = 'default'): Promise<void> {
    await this.store(`${namespace}:${key}`, value);
  }

  async get(key: string, namespace = 'default'): Promise<unknown> {
    return this.retrieve(`${namespace}:${key}`);
  }

  async delete(key: string, namespace = 'default'): Promise<boolean> {
    return this.data.delete(`${namespace}:${key}`);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      for (const key of this.data.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          this.data.delete(key);
        }
      }
    } else {
      this.data.clear();
    }
  }
}

/**
 * Default memory store for agent creation
 */
let defaultMemoryStore: MinimalMemoryStore | null = null;

function getDefaultMemoryStore(): MinimalMemoryStore {
  if (!defaultMemoryStore) {
    defaultMemoryStore = new MinimalMemoryStore();
  }
  return defaultMemoryStore;
}

// ============================================================================
// V2 Module Resolution
// ============================================================================

/**
 * Find the path to compiled v2 n8n agents
 */
function findV2AgentsPath(): string | null {
  const possiblePaths = [
    // From dist/integrations/n8n/ (production)
    resolve(__dirname, '../../../dist/agents/n8n/index.js'),
    // From workspace root
    resolve(process.cwd(), 'dist/agents/n8n/index.js'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Cached v2 module
 */
let v2Module: {
  createN8nAgent: CreateN8nAgentFn;
  getAvailableN8nAgentTypes: () => N8nAgentType[];
} | null = null;

/**
 * Load the v2 n8n agents module
 */
async function loadV2Module(): Promise<typeof v2Module> {
  if (v2Module) {
    return v2Module;
  }

  const v2Path = findV2AgentsPath();
  if (!v2Path) {
    console.warn(
      '[N8nAgentFactory] V2 agents not found. Run `npm run build` in project root first.'
    );
    return null;
  }

  try {
    // Dynamic import of CommonJS module from ESM
    // The module will be imported as a namespace object
    const imported = await import(/* webpackIgnore: true */ v2Path);

    // Handle both ESM default export and CommonJS module.exports
    const mod = imported.default || imported;

    if (typeof mod.createN8nAgent !== 'function') {
      console.warn('[N8nAgentFactory] V2 module missing createN8nAgent function');
      return null;
    }

    v2Module = {
      createN8nAgent: mod.createN8nAgent,
      getAvailableN8nAgentTypes: mod.getAvailableN8nAgentTypes || (() => []),
    };

    return v2Module;
  } catch (error) {
    console.warn('[N8nAgentFactory] Failed to load v2 agents:', error);
    return null;
  }
}

// ============================================================================
// N8n Agent Factory
// ============================================================================

/**
 * N8n Agent Factory
 *
 * Creates and manages real n8n v2 agent instances with v3 domain integration.
 */
export class N8nAgentFactory {
  private config: N8nAgentFactoryConfig;
  private agentPool: Map<string, N8nAgentInstance>;
  private initialized: boolean = false;

  constructor(config: N8nAgentFactoryConfig = {}) {
    this.config = config;
    this.agentPool = new Map();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize the factory by loading v2 module
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return v2Module !== null;
    }

    await loadV2Module();
    this.initialized = true;
    return v2Module !== null;
  }

  /**
   * Check if v2 agents are available
   */
  isV2Available(): boolean {
    return v2Module !== null;
  }

  // ==========================================================================
  // Agent Creation
  // ==========================================================================

  /**
   * Create a real n8n agent instance
   */
  async createAgent(
    type: N8nAgentType,
    options?: Partial<N8nAgentFactoryConfig>
  ): Promise<N8nAgentInstance> {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }

    const mergedConfig = { ...this.config, ...options };
    const mapping = N8N_TO_V3_DOMAIN_MAP[type];

    // Create the instance shell
    const instance: N8nAgentInstance = {
      type,
      id: `n8n-${type}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      agent: null,
      capabilities: mapping?.capabilities || [],
      primaryDomain: mapping?.primaryDomain || 'test-execution',
      isLive: false,
    };

    // Try to create real v2 agent
    if (v2Module) {
      try {
        const agent = v2Module.createN8nAgent(type, {
          n8nConfig: mergedConfig.n8nConfig,
          // Use provided memoryStore or default minimal implementation
          // Note: Learning features require SwarmMemoryManager, but basic
          // agent functionality works with MinimalMemoryStore
          memoryStore: mergedConfig.memoryStore || getDefaultMemoryStore(),
          eventBus: mergedConfig.eventBus,
          context: mergedConfig.context || {
            projectId: 'v3-integration',
            environment: 'development',
          },
        });

        if (agent) {
          instance.agent = agent;
          instance.isLive = true;
        }
      } catch (error) {
        console.warn(`[N8nAgentFactory] Failed to create ${type} agent:`, error);
        // Instance remains with agent: null, isLive: false
      }
    }

    // Add to pool
    this.agentPool.set(instance.id, instance);

    return instance;
  }

  /**
   * Get or create an agent of a specific type
   */
  async getOrCreateAgent(
    type: N8nAgentType,
    options?: Partial<N8nAgentFactoryConfig>
  ): Promise<N8nAgentInstance> {
    // Check if we already have a live agent of this type
    for (const instance of this.agentPool.values()) {
      if (instance.type === type && instance.isLive) {
        return instance;
      }
    }

    // Create new agent
    return this.createAgent(type, options);
  }

  /**
   * Execute a task using an agent
   */
  async executeTask(
    type: N8nAgentType,
    task: unknown,
    options?: Partial<N8nAgentFactoryConfig>
  ): Promise<{ success: boolean; result?: unknown; error?: string; agentId: string }> {
    const instance = await this.getOrCreateAgent(type, options);

    if (!instance.isLive || !instance.agent) {
      return {
        success: false,
        error: `Agent ${type} is not live. V2 agents may not be built. Run 'npm run build' in project root.`,
        agentId: instance.id,
      };
    }

    // Check if agent has execute method
    if (typeof instance.agent.execute !== 'function') {
      return {
        success: false,
        error: `Agent ${type} does not have an execute method. Use agent-specific methods instead.`,
        agentId: instance.id,
      };
    }

    try {
      const result = await instance.agent.execute(task);
      return {
        success: true,
        result,
        agentId: instance.id,
      };
    } catch (error) {
      return {
        success: false,
        error: toErrorMessage(error),
        agentId: instance.id,
      };
    }
  }

  // ==========================================================================
  // Agent Pool Management
  // ==========================================================================

  /**
   * Get an agent instance by ID
   */
  getAgent(agentId: string): N8nAgentInstance | undefined {
    return this.agentPool.get(agentId);
  }

  /**
   * Get all agents of a specific type
   */
  getAgentsByType(type: N8nAgentType): N8nAgentInstance[] {
    const agents: N8nAgentInstance[] = [];
    for (const instance of this.agentPool.values()) {
      if (instance.type === type) {
        agents.push(instance);
      }
    }
    return agents;
  }

  /**
   * Get all agents for a specific domain
   */
  getAgentsByDomain(domain: string): N8nAgentInstance[] {
    const agents: N8nAgentInstance[] = [];
    for (const instance of this.agentPool.values()) {
      if (instance.primaryDomain === domain) {
        agents.push(instance);
      }
    }
    return agents;
  }

  /**
   * Remove an agent from the pool
   */
  async removeAgent(agentId: string): Promise<boolean> {
    const instance = this.agentPool.get(agentId);
    if (instance?.agent?.dispose) {
      try {
        await instance.agent.dispose();
      } catch (error) {
        // Non-critical: agent dispose errors during removal
        console.debug('[N8NAgentFactory] Agent dispose error:', error instanceof Error ? error.message : error);
      }
    }
    return this.agentPool.delete(agentId);
  }

  /**
   * Clear all agents from the pool
   */
  async clearPool(): Promise<void> {
    for (const instance of this.agentPool.values()) {
      if (instance.agent?.dispose) {
        try {
          await instance.agent.dispose();
        } catch (error) {
          // Non-critical: agent dispose errors during pool clear
          console.debug('[N8NAgentFactory] Agent dispose error during clear:', error instanceof Error ? error.message : error);
        }
      }
    }
    this.agentPool.clear();
  }

  /**
   * Get pool status
   */
  getPoolStatus(): AgentPoolStatus {
    const byType: Record<string, number> = {};
    const types = new Set<N8nAgentType>();
    let liveCount = 0;

    for (const instance of this.agentPool.values()) {
      types.add(instance.type);
      byType[instance.type] = (byType[instance.type] || 0) + 1;
      if (instance.isLive) {
        liveCount++;
      }
    }

    return {
      totalAgents: this.agentPool.size,
      activeAgents: this.agentPool.size,
      liveAgents: liveCount,
      availableTypes: Array.from(types),
      byType,
    };
  }

  // ==========================================================================
  // Available Agent Types
  // ==========================================================================

  /**
   * Get all available n8n agent types
   */
  getAvailableTypes(): N8nAgentType[] {
    return Object.keys(N8N_TO_V3_DOMAIN_MAP) as N8nAgentType[];
  }

  /**
   * Check if an agent type is supported
   */
  isTypeSupported(type: string): type is N8nAgentType {
    return type in N8N_TO_V3_DOMAIN_MAP;
  }

  /**
   * Get agent type metadata
   */
  getTypeMetadata(type: N8nAgentType): {
    capabilities: string[];
    primaryDomain: string;
    description: string;
  } | null {
    const mapping = N8N_TO_V3_DOMAIN_MAP[type];
    if (!mapping) return null;

    return {
      capabilities: mapping.capabilities,
      primaryDomain: mapping.primaryDomain,
      description: mapping.description,
    };
  }

  // ==========================================================================
  // V3 Domain Registration
  // ==========================================================================

  /**
   * Register agents with a v3 agent pool
   */
  async registerWithV3Pool(pool: {
    registerAgent: (type: string, factory: () => Promise<unknown>) => void;
  }): Promise<number> {
    let registered = 0;

    for (const type of this.getAvailableTypes()) {
      pool.registerAgent(`n8n-${type}`, async () => {
        const instance = await this.createAgent(type);
        return instance.agent;
      });
      registered++;
    }

    return registered;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new agent factory
 */
export function createAgentFactory(
  config?: N8nAgentFactoryConfig
): N8nAgentFactory {
  return new N8nAgentFactory(config);
}

/**
 * Singleton instance
 */
let defaultFactory: N8nAgentFactory | null = null;

/**
 * Get the default factory instance
 */
export function getDefaultFactory(): N8nAgentFactory {
  if (!defaultFactory) {
    defaultFactory = createAgentFactory();
  }
  return defaultFactory;
}

/**
 * Reset the default factory
 */
export function resetDefaultFactory(): void {
  if (defaultFactory) {
    defaultFactory.clearPool().catch(() => {});
  }
  defaultFactory = null;
}

/**
 * Reset the v2 module cache (for testing)
 */
export function resetV2ModuleCache(): void {
  v2Module = null;
}

/**
 * Reset the default memory store (for testing)
 */
export function resetDefaultMemoryStore(): void {
  defaultMemoryStore = null;
}
