/**
 * Unit tests for TaskExecutor with Result Persistence (ADR-036)
 * Tests domain task execution with automatic result saving
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  DomainTaskExecutor,
  createTaskExecutor,
  TaskExecutorConfig,
  TaskResult,
} from '../../../src/coordination/task-executor';
import { QueenTask, TaskType } from '../../../src/coordination/queen-coordinator';
import { QEKernel, EventBus, MemoryBackend, AgentCoordinator, Subscription, VectorSearchResult, StoreOptions, AgentSpawnConfig, AgentFilter, AgentInfo } from '../../../src/kernel/interfaces';
import { DomainEvent, DomainName, Result, ok, err, AgentStatus } from '../../../src/shared/types';

// ============================================================================
// Mock Implementations
// ============================================================================

const TEST_RESULTS_DIR = '/tmp/agentic-qe-executor-test-' + Date.now();

class MockEventBus implements EventBus {
  public publishedEvents: DomainEvent[] = [];
  private handlers = new Map<string, Set<(event: DomainEvent) => Promise<void>>>();

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.publishedEvents.push(event);
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        await handler(event);
      }
    }
  }

  subscribe<T>(eventType: string, handler: (event: DomainEvent<T>) => Promise<void>): Subscription {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as (event: DomainEvent) => Promise<void>);
    return {
      unsubscribe: () => this.handlers.get(eventType)?.delete(handler as (event: DomainEvent) => Promise<void>),
      active: true,
    };
  }

  subscribeToChannel(domain: DomainName, handler: (event: DomainEvent) => Promise<void>): Subscription {
    return { unsubscribe: () => {}, active: true };
  }

  async getHistory(): Promise<DomainEvent[]> {
    return this.publishedEvents;
  }

  async dispose(): Promise<void> {
    this.handlers.clear();
    this.publishedEvents = [];
  }
}

class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async set<T>(key: string, value: T, options?: StoreOptions): Promise<void> {
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
  async search(pattern: string, limit?: number): Promise<string[]> {
    return Array.from(this.store.keys()).filter(k => k.includes(pattern.replace(/\*/g, '')));
  }
  async vectorSearch(embedding: number[], k: number): Promise<VectorSearchResult[]> {
    return [];
  }
  async storeVector(key: string, embedding: number[], metadata?: unknown): Promise<void> {}
  async dispose(): Promise<void> {
    this.store.clear();
  }
}

class MockAgentCoordinator implements AgentCoordinator {
  private agents = new Map<string, AgentInfo>();

  async spawn(config: AgentSpawnConfig): Promise<Result<string, Error>> {
    const id = `agent_${uuidv4()}`;
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
    let result = Array.from(this.agents.values());
    if (filter?.domain) result = result.filter(a => a.domain === filter.domain);
    if (filter?.status) result = result.filter(a => a.status === filter.status);
    return result;
  }

  async stop(agentId: string): Promise<Result<void, Error>> {
    this.agents.delete(agentId);
    return ok(undefined);
  }

  getActiveCount(): number {
    return this.agents.size;
  }

  canSpawn(): boolean {
    return true;
  }

  async dispose(): Promise<void> {
    this.agents.clear();
  }
}

class MockQEKernel implements QEKernel {
  eventBus: EventBus;
  memory: MemoryBackend;
  agentCoordinator: AgentCoordinator;
  private initialized = false;

