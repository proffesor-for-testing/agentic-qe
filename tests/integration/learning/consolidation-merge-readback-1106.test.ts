/**
 * #1106: the consolidation merge path archived source patterns without
 * reading the archive copy back, then deleted them. A silent or partial
 * archive write lost the patterns. Now every source copy is verified and the
 * consolidated pattern is read back before any source is deleted; on any
 * failure nothing is merged and every source stays active.
 *
 * Fixture: a fresh SQLite file; patterns written by the real learnPattern().
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory';
import { LearningCoordinatorService } from '../../../src/domains/learning-optimization/services/learning-coordinator';
import type { Experience, LearnedPattern } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' } as const;
type Fault = 'none' | 'silent-archive' | 'partial-archive' | 'lost-consolidated';

function experiences(n: number): Experience[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `exp-1106-${n}-${i}`,
    agentId: { value: 'synthetic-1106', domain: 'code-intelligence', type: 'specialist' },
    domain: 'code-intelligence',
    action: 'synthetic-1106',
    state: { context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['synthetic-1106'] }, metrics: {} },
    result: { success: true, outcome: {}, duration: 1 },
    reward: 1,
    timestamp: new Date(),
  })) as unknown as Experience[];
}

/** The backend, with one kind of write misbehaving. */
function faulty(target: MemoryBackend, fault: () => Fault, sourceIds: () => string[]): MemoryBackend {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === 'set') {
        return async (key: string, value: unknown, opts: unknown) => {
          const f = fault();
          if (f === 'silent-archive' && key.includes(':archived:')) return;
          if (f === 'partial-archive' && key.includes(':archived:')) return t.set(key, {}, opts as never);
          const isNew = key.startsWith('learning:pattern:') && !key.includes(':archived:') && !key.includes(':creation:')
            && !sourceIds().some((id) => key.endsWith(id));
          if (f === 'lost-consolidated' && isNew) return;
          return t.set(key, value, opts as never);
        };
      }
      const v = Reflect.get(t, prop, receiver);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

describe('#1106 consolidation merge path reads every write back before deleting (real SQLite)', () => {
  let dir: string;
  let backend: MemoryBackend;
  let fault: Fault;
  let ids: string[];
  let service: LearningCoordinatorService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1106-merge-'));
    ({ backend } = await createMemoryBackend({ type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true } }, true));
    fault = 'none';
    ids = [];
    service = new LearningCoordinatorService({ memory: faulty(backend, () => fault, () => ids) }, { enableLLMSynthesis: false });
    for (const n of [0, 1]) {
      const learned = await service.learnPattern(experiences(n));
      if (!learned.success) throw learned.error;
      ids.push(learned.value.id);
    }
  });

  afterEach(async () => {
    await backend.dispose();
    resetUnifiedMemory();
    rmSync(dir, { recursive: true, force: true });
  });

  const active = (id: string) => backend.get<LearnedPattern>(`learning:pattern:${id}`, NS);
  const archived = (id: string) => backend.get<LearnedPattern>(`learning:pattern:archived:${id}`, NS);
  const activeKeys = async () => (await backend.search('learning:pattern:*', 1000, NS))
    .filter((k) => !k.includes(':archived:') && !k.includes(':creation:'));

  it('archives and removes the sources once every copy is verified', async () => {
    const merged = await service.consolidatePatterns(ids);

    expect(merged.success).toBe(true);
    for (const id of ids) {
      expect(await active(id)).toBeFalsy();
      expect((await archived(id))?.id).toBe(id);
    }
    expect(await activeKeys()).toHaveLength(1);
  });

  it.each([
    ['an archive write that silently does nothing', 'silent-archive'],
    ['an archive write that stores a partial record', 'partial-archive'],
    ['a consolidated pattern that is not stored', 'lost-consolidated'],
  ] as const)('keeps every source pattern active after %s', async (_label, f) => {
    const before = (await activeKeys()).sort();
    fault = f;

    const merged = await service.consolidatePatterns(ids);

    expect(merged.success).toBe(false);
    expect(!merged.success && merged.error.message).toMatch(/left active/);
    for (const id of ids) expect((await active(id))?.id).toBe(id);
    expect((await activeKeys()).sort()).toEqual(before);
  });
});
