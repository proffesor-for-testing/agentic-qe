/**
 * #1049: the scan-security task (MCP security_scan_comprehensive) with
 * dependencies:true reports a failed or partial OSV lookup as an incomplete
 * scan with the unchecked packages, never as a completed scan with zero
 * dependency vulnerabilities. Real DependencyScanner + OSVClient against a
 * local stub of the OSV endpoint; no real network.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { registerSecurityHandlers } from '../../../../src/coordination/handlers/security-handlers';
// Side-effect import: domain-handler-configs is in a circular import with domain-handlers.
import '../../../../src/mcp/handlers/domain-handlers';
import { securityScanConfig } from '../../../../src/mcp/handlers/domain-handler-configs';
import { DependencyScanner } from '../../../../src/domains/security-compliance/services/scanners/dependency-scanner';
import { OSVClient } from '../../../../src/shared/security/osv-client';
import type { TaskHandlerContext } from '../../../../src/coordination/handlers/handler-types';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const ADVISORY = {
  id: 'GHSA-35jh-r3h4-6jhm', summary: 'Command Injection in lodash', details: 'template injection',
  aliases: ['CVE-2021-23337'], modified: '2024-01-01T00:00:00Z', database_specific: { severity: 'HIGH' },
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
};

let server: Server;
let baseUrl: string;
let handler: Handler;
let root: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, body, res));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  root = mkdtempSync(path.join(tmpdir(), 'aqe-1049-mcp-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { lodash: '4.17.15', 'left-pad': '1.3.0' } }));
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
};

const memory = {
  get: vi.fn(), set: vi.fn(), delete: vi.fn(), exists: vi.fn(), search: vi.fn().mockResolvedValue([]),
  clear: vi.fn(), keys: vi.fn(), getStats: vi.fn(),
} as unknown as MemoryBackend;

async function runScanSecurity(payload: Record<string, unknown>, target?: string) {
  let scanSecurity: ((task: { payload: unknown }) => Promise<unknown>) | undefined;
  const scanner = new DependencyScanner({
    defaultRuleSets: [], maxConcurrentScans: 1, timeout: 1000, enableFalsePositiveDetection: false, dastMaxDepth: 1,
    dastActiveScanning: false, enableLLMAnalysis: false, llmModelTier: 1, enableSemgrep: false,
  }, memory, undefined, new OSVClient({ baseUrl, retries: 0, timeout: 500, enableCache: false, batchSize: 1 }));
  const ctx = {
    registerHandler: (type: string, fn: typeof scanSecurity) => { if (type === 'scan-security') scanSecurity = fn; },
    getSecurityScanner: () => scanner,
  } as unknown as TaskHandlerContext;
  registerSecurityHandlers(ctx);
  const result = await scanSecurity!({ payload: { target: root, sast: false, dast: false, compliance: [], ...payload, ...(target ? { target } : {}) } }) as
    { success: true; value: Record<string, unknown> } | { success: false; error: Error };
  expect(result.success).toBe(true);
  const data = (result as { value: Record<string, unknown> }).value;
  return { data, mcp: securityScanConfig.mapToResult('task-1', data, 1) };
}

describe('scan-security dependency advisories (#1049)', () => {
  it('OSV unreachable (HTTP 500): status unavailable, dependency scan failed, never 0-and-complete', async () => {
    handler = (_req, _body, res) => json(res, 500, {});
    const { mcp } = await runScanSecurity({ dependencies: true });

    expect(mcp.status).toBe('unavailable');
    expect(mcp.dependencyScan).toMatchObject({ status: 'failed', measured: false, packagesChecked: 0 });
    expect(mcp.dependencyScan!.uncheckedPackages.map((p) => p.name).sort()).toEqual(['left-pad', 'lodash']);
    expect(mcp.dependencyScan!.message).toMatch(/could not be checked/);
    expect(mcp.recommendations[0]).toMatch(/could not be checked/);
    const engine = mcp.evidence!.engines.find((e) => e.id === 'osv-dependency-advisories');
    expect(engine).toMatchObject({ required: true, status: 'failed' });
  });

  it('partial batch: real lodash finding reported, left-pad unchecked, status partial', async () => {
    handler = (req, body, res) => {
      if (req.url === '/v1/querybatch') {
        const name = (JSON.parse(body) as { queries: Array<{ package: { name: string } }> }).queries[0].package.name;
        return name === 'lodash' ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }] }) : json(res, 429, {});
      }
      return json(res, 200, ADVISORY);
    };
    const { mcp } = await runScanSecurity({ dependencies: true });

    expect(mcp.status).toBe('partial');
    expect(mcp.high).toBe(1);
    expect(mcp.dependencyScan).toMatchObject({ status: 'incomplete', packagesChecked: 1, vulnerabilities: 1 });
    expect(mcp.dependencyScan!.uncheckedPackages).toEqual([expect.objectContaining({ name: 'left-pad', reason: expect.stringMatching(/429/) })]);
  });

  it('clean complete lookup: completed with zero dependency findings', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] });
    const { mcp } = await runScanSecurity({ dependencies: true });
    expect(mcp.status).toBe('completed');
    expect(mcp.vulnerabilities).toBe(0);
    expect(mcp.dependencyScan).toMatchObject({ status: 'complete', measured: true, packagesChecked: 2, uncheckedPackages: [] });
  });

  it('#1057: a workspace root is partial, with the "members not scanned" reason in the report and the engine errors', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'aqe-1049-mcp-ws-'));
    try {
      writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'mono', dependencies: { 'left-pad': '1.3.0' } }));
      writeFileSync(path.join(ws, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
      handler = (_req, _body, res) => json(res, 200, { results: [{}] });
      const { mcp } = await runScanSecurity({ dependencies: true }, ws);
      expect(mcp.status).toBe('partial');
      expect(mcp.dependencyScan).toMatchObject({ status: 'incomplete', measured: false, packagesChecked: 1, vulnerabilities: 0 });
      expect(mcp.dependencyScan!.resolutionErrors).toEqual([expect.stringContaining('not scanned yet (#1057); scan each member directory separately')]);
      expect(mcp.dependencyScan!.message).toMatch(/#1057.*INCOMPLETE, not clean/);
      const engine = mcp.evidence!.engines.find((e) => e.id === 'osv-dependency-advisories');
      expect(engine).toMatchObject({ status: 'partial', errors: expect.arrayContaining([expect.stringContaining('#1057')]) });
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('dependencies not requested: no OSV request is made', async () => {
    const seen: string[] = [];
    handler = (req, _body, res) => { seen.push(req.url ?? ''); json(res, 200, { results: [{}] }); };
    const { mcp } = await runScanSecurity({});
    expect(seen).toEqual([]);
    expect(mcp.dependencyScan).toBeUndefined();
  });

  it('rejects a non-boolean dependencies parameter', () => {
    expect(() => securityScanConfig.mapToPayload({ dependencies: 'yes' as unknown as boolean })).toThrow(/dependencies must be a boolean/);
  });
});
