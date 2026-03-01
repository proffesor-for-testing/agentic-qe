/**
 * Agentic QE v3 - Shared Plugin Test Utilities
 *
 * Provides mock implementations and test helpers for domain plugin unit tests.
 * This enables consistent testing across all 12 domain plugins.
 */

import { vi } from 'vitest';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
  AgentFilter,
  AgentInfo,
  Subscription,
  StoreOptions,
  VectorSearchResult,
  DomainTaskRequest,
  DomainTaskResult,
  TaskCompletionCallback,
  DomainHealth,
  EventFilter,
} from '../../../src/kernel/interfaces';
import type { DomainName, DomainEvent, Result, AgentStatus } from '../../../src/shared/types';
import { ok, err } from '../../../src/shared/types';

// ============================================================================
// Mock EventBus Implementation
// ============================================================================

/**
 * Mock EventBus for plugin testing
 * Captures published events and allows test verification
 */
export class MockEventBus implements EventBus {
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  private channelHandlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();
  public publishedEvents: DomainEvent[] = [];

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);

    // Notify type handlers
    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      const handlersArray = Array.from(typeHandlers);
      for (const handler of handlersArray) {
        await handler(event);
      }
    }

    // Notify wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      const handlersArray = Array.from(wildcardHandlers);
      for (const handler of handlersArray) {
        await handler(event);
      }
    }

    // Notify channel handlers
    const channelHandlers = this.channelHandlers.get(event.source);
    if (channelHandlers) {
      const handlersArray = Array.from(channelHandlers);
      for (const handler of handlersArray) {
        await handler(event);
      }
    }
  }

  subscribe<T>(
    eventType: string,
    handler: (event: DomainEvent<T>) => Promise<void>
  ): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);

    return {
      unsubscribe: () => {
        this.handlers.get(eventType)?.delete(handler as (event: DomainEvent) => Promise<void>);
      },
      active: true,
    };
  }

  subscribeToChannel(
    domain: DomainName,
    handler: (event: DomainEvent) => Promise<void>
  ): Subscription {
    if (!this.channelHandlers.has(domain)) {
      this.channelHandlers.set(domain, new Set());
    }
    this.channelHandlers.get(domain)!.add(handler);

    return {
      unsubscribe: () => {
        this.channelHandlers.get(domain)?.delete(handler);
      },
      active: true,
    };
  }

  async getHistory(_filter?: EventFilter): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
    this.channelHandlers.clear();
    this.publishedEvents = [];
  }

  /**
   * Clear all published events (useful between tests)
   */
  clearEvents(): void {
    this.publishedEvents = [];
  }

  /**
   * Find events of a specific type
   */
  findEvents(type: string): DomainEvent[] {
    return this.publishedEvents.filter(e => e.type === type);
  }

  /**
   * Check if an event type was published
   */
  hasPublished(type: string): boolean {
    return this.publishedEvents.some(e => e.type === type);
  }
}

// ============================================================================
// Mock MemoryBackend Implementation
// ============================================================================

/**
 * Mock MemoryBackend for plugin testing
 * Provides in-memory storage with pattern searching
 */
export class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();
  private vectors = new Map<string, { embedding: number[]; metadata: unknown }>();

  async initialize(): Promise<void> {}

  async dispose(): Promise<void> {
    this.store.clear();
    this.vectors.clear();
  }

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(key: string, embedding: number[], metadata?: unknown): Promise<void> {
    this.vectors.set(key, { embedding, metadata });
  }

  async count(namespace: string): Promise<number> {
    const keys = Array.from(this.store.keys());
    return keys.filter(k => k.startsWith(namespace)).length;
  }

  async hasCodeIntelligenceIndex(): Promise<boolean> {
    const count = await this.count('code-intelligence:kg');
    return count > 0;
  }

  /**
   * Get all stored keys (useful for verification)
   */
  getKeys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Clear all stored data (useful between tests)
   */
  clear(): void {
    this.store.clear();
    this.vectors.clear();
  }

  /**
   * Get the number of stored items
   */
  size(): number {
    return this.store.size;
  }
}

// ============================================================================
// Mock AgentCoordinator Implementation
// ============================================================================

