/**
 * Browser Agent Type Definitions
 *
 * WASM-compatible type definitions for browser-based QE agents.
 * These types mirror the Node.js BaseAgent types but remove all Node.js dependencies.
 *
 * Phase 0: @ruvector/edge integration
 * Target: Chrome 87+, Firefox 89+, Safari 15+
 * Bundle size contribution target: <100KB
 *
 * @module edge/types/browser-agent.types
 */

// ============================================
// Agent Identity & Status
// ============================================

/**
 * Browser-compatible QE Agent types
 * Subset of QEAgentType that can run in browser
 */
export enum BrowserAgentType {
  TEST_GENERATOR = 'test-generator',
  COVERAGE_ANALYZER = 'coverage-analyzer',
  QUALITY_ANALYZER = 'quality-analyzer',
  QUALITY_GATE = 'quality-gate',
  CODE_INTELLIGENCE = 'code-intelligence',
}

/**
 * Agent identifier for browser agents
 */
export interface BrowserAgentId {
  id: string;
  type: BrowserAgentType;
  created: number; // Unix timestamp (Date not used for WASM compat)
}

/**
 * Agent status enum - browser compatible
 */
export enum BrowserAgentStatus {
  INITIALIZING = 'initializing',
  IDLE = 'idle',
  ACTIVE = 'active',
  BUSY = 'busy',
  ERROR = 'error',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  TERMINATED = 'terminated',
}

/**
 * Agent capability definition
 */
export interface BrowserAgentCapability {
  name: string;
  version: string;
  description: string;
  parameters?: Record<string, unknown>;
}

// ============================================
// Task Management
// ============================================

/**
 * Browser-compatible task definition
 */
export interface BrowserTask {
  id: string;
  type: string;
  payload: unknown;
  priority: number;
  status: string;
  result?: unknown;
  error?: string;
  description?: string;
  context?: Record<string, unknown>;
  requirements?: {
    capabilities?: string[];
    resources?: Record<string, unknown>;
  };
}

/**
 * Task assignment for browser agents
 */
export interface BrowserTaskAssignment {
  id: string;
  task: BrowserTask;
  agentId: string;
  assignedAt: number; // Unix timestamp
  status: 'assigned' | 'in_progress' | 'completed' | 'failed';
}

/**
 * Task result from browser agent execution
 */
export interface BrowserTaskResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  metadata?: Record<string, unknown>;
}

// ============================================
// Memory & Storage (Browser APIs)
// ============================================

/**
 * Browser-compatible memory store interface
 * Uses IndexedDB or localStorage under the hood
 */
