/**
 * #1055 regression: coordinator readers picked up provenance and archived
 * records from `learning:pattern:*`.
 *
 * Fixture: a real SQLite backend. LearningCoordinatorService.learnPattern()
 * runs twice (writing two active patterns plus two `:creation:` provenance
 * records), then consolidatePatterns() merges them (writing one active
 * pattern and archiving the two originals under `:archived:`). Nothing is
 * hand-crafted except the explicitly malformed rows and the starvation rows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { LearningOptimizationCoordinator } from '../../../src/domains/learning-optimization/coordinator';
import { calculateChecksum } from '../../../src/domains/learning-optimization/coordinator-helpers';
import { LearningConsolidationProtocol } from '../../../src/coordination/protocols/learning-consolidation';
import { LearningOptimizeTool } from '../../../src/mcp/tools/learning-optimization/optimize';
import type { Experience, LearnedPattern } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' } as const;
const TAG = 'synthetic-fixture-only';

function experiences(batch: number): Experience[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `synthetic-${batch}-${i}`,
    agentId: { value: 'synthetic-1055', domain: 'code-intelligence', type: 'specialist' },
    domain: 'code-intelligence',
    action: 'preserve-fixture-state',
    state: {
      context: { language: 'javascript', framework: 'vitest', testType: 'integration', tags: [TAG] },
      metrics: {},
    },
    result: { success: true, outcome: { synthetic: true }, duration: 1 },
    reward: 1,
    timestamp: new Date(),
  })) as unknown as Experience[];
}

async function allRecordsHash(memory: MemoryBackend, namespace?: string): Promise<{ count: number; hash: string }> {
  const opts = namespace ? { namespace } : undefined;
  const keys = (await memory.search('learning:pattern:*', 100_000, opts)).sort();
  const records: Array<[string, unknown]> = [];
  for (const key of keys) records.push([key, await memory.get(key, opts)]);
  return { count: keys.length, hash: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
}

describe('#1055 active pattern reads (real SQLite)', () => {
  let dir: string;
  let memory: MemoryBackend;
  let service: LearningCoordinatorService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1055-'));
    ({ backend: memory } = await createMemoryBackend(
      { type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true } },
      true,
    ));
    service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  async function learnTwo(): Promise<string[]> {
    const ids: string[] = [];
    for (const batch of [0, 1]) {
      const learned = await service.learnPattern(experiences(batch));
      if (!learned.success) throw learned.error;
      ids.push(learned.value.id);
    }
    return ids;
  }

  async function learnTwoAndConsolidate(): Promise<{ archived: string[]; active: string }> {
    const archived = await learnTwo();
    const merged = await service.consolidatePatterns(archived);
    if (!merged.success) throw merged.error;
    return { archived, active: merged.value.id };
  }

  describe('after 2x learnPattern', () => {
    it('writes creation provenance next to the active patterns (fixture sanity)', async () => {
      await learnTwo();
      const keys = await memory.search('learning:pattern:*', 1000, NS);
      expect(keys.filter((k) => k.includes(':creation:'))).toHaveLength(2);
    });

    it('a tagged findMatchingPatterns does not throw and returns only the active patterns', async () => {
      const ids = await learnTwo();
      const result = await service.findMatchingPatterns({ tags: [TAG] });
      expect(result.success).toBe(true);
      expect(result.success && result.value.map((p) => p.id).sort()).toEqual([...ids].sort());
    });

    it('a language-filtered findMatchingPatterns does not throw', async () => {
      await learnTwo();
      const result = await service.findMatchingPatterns({ language: 'python', tags: [] });
      expect(result.success && result.value).toEqual([]);
    });

    it('an unfiltered findMatchingPatterns returns each active pattern once', async () => {
      const ids = await learnTwo();
      const result = await service.findMatchingPatterns({ tags: [] });
      expect(result.success && result.value.map((p) => p.id).sort()).toEqual([...ids].sort());
    });

    it('stats count only active patterns, with finite averages', async () => {
      await learnTwo();
      const result = await service.getPatternStats();
      expect(result.success && result.value.totalPatterns).toBe(2);
      expect(result.success && Number.isFinite(result.value.avgConfidence)).toBe(true);
      expect(result.success && Number.isFinite(result.value.avgSuccessRate)).toBe(true);
    });
  });

  describe('after consolidatePatterns', () => {
    it('findMatchingPatterns excludes the archived originals and provenance', async () => {
      const { active } = await learnTwoAndConsolidate();
      const result = await service.findMatchingPatterns({ tags: [] });
      expect(result.success && result.value.map((p) => p.id)).toEqual([active]);
    });

    it('a tagged findMatchingPatterns returns only the consolidated pattern', async () => {
      const { active } = await learnTwoAndConsolidate();
      const result = await service.findMatchingPatterns({ tags: [TAG] });
      expect(result.success && result.value.map((p) => p.id)).toEqual([active]);
    });

    it('unscoped stats count only the active pattern', async () => {
      await learnTwoAndConsolidate();
      const result = await service.getPatternStats();
      expect(result.success && result.value.totalPatterns).toBe(1);
      expect(result.success && Number.isFinite(result.value.avgConfidence)).toBe(true);
    });

    it('domain-scoped stats count only the active pattern', async () => {
      await learnTwoAndConsolidate();
      const result = await service.getPatternStats('code-intelligence');
      expect(result.success && result.value.totalPatterns).toBe(1);
    });

    it('leaves every learned, archived and provenance record unchanged', async () => {
      await learnTwoAndConsolidate();
      const before = await allRecordsHash(memory, NS.namespace);
      await service.findMatchingPatterns({ tags: [TAG] });
      await service.getPatternStats();
      await service.getPatternStats('code-intelligence');
      expect(before.count).toBe(5);
      expect(await allRecordsHash(memory, NS.namespace)).toEqual(before);
    });
  });

  describe('defensive cases', () => {
    async function addMalformed(): Promise<void> {
      await memory.set('learning:pattern:malformed-no-context', { id: 'malformed-no-context', domain: 'code-intelligence' }, { ...NS, persist: true });
      // Tagged measured so the shape guard, not the #1121 pre-#1120 rule, decides whether stats read it.
      await memory.set('learning:pattern:malformed-tags', { id: 'malformed-tags', context: { tags: null }, domain: 'code-intelligence', rewardSource: 'measured' }, { ...NS, persist: true });
      await memory.set('learning:pattern:id-mismatch', { id: 'something-else', context: { tags: [TAG] } }, { ...NS, persist: true });
    }

    it('a tagged match neither throws on malformed records nor returns them', async () => {
      const { active } = await learnTwoAndConsolidate();
      await addMalformed();
      const tagged = await service.findMatchingPatterns({ tags: [TAG] });
      expect(tagged.success && tagged.value.map((p) => p.id)).toEqual([active]);
    });

    it('stats skip records without a context and records whose id does not match the key', async () => {
      const { active } = await learnTwoAndConsolidate();
      await addMalformed();
      const stats = await service.getPatternStats();
      // The record with a context but non-array tags passes the shape guard
      // (it is read, and tag matching treats it as untagged).
      expect(stats.success && stats.value.topPatterns.map((p) => p.id).sort()).toEqual([active, 'malformed-tags'].sort());
    });

    it('provenance rows cannot push active patterns past the search cap', async () => {
      // 150 provenance rows written first fill the old 100-key cap.
      for (let i = 0; i < 150; i++) {
        await memory.set(`learning:pattern:creation:old-${i}`, { patternId: `old-${i}`, experienceIds: [], createdAt: new Date() }, { ...NS, persist: true });
      }
      const ids = await learnTwo();
      const result = await service.findMatchingPatterns({ tags: [TAG] });
      expect(result.success && result.value.map((p) => p.id).sort()).toEqual([...ids].sort());
    });

    it('reads every active pattern even when the first scan request is smaller than the store (#1071)', async () => {
      const { readActivePatterns } = await import('../../../src/domains/learning-optimization/active-patterns');
      const ids = await learnTwo();
      const patterns = await readActivePatterns(memory, { retrieve: NS, scanPageSize: 1 });
      expect(patterns.map((p) => p.id).sort()).toEqual([...ids].sort());
    });
  });

  describe('other readers of the same prefix', () => {
    it('coordinator export includes only the active pattern, once', async () => {
      const { active } = await learnTwoAndConsolidate();
      const coordinator = new LearningOptimizationCoordinator(
        { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() } as never,
        memory,
        { spawn: vi.fn(), canSpawn: () => false } as never,
      );
      const exported = await coordinator.exportModels(['code-intelligence', 'test-generation']);
      expect(exported.success && exported.value.patterns.map((p: LearnedPattern) => p.id)).toEqual([active]);
    });

    it.each([0.2, 0.9])('import compares confidence in the write namespace (existing=%s)', async (confidence) => {
      const [id] = await learnTwo();
      const learned = await memory.get<LearnedPattern>(`learning:pattern:${id}`, NS);
      const existing = { ...learned!, confidence };
      await memory.set(`learning:pattern:${id}`, existing, { ...NS, persist: true });
      // A different namespace may contain the same key. It must not decide
      // whether a learned pattern in the domain's namespace is overwritten.
      const decoy = { ...existing, confidence: confidence < 0.5 ? 1 : 0 };
      await memory.set(`learning:pattern:${id}`, decoy, { persist: true });
      const incoming = { ...existing, confidence: 0.5 };
      const coordinator = new LearningOptimizationCoordinator(
        { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() } as never,
        memory,
        { spawn: vi.fn(), canSpawn: () => false } as never,
      );
      const imported = await coordinator.importModels({
        version: '1.0.0', exportedAt: new Date(), patterns: [incoming], knowledge: [], strategies: [],
        checksum: calculateChecksum([incoming], [], []),
      });
      expect(imported.success).toBe(true);
      if (!imported.success) throw imported.error;
      expect(imported.value.patternsImported).toBe(confidence < 0.5 ? 1 : 0);
      expect(imported.value.conflicts[0].resolution).toBe(confidence < 0.5 ? 'overwrite' : 'skip');
      const stored = await memory.get<LearnedPattern>(`learning:pattern:${id}`, NS);
      expect(stored!.confidence).toBe(Math.max(confidence, 0.5));
      expect(await memory.get(`learning:pattern:${id}`)).toEqual(JSON.parse(JSON.stringify(decoy)));
    });

    it('consolidation protocol excludes provenance as well as archives', async () => {
      const { active } = await learnTwoAndConsolidate();
      // #1071: the protocol reads the service's namespace directly.
      const protocol = new LearningConsolidationProtocol(
        { publish: vi.fn(), subscribe: vi.fn() } as never,
        memory,
        {} as never,
        {} as never,
      );
      const gathered = await protocol.gatherPatterns();
      if (!gathered.success) throw gathered.error;
      expect(gathered.value.flatMap((g) => g.patterns.map((p) => p.id))).toEqual([active]);
    });
  });

  describe('MCP qe/learning/optimize {"action":"patterns"}', () => {
    it('returns the active total and finite averages', async () => {
      const { active } = await learnTwoAndConsolidate();
      const tool = new LearningOptimizeTool();
      const result = await tool.invoke({ action: 'patterns' }, { memory } as never);
      const patterns = result.data?.patternResult;
      expect(patterns?.totalPatterns).toBe(1);
      expect(patterns?.topPatterns.map((p) => p.id)).toEqual([active]);
      expect(Number.isFinite(patterns?.avgConfidence)).toBe(true);
      expect(Number.isFinite(patterns?.avgSuccessRate)).toBe(true);
    });
  });
});
