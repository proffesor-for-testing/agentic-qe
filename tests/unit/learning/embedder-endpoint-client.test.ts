/**
 * Unit tests for ADR-097 EmbedderEndpointClient.
 *
 * These tests use a real Node http.createServer fixture (no mocks of the HTTP
 * layer itself — we want to verify the actual wire format and keep-alive
 * behavior). The Unix-socket transport is covered via a temp-dir socket path.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  EmbedderEndpointClient,
  parseEndpoint,
  redactEndpoint,
} from '../../../src/learning/embedder-endpoint-client.js';

/**
 * Build a 384-d unit vector seeded by text content so we get deterministic
 * but distinguishable embeddings per input — enough to verify ordering.
 */
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

interface FakeServerHandle {
  url: string;
  /** Last request body, parsed JSON */
  lastRequest: { model?: string; input?: string[] } | null;
  /** Set to override server behavior per-test */
  responder: (
    body: { model: string; input: string[] },
    res: http.ServerResponse
  ) => void;
  close: () => Promise<void>;
}

async function startFakeHttpServer(
  responder?: FakeServerHandle['responder']
): Promise<FakeServerHandle> {
  const handle: FakeServerHandle = {
    url: '',
    lastRequest: null,
    responder: responder ?? defaultResponder,
    close: async () => {},
  };

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const parsed = JSON.parse(raw);
      handle.lastRequest = parsed;
      handle.responder(parsed, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind fake server');
  handle.url = `http://127.0.0.1:${addr.port}`;
  handle.close = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
  return handle;
}

async function startFakeUnixServer(
  responder?: FakeServerHandle['responder']
): Promise<FakeServerHandle & { socketPath: string }> {
  const socketPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'aqe-embedder-')),
    'sock'
  );
  const handle: FakeServerHandle & { socketPath: string } = {
    url: `unix:${socketPath}`,
    socketPath,
    lastRequest: null,
    responder: responder ?? defaultResponder,
    close: async () => {},
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const parsed = JSON.parse(raw);
      handle.lastRequest = parsed;
      handle.responder(parsed, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  handle.close = () =>
    new Promise<void>((resolve) =>
      server.close(() => {
        try {
          fs.rmSync(path.dirname(socketPath), { recursive: true, force: true });
        } catch {
          // ignore
        }
        resolve();
      })
    );
  return handle;
}

function defaultResponder(
  body: { model: string; input: string[] },
  res: http.ServerResponse
): void {
  const data = body.input.map((t, i) => ({
    object: 'embedding',
    index: i,
    embedding: fakeEmbedding(t),
  }));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ object: 'list', data, model: body.model }));
}

describe('parseEndpoint', () => {
  it('parses http URL', () => {
    expect(parseEndpoint('http://localhost:8080')).toMatchObject({
      transport: 'http',
      host: 'localhost',
      port: 8080,
      protocol: 'http:',
    });
  });

  it('parses https URL with default port', () => {
    expect(parseEndpoint('https://embed.example.com')).toMatchObject({
      transport: 'https',
      host: 'embed.example.com',
      port: 443,
      protocol: 'https:',
    });
  });

  it('parses unix: prefix', () => {
    expect(parseEndpoint('unix:/run/embedder.sock')).toMatchObject({
      transport: 'unix',
      socketPath: '/run/embedder.sock',
    });
  });

  it('rejects relative unix path', () => {
    expect(() => parseEndpoint('unix:relative/path')).toThrow(/absolute path/);
  });

  it('rejects non-http protocols', () => {
    expect(() => parseEndpoint('ftp://host/path')).toThrow(/unsupported/);
  });

  it('strips userinfo from URL and emits warning', () => {
    const warn = console.warn;
    const seen: string[] = [];
    console.warn = (msg: unknown) => seen.push(String(msg));
    try {
      const parsed = parseEndpoint('https://user:secret@embed.example.com/x');
      expect(parsed.safeUrl).not.toContain('secret');
      expect(parsed.safeUrl).not.toContain('user:');
      expect(seen.some((s) => /userinfo/i.test(s))).toBe(true);
    } finally {
      console.warn = warn;
    }
  });
});

