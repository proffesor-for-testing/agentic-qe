/**
 * Protocol Integration Test Utilities
 *
 * Shared utilities for testing AG-UI, A2A, and A2UI protocol integration.
 * Provides mock factories, event collection, and assertion helpers.
 *
 * @module tests/integration/protocols
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  AGUIEvent,
  AGUIEventType,
  JsonPatchOperation,
} from '../../../src/adapters/ag-ui/index.js';
import type {
  QEAgentCard,
  A2AMessage,
  TaskStatus,
  A2AArtifact,
} from '../../../src/adapters/a2a/index.js';
import type {
  SurfaceUpdateMessage,
  UserActionMessage,
} from '../../../src/adapters/a2ui/index.js';

// ============================================================================
// Test Timing Utilities
// ============================================================================

/**
 * Wait for a condition to become true with timeout
 *
 * @param condition - Function that returns truthy value when condition is met
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 * @param intervalMs - Polling interval (default: 50ms)
 * @returns Promise that resolves with the condition result
 */
export async function waitFor<T>(
  condition: () => T | Promise<T>,
  timeoutMs: number = 5000,
  intervalMs: number = 50
): Promise<T> {
  const startTime = Date.now();

  while (true) {
    const result = await condition();
    if (result) {
      return result;
    }

    if (Date.now() - startTime >= timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }

    await sleep(intervalMs);
  }
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Measure execution time of an async function
 *
 * @param fn - Async function to measure
 * @returns Execution time in milliseconds
 */
export async function measureLatency(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/**
 * Run multiple iterations and collect latency statistics
 */
export async function collectLatencyStats(
  fn: () => Promise<void>,
  iterations: number = 10
): Promise<{
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}> {
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const latency = await measureLatency(fn);
    latencies.push(latency);
  }

  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((a, b) => a + b, 0);
  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * latencies.length) - 1;
    return latencies[Math.max(0, index)];
  };

  return {
    min: latencies[0],
    max: latencies[latencies.length - 1],
    avg: sum / latencies.length,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
  };
}

// ============================================================================
// Event Collection Utilities
// ============================================================================

/**
 * Event collector for capturing AG-UI events
 */
export class EventCollector {
  private events: AGUIEvent[] = [];
  private eventPromises: Map<string, { resolve: (event: AGUIEvent) => void; reject: (err: Error) => void }[]> = new Map();

  /**
   * Record an event
   */
  push(event: AGUIEvent): void {
    this.events.push(event);

    // Resolve any waiting promises for this event type
    const promises = this.eventPromises.get(event.type);
    if (promises && promises.length > 0) {
      const { resolve } = promises.shift()!;
      resolve(event);
    }
  }

  /**
   * Get all collected events
   */
  getAll(): AGUIEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getByType<T extends AGUIEvent>(type: AGUIEventType | string): T[] {
    return this.events.filter((e) => e.type === type) as T[];
  }

  /**
   * Get event types in order
   */
  getEventTypes(): string[] {
    return this.events.map((e) => e.type);
  }

  /**
   * Find first event matching predicate
   */
  find<T extends AGUIEvent>(predicate: (event: AGUIEvent) => boolean): T | undefined {
    return this.events.find(predicate) as T | undefined;
  }

  /**
   * Check if an event type exists
   */
  hasEventType(type: AGUIEventType | string): boolean {
    return this.events.some((e) => e.type === type);
  }

