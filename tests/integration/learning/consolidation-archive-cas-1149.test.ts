/**
 * #1149: follow-ups to the #1106 merge path and the #1071 trim path.
 *
 * 1. The archive read-back compared only `id`; a copy that stored just `{id}`
 *    passed and the source was deleted.
 * 2. The active record was deleted without re-checking it, so an update made
 *    between the copy and the delete was lost.
 * 3. A failure after the consolidated pattern was stored left it active next
 *    to its sources.
 * 4. A failure midway through the deletes was reported as "every source
 *    pattern was left active".
 * 5. Two concurrent merges of the same ids stored two consolidated patterns.
 * 6. A failed copy left archive rows behind for patterns that stayed active.
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
import {
  archiveSelectedPattern,
  copyPatternToArchive,
  removeArchivedPattern,
} from '../../../src/domains/learning-optimization/pattern-archive';
import type { Experience, LearnedPattern } from '../../../src/domains/learning-optimization/interfaces';

const NS = { namespace: 'learning-optimization' } as const;

function experiences(n: number): Experience[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `exp-1149-${n}-${i}`,
    agentId: { value: 'synthetic-1149', domain: 'code-intelligence', type: 'specialist' },
    domain: 'code-intelligence',
    action: 'synthetic-1149',
    state: { context: { language: 'typescript', framework: 'vitest', testType: 'unit', tags: ['synthetic-1149'] }, metrics: {} },
    result: { success: true, outcome: {}, duration: 1 },
    reward: 1,
    timestamp: new Date(),
  })) as unknown as Experience[];
}

/** Hooks that run before the real call; a hook may replace the call by returning `{ value }`. */
interface Hooks {
  set?: (key: string, value: unknown) => Promise<{ value: unknown } | void> | { value: unknown } | void;
  get?: (key: string) => Promise<void> | void;
  delete?: (key: string) => Promise<void> | void;
}

function hooked(target: MemoryBackend, hooks: () => Hooks): MemoryBackend {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop === 'set') {
        return async (key: string, value: unknown, opts: unknown) => {
          const replaced = await hooks().set?.(key, value);
          return t.set(key, replaced ? replaced.value : value, opts as never);
        };
      }
      if (prop === 'get') {
        return async (key: string, opts: unknown) => {
          await hooks().get?.(key);
          return t.get(key, opts as never);
        };
      }
      if (prop === 'delete') {
        return async (key: string, opts: unknown) => {
          await hooks().delete?.(key);
          return t.delete(key, opts as never);
        };
      }
      const v = Reflect.get(t, prop, receiver);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

