import { afterEach, beforeEach, expect, it } from 'vitest';
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
  directory = mkdtempSync(join(tmpdir(), 'aqe-sona-action-'));
  await initializeUnifiedPersistence({ dbPath: join(directory, 'memory.db') });
});
afterEach(async () => {
  await engine?.close();
  engine = undefined;
  resetUnifiedPersistence();
  rmSync(directory, { recursive: true, force: true });
});

it.each([0, 60000])('preserves observed feedback counts through sync, stores and restart (%i ms)', async (autoSaveInterval) => {
  engine = await createPersistentSONAEngine({ domain, autoSaveInterval });
  const pattern = engine.createPattern(
    { id: 'state', features: new Array(384).fill(0.25) },
    { type: 'test-action', value: 'run-tests' },
    { reward: 0.8, success: true, quality: 0.9 }, domain, domain,
  );
  engine.updatePattern(pattern.id, true, 0.9);
  engine.updatePattern(pattern.id, true, 0.8);
  engine.updatePattern(pattern.id, false, 0.2);
  const updated = engine.getPattern(pattern.id)!;
  const persisted = (await engine.getPersistedPatternsByDomain(domain))[0];
  expect(persisted?.confidence).toBeCloseTo(updated.confidence);
  expect(persisted?.usageCount).toBe(updated.usageCount);
  expect(await engine.getPersistedStats()).toMatchObject({ totalSuccesses: 2, totalFailures: 1 });
  await engine.sync();
  expect(await engine.getPersistedStats()).toMatchObject({ totalSuccesses: 2, totalFailures: 1 });
  engine.storePattern(engine.getPattern(pattern.id)!);
  await engine.close();
  engine = await createPersistentSONAEngine({ domain });
  expect(await engine.getPersistedStats()).toMatchObject({ totalSuccesses: 2, totalFailures: 1 });
  expect(engine.getPattern(pattern.id)?.confidence).toBeCloseTo(updated.confidence);
  expect(engine.getPattern(pattern.id)?.usageCount).toBe(updated.usageCount);
});
