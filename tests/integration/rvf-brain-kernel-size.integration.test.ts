/**
 * #1238: the native RVF writer rejects a kernel image over 128 MiB with a
 * misleading `RVF error 0x0303: FsyncFailed`. The exporter must keep the
 * regenerable code index out of the kernel, and fail with the size before any
 * native call when the brain is still too large.
 *
 * Real SQLite databases and real .rvf files; skips without @ruvector/rvf-node.
 */

import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { createRvfStore, isRvfNativeAvailable } from '../../src/integrations/ruvector/rvf-native-adapter.js';
import {
  brainInfoFromRvf,
  exportBrainToRvf,
  importBrainFromRvf,
  RVF_MAX_KERNEL_BYTES,
  RvfKernelTooLargeError,
} from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import { ensureAllBrainTables } from '../../src/integrations/ruvector/brain-table-ddl.js';
import { TABLE_CONFIGS } from '../../src/integrations/ruvector/brain-shared.js';

const describeNative = describe.skipIf(!isRvfNativeAvailable());

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function workDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'aqe-1238-kernel-'));
  dirs.push(d);
  return d;
}

function brainDb(): Database.Database {
  const db = new Database(':memory:');
  ensureAllBrainTables(db);
  db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name) VALUES (?, ?, ?, ?, ?)`)
    .run('pat-1', 'test-gen', 'test-generation', 'test-generation', 'Pattern 1');
  return db;
}

function addVectors(db: Database.Database, ids: string[]): void {
  const insert = db.prepare(`INSERT INTO vectors (id, namespace, embedding, dimensions) VALUES (?, 'default', ?, 4)`);
  for (const id of ids) insert.run(id, Buffer.from(new Float32Array([1, 2, 3, 4]).buffer));
}

function addExperience(db: Database.Database, id: string, resultBytes: number): void {
  db.prepare(`INSERT INTO captured_experiences (id, task, agent, result_json) VALUES (?, 'task', 'agent', ?)`)
    .run(id, 'x'.repeat(resultBytes));
}

const CODE_IDS = [
  'code-intelligence:kg:node:src/a.ts:function:a',
  'code-intelligence:semantic:code:src/a.ts',
  'code-intelligence:c4:diagram:context',
];
const LEARNING_IDS = ['learning:vec-1', 'learning:vec-2'];

describeNative('RVF brain kernel size (#1238)', () => {
  it('should_failWithTheSizeBeforeAnyNativeCall_when_kernelExceedsTheNativeLimit', () => {
    const dir = workDir();
    const db = brainDb();
    addExperience(db, 'exp-big', 129 * 1024 * 1024);

    let error: unknown;
    try {
      exportBrainToRvf(db, { outputPath: join(dir, 'brain.rvf') });
    } catch (e) {
      error = e;
    }

    expect((error as Error).message).not.toMatch(/FsyncFailed/);
    expect((error as Error).message).toMatch(/^RVF_KERNEL_TOO_LARGE: .*over the 128\.0 MB limit.*captured_experiences 129\.0 MB/);
    expect(error).toBeInstanceOf(RvfKernelTooLargeError);
    expect(RVF_MAX_KERNEL_BYTES).toBe(128 * 1024 * 1024);
    expect(readdirSync(dir)).toEqual([]);
    db.close();
  }, 60_000);

  it('should_leaveThePreviousMirrorUntouched_when_theNextExportIsTooLarge', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    const db = brainDb();
    exportBrainToRvf(db, { outputPath: rvfPath });
    const before = readFileSync(rvfPath);
    addExperience(db, 'exp-1', 4096);

    expect(() => exportBrainToRvf(db, { outputPath: rvfPath, maxKernelBytes: 2048 }))
      .toThrow(/RVF_KERNEL_TOO_LARGE: the brain kernel needs at least .* over the 0\.0 MB limit/);
    expect(readFileSync(rvfPath).equals(before)).toBe(true);
    expect(readdirSync(dir).filter(f => f.includes('.tmp.'))).toEqual([]);
    db.close();
  });

  it('should_keepCodeIndexVectorsOutOfTheKernel_andCountThem', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    const db = brainDb();
    addVectors(db, [...CODE_IDS, ...LEARNING_IDS]);

    const manifest = exportBrainToRvf(db, { outputPath: rvfPath });
    const target = new Database(':memory:');
    ensureAllBrainTables(target);
    importBrainFromRvf(target, rvfPath, { mergeStrategy: 'skip-conflicts' });

    expect(manifest.stats.tableCounts?.vectors).toBe(2);
    expect(manifest.stats.skippedCacheRows).toEqual({ vectors: 3 });
    expect(brainInfoFromRvf(rvfPath).stats.tableCounts?.vectors).toBe(2);
    expect((target.prepare('SELECT id FROM vectors ORDER BY id').all() as Array<{ id: string }>).map(r => r.id))
      .toEqual(LEARNING_IDS);
    target.close();
    db.close();
  });

  describe('replacing a mirror written before #1238, which still holds code-index vectors', () => {
    /** A kernel in the old layout: every table present, vectors including the code index. */
    function oldMirror(rvfPath: string, vectorIds: string[]): void {
      const tables: Record<string, unknown[]> = Object.fromEntries(TABLE_CONFIGS.map(c => [c.tableName, []]));
      tables.qe_patterns = [{ id: 'pat-1' }];
      tables.vectors = vectorIds.map(id => ({ id, namespace: 'default', dimensions: 4 }));
      const rvf = createRvfStore(rvfPath, 384);
      rvf.embedKernel(Buffer.from(JSON.stringify({ version: '3.0', format: 'rvf', tables })));
      rvf.close();
    }

    it('should_replaceIt_when_onlyTheCodeIndexRowsAreMissing', () => {
      const rvfPath = join(workDir(), 'brain.rvf');
      oldMirror(rvfPath, [...CODE_IDS, ...LEARNING_IDS]);
      const db = brainDb();
      addVectors(db, [...CODE_IDS, ...LEARNING_IDS]);

      const manifest = exportBrainToRvf(db, { outputPath: rvfPath });

      expect(manifest.stats.tableCounts?.vectors).toBe(2);
      expect(existsSync(`${rvfPath}.manifest.json`)).toBe(true);
      db.close();
    });

    it('should_stillRefuse_when_itHasMoreLearningVectors', () => {
      const rvfPath = join(workDir(), 'brain.rvf');
      oldMirror(rvfPath, [...CODE_IDS, ...LEARNING_IDS, 'learning:vec-3', 'learning:vec-4']);
      const db = brainDb();
      addVectors(db, [...CODE_IDS, ...LEARNING_IDS]);

      expect(() => exportBrainToRvf(db, { outputPath: rvfPath }))
        .toThrow(/RVF_MIRROR_RICHER.*vectors 4 -> 2/);
      db.close();
    });
  });
});
