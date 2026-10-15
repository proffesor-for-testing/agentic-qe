/**
 * #1049: dependency versions come from an in-sync lockfile or an exact spec,
 * never a guess (round 2, B2), and never from a stale lockfile (round 3).
 * Workspace members' own dependencies are scanned; local workspace packages are
 * listed as not applicable; aliases resolve to the real package. Local OSV
 * stub; no real network.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DependencyScanner } from '../../../../../src/domains/security-compliance/services/scanners/dependency-scanner';
import { parseLockfile } from '../../../../../src/domains/security-compliance/services/scanners/lockfile-versions';
import { WORKSPACE_NOT_SCANNED } from '../../../../../src/domains/security-compliance/services/scanners/dependency-resolver';
import { OSVClient } from '../../../../../src/shared/security/osv-client';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { SecurityScannerConfig, DependencyScanResult } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

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
        // The version is read at the top level of each query, as OSV does.
        const queries = (JSON.parse(body) as { queries: Array<{ package: { name: string; version?: string }; version?: string }> }).queries;
        queried.push(...queries.map((q) => `${q.package.name}@${q.version}`));
        expect(queries.every((q) => q.package.version === undefined)).toBe(true);
        return send(200, { results: queries.map((q) => (q.package.name === 'lodash' && q.version === '4.17.11'
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

/** A temp git repo with the given files; returns its root. */
function repo(files: Record<string, string | object>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'aqe-1049-lock-'));
  dirs.push(dir);
  mkdirSync(path.join(dir, '.git'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

async function scan(manifest: string): Promise<DependencyScanResult> {
  queried = [];
  const memory = { set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) } as unknown as MemoryBackend;
  const scanner = new DependencyScanner(config, memory, undefined, new OSVClient({ baseUrl, retries: 0, enableCache: false }));
  const result = await scanner.scanPackageJson(manifest);
  expect(result.success).toBe(true);
  return (result as { value: DependencyScanResult }).value;
}

/** package-lock v3 recording the root's declared specs and the installed versions. */
const npmLock = (specs: Record<string, string>, versions: Record<string, string>, extra: Record<string, object> = {}) => ({
  lockfileVersion: 3,
  packages: {
    '': { dependencies: specs },
    ...Object.fromEntries(Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }])),
    ...extra,
  },
});

describe('B2: ranges are resolved from an in-sync lockfile or reported unchecked', () => {
  it('"<4.17.12" with no lockfile: unchecked ("version range, no lockfile resolution"), never checked as 4.17.12', async () => {
    const value = await scan(path.join(repo({ 'package.json': { dependencies: { lodash: '<4.17.12' } } }), 'package.json'));
    expect(queried).toEqual([]);
    expect(value).toMatchObject({ status: 'failed', measured: false, packagesChecked: 0, lockfile: null, scope: 'direct' });
    expect(value.uncheckedPackages).toEqual([{ name: 'lodash', version: '<4.17.12', reason: 'version range "<4.17.12", no lockfile resolution' }]);
  });

  it('"<4.17.12" with a package-lock pinning 4.17.11: 7 findings including critical CVE-2019-10744', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '<4.17.12' } },
      'package-lock.json': npmLock({ lodash: '<4.17.12' }, { lodash: '4.17.11' }),
    }), 'package.json'));
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value).toMatchObject({ status: 'complete', measured: true, lockfile: 'package-lock.json' });
    expect(value.vulnerabilities).toHaveLength(7);
    expect(value.vulnerabilities).toContainEqual(expect.objectContaining({ cveId: 'CVE-2019-10744', severity: 'critical' }));
  });

  it('"^4.17.15" with an in-sync lockfile: the lockfile version is the one checked', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '^4.17.15' } },
      'package-lock.json': npmLock({ lodash: '^4.17.15' }, { lodash: '4.17.21' }),
    }), 'package.json'));
    expect(queried).toEqual(['lodash@4.17.21']);
    expect(value.status).toBe('complete');
  });

  it('a package.json with no dependencies is a complete scan of nothing (measured zero)', async () => {
    const value = await scan(path.join(repo({ 'package.json': { name: 'no-deps' } }), 'package.json'));
    expect(queried).toEqual([]);
    expect(value).toMatchObject({ status: 'complete', measured: true, packagesScanned: 0, packagesChecked: 0, uncheckedPackages: [] });
  });
});

