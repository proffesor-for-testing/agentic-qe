import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpClient } from '../../../../src/shared/http/http-client.js';

afterEach(() => vi.restoreAllMocks());

describe('HttpClient native fetch error classification', () => {
  it('recognizes a refused connection from actual Node fetch', async () => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    const result = await new HttpClient().get(`http://127.0.0.1:${address.port}`, {
      retries: 0, timeout: 1000, circuitBreaker: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('CONNECTION_REFUSED');
      expect(result.error.cause?.message).toBe('fetch failed');
      expect((result.error.cause?.cause as NodeJS.ErrnoException).code).toBe('ECONNREFUSED');
    }
  });

  it.each([
    ['ECONNREFUSED', 'CONNECTION_REFUSED'],
    ['ENOTFOUND', 'DNS_ERROR'],
    ['ETIMEDOUT', 'NETWORK_TIMEOUT'],
  ])('recognizes wrapped structured %s while preserving the original error', async (code, expected) => {
    const cause = Object.assign(new Error('transport failed'), { code });
    const error = new TypeError('fetch failed', { cause: new Error('wrapper', { cause }) });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
    const result = await new HttpClient().get('http://fixture.invalid', { retries: 0, circuitBreaker: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(expected);
      expect(result.error.cause).toBe(error);
    }
  });

  it('retains the generic classification for an unknown cyclic error cause', async () => {
    const error = new Error('unknown failure');
    error.cause = error;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
    const result = await new HttpClient().get('http://fixture.invalid', { retries: 0, circuitBreaker: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('REQUEST_FAILED');
  });
});
