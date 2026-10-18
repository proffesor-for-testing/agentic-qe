/** #1052: unreachable targets are failed DAST executions, not clean scans. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { DASTScanner } from '../../../../../src/domains/security-compliance/services/scanners/dast-scanner';
import { SecurityScannerService } from '../../../../../src/domains/security-compliance/services/scanners/scanner-orchestrator';
import { InMemoryBackend } from '../../../../../src/kernel/memory-backend';
import { registerSecurityHandlers } from '../../../../../src/coordination/handlers/security-handlers';
import type { InstanceTaskHandler, TaskHandlerContext } from '../../../../../src/coordination/handlers/handler-types';
import type { QueenTask } from '../../../../../src/coordination/queen-types';
import { DEFAULT_CONFIG, type ScanStatus } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';
import { ok } from '../../../../../src/shared/types';

let server: Server;
let base: string;
let unreachable: string;
beforeAll(async () => {
  server = createServer((request, response) => {
    request.resume();
    if (request.url === '/stall') return;
    response.writeHead(request.url === '/unauthorized' ? 401 : request.url === '/denied' ? 403 : 200, {
      'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Strict-Transport-Security': 'max-age=31536000',
    });
    response.end('<html><body>owned fixture</body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  base = `http://127.0.0.1:${address.port}`;
  const reserved = createSocketServer();
  await new Promise<void>(resolve => reserved.listen(0, '127.0.0.1', resolve));
  const closedAddress = reserved.address();
  if (!closedAddress || typeof closedAddress === 'string') throw new Error('Missing closed fixture address');
  unreachable = `http://127.0.0.1:${closedAddress.port}/`;
  await new Promise<void>(resolve => reserved.close(() => resolve()));
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('DAST initial request outcomes (#1052)', () => {
  let memory: InMemoryBackend;
  let statuses: Map<string, ScanStatus>;
  let scanner: DASTScanner;
  beforeEach(() => {
    memory = new InMemoryBackend();
    statuses = new Map();
    scanner = new DASTScanner({ ...DEFAULT_CONFIG, timeout: 1000, dastMaxDepth: 0, dastActiveScanning: false }, memory, statuses);
  });
  afterEach(async () => { vi.restoreAllMocks(); await memory.dispose(); });

  it.each([false, true])('fails an unreachable %s authenticated target and stores no completed scan', async (authenticated) => {
    const result = authenticated
      ? await scanner.scanAuthenticated(unreachable, { type: 'bearer', token: 'owned-test-token' })
      : await scanner.scanUrl(unreachable);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('DAST target request');
    expect([...statuses.values()]).toEqual(['failed']);
    expect(await memory.search('security:scan:*', 100, { namespace: 'security-compliance' })).toEqual([]);
  });

  it('fails a target that never sends response headers', async () => {
    const result = await scanner.scanUrl(`${base}/stall`, { timeout: 50, activeScanning: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('timeout');
    expect([...statuses.values()]).toEqual(['failed']);
  });

  it.each(['/unauthorized', '/denied'])('fails an authenticated scan rejected at %s', async (route) => {
    const result = await scanner.scanAuthenticated(`${base}${route}`, { type: 'bearer', token: 'owned-test-token' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('authentication');
    expect([...statuses.values()]).toEqual(['failed']);
  });

  it.each([false, true])('preserves reachable passive scans (authenticated=%s)', async (authenticated) => {
    const result = authenticated
      ? await scanner.scanAuthenticated(`${base}/ok`, { type: 'bearer', token: 'owned-test-token' })
      : await scanner.scanUrl(`${base}/ok`);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.crawledUrls).toBe(1);
      if (!authenticated) expect(result.value.vulnerabilities).toContainEqual(expect.objectContaining({ title: 'Insecure HTTP Protocol' }));
    }
    expect([...statuses.values()]).toEqual(['completed']);
    expect(await memory.search('security:scan:*', 100, { namespace: 'security-compliance' })).toHaveLength(1);
  });

  it('marks invalid authenticated credentials failed without a completed record', async () => {
    const result = await scanner.scanAuthenticated(`${base}/ok`, { type: 'bearer', token: '' });
    expect(result.success).toBe(false);
    expect([...statuses.values()]).toEqual(['failed']);
    expect(await memory.search('security:scan:*', 100, { namespace: 'security-compliance' })).toEqual([]);
  });

  it('does not expose target query credentials through a transport failure message', async () => {
    const result = await scanner.scanUrl(`${unreachable}?token=owned-query-secret`);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).not.toContain('owned-query-secret');
  });

  it('exposes the failed requested engine through the registered public security handler', async () => {
    let handler: InstanceTaskHandler;
    registerSecurityHandlers({ memory, getSecurityScanner: () => scanner,
      registerHandler: (_type: string, h: InstanceTaskHandler) => { handler = h; },
    } as unknown as TaskHandlerContext);
    const result = await handler!({ payload: { target: '/owned-no-source-discovery', sast: false, dast: true, targetUrl: unreachable } } as unknown as QueenTask);
    expect(result.success).toBe(true);
    if (result.success) expect((result.value as any).evidence.engines).toContainEqual(expect.objectContaining({
      id: 'dast', status: 'failed', errors: expect.arrayContaining([expect.stringContaining('DAST_REQUEST_FAILED')]),
    }));
  });

  it('does not omit a failed requested DAST phase from a successful full scan', async () => {
    const orchestrator = new SecurityScannerService(memory, { timeout: 1000, dastActiveScanning: false });
    vi.spyOn(orchestrator, 'scanWithRules').mockResolvedValue(ok({
      scanId: 'owned-sast', vulnerabilities: [], coverage: { filesScanned: 1, linesAnalyzed: 1 },
      summary: { critical: 0, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 1, scanDurationMs: 1 },
    }));
    const result = await orchestrator.runFullScan([], unreachable, { timeout: 100, activeScanning: false });
    expect(result.success).toBe(false);
  });
});