export interface BrowserMemoryStore {
  /**
   * Store a value with optional TTL
   */
  store(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * Retrieve a value by key
   */
  retrieve(key: string): Promise<unknown>;

  /**
   * Set with namespace support
   */
  set(key: string, value: unknown, namespace?: string): Promise<void>;

  /**
   * Get with namespace support
   */
  get(key: string, namespace?: string): Promise<unknown>;

  /**
   * Delete a key
   */
  delete(key: string, namespace?: string): Promise<boolean>;

  /**
   * Clear all data in namespace
   */
  clear(namespace?: string): Promise<void>;
}

/**
 * Memory record for browser storage
 */
export interface BrowserMemoryRecord {
  key: string;
  value: unknown;
  namespace: string;
  ttl?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

// ============================================
// Events & Coordination
// ============================================

/**
 * Browser-compatible event interface
 * Uses BroadcastChannel API or postMessage
 */
export interface BrowserAgentEvent {
  id: string;
  type: string;
  source: BrowserAgentId;
  target?: BrowserAgentId;
  data: unknown;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scope: 'local' | 'global';
}

/**
 * Event handler type
 */
export type BrowserEventHandler<T = unknown> = (event: BrowserAgentEvent & { data: T }) => void | Promise<void>;

/**
 * Event handler registration
 */
export interface BrowserEventHandlerRegistration<T = unknown> {
  eventType: string;
  handler: BrowserEventHandler<T>;
  once?: boolean;
}

/**
 * Browser event emitter interface (minimal EventEmitter replacement)
 */
export interface BrowserEventEmitter {
  on(event: string, handler: BrowserEventHandler): void;
  off(event: string, handler: BrowserEventHandler): void;
  once(event: string, handler: BrowserEventHandler): void;
  emit(event: string, data: unknown): void;
  removeAllListeners(event?: string): void;
}

// ============================================
// Agent Messages
// ============================================

/**
 * Message types for inter-agent communication
 */
export enum BrowserMessageType {
  COMMAND = 'command',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  REQUEST = 'request',
}

/**
 * Browser agent message
 */
export interface BrowserAgentMessage {
  id: string;
  type: BrowserMessageType;
  from: BrowserAgentId;
  to: BrowserAgentId;
  payload: unknown;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================
// LLM Integration (Browser-Compatible)
// ============================================

/**
 * Browser-compatible LLM completion options
 * Works with WebLLM or remote API calls via fetch
 */
export interface BrowserLLMCompletionOptions {
  model?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * LLM completion response
 */
export interface BrowserLLMCompletionResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Browser-compatible LLM provider interface
 */
export interface IBrowserLLMProvider {
  initialize(): Promise<void>;
  complete(options: BrowserLLMCompletionOptions): Promise<BrowserLLMCompletionResponse>;
  embed?(options: { text: string }): Promise<{ embedding: number[] }>;
  shutdown(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

// ============================================
// Vector Search (WASM-Compatible)
// ============================================

/**
 * Vector search options for browser HNSW
 */
export interface BrowserVectorSearchOptions {
  k: number;
  threshold?: number;
  filter?: Record<string, unknown>;
  useMMR?: boolean;
  diversityWeight?: number;
}

/**
 * Vector search result
 */
export interface BrowserVectorSearchResult<T = unknown> {
  id: string;
  score: number;
  data: T;
  metadata?: Record<string, unknown>;
}

/**
 * Browser-compatible vector index interface
 * Uses @ruvector/edge WasmHnswIndex
 */
export interface IBrowserVectorIndex {
  initialize(): Promise<void>;
  add(id: string, vector: Float32Array, metadata?: Record<string, unknown>): Promise<void>;
  search(vector: Float32Array, options: BrowserVectorSearchOptions): Promise<BrowserVectorSearchResult[]>;
  delete(id: string): Promise<boolean>;
  count(): number;
  clear(): Promise<void>;
}

// ============================================
// Crypto (WASM-Compatible)
// ============================================

/**
 * Browser-compatible crypto interface
 * Uses @ruvector/edge WasmCrypto or Web Crypto API
 */
export interface IBrowserCrypto {
  /**
   * Generate random bytes
   */
  randomBytes(length: number): Uint8Array;

  /**
   * Generate random UUID
   */
  randomUUID(): string;

  /**
   * Generate random integer in range [min, max)
   */
  randomInt(min: number, max: number): number;

  /**
   * Generate random float in range [0, 1)
   */
  randomFloat(): number;

  /**
   * Hash data with SHA-256
   */
  sha256(data: Uint8Array | string): Promise<Uint8Array>;

  /**
   * Generate hex ID
   */
  generateId(length?: number): string;
}

// ============================================
// Agent Configuration
// ============================================

/**
 * Browser agent configuration
 */
export interface BrowserAgentConfig {
  id?: string;
  type: BrowserAgentType;
  capabilities?: BrowserAgentCapability[];
  context?: BrowserAgentContext;
  memoryStore: BrowserMemoryStore;
  eventBus?: BrowserEventEmitter;
  enableLearning?: boolean;
  llm?: BrowserLLMConfig;
  vectorIndex?: IBrowserVectorIndex;
}

/**
 * Browser agent context
 */
export interface BrowserAgentContext {
  id: string;
  type: string;
  status: BrowserAgentStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Browser LLM configuration
 */
export interface BrowserLLMConfig {
  enabled?: boolean;
  provider?: IBrowserLLMProvider;
  defaultModel?: string;
  enableCache?: boolean;
}

// ============================================
// Performance Metrics
// ============================================

/**
 * Agent performance metrics
 */
export interface BrowserAgentMetrics {
  tasksCompleted: number;
  averageExecutionTime: number;
  errorCount: number;
  lastActivity: number;
  memoryUsage?: number;
  cacheHitRate?: number;
}

/**
 * Agent status response
 */
export interface BrowserAgentStatusResponse {
  agentId: BrowserAgentId;
  status: BrowserAgentStatus;
  currentTask?: string;
  capabilities: string[];
  performanceMetrics: BrowserAgentMetrics;
}

// ============================================
// Lifecycle Hooks
// ============================================

/**
 * Pre-task hook data
 */
export interface BrowserPreTaskData {
  assignment: BrowserTaskAssignment;
  context?: Record<string, unknown>;
}

/**
 * Post-task hook data
 */
export interface BrowserPostTaskData {
  assignment: BrowserTaskAssignment;
  result: unknown;
  duration: number;
}

/**
 * Task error hook data
 */
export interface BrowserTaskErrorData {
  assignment: BrowserTaskAssignment;
  error: string;
  stack?: string;
}

// ============================================
// Strategy Interfaces (Browser-Compatible)
// ============================================

/**
 * Lifecycle strategy interface for browser agents
 */
export interface BrowserLifecycleStrategy {
  getStatus(): BrowserAgentStatus;
  transitionTo(status: BrowserAgentStatus, reason?: string): Promise<void>;
  onPreTask?(data: BrowserPreTaskData): Promise<void>;
  onPostTask?(data: BrowserPostTaskData): Promise<void>;
  onTaskError?(data: BrowserTaskErrorData): Promise<void>;
  waitForStatus?(status: BrowserAgentStatus, timeout?: number): Promise<void>;
  waitForReady?(timeout?: number): Promise<void>;
}

/**
 * Memory strategy interface for browser agents
 */
export interface BrowserMemoryStrategy {
  store(key: string, value: unknown, options?: { ttl?: number; namespace?: string }): Promise<void>;
  retrieve(key: string): Promise<unknown>;
  storeShared(agentType: string, key: string, value: unknown, options?: { ttl?: number }): Promise<void>;
  retrieveShared(agentType: string, key: string): Promise<unknown>;
}

/**
 * Learning strategy interface for browser agents
 */
export interface BrowserLearningStrategy {
  isEnabled(): boolean;
  recordExecution(event: {
    task: BrowserTask;
    result?: unknown;
    error?: string;
    success: boolean;
    duration: number;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  recommendStrategy?(taskState: Record<string, unknown>): Promise<{
    strategy: string;
    confidence: number;
    reasoning: string;
  } | null>;
}

/**
 * Coordination strategy interface for browser agents
 */
export interface BrowserCoordinationStrategy {
  emitEvent(type: string, data: unknown): void;
  registerHandler(type: string, handler: BrowserEventHandler): void;
  unregisterHandler(type: string, handler: BrowserEventHandler): void;
  broadcast(message: BrowserAgentMessage): Promise<void>;
}

// ============================================
// Error Types
// ============================================

/**
 * Browser agent error
 */
export class BrowserAgentError extends Error {
  constructor(
    message: string,
    public readonly code: 'INITIALIZATION_FAILED' | 'TASK_FAILED' | 'MEMORY_ERROR' | 'LLM_ERROR' | 'VALIDATION_ERROR',
    public readonly retryable: boolean = false,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'BrowserAgentError';
  }
}

/**
 * Type guard for BrowserAgentError
 */
export function isBrowserAgentError(error: unknown): error is BrowserAgentError {
  return error instanceof BrowserAgentError;
}

// ============================================
// Export Utilities
// ============================================

/**
 * Generate browser-compatible agent ID
 */
export function generateBrowserAgentId(type: BrowserAgentType, crypto: IBrowserCrypto): BrowserAgentId {
  return {
    id: `${type}-${Date.now()}-${crypto.generateId(5)}`,
    type,
    created: Date.now(),
  };
}

/**
 * Generate browser-compatible event ID
 */
export function generateBrowserEventId(crypto: IBrowserCrypto): string {
  return `event-${Date.now()}-${crypto.generateId(5)}`;
}

/**
 * Generate browser-compatible message ID
 */
export function generateBrowserMessageId(crypto: IBrowserCrypto): string {
  return `msg-${Date.now()}-${crypto.generateId(5)}`;
}

/**
 * Generate browser-compatible task ID
 */
export function generateBrowserTaskId(crypto: IBrowserCrypto): string {
  return `task-${Date.now()}-${crypto.generateId(5)}`;
}
