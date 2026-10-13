/**
 * Issue #980: the DAST scanner cleared its request timeout as soon as the
 * response headers arrived, then read the body with `response.clone().text()`.
 * A scanned target — untrusted by definition — that sends headers and then
 * stalls the body hung the scan forever.
 *
 * Real HTTP: a local server answers GET / with 200 + headers + a partial body
 * and never ends it. The scan must finish within its deadline and report the
 * timeout instead of hanging.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DASTScanner } from '../../../../../src/domains/security-compliance/services/scanners/dast-scanner';
import type { SecurityScannerConfig } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';

let server: http.Server;
let base: string;
let stalledBodies = 0;
let closedResponses = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      stalledBodies++;
      if (req.headers.authorization) res.on('close', () => { closedResponses++; });
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><body><a href="/next">next</a>'); // headers + partial body, then silence
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const memory = {
  set: async () => undefined,
  get: async () => undefined,
  delete: async () => true,
  has: async () => false,
  search: async () => [],
  vectorSearch: async () => [],
  storeVector: async () => undefined,
} as unknown as MemoryBackend;

const config = {
  timeout: 1000,
  dastMaxDepth: 1,
  dastActiveScanning: true,
} as unknown as SecurityScannerConfig;

describe('DAST scanner bounds the response body, not just the headers (#980)', () => {
  it('finishes within the deadline when the target stalls its body and reports the timeout', async () => {
    const scanner = new DASTScanner(config, memory);
    const started = Date.now();

    const result = await Promise.race([
      scanner.scanUrl(base, { timeout: 1000, activeScanning: true, maxDepth: 1 }),
      new Promise<'HUNG'>((resolve) => setTimeout(() => resolve('HUNG'), 8000).unref()),
    ]);

    expect(result).not.toBe('HUNG');
    expect(Date.now() - started).toBeLessThan(8000);
    expect(stalledBodies).toBeGreaterThanOrEqual(1);
    const scan = result as Awaited<ReturnType<DASTScanner['scanUrl']>>;
    expect(scan.success).toBe(true);
    if (scan.success) {
      expect(scan.value.vulnerabilities.map((v) => v.title)).toContain('Connection Timeout');
    }
  }, 15_000);

  it('#980 review N8: the authenticated scan finishes and releases the stalled connection', async () => {
    const scanner = new DASTScanner(config, memory);
    const closedBefore = closedResponses; // authenticated requests only
    const started = Date.now();

    const result = await Promise.race([
      scanner.scanAuthenticated(base, { type: 'bearer', token: 'test-token' }, { timeout: 1000, activeScanning: false, maxDepth: 1 }),
      new Promise<'HUNG'>((resolve) => setTimeout(() => resolve('HUNG'), 8000).unref()),
    ]);

    expect(result).not.toBe('HUNG');
    expect(Date.now() - started).toBeLessThan(8000);
    // The scanner must not leave the target's half-sent body (and socket) open
    // after it has what it needs: the server sees the response closed.
    await new Promise((r) => setTimeout(r, 1500));
    expect(closedResponses).toBeGreaterThan(closedBefore);
  }, 15_000);
});
