/**
 * #1049: DependencyScanner records a failed or partial OSV lookup as
 * incomplete/failed (measured: false) with the unchecked packages and the
 * error, never as a clean scan. Uses a real OSVClient against a local stub of
 * the OSV endpoint; no real network.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DependencyScanner } from '../../../../../src/domains/security-compliance/services/scanners/dependency-scanner';
import { OSVClient } from '../../../../../src/shared/security/osv-client';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { SecurityScannerConfig } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const ADVISORY = {
  id: 'GHSA-35jh-r3h4-6jhm',
  summary: 'Command Injection in lodash',
  details: 'Command Injection via template.',
  aliases: ['CVE-2021-23337'],
  modified: '2024-01-01T00:00:00Z',
  severity: [{ type: 'CVSS_V3', score: '7.2' }],
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
  references: [],
};

let server: Server;
let baseUrl: string;
let handler: Handler;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, body, res));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
});

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

const config: SecurityScannerConfig = {
  defaultRuleSets: [], maxConcurrentScans: 1, timeout: 10000, enableFalsePositiveDetection: false,
  dastMaxDepth: 1, dastActiveScanning: false, enableLLMAnalysis: false, llmModelTier: 1, enableSemgrep: false,
};

function createMemory(): MemoryBackend & { set: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
    exists: vi.fn().mockResolvedValue(false),
    search: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
  } as unknown as MemoryBackend & { set: ReturnType<typeof vi.fn> };
}

function scannerFor(memory: MemoryBackend, overrides: Record<string, unknown> = {}) {
  return new DependencyScanner(config, memory, undefined,
    new OSVClient({ baseUrl, retries: 0, timeout: 500, enableCache: false, ...overrides }));
}

const storedRecord = (memory: { set: ReturnType<typeof vi.fn> }) => {
  const call = memory.set.mock.calls.find((c) => String(c[0]).startsWith('security:scan:'));
  expect(call).toBeDefined();
  return call![1] as Record<string, unknown>;
};

const DEPS = { lodash: '4.17.15', 'left-pad': '^1.3.0' };
const LOCKED = { 'left-pad': '1.3.0' };

describe('DependencyScanner records OSV failures as unmeasured (#1049)', () => {
  let memory: ReturnType<typeof createMemory>;
  beforeEach(() => { memory = createMemory(); });

  it.each([
    ['HTTP 429', (_r: IncomingMessage, _b: string, res: ServerResponse) => json(res, 429, { message: 'slow down' }), /429/],
    ['HTTP 500', (_r: IncomingMessage, _b: string, res: ServerResponse) => json(res, 500, {}), /500/],
    ['malformed JSON', (_r: IncomingMessage, _b: string, res: ServerResponse) => { res.writeHead(200); res.end('not json'); }, /malformed/i],
    ['timeout', () => { /* never respond */ }, /TIMEOUT/],
  ])('%s: the scan is failed, not clean, and the record says so', async (_name, h, reason) => {
    handler = h as Handler;
    const result = await scannerFor(memory).scanDependencies(DEPS);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.status).toBe('failed');
    expect(result.value.measured).toBe(false);
    expect(result.value.packagesChecked).toBe(0);
    expect(result.value.uncheckedPackages.map((p) => p.name).sort()).toEqual(['left-pad', 'lodash']);
    expect(result.value.error).toMatch(reason);

    const record = storedRecord(memory);
    expect(record).toMatchObject({
      scanType: 'dependency', status: 'failed', measured: false, advisorySource: 'osv',
      packagesRequested: 2, packagesChecked: 0,
    });
    expect(record.uncheckedPackages).toHaveLength(2);
    expect(String(record.error)).toMatch(reason);
  });

  it('network error: the scan is failed with the connection error recorded', async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const scanner = new DependencyScanner(config, memory, undefined,
      new OSVClient({ baseUrl: `http://127.0.0.1:${port}`, retries: 0, enableCache: false }));

    const result = await scanner.scanDependencies(DEPS);
    expect(result.success && result.value.status).toBe('failed');
    expect(storedRecord(memory)).toMatchObject({ status: 'failed', measured: false });
  });

  it('partial batch: real findings for the checked chunk, unchecked packages listed, status incomplete', async () => {
    handler = (req, body, res) => {
      if (req.url === '/v1/querybatch') {
        const name = (JSON.parse(body) as { queries: Array<{ package: { name: string } }> }).queries[0].package.name;
        return name === 'lodash'
          ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }] })
          : json(res, 502, {});
      }
      return json(res, 200, ADVISORY);
    };
    const result = await scannerFor(memory, { batchSize: 1 }).scanDependencies(DEPS);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.status).toBe('incomplete');
    expect(result.value.measured).toBe(false);
    expect(result.value.packagesChecked).toBe(1);
    expect(result.value.vulnerabilities).toHaveLength(1);
    expect(result.value.vulnerabilities[0]).toMatchObject({ cveId: 'CVE-2021-23337', severity: 'high' });
    expect(result.value.uncheckedPackages).toEqual([expect.objectContaining({ name: 'left-pad', version: '^1.3.0' })]);

    const record = storedRecord(memory);
    expect(record).toMatchObject({ status: 'incomplete', measured: false, packagesChecked: 1 });
    expect((record.summary as { high: number }).high).toBe(1);
  });

  it('fully successful clean scan: complete, measured, zero findings', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}, {}] });
    // left-pad is declared as a range; the lockfile resolution makes it checkable (#1049 round 2).
    const result = await scannerFor(memory).scanDependencies(DEPS, LOCKED);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ status: 'complete', measured: true, packagesChecked: 2, uncheckedPackages: [] });
    expect(result.value.vulnerabilities).toEqual([]);
    expect(result.value.error).toBeUndefined();
    expect(storedRecord(memory)).toMatchObject({ status: 'complete', measured: true, uncheckedPackages: [] });
  });

  it('successful scan with findings: complete and measured, findings recorded', async () => {
    handler = (req, _body, res) => req.url === '/v1/querybatch'
      ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }, {}] })
      : json(res, 200, ADVISORY);
    const result = await scannerFor(memory).scanDependencies(DEPS, LOCKED);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ status: 'complete', measured: true, vulnerablePackages: 1 });
    expect(result.value.vulnerabilities[0]).toMatchObject({ cveId: 'CVE-2021-23337' });
    expect(storedRecord(memory)).toMatchObject({ status: 'complete', measured: true });
  });
});
