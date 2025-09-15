/**
 * Test utilities and helper functions
 */

import { AgentId, AgentConfig, PACTLevel, SecurityLevel, TaskDefinition } from '../../src/core/types';
import { MockLogger } from '../mocks/logger.mock';
import { MockEventBus } from '../mocks/event-bus.mock';
import { MockMemorySystem } from '../mocks/memory-system.mock';

/**
 * Creates a test agent ID
 */
export function createTestAgentId(overrides: Partial<AgentId> = {}): AgentId {
  return {
    id: 'test-agent-' + Math.random().toString(36).substr(2, 9),
    swarmId: 'test-swarm',
    type: 'context-orchestrator',
    instance: 0,
    ...overrides
  };
}

/**
 * Creates a test agent configuration
 */
export function createTestAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: 'Test Agent',
    type: 'context-orchestrator',
    pactLevel: PACTLevel.COLLABORATIVE,
    capabilities: {
      maxConcurrentTasks: 3,
      supportedTaskTypes: ['test-task'],
      pactLevel: PACTLevel.COLLABORATIVE,
      rstHeuristics: ['SFDIPOT'],
      contextAwareness: true,
      explainability: true,
      learningEnabled: false,
      securityClearance: SecurityLevel.INTERNAL
    },
    environment: {
      runtime: 'node',
      version: '18.0.0',
      workingDirectory: '/tmp/test',
      logLevel: 'error',
      timeout: 30000
    },
    learning: {
      enabled: false,
      strategy: 'reinforcement',
      learningRate: 0.01,
      memoryRetention: 0.95,
      experienceSharing: true
    },
    security: {
      enablePromptInjectionProtection: true,
      enableOutputSanitization: true,
      enableAuditLogging: true,
      rateLimiting: {
        requests: 100,
        window: 60000
      },
      permissions: ['read', 'write']
    },
    collaboration: {
      maxCollaborators: 5,
      communicationProtocol: 'direct',
      consensusRequired: false,
      sharingStrategy: 'selective'
    },
    explainability: {
      enabled: true,
      detailLevel: 'standard',
      includeAlternatives: true,
      includeConfidence: true,
      includeEvidence: true
    },
    ...overrides
  };
}

/**
 * Creates a test task definition
 */
export function createTestTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 'test-task-' + Math.random().toString(36).substr(2, 9),
    type: 'test-task',
    priority: 'medium',
    context: {
      domain: 'testing',
      environment: 'test',
      testingPhase: 'development'
    },
    constraints: {
      timeLimit: 30000,
      resourceLimit: {
        cpu: 100,
        memory: 512,
        network: 10
      },
      qualityThreshold: 0.8
    },
    dependencies: [],
    expectedOutcome: 'Test task completion',
    metadata: {},
    ...overrides
  };
}

/**
 * Creates a mock services bundle for testing
 */
export function createMockServices() {
  const logger = new MockLogger();
  const eventBus = new MockEventBus();
  const memory = new MockMemorySystem();

  return { logger, eventBus, memory };
}

/**
 * Waits for a condition to be true within a timeout
 */
export function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const result = await condition();
        if (result) {
          resolve();
          return;
        }
      } catch (error) {
        // Continue checking
      }

      if (Date.now() - startTime >= timeout) {
        reject(new Error(`Condition not met within ${timeout}ms`));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}

/**
 * Creates a spy that tracks calls and provides async control
 */
export function createAsyncSpy<T extends (...args: any[]) => any>(
  implementation?: T
): jest.MockedFunction<T> & {
  resolveNext: (value: any) => void;
  rejectNext: (error: any) => void;
  nextCall: () => Promise<Parameters<T>>;
} {
  let nextResolver: ((value: any) => void) | null = null;
  let nextRejecter: ((error: any) => void) | null = null;
  let callResolver: ((value: Parameters<T>) => void) | null = null;

  const spy = jest.fn((...args: Parameters<T>) => {
    if (callResolver) {
      callResolver(args);
      callResolver = null;
    }

    if (implementation) {
      return implementation(...args);
    }

    return new Promise((resolve, reject) => {
      nextResolver = resolve;
      nextRejecter = reject;
    });
  }) as jest.MockedFunction<T> & {
    resolveNext: (value: any) => void;
    rejectNext: (error: any) => void;
    nextCall: () => Promise<Parameters<T>>;
  };

  spy.resolveNext = (value: any) => {
    if (nextResolver) {
      nextResolver(value);
      nextResolver = null;
      nextRejecter = null;
    }
  };

  spy.rejectNext = (error: any) => {
    if (nextRejecter) {
      nextRejecter(error);
      nextResolver = null;
      nextRejecter = null;
    }
  };

  spy.nextCall = () => {
    return new Promise<Parameters<T>>((resolve) => {
      callResolver = resolve;
    });
  };

  return spy;
}

/**
 * Creates test data for performance scenarios
 */
export function createPerformanceTestData(complexity: 'simple' | 'medium' | 'complex' = 'medium') {
  const base = {
    simple: {
      itemCount: 10,
      iterationCount: 100,
      timeout: 1000
    },
    medium: {
      itemCount: 100,
      iterationCount: 1000,
      timeout: 5000
    },
    complex: {
      itemCount: 1000,
      iterationCount: 10000,
      timeout: 30000
    }
  };

  return base[complexity];
}

/**
 * Measures execution time of a function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Creates a deterministic random number generator for testing
 */
export function createSeededRandom(seed: number = 12345) {
  let current = seed;

  return {
    next(): number {
      current = (current * 9301 + 49297) % 233280;
      return current / 233280;
    },

    integer(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },

    choice<T>(array: T[]): T {
      return array[this.integer(0, array.length - 1)];
    },

    reset(newSeed?: number) {
      current = newSeed ?? seed;
    }
  };
}

/**
 * Utility to capture and verify log output
 */
export class LogCapture {
  private logs: Array<{ level: string; message: string; context?: any }> = [];
  private originalConsole: typeof console;

  constructor() {
    this.originalConsole = { ...console };
  }

  start(): void {
    const levels = ['log', 'debug', 'info', 'warn', 'error'] as const;

    levels.forEach(level => {
      (console as any)[level] = jest.fn((message: string, context?: any) => {
        this.logs.push({ level, message, context });
      });
    });
  }

  stop(): void {
    Object.assign(console, this.originalConsole);
  }

  getLogs(level?: string): Array<{ level: string; message: string; context?: any }> {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  hasLog(level: string, messagePattern: string | RegExp): boolean {
    return this.logs.some(log => {
      if (log.level !== level) return false;

      if (typeof messagePattern === 'string') {
        return log.message.includes(messagePattern);
      } else {
        return messagePattern.test(log.message);
      }
    });
  }
}