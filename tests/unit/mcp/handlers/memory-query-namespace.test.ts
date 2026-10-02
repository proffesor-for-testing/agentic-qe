import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend.js';
import { HybridMemoryBackend } from '../../../../src/kernel/hybrid-backend.js';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import { handleMemoryQuery, setStandaloneMemoryBackend } from '../../../../src/mcp/handlers/memory-handlers.js';

// Keep this a real backend regression without fleet startup or model/network access.
vi.mock('../../../../src/mcp/handlers/core-handlers.js', () => ({
  isFleetInitialized: () => false,
  getFleetState: () => { throw new Error('No fleet should be started'); },
}));
vi.mock('../../../../src/learning/real-embeddings.js', () => ({
  computeRealEmbedding: async () => [1, 0, 0],
}));

describe.each(['memory', 'sqlite'] as const)('semantic namespace isolation (%s)', (kind) => {
  let memory: MemoryBackend;
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'aqe-query-namespace-'));
    memory = kind === 'memory'
      ? new InMemoryBackend()
      : new HybridMemoryBackend({ sqlite: { path: join(directory, 'memory.db') } });
    await memory.initialize();
    setStandaloneMemoryBackend(memory);
    for (const namespace of ['default', 'private', 'project']) {
      await memory.set(`${namespace}:auth`, `${namespace} value`);
      await memory.storeVector(`${namespace}:auth`, [1, 0, 0], { namespace, key: 'auth' });
    }
  });

  afterEach(async () => {
    setStandaloneMemoryBackend(null);
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([undefined, 'default'])('does not return other namespaces when namespace is %s', async (namespace) => {
    const result = await handleMemoryQuery({ pattern: 'authentication best practices', semantic: true, namespace });
    expect(result.success).toBe(true);
    expect(result.data?.searchType).toBe('semantic');
    expect(result.data?.entries).toEqual([{ key: 'auth', namespace: 'default', score: 1 }]);
  });

  it('continues to honor an explicitly selected custom namespace', async () => {
    const result = await handleMemoryQuery({ pattern: 'authentication best practices', semantic: true, namespace: 'project' });
    expect(result.data?.entries).toEqual([{ key: 'auth', namespace: 'project', score: 1 }]);
  });
});
