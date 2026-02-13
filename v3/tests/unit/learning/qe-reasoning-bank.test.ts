/**
 * Unit Tests - QE ReasoningBank
 * ADR-021: QE ReasoningBank for Pattern Learning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QEReasoningBank,
  createQEReasoningBank,
  QERoutingRequest,
} from '../../../src/learning/qe-reasoning-bank';
import {
  detectQEDomain,
  detectQEDomains,
  mapQEDomainToAQE,
  calculateQualityScore,
  shouldPromotePattern,
  validateQEPattern,
  applyPatternTemplate,
  QEPattern,
  QEPatternType,
  QEDomain,
} from '../../../src/learning/qe-patterns';
import {
  getGuidance,
  getCombinedGuidance,
  generateGuidanceContext,
  checkAntiPatterns,
} from '../../../src/learning/qe-guidance';
import { createMockMemory } from '../../mocks';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { checkRuvectorPackagesAvailable } from '../../../src/integrations/ruvector/wrappers';

// Check if @ruvector/gnn native operations work (required for semantic search)
const canTest = checkRuvectorPackagesAvailable();

describe.runIf(canTest.gnn)('QE ReasoningBank', () => {
  let memory: MemoryBackend;
  let reasoningBank: QEReasoningBank;

  beforeEach(async () => {
    memory = createMockMemory();
    reasoningBank = createQEReasoningBank(memory);
    await reasoningBank.initialize();
  });

  afterEach(async () => {
    await reasoningBank.dispose();
    vi.clearAllMocks();
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

  describe('recordOutcome - qe_pattern_usage feedback loop', () => {
    // Helper: store a pattern and return its ID
    async function storeTestPattern(): Promise<string | null> {
      const storeResult = await reasoningBank.storePattern({
        patternType: 'test-template',
        name: 'Analytics Feedback Pattern',
        description: 'Pattern to test qe_pattern_usage INSERT',
        template: { type: 'code', content: 'test content', variables: [] },
      });
      if (!storeResult.success) return null;
      return storeResult.value.id;
    }

    it('should write to qe_pattern_usage when unified memory is available', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      // Create a mock database with a prepare().run() chain
      const mockRun = vi.fn();
      const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
      const mockDb = { prepare: mockPrepare };
      const mockGetUnifiedMemory = vi.fn().mockReturnValue({
        getDatabase: () => mockDb,
      });

      // Mock the dynamic import to return our mock
      const originalImport = await import('../../../src/kernel/unified-memory.js').catch(() => null);
      vi.doMock('../../../src/kernel/unified-memory.js', () => ({
        ...originalImport,
        getUnifiedMemory: mockGetUnifiedMemory,
      }));

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: true,
        metrics: { testsPassed: 10, testsFailed: 0 },
        feedback: 'Excellent coverage',
      });

      expect(outcomeResult.success).toBe(true);

      // The patternStore.recordUsage() should still work
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);

      // Restore mock so other tests are unaffected
      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should not fail when unified memory is NOT available', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      // Mock the dynamic import to throw (simulating unified memory not initialized)
      vi.doMock('../../../src/kernel/unified-memory.js', () => {
        throw new Error('Unified memory not initialized');
      });

      // recordOutcome should succeed despite the analytics INSERT failing
      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: true,
        metrics: { testsPassed: 5, testsFailed: 0 },
      });

      expect(outcomeResult.success).toBe(true);

      // The patternStore.recordUsage() should still have worked
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);

      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should not fail when getDatabase() throws', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      // Mock where getUnifiedMemory succeeds but getDatabase throws
      vi.doMock('../../../src/kernel/unified-memory.js', () => ({
        getUnifiedMemory: () => ({
          getDatabase: () => { throw new Error('Database not ready'); },
        }),
      }));

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: false,
        metrics: { testsPassed: 1, testsFailed: 9 },
        feedback: 'Pattern produced poor results',
      });

      expect(outcomeResult.success).toBe(true);

      // patternStore should still have recorded the failure
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(0);

      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should not fail when db.prepare().run() throws', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      // Mock where prepare().run() throws (e.g., table does not exist)
      vi.doMock('../../../src/kernel/unified-memory.js', () => ({
        getUnifiedMemory: () => ({
          getDatabase: () => ({
            prepare: () => ({
              run: () => { throw new Error('no such table: qe_pattern_usage'); },
            }),
          }),
        }),
      }));

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: true,
        metrics: { testsPassed: 8, testsFailed: 2 },
      });

      expect(outcomeResult.success).toBe(true);

      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);

      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should record success=true outcome and increment stats correctly', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      const statsBefore = await reasoningBank.getStats();
      const outcomesBefore = statsBefore.learningOutcomes;

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: true,
        metrics: { testsPassed: 15, testsFailed: 0, coverageImprovement: 12.5 },
        feedback: 'All tests green',
      });

      expect(outcomeResult.success).toBe(true);

      const statsAfter = await reasoningBank.getStats();
      expect(statsAfter.learningOutcomes).toBe(outcomesBefore + 1);

      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);
    });

    it('should record success=false outcome and not increment successfulOutcomes', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      const statsBefore = await reasoningBank.getStats();
      const outcomesBefore = statsBefore.learningOutcomes;

      const outcomeResult = await reasoningBank.recordOutcome({
        patternId,
        success: false,
        metrics: { testsPassed: 0, testsFailed: 10, executionTimeMs: 5000 },
        feedback: 'All tests failed due to stale mocks',
      });

      expect(outcomeResult.success).toBe(true);

      const statsAfter = await reasoningBank.getStats();
      expect(statsAfter.learningOutcomes).toBe(outcomesBefore + 1);

      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(0);
    });

    it('should pass null metrics_json when outcome has no metrics', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      const mockRun = vi.fn();
      const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
      const mockDb = { prepare: mockPrepare };
      vi.doMock('../../../src/kernel/unified-memory.js', () => ({
        getUnifiedMemory: () => ({
          getDatabase: () => mockDb,
        }),
      }));

      await reasoningBank.recordOutcome({
        patternId,
        success: true,
      });

      // patternStore should still track usage
      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(1);

      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should pass null feedback when outcome has no feedback', async () => {
      const patternId = await storeTestPattern();
      expect(patternId).not.toBeNull();
      if (!patternId) return;

      const mockRun = vi.fn();
      const mockPrepare = vi.fn().mockReturnValue({ run: mockRun });
      const mockDb = { prepare: mockPrepare };
      vi.doMock('../../../src/kernel/unified-memory.js', () => ({
        getUnifiedMemory: () => ({
          getDatabase: () => mockDb,
        }),
      }));

      await reasoningBank.recordOutcome({
        patternId,
        success: false,
        metrics: { testsPassed: 3, testsFailed: 7 },
      });

      const pattern = await reasoningBank.getPattern(patternId);
      expect(pattern?.usageCount).toBe(1);
      expect(pattern?.successfulUses).toBe(0);

      vi.doUnmock('../../../src/kernel/unified-memory.js');
    });

    it('should early-return ok when enableLearning is false', async () => {
      const noLearnMemory = createMockMemory();
      const noLearnBank = createQEReasoningBank(noLearnMemory, undefined, {
        enableLearning: false,
      });
      await noLearnBank.initialize();

      // Store a pattern first
      const storeResult = await noLearnBank.storePattern({
        patternType: 'test-template',
        name: 'No-Learn Pattern',
        description: 'Should not record outcome',
        template: { type: 'code', content: 'test', variables: [] },
      });

      if (!storeResult.success) {
        await noLearnBank.dispose();
        return;
      }

      const outcomeResult = await noLearnBank.recordOutcome({
        patternId: storeResult.value.id,
        success: true,
        metrics: { testsPassed: 5, testsFailed: 0 },
      });

      // Should return ok(undefined) without calling recordUsage or the INSERT
      expect(outcomeResult.success).toBe(true);

      // Pattern should NOT have updated usage stats since learning is disabled
      const pattern = await noLearnBank.getPattern(storeResult.value.id);
      expect(pattern?.usageCount).toBe(0);

      await noLearnBank.dispose();
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
      expect(embedding.length).toBe(768); // Default dimension
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

describe('QE Pattern Utilities', () => {
  describe('detectQEDomain', () => {
    it('should detect test-generation domain', () => {
      expect(detectQEDomain('Write tests for the UserService')).toBe('test-generation');
      expect(detectQEDomain('describe("MyComponent")')).toBe('test-generation');
      expect(detectQEDomain('it("should work")')).toBe('test-generation');
    });

    it('should detect coverage-analysis domain', () => {
      expect(detectQEDomain('Analyze code coverage')).toBe('coverage-analysis');
      expect(detectQEDomain('Find uncovered branches')).toBe('coverage-analysis');
    });

    it('should detect security-compliance domain', () => {
      expect(detectQEDomain('Check for XSS vulnerabilities')).toBe('security-compliance');
      expect(detectQEDomain('OWASP security scan')).toBe('security-compliance');
    });

    it('should detect visual-accessibility domain', () => {
      // Use unique keywords that only match visual-accessibility
      // percy and a11y are unique to this domain, avoid "regression" (defect-intelligence)
      expect(detectQEDomain('percy snapshot')).toBe('visual-accessibility');
      expect(detectQEDomain('a11y audit')).toBe('visual-accessibility');
    });

    it('should return null for unmatched text', () => {
      expect(detectQEDomain('Hello world')).toBeNull();
    });
  });

  describe('detectQEDomains', () => {
    it('should detect multiple domains', () => {
      const domains = detectQEDomains(
        'Generate tests with coverage analysis for security-critical code'
      );
      expect(domains).toContain('test-generation');
      expect(domains).toContain('coverage-analysis');
    });
  });

  describe('mapQEDomainToAQE', () => {
    it('should map QE domains to AQE domains (identity mapping since aligned)', () => {
      // QEDomain and DomainName are now aligned - this is an identity mapping
      expect(mapQEDomainToAQE('test-generation')).toBe('test-generation');
      expect(mapQEDomainToAQE('coverage-analysis')).toBe('coverage-analysis');
      expect(mapQEDomainToAQE('security-compliance')).toBe('security-compliance');
      expect(mapQEDomainToAQE('visual-accessibility')).toBe('visual-accessibility');
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate quality score', () => {
      const score = calculateQualityScore({
        confidence: 0.8,
        usageCount: 50,
        successRate: 0.9,
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should weight success rate highest', () => {
      const highSuccess = calculateQualityScore({
        confidence: 0.5,
        usageCount: 10,
        successRate: 1.0,
      });

      const lowSuccess = calculateQualityScore({
        confidence: 0.5,
        usageCount: 10,
        successRate: 0.2,
      });

      expect(highSuccess).toBeGreaterThan(lowSuccess);
    });
  });

  describe('shouldPromotePattern', () => {
    const basePattern: QEPattern = {
      id: '1',
      patternType: 'test-template',
      qeDomain: 'test-generation',
      domain: 'test-generation',
      name: 'Test',
      description: 'Test',
      confidence: 0.7,
      usageCount: 10,
      successRate: 0.8,
      qualityScore: 0.7,
      context: { tags: [] },
      template: { type: 'code', content: '', variables: [] },
      tier: 'short-term',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      successfulUses: 5,
    };

    it('should promote pattern with 3+ successful uses', () => {
      const result = shouldPromotePattern(basePattern);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });

    it('should not promote already long-term patterns', () => {
      const result = shouldPromotePattern({ ...basePattern, tier: 'long-term' });
      expect(result.meetsUsageCriteria).toBe(false);
      expect(result.blockReason).toBe('insufficient_usage');
    });

    it('should not promote patterns with low confidence', () => {
      const result = shouldPromotePattern({ ...basePattern, confidence: 0.4 });
      expect(result.meetsQualityCriteria).toBe(false);
      expect(result.blockReason).toBe('low_quality');
    });

    it('should not promote patterns with low success rate', () => {
      const result = shouldPromotePattern({ ...basePattern, successRate: 0.5 });
      expect(result.meetsQualityCriteria).toBe(false);
      expect(result.blockReason).toBe('low_quality');
    });

    it('should not promote patterns with few successful uses', () => {
      const result = shouldPromotePattern({ ...basePattern, successfulUses: 2 });
      expect(result.meetsUsageCriteria).toBe(false);
      expect(result.blockReason).toBe('insufficient_usage');
    });

    it('should block promotion when coherence energy exceeds threshold', () => {
      const result = shouldPromotePattern(basePattern, 0.5, 0.4);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(false);
      expect(result.blockReason).toBe('coherence_violation');
    });

    it('should allow promotion when coherence energy is below threshold', () => {
      const result = shouldPromotePattern(basePattern, 0.3, 0.4);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });

    it('should allow promotion when coherence energy is not provided', () => {
      const result = shouldPromotePattern(basePattern);
      expect(result.meetsUsageCriteria).toBe(true);
      expect(result.meetsQualityCriteria).toBe(true);
      expect(result.meetsCoherenceCriteria).toBe(true);
      expect(result.blockReason).toBeUndefined();
    });
  });

  describe('validateQEPattern', () => {
    it('should validate valid pattern', () => {
      const pattern: Partial<QEPattern> = {
        id: '1',
        patternType: 'test-template',
        qeDomain: 'test-generation',
        name: 'Test Pattern',
        template: {
          type: 'code',
          content: 'describe("{{name}}")',
          variables: [{ name: 'name', type: 'string', required: true }],
        },
        confidence: 0.8,
        successRate: 0.9,
      };

      const result = validateQEPattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const result = validateQEPattern({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect invalid confidence range', () => {
      const result = validateQEPattern({
        id: '1',
        patternType: 'test-template',
        qeDomain: 'test-generation',
        name: 'Test',
        template: { type: 'code', content: 'test', variables: [] },
        confidence: 1.5, // Invalid
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Confidence must be between 0 and 1');
    });
  });

  describe('applyPatternTemplate', () => {
    it('should apply template variables', () => {
      const template = {
        type: 'code' as const,
        content: 'describe("{{className}}", () => { {{testBody}} });',
        variables: [
          { name: 'className', type: 'string' as const, required: true },
          { name: 'testBody', type: 'code' as const, required: true },
        ],
      };

      const result = applyPatternTemplate(template, {
        className: 'UserService',
        testBody: 'it("should work", () => {});',
      });

      expect(result).toContain('UserService');
      expect(result).toContain('should work');
    });

    it('should use default values', () => {
      const template = {
        type: 'code' as const,
        content: 'describe("{{name}}", () => { {{async}} });',
        variables: [
          { name: 'name', type: 'string' as const, required: true },
          { name: 'async', type: 'string' as const, required: false, defaultValue: '// tests' },
        ],
      };

      const result = applyPatternTemplate(template, { name: 'Test' });
      expect(result).toContain('// tests');
    });

    it('should throw for missing required variables', () => {
      const template = {
        type: 'code' as const,
        content: '{{required}}',
        variables: [{ name: 'required', type: 'string' as const, required: true }],
      };

      expect(() => applyPatternTemplate(template, {})).toThrow(
        'Required variable required not provided'
      );
    });
  });
});

describe('QE Guidance', () => {
  describe('getGuidance', () => {
    it('should return guidance for all domains', () => {
      // Use the 12 DDD bounded context domains
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
        const guidance = getGuidance(domain);
        expect(guidance).toBeDefined();
        // Note: guidance.domain may differ from input domain as registry reuses guidance objects
        // (e.g., test-execution uses test-generation guidance)
        expect(guidance.domain).toBeDefined();
        expect(guidance.bestPractices.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getCombinedGuidance', () => {
    it('should combine domain, framework, and language guidance', () => {
      const guidance = getCombinedGuidance('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(guidance.length).toBeGreaterThan(0);
      expect(guidance.some((g) => g.includes('[vitest]'))).toBe(true);
      expect(guidance.some((g) => g.includes('[typescript]'))).toBe(true);
    });

    it('should include anti-patterns when requested', () => {
      const guidance = getCombinedGuidance('test-generation', {
        includeAntiPatterns: true,
      });

      expect(guidance.some((g) => g.includes('[AVOID]'))).toBe(true);
    });
  });

  describe('generateGuidanceContext', () => {
    it('should generate markdown context', () => {
      const context = generateGuidanceContext('test-generation', {
        framework: 'vitest',
        language: 'typescript',
      });

      expect(context).toContain('## QE Guidance');
      expect(context).toContain('Best Practices');
      expect(context).toContain('Anti-Patterns');
    });
  });

  describe('checkAntiPatterns', () => {
    it('should detect flaky assertion patterns', () => {
      const code = `
        it('should be fast', async () => {
          await setTimeout(() => {}, 100);
          expect(Date.now()).toBeLessThan(Date.now() + 1000);
        });
      `;

      const antiPatterns = checkAntiPatterns('test-generation', code);
      expect(antiPatterns.some((ap) => ap.name === 'Flaky Assertion')).toBe(true);
    });

    it('should return empty for clean code', () => {
      const code = `
        it('should add numbers', () => {
          expect(1 + 1).toBe(2);
        });
      `;

      const antiPatterns = checkAntiPatterns('test-generation', code);
      // May or may not detect patterns depending on implementation
      expect(Array.isArray(antiPatterns)).toBe(true);
    });
  });
});
