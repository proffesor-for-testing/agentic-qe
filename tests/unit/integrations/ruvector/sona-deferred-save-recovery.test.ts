import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createPersistentSONAEngine, type PersistentSONAEngine } from '../../../../src/integrations/ruvector/sona-persistence.js';
import { getUnifiedPersistence, initializeUnifiedPersistence, resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence.js';

let directory: string;
let engine: PersistentSONAEngine | undefined;
const domain = 'test-generation' as const;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  resetUnifiedPersistence();
  directory = mkdtempSync(join(tmpdir(), 'aqe-sona-save-recovery-'));
  await initializeUnifiedPersistence({ dbPath: join(directory, 'memory.db') });
});
afterEach(async () => {
  getUnifiedPersistence().getDatabase().exec('DROP TRIGGER IF EXISTS reject_sona_save');
  await engine?.close();
  vi.useRealTimers();
  engine = undefined;
  resetUnifiedPersistence();
  rmSync(directory, { recursive: true, force: true });
});
function createPattern() {
  return engine!.createPattern(
    { id: 'state', features: new Array(384).fill(0.25) },
    { type: 'test-action', value: 'run-tests' },
    { reward: 0.8, success: true, quality: 0.9 }, domain, domain,
  );
}

describe('deferred SONA write recovery', () => {
  it('contains a native failed insert, writes unrelated rows, then retries the retained row', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 10 });
    const blocked = createPattern();
    const healthy = createPattern();
    const db = getUnifiedPersistence().getDatabase();
    // Simulate a real storage rejection for one owned row, not a mocked writer.
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      WHEN NEW.id = '${blocked.id}' BEGIN SELECT RAISE(ABORT, 'temporary SONA write rejection'); END`);
    expect(() => vi.advanceTimersByTime(10)).not.toThrow();
    expect((await engine.getAllPersistedPatterns()).map(p => p.id)).toEqual([healthy.id]);
    db.exec('DROP TRIGGER reject_sona_save');
    vi.advanceTimersByTime(1000);
    expect(new Set((await engine.getAllPersistedPatterns()).map(p => p.id)))
      .toEqual(new Set([blocked.id, healthy.id]));
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getAllPatterns()).toHaveLength(2);
  });
  it('reports an unrecovered close failure and preserves the pending write for a later close', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 10 });
    const pattern = createPattern();
    const db = getUnifiedPersistence().getDatabase();
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      BEGIN SELECT RAISE(ABORT, 'temporary SONA write rejection'); END`);
    // The old timer throws and drops its queue; allow that observation so the
    // close assertion separately proves the loss of pending durable work.
    try { vi.advanceTimersByTime(10); } catch { /* baseline timer exception */ }
    await expect(engine.close()).rejects.toThrow('temporary SONA write rejection');
    db.exec('DROP TRIGGER reject_sona_save');
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getAllPatterns().map(p => p.id)).toEqual([pattern.id]);
  });
  it('bounds permanent native failures without losing the pending row', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 10 });
    const pattern = createPattern();
    const db = getUnifiedPersistence().getDatabase();
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      BEGIN SELECT RAISE(ABORT, 'permanent SONA write rejection'); END`);
    vi.advanceTimersByTime(60000);
    expect(vi.getTimerCount()).toBe(0);
    expect(await engine.getAllPersistedPatterns()).toHaveLength(0);
    db.exec('DROP TRIGGER reject_sona_save');
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getAllPatterns().map(p => p.id)).toEqual([pattern.id]);
  });
  it('keeps the first batch referenced but unrefs a retry after a native failed batch', async () => {
    vi.useRealTimers();
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 20 });
    const db = getUnifiedPersistence().getDatabase();
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      BEGIN SELECT RAISE(ABORT, 'retry timer fixture'); END`);
    createPattern();
    const internals = engine as unknown as { saveTimer: NodeJS.Timeout; consecutiveSaveFailures: number };
    expect(internals.saveTimer.hasRef()).toBe(true);
    await vi.waitFor(() => expect(internals.consecutiveSaveFailures).toBe(1));
    expect(internals.saveTimer.hasRef()).toBe(false);
  });
  it('references an existing retry when new explicit work starts a fresh batch', async () => {
    vi.useRealTimers();
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 20 });
    const db = getUnifiedPersistence().getDatabase();
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      BEGIN SELECT RAISE(ABORT, 'retry timer fixture'); END`);
    createPattern();
    const internals = engine as unknown as { saveTimer: NodeJS.Timeout; consecutiveSaveFailures: number };
    await vi.waitFor(() => expect(internals.consecutiveSaveFailures).toBe(1));
    const retry = internals.saveTimer;
    expect(retry.hasRef()).toBe(false);
    db.exec('DROP TRIGGER reject_sona_save');
    createPattern();
    expect(internals.saveTimer).toBe(retry);
    expect(retry.hasRef()).toBe(true);
    expect(internals.consecutiveSaveFailures).toBe(0);
  });
  it('persists the first batch when a real process drains naturally without close', () => {
    vi.useRealTimers();
    const databasePath = join(directory, 'drain.db');
    const scriptPath = join(directory, 'drain.mts');
    writeFileSync(scriptPath, `
      import { initializeUnifiedPersistence } from ${JSON.stringify(pathToFileURL(resolve('src/kernel/unified-persistence.ts')).href)};
      import { createPersistentSONAEngine } from ${JSON.stringify(pathToFileURL(resolve('src/integrations/ruvector/sona-persistence.ts')).href)};
      await initializeUnifiedPersistence({ dbPath: ${JSON.stringify(databasePath)} });
      const engine = await createPersistentSONAEngine({ domain: 'test-generation', autoSaveInterval: 200 });
      engine.createPattern({ id: 'drain', features: new Array(384).fill(0.25) },
        { type: 'test-action', value: 'run-tests' },
        { reward: 0.8, success: true, quality: 0.9 }, 'test-generation', 'test-generation');
      // No close, forced exit, or additional referenced timer: drain naturally.
    `);
    const child = spawnSync(process.execPath, ['--import', 'tsx', scriptPath], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    const db = new Database(databasePath, { readonly: true });
    try { expect(db.prepare('SELECT COUNT(*) AS count FROM sona_patterns').get()).toEqual({ count: 1 }); }
    finally { db.close(); }
  });
  it('tries healthy rows during close even if an earlier row still fails', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 10 });
    const blocked = createPattern();
    const healthy = createPattern();
    const db = getUnifiedPersistence().getDatabase();
    db.exec(`CREATE TRIGGER reject_sona_save BEFORE INSERT ON sona_patterns
      WHEN NEW.id = '${blocked.id}' BEGIN SELECT RAISE(ABORT, 'permanent SONA write rejection'); END`);
    await expect(engine.close()).rejects.toThrow('permanent SONA write rejection');
    expect((await engine.getAllPersistedPatterns()).map(p => p.id)).toEqual([healthy.id]);
    db.exec('DROP TRIGGER reject_sona_save');
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(new Set(engine.getAllPatterns().map(p => p.id))).toEqual(new Set([blocked.id, healthy.id]));
  });

});