describe('round 3 (blocking): a stale lockfile never wins over package.json', () => {
  it('npm: package.json pins 4.17.11, the lock still records "^4.17.21" -> 4.17.21: unchecked, out of sync', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '4.17.11' } },
      'package-lock.json': npmLock({ lodash: '^4.17.21' }, { lodash: '4.17.21' }),
    }), 'package.json'));
    expect(queried).toEqual([]);
    expect(value).toMatchObject({ status: 'failed', measured: false });
    expect(value.uncheckedPackages).toEqual([expect.objectContaining({
      name: 'lodash', version: '4.17.11', lockedVersion: '4.17.21', reason: expect.stringMatching(/^lockfile out of sync with package\.json/),
    })]);
  });

  it('npm v1 (records no specs): a locked version outside the declared spec is out of sync', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '4.17.11' } },
      'package-lock.json': { lockfileVersion: 1, dependencies: { lodash: { version: '4.17.21' } } },
    }), 'package.json'));
    expect(value.uncheckedPackages).toEqual([expect.objectContaining({ name: 'lodash', reason: expect.stringMatching(/out of sync/) })]);
  });

  it('pnpm: package.json pins 4.17.11, the importer still says specifier ^4.17.21 / version 4.18.1: unchecked', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '4.17.11' } },
      'pnpm-lock.yaml': ["lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', '      lodash:',
        '        specifier: ^4.17.21', '        version: 4.18.1', ''].join('\n'),
    }), 'package.json'));
    expect(queried).toEqual([]);
    expect(value.status).toBe('failed');
    expect(value.uncheckedPackages).toEqual([expect.objectContaining({ name: 'lodash', lockedVersion: '4.18.1', reason: expect.stringMatching(/out of sync/) })]);
  });

  it('pnpm in sync: the importer version is checked', async () => {
    const value = await scan(path.join(repo({
      'package.json': { dependencies: { lodash: '~4.17.10' } },
      'pnpm-lock.yaml': ["lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', '      lodash:',
        '        specifier: ~4.17.10', '        version: 4.17.11', ''].join('\n'),
    }), 'package.json'));
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value.vulnerabilities).toHaveLength(7);
  });
});