/**
 * Mock AgentCoordinator for plugin testing
 * Simulates agent spawning and lifecycle management
 */
export class MockAgentCoordinator implements AgentCoordinator {
  private agents = new Map<string, AgentInfo>();
  private maxAgents: number;
  private agentCounter = 0;
  public spawnCalls: AgentSpawnConfig[] = [];

  constructor(maxAgents = 15) {
    this.maxAgents = maxAgents;
  }

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    this.spawnCalls.push(config);

    if (this.agents.size >= this.maxAgents) {
      return err(new Error(`Maximum concurrent agents (${this.maxAgents}) reached`));
    }

    const id = `agent_${++this.agentCounter}`;
    this.agents.set(id, {
      id,
      name: config.name,
      domain: config.domain,
      type: config.type,
      status: 'running',
      startedAt: new Date(),
    });

    return ok(id);
  }

  getStatus(agentId: string): AgentStatus | undefined {
    return this.agents.get(agentId)?.status;
  }

  listAgents(filter?: AgentFilter): AgentInfo[] {
    let agents = Array.from(this.agents.values());

    if (filter) {
      if (filter.domain) {
        agents = agents.filter(a => a.domain === filter.domain);
      }
      if (filter.status) {
        agents = agents.filter(a => a.status === filter.status);
      }
      if (filter.type) {
        agents = agents.filter(a => a.type === filter.type);
      }
    }

    return agents;
  }

  async stop(agentId: string): Promise<Result<void, Error>> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return err(new Error(`Agent ${agentId} not found`));
    }

    agent.status = 'completed';
    return ok(undefined);
  }

  getActiveCount(): number {
    let count = 0;
    const agents = Array.from(this.agents.values());
    for (const agent of agents) {
      if (agent.status === 'running') {
        count++;
      }
    }
    return count;
  }

  canSpawn(): boolean {
    return this.agents.size < this.maxAgents;
  }

  async terminateAll(): Promise<void> {
    const agents = Array.from(this.agents.values());
    for (const agent of agents) {
      agent.status = 'completed';
    }
  }

  async dispose(): Promise<void> {
    await this.terminateAll();
    this.agents.clear();
  }

  /**
   * Set an agent's status (for testing)
   */
  setAgentStatus(agentId: string, status: AgentStatus): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
    }
  }

  /**
   * Clear all agents (useful between tests)
   */
  clear(): void {
    this.agents.clear();
    this.spawnCalls = [];
    this.agentCounter = 0;
  }
}

// ============================================================================
// Task Execution Test Helpers
// ============================================================================

/**
 * Create a mock task request for testing executeTask
 */
export function createMockTaskRequest(
  taskType: string,
  payload: Record<string, unknown> = {},
  priority: 'p0' | 'p1' | 'p2' | 'p3' = 'p1'
): DomainTaskRequest {
  return {
    taskId: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    taskType,
    payload,
    priority,
    timeout: 30000,
  };
}

/**
 * Create a mock task completion callback for testing
 */
export function createMockCallback(): {
  callback: TaskCompletionCallback;
  results: DomainTaskResult[];
  waitForResult: () => Promise<DomainTaskResult>;
} {
  const results: DomainTaskResult[] = [];
  let resolve: ((result: DomainTaskResult) => void) | null = null;
  const promise = new Promise<DomainTaskResult>((r) => {
    resolve = r;
  });

  const callback: TaskCompletionCallback = async (result: DomainTaskResult) => {
    results.push(result);
    if (resolve) {
      resolve(result);
    }
  };

  return {
    callback,
    results,
    waitForResult: () => promise,
  };
}

// ============================================================================
// Event Creation Helpers
// ============================================================================

/**
 * Create a mock domain event for testing event handling
 */
