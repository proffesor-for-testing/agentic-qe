import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryBackend } from '../../../src/kernel/memory-backend.js';
import { HybridMemoryBackend } from '../../../src/kernel/hybrid-backend.js';
import { resetUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import type { MemoryBackend } from '../../../src/kernel/interfaces.js';

describe.each(['memory', 'sqlite'] as const)('memory key glob parity (%s)', (kind) => {
  let memory: MemoryBackend;
  let directory: string;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'aqe-memory-glob-'));
    memory = kind === 'memory' ? new InMemoryBackend()
      : new HybridMemoryBackend({ sqlite: { path: join(directory, 'memory.db') } });
    await memory.initialize();
    for (const key of ['config:rate_1', 'config:rateX1', 'config:100%', 'config:1000',
      'config:itema', 'config:itemb', 'config:itemabc', 'prefix:config:itema',
      'config:a.b', 'config:aXb', 'config:rate!1', 'config:rate11', String.raw`config:a\b`]) {
      await memory.set(key, key);
    }
  });
  afterEach(async () => {
    await memory.dispose();
    resetUnifiedMemory();
    rmSync(directory, { recursive: true, force: true });
  });
  it('treats underscore as a literal key character', async () => {
    expect(await memory.search('config:rate_1')).toEqual(['config:rate_1']);
  });
  it('treats percent as a literal key character', async () => {
    expect(await memory.search('config:100%')).toEqual(['config:100%']);
  });
  it('supports question mark as a one-character glob wildcard', async () => {
    expect((await memory.search('config:item?')).sort()).toEqual(['config:itema', 'config:itemb']);
  });
  it('matches the whole key rather than a contained substring', async () => {
    expect(await memory.search('config:itema')).toEqual(['config:itema']);
  });
  it('preserves a literal SQL escape character', async () => {
    expect(await memory.search('config:rate!1')).toEqual(['config:rate!1']);
  });
  it('preserves star glob matching', async () => {
    expect((await memory.search('config:item*')).sort()).toEqual(['config:itema', 'config:itemabc', 'config:itemb']);
  });
  it('preserves literal regex punctuation and backslash', async () => {
    expect(await memory.search('config:a.b')).toEqual(['config:a.b']);
    expect(await memory.search(String.raw`config:a\b`)).toEqual([String.raw`config:a\b`]);
  });
});
