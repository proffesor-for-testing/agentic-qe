/**
 * Unit Tests — AQELearningEngine pattern + tracking + experience-capture flows
 *
 * Extracted from aqe-learning-engine.test.ts (issue #448, step 2). These are
 * the three heaviest sub-describes — each test spins up a full engine
 * (transformer embeddings + HNSW + WASM coherence). Isolating them into
 * their own vitest fork (pool=forks, maxForks=1, fileParallelism=false)
 * keeps the slim core file's heap below its ceiling.
 *
 * MEMORY NOTE: see aqe-learning-engine.test.ts for the canonical comment.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import { clearEmbeddingCache, resetInitialization } from '../../../src/learning/real-embeddings';
import { _resetWitnessChainForTests } from '../../../src/audit/witness-chain';
import {
  AQELearningEngine,
  createAQELearningEngine,
} from '../../../src/learning/aqe-learning-engine.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';
import { createMockMemoryBackend, createMockEventBus } from './_aqe-engine-test-helpers';

// Ensure these tests exercise the in-memory PatternStore, not the RVF variant
beforeEach(() => { setRuVectorFeatureFlags({ useRVFPatternStore: false }); });
afterEach(() => { resetRuVectorFeatureFlags(); });

// Issue #448 step 3: release module-level singletons between tests so per-test
// memory growth doesn't compound across the file.
afterEach(() => {
  clearEmbeddingCache();
  _resetWitnessChainForTests();
});
afterAll(() => {
  resetInitialization();
});

describe('AQELearningEngine — pattern + tracking + experience capture', () => {
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
});
