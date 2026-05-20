/**
 * Real-provider integration test for ADR-097 endpoint client.
 *
 * Drives EmbedderEndpointClient against a live `llama-server --embeddings`
 * instance (llama.cpp). This is the test the devil's-advocate audit demanded
 * because the unit tests only talk to an in-process loopback fake — they prove
 * the client talks to itself, not that the wire format actually works against
 * a real provider.
 *
 * Set AQE_LLAMA_EMBED_URL=http://127.0.0.1:18080 to point at your running
 * server. When the env var is unset the suite skips, so this test does not
 * become a CI-time flake when the binary or model isn't present.
 *
 * To run locally:
 *   /tmp/llama.cpp/build/bin/llama-server -m /tmp/models/all-MiniLM-L6-v2.Q8_0.gguf \
 *     --port 18080 --host 127.0.0.1 --embeddings --pooling mean -c 512
 *   AQE_LLAMA_EMBED_URL=http://127.0.0.1:18080 \
 *     npx vitest run tests/integration/embedder-endpoint-llamacpp.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmbedderEndpointClient } from '../../src/learning/embedder-endpoint-client.js';

const ENDPOINT = process.env.AQE_LLAMA_EMBED_URL;
const describeIfLive = ENDPOINT ? describe : describe.skip;

describeIfLive('ADR-097 — real llama-server provider', () => {
  // Construction is gated behind beforeAll so the describe.skip path doesn't
  // try to parse an undefined endpoint URL at module-eval time.
  let client: EmbedderEndpointClient;
  beforeAll(() => {
    client = new EmbedderEndpointClient({
      endpoint: ENDPOINT as string,
      model: 'all-MiniLM-L6-v2',
      expectedDim: 384,
      connectTimeoutMs: 5_000,
      requestTimeoutMs: 30_000,
    });
  });

  afterAll(() => {
    client?.close();
  });

  it('probe returns dim=384 and a stable fingerprint', async () => {
    const id1 = await client.probe();
    expect(id1.dim).toBe(384);
    expect(id1.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    // Second probe must reproduce the same fingerprint against the same model
    // & quantization. This is what makes drift detection meaningful.
    const id2 = await client.probe();
    expect(id2.fingerprint).toBe(id1.fingerprint);
  });

  it('embed single text returns a unit-length 384-d vector', async () => {
    const [vec] = await client.embed(['the quick brown fox jumps over the lazy dog']);
    expect(vec).toHaveLength(384);
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it('embed batch preserves order and produces semantically meaningful vectors', async () => {
    const inputs = [
      'cats are mammals',
      'dogs are mammals',
      'sql is a query language',
    ];
    const vecs = await client.embed(inputs);
    expect(vecs).toHaveLength(3);
    vecs.forEach((v) => expect(v).toHaveLength(384));

    // Semantic check: cats~dogs (both mammals) should be closer than cats~sql.
    // This is the practical reason we need a real model — fakeEmbedding can't
    // give us this signal.
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    const catsDogs = cos(vecs[0], vecs[1]);
    const catsSql = cos(vecs[0], vecs[2]);
    expect(catsDogs).toBeGreaterThan(catsSql);
  });

  it('embed() is gated on probe — works on a fresh client without manual probe', async () => {
    const fresh = new EmbedderEndpointClient({
      endpoint: ENDPOINT as string,
      model: 'all-MiniLM-L6-v2',
      expectedDim: 384,
    });
    try {
      const [vec] = await fresh.embed(['lazy probe gate']);
      expect(vec).toHaveLength(384);
      expect(fresh.getCachedIdentity()).not.toBeNull();
    } finally {
      fresh.close();
    }
  });

  it('rejects with dim mismatch when expectedDim is wrong', async () => {
    const wrong = new EmbedderEndpointClient({
      endpoint: ENDPOINT as string,
      model: 'all-MiniLM-L6-v2',
      expectedDim: 768, // MiniLM is 384 — must fail loud
    });
    try {
      await expect(wrong.embed(['x'])).rejects.toThrow(/dim mismatch/);
    } finally {
      wrong.close();
    }
  });

  it('handles batches larger than the default 32-input chunk', async () => {
    // Real llama-server enforces its own batch limits. Verify the wire shape
    // holds for 50 inputs in one call — exercises the index-ordering path
    // against actual server batching behavior, not just the fake.
    const inputs = Array.from({ length: 50 }, (_, i) => `sentence number ${i} for batching test`);
    const vecs = await client.embed(inputs);
    expect(vecs).toHaveLength(50);
    vecs.forEach((v) => {
      expect(v).toHaveLength(384);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 4);
    });
    // Each sentence text is distinct, so vectors should be distinct too
    const fingerprints = new Set(vecs.map((v) => v.slice(0, 8).join(',')));
    expect(fingerprints.size).toBe(50);
  });
});