describe('redactEndpoint', () => {
  it('returns plain URL unchanged', () => {
    expect(redactEndpoint('http://localhost:8080')).toBe('http://localhost:8080');
  });

  it('strips userinfo', () => {
    expect(redactEndpoint('https://user:pw@host.example.com/x')).not.toContain('pw');
    expect(redactEndpoint('https://user:pw@host.example.com/x')).not.toContain('user');
  });

  it('passes unix paths through', () => {
    expect(redactEndpoint('unix:/run/embed.sock')).toBe('unix:/run/embed.sock');
  });
});

describe('EmbedderEndpointClient', () => {
  let server: FakeServerHandle;
  let client: EmbedderEndpointClient;

  beforeEach(async () => {
    server = await startFakeHttpServer();
    client = new EmbedderEndpointClient({ endpoint: server.url });
  });

  afterEach(async () => {
    client.close();
    await server.close();
  });

  it('sends OpenAI-compatible request body with encoding_format=float', async () => {
    await client.embed(['hello world']);
    expect(server.lastRequest).toMatchObject({
      model: 'Xenova/all-MiniLM-L6-v2',
      input: ['hello world'],
      encoding_format: 'float',
    });
  });

  it('fails loud when server returns base64-encoded embeddings', async () => {
    server.responder = (body, res) => {
      const data = body.input.map((_t, i) => ({
        index: i,
        embedding: 'YmFzZTY0LWVuY29kZWQtdmVjdG9y', // base64 string
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    await expect(client.embed(['x'])).rejects.toThrow(/base64/);
  });

  it('returns 384-d vectors in input order', async () => {
    const vecs = await client.embed(['a', 'b', 'c']);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(384);
    // Ensure distinct (text seed influences fake embedding)
    expect(vecs[0]).not.toEqual(vecs[1]);
    expect(vecs[1]).not.toEqual(vecs[2]);
  });

  it('preserves input order when server returns shuffled indices', async () => {
    server.responder = (body, res) => {
      // Return entries shuffled but with correct `index` fields. The probe
      // (length-1 input) goes through the default path; only the user-level
      // multi-input call gets shuffled.
      const items = body.input.map((t, i) => ({
        object: 'embedding',
        index: i,
        embedding: fakeEmbedding(t),
      }));
      const out = items.length >= 3 ? [items[2], items[0], items[1]] : items;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: out }));
    };
    const inputs = ['alpha', 'beta', 'gamma'];
    const vecs = await client.embed(inputs);
    // After client-side sort-by-index, vecs[i] should match fakeEmbedding(inputs[i])
    for (let i = 0; i < inputs.length; i++) {
      // Approximate equality — re-normalization preserves direction
      const a = vecs[i];
      const expected = fakeEmbedding(inputs[i]);
      const dot = a.reduce((s, x, j) => s + x * expected[j], 0);
      expect(dot).toBeGreaterThan(0.999);
    }
  });

  it('re-normalizes received vectors to unit length', async () => {
    // Server returns non-normalized vectors (scaled 10x)
    server.responder = (body, res) => {
      const data = body.input.map((t, i) => {
        const v = fakeEmbedding(t).map((x) => x * 10);
        return { index: i, embedding: v };
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    const [v] = await client.embed(['scaled']);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('fails loud on dim mismatch', async () => {
    server.responder = (body, res) => {
      const data = body.input.map((t, i) => ({
        index: i,
        embedding: fakeEmbedding(t, 256), // wrong dim
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    await expect(client.embed(['x'])).rejects.toThrow(/dim mismatch/);
  });

  it('fails loud on non-2xx status', async () => {
    server.responder = (_body, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"upstream blew up"}');
    };
    await expect(client.embed(['x'])).rejects.toThrow(/HTTP 500/);
  });

  it('sends Authorization header when token provided', async () => {
    // Use a dedicated capture server so we can inspect headers, not just body.
    const captured: { auth?: string } = {};
    const capture = http.createServer((req, res) => {
      captured.auth = req.headers['authorization'] as string | undefined;
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const parsed = JSON.parse(raw) as { model: string; input: string[] };
        defaultResponder(parsed, res);
      });
    });
    await new Promise<void>((r) => capture.listen(0, '127.0.0.1', r));
    const addr = capture.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;

    client.close();
    client = new EmbedderEndpointClient({ endpoint: url, token: 'secret-token-123' });
    await client.embed(['hello']);
    expect(captured.auth).toBe('Bearer secret-token-123');

    await new Promise<void>((r) => capture.close(() => r()));
  });

  it('probe returns stable identity for deterministic server', async () => {
    const id1 = await client.probe();
    const id2 = await client.probe();
    expect(id1.dim).toBe(384);
    expect(id1.fingerprint).toBe(id2.fingerprint);
    expect(id1.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(id1.endpoint).toBe(server.url);
  });

  it('probe fingerprint changes when canary embedding changes', async () => {
    const id1 = await client.probe();
    // Swap server to return a different canary embedding
    server.responder = (body, res) => {
      const data = body.input.map((_t, i) => ({
        index: i,
        embedding: fakeEmbedding('different-seed-' + i),
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data }));
    };
    const id2 = await client.probe();
    expect(id2.fingerprint).not.toBe(id1.fingerprint);
  });

  it('circuit breaker opens after threshold failures and fast-fails', async () => {
    server.responder = (_body, res) => {
      res.writeHead(500);
      res.end('boom');
    };
    client.close();
    client = new EmbedderEndpointClient({
      endpoint: server.url,
      failureThreshold: 3,
      failureWindowMs: 60_000,
    });
    for (let i = 0; i < 3; i++) {
      await expect(client.embed(['x'])).rejects.toThrow();
    }
    expect(client.getBreakerState().open).toBe(true);
    // Next call should be fast — no HTTP traffic
    const before = Date.now();
    await expect(client.embed(['x'])).rejects.toThrow(/circuit breaker open/);
    expect(Date.now() - before).toBeLessThan(50);
  });

  it('circuit breaker resets after success following window', async () => {
    client.close();
    client = new EmbedderEndpointClient({
      endpoint: server.url,
      failureThreshold: 2,
      failureWindowMs: 30,
    });
    server.responder = (_body, res) => {
      res.writeHead(500);
      res.end('boom');
    };
    await expect(client.embed(['x'])).rejects.toThrow();
    await expect(client.embed(['x'])).rejects.toThrow();
    expect(client.getBreakerState().open).toBe(true);
    // Wait past the failure window
    await new Promise((r) => setTimeout(r, 60));
    expect(client.getBreakerState().open).toBe(false);
    // Restore success behavior and verify the next call goes through
    server.responder = defaultResponder;
    const out = await client.embed(['x']);
    expect(out[0]).toHaveLength(384);
  });

  // -- ADR-097 boundary hardening (devil's-advocate audit) --

  it('embed() lazily probes when no cached identity exists', async () => {
    client.close();
    let calls = 0;
    let firstWasCanary = false;
    const capture = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        calls++;
        const parsed = JSON.parse(raw) as { input: string[] };
        if (calls === 1) {
          firstWasCanary = /canary/i.test(parsed.input[0] ?? '');
        }
        defaultResponder(parsed as { model: string; input: string[] }, res);
      });
    });
    await new Promise<void>((r) => capture.listen(0, '127.0.0.1', r));
    const addr = capture.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;
    client = new EmbedderEndpointClient({ endpoint: url });
    await client.embed(['user text']);
    // probe + actual call = 2 HTTP requests, probe first
    expect(calls).toBe(2);
    expect(firstWasCanary).toBe(true);
    expect(client.getCachedIdentity()).not.toBeNull();
    await new Promise<void>((r) => capture.close(() => r()));
  });

  it('breaker recovery invalidates cached identity (forces re-probe)', async () => {
    client.close();
    let calls = 0;
    let canaryCallCount = 0;
    const capture = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        calls++;
        const parsed = JSON.parse(raw) as { input: string[] };
        if (/canary/i.test(parsed.input[0] ?? '')) canaryCallCount++;
        // First two calls (= probe attempts from embeds #1 and #2) fail to
        // trip the threshold-2 breaker. After window expiry, embed #3 first
        // re-probes (call #3 — succeeds) then issues the real embed (call #4).
        if (calls <= 2) {
          res.writeHead(500);
          res.end('boom');
        } else {
          defaultResponder(parsed as { model: string; input: string[] }, res);
        }
      });
    });
    await new Promise<void>((r) => capture.listen(0, '127.0.0.1', r));
    const addr = capture.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;
    client = new EmbedderEndpointClient({
      endpoint: url,
      failureThreshold: 2,
      failureWindowMs: 30,
    });
    // Each failing embed triggers ONE probe attempt (which fails). 2 probes =
    // 2 failures = breaker trips.
    await expect(client.embed(['x'])).rejects.toThrow();
    await expect(client.embed(['x'])).rejects.toThrow();
    expect(client.getBreakerState().open).toBe(true);
    expect(canaryCallCount).toBe(2); // both pre-recovery attempts were probes
    // Server flips to success for calls 3+. Wait past failure window.
    // Recovery callback fires the next time isOpen() is called; it must clear
    // cached identity so the next embed re-probes.
    await new Promise((r) => setTimeout(r, 60));
    expect(client.getBreakerState().open).toBe(false);
    expect(client.getCachedIdentity()).toBeNull(); // <- re-probe will run
    const out = await client.embed(['x']);
    expect(out[0]).toHaveLength(384);
    // After recovery the next embed re-probes (canary call #3), then actual call.
    expect(canaryCallCount).toBe(3);
    await new Promise<void>((r) => capture.close(() => r()));
  });

  it('concurrent embeds share a single in-flight probe', async () => {
    client.close();
    let calls = 0;
    let canaryCalls = 0;
    const capture = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        calls++;
        const parsed = JSON.parse(raw) as { model: string; input: string[] };
        if (/canary/i.test(parsed.input[0] ?? '')) canaryCalls++;
        // Add a small delay so concurrent calls overlap in flight
        setTimeout(() => defaultResponder(parsed, res), 10);
      });
    });
    await new Promise<void>((r) => capture.listen(0, '127.0.0.1', r));
    const addr = capture.address() as { port: number };
    const url = `http://127.0.0.1:${addr.port}`;
    client = new EmbedderEndpointClient({ endpoint: url });
    // Fire 20 embeds before any single one completes. Each call goes through
    // ensureProbed, but only ONE probe HTTP request should hit the server.
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => client.embed([`item-${i}`]))
    );
    expect(results).toHaveLength(20);
    results.forEach((r) => expect(r[0]).toHaveLength(384));
    expect(canaryCalls).toBe(1); // exactly one probe across all 20 concurrent embeds
    expect(calls).toBe(21); // 1 probe + 20 actual embeds
    await new Promise<void>((r) => capture.close(() => r()));
  });

  it('rejects fast on DNS failure (.invalid TLD)', async () => {
    client.close();
    client = new EmbedderEndpointClient({
      endpoint: 'http://does-not-exist-aqe-test.invalid:8080',
      connectTimeoutMs: 500,
      requestTimeoutMs: 30_000,
    });
    const start = Date.now();
    await expect(client.embed(['x'])).rejects.toThrow(/ENOTFOUND|EAI_AGAIN|timeout/);
    const elapsed = Date.now() - start;
    // DNS resolution failure should bubble up quickly — give wide headroom.
    expect(elapsed).toBeLessThan(3_000);
  }, 10_000);

  it('connect timeout fires fast against a non-routable host', async () => {
    // 192.0.2.0/24 is reserved by RFC 5737 for documentation — guaranteed
    // non-routable, so SYN packets blackhole. Pre-fix this would hang for ~75s.
    client.close();
    client = new EmbedderEndpointClient({
      endpoint: 'http://192.0.2.1:65000',
      connectTimeoutMs: 300,
      requestTimeoutMs: 60_000,
    });
    const start = Date.now();
    await expect(client.embed(['x'])).rejects.toThrow(/timeout|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/);
    const elapsed = Date.now() - start;
    // Give generous headroom: anything under 2s proves we didn't fall back to
    // the OS default (~75s).
    expect(elapsed).toBeLessThan(2_000);
  }, 5_000);
});

describe('EmbedderEndpointClient — Unix socket transport', () => {
  it('embeds over unix socket', async () => {
    const server = await startFakeUnixServer();
    const client = new EmbedderEndpointClient({ endpoint: server.url });
    try {
      const vecs = await client.embed(['unix transport']);
      expect(vecs[0]).toHaveLength(384);
      expect(server.lastRequest?.input).toEqual(['unix transport']);
    } finally {
      client.close();
      await server.close();
    }
  });
});
