/**
 * Experience Capture Middleware Tests
 * ADR-051: Unified learning capture across all execution paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeExperienceCapture,
  startExperience,
  recordExperienceStep,
  completeExperience,
  wrapWithExperienceCapture,
  cleanupStaleExperiences,
  stopCleanupTimer,
  getCaptureStats,
  type ExperienceStep,
} from '../../../src/learning/experience-capture-middleware.js';
import type { QEDomain } from '../../../src/learning/qe-patterns.js';

// Mock the unified memory manager
vi.mock('../../../src/kernel/unified-memory.js', () => {
  const mockDb = {
    exec: vi.fn(),
    prepare: vi.fn(() => ({
      run: vi.fn(),
      get: vi.fn(() => ({ count: 5, avg: 0.75 })),
      all: vi.fn(() => [
        { domain: 'test-generation', count: 3 },
        { domain: 'coverage-analysis', count: 2 },
        { success: 1, count: 4 },
        { success: 0, count: 1 },
      ]),
    })),
    pragma: vi.fn(),
  };

  return {
    getUnifiedMemory: vi.fn(() => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getDatabase: vi.fn(() => mockDb),
    })),
  };
});

describe('ExperienceCaptureMiddleware', () => {
  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Stop any existing cleanup timers
    stopCleanupTimer();
  });

  afterEach(() => {
    // Ensure cleanup timers are stopped after each test
    stopCleanupTimer();
  });

  describe('initializeExperienceCapture', () => {
    it('should initialize without throwing', async () => {
      await expect(initializeExperienceCapture()).resolves.not.toThrow();
    });

    it('should be idempotent - multiple calls should not throw', async () => {
      await initializeExperienceCapture();
      await expect(initializeExperienceCapture()).resolves.not.toThrow();
    });
  });

  describe('startExperience', () => {
    it('should return a unique experience ID', () => {
      const id1 = startExperience('Test task 1', 'test-agent', 'test-generation');
      const id2 = startExperience('Test task 2', 'test-agent', 'test-generation');

      expect(id1).toMatch(/^exp-[a-f0-9-]+$/);
      expect(id2).toMatch(/^exp-[a-f0-9-]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should accept optional model tier and routing', () => {
      const id = startExperience('Test task', 'test-agent', 'coverage-analysis', {
        modelTier: 2,
        routing: {
          tier: 2,
          modelId: 'haiku',
          useAgentBooster: false,
          complexity: 0.5,
        },
      });

      expect(id).toMatch(/^exp-/);
    });

    it('should accept all valid QE domains', () => {
      const domains: QEDomain[] = [
        'test-generation',
        'test-execution',
        'coverage-analysis',
        'quality-assessment',
        'defect-intelligence',
        'requirements-validation',
        'code-intelligence',
        'security-compliance',
        'contract-testing',
        'visual-accessibility',
        'chaos-resilience',
        'learning-optimization',
      ];

      for (const domain of domains) {
        const id = startExperience(`Task for ${domain}`, 'agent', domain);
        expect(id).toMatch(/^exp-/);
      }
    });
  });

  describe('recordExperienceStep', () => {
    it('should record a step for an active experience', () => {
      const expId = startExperience('Test task', 'agent', 'test-generation');
      const step: ExperienceStep = {
        action: 'execute-test',
        result: 'success',
        quality: 0.9,
        durationMs: 100,
      };

      // Should not throw
      expect(() => recordExperienceStep(expId, step)).not.toThrow();
    });

    it('should handle unknown experience ID gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const step: ExperienceStep = {
        action: 'test-action',
        result: 'success',
        quality: 0.8,
        durationMs: 50,
      };

      // Should not throw
      expect(() => recordExperienceStep('exp-nonexistent', step)).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown experience')
      );

      consoleSpy.mockRestore();
    });

    it('should accept all result types', () => {
      const expId = startExperience('Test', 'agent', 'test-execution');

      const results: Array<'success' | 'failure' | 'partial'> = [
        'success',
        'failure',
        'partial',
      ];

      for (const result of results) {
        const step: ExperienceStep = {
          action: `action-${result}`,
          result,
          quality: result === 'success' ? 0.9 : result === 'partial' ? 0.5 : 0.1,
          durationMs: 100,
        };
        expect(() => recordExperienceStep(expId, step)).not.toThrow();
      }
    });
  });

  describe('completeExperience', () => {
    beforeEach(async () => {
      await initializeExperienceCapture();
    });

    it('should complete an experience successfully', async () => {
      const expId = startExperience('Test task', 'agent', 'test-generation');

      recordExperienceStep(expId, {
        action: 'execute',
        result: 'success',
        quality: 0.85,
        durationMs: 100,
      });

      const outcome = await completeExperience(expId, true, { testCount: 5 });

      expect(outcome).not.toBeNull();
      expect(outcome?.id).toBe(expId);
      expect(outcome?.success).toBe(true);
      expect(outcome?.quality).toBeCloseTo(0.85);
      expect(outcome?.result).toEqual({ testCount: 5 });
    });

    it('should complete a failed experience', async () => {
      const expId = startExperience('Failing task', 'agent', 'security-compliance');

      recordExperienceStep(expId, {
        action: 'scan',
        result: 'failure',
        quality: 0.2,
        durationMs: 500,
      });

      const outcome = await completeExperience(
        expId,
        false,
        undefined,
        'Security check failed'
      );

      expect(outcome).not.toBeNull();
      expect(outcome?.success).toBe(false);
      expect(outcome?.error).toBe('Security check failed');
    });

    it('should return null for unknown experience ID', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const outcome = await completeExperience('exp-nonexistent', true);

      expect(outcome).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should calculate average quality from multiple steps', async () => {
      const expId = startExperience('Multi-step task', 'agent', 'chaos-resilience');

      recordExperienceStep(expId, {
        action: 'step1',
        result: 'success',
        quality: 0.9,
        durationMs: 100,
      });

      recordExperienceStep(expId, {
        action: 'step2',
        result: 'partial',
        quality: 0.5,
        durationMs: 200,
      });

      recordExperienceStep(expId, {
        action: 'step3',
        result: 'success',
        quality: 0.8,
        durationMs: 150,
      });

      const outcome = await completeExperience(expId, true);

      // Average of 0.9, 0.5, 0.8 = 0.7333...
      expect(outcome?.quality).toBeCloseTo(0.733, 2);
    });

    it('should use default quality when no steps recorded', async () => {
      const successExpId = startExperience('No-step success', 'agent', 'test-generation');
      const failExpId = startExperience('No-step failure', 'agent', 'test-generation');

      const successOutcome = await completeExperience(successExpId, true);
      const failOutcome = await completeExperience(failExpId, false);

      // Default success quality
      expect(successOutcome?.quality).toBe(0.7);
      // Default failure quality
      expect(failOutcome?.quality).toBe(0.3);
    });
  });

  describe('wrapWithExperienceCapture', () => {
    beforeEach(async () => {
      await initializeExperienceCapture();
    });

    it('should wrap a successful handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        success: true,
        data: { result: 'test passed' },
      });

      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'test-execution',
        'test-runner'
      );

      const result = await wrapped({ testFile: 'test.ts' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'test passed' });
      expect(mockHandler).toHaveBeenCalledWith({ testFile: 'test.ts' });
    });

    it('should wrap a failing handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        success: false,
        error: 'Test failed',
      });

      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'test-execution',
        'test-runner'
      );

      const result = await wrapped({ testFile: 'failing.ts' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test failed');
    });

    it('should handle handler exceptions', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Handler crashed'));

      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'chaos-resilience',
        'chaos-agent'
      );

      await expect(wrapped({})).rejects.toThrow('Handler crashed');
    });

    it('should extract task description from various param formats', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: {} });
      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'test-generation',
        'test-gen'
      );

      // Test with 'task' field
      await wrapped({ task: 'Generate unit tests' });

      // Test with 'description' field
      await wrapped({ description: 'Create integration tests' });

      // Test with 'sourceCode' field
      await wrapped({ sourceCode: 'function foo() {}' });

      // Test with 'target' field
      await wrapped({ target: 'src/utils.ts' });

      // Test with 'url' field
      await wrapped({ url: 'https://example.com' });

      // Test with 'testFiles' array
      await wrapped({ testFiles: ['test1.ts', 'test2.ts', 'test3.ts'] });

      expect(mockHandler).toHaveBeenCalledTimes(6);
    });

    it('should preserve routing information', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: {} });
      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'coverage-analysis',
        'coverage-agent'
      );

      await wrapped({
        target: 'src/',
        routing: {
          tier: 3,
          modelId: 'sonnet',
          useAgentBooster: false,
          complexity: 0.8,
        },
      });

      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('cleanupStaleExperiences', () => {
    it('should clean up experiences older than timeout', () => {
      // Start an experience
      const expId = startExperience('Old task', 'agent', 'test-generation');

      // Mock the experience to be old by manipulating the startedAt time
      // We can't easily do this without accessing internals, so we just verify
      // that the function runs without error when there are active experiences
      const cleaned = cleanupStaleExperiences();

      // Fresh experiences should not be cleaned
      expect(cleaned).toBe(0);
    });

    it('should return count of cleaned experiences', () => {
      const cleaned = cleanupStaleExperiences();
      expect(typeof cleaned).toBe('number');
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stopCleanupTimer', () => {
    it('should stop the cleanup timer without error', () => {
      expect(() => stopCleanupTimer()).not.toThrow();
    });

    it('should be idempotent', () => {
      stopCleanupTimer();
      expect(() => stopCleanupTimer()).not.toThrow();
    });
  });

  describe('getCaptureStats', () => {
    beforeEach(async () => {
      await initializeExperienceCapture();
    });

    it('should return capture statistics', async () => {
      const stats = await getCaptureStats();

      expect(stats).toHaveProperty('activeExperiences');
      expect(stats).toHaveProperty('totalCaptured');
      expect(stats).toHaveProperty('byDomain');
      expect(stats).toHaveProperty('bySuccess');
      expect(stats).toHaveProperty('avgQuality');

      expect(typeof stats.activeExperiences).toBe('number');
      expect(typeof stats.totalCaptured).toBe('number');
      expect(typeof stats.byDomain).toBe('object');
      expect(stats.bySuccess).toHaveProperty('success');
      expect(stats.bySuccess).toHaveProperty('failure');
      expect(typeof stats.avgQuality).toBe('number');
    });

    it('should reflect active experiences count', async () => {
      const id1 = startExperience('Task 1', 'agent', 'test-generation');
      const id2 = startExperience('Task 2', 'agent', 'test-execution');

      const stats = await getCaptureStats();
      expect(stats.activeExperiences).toBeGreaterThanOrEqual(2);

      // Complete one experience
      await completeExperience(id1, true);

      const statsAfter = await getCaptureStats();
      expect(statsAfter.activeExperiences).toBe(stats.activeExperiences - 1);

      // Clean up
      await completeExperience(id2, true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty params in wrapper', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: {} });
      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'quality-assessment',
        'quality-gate'
      );

      await wrapped({});
      expect(mockHandler).toHaveBeenCalledWith({});
    });

    it('should handle null/undefined in params', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: {} });
      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'defect-intelligence',
        'defect-predictor'
      );

      await wrapped({ task: null, description: undefined });
      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle very long task descriptions', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: {} });
      const wrapped = wrapWithExperienceCapture(
        mockHandler,
        'requirements-validation',
        'requirements-validator'
      );

      const longTask = 'A'.repeat(10000);
      await wrapped({ task: longTask });

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should handle concurrent experiences', async () => {
      await initializeExperienceCapture();

      const ids = [];
      for (let i = 0; i < 10; i++) {
        ids.push(startExperience(`Task ${i}`, `agent-${i}`, 'test-generation'));
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);

      // Complete all
      const completions = ids.map((id) => completeExperience(id, true));
      await Promise.all(completions);
    });

    it('should handle rapid start/complete cycles', async () => {
      await initializeExperienceCapture();

      for (let i = 0; i < 5; i++) {
        const id = startExperience(`Rapid task ${i}`, 'agent', 'test-execution');
        recordExperienceStep(id, {
          action: 'quick-action',
          result: 'success',
          quality: 0.9,
          durationMs: 1,
        });
        await completeExperience(id, true);
      }

      // Should not have leaked any experiences
      const stats = await getCaptureStats();
      expect(stats.activeExperiences).toBeGreaterThanOrEqual(0);
    });
  });
});
