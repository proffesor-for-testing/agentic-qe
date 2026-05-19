/**
 * Unit Tests for AQE Learning Engine (core suite)
 *
 * Unified learning engine with graceful degradation. Covers initialization,
 * status, routing (task + model), codebase analysis, guidance, and dispose.
 * The heaviest sub-suites live in companion files (issue #448, step 2):
 *
 *   - aqe-learning-engine-patterns.test.ts — Pattern Learning + Task
 *     Tracking + Experience Capture Integration.
 *   - aqe-learning-engine-factory.test.ts — Factory functions +
 *     DEFAULT_ENGINE_CONFIG (no `engine.initialize()` overhead).
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import { clearEmbeddingCache, resetInitialization } from '../../../src/learning/real-embeddings';
import { _resetWitnessChainForTests } from '../../../src/audit/witness-chain';

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

import {
  AQELearningEngine,
  createAQELearningEngine,
  createDefaultLearningEngine,
  DEFAULT_ENGINE_CONFIG,
  type AQELearningEngineConfig,
} from '../../../src/learning/aqe-learning-engine.js';
import type { MemoryBackend, EventBus } from '../../../src/kernel/interfaces.js';
import { createMockMemoryBackend, createMockEventBus } from './_aqe-engine-test-helpers';

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
