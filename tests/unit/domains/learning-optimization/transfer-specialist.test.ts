/**
 * Agentic QE v3 - Transfer Specialist Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransferSpecialistService } from '../../../../src/domains/learning-optimization/services/transfer-specialist';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { Knowledge, KnowledgeType, PatternContext } from '../../../../src/domains/learning-optimization/interfaces';
import { DomainName, AgentId } from '../../../../src/shared/types';

// Mock MemoryBackend
function createMockMemoryBackend(): MemoryBackend {
  const storage = new Map<string, unknown>();

  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockImplementation(async (key: string, value: unknown, _options?: StoreOptions) => {
      storage.set(key, value);
    }),
    get: vi.fn().mockImplementation(async <T>(key: string): Promise<T | undefined> => {
      return storage.get(key) as T | undefined;
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      return storage.delete(key);
    }),
    has: vi.fn().mockImplementation(async (key: string) => {
      return storage.has(key);
    }),
    search: vi.fn().mockImplementation(async (pattern: string, _limit?: number) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Array.from(storage.keys()).filter((key) => regex.test(key));
    }),
    vectorSearch: vi.fn().mockResolvedValue([] as VectorSearchResult[]),
    storeVector: vi.fn().mockResolvedValue(undefined),
  };
}

// Helper to create test knowledge
function createTestKnowledge(overrides: Partial<Knowledge> = {}): Knowledge {
  const sourceAgentId: AgentId = {
    value: overrides.sourceAgentId?.value || 'agent-1',
    domain: overrides.sourceAgentId?.domain || 'test-generation',
    type: overrides.sourceAgentId?.type || 'generator',
  };

  return {
    id: overrides.id || 'knowledge-1',
    type: overrides.type || 'fact',
    domain: overrides.domain || 'test-generation',
    content: overrides.content || {
      format: 'json',
      data: { pattern: 'test-pattern' },
      metadata: { language: 'typescript', framework: 'vitest', tags: ['unit'] },
    },
    sourceAgentId,
    targetDomains: overrides.targetDomains || [],
    relevanceScore: overrides.relevanceScore ?? 0.9,
    version: overrides.version || 1,
    createdAt: overrides.createdAt || new Date(),
    expiresAt: overrides.expiresAt,
  };
}

describe('TransferSpecialistService', () => {
  let service: TransferSpecialistService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new TransferSpecialistService(mockMemory);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('shareKnowledge', () => {
    it('should share knowledge with target agents', async () => {
      const knowledge = createTestKnowledge();
      const targetAgents: AgentId[] = [
        { value: 'agent-2', domain: 'coverage-analysis', type: 'analyzer' },
        { value: 'agent-3', domain: 'quality-assessment', type: 'analyzer' },
      ];

      const result = await service.shareKnowledge(knowledge, targetAgents);

      expect(result.success).toBe(true);
      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should create access records for each target agent', async () => {
      const knowledge = createTestKnowledge();
      const targetAgents: AgentId[] = [
        { value: 'agent-2', domain: 'coverage-analysis', type: 'analyzer' },
      ];

      await service.shareKnowledge(knowledge, targetAgents);

      const calls = (mockMemory.set as ReturnType<typeof vi.fn>).mock.calls;
      const accessCalls = calls.filter((c) => (c[0] as string).includes(':access:'));
      expect(accessCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty target agents list', async () => {
      const knowledge = createTestKnowledge();

      const result = await service.shareKnowledge(knowledge, []);

      expect(result.success).toBe(true);
    });
  });

  describe('queryKnowledge', () => {
    it('should query knowledge by domain', async () => {
      const knowledge = createTestKnowledge({ domain: 'test-generation' });
      await mockMemory.set(`learning:knowledge:shared:${knowledge.id}`, knowledge);

      const result = await service.queryKnowledge({ domain: 'test-generation' });

      expect(result.success).toBe(true);
    });

    it('should filter by type', async () => {
      const knowledge = createTestKnowledge({ type: 'rule' });
      await mockMemory.set(`learning:knowledge:shared:${knowledge.id}`, knowledge);

      const result = await service.queryKnowledge({ type: 'rule' });

      expect(result.success).toBe(true);
    });

    it('should filter by minimum relevance', async () => {
      const knowledge = createTestKnowledge({ relevanceScore: 0.5 });
      await mockMemory.set(`learning:knowledge:shared:${knowledge.id}`, knowledge);

      const result = await service.queryKnowledge({ minRelevance: 0.8 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.every((k) => k.relevanceScore >= 0.8 || result.value.length === 0)).toBe(
          true
        );
      }
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        const knowledge = createTestKnowledge({ id: `knowledge-${i}` });
        await mockMemory.set(`learning:knowledge:shared:${knowledge.id}`, knowledge);
      }

      const result = await service.queryKnowledge({ limit: 2 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('synthesizeKnowledge', () => {
    it('should synthesize knowledge from multiple sources', async () => {
      const knowledge1 = createTestKnowledge({
        id: 'knowledge-1',
        type: 'fact',
        content: { format: 'json', data: { info: 'data1' }, metadata: { tags: ['tag1'] } },
      });
      const knowledge2 = createTestKnowledge({
        id: 'knowledge-2',
        type: 'fact',
        content: { format: 'json', data: { info: 'data2' }, metadata: { tags: ['tag2'] } },
      });

      await mockMemory.set(`learning:knowledge:shared:${knowledge1.id}`, knowledge1);
      await mockMemory.set(`learning:knowledge:shared:${knowledge2.id}`, knowledge2);

      const result = await service.synthesizeKnowledge(['knowledge-1', 'knowledge-2']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.content.metadata?.synthesizedFrom).toContain('knowledge-1');
        expect(result.value.content.metadata?.synthesizedFrom).toContain('knowledge-2');
      }
    });

    it('should reject synthesis with fewer than 2 knowledge items', async () => {
      const result = await service.synthesizeKnowledge(['knowledge-1']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('at least 2');
      }
    });

    it('should reject when not enough valid items found', async () => {
      const result = await service.synthesizeKnowledge(['non-existent-1', 'non-existent-2']);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Not enough valid');
      }
    });

    it('should boost relevance for synthesized knowledge', async () => {
      const knowledge1 = createTestKnowledge({ id: 'knowledge-1', relevanceScore: 0.7 });
      const knowledge2 = createTestKnowledge({ id: 'knowledge-2', relevanceScore: 0.7 });

      await mockMemory.set(`learning:knowledge:shared:${knowledge1.id}`, knowledge1);
      await mockMemory.set(`learning:knowledge:shared:${knowledge2.id}`, knowledge2);

      const result = await service.synthesizeKnowledge(['knowledge-1', 'knowledge-2']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.relevanceScore).toBeGreaterThan(0.7);
      }
    });
  });

  describe('transferKnowledge', () => {
    it('should transfer knowledge to a different domain', async () => {
      const knowledge = createTestKnowledge({
        domain: 'test-generation',
        relevanceScore: 0.9,
      });

      const result = await service.transferKnowledge(knowledge, 'test-execution');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.domain).toBe('test-execution');
        expect(result.value.version).toBe(knowledge.version + 1);
      }
    });

    it('should reject transfer to the same domain', async () => {
      const knowledge = createTestKnowledge({ domain: 'test-generation' });

      const result = await service.transferKnowledge(knowledge, 'test-generation');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('same domain');
      }
    });

    it('should apply transfer decay to relevance', async () => {
      const knowledge = createTestKnowledge({
        domain: 'test-generation',
        relevanceScore: 1.0,
      });

      const result = await service.transferKnowledge(knowledge, 'test-execution');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.relevanceScore).toBeLessThan(1.0);
      }
    });

    it('should reject transfer when relevance falls below threshold', async () => {
      const knowledge = createTestKnowledge({
        domain: 'test-generation',
        relevanceScore: 0.4, // Low relevance, will drop below 0.5 threshold
        targetDomains: [],
      });

      const result = await service.transferKnowledge(knowledge, 'chaos-resilience');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('below threshold');
      }
    });
  });

  describe('validateRelevance', () => {
    it('should boost relevance for matching context', async () => {
      const knowledge = createTestKnowledge({
        relevanceScore: 0.7,
        content: {
          format: 'json',
          data: {},
          metadata: { language: 'typescript', framework: 'vitest', tags: ['unit'] },
        },
      });

      const context: PatternContext = {
        language: 'typescript',
        framework: 'vitest',
        tags: ['unit'],
      };

      const result = await service.validateRelevance(knowledge, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeGreaterThan(0.7);
      }
    });

    it('should apply age decay', async () => {
      const oldKnowledge = createTestKnowledge({
        relevanceScore: 0.9,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days old
      });

      const context: PatternContext = { tags: [] };

      const result = await service.validateRelevance(oldKnowledge, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeLessThan(0.9);
      }
    });

    it('should penalize expired knowledge', async () => {
      const expiredKnowledge = createTestKnowledge({
        relevanceScore: 0.9,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      const context: PatternContext = { tags: [] };

      const result = await service.validateRelevance(expiredKnowledge, context);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBeLessThan(0.9);
      }
    });
  });

  describe('createKnowledge', () => {
    it('should create new knowledge item', async () => {
      const sourceAgent: AgentId = {
        value: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
      };

      const result = await service.createKnowledge(
        'fact',
        'test-generation',
        { testData: 'value' },
        sourceAgent,
        ['coverage-analysis']
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('fact');
        expect(result.value.domain).toBe('test-generation');
        expect(result.value.relevanceScore).toBe(1.0);
      }
    });

    it('should infer content format correctly', async () => {
      const sourceAgent: AgentId = {
        value: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
      };

      const textResult = await service.createKnowledge(
        'fact',
        'test-generation',
        'This is text content',
        sourceAgent
      );

      expect(textResult.success).toBe(true);
      if (textResult.success) {
        expect(textResult.value.content.format).toBe('text');
      }
    });

    it('should store vector embedding for embedding type', async () => {
      const sourceAgent: AgentId = {
        value: 'agent-1',
        domain: 'test-generation',
        type: 'generator',
      };

      await service.createKnowledge(
        'embedding',
        'test-generation',
        [0.1, 0.2, 0.3, 0.4],
        sourceAgent
      );

      expect(mockMemory.storeVector).toHaveBeenCalled();
    });
  });

  describe('getKnowledgeById', () => {
    it('should retrieve knowledge by ID', async () => {
      const knowledge = createTestKnowledge({ id: 'knowledge-123' });
      await mockMemory.set(`learning:knowledge:shared:${knowledge.id}`, knowledge);

      const result = await service.getKnowledgeById('knowledge-123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('knowledge-123');
    });

    it('should return null for non-existent ID', async () => {
      const result = await service.getKnowledgeById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('bulkTransfer', () => {
    it('should transfer multiple knowledge items between projects', async () => {
      const knowledge1 = createTestKnowledge({ id: 'k1', type: 'fact', relevanceScore: 0.9 });
      const knowledge2 = createTestKnowledge({ id: 'k2', type: 'rule', relevanceScore: 0.8 });

      await mockMemory.set(`learning:knowledge:project:source-project:${knowledge1.id}`, knowledge1);
      await mockMemory.set(`learning:knowledge:project:source-project:${knowledge2.id}`, knowledge2);

      const result = await service.bulkTransfer('source-project', 'target-project');

      expect(result.success).toBe(true);
    });

    it('should filter by type', async () => {
      const knowledge1 = createTestKnowledge({ id: 'k1', type: 'fact' });
      const knowledge2 = createTestKnowledge({ id: 'k2', type: 'rule' });

      await mockMemory.set(`learning:knowledge:project:source:${knowledge1.id}`, knowledge1);
      await mockMemory.set(`learning:knowledge:project:source:${knowledge2.id}`, knowledge2);

      const result = await service.bulkTransfer('source', 'target', { types: ['fact'] });

      expect(result.success).toBe(true);
    });

    it('should filter by minimum relevance', async () => {
      const knowledge1 = createTestKnowledge({ id: 'k1', relevanceScore: 0.9 });
      const knowledge2 = createTestKnowledge({ id: 'k2', relevanceScore: 0.3 });

      await mockMemory.set(`learning:knowledge:project:source:${knowledge1.id}`, knowledge1);
      await mockMemory.set(`learning:knowledge:project:source:${knowledge2.id}`, knowledge2);

      const result = await service.bulkTransfer('source', 'target', { minRelevance: 0.5 });

      expect(result.success).toBe(true);
    });
  });
});
