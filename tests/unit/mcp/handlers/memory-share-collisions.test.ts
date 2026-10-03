import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryBackend } from '../../../../src/kernel/memory-backend.js';
import { HybridMemoryBackend } from '../../../../src/kernel/hybrid-backend.js';
import { resetUnifiedMemory } from '../../../../src/kernel/unified-memory.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import { handleMemoryShare, setStandaloneMemoryBackend } from '../../../../src/mcp/handlers/memory-handlers.js';

// Keep this a real backend regression without fleet startup or model/network access.
vi.mock('../../../../src/mcp/handlers/core-handlers.js', () => ({
  isFleetInitialized: () => false,
  getFleetState: () => { throw new Error('No fleet should be started'); },
}));
vi.mock('../../../../src/learning/real-embeddings.js', () => ({
  computeRealEmbedding: async () => [1, 0, 0],
}));

describe.each(['memory', 'sqlite'] as const)('knowledge sharing collision resistance (%s)', (kind) => {
  let memory: MemoryBackend;
  let directory: string;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'aqe-share-collision-'));
    memory = kind === 'memory' ? new InMemoryBackend()
      : new HybridMemoryBackend({ sqlite: { path: join(directory, 'memory.db') } });
    await memory.initialize();
    setStandaloneMemoryBackend(memory);
    vi.spyOn(Date, 'now').mockReturnValue(1790990000000);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    setStandaloneMemoryBackend(null);
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(directory, { recursive: true, force: true });
  });
  async function share(id: number, domain = 'review') {
    const result = await handleMemoryShare({ sourceAgentId: 'reviewer', targetAgentIds: ['coder'],
      knowledgeDomain: domain, knowledgeContent: { finding: id } });
    expect(result.success).toBe(true);
  }
  async function findings() {
    const keys = await memory.search('shared:*', 100, { namespace: 'agent-knowledge' });
    const values = await Promise.all(keys.map((key) => memory.get<{ content: { finding: number } }>(
      kind === 'memory' ? key.slice('agent-knowledge:'.length) : key, { namespace: 'agent-knowledge' })));
    return values.map((value) => value!.content.finding).sort((a, b) => a - b);
  }
  it('retains two different findings admitted in the same millisecond', async () => {
    await share(1);
    await share(2);
    expect(await findings()).toEqual([1, 2]);
  });
  it('retains every concurrently shared finding', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, id) => share(id)));
    expect(await findings()).toEqual([0, 1, 2, 3, 4]);
  });
  it('continues to separate knowledge domains', async () => {
    await share(1, 'review');
    await share(2, 'tests');
    expect(await findings()).toEqual([1, 2]);
  });
});
