/**
 * #1071 item 1: LearningConsolidationProtocol reads, archives and deletes in
 * `learning-optimization`, where LearningCoordinatorService writes learned
 * patterns, and only ever removes the patterns it selected.
 *
 * Fixture: a fresh SQLite file. Patterns are written by the real
 * `learnPattern()`; only their scores and ages are then adjusted so the
 * retention rules have something to select. A same-key decoy sits in the
 * backend's default namespace.
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
import { TransferSpecialistService } from '../../../src/domains/learning-optimization/services/transfer-specialist';
import {
  LearningConsolidationProtocol,
  type LearningConsolidationConfig,
} from '../../../src/coordination/protocols/learning-consolidation';
import { archiveSelectedPattern } from '../../../src/coordination/protocols/learning-consolidation-archive';
import type { Experience, LearnedPattern } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' } as const;
const DAY = 24 * 60 * 60 * 1000;

function experiences(language: string): Experience[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `synthetic-${language}-${i}`,
    agentId: { value: 'synthetic-1071', domain: 'code-intelligence', type: 'specialist' },
    domain: 'code-intelligence',
    action: 'synthetic-fixture',
    state: { context: { language, framework: 'vitest', testType: 'unit', tags: ['synthetic-1071'] }, metrics: {} },
    result: { success: true, outcome: { synthetic: true }, duration: 1 },
    reward: 1,
    timestamp: new Date(),
  })) as unknown as Experience[];
}

async function namespaceHash(memory: MemoryBackend, namespace?: string): Promise<{ count: number; hash: string }> {
  const opts = namespace ? { namespace } : undefined;
  const keys = (await memory.search('learning:*', 100_000, opts)).sort();
  const records: Array<[string, unknown]> = [];
  for (const key of keys) records.push([key, await memory.get(key, opts)]);
  return { count: keys.length, hash: createHash('sha256').update(JSON.stringify(records)).digest('hex') };
}

describe('#1071 consolidation protocol on the learning namespace (real SQLite)', () => {
  let dir: string;
  let memory: MemoryBackend;
  let service: LearningCoordinatorService;
  let ids: { oldLow: string; youngLow: string; healthy: string };

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1071-protocol-'));
    ({ backend: memory } = await createMemoryBackend(
      { type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true } },
      true,
    ));
    service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });

    const learned: string[] = [];
    for (const language of ['typescript', 'python', 'go']) {
      const result = await service.learnPattern(experiences(language));
      if (!result.success) throw result.error;
      learned.push(result.value.id);
    }
    ids = { oldLow: learned[0], youngLow: learned[1], healthy: learned[2] };

    const adjust = async (id: string, change: Partial<LearnedPattern>) => {
      const stored = await memory.get<LearnedPattern>(`learning:pattern:${id}`, NS);
      await memory.set(`learning:pattern:${id}`, { ...stored!, ...change }, { ...NS, persist: true });
    };
    const lowScores = { confidence: 0.2, successRate: 0.2, usageCount: 1 };
    await adjust(ids.oldLow, { ...lowScores, createdAt: new Date(Date.now() - 10 * DAY) });
    await adjust(ids.youngLow, lowScores);
    await adjust(ids.healthy, { confidence: 0.9, successRate: 0.9, usageCount: 20, createdAt: new Date(Date.now() - 10 * DAY) });

    // Same key in the backend default namespace: never read, never deleted.
    const decoy = await memory.get(`learning:pattern:${ids.oldLow}`, NS);
    await memory.set(`learning:pattern:${ids.oldLow}`, decoy, { persist: true });
  });

  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  function protocol(config: Partial<LearningConsolidationConfig> = {}): LearningConsolidationProtocol {
    return new LearningConsolidationProtocol(
      { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() } as never,
      memory,
      service,
      new TransferSpecialistService(memory),
      config,
    );
  }

  it('reads the learned patterns from the write namespace', async () => {
    const gathered = await protocol().gatherPatterns();
    if (!gathered.success) throw gathered.error;
    expect(gathered.value.flatMap((g) => g.patterns.map((p) => p.id)).sort()).toEqual(Object.values(ids).sort());
  });

  it('by default is a dry run: reports the selection and writes nothing', async () => {
    const before = await namespaceHash(memory, NS.namespace);
    const beforeDefault = await namespaceHash(memory);

    const result = await protocol().execute();
    if (!result.success) throw result.error;

    expect(result.value.dryRun).toBe(true);
    expect(result.value.domainReports.flatMap((r) => r.removedPatterns.map((p) => p.patternId))).toEqual([ids.oldLow]);
    expect(result.value.stats).toMatchObject({ patternsRemoved: 1, patternsArchived: 0 });
    expect(await namespaceHash(memory, NS.namespace)).toEqual(before);
    expect(await namespaceHash(memory)).toEqual(beforeDefault);
  });

  it('with dryRun: false archives only the selected pattern, in the write namespace', async () => {
    const keep = [ids.youngLow, ids.healthy];
    const keptBefore = await Promise.all(keep.map((id) => memory.get(`learning:pattern:${id}`, NS)));
    const provenanceBefore = (await memory.search('learning:pattern:creation:*', 100, NS)).sort();
    const beforeDefault = await namespaceHash(memory);

    const result = await protocol({ dryRun: false }).execute();
    if (!result.success) throw result.error;

    expect(result.value.dryRun).toBe(false);
    expect(result.value.stats).toMatchObject({ patternsRemoved: 1, patternsArchived: 1 });
    expect(result.value.domainReports[0].archiveCounts).toEqual({ selected: 1, archived: 1, missing: 0, failed: 0 });
    expect(await memory.get(`learning:pattern:${ids.oldLow}`, NS)).toBeUndefined();
    expect(await memory.get(`learning:pattern:archived:${ids.oldLow}`, NS)).toMatchObject({ id: ids.oldLow, archivedAt: expect.any(String) });
    expect(await Promise.all(keep.map((id) => memory.get(`learning:pattern:${id}`, NS)))).toEqual(keptBefore);
    expect((await memory.search('learning:pattern:creation:*', 100, NS)).sort()).toEqual(provenanceBefore);
    expect(await namespaceHash(memory)).toEqual(beforeDefault);
  });

  it('never trims a pattern inside the retention grace period', async () => {
    const result = await protocol({ dryRun: false, maxPatternsPerDomain: 1 }).execute();
    if (!result.success) throw result.error;

    const removed = result.value.domainReports.flatMap((r) => r.removedPatterns.map((p) => p.patternId)).sort();
    expect(removed).toEqual([ids.oldLow, ids.healthy].sort());
    expect(await memory.get(`learning:pattern:${ids.youngLow}`, NS)).toMatchObject({ id: ids.youngLow });
  });

  it('archives a pattern in its grace period once the grace period is disabled', async () => {
    const result = await protocol({ dryRun: false, retentionGraceDays: 0 }).execute();
    if (!result.success) throw result.error;

    const removed = result.value.domainReports.flatMap((r) => r.removedPatterns.map((p) => p.patternId)).sort();
    expect(removed).toEqual([ids.oldLow, ids.youngLow].sort());
  });

  it('leaves an active record alone when it is no longer the selected pattern', async () => {
    const selected = await memory.get<LearnedPattern>(`learning:pattern:${ids.oldLow}`, NS);
    const replaced = { ...selected!, id: 'someone-else' };
    await memory.set(`learning:pattern:${ids.oldLow}`, replaced, { ...NS, persist: true });

    expect(await archiveSelectedPattern(memory, selected!)).toBe('missing');
    expect(await memory.get(`learning:pattern:${ids.oldLow}`, NS)).toEqual(JSON.parse(JSON.stringify(replaced)));
    expect(await memory.get(`learning:pattern:archived:${ids.oldLow}`, NS)).toBeUndefined();
  });

  it('never merges a pattern inside the retention grace period', async () => {
    // Make all three similar: the two aged ones may merge, the young one must not.
    for (const id of [ids.oldLow, ids.youngLow]) {
      const stored = await memory.get<LearnedPattern>(`learning:pattern:${id}`, NS);
      await memory.set(`learning:pattern:${id}`, { ...stored!, context: { ...stored!.context, language: 'go' } }, { ...NS, persist: true });
    }
    const youngBefore = await memory.get(`learning:pattern:${ids.youngLow}`, NS);

    const result = await protocol({ dryRun: false }).execute();
    if (!result.success) throw result.error;

    const merged = result.value.domainReports.flatMap((r) => r.mergedPatterns.flatMap((m) => m.sourcePatternIds)).sort();
    expect(merged).toEqual([ids.oldLow, ids.healthy].sort());
    expect(await memory.get(`learning:pattern:${ids.youngLow}`, NS)).toEqual(youngBefore);
    expect(await memory.get(`learning:pattern:archived:${ids.youngLow}`, NS)).toBeUndefined();
  });

  it('leaves a selected pattern active when it was used after selection', async () => {
    const selected = await memory.get<LearnedPattern>(`learning:pattern:${ids.oldLow}`, NS);
    const used = { ...selected!, usageCount: selected!.usageCount + 1, lastUsedAt: new Date() };
    await memory.set(`learning:pattern:${ids.oldLow}`, used, { ...NS, persist: true });

    expect(await archiveSelectedPattern(memory, selected!)).toBe('missing');
    expect(await memory.get(`learning:pattern:${ids.oldLow}`, NS)).toEqual(JSON.parse(JSON.stringify(used)));
    expect(await memory.get(`learning:pattern:archived:${ids.oldLow}`, NS)).toBeUndefined();
  });

  it('reads back the results it stored', async () => {
    await protocol({ dryRun: false }).execute();
    const previous = await protocol().getPreviousConsolidations(5);
    expect(previous).toHaveLength(1);
    expect(previous[0].completedAt).toBeInstanceOf(Date);
    expect((await protocol().getConsolidationHistory(4)).totalPatternsRemoved).toBe(1);
  });
});
