/**
 * Experience Capture Integration Tests
 *
 * These tests verify ACTUAL functionality, not mocked behavior.
 * They use real PatternStore, real memory, and verify patterns are created/promoted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ExperienceCaptureService,
  createExperienceCaptureService,
  DEFAULT_EXPERIENCE_CONFIG,
  type TaskExperience,
} from '../../src/learning/experience-capture.js';
import { PatternStore, createPatternStore } from '../../src/learning/pattern-store.js';
import { MemoryBackend, EventBus } from '../../src/kernel/interfaces.js';
import { InMemoryBackend } from '../../src/kernel/memory-backend.js';
import { InMemoryEventBus } from '../../src/kernel/event-bus.js';
import type { QEDomain } from '../../src/learning/qe-patterns.js';

describe('ExperienceCaptureService Integration', () => {
  let service: ExperienceCaptureService;
  let patternStore: PatternStore;
  let memory: MemoryBackend;
  let eventBus: EventBus;

  beforeEach(async () => {
    // Use REAL implementations, not mocks
    memory = new InMemoryBackend();
    await memory.initialize();
    eventBus = new InMemoryEventBus();

    // Real PatternStore with memory
    patternStore = createPatternStore(memory, {
      promotionThreshold: 3,
    });
    await patternStore.initialize();

    // Real ExperienceCaptureService
    service = createExperienceCaptureService(memory, patternStore, eventBus, {
      ...DEFAULT_EXPERIENCE_CONFIG,
      promotionThreshold: 3,
      minQualityForPatternExtraction: 0.7,
    });
    await service.initialize();
  });

  afterEach(async () => {
    await service.dispose();
    await patternStore.dispose();
  });

  describe('Pattern Creation from Experience', () => {
    it('should ACTUALLY create a pattern from a successful high-quality experience', async () => {
      // Capture an experience
      const experienceId = service.startCapture('Generate unit tests for UserService', {
        domain: 'test-generation' as QEDomain,
        agent: 'qe-test-architect',
      });

      // Record meaningful steps
      service.recordStep(experienceId, {
        action: 'analyze-code',
        result: 'Found 5 public methods in UserService',
        quality: 0.9,
      });

      service.recordStep(experienceId, {
        action: 'generate-tests',
        result: 'Generated 5 unit tests with assertions',
        quality: 0.95,
      });

      // Complete with high quality
      const result = await service.completeCapture(experienceId, {
        success: true,
        quality: 0.92,
      });

      expect(result.success).toBe(true);

      // VERIFY: Pattern was actually created in the store
      const searchResult = await patternStore.search('Generate unit tests for UserService', {
        domain: 'test-generation' as QEDomain,
        limit: 5,
      });

      expect(searchResult.success).toBe(true);
      // Pattern should have been created
      expect(searchResult.value.length).toBeGreaterThan(0);

      // Verify pattern has correct domain
      const pattern = searchResult.value[0].pattern;
      expect(pattern.domain).toBe('test-generation');
      expect(pattern.tier).toBe('short-term'); // Not promoted yet
    });

    it('should NOT create pattern from low-quality experience', async () => {
      const experienceId = service.startCapture('Failed task', {
        domain: 'test-generation' as QEDomain,
      });

      // Complete with low quality
      await service.completeCapture(experienceId, {
        success: false,
        quality: 0.3,
      });

      // VERIFY: No pattern was created
      const searchResult = await patternStore.search('Failed task', {
        domain: 'test-generation' as QEDomain,
        limit: 5,
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.value.length).toBe(0);
    });
  });

  describe('Pattern Promotion', () => {
    it('should ACTUALLY promote pattern after 3 successful uses', async () => {
      const taskDescription = 'Generate tests for payment module';

      // Use the same pattern 3 times with high quality
      for (let i = 0; i < 3; i++) {
        const experienceId = service.startCapture(taskDescription, {
          domain: 'test-generation' as QEDomain,
          agent: 'qe-test-architect',
        });

        service.recordStep(experienceId, {
          action: 'analyze',
          result: `Analysis iteration ${i + 1}`,
          quality: 0.9,
        });

        service.recordStep(experienceId, {
          action: 'generate',
          result: `Generated tests iteration ${i + 1}`,
          quality: 0.9,
        });

        await service.completeCapture(experienceId, {
          success: true,
          quality: 0.9,
        });
      }

      // VERIFY: Pattern should be promoted to long-term
      const searchResult = await patternStore.search(taskDescription, {
        domain: 'test-generation' as QEDomain,
        limit: 1,
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.value.length).toBeGreaterThan(0);

      const pattern = searchResult.value[0].pattern;
      expect(pattern.usageCount).toBeGreaterThanOrEqual(3);
      // After 3 uses, should be promoted
      expect(pattern.tier).toBe('long-term');
    });

    it('should NOT promote pattern before threshold', async () => {
      const taskDescription = 'Generate tests for auth module';

      // Use only 2 times (below threshold of 3)
      for (let i = 0; i < 2; i++) {
        const experienceId = service.startCapture(taskDescription, {
          domain: 'test-generation' as QEDomain,
        });

        service.recordStep(experienceId, {
          action: 'generate',
          result: `Iteration ${i + 1}`,
          quality: 0.9,
        });

        await service.completeCapture(experienceId, {
          success: true,
          quality: 0.9,
        });
      }

      // VERIFY: Pattern should still be short-term
      const searchResult = await patternStore.search(taskDescription, {
        domain: 'test-generation' as QEDomain,
        limit: 1,
      });

      expect(searchResult.success).toBe(true);
      if (searchResult.value.length > 0) {
        const pattern = searchResult.value[0].pattern;
        expect(pattern.tier).toBe('short-term');
      }
    });
  });

  describe('Cross-Domain Sharing', () => {
    it('should share experience with related domains', async () => {
      const experienceId = service.startCapture('Analyze test coverage gaps', {
        domain: 'coverage-analysis' as QEDomain,
        agent: 'qe-coverage-specialist',
      });

      service.recordStep(experienceId, {
        action: 'analyze',
        result: 'Found 5 untested functions',
        quality: 0.95,
      });

      const result = await service.completeCapture(experienceId, {
        success: true,
        quality: 0.9,
      });

      expect(result.success).toBe(true);

      // Share across domains
      if (result.success) {
        await service.shareAcrossDomains(result.value);
      }

      // VERIFY: Experience reference was stored for related domains
      // coverage-analysis relates to test-generation and test-execution
      const sharedKey = await memory.get(`${DEFAULT_EXPERIENCE_CONFIG.namespace}:shared:test-generation:${experienceId}`);

      // Should have shared reference
      expect(sharedKey).toBeDefined();
    });
  });

  describe('Event Emission', () => {
    it('should emit learning.ExperienceCaptured event with full experience', async () => {
      let capturedEvent: any = null;

      // Subscribe to event
      eventBus.subscribe('learning.ExperienceCaptured', async (event) => {
        capturedEvent = event;
      });

      const experienceId = service.startCapture('Test event emission', {
        domain: 'test-generation' as QEDomain,
      });

      service.recordStep(experienceId, {
        action: 'test',
        result: 'testing event',
        quality: 0.8,
      });

      await service.completeCapture(experienceId, {
        success: true,
        quality: 0.85,
      });

      // Give async event time to process
      await new Promise((resolve) => setTimeout(resolve, 10));

      // VERIFY: Event was emitted with full experience
      expect(capturedEvent).not.toBeNull();
      expect(capturedEvent.type).toBe('learning.ExperienceCaptured');
      expect(capturedEvent.payload.experience).toBeDefined();
      expect(capturedEvent.payload.experience.id).toBe(experienceId);
      expect(capturedEvent.payload.experience.success).toBe(true);
      expect(capturedEvent.payload.experience.quality).toBe(0.85);
    });
  });

  describe('Statistics Accuracy', () => {
    it('should track accurate statistics across multiple experiences', async () => {
      // Create 3 successful, 1 failed experience
      for (let i = 0; i < 3; i++) {
        const id = service.startCapture(`Success task ${i}`, {
          domain: 'test-generation' as QEDomain,
        });
        service.recordStep(id, { action: 'work', result: 'done', quality: 0.9 });
        await service.completeCapture(id, { success: true, quality: 0.9 });
      }

      const failedId = service.startCapture('Failed task', {
        domain: 'test-execution' as QEDomain,
      });
      await service.completeCapture(failedId, { success: false, quality: 0.2 });

      // VERIFY: Statistics are accurate
      const stats = await service.getStats();

      expect(stats.totalExperiences).toBe(4);
      expect(stats.successRate).toBeCloseTo(0.75, 2); // 3/4 = 0.75
      expect(stats.patternsExtracted).toBeGreaterThanOrEqual(3); // From successful experiences
    });
  });
});
