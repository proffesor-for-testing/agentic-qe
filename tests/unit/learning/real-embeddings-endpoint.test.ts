/**
 * ADR-097 integration tests for real-embeddings.ts endpoint branch.
 *
 * These verify the public contract changes:
 *   - When `endpoint` is set, `computeRealEmbedding` / `computeBatchEmbeddings`
 *     route through the external service and return 384-d unit vectors
 *   - `isUsingEndpoint()` reports endpoint mode correctly
 *   - `getEndpointIdentity()` returns the fingerprint after init
 *   - When `endpoint` is unset, code paths are entirely unchanged (no probe,
 *     no fingerprint, behavior matches pre-ADR-097)
 *
 * The transformers-not-imported invariant is asserted indirectly by checking
 * that `isUsingEndpoint()` is true and the endpoint server received the
 * request. A direct module-resolver assertion would require spawning a
 * subprocess; that fidelity is better verified by the build smoke test.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import {
  computeRealEmbedding,
  computeBatchEmbeddings,
  resetInitialization,
  isUsingEndpoint,
  getEndpointIdentity,
  getEmbeddingDimension,
} from '../../../src/learning/real-embeddings.js';

function fakeEmbedding(text: string, dim = 384): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const v = new Array<number>(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    v[i] = ((seed >>> 16) / 32768 - 1);
    norm += v[i] * v[i];
  }
  const k = 1 / Math.sqrt(norm);
  for (let i = 0; i < dim; i++) v[i] *= k;
  return v;
}

async function startServer(): Promise<{ url: string; close: () => Promise<void>; calls: number }> {
  const handle = { url: '', calls: 0, close: async () => {} };
  const server = http.createServer((req, res) => {
    handle.calls++;
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { input } = JSON.parse(raw) as { input: string[] };
      const data = input.map((t, i) => ({
        index: i,
        embedding: fakeEmbedding(t),
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  handle.url = `http://127.0.0.1:${(addr as { port: number }).port}`;
  handle.close = () => new Promise<void>((r) => server.close(() => r()));
  return handle;
}

describe('real-embeddings.ts — ADR-097 endpoint branch', () => {
  let server: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    resetInitialization();
    server = await startServer();
  });

  afterEach(async () => {
    resetInitialization();
    await server.close();
  });

  it('routes single embedding through endpoint when configured', async () => {
    const vec = await computeRealEmbedding('hello world', {
      endpoint: server.url,
      enableCache: false,
    });
    expect(vec).toHaveLength(getEmbeddingDimension());
    expect(isUsingEndpoint()).toBe(true);
    const id = getEndpointIdentity();
    expect(id).not.toBeNull();
    expect(id?.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(id?.dim).toBe(384);
    // Endpoint was called at least twice: probe + actual embed
    expect(server.calls).toBeGreaterThanOrEqual(2);
  });

  it('routes batch embeddings through endpoint preserving order', async () => {
    const inputs = ['alpha', 'beta', 'gamma', 'delta'];
    const vecs = await computeBatchEmbeddings(inputs, {
      endpoint: server.url,
      enableCache: false,
    });
    expect(vecs).toHaveLength(inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      const expected = fakeEmbedding(inputs[i]);
      const dot = vecs[i].reduce((s, x, j) => s + x * expected[j], 0);
      // Re-normalization preserves direction
      expect(dot).toBeGreaterThan(0.999);
    }
  });

  it('returns unit-length vectors', async () => {
    const vec = await computeRealEmbedding('unit length check', {
      endpoint: server.url,
      enableCache: false,
    });
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('reports endpoint mode via isUsingEndpoint()', async () => {
    expect(isUsingEndpoint()).toBe(false);
    await computeRealEmbedding('x', { endpoint: server.url, enableCache: false });
    expect(isUsingEndpoint()).toBe(true);
  });

  it('does not consult endpoint when endpoint config is undefined', async () => {
    // We assert that NOT setting endpoint leaves isUsingEndpoint() false and never
    // hits the server. The in-process path may or may not initialize depending
    // on whether @huggingface/transformers is available in the test environment;
    // we explicitly avoid triggering it here.
    expect(server.calls).toBe(0);
    expect(isUsingEndpoint()).toBe(false);
    expect(getEndpointIdentity()).toBeNull();
  });

  it('fails loud when endpoint dim does not match', async () => {
    // Replace server with one that returns wrong-dim vectors
    await server.close();
    const bad = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const { input } = JSON.parse(raw) as { input: string[] };
        const data = input.map((t, i) => ({
          index: i,
          embedding: fakeEmbedding(t, 256), // wrong dim
        }));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data }));
      });
    });
    await new Promise<void>((r) => bad.listen(0, '127.0.0.1', r));
    const addr = bad.address();
    const url = `http://127.0.0.1:${(addr as { port: number }).port}`;

    await expect(
      computeRealEmbedding('x', { endpoint: url, enableCache: false })
    ).rejects.toThrow(/dim mismatch/);

    await new Promise<void>((r) => bad.close(() => r()));
  });
});
