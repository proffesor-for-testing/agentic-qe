/**
 * #1221: a failed registry lookup leaves the package's "outdated" state
 * unchecked, listed with the reason; the scan never reads as "no outdated
 * packages". OSV is stubbed and fetch is stubbed; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../src/shared/value-objects';

const memory = () => ({ set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) }) as unknown as MemoryBackend;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('outdated-package check (#1221)', () => {
  let root: string;
  let manifest: FilePath;
  let service: SecurityAuditorService;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'aqe-1221-'));
    const file = path.join(root, 'package.json');
    writeFileSync(file, JSON.stringify({ dependencies: { 'left-pad': '1.0.0', lodash: '4.17.0' } }));
    manifest = { value: file, filename: 'package.json' } as FilePath;
    service = new SecurityAuditorService(memory());
    vi.spyOn((service as any).osvClient, 'lookupBatch').mockImplementation(async (pkgs: any[]) => ({
      status: 'complete', results: new Map(pkgs.map((p) => [`${p.ecosystem}:${p.name}@${p.version ?? ''}`, []])),
      packagesRequested: pkgs.length, packagesChecked: pkgs.length, unchecked: [], errors: [],
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('registry unreachable: outdated check failed, every package unchecked with the reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const result = await service.scanDependencies(manifest);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.outdatedPackages).toEqual([]);
    expect(result.value.outdatedStatus).toBe('failed');
    expect(result.value.outdatedUnchecked).toEqual([
      { name: 'left-pad', version: '1.0.0', reason: 'registry lookup failed: fetch failed' },
      { name: 'lodash', version: '4.17.0', reason: 'registry lookup failed: fetch failed' },
    ]);
  });

  it('one lookup fails: outdated check incomplete, the answered package still reported', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/left-pad/')
      ? json(503, {}) : json(200, { version: '4.17.21' })));
    const result = await service.scanDependencies(manifest);

    expect(result.success && result.value).toMatchObject({
      outdatedStatus: 'incomplete',
      outdatedPackages: [{ name: 'lodash', currentVersion: '4.17.0', latestVersion: '4.17.21', updateType: 'patch' }],
      outdatedUnchecked: [{ name: 'left-pad', version: '1.0.0', reason: 'npm registry returned HTTP 503' }],
    });
  });

  it('every lookup answered: outdated check complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => json(200, { version: url.includes('/left-pad/') ? '1.0.0' : '4.17.21' })));
    const result = await service.scanDependencies(manifest);

    expect(result.success && result.value).toMatchObject({
      outdatedStatus: 'complete', outdatedUnchecked: [], outdatedPackages: [{ name: 'lodash' }],
    });
  });

  it('runAudit lists the failed outdated check and does not call the posture good', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    const result = await service.runAudit({ includeSAST: false, includeDAST: false, includeDependencies: true, includeSecrets: false });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.dependencyResults).toMatchObject({ status: 'complete', outdatedStatus: 'failed' });
    expect(result.value.incompleteChecks).toEqual([
      'Outdated-package check failed: latest version unknown for 2 package(s): registry lookup failed: fetch failed',
    ]);
    expect(result.value.recommendations.join(' ')).toMatch(/Whether packages are outdated is unknown/);
    expect(result.value.recommendations.join(' ')).not.toContain('Security posture is good');
  });

  it('runAudit says why when the dependency scan itself failed, with no packages to list', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'missing'));
    const result = await service.runAudit({ includeSAST: false, includeDAST: false, includeDependencies: true, includeSecrets: false });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.dependencyResults).toMatchObject({ status: 'failed', outdatedStatus: 'failed' });
    const outdatedCheck = result.value.incompleteChecks?.find((c) => c.startsWith('Outdated-package check'));
    expect(outdatedCheck).toMatch(/^Outdated-package check failed: no latest version was looked up: Dependency scan of .*missing.*package\.json failed: /);
    expect(outdatedCheck).not.toMatch(/0 package\(s\)|: $/);
    expect(result.value.recommendations.join(' ')).not.toContain('Security posture is good');
  });
});
