/**
 * #1049 review round 2 (B2): a range spec is never checked as a guessed
 * version. DependencyScanner.scanPackageJson checks the lockfile-resolved
 * version when a lockfile exists; otherwise a range is an unchecked package
 * and the scan is incomplete. Local OSV stub; no real network.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DependencyScanner } from '../../../../../src/domains/security-compliance/services/scanners/dependency-scanner';
import { fromNpmLock, fromPnpmLock, fromYarnLock } from '../../../../../src/domains/security-compliance/services/scanners/lockfile-versions';
import { OSVClient } from '../../../../../src/shared/security/osv-client';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { SecurityScannerConfig } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

/** Seven lodash advisories that affect 4.17.11 (as /v1/query reports), incl. the critical CVE-2019-10744. */
const advisory = (id: string, cve: string, fixed: string, severity: string) => ({
  id, summary: `${cve} in lodash`, aliases: [cve], modified: '2024-01-01T00:00:00Z', database_specific: { severity },
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed }] }] }],
});
const LODASH_4_17_11 = [
  advisory('GHSA-jf85-cpcp-j695', 'CVE-2019-10744', '4.17.12', 'CRITICAL'),
  advisory('GHSA-p6mc-m468-83gw', 'CVE-2020-8203', '4.17.19', 'HIGH'),
  advisory('GHSA-35jh-r3h4-6jhm', 'CVE-2021-23337', '4.17.21', 'HIGH'),
  advisory('GHSA-r5fr-rjxr-66jc', 'CVE-2021-23337', '4.18.0', 'HIGH'),
  advisory('GHSA-29mw-wpgm-hmr9', 'CVE-2020-28500', '4.17.21', 'MODERATE'),
  advisory('GHSA-f23m-r3pf-42rh', 'CVE-2025-13465', '4.18.0', 'MODERATE'),
  advisory('GHSA-xxjr-mmjv-4gpg', 'CVE-2025-13465', '4.17.23', 'MODERATE'),
];

let server: Server;
let baseUrl: string;
let queried: string[];
const dirs: string[] = [];

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      if (req.url === '/v1/querybatch') {
        const queries = (JSON.parse(body) as { queries: Array<{ package: { name: string; version: string } }> }).queries;
        queried.push(...queries.map((q) => `${q.package.name}@${q.package.version}`));
        return send(200, { results: queries.map((q) => (q.package.name === 'lodash' && q.package.version === '4.17.11'
          ? { vulns: LODASH_4_17_11.map((a) => ({ id: a.id })) } : {})) });
      }
      const id = decodeURIComponent((req.url ?? '').slice('/v1/vulns/'.length));
      const found = LODASH_4_17_11.find((a) => a.id === id);
      return found ? send(200, found) : send(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((r) => server.close(() => r()));
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const config: SecurityScannerConfig = {
  defaultRuleSets: [], maxConcurrentScans: 1, timeout: 10000, enableFalsePositiveDetection: false,
  dastMaxDepth: 1, dastActiveScanning: false, enableLLMAnalysis: false, llmModelTier: 1, enableSemgrep: false,
};

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aqe-1049-lock-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return path.join(dir, 'package.json');
}

async function scan(manifest: string) {
  queried = [];
  const memory = { set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) } as unknown as MemoryBackend;
  const scanner = new DependencyScanner(config, memory, undefined, new OSVClient({ baseUrl, retries: 0, enableCache: false }));
  const result = await scanner.scanPackageJson(manifest);
  expect(result.success).toBe(true);
  return (result as { value: Awaited<ReturnType<DependencyScanner['scanDependencies']>> extends infer R ? R extends { value: infer V } ? V : never : never }).value;
}

const npmLock = (versions: Record<string, string>) => JSON.stringify({
  lockfileVersion: 3,
  packages: Object.fromEntries([['', {}], ...Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }])]),
});