describe('#1149 pattern archive compare-and-delete (real SQLite)', () => {
  let dir: string;
  let backend: MemoryBackend;
  let memory: MemoryBackend;
  let hooks: Hooks;
  let ids: string[];
  let service: LearningCoordinatorService;

  beforeEach(async () => {
    resetUnifiedMemory();
    dir = mkdtempSync(join(tmpdir(), 'aqe-1149-'));
    ({ backend } = await createMemoryBackend({ type: 'sqlite', sqlite: { path: join(dir, 'memory.db'), walMode: true } }, true));
    hooks = {};
    ids = [];
    memory = hooked(backend, () => hooks);
    service = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
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

  const activeKey = (id: string) => `learning:pattern:${id}`;
  const archiveKey = (id: string) => `learning:pattern:archived:${id}`;
  const active = (id: string) => backend.get<LearnedPattern>(activeKey(id), NS);
  const archived = (id: string) => backend.get<LearnedPattern>(archiveKey(id), NS);
  const activeKeys = async () => (await backend.search('learning:pattern:*', 1000, NS))
    .filter((k) => !k.includes(':archived:') && !k.includes(':creation:')).sort();
  const bumpUsage = async (id: string) => {
    const stored = await backend.get<LearnedPattern>(activeKey(id), NS);
    await backend.set(activeKey(id), { ...stored!, usageCount: stored!.usageCount + 1 }, { ...NS, persist: true });
  };
  const isNewActiveKey = (key: string) => key.startsWith('learning:pattern:') && !key.includes(':archived:')
    && !key.includes(':creation:') && !ids.some((id) => key.endsWith(id));

  describe('item 1: the archive copy is compared in full', () => {
    const idOnly: Hooks = { set: (key, value) => key.includes(':archived:') ? { value: { id: (value as LearnedPattern).id } } : undefined };

    it('trim path: an archive copy holding only the id is not verified and the pattern stays active', async () => {
      const pattern = (await active(ids[0]))!;
      hooks = idOnly;

      expect(await archiveSelectedPattern(memory, pattern)).toBe('failed');
      expect(await active(ids[0])).toEqual(pattern);
    });

    it('merge path: an archive copy holding only the id stops the merge and every source stays active', async () => {
      const before = await activeKeys();
      hooks = idOnly;

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(false);
      for (const id of ids) expect((await active(id))?.id).toBe(id);
      expect(await activeKeys()).toEqual(before);
    });

    it('accepts a copy that differs from the snapshot only in Date vs ISO string form', async () => {
      const stored = (await active(ids[0]))!;
      const snapshot = { ...stored, createdAt: new Date(stored.createdAt), lastUsedAt: new Date(stored.lastUsedAt) };

      expect(await archiveSelectedPattern(memory, snapshot)).toBe('archived');
      expect(await active(ids[0])).toBeFalsy();
      expect(await archived(ids[0])).toMatchObject({ id: ids[0], usageCount: stored.usageCount });
    });
  });

  describe('item 2: the active record is deleted only if it still matches the archive copy', () => {
    it('trim path: an update between copy and delete keeps the pattern active with the update', async () => {
      const pattern = (await active(ids[0]))!;
      expect(await copyPatternToArchive(memory, pattern)).toBe('copied');
      await bumpUsage(ids[0]);

      expect(await removeArchivedPattern(memory, pattern)).toBe('changed');
      expect((await active(ids[0]))?.usageCount).toBe(pattern.usageCount + 1);
    });

    it('trim path: archiveSelectedPattern reports the pattern as changed and drops the stale copy', async () => {
      const pattern = (await active(ids[0]))!;
      hooks = {
        get: async (key) => {
          // The read that guards the delete: bump usage just before it.
          if (key === activeKey(ids[0]) && (await backend.has(archiveKey(ids[0]), NS))) {
            hooks = {};
            await bumpUsage(ids[0]);
          }
        },
      };

      expect(await archiveSelectedPattern(memory, pattern)).toBe('missing');
      expect((await active(ids[0]))?.usageCount).toBe(pattern.usageCount + 1);
      expect(await archived(ids[0])).toBeFalsy();
    });

    it('merge path: an update to a source between copy and delete keeps that source active and is reported', async () => {
      hooks = {
        delete: async (key) => {
          if (key === activeKey(ids[0])) { hooks = {}; await bumpUsage(ids[1]); }
        },
      };

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(false);
      const message = !merged.success ? merged.error.message : '';
      expect(message).toContain(`removed: ${ids[0]}`);
      expect(message).toContain(`${ids[1]} (changed after its archive copy)`);
      expect(await active(ids[0])).toBeFalsy();
      expect((await active(ids[1]))?.usageCount).toBeGreaterThan(0);
      // The consolidated pattern stays: it carries the data of the removed source.
      expect(await activeKeys()).toHaveLength(2);
    });
  });

  describe('item 3: a failure after the consolidated pattern is stored rolls it back', () => {
    it.each([
      ['the read-back throws', { get: (key: string) => { if (isNewActiveKey(key)) throw new Error('disk I/O error'); } }],
      ['the first source delete throws', { delete: (key: string) => { if (key === activeKey(ids[0])) throw new Error('database is locked'); } }],
    ] as const)('leaves no consolidated pattern when %s', async (_label, h) => {
      const before = await activeKeys();
      hooks = h as Hooks;

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(false);
      expect(!merged.success && merged.error.message).toMatch(/every source pattern was left active/);
      expect(await activeKeys()).toEqual(before);
      for (const id of ids) expect(await archived(id)).toBeFalsy();
    });
  });

  describe('item 4: a failure midway through the deletes reports each source', () => {
    it('reports the archived source as removed and the other as still active', async () => {
      hooks = { delete: (key) => { if (key === activeKey(ids[1])) throw new Error('database is locked'); } };

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(false);
      const message = !merged.success ? merged.error.message : '';
      expect(message).not.toMatch(/every source pattern was left active/);
      expect(message).toContain(`removed: ${ids[0]}`);
      expect(message).toContain(`${ids[1]} (delete failed: database is locked)`);
      expect(await active(ids[0])).toBeFalsy();
      expect((await archived(ids[0]))?.id).toBe(ids[0]);
      expect((await active(ids[1]))?.id).toBe(ids[1]);
      expect(await archived(ids[1])).toBeFalsy();
    });

    it('counts a delete that threw after it took effect as removed', async () => {
      hooks = {
        delete: async (key) => {
          if (key === activeKey(ids[0])) { hooks = {}; await backend.delete(key, NS); throw new Error('SQLITE_BUSY after commit'); }
        },
      };

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(true);
      for (const id of ids) {
        expect(await active(id)).toBeFalsy();
        expect((await archived(id))?.id).toBe(id);
      }
      expect(await activeKeys()).toHaveLength(1);
    });
  });

  describe('item 5: concurrent merges of the same ids', () => {
    it('store exactly one consolidated pattern', async () => {
      const results = await Promise.all([service.consolidatePatterns(ids), service.consolidatePatterns(ids)]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      const keys = await activeKeys();
      expect(keys).toHaveLength(1);
      for (const id of ids) expect(await active(id)).toBeFalsy();
    });

    it('serialize across service instances on the same backend', async () => {
      const other = new LearningCoordinatorService({ memory }, { enableLLMSynthesis: false });
      const results = await Promise.all([service.consolidatePatterns(ids), other.consolidatePatterns(ids)]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(await activeKeys()).toHaveLength(1);
    });
  });

  describe('item 6: a failed copy leaves no archive rows for patterns that stay active', () => {
    it('removes the verified copy of the first source when the second copy fails', async () => {
      hooks = { set: (key) => key === archiveKey(ids[1]) ? { value: {} } : undefined };

      const merged = await service.consolidatePatterns(ids);

      expect(merged.success).toBe(false);
      for (const id of ids) {
        expect((await active(id))?.id).toBe(id);
        expect(await archived(id)).toBeFalsy();
      }
    });

    it('trim path: a failed copy is not left behind', async () => {
      const pattern = (await active(ids[0]))!;
      hooks = { set: (key) => key.includes(':archived:') ? { value: { id: pattern.id } } : undefined };

      expect(await archiveSelectedPattern(memory, pattern)).toBe('failed');
      expect(await archived(ids[0])).toBeFalsy();
      expect(await active(ids[0])).toEqual(pattern);
    });
  });
});
