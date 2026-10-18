/**
 * #1106 items 3 and 4:
 * 3. A failure in one domain was swallowed and execute() still reported
 *    success. Failed steps are now listed in `errors` with `status: 'partial'`,
 *    and a run that fails in every domain returns an error.
 * 4. A dry run kept every source of a merge group when trimming, while a real
 *    run keeps the one merged pattern, so the two selected different trims.
 *    Both now trim the same set; the dry run predicts the merged pattern with
 *    the same builder the real merge uses.
 *
 * Fixture: a fresh SQLite file per run; patterns written by learnPattern().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import { TransferSpecialistService } from '../../../src/domains/learning-optimization/services/transfer-specialist';
import {
  DRY_RUN_MERGE_ID_PREFIX,
  LearningConsolidationProtocol,
  type ConsolidationResult,
  type LearningConsolidationConfig,
} from '../../../src/coordination/protocols/learning-consolidation';
import type { DomainName } from '../../../src/shared/types';
import type { Experience, LearnedPattern } from '../../../src/domains/learning-optimization/interfaces';
import { err } from '../../../src/shared/types';

const NS = { namespace: 'learning-optimization' } as const;
const DAY = 24 * 60 * 60 * 1000;

interface Spec { name: string; domain: DomainName; context: Record<string, unknown>; usageCount: number }

/** A merge pair plus three dissimilar singles, all past the grace period. */
const SPECS: Spec[] = [
  { name: 'pair-a', domain: 'code-intelligence', context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['pair'] }, usageCount: 40 },
  { name: 'pair-b', domain: 'code-intelligence', context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['pair'] }, usageCount: 30 },
  { name: 'single-1', domain: 'code-intelligence', context: { language: 'python', framework: 'pytest', testType: 'integration', tags: ['s1'] }, usageCount: 5 },
  { name: 'single-2', domain: 'code-intelligence', context: { language: 'go', framework: 'gotest', testType: 'e2e', tags: ['s2'] }, usageCount: 10 },
  { name: 'single-3', domain: 'code-intelligence', context: { language: 'rust', framework: 'cargo', testType: 'contract', tags: ['s3'] }, usageCount: 15 },
];

function experiences(spec: Spec): Experience[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `exp-${spec.name}-${i}`,
    agentId: { value: 'synthetic-1106', domain: spec.domain, type: 'specialist' },
    domain: spec.domain,
    action: 'synthetic-1106',
    state: { context: spec.context, metrics: {} },
    result: { success: true, outcome: {}, duration: 1 },
    reward: 1,
    timestamp: new Date(),
  })) as unknown as Experience[];
}

async function fixture(specs: Spec[] = SPECS): Promise<{ dir: string; memory: MemoryBackend; service: LearningCoordinatorService; byName: Map<string, string> }> {
  resetUnifiedMemory();
  const dir = mkdtempSync(join(tmpdir(), 'aqe-1106-parity-'));
  const { backend: memory } = await createMemoryBackend({ type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true } }, true);
  const service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
  const byName = new Map<string, string>();
  for (const spec of specs) {
    const learned = await service.learnPattern(experiences(spec));
    if (!learned.success) throw learned.error;
    const key = `learning:pattern:${learned.value.id}`;
    const stored = await memory.get<LearnedPattern>(key, NS);
    await memory.set(key, { ...stored!, usageCount: spec.usageCount, createdAt: new Date(Date.now() - 60 * DAY) }, { ...NS, persist: true });
    byName.set(learned.value.id, spec.name);
  }
  return { dir, memory, service, byName };
}

function protocol(memory: MemoryBackend, service: LearningCoordinatorService, config: Partial<LearningConsolidationConfig>) {
  return new LearningConsolidationProtocol(
    { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() } as never,
    memory, service, new TransferSpecialistService(memory),
    { maxPatternsPerDomain: 3, minPatternsForConsolidation: 1, ...config },
  );
}

/** Trims and merges of a run, by fixture name; a merged pattern is "merged(<sources>)". */
function selection(result: ConsolidationResult, byName: Map<string, string>, mergedIds: Map<string, string[]>) {
  const name = (id: string) => byName.get(id)
    ?? `merged(${(mergedIds.get(id) ?? []).map((s) => byName.get(s)).sort().join('+')})`;
  const report = result.domainReports[0];
  return {
    merged: report.mergedPatterns.map((m) => m.sourcePatternIds.map(name).sort().join('+')).sort(),
    removed: report.removedPatterns.map((r) => name(r.patternId)).sort(),
    after: report.patternsAfterCount,
  };
}

