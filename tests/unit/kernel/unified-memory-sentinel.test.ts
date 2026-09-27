import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryBackend, getRecommendedConfig } from '../../../src/kernel/memory-factory.js';
import { getUnifiedMemory, resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';

let root: string;
afterEach(() => {
  resetUnifiedMemory();
  vi.unstubAllEnvs();
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('explicit SQLite in-memory database', () => {
  it('keeps the shipped CI configuration ephemeral without requiring an environment override', async () => {
    root = mkdtempSync(join(tmpdir(), 'aqe-memory-sentinel-'));
    vi.stubEnv('AQE_PROJECT_ROOT', root);
    vi.stubEnv('AQE_MEMORY_BACKEND', 'sqlite');
    resetUnifiedMemory();
    const first = await createMemoryBackend(getRecommendedConfig('ci'));
    await first.backend.set('ci-secret', 'temporary');
    expect(getUnifiedMemory().getDbPath()).toBe(':memory:');
    expect(existsSync(join(root, ':memory:'))).toBe(false);
    await first.backend.dispose();
    resetUnifiedMemory();
    const second = await createMemoryBackend(getRecommendedConfig('ci'));
    try { expect(await second.backend.get('ci-secret')).toBeUndefined(); }
    finally { await second.backend.dispose(); }
  });
});