  /**
   * Wait for a specific event type
   */
  async waitForEvent(type: AGUIEventType | string, timeoutMs: number = 5000): Promise<AGUIEvent> {
    // Check if already have the event
    const existing = this.events.find((e) => e.type === type);
    if (existing) {
      return existing;
    }

    // Wait for the event
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${type}`));
      }, timeoutMs);

      if (!this.eventPromises.has(type)) {
        this.eventPromises.set(type, []);
      }

      this.eventPromises.get(type)!.push({
        resolve: (event: AGUIEvent) => {
          clearTimeout(timeout);
          resolve(event);
        },
        reject,
      });
    });
  }

  /**
   * Clear collected events
   */
  clear(): void {
    this.events = [];
    this.eventPromises.clear();
  }

  /**
   * Get event count
   */
  get length(): number {
    return this.events.length;
  }
}

// ============================================================================
// Mock Agent Factory
// ============================================================================

/**
 * Configuration for mock A2A agent
 */
export interface MockAgentConfig {
  id: string;
  name: string;
  domain: string;
  skills: string[];
  responseDelay?: number;
  failureRate?: number;
}

/**
 * Mock A2A agent for testing
 */
export interface MockA2AAgent {
  id: string;
  card: QEAgentCard;
  handleTask: (message: A2AMessage) => Promise<{
    status: TaskStatus;
    artifacts: A2AArtifact[];
    error?: string;
  }>;
  getTaskCount: () => number;
  reset: () => void;
}

/**
 * Create a mock A2A agent for testing
 */
export function createMockA2AAgent(config: MockAgentConfig): MockA2AAgent {
  const {
    id,
    name,
    domain,
    skills,
    responseDelay = 50,
    failureRate = 0,
  } = config;

  let taskCount = 0;

  const card: QEAgentCard = {
    name,
    description: `Mock agent for testing: ${name}`,
    url: `http://localhost:3000/a2a/${id}`,
    version: '3.0.0',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: skills.map((skill) => ({
      id: skill,
      name: skill.charAt(0).toUpperCase() + skill.slice(1).replace(/-/g, ' '),
      description: `${skill} capability`,
      tags: [domain, 'testing'],
    })),
    provider: {
      name: 'Agentic QE',
      url: 'https://agentic-qe.io',
    },
    defaultInputModes: ['text'],
    defaultOutputModes: ['text'],
    qeMetadata: {
      domain,
      memoryReads: [`aqe/${domain}/*`],
      memoryWrites: [`aqe/results/*`],
    },
  };

  return {
    id,
    card,

    async handleTask(message: A2AMessage) {
      taskCount++;

      // Simulate processing delay
      if (responseDelay > 0) {
        await sleep(responseDelay);
      }

      // Simulate failures
      if (failureRate > 0 && Math.random() < failureRate) {
        return {
          status: 'failed' as TaskStatus,
          artifacts: [],
          error: 'Simulated failure',
        };
      }

      // Generate mock result
      const artifacts: A2AArtifact[] = [{
        id: `artifact-${uuidv4()}`,
        name: 'result',
        parts: [{
          type: 'data' as const,
          data: {
            agentId: id,
            processedAt: new Date().toISOString(),
            inputLength: message.parts.reduce((sum, p) => {
              if (p.type === 'text') return sum + p.text.length;
              return sum;
            }, 0),
          },
        }],
      }];

      return {
        status: 'completed' as TaskStatus,
        artifacts,
      };
    },

    getTaskCount: () => taskCount,
    reset: () => { taskCount = 0; },
  };
}

// ============================================================================
// Mock Surface Factory
// ============================================================================

/**
 * Create a test surface with data bindings
 */
export function createTestSurface(
  surfaceId: string,
  data: Record<string, unknown>
): SurfaceUpdateMessage {
  return {
    type: 'surfaceUpdate',
    surfaceId,
    version: 1,
    components: [
      {
        id: 'root',
        type: 'Column',
        properties: {},
        children: ['title', 'content'],
      },
      {
        id: 'title',
        type: 'Text',
        properties: {
          text: { literalString: data.title as string ?? 'Test Surface' },
          style: { literalString: 'heading' },
        },
      },
      {
        id: 'content',
        type: 'Card',
        properties: {},
        children: ['data-display'],
      },
      {
        id: 'data-display',
        type: 'Text',
        properties: {
          text: { path: '/content' },
        },
      },
    ],
  };
}

/**
 * Create a user action message
 */
