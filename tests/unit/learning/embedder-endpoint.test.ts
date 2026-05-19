/**
 * Tests for the external embedder endpoint client (embedder-endpoint.ts).
 *
 * Verifies createEndpointPipeline() against mock embedder servers on both a
 * Unix socket and HTTP, the batch path, and the unsupported-scheme error.
 * No real model is loaded — the mock servers return deterministic vectors.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { createEndpointPipeline } from '../../../src/learning/embedder-endpoint.js';

const DIM = 384;

/** Deterministic fake embedding so assertions are stable. */
const fakeEmbedding = (seed: number): number[] =>
  Array.from({ length: DIM }, (_, i) => (seed + i) / 1000);

describe('embedder-endpoint: createEndpointPipeline', () => {
  let tmp: string;
  let unixServer: net.Server;
  let httpServer: http.Server;
  let socketPath: string;
  let httpUrl: string;

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'aqe-embed-'));
    socketPath = path.join(tmp, 'embedder.sock');

    // Mock Unix-socket embedder: { texts } -> { embeddings }
    unixServer = net.createServer((conn) => {
      let buf = '';
      conn.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        const nl = buf.indexOf('\n');
        if (nl < 0) return;
        const { texts } = JSON.parse(buf.slice(0, nl)) as { texts: string[] };
        conn.write(JSON.stringify({ embeddings: texts.map((_t, i) => fakeEmbedding(i)) }) + '\n');
      });
    });
    await new Promise<void>((resolve) => unixServer.listen(socketPath, resolve));

    // Mock HTTP embedder
    httpServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const { texts } = JSON.parse(body) as { texts: string[] };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ embeddings: texts.map((_t, i) => fakeEmbedding(i)) }));
      });
    });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address() as net.AddressInfo;
    httpUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    unixServer?.close();
    httpServer?.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('embeds a single string over a unix socket', async () => {
    const extract = createEndpointPipeline(`unix:${socketPath}`);
    const out = await extract('hello world');
    expect(out.data).toBeInstanceOf(Float32Array);
    expect(out.data.length).toBe(DIM);
    expect(out.dims).toEqual([1, DIM]);
    expect(out.data[0]).toBeCloseTo(0); // fakeEmbedding(0)[0]
  });

  it('embeds a batch over a unix socket — correct dims and ordering', async () => {
    const extract = createEndpointPipeline(`unix:${socketPath}`);
    const out = await extract(['a', 'b', 'c']);
    expect(out.data.length).toBe(3 * DIM);
    expect(out.dims).toEqual([3, DIM]);
    // text #1 received seed 1 -> its embedding[0] sits at flat offset DIM
    expect(out.data[DIM]).toBeCloseTo(1 / 1000);
  });

  it('embeds over an HTTP endpoint', async () => {
    const extract = createEndpointPipeline(httpUrl);
    const out = await extract('hello');
    expect(out.data.length).toBe(DIM);
    expect(out.dims).toEqual([1, DIM]);
  });

  it('rejects an unsupported endpoint scheme', async () => {
    const extract = createEndpointPipeline('ftp://nope');
    await expect(extract('x')).rejects.toThrow(/unsupported embedder endpoint/);
  });
});
