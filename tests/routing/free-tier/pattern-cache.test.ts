/**
 * Tests for the #6 test-gen pattern cache: the pure cache logic, and the
 * executor integration — including the safety property that a cache hit is
 * always re-verified by the objective oracle (a wrong hit falls through to
 * generation, never bypassing the gate). The free-tier network call is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FreeTierChatResult } from '../../../src/routing/free-tier/provider.js';

const chatMock = vi.fn<(...args: unknown[]) => Promise<FreeTierChatResult>>();
vi.mock('../../../src/routing/free-tier/provider.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/routing/free-tier/provider.js')>();
  return { ...actual, freeTierChat: (...args: unknown[]) => chatMock(...args) };
});

import {
  FreeTierEscalatingExecutor,
  defaultFreeTierLadder,
  type QeTaskRequest,
} from '../../../src/routing/free-tier/index.js';
import {
  TestGenPatternCache,
  normalizeCode,
  cosineSimilarity,
  type CodeEmbedder,
} from '../../../src/routing/free-tier/pattern-cache.js';

const localReply = (content: string): FreeTierChatResult => ({ ok: content.length > 0, content, latencyMs: 5 });
const task = (over: Partial<QeTaskRequest> = {}): QeTaskRequest => ({
  agentId: 'qe:repoA',
  messages: [{ role: 'user', content: 'write a test' }],
  verify: (o) => o.includes('PASS'),
  ...over,
});

beforeEach(() => chatMock.mockReset());

describe('normalizeCode', () => {
  it('strips comments and collapses whitespace to a stable key', () => {
    const a = normalizeCode('export function f(x) {\n  // doc\n  return x + 1;\n}');
    const b = normalizeCode('export function f(x) {   return x + 1; } /* block */');
    expect(a).toBe(b);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal, 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});

describe('TestGenPatternCache (pure)', () => {
  it('returns a cached test on an exact (normalized) match, undefined on a miss', async () => {
    const cache = new TestGenPatternCache();
    await cache.put('export const g = 1', 'TEST_G');
    expect(await cache.lookup('export const   g = 1   // x')).toBe('TEST_G');
    expect(await cache.lookup('export const h = 2')).toBeUndefined();
  });

  it('uses the similarity tier when an embedder is provided', async () => {
    const vecs: Record<string, number[]> = { a: [1, 0, 0], b: [0, 1, 0] };
    const embedder: CodeEmbedder = { embed: async (t) => (t.includes('AAA') ? vecs.a : vecs.b) };
    const cache = new TestGenPatternCache({ embedder, similarityThreshold: 0.97 });
    await cache.put('fn AAA() {}', 'TEST_A'); // embedding [1,0,0]
    // Different source text, same embedding vector → similarity hit.
    expect(await cache.lookup('function AAA_variant() {}')).toBe('TEST_A');
    // Embeds to [0,1,0] → orthogonal → no hit.
    expect(await cache.lookup('fn BBB() {}')).toBeUndefined();
  });

  it('evicts the oldest entry past maxEntries (LRU)', async () => {
    const cache = new TestGenPatternCache({ maxEntries: 2 });
    await cache.put('one', 'T1');
    await cache.put('two', 'T2');
    await cache.put('three', 'T3'); // evicts 'one'
    expect(await cache.lookup('one')).toBeUndefined();
    expect(await cache.lookup('three')).toBe('T3');
    expect(cache.stats.size).toBe(2);
  });
});

describe('FreeTierEscalatingExecutor — pattern cache integration (#6)', () => {
  it('short-circuits generation on a verified cache hit', async () => {
    const cache = new TestGenPatternCache();
    await cache.put('export function f(){return 1}', 'PASS cached test');
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3-coder:30b'), patternCache: cache });

    const r = await exec.execute(task({ cacheText: 'export function f(){return 1}' }));

    expect(r.ok).toBe(true);
    expect(r.tierUsed).toBe('cache');
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('re-verifies a cache hit and FALLS THROUGH to generation when it fails the oracle', async () => {
    chatMock.mockResolvedValue(localReply('PASS from local'));
    const cache = new TestGenPatternCache();
    await cache.put('code-x', 'this cached output is WRONG'); // no 'PASS' → fails verify
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3-coder:30b'), patternCache: cache });

    const r = await exec.execute(task({ cacheText: 'code-x' }));

    expect(r.tierUsed).toBe('local'); // generation ran; cache did NOT bypass the oracle
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(r.attempts[0]).toMatchObject({ tier: 'cache', passed: false });
  });

  it('stores a verified generation and serves the next identical task from cache', async () => {
    chatMock.mockResolvedValue(localReply('PASS generated'));
    const cache = new TestGenPatternCache();
    const exec = new FreeTierEscalatingExecutor({ ladder: defaultFreeTierLadder('qwen3-coder:30b'), patternCache: cache });

    const r1 = await exec.execute(task({ cacheText: 'export const dup = 1' }));
    expect(r1.tierUsed).toBe('local');
    expect(chatMock).toHaveBeenCalledTimes(1);

    const r2 = await exec.execute(task({ cacheText: 'export const dup = 1' }));
    expect(r2.tierUsed).toBe('cache');
    expect(chatMock).toHaveBeenCalledTimes(1); // generation NOT re-run
  });
});
