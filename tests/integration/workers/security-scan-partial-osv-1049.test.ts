/**
 * #1049 review round 2, item 3 — end to end, real composition:
 * fleet_init → security_scan_comprehensive {dependencies:true} (real
 * DependencyScanner + OSVClient against a local OSV stub where left-pad's
 * entry is truncated, so the scan is genuinely incomplete) → the daemon's
 * security-scan worker on the same kernel memory.
 *
 * The worker must relay the checked package's real advisory (a medium one)
 * and report the dependency totals as unmeasured, naming left-pad.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleFleetInit, disposeFleet } from '../../../src/mcp/handlers/core-handlers';
import { handleSecurityScan, resetTaskExecutor } from '../../../src/mcp/handlers/domain-handlers';
import { getDaemon, resetDaemon } from '../../../src/workers/daemon';
import { resetUnifiedPersistence } from '../../../src/kernel/unified-persistence';

const ADVISORY = {
  id: 'GHSA-29mw-wpgm-hmr9', summary: 'Regular Expression Denial of Service (ReDoS) in lodash',
  details: 'lodash prior to 4.17.21 is vulnerable to ReDoS.', aliases: ['CVE-2020-28500'],
  modified: '2025-09-29T21:12:31Z', database_specific: { severity: 'MODERATE' },
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '4.0.0' }, { fixed: '4.17.21' }] }] }],
};

// Both kernel backends: the default hybrid (sqlite, DB inside the temp project)
// and the in-memory one, whose namespaced search returns `<ns>:<key>`.
describe.each([
  ['hybrid (default)', {}],
  ['memory', { memoryBackend: 'memory' as const }],
])('#1049 item 3 [%s backend]: a real partial OSV scan stays partial in the security-scan worker', { timeout: 120000 }, (_name, fleetParams) => {
  const saved = { url: process.env.AQE_OSV_API_URL, root: process.env.AQE_PROJECT_ROOT };
  let server: Server;
  let project: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (req.url === '/v1/querybatch') {
          const qs = (JSON.parse(body) as { queries: Array<{ package: { name: string } }> }).queries;
          return res.end(JSON.stringify({ results: qs.map((q) => (q.package.name === 'lodash'
            ? { vulns: [{ id: ADVISORY.id }] } : { vulns: [{ id: 'GHSA-xxxx' }], next_page_token: 'more' })) }));
        }
        return res.end(JSON.stringify(ADVISORY));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    project = mkdtempSync(path.join(tmpdir(), 'aqe-1049-worker-'));
    writeFileSync(path.join(project, 'package.json'), JSON.stringify({ dependencies: { lodash: '4.17.15', 'left-pad': '1.3.0' } }));
    process.env.AQE_OSV_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.AQE_PROJECT_ROOT = project;
    await disposeFleet();
    resetDaemon();
    expect((await handleFleetInit(fleetParams)).success).toBe(true);
  });

  afterAll(async () => {
    resetTaskExecutor();
    await disposeFleet();
    resetDaemon();
    resetUnifiedPersistence();
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
    if (saved.url === undefined) delete process.env.AQE_OSV_API_URL; else process.env.AQE_OSV_API_URL = saved.url;
    if (saved.root === undefined) delete process.env.AQE_PROJECT_ROOT; else process.env.AQE_PROJECT_ROOT = saved.root;
    rmSync(project, { recursive: true, force: true });
  });

  it('scan is incomplete; the worker relays the checked advisory and keeps totals unmeasured', async () => {
    const scan = await handleSecurityScan({ target: project, sast: false, dependencies: true, saveResults: false });
    expect(scan.success).toBe(true);
    expect(scan.data!.dependencyScan).toMatchObject({ status: 'incomplete', measured: false, packagesChecked: 1 });

    const workerManager = (getDaemon() as unknown as { workerManager: { runNow(id: string): Promise<{
      success: boolean; findings: Array<{ type: string; severity: string; description: string; context?: Record<string, unknown> }>;
      metrics: { healthScore: number; domainMetrics: Record<string, unknown> };
    }> } }).workerManager;
    const result = await workerManager.runNow('security-scan');

    expect(result.success).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({
      type: 'medium-vulnerability', severity: 'medium',
      context: expect.objectContaining({ cve: 'CVE-2020-28500', partialScan: true }),
    }));
    const incomplete = result.findings.find((f) => f.type === 'dependency-scan-incomplete');
    expect(incomplete?.description).toMatch(/left-pad@1\.3\.0/);
    expect(result.metrics.domainMetrics).toMatchObject({
      dependencyScan: 'unmeasured', dependencyVulnerabilities: 'unmeasured',
      dependencyVulnerabilitiesInCheckedPackages: 1, dependencyPackagesUnchecked: 1,
    });
  });
});
