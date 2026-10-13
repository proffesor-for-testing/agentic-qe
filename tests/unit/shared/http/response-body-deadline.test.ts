/**
 * #980 bug class (also #885, #889, #961): a fetch wrapper that clears its
 * timeout once the headers arrive leaves the body read unbounded, so a peer
 * that sends headers and then stalls hangs the caller forever.
 *
 * The two remaining wrappers that returned a Response with the timer already
 * cleared — the shared HttpClient (OSV, contract testing, chaos/load tools) and
 * the RuVector server client — are exercised against a real local server that
 * sends headers plus a partial body and never finishes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpClient } from '../../../../src/shared/http/http-client';
import { RuVectorServerClient } from '../../../../src/integrations/ruvector/server-client';

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('{"features": ["a"'); // headers + partial body, then silence
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const HUNG = Symbol('hung');
const within = <T>(p: Promise<T>, ms: number): Promise<T | typeof HUNG> =>
  Promise.race([p, new Promise<typeof HUNG>((resolve) => setTimeout(() => resolve(HUNG), ms).unref())]);

describe('response bodies stay under the request deadline (#980 class)', () => {
  it('HttpClient: reading a stalled body rejects instead of hanging', async () => {
    const client = new HttpClient();
    const res = await client.get(`http://localhost:${port}/`, { timeout: 500, retries: 0, circuitBreaker: false });
    expect(res.success).toBe(true);
    if (!res.success) return;

    const body = within(res.value.text().then(() => 'read', (e: Error) => `rejected: ${e.message}`), 5000);
    const outcome = await body;
    expect(outcome).not.toBe(HUNG);
    expect(outcome).toMatch(/^rejected: .*tim/i);
  }, 10_000);

  it('RuVectorServerClient.healthCheck completes when /health stalls its body', async () => {
    const client = new RuVectorServerClient({ httpPort: port, autoStart: false, healthCheckRetryDelay: 500 });
    const outcome = await within(client.healthCheck(), 5000);
    expect(outcome).not.toBe(HUNG);
  }, 10_000);
});
