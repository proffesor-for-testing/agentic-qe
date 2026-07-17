/**
 * PatternStore RVF recovery from an unusable store (issue #563).
 *
 * `createPatternStore()` has its own open-or-create ladder, used when the
 * shared adapter is unavailable. An export killed mid-write leaves a store that
 * can neither be opened (0x0106 ManifestNotFound) nor created over (0x0303
 * FsyncFailed); without recovery this ladder throws into a catch that logs
 * "RVF store unavailable, using in-memory HNSW" and silently degrades — every
 * run, forever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';

import { isRvfNativeAvailable } from '../../../src/integrations/ruvector/rvf-native-adapter.js';

// Force the fallback ladder: the factory prefers the shared adapter singleton
// and only reaches its own ladder when that yields nothing. This mock is
// load-bearing — without it the factory takes the shared-adapter path, which
// has its own separate recovery and would leave this ladder untested.
vi.mock('../../../src/integrations/ruvector/shared-rvf-adapter.js', () => ({
  getSharedRvfAdapter: () => null,
  __setSharedRvfAdapterForTests: () => {},
}));

const describeNative = isRvfNativeAvailable() ? describe : describe.skip;

const dirs: string[] = [];
const CACHE_ROOT = join(process.cwd(), 'node_modules', '.cache');
let originalRoot: string | undefined;

beforeEach(() => {
  originalRoot = process.env.AQE_PROJECT_ROOT;
});

afterEach(() => {
  if (originalRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
  else process.env.AQE_PROJECT_ROOT = originalRoot;
  for (const d of dirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function projectWithUnusableStore(): { root: string; rvfPath: string } {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const root = mkdtempSync(join(CACHE_ROOT, 'ps-563-'));
  dirs.push(root);
  mkdirSync(join(root, '.agentic-qe'), { recursive: true });
  const rvfPath = join(root, '.agentic-qe', 'patterns.rvf');
  // A store created but never completed — the #563 artifact.
  writeFileSync(rvfPath, Buffer.concat([Buffer.from('SFVR'), Buffer.alloc(158)]));
  return { root, rvfPath };
}

describeNative('createPatternStore RVF recovery (#563)', () => {
  it('quarantines an unusable patterns.rvf and rebuilds instead of degrading', async () => {
    const { root, rvfPath } = projectWithUnusableStore();
    process.env.AQE_PROJECT_ROOT = root;

    const { createPatternStore } = await import('../../../src/learning/pattern-store.js');
    const memory = { store: async () => {}, retrieve: async () => null } as never;

    const store = createPatternStore(memory);
    // The ladder is lazy — it only runs on initialize(), which is where the
    // open/create/reopen against the unusable file actually happens.
    await store.initialize();

    // The unusable bytes are preserved, not deleted...
    expect(existsSync(`${rvfPath}.corrupt-${process.pid}`)).toBe(true);
    // ...a fresh store took its place...
    expect(existsSync(rvfPath)).toBe(true);
    // ...and vector search is live. Pre-fix, the ladder threw and left
    // nativeAvailable false with vector search disabled for the process.
    const stats = (await store.getStats()) as unknown as {
      hnswStats: { nativeAvailable: boolean; rvfInitError?: string };
    };
    expect(stats.hnswStats.nativeAvailable).toBe(true);
    expect(stats.hnswStats.rvfInitError).toBeUndefined();
  });
});
