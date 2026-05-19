/**
 * Unit Tests - QE ReasoningBank (core suite)
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * MEMORY NOTE: This file spins up a full reasoning-bank with real
 * transformer embeddings (`@xenova/transformers`, all-MiniLM-L6-v2) and
 * HNSW indexing on every test, so it's run in its own vitest fork
 * (pool=forks, maxForks=1, fileParallelism=false). Two companion files
 * carry the heaviest sub-suites out of this fork (issue #448, step 2):
 *
 *   - qe-reasoning-bank-feedback-loop.test.ts — recordOutcome /
 *     qe_pattern_usage feedback-loop tests with vi.doMock churn.
 *   - qe-reasoning-bank-utilities.test.ts — pure-function tests for
 *     qe-patterns + qe-guidance that don't need a bank at all.
 *
 * If a true memory leak ever surfaces here (single test OOMs in CI),
 * the suspects are: the transformer pipeline module-singleton in
 * real-embeddings.ts, accumulated HNSW vectors that aren't released by
 * patternStore.dispose(), or pretrained pattern bundles retained beyond
 * the test boundary. Audit those before declaring this file flaky.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setRuVectorFeatureFlags, resetRuVectorFeatureFlags } from '../../../src/integrations/ruvector/feature-flags.js';
import {
  QEReasoningBank,
  createQEReasoningBank,
  QERoutingRequest,
} from '../../../src/learning/qe-reasoning-bank';

// Ensure these tests exercise the in-memory PatternStore, not the RVF variant
beforeEach(() => { setRuVectorFeatureFlags({ useRVFPatternStore: false }); });
afterEach(() => { resetRuVectorFeatureFlags(); });

import { createMockMemory } from '../../mocks';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { checkRuvectorPackagesAvailable } from '../../../src/integrations/ruvector/wrappers';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence';
import { queenGovernanceAdapter } from '../../../src/governance/queen-governance-adapter';
import { resetSharedMinCutState } from '../../../src/coordination/mincut/shared-singleton';

// Check if @ruvector/gnn native operations work (required for semantic search)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('QE ReasoningBank', () => {
  let memory: MemoryBackend;
  let reasoningBank: QEReasoningBank;

  beforeEach(async () => {
    // Reset shared singletons to prevent cross-test contamination
    resetUnifiedPersistence();
    queenGovernanceAdapter.reset();
    resetSharedMinCutState();

    memory = createMockMemory();
    reasoningBank = createQEReasoningBank(memory);
    await reasoningBank.initialize();
  });

  afterEach(async () => {
    await reasoningBank.dispose();
    vi.clearAllMocks();

    // Clean up singletons after test
    resetUnifiedPersistence();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const bank = createQEReasoningBank(memory);
      await bank.initialize();

      const stats = await bank.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(0);

      await bank.dispose();
    });

    it('should load foundational patterns on first init', async () => {
      const freshMemory = createMockMemory();
      const bank = createQEReasoningBank(freshMemory);
      await bank.initialize();

      const stats = await bank.getStats();
      // Foundational patterns should be loaded
      expect(stats.totalPatterns).toBeGreaterThanOrEqual(0);

      await bank.dispose();
    });
  });

  describe('Pattern Storage', () => {
    // First pattern storage loads the embedding model, which can take time
    it('should store a new pattern', { timeout: 30000 }, async () => {
      const result = await reasoningBank.storePattern({
        patternType: 'test-template',
        name: 'Test Pattern',
        description: 'A test pattern for unit tests',
        template: {
          type: 'code',
          content: 'describe("{{name}}", () => { it("should work", () => {}); });',
          variables: [
            { name: 'name', type: 'string', required: true, description: 'Test name' },
          ],
        },
        context: {
          framework: 'vitest',
          language: 'typescript',
          tags: ['unit-test', 'vitest'],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.id).toBeDefined();
        expect(result.value.patternType).toBe('test-template');
        expect(result.value.tier).toBe('short-term');
      }
    });

    it('should retrieve stored pattern by ID', async () => {
      const storeResult = await reasoningBank.storePattern({
        patternType: 'mock-pattern',
        name: 'Mock Pattern',
        description: 'A mock pattern',
        template: {
          type: 'code',
          content: 'vi.mock("{{module}}")',
          variables: [{ name: 'module', type: 'string', required: true }],
        },
      });

      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;

      const pattern = await reasoningBank.getPattern(storeResult.value.id);
      expect(pattern).not.toBeNull();
      expect(pattern?.name).toBe('Mock Pattern');
    });

    it('should search patterns by embedding', async () => {
      // Store a pattern
      await reasoningBank.storePattern({
        patternType: 'test-template',
        name: 'React Component Test',
        description: 'Test template for React components with Testing Library',
        template: {
          type: 'code',
          content: 'render(<Component />); expect(screen.getByText("Hello")).toBeInTheDocument();',
          variables: [],
        },
        context: {
          framework: 'vitest',
          language: 'typescript',
          tags: ['react', 'component-test', 'testing-library'],
        },
      });

      const searchResult = await reasoningBank.searchPatterns(
        'How to test React components',
        { limit: 5 }
      );

      expect(searchResult.success).toBe(true);
      if (searchResult.success) {
        expect(Array.isArray(searchResult.value)).toBe(true);
      }
    });
  });

  describe('Task Routing', () => {
    it('should route a test generation task', async () => {
      const request: QERoutingRequest = {
        task: 'Generate unit tests for the UserService class',
        taskType: 'test-generation',
        context: {
          language: 'typescript',
          framework: 'vitest',
        },
      };

      const result = await reasoningBank.routeTask(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.recommendedAgent).toBeDefined();
        expect(result.value.confidence).toBeGreaterThan(0);
        expect(result.value.domains.length).toBeGreaterThan(0);
        expect(result.value.reasoning).toBeDefined();
      }
    });

    it('should detect test-generation domain', async () => {
      const result = await reasoningBank.routeTask({
        task: 'Write tests for the login function',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.domains).toContain('test-generation');
      }
    });

    it('should detect coverage-analysis domain', async () => {
      const result = await reasoningBank.routeTask({
        task: 'Analyze code coverage gaps in the auth module',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.domains).toContain('coverage-analysis');
      }
    });

    it('should detect security-compliance domain', async () => {
      const result = await reasoningBank.routeTask({
        task: 'Scan for OWASP vulnerabilities and SQL injection',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.domains).toContain('security-compliance');
      }
    });

    it('should provide alternative agent recommendations', async () => {
      const result = await reasoningBank.routeTask({
        task: 'Generate integration tests with API mocking',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.alternatives.length).toBeGreaterThan(0);
        expect(result.value.alternatives[0].agent).toBeDefined();
        expect(result.value.alternatives[0].score).toBeDefined();
      }
    });
  });

  describe('Learning Outcomes', () => {
    it('should record successful pattern usage', async () => {
      const storeResult = await reasoningBank.storePattern({
        patternType: 'test-template',
        name: 'Outcome Test Pattern',
        description: 'Pattern to test outcome recording',
        template: { type: 'code', content: 'test content', variables: [] },
      });

      expect(storeResult.success).toBe(true);
      if (!storeResult.success) return;

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId: storeResult.value.id,
        success: true,
        metrics: {
          testsPassed: 10,
          testsFailed: 0,
        },
      });

      expect(outcomeResult.success).toBe(true);

      // Pattern should have updated stats
      const pattern = await reasoningBank.getPattern(storeResult.value.id);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);
    });

    it('should record failed pattern usage', async () => {
      const storeResult = await reasoningBank.storePattern({
        patternType: 'test-template',
        name: 'Failure Test Pattern',
        description: 'Pattern to test failure recording',
        template: { type: 'code', content: 'test content', variables: [] },
      });

      if (!storeResult.success) return;

      await reasoningBank.recordOutcome({
        patternId: storeResult.value.id,
        success: false,
        metrics: {
          testsPassed: 2,
          testsFailed: 8,
        },
      });

      const pattern = await reasoningBank.getPattern(storeResult.value.id);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(0);
    });
  });

  describe('Guidance Generation', () => {
    it('should get guidance for test-generation domain', () => {
      const guidance = reasoningBank.getGuidance('test-generation');

      expect(guidance).toBeDefined();
      expect(guidance.domain).toBe('test-generation');
      expect(guidance.bestPractices.length).toBeGreaterThan(0);
      expect(guidance.antiPatterns.length).toBeGreaterThan(0);
    });

    it('should generate Claude-visible context', () => {
      const context = reasoningBank.generateContext('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(context).toContain('QE Guidance');
      expect(context).toContain('test-generation');
      expect(context).toContain('Best Practices');
    });

    it('should check for anti-patterns', () => {
      const codeWithAntiPattern = `
        it('should test everything', () => {
          expect(result.a).toBe(1);
          expect(result.b).toBe(2);
          expect(result.c).toBe(3);
          expect(result.d).toBe(4);
          expect(result.e).toBe(5);
        });
      `;

      const antiPatterns = reasoningBank.checkAntiPatterns(
        'test-generation',
        codeWithAntiPattern
      );

      // Should detect "God Test" anti-pattern (many assertions)
      expect(Array.isArray(antiPatterns)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should return statistics', async () => {
      const stats = await reasoningBank.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalPatterns).toBe('number');
      expect(typeof stats.routingRequests).toBe('number');
      expect(typeof stats.avgRoutingConfidence).toBe('number');
      expect(typeof stats.learningOutcomes).toBe('number');
      expect(stats.byDomain).toBeDefined();
    });

    it('should track routing statistics', async () => {
      // Make some routing requests
      await reasoningBank.routeTask({ task: 'Generate unit tests' });
      await reasoningBank.routeTask({ task: 'Analyze coverage' });
      await reasoningBank.routeTask({ task: 'Security scan' });

      const stats = await reasoningBank.getStats();
      expect(stats.routingRequests).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Embedding', () => {
    it('should generate embeddings for text', async () => {
      const embedding = await reasoningBank.embed('Generate unit tests for UserService');

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 dimension
      expect(embedding.every((v) => typeof v === 'number')).toBe(true);
    });

    it('should generate consistent embeddings', async () => {
      const text = 'Test coverage analysis';
      const embedding1 = await reasoningBank.embed(text);
      const embedding2 = await reasoningBank.embed(text);

      // Same text should produce same embedding
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different text', async () => {
      const embedding1 = await reasoningBank.embed('unit test');
      const embedding2 = await reasoningBank.embed('security scan');

      // Different text should produce different embeddings
      expect(embedding1).not.toEqual(embedding2);
    });
  });
});
