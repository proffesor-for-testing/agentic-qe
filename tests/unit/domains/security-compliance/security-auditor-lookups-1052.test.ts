/**
 * #1052: a failed registry lookup or an unreachable DAST target is reported as
 * unchecked/failed, never as "not deprecated", an "unknown" upgrade target or
 * a clean audit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:net';
import { SecurityAuditorService } from '../../../../src/domains/security-compliance/services/security-auditor';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { Vulnerability } from '../../../../src/domains/security-compliance/interfaces';

const memory = () => ({ set: vi.fn(), get: vi.fn(), search: vi.fn().mockResolvedValue([]) }) as unknown as MemoryBackend;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function vuln(name: string, version: string): Vulnerability {
  return {
    id: `GHSA-${name}`, title: 'fixture', description: 'fixture', severity: 'high', category: 'vulnerable-components',
    location: { file: 'package.json', dependency: { name, version, ecosystem: 'npm' } },
    remediation: { description: 'upgrade', estimatedEffort: 'trivial', automatable: true }, references: [],
  };
}

describe('registry lookups (#1052)', () => {
  let service: SecurityAuditorService;
  beforeEach(() => {
    service = new SecurityAuditorService(memory());
    vi.spyOn((service as any).osvClient, 'lookupBatch').mockImplementation(async (pkgs: any[]) => ({
      status: 'complete', results: new Map(pkgs.map((p) => [`${p.ecosystem}:${p.name}@${p.version ?? ''}`, []])),
      packagesRequested: pkgs.length, packagesChecked: pkgs.length, unchecked: [], errors: [],
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([
    ['the registry is unreachable', () => Promise.reject(new TypeError('fetch failed')), /registry lookup failed/],
    ['the registry answers HTTP 503', () => Promise.resolve(json(503, {})), /HTTP 503/],
  ])('checkPackage reports deprecation unchecked when %s', async (_case, fetchImpl, reason) => {
    vi.stubGlobal('fetch', vi.fn(fetchImpl));
    const result = await service.checkPackage('left-pad', '1.0.0', 'npm');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.isDeprecated).toBeNull();
    expect(result.value.latestVersion).toBeNull();
    expect(result.value.status).toBe('incomplete');
    expect(result.value.unchecked?.join(' ')).toMatch(reason);
  });

  it.each([[{ version: '1.3.0', deprecated: 'use String.prototype.padStart' }, true], [{ version: '1.3.0' }, false]])(
    'checkPackage reports a registry answer as checked (%j)', async (body, deprecated) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, body)));
      const result = await service.checkPackage('left-pad', '1.0.0', 'npm');
      expect(result.success && result.value).toMatchObject({ isDeprecated: deprecated, latestVersion: '1.3.0', status: 'complete' });
      expect(result.success && result.value.unchecked).toBeUndefined();
    });

  it('checkPackage does not claim a pip package is not deprecated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { info: { version: '2.32.0' } })));
    const result = await service.checkPackage('requests', '2.31.0', 'pip');
    expect(result.success && result.value).toMatchObject({ isDeprecated: null, latestVersion: '2.32.0', status: 'incomplete' });
  });

  it('getUpgradeRecommendations lists a package whose lookup failed as unchecked, without a target version', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/broken/')
      ? json(503, {}) : json(200, { version: '5.0.0' })));
    const result = await service.getUpgradeRecommendations([vuln('broken', '1.0.0'), vuln('healthy', '4.0.0')]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const byName = Object.fromEntries(result.value.map(r => [r.package, r]));
    expect(byName.broken).toMatchObject({ toVersion: null, breakingChanges: null, unchecked: 'npm registry returned HTTP 503' });
    expect(byName.healthy).toMatchObject({ toVersion: '5.0.0', breakingChanges: true });
    expect(byName.healthy.unchecked).toBeUndefined();
  });
});

describe('runAudit with an unreachable DAST target (#1052)', () => {
  it('reports the DAST phase failed and does not call the posture good', async () => {
    const reserved = createServer();
    await new Promise<void>(resolve => reserved.listen(0, '127.0.0.1', resolve));
    const address = reserved.address();
    if (!address || typeof address === 'string') throw new Error('Missing loopback port');
    await new Promise<void>(resolve => reserved.close(() => resolve()));
    const targetUrl = `http://127.0.0.1:${address.port}/`;

    const result = await new SecurityAuditorService(memory()).runAudit({
      includeSAST: false, includeDAST: true, includeDependencies: false, includeSecrets: false, targetUrl,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.dastResults).toMatchObject({ status: 'failed', vulnerabilities: [] });
    expect(result.value.incompleteChecks?.join(' ')).toMatch(/DAST scan failed: DAST_REQUEST_FAILED/);
    expect(result.value.recommendations.join(' ')).not.toContain('Security posture is good');
  });
});