export function createMockEvent<T>(
  type: string,
  source: DomainName,
  payload: T
): DomainEvent<T> {
  return {
    id: `event_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    type,
    timestamp: new Date(),
    source,
    payload,
  };
}

// ============================================================================
// Health Verification Helpers
// ============================================================================

/**
 * Verify that health status matches expected values
 */
export function verifyHealth(
  health: DomainHealth,
  expected: Partial<DomainHealth>
): void {
  if (expected.status !== undefined) {
    expect(health.status).toBe(expected.status);
  }
  if (expected.agents !== undefined) {
    expect(health.agents).toMatchObject(expected.agents);
  }
  if (expected.errors !== undefined) {
    expect(health.errors).toEqual(expected.errors);
  }
  if (expected.lastActivity !== undefined) {
    expect(health.lastActivity).toBeInstanceOf(Date);
  }
}

/**
 * Verify plugin is in initial idle state
 */
export function verifyIdleHealth(health: DomainHealth): void {
  expect(health.status).toBe('idle');
  expect(health.agents.total).toBe(0);
  expect(health.agents.active).toBe(0);
  expect(health.agents.idle).toBe(0);
  expect(health.agents.failed).toBe(0);
  expect(health.errors).toEqual([]);
}

// ============================================================================
// Lifecycle Test Helpers
// ============================================================================

/**
 * Test plugin lifecycle (initialize -> operations -> dispose)
 */
export async function testPluginLifecycle(
  createPlugin: () => {
    initialize: () => Promise<void>;
    dispose: () => Promise<void>;
    isReady: () => boolean;
    getHealth: () => DomainHealth;
  }
): Promise<void> {
  const plugin = createPlugin();

  // Initially not ready
  expect(plugin.isReady()).toBe(false);

  // Initialize
  await plugin.initialize();
  expect(plugin.isReady()).toBe(true);

  // Health should be idle after init
  const health = plugin.getHealth();
  expect(health.status).toBe('idle');

  // Dispose
  await plugin.dispose();
  expect(plugin.isReady()).toBe(false);
}

// ============================================================================
// Sample Task Generators for Each Domain
// ============================================================================

export const sampleTasks = {
  // Test Generation domain tasks
  testGeneration: {
    generateTests: createMockTaskRequest('generate-tests', {
      sourceFiles: ['src/services/user.ts', 'src/utils/helpers.ts'],
      testType: 'unit',
      framework: 'vitest',
      coverageTarget: 80,
    }),
    generateTddTests: createMockTaskRequest('generate-tdd-tests', {
      feature: 'User Authentication',
      behavior: 'Should validate user credentials',
      framework: 'vitest',
      phase: 'red',
    }),
    generatePropertyTests: createMockTaskRequest('generate-property-tests', {
      function: 'validateEmail',
      properties: ['idempotent', 'handles-nulls', 'preserves-format'],
    }),
    generateTestData: createMockTaskRequest('generate-test-data', {
      schema: { type: 'object', properties: { name: { type: 'string' } } },
      count: 10,
    }),
  },

  // Test Execution domain tasks
  testExecution: {
    executeTests: createMockTaskRequest('execute-tests', {
      testFiles: ['tests/unit/user.test.ts'],
      parallel: true,
      retryCount: 2,
    }),
    detectFlaky: createMockTaskRequest('detect-flaky', {
      testFiles: ['tests/unit/user.test.ts'],
      runs: 5,
      threshold: 0.1,
    }),
    retryTests: createMockTaskRequest('retry-tests', {
      runId: 'run_123',
      failedTests: ['test1', 'test2'],
      maxRetries: 3,
    }),
  },

  // Coverage Analysis domain tasks
  coverageAnalysis: {
    analyzeCoverage: createMockTaskRequest('analyze-coverage', {
      coverageData: {
        totalLines: 1000,
        coveredLines: 800,
        files: [{ file: 'src/index.ts', coverage: 90 }],
      },
      threshold: 80,
    }),
    detectGaps: createMockTaskRequest('detect-gaps', {
      coverageData: { files: [] },
      minCoverage: 80,
      prioritize: 'risk',
    }),
    calculateRisk: createMockTaskRequest('calculate-risk', {
      file: 'src/critical.ts',
      uncoveredLines: [10, 11, 12],
    }),
  },

  // Quality Assessment domain tasks
  qualityAssessment: {
    evaluateGate: createMockTaskRequest('evaluate-gate', {
      gateName: 'release-gate',
      metrics: {
        coverage: 85,
        testsPassing: 100,
        criticalBugs: 0,
      },
      thresholds: {
        coverage: { min: 80 },
        testsPassing: { min: 95 },
      },
    }),
    analyzeQuality: createMockTaskRequest('analyze-quality', {
      sourceFiles: ['src/index.ts'],
      includeMetrics: ['coverage', 'complexity'],
    }),
    deploymentAdvice: createMockTaskRequest('deployment-advice', {
      releaseCandidate: 'v1.0.0',
      metrics: { coverage: 90 },
      riskTolerance: 'medium',
    }),
  },

  // Defect Intelligence domain tasks
  defectIntelligence: {
    predictDefects: createMockTaskRequest('predict-defects', {
      files: ['src/services/payment.ts'],
      threshold: 0.7,
    }),
    analyzeRootCause: createMockTaskRequest('analyze-root-cause', {
      defectId: 'bug_123',
      stackTrace: 'Error at line 42',
    }),
    clusterDefects: createMockTaskRequest('cluster-defects', {
      defects: [{ id: 'd1' }, { id: 'd2' }],
    }),
  },

  // Code Intelligence domain tasks
  codeIntelligence: {
    index: createMockTaskRequest('index', {
      paths: ['src/'],
      language: 'typescript',
    }),
    search: createMockTaskRequest('search', {
      query: 'authentication',
      limit: 10,
    }),
    analyzeImpact: createMockTaskRequest('analyze-impact', {
      changedFiles: ['src/auth.ts'],
    }),
  },

  // Security Compliance domain tasks
  securityCompliance: {
    runSecurityAudit: createMockTaskRequest('security-audit', {
      target: 'src/',
      includesDependencies: true,
    }),
    runComplianceCheck: createMockTaskRequest('compliance-check', {
      standardId: 'OWASP-Top-10',
    }),
  },

  // Chaos Resilience domain tasks
  chaosResilience: {
    runExperiment: createMockTaskRequest('run-experiment', {
      experimentId: 'exp_123',
    }),
    runLoadTest: createMockTaskRequest('run-load-test', {
      testId: 'load_123',
    }),
    assessResilience: createMockTaskRequest('assess-resilience', {
      services: ['api', 'database'],
    }),
  },

  // Learning Optimization domain tasks
  learningOptimization: {
    runLearningCycle: createMockTaskRequest('run-learning-cycle', {
      domain: 'test-generation',
    }),
    optimizeStrategies: createMockTaskRequest('optimize-strategies', {}),
    shareLearnings: createMockTaskRequest('share-learnings', {}),
  },

  // Contract Testing domain tasks
  contractTesting: {
    validateContract: createMockTaskRequest('validate-contract', {
      contract: { provider: 'api', consumer: 'frontend' },
    }),
    compareVersions: createMockTaskRequest('compare-versions', {
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
    }),
  },

  // Requirements Validation domain tasks
  requirementsValidation: {
    validate: createMockTaskRequest('validate', {
      requirement: { id: 'req_1', text: 'User can login' },
    }),
    generateScenarios: createMockTaskRequest('generate-scenarios', {
      requirementId: 'req_1',
    }),
  },

  // Visual Accessibility domain tasks
  visualAccessibility: {
    runVisualTests: createMockTaskRequest('run-visual-tests', {
      urls: ['http://localhost:3000'],
      viewports: [{ width: 1920, height: 1080 }],
    }),
    runAccessibilityAudit: createMockTaskRequest('run-accessibility-audit', {
      urls: ['http://localhost:3000'],
      level: 'AA',
    }),
  },
};

// ============================================================================
// Type-Safe Expect Helpers
// ============================================================================

/**
 * Type guard for checking Result success
 */
export function expectSuccess<T, E>(result: Result<T, E>): asserts result is { success: true; value: T } {
  expect(result.success).toBe(true);
}

/**
 * Type guard for checking Result failure
 */
export function expectError<T, E>(result: Result<T, E>): asserts result is { success: false; error: E } {
  expect(result.success).toBe(false);
}

// Re-export types for convenience
export { DomainName, DomainEvent, Result, ok, err };
export type { DomainHealth };

// Import expect for use in helpers
import { expect } from 'vitest';
