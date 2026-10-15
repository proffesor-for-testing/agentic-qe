/**
 * #1049: SecurityAuditorService (the audit path's OSV lookup) reports a failed
 * or partial advisory lookup as failed/incomplete with the unchecked packages,
 * never as a dependency scan with no vulnerabilities. Local OSV stub; no network.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import { OSVClient } from '../../../../src/shared/security/osv-client';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../src/shared/value-objects';

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
let manifest: FilePath;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => handler(req, body, res));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  root = mkdtempSync(path.join(tmpdir(), 'aqe-1049-auditor-'));
  const file = path.join(root, 'package.json');
  writeFileSync(file, JSON.stringify({ dependencies: { lodash: '4.17.15', 'left-pad': '1.3.0' } }));
  manifest = { value: file, filename: 'package.json' } as FilePath;
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

function auditor() {
  const memory = { set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) } as unknown as MemoryBackend;
  const service = new SecurityAuditorService(memory, {},
    new OSVClient({ baseUrl, retries: 0, timeout: 500, enableCache: false, batchSize: 1 }));
  // The registry lookup is out of scope here; a failed one must not be an "outdated" claim.
  vi.spyOn(service as any, 'getLatestVersion').mockResolvedValue('unknown');
  return { service, memory };
}

describe('SecurityAuditorService OSV failures (#1049)', () => {
  it('OSV error: scanDependencies is failed with both packages unchecked, not a clean result', async () => {
    handler = (_req, _body, res) => json(res, 500, {});
    const { service, memory } = auditor();
    const result = await service.scanDependencies(manifest);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value).toMatchObject({ status: 'failed', measured: false, packagesChecked: 0 });
    expect(result.value.uncheckedPackages.map((p) => p.name).sort()).toEqual(['left-pad', 'lodash']);
    expect(result.value.error).toMatch(/could not be checked.*500/);
    expect((memory.set as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ status: 'failed', measured: false });
  });

  it('a failed registry lookup does not report the package as outdated', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] });
    const { service } = auditor();
    const result = await service.scanDependencies(manifest);
    expect(result.success && result.value.outdatedPackages).toEqual([]);
    expect(result.success && result.value.status).toBe('complete');
  });

  it('partial batch: lodash finding kept, left-pad unchecked, status incomplete', async () => {
    handler = (req, body, res) => {
      if (req.url === '/v1/querybatch') {
        const name = (JSON.parse(body) as { queries: Array<{ package: { name: string } }> }).queries[0].package.name;
        return name === 'lodash' ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }] }) : json(res, 429, {});
      }
      return json(res, 200, ADVISORY);
    };
    const { service } = auditor();
    const result = await service.scanDependencies(manifest);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.status).toBe('incomplete');
    expect(result.value.vulnerabilities).toEqual([expect.objectContaining({ cveId: 'CVE-2021-23337', severity: 'high' })]);
    expect(result.value.uncheckedPackages).toEqual([expect.objectContaining({ name: 'left-pad' })]);
  });

  it('#1057: a workspace root audit is incomplete with the "members not scanned" reason, never complete', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] });
    const ws = mkdtempSync(path.join(tmpdir(), 'aqe-1049-auditor-ws-'));
    try {
      const file = path.join(ws, 'package.json');
      writeFileSync(file, JSON.stringify({ workspaces: ['packages/*'], dependencies: { 'left-pad': '1.3.0' } }));
      const { service } = auditor();
      const result = await service.scanDependencies({ value: file, filename: 'package.json' } as FilePath);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value).toMatchObject({ status: 'incomplete', measured: false, packagesChecked: 1 });
      expect(result.value.uncheckedPackages).toEqual([expect.objectContaining({ reason: expect.stringContaining('#1057') })]);
    } finally {
      rmSync(ws, { recursive: true, force: true });
    }
  });

  it('checkPackage returns an error, not an empty vulnerability list, when OSV fails', async () => {
    handler = (_req, _body, res) => { res.writeHead(200); res.end('<html>oops'); };
    const { service } = auditor();
    const result = await service.checkPackage('lodash', '4.17.15', 'npm');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/could not be checked/);
  });
});