describe('#1106 dry run predicts the real run (real SQLite)', () => {
  const cleanup: Array<() => Promise<void>> = [];
  beforeEach(() => { cleanup.length = 0; });
  afterEach(async () => {
    for (const fn of cleanup) await fn();
    resetUnifiedMemory();
  });

  it.each([0, 7])('selects the same merges and trims as the real run (retentionGraceDays=%i)', async (retentionGraceDays) => {
    const runs: Record<'dry' | 'real', ReturnType<typeof selection>> = {} as never;
    for (const mode of ['dry', 'real'] as const) {
      const fx = await fixture();
      cleanup.push(async () => { await fx.memory.dispose(); rmSync(fx.dir, { recursive: true, force: true }); });
      const run = await protocol(fx.memory, fx.service, { dryRun: mode === 'dry', retentionGraceDays }).execute();
      if (!run.success) throw run.error;
      const mergedIds = new Map<string, string[]>();
      for (const m of run.value.domainReports[0].mergedPatterns) {
        const id = mode === 'dry' ? `${DRY_RUN_MERGE_ID_PREFIX}${m.sourcePatternIds.join('+')}` : m.resultPatternId;
        mergedIds.set(id, m.sourcePatternIds);
      }
      runs[mode] = selection(run.value, fx.byName, mergedIds);
      expect(run.value.status).toBe('completed');
    }

    expect(runs.real.merged).toEqual(['pair-a+pair-b']);
    expect(runs.real.removed.length).toBeGreaterThan(0);
    expect(runs.dry).toEqual(runs.real);
  });
});

describe('#1106 failed steps surface in the result', () => {
  let fx: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { fx = await fixture(); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fx.memory.dispose();
    resetUnifiedMemory();
    rmSync(fx.dir, { recursive: true, force: true });
  });

  it('reports a failed merge as partial, with the sources kept active', async () => {
    vi.spyOn(fx.service, 'consolidatePatterns').mockResolvedValue(err(new Error('archive copy not verified')));

    const run = await protocol(fx.memory, fx.service, { dryRun: false, maxPatternsPerDomain: 100 }).execute();

    expect(run.success).toBe(true);
    if (!run.success) return;
    expect(run.value.status).toBe('partial');
    expect(run.value.errors).toEqual([expect.objectContaining({
      domain: 'code-intelligence', step: 'merge', error: expect.stringMatching(/archive copy not verified/),
    })]);
    expect(run.value.domainReports[0].mergedPatterns).toEqual([]);
  });

  it('reports a domain that throws as partial alongside the domains that completed', async () => {
    const p = protocol(fx.memory, fx.service, { dryRun: true });
    const real = p.consolidatePatterns.bind(p);
    vi.spyOn(p, 'gatherPatterns').mockImplementation(async function (this: unknown) {
      const g = await LearningConsolidationProtocol.prototype.gatherPatterns.call(p);
      if (!g.success) return g;
      return { success: true, value: [...g.value, { ...g.value[0], domain: 'test-generation' as DomainName }] } as never;
    });
    vi.spyOn(p, 'consolidatePatterns').mockImplementation(async (id, group) =>
      group.domain === 'test-generation' ? err(new Error('boom in test-generation')) : real(id, group));

    const run = await p.execute();

    expect(run.success).toBe(true);
    if (!run.success) return;
    expect(run.value.status).toBe('partial');
    expect(run.value.errors).toEqual([{ domain: 'test-generation', step: 'consolidate', error: 'boom in test-generation' }]);
    expect(run.value.domainReports.map((r) => r.domain)).toEqual(['code-intelligence']);
  });

  it('returns an error, not a result, when every domain fails', async () => {
    const p = protocol(fx.memory, fx.service, { dryRun: true });
    vi.spyOn(p, 'consolidatePatterns').mockResolvedValue(err(new Error('boom')));

    const run = await p.execute();

    expect(run.success).toBe(false);
    expect(!run.success && run.error.message).toMatch(/failed in every domain: code-intelligence: boom/);
  });
});
