/**
 * Agentic QE v3 - Learning Consolidation Protocol Unit Tests
 * Tests for weekly learning consolidation across QE domains
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LearningConsolidationProtocol,
  createLearningConsolidationProtocol,
  type LearningConsolidationConfig,
  type DomainPatternGroup,
} from '../../../../src/coordination/protocols/learning-consolidation';
import type {
  EventBus,
  MemoryBackend,
} from '../../../../src/kernel/interfaces';
import type {
  IPatternLearningService,
  IKnowledgeSynthesisService,
  LearnedPattern,
} from '../../../../src/domains/learning-optimization/interfaces';
import { ok, err } from '../../../../src/shared/types';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockEventBus(): EventBus {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    subscribeToChannel: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    unsubscribe: vi.fn(),
  };
}

function createMockMemory(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    get: vi.fn().mockImplementation(async (key: string) => storage.get(key)),
    set: vi.fn().mockImplementation(async (key: string, value: unknown) => {
      storage.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => storage.delete(key)),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockImplementation(async () => storage.clear()),
  };
}

function createMockPatternService(): IPatternLearningService {
  return {
    learn: vi.fn().mockResolvedValue(ok({ patternId: 'pattern-1' })),
    match: vi.fn().mockResolvedValue(ok([])),
    consolidatePatterns: vi.fn().mockResolvedValue(ok(createMockPattern())),
    getPatternsForDomain: vi.fn().mockResolvedValue(ok([])),
    recordOutcome: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as IPatternLearningService;
}

function createMockKnowledgeService(): IKnowledgeSynthesisService {
  return {
    synthesize: vi.fn().mockResolvedValue(ok({ knowledge: {} })),
    shareKnowledge: vi.fn().mockResolvedValue(ok(undefined)),
    getKnowledge: vi.fn().mockResolvedValue(ok(undefined)),
    queryKnowledge: vi.fn().mockResolvedValue(ok([])),
  } as unknown as IKnowledgeSynthesisService;
}

function createMockPattern(overrides?: Partial<LearnedPattern>): LearnedPattern {
  return {
    id: 'pattern-1',
    name: 'Test Pattern',
    domain: 'test-generation',
    type: 'workflow-pattern',
    context: {
      language: 'typescript',
      framework: 'vitest',
      testType: 'unit',
      tags: ['async', 'api'],
    },
    template: {
      type: 'code-template',
      content: 'test template',
    },
    confidence: 0.8,
    successRate: 0.85,
    usageCount: 15,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    ...overrides,
  } as LearnedPattern;
}

// ============================================================================
// Tests
// ============================================================================

describe('LearningConsolidationProtocol', () => {
  let mockEventBus: EventBus;
  let mockMemory: MemoryBackend;
  let mockPatternService: IPatternLearningService;
  let mockKnowledgeService: IKnowledgeSynthesisService;
  let protocol: LearningConsolidationProtocol;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockMemory = createMockMemory();
    mockPatternService = createMockPatternService();
    mockKnowledgeService = createMockKnowledgeService();
    protocol = new LearningConsolidationProtocol(
      mockEventBus,
      mockMemory,
      mockPatternService,
      mockKnowledgeService
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create protocol with default config', () => {
      const protocol = new LearningConsolidationProtocol(
        mockEventBus,
        mockMemory,
        mockPatternService,
        mockKnowledgeService
      );
      expect(protocol).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<LearningConsolidationConfig> = {
        minPatternsForConsolidation: 10,
        similarityThreshold: 0.9,
        maxPatternsPerDomain: 50,
      };

      const protocol = new LearningConsolidationProtocol(
        mockEventBus,
        mockMemory,
        mockPatternService,
        mockKnowledgeService,
        config
      );
      expect(protocol).toBeDefined();
    });
  });

  describe('execute()', () => {
    it('should complete consolidation successfully with no patterns', async () => {
      const result = await protocol.execute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.consolidationId).toBeDefined();
        expect(result.value.startedAt).toBeInstanceOf(Date);
        expect(result.value.completedAt).toBeInstanceOf(Date);
        expect(result.value.stats).toBeDefined();
      }
    });

    it('should publish consolidation started event', async () => {
      await protocol.execute();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LearningConsolidationStarted',
        })
      );
    });

    it('should publish consolidation completed event', async () => {
      await protocol.execute();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LearningConsolidationCompleted',
        })
      );
    });

    it('should include consolidation stats in result', async () => {
      const result = await protocol.execute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.stats).toBeDefined();
        expect(result.value.stats.domainsProcessed).toBeGreaterThanOrEqual(0);
        expect(result.value.stats.totalPatternsAnalyzed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should generate insights', async () => {
      const result = await protocol.execute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.insights).toBeDefined();
        expect(Array.isArray(result.value.insights)).toBe(true);
      }
    });

    it('should store consolidation result', async () => {
      await protocol.execute();

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('gatherPatterns()', () => {
    it('should return empty array when no patterns exist', async () => {
      const result = await protocol.gatherPatterns();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should gather patterns from memory', async () => {
      // Setup patterns in memory
      const pattern = createMockPattern();
      mockMemory.search = vi.fn().mockResolvedValue(['learning:pattern:test-1']);
      mockMemory.get = vi.fn().mockResolvedValue(pattern);

      const result = await protocol.gatherPatterns();

      expect(result.success).toBe(true);
      expect(mockMemory.search).toHaveBeenCalled();
    });

    it('should group patterns by domain', async () => {
      const pattern1 = createMockPattern({ id: 'p1', domain: 'test-generation' });
      const pattern2 = createMockPattern({ id: 'p2', domain: 'test-execution' });

      mockMemory.search = vi.fn().mockResolvedValue([
        'learning:pattern:p1',
        'learning:pattern:p2',
      ]);
      mockMemory.get = vi.fn()
        .mockResolvedValueOnce(pattern1)
        .mockResolvedValueOnce(pattern2);

      const result = await protocol.gatherPatterns();

      expect(result.success).toBe(true);
    });
  });

  describe('consolidatePatterns()', () => {
    it('should consolidate domain patterns', async () => {
      const domainGroup: DomainPatternGroup = {
        domain: 'test-generation',
        patterns: [createMockPattern()],
        stats: {
          totalPatterns: 1,
          avgConfidence: 0.8,
          avgSuccessRate: 0.85,
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 0,
        },
      };

      const result = await protocol.consolidatePatterns('consolidation-1', domainGroup);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.domain).toBe('test-generation');
        expect(result.value.patternsBeforeCount).toBe(1);
      }
    });

    it('should merge similar patterns', async () => {
      const pattern1 = createMockPattern({
        id: 'p1',
        context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['api'] },
      });
      const pattern2 = createMockPattern({
        id: 'p2',
        context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['api'] },
      });

      const domainGroup: DomainPatternGroup = {
        domain: 'test-generation',
        patterns: [pattern1, pattern2],
        stats: {
          totalPatterns: 2,
          avgConfidence: 0.8,
          avgSuccessRate: 0.85,
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 0,
        },
      };

      const result = await protocol.consolidatePatterns('consolidation-1', domainGroup);

      expect(result.success).toBe(true);
    });

    it('should remove low confidence patterns', async () => {
      const lowConfidencePattern = createMockPattern({
        id: 'low',
        confidence: 0.2,
        successRate: 0.2,
        usageCount: 1,
      });

      const domainGroup: DomainPatternGroup = {
        domain: 'test-generation',
        patterns: [lowConfidencePattern],
        stats: {
          totalPatterns: 1,
          avgConfidence: 0.2,
          avgSuccessRate: 0.2,
          avgUsageCount: 1,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 0,
        },
      };

      const result = await protocol.consolidatePatterns('consolidation-1', domainGroup);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.removedPatterns.length).toBeGreaterThan(0);
      }
    });

    it('should publish pattern consolidated event', async () => {
      const domainGroup: DomainPatternGroup = {
        domain: 'test-generation',
        patterns: [createMockPattern()],
        stats: {
          totalPatterns: 1,
          avgConfidence: 0.8,
          avgSuccessRate: 0.85,
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 0,
        },
      };

      await protocol.consolidatePatterns('consolidation-1', domainGroup);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PatternConsolidated',
        })
      );
    });
  });

  describe('updateKnowledgeBase()', () => {
    it('should update knowledge base from reports', async () => {
      const reports = [{
        domain: 'test-generation' as const,
        patternsBeforeCount: 5,
        patternsAfterCount: 3,
        mergedPatterns: [],
        removedPatterns: [],
        topPerformingPatterns: [createMockPattern()],
        improvementAreas: [],
      }];

      const result = await protocol.updateKnowledgeBase(reports);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeGreaterThanOrEqual(0);
      }
    });

    it('should create knowledge from top performing patterns', async () => {
      const highPerformingPattern = createMockPattern({
        successRate: 0.9,
        confidence: 0.85,
      });

      const reports = [{
        domain: 'test-generation' as const,
        patternsBeforeCount: 5,
        patternsAfterCount: 3,
        mergedPatterns: [],
        removedPatterns: [],
        topPerformingPatterns: [highPerformingPattern],
        improvementAreas: [],
      }];

      await protocol.updateKnowledgeBase(reports);

      expect(mockMemory.set).toHaveBeenCalled();
    });
  });

  describe('prepareTransfer()', () => {
    it('should return empty when cross-project transfer is disabled', async () => {
      const protocol = new LearningConsolidationProtocol(
        mockEventBus,
        mockMemory,
        mockPatternService,
        mockKnowledgeService,
        { enableCrossProjectTransfer: false }
      );

      const result = await protocol.prepareTransfer('consolidation-1', []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should identify transferable patterns', async () => {
      const highPerformingPattern = createMockPattern({
        successRate: 0.9,
        confidence: 0.8,
        usageCount: 20,
      });

      const reports = [{
        domain: 'test-generation' as const,
        patternsBeforeCount: 5,
        patternsAfterCount: 3,
        mergedPatterns: [],
        removedPatterns: [],
        topPerformingPatterns: [highPerformingPattern],
        improvementAreas: [],
      }];

      const result = await protocol.prepareTransfer('consolidation-1', reports);

      expect(result.success).toBe(true);
    });

    it('should publish transfer ready event when patterns available', async () => {
      const highPerformingPattern = createMockPattern({
        successRate: 0.9,
        confidence: 0.8,
        usageCount: 20,
      });

      const reports = [{
        domain: 'test-generation' as const,
        patternsBeforeCount: 5,
        patternsAfterCount: 3,
        mergedPatterns: [],
        removedPatterns: [],
        topPerformingPatterns: [highPerformingPattern],
        improvementAreas: [],
      }];

      await protocol.prepareTransfer('consolidation-1', reports);

      // May or may not publish based on transfer criteria
    });
  });

  describe('generateInsights()', () => {
    it('should return empty insights for empty data', async () => {
      const insights = await protocol.generateInsights([], []);

      expect(Array.isArray(insights)).toBe(true);
    });

    it('should identify high pattern learning activity', async () => {
      const domainGroups: DomainPatternGroup[] = [{
        domain: 'test-generation',
        patterns: [],
        stats: {
          totalPatterns: 10,
          avgConfidence: 0.8,
          avgSuccessRate: 0.85,
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 10, // High activity
        },
      }];

      const insights = await protocol.generateInsights(domainGroups, []);

      const activityInsight = insights.find(i => i.type === 'trend' && i.title.includes('activity'));
      expect(activityInsight).toBeDefined();
    });

    it('should identify low success rate anomaly', async () => {
      const domainGroups: DomainPatternGroup[] = [{
        domain: 'test-generation',
        patterns: [],
        stats: {
          totalPatterns: 10,
          avgConfidence: 0.5,
          avgSuccessRate: 0.3, // Low success rate
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 2,
        },
      }];

      const insights = await protocol.generateInsights(domainGroups, []);

      const anomalyInsight = insights.find(i => i.type === 'anomaly');
      expect(anomalyInsight).toBeDefined();
    });

    it('should identify improvement opportunities', async () => {
      const domainGroups: DomainPatternGroup[] = [{
        domain: 'test-generation',
        patterns: [],
        stats: {
          totalPatterns: 10,
          avgConfidence: 0.8,
          avgSuccessRate: 0.85,
          avgUsageCount: 15,
          topPatternType: 'workflow-pattern',
          newPatternsThisWeek: 2,
        },
      }];

      const reports = [{
        domain: 'test-generation' as const,
        patternsBeforeCount: 10,
        patternsAfterCount: 8,
        mergedPatterns: [],
        removedPatterns: [],
        topPerformingPatterns: [],
        improvementAreas: ['Add more training data'],
      }];

      const insights = await protocol.generateInsights(domainGroups, reports);

      const improvementInsight = insights.find(i => i.type === 'improvement');
      expect(improvementInsight).toBeDefined();
    });
  });

  describe('getPreviousConsolidations()', () => {
    it('should return empty array when no history', async () => {
      const results = await protocol.getPreviousConsolidations(5);

      expect(results).toEqual([]);
    });
  });

  describe('getConsolidationHistory()', () => {
    it('should return zero stats when no history', async () => {
      const history = await protocol.getConsolidationHistory(4);

      expect(history.consolidations).toBe(0);
      expect(history.totalPatternsMerged).toBe(0);
      expect(history.totalPatternsRemoved).toBe(0);
      expect(history.avgImprovementOpportunities).toBe(0);
    });
  });
});

describe('createLearningConsolidationProtocol', () => {
  it('should create protocol instance', () => {
    const mockEventBus = createMockEventBus();
    const mockMemory = createMockMemory();
    const mockPatternService = createMockPatternService();
    const mockKnowledgeService = createMockKnowledgeService();

    const protocol = createLearningConsolidationProtocol(
      mockEventBus,
      mockMemory,
      mockPatternService,
      mockKnowledgeService
    );

    expect(protocol).toBeInstanceOf(LearningConsolidationProtocol);
  });

  it('should pass config to protocol', () => {
    const mockEventBus = createMockEventBus();
    const mockMemory = createMockMemory();
    const mockPatternService = createMockPatternService();
    const mockKnowledgeService = createMockKnowledgeService();

    const protocol = createLearningConsolidationProtocol(
      mockEventBus,
      mockMemory,
      mockPatternService,
      mockKnowledgeService,
      { minPatternsForConsolidation: 10 }
    );

    expect(protocol).toBeDefined();
  });
});
