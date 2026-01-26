/**
 * Agentic QE v3 - Kernel Interfaces
 * Core interfaces for the microkernel architecture
 */

import {
  DomainName,
  DomainEvent,
  EventHandler,
  Result,
  AgentStatus,
  Disposable,
  Initializable,
  Priority,
} from '../shared/types';

// ============================================================================
// Domain Plugin Interface
// ============================================================================

export interface DomainPlugin extends Initializable, Disposable {
  /** Unique domain identifier */
  readonly name: DomainName;

  /** Domain version */
  readonly version: string;

  /** Domain dependencies */
  readonly dependencies: DomainName[];

  /** Check if domain is ready */
  isReady(): boolean;

  /** Get domain health status */
  getHealth(): DomainHealth;

  /** Handle incoming domain events */
  handleEvent(event: DomainEvent): Promise<void>;

  /** Get domain's public API */
  getAPI<T>(): T;

  /**
   * Execute a task assigned by Queen Coordinator
   * Optional - domains without this method use event-based fallback
   * @param request - Task execution request from Queen
   * @param onComplete - Callback to report completion/failure
   * @returns Result indicating whether task was accepted for execution
   */
  executeTask?(
    request: DomainTaskRequest,
    onComplete: TaskCompletionCallback
  ): Promise<Result<void, Error>>;

  /**
   * Check if domain can handle a specific task type
   * Optional - domains without this method are assumed to handle all assigned tasks
   * @param taskType - The type of task to check
   * @returns true if domain can handle the task type
   */
  canHandleTask?(taskType: string): boolean;
}

export interface DomainHealth {
  /**
   * Domain health status:
   * - 'healthy': Active agents processing tasks
   * - 'idle': No agents spawned (normal for ephemeral agent model)
   * - 'degraded': Some agents failing or reduced capacity
   * - 'unhealthy': Critical failures
   */
  status: 'healthy' | 'idle' | 'degraded' | 'unhealthy';
  agents: {
    total: number;
    active: number;
    idle: number;
    failed: number;
  };
  lastActivity?: Date;
  errors: string[];
}

// ============================================================================
// Domain Task Execution Contract (Queen-Domain Integration)
// ============================================================================

/**
 * Task execution request from Queen to Domain
 * Represents a task that the Queen assigns to a domain for execution
 */
export interface DomainTaskRequest {
  /** Unique task identifier */
  readonly taskId: string;
  /** Type of task (e.g., 'execute-tests', 'generate-tests') */
  readonly taskType: string;
  /** Task-specific data */
  readonly payload: Record<string, unknown>;
  /** Task priority level */
  readonly priority: Priority;
  /** Timeout in milliseconds */
  readonly timeout: number;
  /** Correlation ID for tracing */
  readonly correlationId?: string;
}

/**
 * Task execution result from Domain to Queen
 * Reported via callback when task completes or fails
 */
export interface DomainTaskResult {
  /** Task identifier */
  readonly taskId: string;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Result data if successful */
  readonly data?: unknown;
  /** Error message if failed */
  readonly error?: string;
  /** Duration in milliseconds */
  readonly duration: number;
}

/**
 * Callback for domains to report task completion to Queen
 */
export type TaskCompletionCallback = (result: DomainTaskResult) => Promise<void>;

// ============================================================================
// Event Bus Interface
// ============================================================================

export interface EventBus extends Disposable {
  /** Publish an event to all subscribers */
  publish<T>(event: DomainEvent<T>): Promise<void>;

  /** Subscribe to events of a specific type */
  subscribe<T>(eventType: string, handler: EventHandler<T>): Subscription;

  /** Subscribe to all events from a domain */
  subscribeToChannel(domain: DomainName, handler: EventHandler): Subscription;

  /** Get event history (for replay) */
  getHistory(filter?: EventFilter): Promise<DomainEvent[]>;
}

export interface Subscription {
  unsubscribe(): void;
  readonly active: boolean;
}

export interface EventFilter {
  eventTypes?: string[];
  sources?: DomainName[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  correlationId?: string;
  limit?: number;
}

// ============================================================================
// Agent Coordinator Interface
// ============================================================================

export interface AgentCoordinator extends Disposable {
  /** Spawn a new agent */
  spawn(config: AgentSpawnConfig): Promise<Result<string, Error>>;

  /** Get agent status */
  getStatus(agentId: string): AgentStatus | undefined;

