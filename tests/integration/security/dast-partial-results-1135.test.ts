/**
 * #1135: DAST follow-ups on owned loopback targets. An initial 407/408/429 is
 * a failed scan; a probe the target does not answer leaves the scan
 * incomplete with the findings already collected; an invalid target is a
 * validation error; analysis bugs and TLS failures keep their own codes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DASTScanner } from '../../../src/domains/security-compliance/services/scanners/dast-scanner';
import { performDASTScan } from '../../../src/domains/security-compliance/services/security-auditor-dast';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import type { SecurityScannerConfig } from '../../../src/domains/security-compliance/services/scanners/scanner-types';
import { registerSecurityHandlers } from '../../../src/coordination/handlers/security-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../src/coordination/queen-types';

const config: SecurityScannerConfig = {
  defaultRuleSets: ['owasp-top-10'], maxConcurrentScans: 4, timeout: 2000,
  enableFalsePositiveDetection: false, dastMaxDepth: 1, dastActiveScanning: false,
  enableLLMAnalysis: false, llmModelTier: 4,
};
const page = '<html><body><a href="/about">about</a></body></html>';

describe('DAST partial results and failure codes (#1135)', () => {
  let memory: MemoryBackend;
  let server: Server | undefined;
  let url: string;
  beforeEach(async () => {
    ({ backend: memory } = await createMemoryBackend({ type: 'memory' }, true));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
    await memory.dispose();
  });
  async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void) {
    server = createServer(handler);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback port');
    url = `http://127.0.0.1:${address.port}/`;
  }
  const stored = () => memory.search('security:scan:*', 100, { namespace: 'security-compliance' });

  it.each([[429, 'DAST_RATE_LIMITED'], [408, 'DAST_REQUEST_TIMEOUT']] as const)(
    'fails an initial HTTP %i (%s) instead of scoring the error page', async (status, code) => {
      await serve((_request, response) => { response.writeHead(status); response.end('error page'); });
      const scanner = new DASTScanner(config, memory);
      for (const result of [await scanner.scanUrl(url), await scanner.scanAuthenticated(url, { type: 'bearer', token: 'fixture' })]) {
        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toMatchObject({ code });
      }
      expect([...scanner['activeScans'].values()]).toEqual(['failed', 'failed']);
      expect(await stored()).toEqual([]);
    });

  it('fails an initial HTTP 407 as an authentication failure', async () => {
    // Node's fetch turns a 407 into a network error; other fetch implementations return it.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('proxy auth', { status: 407 })));
    const result = await new DASTScanner(config, memory).scanUrl('http://127.0.0.1:9/');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatchObject({ code: 'DAST_AUTHENTICATION_FAILED' });
  });

  it('keeps header findings and lists the probe a WAF dropped, as an incomplete scan', async () => {
    await serve((request, response) => {
      if (request.url === '/.env') return request.socket.destroy();
      response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' });
      response.end(request.url === '/' ? page : 'not found');
    });
    const scanner = new DASTScanner(config, memory);
    const result = await scanner.scanUrl(url, { activeScanning: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.status).toBe('incomplete');
    expect(result.value.failedRequests).toEqual([
      { url: `${url}.env`, code: 'DAST_REQUEST_FAILED', reason: expect.any(String) },
    ]);
    expect(result.value.error).toContain('1 DAST request(s) were not answered');
    expect(result.value.vulnerabilities).toContainEqual(expect.objectContaining({ title: 'Missing Content-Security-Policy' }));
    expect(await stored()).toHaveLength(1);
    expect(await memory.get(`security:scan:${result.value.scanId}`, { namespace: 'security-compliance' }))
      .toMatchObject({ status: 'incomplete', failedRequests: result.value.failedRequests });
  });

  it('exposes an incomplete scan through the security handler as a partial DAST engine', async () => {
    await serve((request, response) => {
      if (request.url === '/.env') return request.socket.destroy();
      response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' });
      response.end(request.url === '/' ? page : 'not found');
    });
    const scanner = new DASTScanner(config, memory);
    let handler: InstanceTaskHandler;
    registerSecurityHandlers({ memory, getSecurityScanner: () => scanner,
      registerHandler: (_type: string, h: InstanceTaskHandler) => { handler = h; },
    } as unknown as TaskHandlerContext);
    const result = await handler!({ payload: { target: '/owned-no-source-discovery', sast: false, dast: true, targetUrl: url } } as unknown as QueenTask);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const value = result.value as any;
    expect(value.evidence.engines).toContainEqual(expect.objectContaining({
      id: 'dast', status: 'partial', target: url,
      errors: ['dast incomplete: 1 request(s) not answered (DAST_REQUEST_FAILED).'],
      limitations: [expect.stringContaining(`dast not answered: ${url}.env (DAST_REQUEST_FAILED`)],
    }));
    expect(value.status).not.toBe('completed');
    expect(value.findings.length).toBeGreaterThan(0);
  });

  it('records a slow same-origin page as a timed-out probe, not a failed scan', async () => {
    await serve((request, response) => {
      if (request.url === '/about') return; // never answers; the 5 s probe deadline expires
      response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' });
      response.end(request.url === '/' ? page : 'not found');
    });
    const result = await new DASTScanner(config, memory).scanUrl(url, { activeScanning: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.status).toBe('incomplete');
      expect(result.value.failedRequests).toEqual([expect.objectContaining({ url: `${url}about`, code: 'DAST_REQUEST_TIMEOUT' })]);
    }
  }, 15000);

  it('treats a rate-limited probe as unanswered, not as "file not exposed"', async () => {
    await serve((request, response) => {
      response.writeHead(request.url === '/' ? 200 : request.url === '/.git/config' ? 429 : 404);
      response.end(request.url === '/' ? '<html></html>' : 'x');
    });
    const result = await new DASTScanner(config, memory).scanUrl(url, { activeScanning: true });
    expect(result.success && result.value.failedRequests).toEqual([
      { url: `${url}.git/config`, code: 'DAST_RATE_LIMITED', reason: 'rate limited (HTTP 429)' },
    ]);
  });

  it('reports a complete scan when every probe is answered', async () => {
    await serve((request, response) => {
      response.writeHead(request.url === '/' ? 200 : 404, { 'Content-Type': 'text/html' });
      response.end(request.url === '/' ? page : 'not found');
    });
    const result = await new DASTScanner(config, memory).scanUrl(url, { activeScanning: true });
    expect(result.success && { status: result.value.status, failed: result.value.failedRequests, error: result.value.error })
      .toEqual({ status: 'complete', failed: [], error: undefined });
  });

  it.each(['not a url', 'ftp://127.0.0.1/'])('rejects the invalid target %j without a synthetic finding', async target => {
    const scanner = new DASTScanner(config, memory);
    for (const result of [await scanner.scanUrl(target), await scanner.scanAuthenticated(target, { type: 'bearer', token: 'fixture' })]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toMatchObject({ code: 'DAST_INVALID_TARGET' });
    }
    expect(await stored()).toEqual([]);
  });

  it('labels an analysis bug DAST_ANALYSIS_FAILED, not a request failure', async () => {
    const headers = { get: () => { throw new TypeError('fixture analysis bug'); } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, body: null, headers }));
    const result = await new DASTScanner(config, memory).scanUrl('http://127.0.0.1:9/');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatchObject({ code: 'DAST_ANALYSIS_FAILED' });
      expect(result.error.message).toContain('fixture analysis bug');
    }
  });

  it('tells a TLS failure apart from a closed port', async () => {
    const tlsCause = Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: tlsCause })));
    const tls = await new DASTScanner(config, memory).scanUrl('https://127.0.0.1:9/');
    expect(!tls.success && tls.error).toMatchObject({ code: 'DAST_TLS_FAILED', message: expect.stringContaining('DEPTH_ZERO_SELF_SIGNED_CERT') });
    const refusedCause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed', { cause: refusedCause })));
    const refused = await new DASTScanner(config, memory).scanUrl('http://127.0.0.1:9/');
    expect(!refused.success && refused.error).toMatchObject({ code: 'DAST_REQUEST_FAILED', message: expect.stringContaining('ECONNREFUSED') });
  });
});

describe('security audit DAST phase reports what it could not scan (#1052)', () => {
  let server: Server | undefined;
  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
  });
  async function serve(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
    server = createServer(handler);
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback port');
    return `http://127.0.0.1:${address.port}/`;
  }

  it('returns a failed result with the reason for an unreachable target', async () => {
    const target = await serve(() => undefined);
    await new Promise<void>(resolve => server!.close(() => resolve()));
    server = undefined;
    const result = await performDASTScan(target);
    expect(result).toMatchObject({ status: 'failed', vulnerabilities: [], crawledUrls: 0 });
    expect(result.error).toMatch(/^DAST_REQUEST_FAILED: .*ECONNREFUSED/);
  });

  it.each([[429, 'DAST_RATE_LIMITED'], [503, 'DAST_TARGET_UNAVAILABLE'], [401, 'DAST_AUTHENTICATION_FAILED']] as const)(
    'fails on an initial HTTP %i instead of scoring the error page', async (status, code) => {
      const target = await serve((_request, response) => { response.writeHead(status); response.end('error'); });
      const result = await performDASTScan(target);
      expect(result).toMatchObject({ status: 'failed', vulnerabilities: [] });
      expect(result.error).toContain(code);
    });

  it('fails an invalid target without a synthetic finding', async () => {
    const result = await performDASTScan('not a url');
    expect(result).toMatchObject({ status: 'failed', vulnerabilities: [] });
    expect(result.error).toContain('DAST_INVALID_TARGET');
  });

  it('keeps findings and lists dropped probes as incomplete', async () => {
    const target = await serve((request, response) => {
      if (request.url === '/.env') return request.socket.destroy();
      response.writeHead(request.url === '/' ? 200 : 404);
      response.end('ok');
    });
    const result = await performDASTScan(target);
    expect(result.status).toBe('incomplete');
    expect(result.failedRequests).toEqual([expect.objectContaining({ url: `${target}.env`, code: 'DAST_REQUEST_FAILED' })]);
    expect(result.vulnerabilities).toContainEqual(expect.objectContaining({ title: 'Insecure HTTP Protocol' }));
  });
});
