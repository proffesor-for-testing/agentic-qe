import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersistentSONAEngine, type PersistentSONAEngine } from '../../../../src/integrations/ruvector/sona-persistence.js';
import { getUnifiedPersistence, initializeUnifiedPersistence, resetUnifiedPersistence } from '../../../../src/kernel/unified-persistence.js';

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

describe('SONA action round trips', () => {
  it.each(['123', 'false', 'null', '{"command":"run"}', '"quoted"', 'run-tests', 123, { command: 'run' }])(
    'preserves action value and type for %j after reopening', async (value) => {
      engine = await createPersistentSONAEngine({ domain });
      const pattern = engine.createPattern(
        { id: 'state', features: new Array(384).fill(0.25) },
        { type: 'test-action', value },
        { reward: 0.8, success: true, quality: 0.9 }, domain, domain,
      );
      await engine.close();
      engine = await createPersistentSONAEngine({ domain });
      expect(engine.getPattern(pattern.id)?.action.value).toStrictEqual(value);
    },
  );
  it('still reads legacy raw command strings without rewriting them', async () => {
    engine = await createPersistentSONAEngine({ domain });
    const pattern = engine.createPattern(
      { id: 'legacy', features: new Array(384).fill(0.25) },
      { type: 'test-action', value: 'run-tests' },
      { reward: 0.8, success: true, quality: 0.9 }, domain, domain,
    );
    getUnifiedPersistence().getDatabase().prepare('UPDATE sona_patterns SET action_value = ? WHERE id = ?')
      .run('legacy-command', pattern.id);
    await engine.close();
    engine = await createPersistentSONAEngine({ domain });
    expect(engine.getPattern(pattern.id)?.action.value).toBe('legacy-command');
  });

});