  /** List all agents */
  listAgents(filter?: AgentFilter): AgentInfo[];

  /** Stop an agent */
  stop(agentId: string): Promise<Result<void, Error>>;

  /** Get current agent count */
  getActiveCount(): number;

  /** Check if can spawn more agents */
  canSpawn(): boolean;
}

export interface AgentSpawnConfig {
  name: string;
  domain: DomainName;
  type: string;
  capabilities: string[];
  config?: Record<string, unknown>;
}

export interface AgentFilter {
  domain?: DomainName;
  status?: AgentStatus;
  type?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  domain: DomainName;
  type: string;
  status: AgentStatus;
  startedAt?: Date;
}

// ============================================================================
// Plugin Loader Interface
// ============================================================================

export interface PluginLoader {
  /** Load a domain plugin */
  load(domain: DomainName): Promise<DomainPlugin>;

  /** Unload a domain plugin */
  unload(domain: DomainName): Promise<void>;

  /** Check if domain is loaded */
  isLoaded(domain: DomainName): boolean;

  /** Get loaded domains */
  getLoaded(): DomainName[];

  /** Load all domains */
  loadAll(): Promise<void>;
}

// ============================================================================
// Memory Backend Interface
// ============================================================================

export interface MemoryBackend extends Initializable, Disposable {
  /** Store a value */
  set<T>(key: string, value: T, options?: StoreOptions): Promise<void>;

  /** Retrieve a value */
  get<T>(key: string): Promise<T | undefined>;

  /** Delete a value */
  delete(key: string): Promise<boolean>;

  /** Check if key exists */
  has(key: string): Promise<boolean>;

  /** Search by pattern */
  search(pattern: string, limit?: number): Promise<string[]>;

  /** Vector similarity search (HNSW) */
  vectorSearch(embedding: number[], k: number): Promise<VectorSearchResult[]>;

  /** Store vector embedding */
  storeVector(key: string, embedding: number[], metadata?: unknown): Promise<void>;

  /**
   * Count entries in a namespace
   * @param namespace - The namespace to count entries for
   * @returns The number of entries in the namespace
   */
  count(namespace: string): Promise<number>;

  /**
   * Check if code intelligence index exists
   * Returns true if code-intelligence:kg namespace has entries
   * @returns True if the code intelligence knowledge graph has been indexed
   */
  hasCodeIntelligenceIndex(): Promise<boolean>;
}

export interface StoreOptions {
  ttl?: number;
  namespace?: string;
  persist?: boolean;
}

export interface VectorSearchResult {
  key: string;
  score: number;
  metadata?: unknown;
}

// ============================================================================
// Kernel Interface
// ============================================================================

export interface QEKernel extends Initializable, Disposable {
  /** Get the event bus */
  readonly eventBus: EventBus;

  /** Get the agent coordinator */
  readonly coordinator: AgentCoordinator;

  /** Get the plugin loader */
  readonly plugins: PluginLoader;

  /** Get the memory backend */
  readonly memory: MemoryBackend;

  /** Get a domain's API (synchronous, returns undefined if not loaded) */
  getDomainAPI<T>(domain: DomainName): T | undefined;

  /** Get a domain's API with lazy loading support */
  getDomainAPIAsync?<T>(domain: DomainName): Promise<T | undefined>;

  /** Ensure a domain is loaded */
  ensureDomainLoaded?(domain: DomainName): Promise<boolean>;

  /** Check if a domain is currently loaded */
  isDomainLoaded?(domain: DomainName): boolean;

  /** Get list of loaded domains */
  getLoadedDomains?(): DomainName[];

  /** Get list of enabled but not yet loaded domains */
  getPendingDomains?(): DomainName[];

  /** Get kernel health */
  getHealth(): KernelHealth;

  /** Get kernel configuration */
  getConfig(): KernelConfig;
}

export interface KernelHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  domains: Record<DomainName, DomainHealth>;
  agents: {
    total: number;
    active: number;
    maxAllowed: number;
  };
  memory: {
    used: number;
    available: number;
  };
}

export interface KernelConfig {
  maxConcurrentAgents: number;
  memoryBackend: 'sqlite' | 'agentdb' | 'hybrid' | 'memory';
  hnswEnabled: boolean;
  lazyLoading: boolean;
  enabledDomains: DomainName[];
  /** Data directory for persistent storage (default: .agentic-qe relative to project root) */
  dataDir?: string;
}
