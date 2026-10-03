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

describe.each(['memory', 'sqlite'] as const)('memory query pagination (%s)', (kind) => {
  let memory: MemoryBackend;
  let directory: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'aqe-query-pagination-'));
    memory = kind === 'memory'
      ? new InMemoryBackend()
      : new HybridMemoryBackend({ sqlite: { path: join(directory, 'memory.db') } });
    await memory.initialize();
    setStandaloneMemoryBackend(memory);
    for (const key of ['one', 'two', 'three']) {
      await memory.set(`default:${key}`, key);
      await memory.storeVector(`default:${key}`, [1, 0, 0]);
    }
  });

  afterEach(async () => {
    setStandaloneMemoryBackend(null);
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(directory, { recursive: true, force: true });
  });

  it.each([false, true])('reports another page for a truncated query (semantic=%s)', async (semantic) => {
    const result = await handleMemoryQuery({ pattern: semantic ? 'some knowledge' : '*', semantic, limit: 2 });
    expect(result.success).toBe(true);
    expect(result.data?.entries).toHaveLength(2);
    expect(result.data?.hasMore).toBe(true);
  });

  it.each([false, true])('reports the final page accurately (semantic=%s)', async (semantic) => {
    const result = await handleMemoryQuery({ pattern: semantic ? 'some knowledge' : '*', semantic, limit: 2, offset: 2 });
    expect(result.data?.entries).toHaveLength(1);
    expect(result.data?.hasMore).toBe(false);
  });

  it.each([false, true])('honors a zero-sized page (semantic=%s)', async (semantic) => {
    const result = await handleMemoryQuery({ pattern: semantic ? 'some knowledge' : '*', semantic, limit: 0 });
    expect(result.data?.entries).toEqual([]);
    expect(result.data?.hasMore).toBe(true);
  });

  it.each([{ limit: -1 }, { offset: -1 }, { limit: 1.5 }, { offset: Infinity }])('rejects invalid pagination %j before querying', async (pagination) => {
    const search = vi.spyOn(memory, 'search');
    const vectorSearch = vi.spyOn(memory, 'vectorSearch');
    const result = await handleMemoryQuery({ pattern: '*', ...pagination });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/non-negative safe integer/);
    expect(search).not.toHaveBeenCalled();
    expect(vectorSearch).not.toHaveBeenCalled();
  });
});
