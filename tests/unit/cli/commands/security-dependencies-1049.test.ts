/**
 * #1049: `aqe security --dependencies` reports a failed or partial OSV lookup
 * as "dependency advisories could not be checked" and never exits clean.
 * Real DependencyScanner + OSVClient against a local OSV stub; no real network.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CLIContext } from '../../../../src/cli/handlers/interfaces.js';
import { DependencyScanner } from '../../../../src/domains/security-compliance/services/scanners/dependency-scanner.js';
import { OSVClient } from '../../../../src/shared/security/osv-client.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

const ADVISORY = {
  id: 'GHSA-35jh-r3h4-6jhm', summary: 'Command Injection in lodash', details: 'template injection',
  aliases: ['CVE-2021-23337'], modified: '2024-01-01T00:00:00Z', database_specific: { severity: 'HIGH' },
  affected: [{ package: { name: 'lodash', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
};

describe('aqe security --dependencies (#1049)', () => {
  let createSecurityCommand: typeof import('../../../../src/cli/commands/security.js').createSecurityCommand;
  let server: Server;
  let baseUrl: string;
  let handler: Handler;
  let root: string;
  let stdout: string[];
  let cleanupAndExit: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => handler(req, body, res));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    root = mkdtempSync(path.join(tmpdir(), 'aqe-1049-cli-'));
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { lodash: '4.17.15', 'left-pad': '^1.3.0' } }));
    // The lockfile resolves the left-pad range; without it the range is unchecked (#1049 round 2).
    writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
      '': { dependencies: { lodash: '4.17.15', 'left-pad': '^1.3.0' } },
      'node_modules/lodash': { version: '4.17.15' }, 'node_modules/left-pad': { version: '1.3.0' } } }));
    ({ createSecurityCommand } = await import('../../../../src/cli/commands/security.js'));
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    stdout = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => stdout.push(args.join(' ')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    cleanupAndExit = vi.fn(async () => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value));
  };

  async function execute(args: string[]) {
    const memory = { set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) } as unknown as MemoryBackend;
    const scanner = new DependencyScanner({
      defaultRuleSets: [], maxConcurrentScans: 1, timeout: 1000, enableFalsePositiveDetection: false, dastMaxDepth: 1,
      dastActiveScanning: false, enableLLMAnalysis: false, llmModelTier: 1, enableSemgrep: false,
    }, memory, undefined, new OSVClient({ baseUrl, retries: 0, timeout: 500, enableCache: false, batchSize: 1 }));
    const api = { runDependencyScan: (p: string) => scanner.scanPackageJson(p), runSASTScan: vi.fn(), runComplianceCheck: vi.fn() };
    const context = { kernel: { getDomainAPIAsync: vi.fn(async () => api) } } as unknown as CLIContext;
    const command = createSecurityCommand(context, cleanupAndExit as unknown as (code: number) => Promise<never>, async () => true);
    await command.parseAsync(['--target', root, ...args], { from: 'user' });
    return stdout.join('\n');
  }

  it('OSV down: says advisories could not be checked and exits 3 (unmeasured), not 0', async () => {
    handler = (_req, _body, res) => json(res, 503, {});
    const text = await execute(['--dependencies']);

    expect(text).toMatch(/Dependency advisories could not be checked/);
    expect(text).toMatch(/not checked: lodash@4\.17\.15/);
    expect(text).not.toMatch(/No vulnerabilities found in completed checks/);
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('OSV down, JSON: the dependency check is failed and the report lists the unchecked packages', async () => {
    handler = (_req, _body, res) => json(res, 500, {});
    const output = JSON.parse(await execute(['--dependencies', '--format', 'json']));
    expect(output.status).toBe('failed');
    expect(output.checks).toEqual([expect.objectContaining({ name: 'Dependency advisories', status: 'failed' })]);
    expect(output.dependencyScan).toMatchObject({ status: 'failed', measured: false });
    expect(output.dependencyScan.uncheckedPackages).toHaveLength(2);
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('partial batch with a real high finding: exit 1, finding and unchecked package both reported', async () => {
    handler = (req, body, res) => {
      if (req.url === '/v1/querybatch') {
        const name = (JSON.parse(body) as { queries: Array<{ package: { name: string } }> }).queries[0].package.name;
        return name === 'lodash' ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }] }) : json(res, 429, {});
      }
      return json(res, 200, ADVISORY);
    };
    const output = JSON.parse(await execute(['--dependencies', '--format', 'json']));
    expect(output.checks[0]).toMatchObject({ status: 'partial' });
    expect(output.vulnerabilities).toEqual([expect.objectContaining({ severity: 'high', file: 'package.json' })]);
    expect(output.dependencyScan.uncheckedPackages).toEqual([expect.objectContaining({ name: 'left-pad', version: '^1.3.0' })]);
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('clean complete lookup: exit 0', async () => {
    handler = (_req, _body, res) => json(res, 200, { results: [{}] });
    const output = JSON.parse(await execute(['--dependencies', '--format', 'json']));
    expect(output.status).toBe('complete');
    expect(output.dependencyScan).toMatchObject({ status: 'complete', measured: true });
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('a package.json with no dependencies is complete (nothing to check): exit 0, no OSV request', async () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'aqe-1049-cli-empty-'));
    try {
      writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ name: 'no-deps' }));
      let requests = 0;
      handler = (_req, _body, res) => { requests++; json(res, 200, { results: [] }); };
      const memory = { set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) } as unknown as MemoryBackend;
      const scanner = new DependencyScanner({
        defaultRuleSets: [], maxConcurrentScans: 1, timeout: 1000, enableFalsePositiveDetection: false, dastMaxDepth: 1,
        dastActiveScanning: false, enableLLMAnalysis: false, llmModelTier: 1, enableSemgrep: false,
      }, memory, undefined, new OSVClient({ baseUrl, retries: 0, enableCache: false }));
      const api = { runDependencyScan: (p: string) => scanner.scanPackageJson(p), runSASTScan: vi.fn(), runComplianceCheck: vi.fn() };
      const context = { kernel: { getDomainAPIAsync: vi.fn(async () => api) } } as unknown as CLIContext;
      const command = createSecurityCommand(context, cleanupAndExit as unknown as (code: number) => Promise<never>, async () => true);
      await command.parseAsync(['--target', empty, '--dependencies', '--format', 'json'], { from: 'user' });
      const output = JSON.parse(stdout.join('\n'));
      expect(output.dependencyScan).toMatchObject({ status: 'complete', measured: true, packagesRequested: 0 });
      expect(requests).toBe(0);
      expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(0);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('complete lookup with a high finding: exit 1', async () => {
    handler = (req, _body, res) => req.url === '/v1/querybatch'
      ? json(res, 200, { results: [{ vulns: [{ id: ADVISORY.id }] }] })
      : json(res, 200, ADVISORY);
    await execute(['--dependencies', '--format', 'json']);
    expect(cleanupAndExit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
