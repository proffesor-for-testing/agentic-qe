/**
 * Issue #852: in a freshly initialised project with no embedder configured,
 * the RVF index binders (RvfPatternStore -> patterns.rvf, RvfDualWriter ->
 * brain.rvf) must not log an ERROR claiming vector search is broken. They must
 * stay closed (the #633 provenance guard), create no index file, and log one
 * warn-level notice explaining how to enable vector search.
 *
 * The same file pins the other half of the contract: an index that IS
 * genuinely mismatched or unverified is still refused, loudly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';

const nativeMocks = vi.hoisted(() => ({
  openRvfStore: vi.fn(),
  createRvfStore: vi.fn(),
}));

vi.mock('../../../src/integrations/ruvector/rvf-native-adapter.js', () => ({
  isRvfNativeAvailable: () => true,
  openRvfStore: nativeMocks.openRvfStore,
  createRvfStore: nativeMocks.createRvfStore,
}));

import { RvfPatternStore } from '../../../src/learning/rvf-pattern-store.js';
import { RvfDualWriter } from '../../../src/integrations/ruvector/rvf-dual-writer.js';
import { createSQLitePatternStore } from '../../../src/learning/sqlite-persistence.js';
import { getActiveEmbeddingSpaceIdentity } from '../../../src/learning/real-embeddings.js';
import {
  EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE,
  EMBEDDING_RUNTIME_UNAVAILABLE_CAUSE,
  __resetEmbeddingRuntimeNoticeForTests,
  embeddingSpaceManifestPath,
} from '../../../src/learning/embedding-space.js';
import type { RvfNativeAdapter } from '../../../src/integrations/ruvector/rvf-native-adapter.js';

const ACTIVE_SPACE = 'active-runtime-space';
const OTHER_SPACE = 'some-other-runtime-space';

function mockNativeAdapter(totalVectors = 0): RvfNativeAdapter {
  return {
    status: vi.fn(() => ({
      totalVectors,
      totalSegments: 1,
      fileSizeBytes: 0,
      epoch: 1,
      witnessValid: true,
      witnessEntries: 0,
    })),
    close: vi.fn(),
    ingest: vi.fn(() => ({ accepted: 0, rejected: 0 })),
    search: vi.fn(() => []),
    delete: vi.fn(() => 0),
    dimension: vi.fn(() => 384),
  } as unknown as RvfNativeAdapter;
}

function rvfErrorLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('RVF initialization failed'));
}

describe('#852 fresh project without an embedder', () => {
  let tmpDir: string;
  let savedEndpoint: string | undefined;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-852-'));
    savedEndpoint = process.env.AQE_EMBEDDER_ENDPOINT;
    delete process.env.AQE_EMBEDDER_ENDPOINT;
    __resetEmbeddingRuntimeNoticeForTests();
    nativeMocks.openRvfStore.mockReset();
    nativeMocks.createRvfStore.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    if (savedEndpoint === undefined) delete process.env.AQE_EMBEDDER_ENDPOINT;
    else process.env.AQE_EMBEDDER_ENDPOINT = savedEndpoint;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function newPatternStore(
    createAdapter: (p: string, d: number) => RvfNativeAdapter,
    rvfPath: string,
    embeddingSpaceId?: string,
  ): Promise<RvfPatternStore> {
    const store = new RvfPatternStore(createAdapter, {
      rvfPath,
      base: undefined as any,
      ...(embeddingSpaceId ? { embeddingSpaceId } : {}),
    });
    const sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
    await sqlite.initialize();
    store.setSqliteStore(sqlite);
    await store.initialize();
    return store;
  }

  it('precondition: no embedding runtime is active in this process', () => {
    expect(getActiveEmbeddingSpaceIdentity()).toBeNull();
  });

  it('RvfPatternStore stays closed without an ERROR and creates no patterns.rvf', async () => {
    const rvfPath = path.join(tmpDir, 'patterns.rvf');
    const createAdapter = vi.fn(() => mockNativeAdapter());

    const store = await newPatternStore(createAdapter, rvfPath);

    expect(createAdapter).not.toHaveBeenCalled();
    expect(store.getAdapter()).toBeNull();
    expect(fs.existsSync(rvfPath)).toBe(false);
    expect(fs.existsSync(embeddingSpaceManifestPath(rvfPath))).toBe(false);
    expect(rvfErrorLines(errorSpy)).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE);
    const stats = await store.getStats();
    expect(stats.hnswStats.nativeAvailable).toBe(false);
    await store.dispose();
  });

  it('RvfDualWriter leaves brain.rvf unopened and uncreated', async () => {
    const rvfPath = path.join(tmpDir, 'brain.rvf');
    const writer = new RvfDualWriter(new Database(':memory:'), { rvfPath, mode: 'dual-write', dimensions: 384 });

    await writer.initialize();

    expect(nativeMocks.openRvfStore).not.toHaveBeenCalled();
    expect(nativeMocks.createRvfStore).not.toHaveBeenCalled();
    expect(fs.existsSync(rvfPath)).toBe(false);
    expect(writer.status().rvf).toBeNull();
  });

  it('logs exactly one notice when both binders find no embedder', async () => {
    await newPatternStore(vi.fn(() => mockNativeAdapter()), path.join(tmpDir, 'patterns.rvf'));
    await new RvfDualWriter(new Database(':memory:'), {
      rvfPath: path.join(tmpDir, 'brain.rvf'), mode: 'dual-write', dimensions: 384,
    }).initialize();

    const notices = warnSpy.mock.calls.filter((c) => c[0] === EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE);
    expect(notices).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('Dual-writer disabled'))).toBe(false);
  });

  it('words the notice and stored cause as a bind-time state, never as missing config or data loss', () => {
    // Reached also by a user whose AQE_EMBEDDER_ENDPOINT went missing (index
    // has vectors) or whose in-process embedder loads lazily (review of #979).
    for (const text of [EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE, EMBEDDING_RUNTIME_UNAVAILABLE_CAUSE]) {
      expect(text).toMatch(/no embedding runtime was available when the (ANN|RVF) index(es)? (was|were) opened/);
      expect(text).not.toMatch(/is configured|DISABLED|ERROR/);
      expect(text).toMatch(/existing vectors .*kept/);
    }
    // MCP's stdio entry forwards only stderr lines containing WARN/ERROR/[MCP].
    expect(EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE).toContain('WARN');
    expect(EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE).toContain('AQE_EMBEDDER_ENDPOINT');
    expect(EMBEDDING_RUNTIME_UNAVAILABLE_NOTICE).toContain('@huggingface/transformers');
  });

  it('leaves an existing populated index untouched when the embedder is missing', async () => {
    const rvfPath = path.join(tmpDir, 'patterns.rvf');
    fs.writeFileSync(rvfPath, Buffer.from('existing-index-bytes'));
    fs.writeFileSync(embeddingSpaceManifestPath(rvfPath), JSON.stringify({ version: 1, spaceId: ACTIVE_SPACE }));
    const before = fs.readFileSync(rvfPath);
    const createAdapter = vi.fn(() => mockNativeAdapter(20));

    const store = await newPatternStore(createAdapter, rvfPath);

    expect(createAdapter).not.toHaveBeenCalled();
    expect(fs.readFileSync(rvfPath).equals(before)).toBe(true);
    expect(JSON.parse(fs.readFileSync(embeddingSpaceManifestPath(rvfPath), 'utf8')).spaceId).toBe(ACTIVE_SPACE);
    expect(rvfErrorLines(errorSpy)).toEqual([]);
    await store.dispose();
  });

  it('keeps embedding writes fail-closed while the index is unbound', async () => {
    const store = await newPatternStore(vi.fn(() => mockNativeAdapter()), path.join(tmpDir, 'patterns.rvf'));
    const stats = await store.getStats();
    expect(stats.hnswStats.rvfInitError).toBe(EMBEDDING_RUNTIME_UNAVAILABLE_CAUSE);
    expect(stats.hnswStats.rvfInitError).toMatch(/VECTOR_SPACE_UNVERIFIED/);

    const result = await store.store({
      id: 'p-852', patternType: 'test-template', qeDomain: 'test-generation', domain: 'test-generation',
      name: 'Fresh project pattern', description: 'pattern with an unverifiable embedding',
      confidence: 0.8, usageCount: 1, successRate: 1, qualityScore: 0.7,
      context: { tags: ['unit'] }, template: { type: 'code', content: 'test()', variables: [] },
      embedding: Array.from({ length: 384 }, () => 0.05), tier: 'short-term',
      createdAt: new Date(), lastUsedAt: new Date(), successfulUses: 1,
      reusable: false, reuseCount: 0, averageTokenSavings: 0,
    } as any);
    expect(result.success).toBe(false);
    await store.dispose();
  });
});

describe('#852 provenance guard still refuses genuinely bad indexes', () => {
  let tmpDir: string;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-852-guard-'));
    __resetEmbeddingRuntimeNoticeForTests();
    nativeMocks.openRvfStore.mockReset();
    nativeMocks.createRvfStore.mockReset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeManifest(rvfPath: string, spaceId: string): void {
    fs.writeFileSync(embeddingSpaceManifestPath(rvfPath), JSON.stringify({ version: 1, spaceId }));
  }

  async function initStore(rvfPath: string, adapter: RvfNativeAdapter): Promise<RvfPatternStore> {
    const store = new RvfPatternStore(() => adapter, {
      rvfPath, base: undefined as any, embeddingSpaceId: ACTIVE_SPACE,
    });
    const sqlite = createSQLitePatternStore({ useUnified: false, dbPath: path.join(tmpDir, 'patterns.db') });
    await sqlite.initialize();
    store.setSqliteStore(sqlite);
    await store.initialize();
    return store;
  }

  it('refuses an index bound to a different vector space (MISMATCH, ERROR)', async () => {
    const rvfPath = path.join(tmpDir, 'patterns.rvf');
    writeManifest(rvfPath, OTHER_SPACE);

    const store = await initStore(rvfPath, mockNativeAdapter(5));

    expect(store.getAdapter()).toBeNull();
    expect(rvfErrorLines(errorSpy).join('\n')).toMatch(/VECTOR_SPACE_MISMATCH/);
    await store.dispose();
  });

  it('refuses a populated index that has no space manifest (UNVERIFIED, ERROR)', async () => {
    const rvfPath = path.join(tmpDir, 'patterns.rvf');

    const store = await initStore(rvfPath, mockNativeAdapter(3));

    expect(store.getAdapter()).toBeNull();
    expect(rvfErrorLines(errorSpy).join('\n')).toMatch(/VECTOR_SPACE_UNVERIFIED: populated ANN index/);
    expect(fs.existsSync(embeddingSpaceManifestPath(rvfPath))).toBe(false);
    await store.dispose();
  });

  it('binds an empty index once a runtime provides provenance', async () => {
    const rvfPath = path.join(tmpDir, 'patterns.rvf');
    const adapter = mockNativeAdapter(0);

    const store = await initStore(rvfPath, adapter);

    expect(store.getAdapter()).toBe(adapter);
    const manifest = JSON.parse(fs.readFileSync(embeddingSpaceManifestPath(rvfPath), 'utf8'));
    expect(manifest.spaceId).toBe(ACTIVE_SPACE);
    expect(errorSpy).not.toHaveBeenCalled();
    await store.dispose();
  });

  it('dual writer refuses brain.rvf bound to a different vector space', async () => {
    const rvfPath = path.join(tmpDir, 'brain.rvf');
    writeManifest(rvfPath, OTHER_SPACE);
    nativeMocks.openRvfStore.mockReturnValue(mockNativeAdapter(2));
    const writer = new RvfDualWriter(new Database(':memory:'), {
      rvfPath, mode: 'dual-write', dimensions: 384, embeddingSpaceId: ACTIVE_SPACE,
    });

    await writer.initialize();

    expect(writer.status().rvf).toBeNull();
    const disabled = warnSpy.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('Dual-writer disabled'));
    expect(disabled.join('\n')).toMatch(/VECTOR_SPACE_MISMATCH/);
  });
});
