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

it('reinitializes the same closed engine and reloads durable patterns on every cycle', async () => {
  engine = await createPersistentSONAEngine({ domain, autoSaveInterval: 60000 });
  const pattern = engine.createPattern(
    { id: 'state', features: new Array(384).fill(0.25) },
    { type: 'test-action', value: 'run-tests' },
    { reward: 0.8, success: true, quality: 0.9 }, domain, domain,
  );
  for (let cycle = 0; cycle < 2; cycle++) {
    await engine.close();
    expect(engine.isInitialized()).toBe(false);
    await Promise.all([engine.initialize(), engine.initialize()]);
    expect(engine.isInitialized()).toBe(true);
    expect(engine.getPattern(pattern.id)?.action.value).toBe('run-tests');
    expect(await engine.getAllPersistedPatterns()).toHaveLength(1);
  }
});