describe('B2: ranges are resolved from the lockfile or reported unchecked (#1049)', () => {
  it('"<4.17.12" with no lockfile: unchecked ("version range, no lockfile resolution"), never checked as 4.17.12', async () => {
    const value = await scan(project({ 'package.json': JSON.stringify({ dependencies: { lodash: '<4.17.12' } }) }));
    expect(queried).toEqual([]);
    expect(value).toMatchObject({ status: 'failed', measured: false, packagesChecked: 0, lockfile: null });
    expect(value.uncheckedPackages).toEqual([{ name: 'lodash', version: '<4.17.12', reason: 'version range "<4.17.12", no lockfile resolution' }]);
  });

  it('"<4.17.12" with a package-lock pinning 4.17.11: 7 findings including critical CVE-2019-10744', async () => {
    const value = await scan(project({
      'package.json': JSON.stringify({ dependencies: { lodash: '<4.17.12' } }),
      'package-lock.json': npmLock({ lodash: '4.17.11' }),
    }));
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value).toMatchObject({ status: 'complete', measured: true, lockfile: 'package-lock.json' });
    expect(value.vulnerabilities).toHaveLength(7);
    expect(value.vulnerabilities).toContainEqual(expect.objectContaining({ cveId: 'CVE-2019-10744', severity: 'critical' }));
  });

  it('"^4.17.15" with a lockfile: the lockfile version is the one checked', async () => {
    const value = await scan(project({
      'package.json': JSON.stringify({ dependencies: { lodash: '^4.17.15' } }),
      'package-lock.json': npmLock({ lodash: '4.17.21' }),
    }));
    expect(queried).toEqual(['lodash@4.17.21']);
    expect(value.status).toBe('complete');
  });

  it('a range the lockfile does not resolve stays unchecked and makes the scan incomplete', async () => {
    const value = await scan(project({
      'package.json': JSON.stringify({ dependencies: { lodash: '4.17.11', other: '>4.17.4' } }),
      'package-lock.json': npmLock({ lodash: '4.17.11' }),
    }));
    expect(value.status).toBe('incomplete');
    expect(value.uncheckedPackages).toEqual([expect.objectContaining({ name: 'other', reason: expect.stringMatching(/no lockfile resolution/) })]);
  });

  it('item 5: a package.json with no dependencies is a complete scan of nothing (measured zero)', async () => {
    const value = await scan(project({ 'package.json': JSON.stringify({ name: 'no-deps' }) }));
    expect(queried).toEqual([]);
    expect(value).toMatchObject({ status: 'complete', measured: true, packagesScanned: 0, packagesChecked: 0, uncheckedPackages: [] });
  });
});

describe('lockfile readers', () => {
  it('package-lock v1 and v3', () => {
    expect(fromNpmLock(JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.11' } } }), ['lodash'])).toEqual({ lodash: '4.17.11' });
    expect(fromNpmLock(npmLock({ lodash: '4.17.21', '@scope/x': '1.0.0' }), ['lodash', '@scope/x', 'missing'])).toEqual({ lodash: '4.17.21', '@scope/x': '1.0.0' });
  });

  it('pnpm-lock.yaml with importers (v6/v9) and the older top-level layout', () => {
    const v9 = [
      "lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', '      lodash:',
      '        specifier: ^4.17.15', '        version: 4.17.21', "      '@scope/x':", '        specifier: ^1.0.0',
      '        version: 1.2.0(react@18.2.0)', '    devDependencies:', '      vitest:', '        specifier: ^1.0.0',
      '        version: 1.6.0', '', '  packages/other:', '    dependencies:', '      lodash:', '        specifier: 3.0.0',
      '        version: 3.0.0', '', 'packages:', '', '  lodash@4.17.21:', '    resolution: {integrity: sha512-x}',
    ].join('\n');
    expect(fromPnpmLock(v9, ['lodash', '@scope/x', 'vitest'])).toEqual({ lodash: '4.17.21', '@scope/x': '1.2.0', vitest: '1.6.0' });
    const v5 = ['lockfileVersion: 5.4', '', 'specifiers:', '  lodash: ^4.17.15', '', 'dependencies:', '  lodash: 4.17.21_abc', ''].join('\n');
    expect(fromPnpmLock(v5, ['lodash'])).toEqual({ lodash: '4.17.21' });
  });

  it('yarn.lock classic and berry', () => {
    const classic = ['# yarn lockfile v1', '', '"lodash@^4.17.15", lodash@^4.17.0:', '  version "4.17.21"', '  resolved "https://x"', ''].join('\n');
    expect(fromYarnLock(classic, { lodash: '^4.17.15' })).toEqual({ lodash: '4.17.21' });
    const berry = ['__metadata:', '  version: 6', '', '"lodash@npm:^4.17.15":', '  version: 4.17.21', '  resolution: "lodash@npm:4.17.21"', ''].join('\n');
    expect(fromYarnLock(berry, { lodash: '^4.17.15' })).toEqual({ lodash: '4.17.21' });
  });
});