describe('round 3: workspaces, local packages and aliases', () => {
  const npmWorkspace = () => repo({
    'package.json': { name: 'root', workspaces: ['packages/*'], dependencies: { '@m/b': '*' } },
    'packages/a/package.json': { name: '@m/a', dependencies: { lodash: '4.17.11', '@m/b': '^1.0.0' } },
    'packages/b/package.json': { name: '@m/b', version: '1.0.0' },
    'package-lock.json': {
      lockfileVersion: 3,
      packages: {
        '': { name: 'root', workspaces: ['packages/*'], dependencies: { '@m/b': '*' } },
        'packages/a': { name: '@m/a', dependencies: { lodash: '4.17.11', '@m/b': '^1.0.0' } },
        'packages/b': { name: '@m/b', version: '1.0.0' },
        'node_modules/@m/a': { resolved: 'packages/a', link: true },
        'node_modules/@m/b': { resolved: 'packages/b', link: true },
        'node_modules/lodash': { version: '4.17.11' },
      },
    },
  });

  it('#1057: an npm workspaces root is incomplete (members not scanned), with the reason; its own local package stays local', async () => {
    const root = npmWorkspace();
    const value = await scan(path.join(root, 'package.json'));
    expect(value).toMatchObject({ status: 'incomplete', measured: false, uncheckedPackages: [], packagesChecked: 0 });
    expect(value.resolutionErrors).toEqual([WORKSPACE_NOT_SCANNED]);
    expect(value.error).toContain('#1057');
    expect(value.localPackages).toEqual([expect.objectContaining({ name: '@m/b', spec: '*' })]);
    expect(queried).toEqual([]);
    expect(value).not.toHaveProperty('workspaceMembers');
  });

  it('#1057: a workspace root with its own vulnerable dependency reports the findings and is still incomplete', async () => {
    const value = await scan(path.join(repo({
      'package.json': { name: 'root', workspaces: { packages: ['packages/*'] }, dependencies: { lodash: '4.17.11' } },
      'packages/a/package.json': { name: 'a', dependencies: { minimist: '1.2.5' } },
    }), 'package.json'));
    expect(value).toMatchObject({ status: 'incomplete', measured: false, packagesChecked: 1 });
    expect(value.resolutionErrors).toEqual([WORKSPACE_NOT_SCANNED]);
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value.vulnerabilities).toContainEqual(expect.objectContaining({ cveId: 'CVE-2019-10744' }));
  });

  it('npm workspace member scanned directly: walks up to the root lockfile', async () => {
    const root = npmWorkspace();
    const value = await scan(path.join(root, 'packages', 'a', 'package.json'));
    expect(value).toMatchObject({ status: 'complete', measured: true, lockfile: '../../package-lock.json', resolutionErrors: [] });
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value.localPackages).toEqual([expect.objectContaining({ name: '@m/b' })]);
  });

  it('#1057: a pnpm workspace root (pnpm-workspace.yaml) is incomplete; link: packages are local; members are not queried', async () => {
    const value = await scan(path.join(repo({
      'package.json': { name: 'root', dependencies: { '@p/b': 'workspace:*' } },
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/a/package.json': { name: '@p/a', dependencies: { lodash: '4.17.11' } },
      'pnpm-lock.yaml': ["lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', "      '@p/b':",
        '        specifier: workspace:*', '        version: link:packages/b', '', '  packages/a:', '    dependencies:',
        '      lodash:', '        specifier: 4.17.11', '        version: 4.17.11', ''].join('\n'),
    }), 'package.json'));
    expect(value.localPackages).toEqual([expect.objectContaining({ name: '@p/b' })]);
    expect(value).toMatchObject({ status: 'incomplete', measured: false, uncheckedPackages: [], resolutionErrors: [WORKSPACE_NOT_SCANNED] });
    expect(queried).toEqual([]);
  });

  it('a pnpm workspace member scanned directly uses the root pnpm-lock importer and is complete', async () => {
    const root = repo({
      'package.json': { name: 'root' },
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
      'packages/a/package.json': { name: '@p/a', dependencies: { lodash: '4.17.11' } },
      'pnpm-lock.yaml': ["lockfileVersion: '9.0'", '', 'importers:', '', '  .: {}', '', '  packages/a:', '    dependencies:',
        '      lodash:', '        specifier: 4.17.11', '        version: 4.17.11', ''].join('\n'),
    });
    const value = await scan(path.join(root, 'packages', 'a', 'package.json'));
    expect(value).toMatchObject({ status: 'complete', measured: true, lockfile: '../../pnpm-lock.yaml', resolutionErrors: [] });
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(value.vulnerabilities).toContainEqual(expect.objectContaining({ cveId: 'CVE-2019-10744' }));
  });

  it('an npm alias resolves to the real package (with and without a lockfile)', async () => {
    const noLock = await scan(path.join(repo({ 'package.json': { dependencies: { x: 'npm:lodash@4.17.11' } } }), 'package.json'));
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(noLock.vulnerabilities[0].title).toMatch(/^x \(lodash\): /);
    const withLock = await scan(path.join(repo({
      'package.json': { dependencies: { x: 'npm:lodash@^4.17.0' } },
      'package-lock.json': npmLock({ x: 'npm:lodash@^4.17.0' }, {}, { 'node_modules/x': { name: 'lodash', version: '4.17.11' } }),
    }), 'package.json'));
    expect(queried).toEqual(['lodash@4.17.11']);
    expect(withLock.status).toBe('complete');
  });

  it('git, GitHub and tarball sources stay unchecked; a file: directory is local', async () => {
    const value = await scan(path.join(repo({ 'package.json': { dependencies: {
      a: 'github:me/a', b: 'git+https://example.com/b.git', c: 'file:vendor/c-1.0.0.tgz', d: 'https://example.com/d.tgz', e: 'file:../e',
    } } }), 'package.json'));
    expect(value.uncheckedPackages.map((p) => p.name).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(value.uncheckedPackages[0].reason).toMatch(/not a registry dependency/);
    expect(value.localPackages).toEqual([expect.objectContaining({ name: 'e' })]);
  });
});

