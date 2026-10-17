/**
 * #1071 regression: learning-optimization readers that used the backend's
 * default namespace, or a fixed key-scan cap, while every writer uses
 * `learning-optimization`.
 *
 * Each case runs on a fresh SQLite file and on the in-memory kernel backend.
 * Records are written by the real writers where one exists
 * (`TransferSpecialistService.shareKnowledge`, `bulkTransfer`); patterns and
 * strategies are seeded with the exact key and namespace their writers use.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningOptimizationCoordinator } from '../../../src/domains/learning-optimization/coordinator';
import { TransferSpecialistService } from '../../../src/domains/learning-optimization/services/transfer-specialist';
import { calculateChecksum } from '../../../src/domains/learning-optimization/coordinator-helpers';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import type { DomainName } from '../../../src/shared/types/index.js';
import type {
  Knowledge,
  LearnedPattern,
  OptimizedStrategy,
} from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' } as const;
const WRITE = { ...NS, persist: true } as const;

function pattern(id: string, domain: DomainName = 'test-generation'): LearnedPattern {
  return {
    id, type: 'test-template', domain, name: `synthetic-${id}`, description: 'synthetic fixture',
    confidence: 0.8, usageCount: 1, successRate: 0.9,
    context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['synthetic-1071'] },
    template: { type: 'code', content: '// synthetic', variables: [] },
    createdAt: new Date(), lastUsedAt: new Date(),
  };
}

function knowledge(id: string, domain: DomainName, version = 1, relevanceScore = 0.8): Knowledge {
  return {
    id, type: 'heuristic', domain,
    content: { format: 'json', data: { synthetic: true }, metadata: { tags: ['synthetic-1071'] } },
    sourceAgentId: { value: 'synthetic-1071', domain, type: 'specialist' },
    targetDomains: [domain], relevanceScore, version, createdAt: new Date(),
  };
}

function strategy(id: string, confidence: number, domain: DomainName = 'test-generation'): OptimizedStrategy {
  const s = { name: `synthetic-${id}`, parameters: { timeout: 1000 }, expectedOutcome: { coverage: 90 } };
  return {
    id, domain, objective: { metric: 'coverage', direction: 'maximize', constraints: [] },
    currentStrategy: s, optimizedStrategy: s, improvement: 0.1, confidence, validationResults: [],
  };
}

function coordinatorFor(memory: MemoryBackend): LearningOptimizationCoordinator {
  return new LearningOptimizationCoordinator(
    { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() } as never,
    memory,
    { spawn: vi.fn(), canSpawn: () => false } as never,
  );
}

function modelExport(parts: { knowledge?: Knowledge[]; strategies?: OptimizedStrategy[] }) {
  const k = parts.knowledge ?? [];
  const s = parts.strategies ?? [];
  return { version: '1.0.0', exportedAt: new Date(), patterns: [], knowledge: k, strategies: s, checksum: calculateChecksum([], k, s) };
}

describe.each(['sqlite', 'memory'] as const)('#1071 learning namespace reads (%s)', (backendType) => {
  let dir: string;
  let memory: MemoryBackend;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1071-'));
    ({ backend: memory } = await createMemoryBackend(
      { type: backendType, sqlite: { path: join(dir, 'memory.db'), walMode: true } },
      true,
    ));
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('exportModels', () => {
    it('exports every active pattern past the old 10,000-key scan (5,201 patterns + provenance)', async () => {
      // Each learned pattern has a `:creation:` provenance row under the same
      // prefix, as LearningCoordinatorService writes, so 10,402 keys in total.
      for (let i = 0; i < 5201; i++) {
        const id = `p-${String(i).padStart(5, '0')}`;
        await memory.set(`learning:pattern:${id}`, pattern(id), WRITE);
        await memory.set(`learning:pattern:creation:${id}`, { patternId: id, experienceIds: [], createdAt: new Date() }, WRITE);
      }
      const exported = await coordinatorFor(memory).exportModels(['test-generation']);
      if (!exported.success) throw exported.error;
      expect(exported.value.patterns).toHaveLength(5201);
      expect(new Set(exported.value.patterns.map((p) => p.id)).size).toBe(5201);
    }, 120_000);

    it('exports optimized strategies from the write namespace, all of them, in id order', async () => {
      for (let i = 0; i < 205; i++) {
        const id = `s-${String(i).padStart(3, '0')}`;
        await memory.set(`learning:strategy:optimized:${id}`, strategy(id, 0.7), WRITE);
      }
      await memory.set('learning:strategy:optimized:other-domain', strategy('other-domain', 0.7, 'chaos-resilience'), WRITE);
      const exported = await coordinatorFor(memory).exportModels(['test-generation']);
      if (!exported.success) throw exported.error;
      const ids = exported.value.strategies.map((s) => s.id);
      expect(ids).toHaveLength(205);
      expect(ids).toEqual([...ids].sort());
    });

    it('exports every shared knowledge item past the old 1,000-item scan', async () => {
      const transfer = new TransferSpecialistService(memory);
      for (let i = 0; i < 1010; i++) {
        await transfer.shareKnowledge(knowledge(`k-other-${String(i).padStart(4, '0')}`, 'test-generation'), []);
      }
      for (let i = 0; i < 10; i++) {
        await transfer.shareKnowledge(knowledge(`k-chaos-${i}`, 'chaos-resilience'), []);
      }
      const exported = await coordinatorFor(memory).exportModels(['chaos-resilience', 'test-generation']);
      if (!exported.success) throw exported.error;
      expect(exported.value.knowledge).toHaveLength(1020);
    }, 60_000);
  });

  describe('importModels conflict checks read the write namespace', () => {
    it('does not let a stale knowledge version overwrite a newer one', async () => {
      await new TransferSpecialistService(memory).shareKnowledge(knowledge('k1', 'test-generation', 1), []);
      const imported = await coordinatorFor(memory).importModels(modelExport({ knowledge: [knowledge('k1', 'test-generation', 0)] }));
      if (!imported.success) throw imported.error;
      expect(imported.value.knowledgeImported).toBe(0);
      expect(imported.value.conflicts).toEqual([expect.objectContaining({ type: 'knowledge', id: 'k1', resolution: 'skip' })]);
      expect((await memory.get<Knowledge>('learning:knowledge:shared:k1', NS))!.version).toBe(1);
    });

    it('does not let a low-confidence strategy overwrite a stored optimizer result', async () => {
      await memory.set('learning:strategy:optimized:s1', strategy('s1', 0.9), WRITE);
      const imported = await coordinatorFor(memory).importModels(modelExport({ strategies: [strategy('s1', 0.01)] }));
      if (!imported.success) throw imported.error;
      expect(imported.value.strategiesImported).toBe(0);
      expect(imported.value.conflicts).toEqual([expect.objectContaining({ type: 'strategy', id: 's1', resolution: 'skip' })]);
      expect((await memory.get<OptimizedStrategy>('learning:strategy:optimized:s1', NS))!.confidence).toBe(0.9);
    });

    it('still overwrites when the import is newer or more confident', async () => {
      await new TransferSpecialistService(memory).shareKnowledge(knowledge('k1', 'test-generation', 1), []);
      await memory.set('learning:strategy:optimized:s1', strategy('s1', 0.5), WRITE);
      const imported = await coordinatorFor(memory).importModels(
        modelExport({ knowledge: [knowledge('k1', 'test-generation', 2)], strategies: [strategy('s1', 0.9)] }),
      );
      if (!imported.success) throw imported.error;
      expect(imported.value.conflicts.map((c) => c.resolution)).toEqual(['overwrite', 'overwrite']);
      expect((await memory.get<Knowledge>('learning:knowledge:shared:k1', NS))!.version).toBe(2);
      expect((await memory.get<OptimizedStrategy>('learning:strategy:optimized:s1', NS))!.confidence).toBe(0.9);
    });
  });

  describe('queryKnowledge domain filter', () => {
    async function seedCrowdedStore(): Promise<void> {
      const transfer = new TransferSpecialistService(memory);
      for (let i = 0; i < 1010; i++) {
        await transfer.shareKnowledge(knowledge(`a-other-${String(i).padStart(4, '0')}`, 'test-generation'), []);
      }
      // Ids sort after the other-domain ids, so an unordered or capped scan misses them.
      for (let i = 0; i < 10; i++) {
        await transfer.shareKnowledge(knowledge(`z-chaos-${i}`, 'chaos-resilience', 1, 0.7), []);
      }
    }

    it('finds every item of a domain crowded out by 1,010 items of other domains', async () => {
      await seedCrowdedStore();
      const result = await new TransferSpecialistService(memory).queryKnowledge({ domain: 'chaos-resilience', limit: 50 });
      if (!result.success) throw result.error;
      expect(result.value.map((k) => k.id).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `z-chaos-${i}`));
    }, 60_000);

    it('returns equal-relevance items in a deterministic id order', async () => {
      await seedCrowdedStore();
      const result = await new TransferSpecialistService(memory).queryKnowledge({ domain: 'chaos-resilience', limit: 3 });
      if (!result.success) throw result.error;
      expect(result.value.map((k) => k.id)).toEqual(['z-chaos-0', 'z-chaos-1', 'z-chaos-2']);
    }, 60_000);

    it('MCP learning_optimize transfer moves the crowded-out domain knowledge', async () => {
      await seedCrowdedStore();
      const result = await new LearningOptimizeTool().invoke(
        { action: 'transfer', domain: 'chaos-resilience', targetDomain: 'quality-assessment' },
        { memory } as never,
      );
      expect(result.success).toBe(true);
      expect(result.data?.transferResult?.sourcePatterns).toBe(10);
    }, 60_000);
  });

  describe('bulkTransfer', () => {
    it('reads the project knowledge it wrote, so transfers chain across projects', async () => {
      const transfer = new TransferSpecialistService(memory);
      for (const id of ['b1', 'b2', 'b3']) {
        await memory.set(`learning:knowledge:project:alpha:${id}`, knowledge(id, 'test-generation'), WRITE);
      }
      const first = await transfer.bulkTransfer('alpha', 'beta');
      if (!first.success) throw first.error;
      expect(first.value).toHaveLength(3);
      const second = await transfer.bulkTransfer('beta', 'gamma');
      if (!second.success) throw second.error;
      expect(second.value).toHaveLength(3);
    });

    it("reads only the source project's own keys", async () => {
      await memory.set('learning:knowledge:project:alpha:own', knowledge('own', 'test-generation'), WRITE);
      await memory.set('learning:knowledge:project:ALPHA:upper', knowledge('upper', 'test-generation'), WRITE);
      await memory.set('learning:knowledge:project:alpha:sub:nested', knowledge('nested', 'test-generation'), WRITE);
      const result = await new TransferSpecialistService(memory).bulkTransfer('alpha', 'beta');
      if (!result.success) throw result.error;
      expect(result.value).toHaveLength(1);
    });

    it('ignores a same-named key in the default namespace', async () => {
      await memory.set('learning:knowledge:project:alpha:decoy', knowledge('decoy', 'test-generation'), { persist: true });
      const result = await new TransferSpecialistService(memory).bulkTransfer('alpha', 'beta');
      if (!result.success) throw result.error;
      expect(result.value).toEqual([]);
    });
  });
});
