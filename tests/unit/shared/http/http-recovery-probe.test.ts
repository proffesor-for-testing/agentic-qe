import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { HttpClient } from '../../../../src/shared/http/http-client.js';

const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

async function fixture() {
  let failing = true;
  const held: ServerResponse[] = [];
  const server = createServer((request, response) => {
    if (failing) request.socket.destroy();
    else held.push(response);
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return { url: `http://127.0.0.1:${address.port}`, held,
    recover: () => { failing = false; } };
}

async function openCircuit(client: HttpClient, url: string) {
  for (let i = 0; i < 5; i++) await client.get(url, { retries: 0, timeout: 1000 });
  const state = client.getCircuitState(url);
  expect(state.state).toBe('open');
  // Keep native HTTP and timers; advance only the circuit's elapsed-time clock.
  vi.spyOn(Date, 'now').mockReturnValue(state.lastFailure! + 30001);
}

describe('HttpClient recovery probe ownership with native HTTP', () => {
  it('admits one pending recovery probe and resumes requests after success', async () => {
    const target = await fixture();
    const client = new HttpClient();
    await openCircuit(client, target.url);
    target.recover();
    const probe = client.get(target.url, { retries: 0, timeout: 1000 });
    for (let i = 0; !target.held.length && i < 100; i++) await delay(5);
    expect(target.held.length).toBe(1);
    const independent = await fixture();
    independent.recover();
    const otherOrigin = client.get(independent.url, { retries: 0, timeout: 1000 });
    for (let i = 0; !independent.held.length && i < 100; i++) await delay(5);
    for (const response of independent.held.splice(0)) response.end('independent');
    expect((await otherOrigin).success).toBe(true);
    expect(client.getCircuitState(target.url).state).toBe('half-open');
    const others = Array.from({ length: 3 }, () => client.get(`${target.url}/other`, { retries: 0, timeout: 1000 }));
    await delay(30);
    const admitted = target.held.length;
    for (const response of target.held.splice(0)) response.end('recovered');
    const [result, ...rejected] = await Promise.all([probe, ...others]);
    expect(admitted).toBe(1);
    expect(result.success).toBe(true);
    expect(rejected.every(r => !r.success && r.error.code === 'CIRCUIT_OPEN')).toBe(true);
    expect(client.getCircuitState(target.url).state).toBe('closed');
    const next = client.get(target.url, { retries: 0, timeout: 1000 });
    for (let i = 0; !target.held.length && i < 100; i++) await delay(5);
    for (const response of target.held.splice(0)) response.end('healthy');
    expect((await next).success).toBe(true);
  });

  it('returns to open when the single recovery probe fails', async () => {
    const target = await fixture();
    const client = new HttpClient();
    await openCircuit(client, target.url);
    const result = await client.get(target.url, { retries: 0, timeout: 1000 });
    expect(result.success).toBe(false);
    expect(client.getCircuitState(target.url).state).toBe('open');
    const rejected = await client.get(target.url, { retries: 0, timeout: 1000 });
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.error.code).toBe('CIRCUIT_OPEN');
  });
});