describe('lockfile index', () => {
  it('package-lock v1 and v3, with recorded specs and links', () => {
    const v1 = parseLockfile('package-lock.json', JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.11' } } }));
    expect(v1.resolve('', 'lodash', '^4')).toEqual({ version: '4.17.11' });
    expect(v1.recordedSpec('', 'lodash')).toBeNull();
    const v3 = parseLockfile('package-lock.json', JSON.stringify(npmLock({ lodash: '^4.17.0' }, { lodash: '4.17.21' }, { 'node_modules/@m/a': { link: true } })));
    expect(v3.resolve('', 'lodash', '^4.17.0')).toEqual({ version: '4.17.21' });
    expect(v3.recordedSpec('', 'lodash')).toBe('^4.17.0');
    expect(v3.recordedSpec('', 'missing')).toBeUndefined();
    expect(v3.resolve('', '@m/a', '*')).toEqual({ local: true });
  });

  it('pnpm-lock.yaml with importers (v9, peer suffix, alias) and the older top-level layout (v5)', () => {
    const v9 = parseLockfile('pnpm-lock.yaml', [
      "lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', '      lodash:',
      '        specifier: ^4.17.15', '        version: 4.17.21', "      '@scope/x':", '        specifier: ^1.0.0',
      '        version: 1.2.0(react@18.2.0)', '      y:', '        specifier: npm:lodash@4.17.11', '        version: lodash@4.17.11',
      '', '  packages/other:', '    dependencies:', '      lodash:', '        specifier: 3.0.0', '        version: 3.0.0',
      '', 'packages:', '', '  lodash@4.17.21:', '    resolution: {integrity: sha512-x}',
    ].join('\n'));
    expect(v9.members()).toEqual(['packages/other']);
    expect(v9.resolve('', 'lodash', '^4.17.15')).toEqual({ version: '4.17.21' });
    expect(v9.recordedSpec('', 'lodash')).toBe('^4.17.15');
    expect(v9.resolve('', '@scope/x', '^1.0.0')).toEqual({ version: '1.2.0' });
    expect(v9.resolve('', 'y', 'npm:lodash@4.17.11')).toEqual({ version: '4.17.11', realName: 'lodash' });
    expect(v9.resolve('packages/other', 'lodash', '3.0.0')).toEqual({ version: '3.0.0' });
    const v5 = parseLockfile('pnpm-lock.yaml', ['lockfileVersion: 5.4', '', 'specifiers:', '  lodash: ^4.17.15', '', 'dependencies:', '  lodash: 4.17.21_abc', ''].join('\n'));
    expect(v5.resolve('', 'lodash', '^4.17.15')).toEqual({ version: '4.17.21' });
    expect(v5.recordedSpec('', 'lodash')).toBe('^4.17.15');
  });

  it('yarn.lock classic and berry (matched by name@spec, so a changed spec finds nothing)', () => {
    const classic = parseLockfile('yarn.lock', ['# yarn lockfile v1', '', '"lodash@^4.17.15", lodash@^4.17.0:', '  version "4.17.21"', '  resolved "https://x"', ''].join('\n'));
    expect(classic.resolve('', 'lodash', '^4.17.15')).toEqual({ version: '4.17.21' });
    expect(classic.resolve('', 'lodash', '4.17.11')).toBeUndefined();
    const berry = parseLockfile('yarn.lock', ['__metadata:', '  version: 6', '', '"lodash@npm:^4.17.15":', '  version: 4.17.21',
      '  resolution: "lodash@npm:4.17.21"', '', '"@m/a@workspace:packages/a":', '  version: 0.0.0-use.local', '  resolution: "@m/a@workspace:packages/a"', ''].join('\n'));
    expect(berry.resolve('', 'lodash', '^4.17.15')).toEqual({ version: '4.17.21' });
    expect(berry.resolve('', '@m/a', 'workspace:packages/a')).toEqual({ local: true });
  });
});

describe('scope-cut re-check B1: pnpm peer suffixes are versions, never aliases', () => {
  // Real importer lines from `npx pnpm@7 install --lockfile-only` (v5.4), pnpm 8 (v6.0) and pnpm 11 (v9.0).
  const DECLARED = { react: '16.0.0', 'react-dom': '16.0.0', '@types/react': '18.0.0', 'react-redux': '8.0.5',
    'x-lodash': 'npm:lodash@4.17.11', '@my/types-node': 'npm:@types/node@18.0.0' };
  const v54 = ['lockfileVersion: 5.4', '', 'specifiers:', "  '@my/types-node': npm:@types/node@18.0.0", "  '@types/react': 18.0.0",
    '  react: 16.0.0', '  react-dom: 16.0.0', '  react-redux: 8.0.5', '  x-lodash: npm:lodash@4.17.11', '', 'dependencies:',
    "  '@my/types-node': /@types/node/18.0.0", "  '@types/react': 18.0.0", '  react: 16.0.0', '  react-dom: 16.0.0_react@16.0.0',
    '  react-redux: 8.0.5_4ygthk45pujmhpktasijm4ully', '  x-lodash: /lodash/4.17.11', '', 'packages:', ''].join('\n');
  const importer = (indent: string, versions: Record<string, string>) => Object.entries(DECLARED).flatMap(([n, s]) => [
    `${indent}'${n}':`, `${indent}  specifier: ${s}`, `${indent}  version: ${versions[n]}`]);
  const v60 = ["lockfileVersion: '6.0'", '', 'dependencies:', ...importer('  ', {
    '@my/types-node': '/@types/node@18.0.0', '@types/react': '18.0.0', react: '16.0.0', 'react-dom': '16.0.0(react@16.0.0)',
    'react-redux': '8.0.5(@types/react@18.0.0)(react-dom@16.0.0)(react@16.0.0)', 'x-lodash': '/lodash@4.17.11' }), ''].join('\n');
  const v90 = ["lockfileVersion: '9.0'", '', 'importers:', '', '  .:', '    dependencies:', ...importer('      ', {
    '@my/types-node': "'@types/node@18.0.0'", '@types/react': '18.0.0', react: '16.0.0', 'react-dom': '16.0.0(react@16.0.0)',
    'react-redux': '8.0.5(@types/react@18.0.0)(react-dom@16.0.0(react@16.0.0))(react@16.0.0)', 'x-lodash': 'lodash@4.17.11' }), ''].join('\n');
  const expected = {
    react: { version: '16.0.0' }, 'react-dom': { version: '16.0.0' }, '@types/react': { version: '18.0.0' },
    'react-redux': { version: '8.0.5' }, 'x-lodash': { version: '4.17.11', realName: 'lodash' },
    '@my/types-node': { version: '18.0.0', realName: '@types/node' },
  };

  it.each([['v5.4 (pnpm 7)', v54], ['v6.0 (pnpm 8)', v60], ['v9.0 (pnpm 11)', v90]])('%s: versions and aliases', (_label, text) => {
    const index = parseLockfile('pnpm-lock.yaml', text);
    for (const [name, want] of Object.entries(expected)) {
      expect(index.resolve('', name, DECLARED[name as keyof typeof DECLARED]), name).toEqual(want);
    }
  });

  it('v5.4 scoped and hashed peer suffixes stay plain versions; "_" inside an alias name is kept', () => {
    const index = parseLockfile('pnpm-lock.yaml', ['lockfileVersion: 5.4', '', 'specifiers:', '  a: 3.3.7', '  b: 1.0.0',
      '  c: 2.0.0', '  d: npm:snake_case_pkg@1.2.0', '', 'dependencies:', '  a: 3.3.7_@types+react@18.0.0',
      '  b: 1.0.0_@scope+peer@2.0.0_react@16.0.0', '  c: 2.0.0_4ygthk45pujmhpktasijm4ully', '  d: /snake_case_pkg/1.2.0_react@16.0.0', ''].join('\n'));
    expect(index.resolve('', 'a', '3.3.7')).toEqual({ version: '3.3.7' });
    expect(index.resolve('', 'b', '1.0.0')).toEqual({ version: '1.0.0' });
    expect(index.resolve('', 'c', '2.0.0')).toEqual({ version: '2.0.0' });
    expect(index.resolve('', 'd', 'npm:snake_case_pkg@1.2.0')).toEqual({ version: '1.2.0', realName: 'snake_case_pkg' });
  });

  it('pnpm 7 lock: react-dom is queried as react-dom@16.0.0 (was "16.0.0_react"), the lodash alias finds CVE-2019-10744', async () => {
    const value = await scan(path.join(repo({ 'package.json': { name: 'p7', dependencies: DECLARED }, 'pnpm-lock.yaml': v54 }), 'package.json'));
    expect(value).toMatchObject({ status: 'complete', lockfile: 'pnpm-lock.yaml' });
    expect(queried.sort()).toEqual(['@types/node@18.0.0', '@types/react@18.0.0', 'lodash@4.17.11', 'react-dom@16.0.0', 'react-redux@8.0.5', 'react@16.0.0']);
    expect(value.vulnerabilities).toContainEqual(expect.objectContaining({ cveId: 'CVE-2019-10744' }));
  });
});

describe('scope-cut re-check B2: only a pnpm-workspace.yaml / workspaces that declares packages is a workspace root', () => {
  const single = (files: Record<string, string | object>) => scan(path.join(repo({
    'package.json': { name: 'one', dependencies: { lodash: '4.17.11' } }, ...files }), 'package.json'));
  const bomb = ['a: &a [x, x]', ...Array.from({ length: 12 }, (_, i) =>
    `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [*${String.fromCharCode(97 + i)}, *${String.fromCharCode(97 + i)}]`), ''].join('\n');

  it.each([
    ['settings only (pnpm 10/11: nodeLinker)', 'nodeLinker: hoisted\n'],
    ['settings only (onlyBuiltDependencies)', 'onlyBuiltDependencies:\n  - esbuild\n'],
    ['packages: []', 'packages: []\n'],
  ])('%s: complete', async (_label, yaml) => {
    const value = await single({ 'pnpm-workspace.yaml': yaml });
    expect(value).toMatchObject({ status: 'complete', measured: true, resolutionErrors: [] });
  });

  it.each([
    ['a real packages list', "packages:\n  - 'packages/*'\n"],
    ['packages via a merge key', "base: &b\n  packages: ['apps/*']\n<<: *b\n"],
    ['packages that is not a list', 'packages: packages/*\n'],
    ['an unparsable file', 'packages: [unclosed\n'],
    ['an empty file', ''],
    ['a merge-key bomb', bomb],
  ])('%s: incomplete (workspace root)', async (_label, yaml) => {
    const value = await single({ 'pnpm-workspace.yaml': yaml });
    expect(value).toMatchObject({ status: 'incomplete', measured: false, resolutionErrors: [WORKSPACE_NOT_SCANNED] });
  });

  it('a directory or an oversized pnpm-workspace.yaml is a workspace root (fail closed)', async () => {
    const dir = await single({ 'pnpm-workspace.yaml/keep': 'x' });
    expect(dir.resolutionErrors).toEqual([WORKSPACE_NOT_SCANNED]);
    const big = await single({ 'pnpm-workspace.yaml': `nodeLinker: hoisted\n#${'x'.repeat(1024 * 1024)}\n` });
    expect(big.resolutionErrors).toEqual([WORKSPACE_NOT_SCANNED]);
  });

  it.each([
    [[], 'complete'], [{ nohoist: ['**/x'] }, 'complete'], [{ packages: [] }, 'complete'],
    [['packages/*'], 'incomplete'], [{ packages: ['packages/*'], nohoist: [] }, 'incomplete'],
  ])('package.json workspaces %j: %s', async (workspaces, status) => {
    const value = await scan(path.join(repo({ 'package.json': { name: 'r', workspaces, dependencies: { lodash: '4.17.11' } } }), 'package.json'));
    expect(value.status).toBe(status);
  });
});
