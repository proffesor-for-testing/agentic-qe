import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { DASTScanner } from '../../../src/domains/security-compliance/services/scanners/dast-scanner';
import { scanSensitiveFiles, analyzeCORS, extractAndCrawlLinks, testXSS, testSQLi, testAuthorizationBypass, testIDOR } from '../../../src/domains/security-compliance/services/scanners/dast-helpers';
import { createMemoryBackend } from '../../../src/kernel/memory-factory';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import type { SecurityScannerConfig } from '../../../src/domains/security-compliance/services/scanners/scanner-types';

const config: SecurityScannerConfig = {
  defaultRuleSets: ['owasp-top-10'], maxConcurrentScans: 4, timeout: 1000,
  enableFalsePositiveDetection: false, dastMaxDepth: 1, dastActiveScanning: false,
  enableLLMAnalysis: false, llmModelTier: 4,
};

describe('DAST execution completeness on owned loopback targets', () => {
  let memory: MemoryBackend;
  let server: Server;
  let url: string;
  beforeEach(async () => {
    ({ backend: memory } = await createMemoryBackend({ type: 'memory' }, true));
  });
  afterEach(async () => {
    server?.closeAllConnections();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    await memory.dispose();
  });
  async function serve(handler: (path: string, response: ServerResponse) => void) {
    server = createServer((request, response) => handler(request.url!, response));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback port');
    url = `http://127.0.0.1:${address.port}`;
  }
  async function assertFailed(scanner: DASTScanner, result: Awaited<ReturnType<DASTScanner['scanUrl']>>, code: string) {
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatchObject({ code });
    expect([...scanner['activeScans'].values()]).toEqual(['failed']);
    expect(await memory.search('security:scan:*', 100, { namespace: 'security-compliance' })).toEqual([]);
  }

  it.each([401, 403, 500, 503])('fails unauthenticated initial HTTP %i without storing a completed scan', async status => {
    await serve((_path, response) => { response.writeHead(status); response.end('unavailable'); });
    const scanner = new DASTScanner(config, memory);
    await assertFailed(scanner, await scanner.scanUrl(url), status < 500 ? 'DAST_AUTHENTICATION_FAILED' : 'DAST_TARGET_UNAVAILABLE');
  });

  it.each([500, 503])('fails authenticated initial HTTP %i', async status => {
    await serve((_path, response) => { response.writeHead(status); response.end('unavailable'); });
    const scanner = new DASTScanner(config, memory);
    await assertFailed(scanner, await scanner.scanAuthenticated(url, { type: 'bearer', token: 'fixture' }), 'DAST_TARGET_UNAVAILABLE');
  });

  // #1135: the findings from the initial response are kept; the scan is incomplete, not discarded.
  it('reports the scan incomplete when the target disappears after its initial response', async () => {
    await serve((path, response) => {
      if (path === '/') response.end('<html><a href="/next">next</a></html>');
      else response.destroy();
    });
    const scanner = new DASTScanner(config, memory);
    const result = await scanner.scanUrl(url, { activeScanning: true });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.status).toBe('incomplete');
    expect(result.value.failedRequests.length).toBeGreaterThan(0);
    expect(result.value.failedRequests.every(failure => failure.code === 'DAST_REQUEST_FAILED')).toBe(true);
    expect(result.value.failedRequests.map(failure => failure.url)).toContain(`${url}/next`);
    expect(result.value.vulnerabilities).toContainEqual(expect.objectContaining({ title: 'Missing HSTS Header' }));
  });

  it('retains successful scans when optional paths respond with HTTP 404', async () => {
    await serve((path, response) => {
      response.writeHead(path === '/' ? 200 : 404);
      response.end(path === '/' ? '<html>healthy</html>' : 'not found');
    });
    const scanner = new DASTScanner(config, memory);
    const result = await scanner.scanUrl(url, { activeScanning: true });
    expect(result.success).toBe(true);
    if (result.success) expect(await scanner.getScanStatus(result.value.scanId)).toBe('completed');
  });

  const payloads = [{ payload: 'fixture', name: 'fixture' }];
  it.each([
    ['sensitive files', () => scanSensitiveFiles(new URL(url), 0, 1, [])],
    ['CORS', () => analyzeCORS(url, [])],
    ['link crawl', () => extractAndCrawlLinks('<a href="/next">next</a>', new URL(url), 0, 1, [])],
    ['XSS', () => testXSS(url, new URL(url), 'q', payloads, [])],
    ['SQL injection', () => testSQLi(url, new URL(url), 'q', payloads, [])],
    ['authorization', () => testAuthorizationBypass(new URL(url), {}, 0, 1, [])],
    ['IDOR', () => testIDOR(new URL(url), {}, 0, 1, [])],
  ] as const)('propagates a %s follow-up transport failure', async (_name, probe) => {
    await serve((_path, response) => response.destroy());
    await expect(probe()).rejects.toThrow();
  });
});
