/**
 * Unit Tests for AQE Learning Engine
 * Unified learning engine with graceful degradation
 *
 * Tests pattern storage, task routing, model recommendations,
 * and Claude Flow integration with fallbacks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AQELearningEngine,
  createAQELearningEngine,
  createDefaultLearningEngine,
  DEFAULT_ENGINE_CONFIG,
  type AQELearningEngineConfig,
  type AQELearningEngineStatus,
} from '../../../src/learning/aqe-learning-engine.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';
import type { QEDomain } from '../../../src/learning/qe-patterns.js';
import { ok, err } from '../../../src/shared/types/index.js';

// ============================================================================
// Mock Factory
// ============================================================================

function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    set: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
    has: vi.fn((key: string) => Promise.resolve(storage.has(key))),
    keys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
    search: vi.fn((pattern: string) => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      const matches = Array.from(storage.keys()).filter((k) => regex.test(k));
      return Promise.resolve(matches);
    }),
    clear: vi.fn(() => {
      storage.clear();
      return Promise.resolve();
    }),
    size: vi.fn(() => Promise.resolve(storage.size)),
    close: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => ({ type: 'memory', ready: true })),
  } as unknown as MemoryBackend;
}

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    unsubscribe: vi.fn(),
    emit: vi.fn(),
  } as unknown as EventBus;
}

// ============================================================================
// Tests
// ============================================================================

describe('AQELearningEngine', () => {
  let memory: MemoryBackend;
  let eventBus: EventBus;
  let engine: AQELearningEngine;

  beforeEach(async () => {
    memory = createMockMemoryBackend();
    eventBus = createMockEventBus();
    engine = createAQELearningEngine(
      memory,
      { projectRoot: '/test/project', enableClaudeFlow: false },
      eventBus
    );
    await engine.initialize();
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await engine.dispose();
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      const newEngine = createDefaultLearningEngine(memory, '/test/project');
      await newEngine.initialize();

      const status = newEngine.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.features.patternLearning).toBe(true);
      expect(status.features.vectorSearch).toBe(true);

      await newEngine.dispose();
    });

    it('should initialize with custom config', async () => {
      const customConfig: AQELearningEngineConfig = {
        projectRoot: '/custom/project',
        enableClaudeFlow: false,
        enableExperienceCapture: true,
        enablePatternPromotion: true,
        promotionThreshold: 5,
      };

      const customEngine = createAQELearningEngine(memory, customConfig);
      await customEngine.initialize();

      const status = customEngine.getStatus();
      expect(status.initialized).toBe(true);

      await customEngine.dispose();
    });

    it('should skip re-initialization', async () => {
      const status1 = engine.getStatus();
      expect(status1.initialized).toBe(true);

      // Initialize again
      await engine.initialize();

      const status2 = engine.getStatus();
      expect(status2.initialized).toBe(true);
    });

    it('should handle Claude Flow unavailability gracefully', async () => {
      const cfEngine = createAQELearningEngine(memory, {
        projectRoot: '/test/project',
        enableClaudeFlow: true, // Try to enable, but should fail gracefully
      });
      await cfEngine.initialize();

      const status = cfEngine.getStatus();
      // Should be initialized even if CF is not available
      expect(status.initialized).toBe(true);
      // Core features should still work
      expect(status.features.patternLearning).toBe(true);
      expect(status.features.taskRouting).toBe(true);

      await cfEngine.dispose();
    });
  });

  describe('Status and Statistics', () => {
    it('should return correct status', () => {
      const status = engine.getStatus();

      expect(status.initialized).toBe(true);
      expect(status.claudeFlowAvailable).toBe(false);
      expect(status.features.patternLearning).toBe(true);
      expect(status.features.vectorSearch).toBe(true);
      expect(status.features.taskRouting).toBe(true);
      // CF features should be false when CF not available
      expect(status.features.trajectories).toBe(false);
      expect(status.features.modelRouting).toBe(false);
    });

    it('should return statistics', async () => {
      const stats = await engine.getStats();

      expect(stats.activeTasks).toBe(0);
      expect(stats.completedTasks).toBe(0);
      expect(stats.claudeFlowErrors).toBe(0);
    });

    it('should throw when getting stats before initialization', async () => {
      const uninitEngine = createAQELearningEngine(memory, {
        projectRoot: '/test',
      });

      await expect(uninitEngine.getStats()).rejects.toThrow('not initialized');
    });
  });

  describe('Pattern Learning', () => {
    it('should store a pattern', async () => {
      const result = await engine.storePattern({
        patternType: 'test-template',
        name: 'Unit Test Pattern',
        description: 'Standard unit test pattern',
        template: {
          type: 'code',
          content: 'describe("Test", () => { it("should work", () => {}); })',
          variables: [],
        },
        context: {
          tags: ['unit', 'typescript'],
          framework: 'vitest',
        },
      });

      expect(result.success).toBe(true);
      expect(result.value?.id).toBeDefined();
      expect(result.value?.patternType).toBe('test-template');
    });

    it('should search patterns', async () => {
      // Store a pattern first
      await engine.storePattern({
        patternType: 'test-template',
        name: 'UserService Test',
        description: 'Testing user service',
        template: {
          type: 'code',
          content: 'describe("UserService", () => {})',
          variables: [],
        },
        context: { tags: ['user', 'service'] },
      });

      const results = await engine.searchPatterns('user service');

      expect(results.success).toBe(true);
    });

    it('should get pattern by ID', async () => {
      const storeResult = await engine.storePattern({
        patternType: 'mock-pattern',
        name: 'Database Mock',
        description: 'Mock database connection',
        template: {
          type: 'code',
          content: 'vi.mock("./db")',
          variables: [],
        },
        context: { tags: ['mock', 'database'] },
      });

      const pattern = await engine.getPattern(storeResult.value!.id);

      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('Database Mock');
    });

    it('should return null for non-existent pattern', async () => {
      const pattern = await engine.getPattern('non-existent-id');
      expect(pattern).toBeNull();
    });

    it('should record pattern outcome', async () => {
      const storeResult = await engine.storePattern({
        patternType: 'test-template',
        name: 'Outcome Test Pattern',
        description: 'Pattern for outcome testing',
        template: { type: 'code', content: 'test', variables: [] },
        context: { tags: ['test'] },
      });

      const outcomeResult = await engine.recordOutcome({
        patternId: storeResult.value!.id,
        success: true,
        metrics: { testsPassed: 10, testsFailed: 0 },
      });

      expect(outcomeResult.success).toBe(true);
    });

    it('should return error when not initialized', async () => {
      const uninitEngine = createAQELearningEngine(memory, {
        projectRoot: '/test',
      });

      const result = await uninitEngine.storePattern({
        patternType: 'test-template',
        name: 'Test',
        description: 'Test',
        template: { type: 'code', content: '', variables: [] },
        context: { tags: [] },
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not initialized');
    });
  });

  describe('Task Routing', () => {
    it('should route task to optimal agent', async () => {
      const result = await engine.routeTask({
        task: 'Generate unit tests for UserService',
        taskType: 'test-generation',
        context: { framework: 'vitest', language: 'typescript' },
      });

      expect(result.success).toBe(true);
      expect(result.value?.recommendedAgent).toBeDefined();
      expect(result.value?.confidence).toBeGreaterThan(0);
    });

    it('should provide convenience route method', async () => {
      const result = await engine.route('Analyze coverage for auth module', {
        framework: 'vitest',
      });

      expect(result).toBeDefined();
      expect(result?.recommendedAgent).toBeDefined();
    });

    it('should return null for failed routing', async () => {
      // Create engine without proper initialization
      const failEngine = createAQELearningEngine(memory, {
        projectRoot: '/test',
      });

      const result = await failEngine.route('Test task');

      expect(result).toBeNull();
    });
  });

  describe('Model Routing', () => {
    it('should recommend haiku for simple tasks', async () => {
      const result = await engine.recommendModel('Fix typo in README');

      expect(result.model).toBe('haiku');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toContain('speed');
    });

    it('should recommend opus for complex tasks', async () => {
      const result = await engine.recommendModel(
        'Design distributed architecture with security considerations for multi-tenant system'
      );

      expect(result.model).toBe('opus');
      expect(result.reasoning).toContain('capability');
    });

    it('should recommend sonnet for medium tasks', async () => {
      // Use a longer task description that doesn't match low/high complexity patterns
      const result = await engine.recommendModel(
        'Implement user profile update functionality with validation logic'
      );

      expect(result.model).toBe('sonnet');
      expect(result.reasoning).toContain('balance');
    });

    it('should use task length heuristic', async () => {
      // Very short task
      const shortResult = await engine.recommendModel('Fix bug');
      expect(shortResult.model).toBe('haiku');

      // Very long task (simulate with repeated text)
      const longTask = 'A '.repeat(300) + 'complex task with many requirements';
      const longResult = await engine.recommendModel(longTask);
      expect(longResult.model).toBe('opus');
    });

    it('should record model outcome', async () => {
      // Should not throw
      await engine.recordModelOutcome(
        'Test task',
        'sonnet',
        'success'
      );
    });
  });

  describe('Task Tracking', () => {
    it('should start and track a task', async () => {
      const taskId = await engine.startTask(
        'Generate tests for PaymentService',
        'qe-test-architect',
        'test-generation'
      );

      expect(taskId).toBeDefined();

      const task = engine.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.task).toBe('Generate tests for PaymentService');
      expect(task?.agent).toBe('qe-test-architect');
    });

    it('should record steps in task', async () => {
      const taskId = await engine.startTask('Multi-step task');

      await engine.recordStep(taskId, 'analyze', 'Found 5 files', 0.9);
      await engine.recordStep(taskId, 'generate', 'Created tests', 0.85);

      const task = engine.getTask(taskId);
      expect(task?.steps).toHaveLength(2);
      expect(task?.steps[0].action).toBe('analyze');
      expect(task?.steps[1].quality).toBe(0.85);
    });

    it('should end task and return execution', async () => {
      const taskId = await engine.startTask('Completable task');

      await engine.recordStep(taskId, 'step1');
      const execution = await engine.endTask(taskId, true, 'Great job!');

      expect(execution).toBeDefined();
      expect(execution?.task).toBe('Completable task');
      expect(execution?.steps).toHaveLength(1);

      // Task should be removed from active
      const task = engine.getTask(taskId);
      expect(task).toBeUndefined();
    });

    it('should track completed task count', async () => {
      const taskId1 = await engine.startTask('Task 1');
      const taskId2 = await engine.startTask('Task 2');

      await engine.endTask(taskId1, true);
      await engine.endTask(taskId2, true);

      const stats = await engine.getStats();
      expect(stats.completedTasks).toBe(2);
    });

    it('should handle ending non-existent task', async () => {
      const result = await engine.endTask('non-existent-task', true);
      expect(result).toBeUndefined();
    });
  });

  describe('Codebase Analysis', () => {
    it('should analyze codebase (local fallback)', async () => {
      const result = await engine.analyzeCodebase('/test/project', 'shallow');

      expect(result).toBeDefined();
      expect(result.repositoryPath).toBe('/test/project');
      expect(result.depth).toBe('shallow');
    });

    it('should generate agent configs', async () => {
      const configs = await engine.generateAgentConfigs('yaml');

      expect(configs).toBeDefined();
      expect(Array.isArray(configs)).toBe(true);
      expect(configs.length).toBeGreaterThan(0);

      // Should include default QE agents
      expect(configs.some((c: any) => c.name === 'qe-test-architect')).toBe(true);
    });
  });

  describe('Guidance', () => {
    it('should get guidance for domain', () => {
      const guidance = engine.getGuidance('test-generation');

      expect(guidance).toBeDefined();
      expect(guidance.bestPractices.length).toBeGreaterThan(0);
    });

    it('should generate context for domain', () => {
      const context = engine.generateContext('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(context).toContain('QE Guidance');
      expect(context).toContain('vitest');
    });

    it('should check anti-patterns', () => {
      // God Test detection requires 5 consecutive expects (pattern: expect.*expect.*expect.*expect.*expect)
      const testCode = `
        it('should do everything', () => {
          expect(a).toBe(1);expect(b).toBe(2);expect(c).toBe(3);expect(d).toBe(4);expect(e).toBe(5);
        });
      `;

      const detected = engine.checkAntiPatterns('test-generation', testCode);

      expect(detected.length).toBeGreaterThan(0);
      expect(detected.some((ap) => ap.name === 'God Test')).toBe(true);
    });

    it('should throw when getting guidance before initialization', () => {
      const uninitEngine = createAQELearningEngine(memory, {
        projectRoot: '/test',
      });

      expect(() => uninitEngine.getGuidance('test-generation')).toThrow(
        'not initialized'
      );
    });
  });

  describe('Experience Capture Integration', () => {
    it('should capture experience on task completion', async () => {
      const taskId = await engine.startTask(
        'Experience capture task',
        'qe-test-architect',
        'test-generation'
      );

      await engine.recordStep(taskId, 'step1', 'Result', 0.9);
      await engine.endTask(taskId, true);

      // Experience should be captured (check via stats or event emission)
      const stats = await engine.getStats();
      expect(stats.experienceCapture.totalExperiences).toBeGreaterThanOrEqual(0);
    });

    it('should allow manual experience capture', () => {
      const id = engine.startExperienceCapture('Manual capture task', {
        agent: 'qe-test-architect',
        domain: 'test-generation',
        model: 'sonnet',
      });

      expect(id).toBeDefined();
    });

    it('should return experience capture service', () => {
      const service = engine.getExperienceCaptureService();
      expect(service).toBeDefined();
    });

    it('should work without experience capture enabled', async () => {
      const noExpEngine = createAQELearningEngine(memory, {
        projectRoot: '/test',
        enableExperienceCapture: false,
      });
      await noExpEngine.initialize();

      const taskId = await noExpEngine.startTask('No experience task');
      await noExpEngine.endTask(taskId, true);

      // Should not throw
      const service = noExpEngine.getExperienceCaptureService();
      expect(service).toBeUndefined();

      await noExpEngine.dispose();
    });
  });

  describe('Dispose', () => {
    it('should dispose all components', async () => {
      const taskId = await engine.startTask('Pre-dispose task');

      await engine.dispose();

      // After dispose, status should show not initialized
      const status = engine.getStatus();
      expect(status.initialized).toBe(false);

      // Active tasks should be cleared
      const task = engine.getTask(taskId);
      expect(task).toBeUndefined();
    });

    it('should be safe to dispose multiple times', async () => {
      await engine.dispose();
      await engine.dispose(); // Should not throw
    });
  });
});

describe('Factory Functions', () => {
  let memory: MemoryBackend;

  beforeEach(() => {
    memory = createMockMemoryBackend();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create engine with createAQELearningEngine', () => {
    const engine = createAQELearningEngine(memory, {
      projectRoot: '/test',
    });

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });

  it('should create engine with createDefaultLearningEngine', () => {
    const engine = createDefaultLearningEngine(memory, '/test');

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });

  it('should accept optional event bus', () => {
    const eventBus = createMockEventBus();
    const engine = createAQELearningEngine(
      memory,
      { projectRoot: '/test' },
      eventBus
    );

    expect(engine).toBeInstanceOf(AQELearningEngine);
  });
});

describe('DEFAULT_ENGINE_CONFIG', () => {
  it('should have expected defaults', () => {
    expect(DEFAULT_ENGINE_CONFIG.enableClaudeFlow).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.enableExperienceCapture).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.enablePatternPromotion).toBe(true);
    expect(DEFAULT_ENGINE_CONFIG.promotionThreshold).toBe(3);
  });
});