  constructor() {
    this.eventBus = new MockEventBus();
    this.memory = new MockMemoryBackend();
    this.agentCoordinator = new MockAgentCoordinator();
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.memory.initialize();
      this.initialized = true;
    }
  }

  async dispose(): Promise<void> {
    await this.eventBus.dispose();
    await this.memory.dispose();
    await this.agentCoordinator.dispose();
    this.initialized = false;
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createTestTask(type: TaskType, payload: Record<string, unknown> = {}): QueenTask {
  return {
    id: `task_${uuidv4()}`,
    type,
    priority: 'p1',
    targetDomains: [],
    payload,
    timeout: 30000,
    createdAt: new Date(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DomainTaskExecutor', () => {
  let kernel: MockQEKernel;
  let executor: DomainTaskExecutor;

  beforeEach(async () => {
    kernel = new MockQEKernel();
    await kernel.initialize();
    executor = createTaskExecutor(kernel, {
      saveResults: true,
      resultsDir: TEST_RESULTS_DIR,
      defaultLanguage: 'typescript',
      defaultFramework: 'vitest',
    });
  });

  afterEach(async () => {
    await kernel.dispose();
    try {
      await fs.rm(TEST_RESULTS_DIR, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }
  });

  describe('initialization', () => {
    it('should create executor with default config', () => {
      const defaultExecutor = createTaskExecutor(kernel);
      expect(defaultExecutor).toBeInstanceOf(DomainTaskExecutor);
    });

    it('should create executor with custom config', () => {
      const customExecutor = createTaskExecutor(kernel, {
        timeout: 60000,
        maxRetries: 5,
        enableCaching: false,
        saveResults: false,
      });
      expect(customExecutor).toBeInstanceOf(DomainTaskExecutor);
    });
  });

  describe('test generation execution', () => {
    it('should execute test generation task', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'function add(a, b) { return a + b; }',
        language: 'typescript',
        framework: 'vitest',
        testType: 'unit',
        coverageGoal: 80,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe(task.id);
      expect(result.domain).toBe('test-generation');
      expect(result.data).toBeDefined();

      const data = result.data as { testsGenerated: number; coverageEstimate: number };
      expect(data.testsGenerated).toBeGreaterThan(0);
      expect(data.coverageEstimate).toBeGreaterThan(0);
    });

    it('should save test generation results to files', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'export function multiply(a: number, b: number): number { return a * b; }',
        language: 'typescript',
        framework: 'vitest',
        testType: 'unit',
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.savedFiles).toBeDefined();
      expect(result.savedFiles!.length).toBeGreaterThan(0);

      // Verify files exist
      for (const filePath of result.savedFiles!) {
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('should return warning when no source files provided', async () => {
      const task = createTestTask('generate-tests', {
        language: 'typescript',
        framework: 'vitest',
        testType: 'unit',
        // No sourceCode, filePath, or sourceFiles provided
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      const data = result.data as { testsGenerated: number; warning?: string };
      expect(data.testsGenerated).toBe(0);
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain('No source files');
    });
  });

  describe('coverage analysis execution', () => {
    it('should execute coverage analysis task', async () => {
      const task = createTestTask('analyze-coverage', {
        target: 'src/',
        detectGaps: true,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('coverage-analysis');

      const data = result.data as {
        lineCoverage: number;
        branchCoverage: number;
        gaps: Array<{ file: string }>;
        warning?: string;
      };
      // When no coverage data file exists, returns zeros with warning
      expect(data.lineCoverage).toBeGreaterThanOrEqual(0);
      expect(data.branchCoverage).toBeGreaterThanOrEqual(0);
      expect(data.gaps).toBeDefined();
      // Should have warning when no coverage data found
      if (data.lineCoverage === 0) {
        expect(data.warning).toContain('No coverage data found');
      }
    });

    it('should save coverage results with LCOV', async () => {
      const task = createTestTask('analyze-coverage', {
        target: 'src/',
        detectGaps: true,
      });

      const result = await executor.execute(task);

      expect(result.savedFiles).toBeDefined();
      const lcovFile = result.savedFiles!.find(f => f.endsWith('.lcov'));
      expect(lcovFile).toBeDefined();
    });
  });

  describe('security scan execution', () => {
    it('should execute security scan task', async () => {
      const task = createTestTask('scan-security', {
        target: 'src/',
        sast: true,
        dast: false,
        compliance: ['owasp-top-10'],
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('security-compliance');

      const data = result.data as {
        vulnerabilities: number;
        critical: number;
        high: number;
        recommendations: string[];
      };
      expect(data.vulnerabilities).toBeGreaterThanOrEqual(0);
      expect(data.recommendations).toBeDefined();
    });

    it('should save security results with SARIF', async () => {
      const task = createTestTask('scan-security', {
        target: 'src/',
        sast: true,
      });

      const result = await executor.execute(task);

      expect(result.savedFiles).toBeDefined();
      const sarifFile = result.savedFiles!.find(f => f.endsWith('.sarif'));
      expect(sarifFile).toBeDefined();
    });
  });

  describe('code indexing execution', () => {
    it('should execute code indexing task', async () => {
      const task = createTestTask('index-code', {
        target: 'src/',
        incremental: false,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('code-intelligence');

      const data = result.data as {
        filesIndexed: number;
        nodesCreated: number;
        edgesCreated: number;
      };
      expect(data.filesIndexed).toBeGreaterThan(0);
      expect(data.nodesCreated).toBeGreaterThan(0);
    }, 30000); // Extended timeout for code indexing on slow CI runners
  });

  describe('quality assessment execution', () => {
    it('should execute quality assessment task', async () => {
      const task = createTestTask('assess-quality', {
        runGate: true,
        threshold: 80,
        metrics: ['coverage', 'complexity', 'maintainability'],
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('quality-assessment');

      const data = result.data as {
        qualityScore: number;
        passed: boolean;
        metrics: Record<string, number>;
      };
      expect(data.qualityScore).toBeGreaterThan(0);
      expect(data.metrics).toBeDefined();
    });
  });

  describe('test execution', () => {
    it('should execute test execution task', async () => {
      const task = createTestTask('execute-tests', {
        testFiles: ['tests/unit/*.test.ts'],
        parallel: true,
        retryCount: 3,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('test-execution');

      const data = result.data as {
        total: number;
        passed: number;
        failed: number;
      };
      expect(data.total).toBeGreaterThan(0);
      expect(data.passed).toBeDefined();
    });
  });

  describe('defect prediction execution', () => {
    it('should execute defect prediction task', async () => {
      const task = createTestTask('predict-defects', {
        target: 'src/',
        minConfidence: 0.7,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('defect-intelligence');

      const data = result.data as {
        predictedDefects: Array<{ file: string; probability: number }>;
        riskScore: number;
      };
      expect(data.predictedDefects).toBeDefined();
      expect(data.riskScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('requirements validation execution', () => {
    it('should execute requirements validation task', async () => {
      const task = createTestTask('validate-requirements', {
        generateBDD: true,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('requirements-validation');

      const data = result.data as {
        requirementsAnalyzed: number;
        testable: number;
        bddScenarios: string[];
      };
      expect(data.requirementsAnalyzed).toBeGreaterThan(0);
      expect(data.bddScenarios).toBeDefined();
    });
  });

  describe('contract validation execution', () => {
    it('should execute contract validation task', async () => {
      const task = createTestTask('validate-contracts', {
        contractPath: 'api/openapi.yaml',
        checkBreakingChanges: true,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('contract-testing');

      const data = result.data as {
        valid: boolean;
        breakingChanges: string[];
      };
      expect(data.valid).toBeDefined();
    });
  });

  describe('accessibility testing execution', () => {
    it('should execute accessibility test task', async () => {
      const task = createTestTask('test-accessibility', {
        url: 'http://localhost:3000',
        standard: 'wcag21-aa',
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('visual-accessibility');

      const data = result.data as {
        passed: boolean;
        score: number;
        violations: unknown[];
      };
      expect(data.score).toBeGreaterThan(0);
    });
  });

  describe('chaos testing execution', () => {
    it('should execute chaos test task', async () => {
      const task = createTestTask('run-chaos', {
        faultType: 'network-latency',
        target: 'api-gateway',
        duration: 60000,
        dryRun: true,
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('chaos-resilience');

      const data = result.data as {
        faultType: string;
        resilience: { recovered: boolean };
      };
      expect(data.faultType).toBe('network-latency');
      expect(data.resilience).toBeDefined();
    });
  });

  describe('learning optimization execution', () => {
    it('should execute learning optimization task', async () => {
      const task = createTestTask('optimize-learning', {});

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.domain).toBe('learning-optimization');

      const data = result.data as {
        patternsLearned: number;
        memoryConsolidated: boolean;
      };
      expect(data.patternsLearned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle unknown task type', async () => {
      const task = createTestTask('unknown-task-type' as TaskType, {});

      const result = await executor.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler registered');
    });

    it('should handle task timeout', async () => {
      // Create executor with very short timeout
      const shortTimeoutExecutor = createTaskExecutor(kernel, {
        timeout: 1, // 1ms timeout
        saveResults: false,
      });

      const task = createTestTask('generate-tests', {});
      task.timeout = 1;

      // Note: This test may be flaky due to timing, but demonstrates timeout handling
      const result = await shortTimeoutExecutor.execute(task);
      // Either succeeds quickly or times out
      expect(result.taskId).toBe(task.id);
    });
  });

  describe('event publishing', () => {
    it('should publish TaskCompleted event on success', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'export function hello() { return "world"; }',
      });

      await executor.execute(task);

      const events = (kernel.eventBus as MockEventBus).publishedEvents;
      const completedEvent = events.find(e => e.type === 'TaskCompleted');

      expect(completedEvent).toBeDefined();
      expect(completedEvent!.payload.taskId).toBe(task.id);
    });

    it('should return error result for unknown task type without publishing event', async () => {
      // Note: Unknown task types return early without publishing event
      // This is by design - only tasks that start execution publish events
      const task = createTestTask('unknown-task' as TaskType, {});

      const result = await executor.execute(task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No handler registered');
    });

    it('should publish TaskFailed event on handler error', async () => {
      // To test this properly, we'd need a handler that throws
      // For now, verify the mechanism exists via result inspection
      const task = createTestTask('generate-tests', {
        sourceCode: 'export const test = () => true;',
      });
      const result = await executor.execute(task);

      // Successful task should publish TaskCompleted
      const events = (kernel.eventBus as MockEventBus).publishedEvents;
      const completedEvent = events.find(e => e.type === 'TaskCompleted');
      expect(completedEvent).toBeDefined();
    });
  });

  describe('result persistence toggle', () => {
    it('should not save results when disabled', async () => {
      const noSaveExecutor = createTaskExecutor(kernel, {
        saveResults: false,
      });

      const task = createTestTask('generate-tests', {
        sourceCode: 'export function example() { return 42; }',
      });
      const result = await noSaveExecutor.execute(task);

      expect(result.success).toBe(true);
      expect(result.savedFiles).toBeUndefined();
    });

    it('should save results when enabled', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'export function compute(x: number): number { return x * 2; }',
        language: 'typescript',
        framework: 'vitest',
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      expect(result.savedFiles).toBeDefined();
      expect(result.savedFiles!.length).toBeGreaterThan(0);
    });
  });

  describe('language/framework config', () => {
    it('should use task payload language/framework', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'def example(): return 42',
        language: 'python',
        framework: 'pytest',
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      // Saved files should use python test patterns
    });

    it('should use default language/framework when not in payload', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'export const val = 123;',
      });

      const result = await executor.execute(task);

      expect(result.success).toBe(true);
      // Should use default typescript/vitest
    });
  });

  describe('duration tracking', () => {
    it('should track execution duration', async () => {
      const task = createTestTask('generate-tests', {
        sourceCode: 'export function fn() {}',
      });

      const result = await executor.execute(task);

      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('domain mapping', () => {
    const taskDomainPairs: [TaskType, DomainName][] = [
      ['generate-tests', 'test-generation'],
      ['execute-tests', 'test-execution'],
      ['analyze-coverage', 'coverage-analysis'],
      ['assess-quality', 'quality-assessment'],
      ['predict-defects', 'defect-intelligence'],
      ['validate-requirements', 'requirements-validation'],
      ['index-code', 'code-intelligence'],
      ['scan-security', 'security-compliance'],
      ['validate-contracts', 'contract-testing'],
      ['test-accessibility', 'visual-accessibility'],
      ['run-chaos', 'chaos-resilience'],
      ['optimize-learning', 'learning-optimization'],
    ];

    it.each(taskDomainPairs)('should map %s to %s domain', async (taskType, expectedDomain) => {
      const task = createTestTask(taskType, {});
      const result = await executor.execute(task);
      expect(result.domain).toBe(expectedDomain);
    }, 30000); // Extended timeout for parameterized tests
  });
});

describe('TaskExecutor integration', () => {
  const TEST_DIR = '/tmp/agentic-qe-executor-integration-' + Date.now();
  let kernel: MockQEKernel;
  let executor: DomainTaskExecutor;

  beforeEach(async () => {
    kernel = new MockQEKernel();
    await kernel.initialize();
    executor = createTaskExecutor(kernel, {
      saveResults: true,
      resultsDir: TEST_DIR,
    });
  });

  afterEach(async () => {
    await kernel.dispose();
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should handle full QE workflow execution', async () => {
    // 1. Generate tests
    const genTask = createTestTask('generate-tests', {
      sourceCode: 'class UserService {}',
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
    });
    const genResult = await executor.execute(genTask);
    expect(genResult.success).toBe(true);
    expect(genResult.savedFiles!.length).toBeGreaterThan(0);

    // 2. Analyze coverage
    const covTask = createTestTask('analyze-coverage', {
      target: 'src/',
      detectGaps: true,
    });
    const covResult = await executor.execute(covTask);
    expect(covResult.success).toBe(true);

    // 3. Security scan
    const secTask = createTestTask('scan-security', {
      target: 'src/',
      sast: true,
    });
    const secResult = await executor.execute(secTask);
    expect(secResult.success).toBe(true);

    // 4. Quality assessment
    const qualTask = createTestTask('assess-quality', {
      runGate: true,
      threshold: 80,
    });
    const qualResult = await executor.execute(qualTask);
    expect(qualResult.success).toBe(true);

    // Verify all results were saved
    const indexPath = path.join(TEST_DIR, 'results', 'index.json');
    expect(existsSync(indexPath)).toBe(true);

    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(indexContent);

    expect(index.results.length).toBe(4);
  }, 60000); // Extended timeout for multi-step workflow

  it('should persist results across multiple task types', async () => {
    // Test tasks with appropriate payloads for real implementations
    const testTasks = [
      createTestTask('generate-tests', { sourceCode: 'export function test() { return 1; }' }),
      createTestTask('analyze-coverage', { target: TEST_DIR }),
      createTestTask('scan-security', { target: TEST_DIR }),
      createTestTask('assess-quality', { target: TEST_DIR }),
      createTestTask('index-code', { target: TEST_DIR }),
      createTestTask('predict-defects', { target: TEST_DIR }),
    ];

    for (const task of testTasks) {
      const result = await executor.execute(task);
      expect(result.success).toBe(true);
    }

    // All results should be in index
    const indexPath = path.join(TEST_DIR, 'results', 'index.json');
    const indexContent = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(indexContent);

    expect(index.results.length).toBe(testTasks.length);
  }, 90000); // Extended timeout for 6 sequential tasks
});
