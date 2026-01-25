/**
 * Phase 2 Test Mocks and Fixtures
 *
 * Shared mocks for instrumentation, evaluation, and voting tests
 *
 * @module tests/fixtures/phase2-mocks
 */

import { Span, Context, SpanContext, SpanKind, SpanStatus } from '@opentelemetry/api';
import { VotingAgent, Vote, VotingTask } from '@/voting/types';
import { createSeededRandom } from '../../src/utils/SeededRandom';

// Seeded RNG for deterministic mock data generation
const rng = createSeededRandom(29100);

/**
 * Mock Span for testing without full OTEL setup
 */
export class MockSpan implements Span {
  private _name: string;
  private _attributes: Record<string, any> = {};
  private _events: Array<{ name: string; attributes?: any; timestamp?: number }> = [];
  private _status: SpanStatus = { code: 1 };
  private _ended = false;

  constructor(name: string) {
    this._name = name;
  }

  spanContext(): SpanContext {
    return {
      traceId: 'mock-trace-id',
      spanId: 'mock-span-id',
      traceFlags: 1,
    };
  }

  setAttribute(key: string, value: any): this {
    this._attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Record<string, any>): this {
    Object.assign(this._attributes, attributes);
    return this;
  }

  addEvent(name: string, attributesOrStartTime?: any, startTime?: number): this {
    this._events.push({ name, attributes: attributesOrStartTime, timestamp: startTime });
    return this;
  }

  setStatus(status: SpanStatus): this {
    this._status = status;
    return this;
  }

  updateName(name: string): this {
    this._name = name;
    return this;
  }

  end(endTime?: number): void {
    this._ended = true;
  }

  isRecording(): boolean {
    return !this._ended;
  }

  recordException(exception: Error, time?: number): void {
    this.addEvent('exception', {
      'exception.type': exception.name,
      'exception.message': exception.message,
      'exception.stacktrace': exception.stack,
    });
  }

  // Test helpers
  getAttributes(): Record<string, any> {
    return { ...this._attributes };
  }

  getEvents(): Array<{ name: string; attributes?: any; timestamp?: number }> {
    return [...this._events];
  }

  getStatus(): SpanStatus {
    return this._status;
  }

  getName(): string {
    return this._name;
  }
}

/**
 * Mock Context for testing context propagation
 */
export const createMockContext = (): Context => {
  return {} as Context;
};

/**
 * Create mock voting agent
 */
export const createMockVotingAgent = (
  id: string,
  type: string = 'test-generator',
  expertise: string[] = ['testing'],
  weight: number = 1.0
): VotingAgent => ({
  id,
  type: type as any,
  expertise,
  weight,
  maxConcurrency: 5,
});

/**
 * Create mock vote
 */
export const createMockVote = (
  agentId: string,
  taskId: string,
  score: number = 0.8,
  confidence: number = 0.9
): Vote => ({
  agentId,
  taskId,
  score,
  confidence,
  reasoning: `Mock vote from ${agentId}`,
  timestamp: new Date(),
});

/**
 * Create mock voting task
 */
export const createMockVotingTask = (
  id: string,
  requiredExpertise?: string[]
): VotingTask => ({
  id,
  type: 'quality-assessment',
  description: `Mock task ${id}`,
  context: { testData: 'mock' },
  priority: 'medium',
  requiredExpertise,
});

/**
 * Mock LLM response for semantic evaluation
 */
export interface MockLLMResponse {
  passed: boolean;
  reasoning: string;
  confidence: number;
  suggestions?: string[];
}

/**
 * Create mock LLM response
 */
export const createMockLLMResponse = (
  passed: boolean = true,
  confidence: number = 0.85
): MockLLMResponse => ({
  passed,
  reasoning: passed
    ? 'Code follows best practices and design patterns'
    : 'Code has maintainability concerns',
  confidence,
  suggestions: passed ? [] : ['Consider refactoring for better readability'],
});

/**
 * Sample TypeScript code for evaluation tests
 */
export const SAMPLE_CODE = {
  simple: `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}`,

  complex: `export class ComplexLogic {
  process(input: any): string {
    if (input === null) {
      return 'null';
    } else if (typeof input === 'string') {
      if (input.length === 0) {
        return 'empty';
      } else if (input.length < 10) {
        return 'short';
      } else if (input.length < 100) {
        return 'medium';
      } else {
        return 'long';
      }
    } else if (typeof input === 'number') {
      if (input === 0) {
        return 'zero';
      } else if (input < 0) {
        return 'negative';
      } else if (input < 10) {
        return 'small';
      } else {
        return 'large';
      }
    }
    return 'unknown';
  }
}`,

  withAsync: `export class UserService {
  constructor(private db: Database) {}

  async findUser(id: string): Promise<User | null> {
    return this.db.users.findById(id);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    const user = await this.db.users.create(data);
    return user;
  }
}`,

  withErrors: `export class ErrorProneCode {
  // Dangerous pattern
  processData(input: string) {
    eval(input); // Security vulnerability
    console.log('Processing...'); // TODO: Remove debug logs
  }

  // Missing error handling
  async fetchData() {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  }
}`,
};

/**
 * Mock agent span data for testing
 */
export interface MockAgentSpanData {
  agentId: string;
  agentType: string;
  taskId: string;
  taskType: string;
  tokensUsed: number;
  costUsd: number;
  durationMs: number;
  success: boolean;
}

/**
 * Create mock agent span data
 */
export const createMockAgentSpanData = (
  overrides?: Partial<MockAgentSpanData>
): MockAgentSpanData => ({
  agentId: 'test-agent-001',
  agentType: 'qe-test-generator',
  taskId: 'task-001',
  taskType: 'unit-test',
  tokensUsed: 250,
  costUsd: 0.0015,
  durationMs: 1500,
  success: true,
  ...overrides,
});

/**
 * Generate multiple mock agent span data
 */
export const createMockAgentSpanBatch = (
  count: number,
  agentType?: string
): MockAgentSpanData[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockAgentSpanData({
      agentId: `agent-${i}`,
      agentType: agentType || 'qe-test-generator',
      taskId: `task-${i}`,
      tokensUsed: Math.floor(rng.random() * 300) + 100,
    })
  );
};

/**
 * Mock constitution clause for testing
 */
export const createMockClause = (
  type: 'ast' | 'metric' | 'pattern' | 'semantic',
  condition: string,
  id?: string
) => ({
  id: id || `mock-clause-${type}`,
  type,
  condition,
  action: 'allow' as const,
  severity: 'info' as const,
  message: `Mock ${type} clause`,
  metadata: {},
});

/**
 * Delay utility for async tests
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Mock database for testing
 */
export class MockDatabase {
  private data: Map<string, any> = new Map();

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  size(): number {
    return this.data.size;
  }
}

/**
 * Mock AgentDB for learning patterns
 */
export class MockAgentDB {
  private patterns: any[] = [];

  async storePattern(pattern: any): Promise<string> {
    const id = `pattern-${this.patterns.length}`;
    this.patterns.push({ ...pattern, id });
    return id;
  }

  async searchPatterns(query: string, limit: number = 5): Promise<any[]> {
    return this.patterns.slice(0, limit);
  }

  async getPatternById(id: string): Promise<any | null> {
    return this.patterns.find(p => p.id === id) || null;
  }

  clear(): void {
    this.patterns = [];
  }
}
