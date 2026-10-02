import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});