export function createUserAction(
  surfaceId: string,
  componentId: string,
  actionId: string,
  payload?: Record<string, unknown>
): UserActionMessage {
  return {
    type: 'userAction',
    surfaceId,
    componentId,
    actionId,
    payload,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// Event Sequence Verification
// ============================================================================

/**
 * Verify that events occur in the expected sequence
 *
 * @param events - List of events to verify
 * @param expectedSequence - Expected event types in order
 * @throws Error if sequence doesn't match
 */
export function verifyEventSequence(
  events: AGUIEvent[],
  expectedSequence: string[]
): void {
  const actualTypes = events.map((e) => e.type);

  let expectedIndex = 0;
  for (const actualType of actualTypes) {
    if (expectedIndex < expectedSequence.length && actualType === expectedSequence[expectedIndex]) {
      expectedIndex++;
    }
  }

  if (expectedIndex !== expectedSequence.length) {
    const missing = expectedSequence.slice(expectedIndex);
    throw new Error(
      `Event sequence mismatch. Missing: [${missing.join(', ')}]\n` +
      `Expected: [${expectedSequence.join(', ')}]\n` +
      `Actual: [${actualTypes.join(', ')}]`
    );
  }
}

/**
 * Verify events contain specific event type
 */
export function verifyEventExists(
  events: AGUIEvent[],
  eventType: string,
  predicate?: (event: AGUIEvent) => boolean
): AGUIEvent {
  const found = events.find(
    (e) => e.type === eventType && (!predicate || predicate(e))
  );

  if (!found) {
    throw new Error(
      `Expected event of type '${eventType}' not found in events: [${events.map((e) => e.type).join(', ')}]`
    );
  }

  return found;
}

// ============================================================================
// A2A Message Utilities
// ============================================================================

/**
 * Convert A2UI user action to A2A message format
 */
export function actionToA2AMessage(action: UserActionMessage): A2AMessage {
  return {
    role: 'user',
    parts: [{
      type: 'text',
      text: JSON.stringify({
        actionId: action.actionId,
        surfaceId: action.surfaceId,
        componentId: action.componentId,
        payload: action.payload,
      }),
    }],
  };
}

/**
 * Create a text A2A message
 */
export function createTextMessage(text: string, role: 'user' | 'agent' = 'user'): A2AMessage {
  return {
    role,
    parts: [{ type: 'text', text }],
  };
}

/**
 * Create a data A2A message
 */
export function createDataMessage(
  data: Record<string, unknown>,
  role: 'user' | 'agent' = 'agent'
): A2AMessage {
  return {
    role,
    parts: [{ type: 'data', data }],
  };
}

// ============================================================================
// CRDT Test Utilities
// ============================================================================

/**
 * Simulate concurrent operations on multiple CRDT stores
 */
export async function simulateConcurrentOperations<T>(
  operations: Array<() => Promise<T>>,
  maxConcurrency: number = 10
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<void>[] = [];

  for (const operation of operations) {
    const promise = operation().then((result) => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
      // Remove completed promises
      for (let i = executing.length - 1; i >= 0; i--) {
        if (executing[i] === undefined) {
          executing.splice(i, 1);
        }
      }
    }
  }

  await Promise.all(executing);
  return results;
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Standard test agent cards for integration tests
 */
export const TEST_AGENT_CARDS = {
  testArchitect: createMockA2AAgent({
    id: 'qe-test-architect',
    name: 'qe-test-architect',
    domain: 'test-generation',
    skills: ['test-generation', 'property-testing', 'mutation-testing'],
  }),

  coverageSpecialist: createMockA2AAgent({
    id: 'qe-coverage-specialist',
    name: 'qe-coverage-specialist',
    domain: 'coverage-analysis',
    skills: ['coverage-analysis', 'gap-detection', 'coverage-reporting'],
  }),

  securityScanner: createMockA2AAgent({
    id: 'qe-security-scanner',
    name: 'qe-security-scanner',
    domain: 'security-compliance',
    skills: ['security-scan', 'vulnerability-detection', 'owasp-analysis'],
  }),

  accessibilityAuditor: createMockA2AAgent({
    id: 'qe-accessibility-auditor',
    name: 'qe-accessibility-auditor',
    domain: 'accessibility',
    skills: ['a11y-audit', 'wcag-compliance', 'aria-validation'],
  }),
};

/**
 * Standard test data for surfaces
 */
export const TEST_SURFACE_DATA = {
  coverage: {
    title: 'Coverage Report',
    content: {
      totalCoverage: 85.5,
      lineCoverage: 87.2,
      branchCoverage: 82.1,
      files: [
        { path: 'src/index.ts', coverage: 92.5 },
        { path: 'src/utils.ts', coverage: 78.3 },
      ],
    },
  },

  testResults: {
    title: 'Test Results',
    content: {
      total: 150,
      passed: 145,
      failed: 3,
      skipped: 2,
      duration: 5420,
    },
  },

  securityFindings: {
    title: 'Security Findings',
    content: {
      critical: 0,
      high: 2,
      medium: 5,
      low: 12,
      info: 8,
    },
  },
};

// ============================================================================
// ID Generators
// ============================================================================

/**
 * Generate a unique thread ID
 */
export function generateThreadId(): string {
  return `thread-${uuidv4().slice(0, 8)}`;
}

/**
 * Generate a unique run ID
 */
export function generateRunId(): string {
  return `run-${uuidv4().slice(0, 8)}`;
}

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task-${uuidv4().slice(0, 8)}`;
}

/**
 * Generate a unique surface ID
 */
export function generateSurfaceId(): string {
  return `surface-${uuidv4().slice(0, 8)}`;
}

// ============================================================================
// Type Exports
// ============================================================================

export type { AGUIEvent, AGUIEventType, JsonPatchOperation };
export type { QEAgentCard, A2AMessage, TaskStatus, A2AArtifact };
export type { SurfaceUpdateMessage, UserActionMessage };
