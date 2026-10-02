import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersistentSONAEngine, type PersistentSONAEngine } from '../../../../src/integrations/ruvector/sona-persistence.js';
import { initializeUnifiedPersistence, resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence.js';

let directory: string;
let engine: PersistentSONAEngine | undefined;
const domain = 'test-generation' as const;

beforeEach(async () => {
  resetUnifiedPersistence();
  directory = mkdtempSync(join(tmpdir(), 'aqe-sona-deletion-'));
  await initializeUnifiedPersistence({ dbPath: join(directory, 'memory.db') });
});
afterEach(async () => {
  await engine?.close();
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

describe('SONA deletion coherence', () => {
  it('removes a deleted pattern from recall and prevents sync from resurrecting it', async () => {
    engine = await createPersistentSONAEngine({ domain });
    const pattern = createPattern();
    expect(engine.deletePattern(pattern.id)).toBe(true);
    expect(engine.getPattern(pattern.id)).toBeUndefined();
    expect(engine.recallPattern({ id: 'state', features: new Array(384).fill(0.25) }, domain, domain)).toBeNull();
    expect(engine.deletePattern('nonexistent')).toBe(false);
    expect(engine.updatePattern(pattern.id, true, 1)).toBe(false);
    await engine.sync();
    expect(await engine.getAllPersistedPatterns()).toEqual([]);
  });
  it('deletes a queued pattern before its first durable write', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 60000 });
    const pattern = createPattern();
    expect(engine.deletePattern(pattern.id)).toBe(true);
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getAllPatterns()).toEqual([]);
  });
  it('does not replay queued domain patterns after a domain clear', async () => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 60000 });
    createPattern();
    engine.clearDomainPatterns();
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getAllPatterns()).toEqual([]);
  });
  it.each([0, 60000])('retains foreign-domain live and durable patterns during a domain clear (%i ms)', async (autoSaveInterval) => {
    engine = await createPersistentSONAEngine({ domain, autoSaveInterval });
    createPattern();
    const foreign = engine.createPattern(
      { id: 'foreign-state', features: new Array(384).fill(0.75) },
      { type: 'test-action', value: 'inspect-coverage' },
      { reward: 0.8, success: true, quality: 0.9 }, 'coverage-optimization', 'coverage-analysis',
    );
    engine.clearDomainPatterns();
    expect(engine.getAllPatterns().map(p => p.id)).toEqual([foreign.id]);
    await engine.close();
    engine = await createPersistentSONAEngine({ domain: 'coverage-analysis' });
    expect(engine.getAllPatterns().map(p => p.id)).toEqual([foreign.id]);
    expect(await engine.getPersistedPatternsByDomain(domain)).toEqual([]);
  });

});
