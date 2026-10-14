/**
 * Issue #1043 — the security-scan worker reports only real scanner output.
 *
 * It used to report hardcoded lodash (CVE-2021-23337) and minimist
 * (CVE-2021-44906) vulnerabilities plus two invented code issues on every
 * tick, in every project. It now relays only the scans the security-compliance
 * domain actually ran and recorded (`security:scan:<id>` in the
 * `security-compliance` namespace): the OSV dependency scan and the SAST scan.
 * Nothing recorded → nothing written, no vulnerability findings, an
 * "unmeasured" info finding. A `security:lastScan` without the measured stamp
 * (written by <= 3.15.6) is ignored and replaced by the next measured run.
 */
import { describe, it, expect } from 'vitest';
import { SecurityScanWorker } from '../../../../src/workers/workers/security-scan';
import { namespacedStore, contextFor, type NamespacedStore } from './measured-worker-store';

const NS = 'security-compliance';

/** The invented scan result <= 3.15.6 stored as `security:lastScan`. */
const LEGACY_INVENTED_SCAN = {
  dependencyVulnerabilities: [
    { package: 'lodash', version: '4.17.15', severity: 'high', cve: 'CVE-2021-23337', title: 'Command Injection', description: 'x' },
    { package: 'minimist', version: '1.2.5', severity: 'critical', cve: 'CVE-2021-44906', title: 'Prototype Pollution', description: 'x' },
  ],
  codeSecurityIssues: [
    { file: 'src/shared/http/http-client.ts', line: 45, rule: 'no-eval', severity: 'high', message: 'x', category: 'injection' },
  ],
  secretsDetected: 0,
  configurationIssues: 1,
  scanDurationMs: 2500,
};

const INVENTED = /lodash|minimist|CVE-2021-23337|CVE-2021-44906|http-client\.ts|memory-backend\.ts/;

const summary = (s: Partial<Record<'critical' | 'high' | 'medium' | 'low' | 'informational', number>>) => ({
  critical: 0, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 12, scanDurationMs: 840, ...s,
});

/** A dependency scan recorded the way DependencyScanner.storeScanResults does (OSV). */
/** A complete OSV lookup (#1049 contract): every requested package was checked. */
const COMPLETE = { status: 'complete', measured: true, advisorySource: 'osv', packagesRequested: 3, packagesChecked: 3, uncheckedPackages: [] };

async function recordDependencyScan(store: NamespacedStore, scanId: string, timestamp: string, vulns: Array<{
  pkg: string; severity: string; cveId?: string; fixed?: string;
}>, provenance: Record<string, unknown> = COMPLETE) {
  const counts: Record<string, number> = {};
  for (const v of vulns) counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  await store.memory.set(`security:scan:${scanId}`, {
    ...provenance,
    scanId,
    scanType: 'dependency',
    vulnerabilities: vulns.map((v, i) => ({
      id: `uuid-${i}`,
      ...(v.cveId ? { cveId: v.cveId } : {}),
      title: `${v.pkg}: real advisory summary`,
      description: 'real advisory details',
      severity: v.severity,
      category: 'vulnerable-components',
      location: { file: 'package.json', line: 1, column: 1, snippet: `"${v.pkg}": "..."` },
      remediation: {
        description: v.fixed ? `Update to version ${v.fixed} or later` : 'No fixed version available',
        ...(v.fixed ? { fixExample: `npm install ${v.pkg}@${v.fixed}` } : {}),
        estimatedEffort: 'minor', automatable: true,
      },
      references: ['https://osv.dev/vulnerability/GHSA-xxxx'],
    })),
    summary: summary(counts),
    timestamp,
  }, { namespace: NS });
}

/** A SAST scan recorded the way SASTScanner.storeScanResults does (summary + critical/high only). */
async function recordSastScan(store: NamespacedStore, scanId: string, timestamp: string, issues: Array<{
  file: string; line: number; severity: 'critical' | 'high'; category: string; title: string;
}>, extra: Partial<Record<'medium' | 'low', number>> = {}) {
  const counts: Record<string, number> = { ...extra };
  for (const v of issues) counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  await store.memory.set(`security:scan:${scanId}`, {
    scanId,
    scanType: 'sast',
    summary: summary(counts),
    timestamp,
    vulnerabilityCount: issues.length + (extra.medium ?? 0) + (extra.low ?? 0),
    criticalVulnerabilities: issues.map((v, i) => ({
      id: `sast-${i}`, title: v.title, description: `${v.title} found`, severity: v.severity, category: v.category,
      location: { file: v.file, line: v.line, snippet: 'eval(input)' },
      remediation: { description: 'fix it', estimatedEffort: 'minor', automatable: false },
      references: [],
    })),
  }, { namespace: NS });
}

const vulnFindings = (findings: Array<{ type: string }>) =>
  findings.filter((f) => /vulnerability$|^code-security-/.test(f.type));

const recent = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

describe('#1043 — security-scan worker reports only real scanner output', () => {
  it('nothing scanned: writes nothing, emits zero vulnerability findings, reports unmeasured', async () => {
    const store = namespacedStore();
    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(result.success).toBe(true);
    expect(store.memory.set).not.toHaveBeenCalled();
    expect(vulnFindings(result.findings)).toEqual([]);
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'security-unmeasured', severity: 'info' }));
    expect(result.metrics.issuesFound).toBe(0);
    expect(result.metrics.domainMetrics).toMatchObject({
      dependencyScan: 'unmeasured',
      codeScan: 'unmeasured',
    });
    // None of the old invented CVEs or files may surface anywhere.
    expect(JSON.stringify(result)).not.toMatch(INVENTED);
    expect(JSON.stringify(result)).not.toMatch(/CVE-/);
  });

  it('a recorded OSV dependency scan with no vulnerabilities: stamped record, zero findings, no CVE', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-1', recent(5), []);

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(vulnFindings(result.findings)).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/CVE-/);
    const stored = store.read('security:lastScan') as Record<string, any>;
    expect(stored).toMatchObject({
      measured: true,
      schemaVersion: 1,
      dependency: { scanId: 'dep-1', source: 'osv', vulnerabilities: [] },
      code: null,
    });
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyVulnerabilities: 0, codeScan: 'unmeasured' });
  });

  it('reports exactly the vulnerabilities the recorded scans found, with their real ids', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-2', recent(10), [
      { pkg: 'real-pkg', severity: 'critical', cveId: 'CVE-2024-11111', fixed: '2.0.1' },
      { pkg: 'other-pkg', severity: 'high' },
      { pkg: 'minor-pkg', severity: 'medium', cveId: 'CVE-2024-22222' },
    ]);
    await recordSastScan(store, 'sast-1', recent(3), [
      { file: 'src/app/handler.ts', line: 17, severity: 'high', category: 'injection', title: 'Use of eval' },
    ], { medium: 2 });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    const findings = vulnFindings(result.findings);
    expect(findings).toHaveLength(3);
    expect(findings).toContainEqual(expect.objectContaining({
      type: 'critical-vulnerability', severity: 'critical', resource: 'real-pkg',
      context: expect.objectContaining({ cve: 'CVE-2024-11111', fixedIn: '2.0.1', scanId: 'dep-2', advisorySource: 'osv' }),
    }));
    // No CVE id is invented for an advisory that carried none.
    const other = findings.find((f) => (f as { resource?: string }).resource === 'other-pkg') as { context: Record<string, unknown> };
    expect(other.context.cve).toBeUndefined();
    expect(findings).toContainEqual(expect.objectContaining({
      type: 'code-security-injection', severity: 'high', resource: 'src/app/handler.ts:17',
      context: expect.objectContaining({ scanId: 'sast-1' }),
    }));
    // Every CVE in the output came from the recorded advisories.
    const cves = new Set(JSON.stringify(result).match(/CVE-\d{4}-\d+/g) ?? []);
    expect([...cves].every((c) => c === 'CVE-2024-11111' || c === 'CVE-2024-22222')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(INVENTED);

    expect(store.read('security:lastScan')).toMatchObject({
      measured: true,
      schemaVersion: 1,
      dependency: { scanId: 'dep-2', summary: expect.objectContaining({ critical: 1, high: 1, medium: 1 }) },
      code: { scanId: 'sast-1', summary: expect.objectContaining({ high: 1, medium: 2 }) },
    });
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyVulnerabilities: 3, codeSecurityIssues: 3 });
  });

  it('uses the most recent scan of each kind', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-old', recent(120), [{ pkg: 'old-pkg', severity: 'critical', cveId: 'CVE-2020-1' }]);
    await recordDependencyScan(store, 'dep-new', recent(1), []);

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(vulnFindings(result.findings)).toEqual([]);
    expect(store.read('security:lastScan')).toMatchObject({ dependency: { scanId: 'dep-new' } });
  });

  it('ignores scans older than the scanner keeps them, malformed records and DAST scans', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-stale', new Date(Date.now() - 8 * 86_400_000).toISOString(),
      [{ pkg: 'stale-pkg', severity: 'critical', cveId: 'CVE-2019-1' }]);
    await store.memory.set('security:scan:junk', { scanType: 'dependency', vulnerabilities: 'nope' }, { namespace: NS });
    await store.memory.set('security:scan:dast-1', {
      scanId: 'dast-1', scanType: 'dast', summary: summary({ high: 1 }), timestamp: recent(1), vulnerabilities: [],
    }, { namespace: NS });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(vulnFindings(result.findings)).toEqual([]);
    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'security-unmeasured' }));
  });

  it('#1049: an incomplete OSV lookup is not "0 vulnerabilities": unmeasured, unchecked packages named, checked findings kept', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-partial', recent(2), [
      { pkg: 'checked-pkg', severity: 'high', cveId: 'CVE-2024-33333' },
    ], {
      status: 'incomplete', measured: false, advisorySource: 'osv', packagesRequested: 3, packagesChecked: 1,
      uncheckedPackages: [{ name: 'left-pad', version: '1.3.0', reason: 'timeout' }, { name: 'zod', version: '3.0.0', reason: 'timeout' }],
      error: 'OSV querybatch timed out',
    });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyScan: 'unmeasured', dependencyVulnerabilities: 'unmeasured' });
    const incomplete = result.findings.find((f) => f.type === 'dependency-scan-incomplete');
    expect(incomplete).toMatchObject({ severity: 'info' });
    expect(incomplete!.description).toMatch(/left-pad@1\.3\.0/);
    expect(incomplete!.description).toMatch(/zod@3\.0\.0/);
    // The advisory OSV did return for a checked package is real and still reported.
    expect(vulnFindings(result.findings)).toEqual([expect.objectContaining({
      type: 'high-vulnerability', resource: 'checked-pkg',
      context: expect.objectContaining({ cve: 'CVE-2024-33333', partialScan: true }),
    })]);
  });

  it('#1049: a failed OSV lookup is unmeasured and reports no vulnerability', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-failed', recent(2), [], {
      status: 'failed', measured: false, advisorySource: 'osv', packagesRequested: 2, packagesChecked: 0,
      uncheckedPackages: [{ name: 'a', version: '1.0.0', reason: 'network' }, { name: 'b', version: '2.0.0', reason: 'network' }],
      error: 'ECONNREFUSED',
    });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
    expect(vulnFindings(result.findings)).toEqual([]);
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyScan: 'unmeasured', dependencyVulnerabilities: 'unmeasured' });
    expect(result.findings).toContainEqual(expect.objectContaining({
      type: 'dependency-scan-incomplete', description: expect.stringMatching(/ECONNREFUSED/),
    }));
  });

  it('#1049: a pre-#1049 dependency record without status is unmeasured (a failed lookup looked clean)', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-legacy', recent(2), [], {});

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyScan: 'unmeasured', dependencyVulnerabilities: 'unmeasured' });
    expect(result.findings).toContainEqual(expect.objectContaining({ type: 'dependency-scan-incomplete' }));
  });

  it('#1049: a newer failed lookup is not masked by an older complete one', async () => {
    const store = namespacedStore();
    await recordDependencyScan(store, 'dep-ok', recent(60), []);
    await recordDependencyScan(store, 'dep-fail', recent(1), [], {
      status: 'failed', measured: false, advisorySource: 'osv', packagesRequested: 1, packagesChecked: 0,
      uncheckedPackages: [{ name: 'a', version: '1.0.0', reason: 'network' }], error: 'ECONNREFUSED',
    });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    expect(result.metrics.domainMetrics).toMatchObject({ dependencyScan: 'unmeasured' });
    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
  });

  it('a legacy unstamped security:lastScan is ignored (left in place) and replaced by the next measured run', async () => {
    const store = namespacedStore();
    await store.memory.set('security:lastScan', LEGACY_INVENTED_SCAN);
    store.memory.set.mockClear();

    const unmeasured = await new SecurityScanWorker().execute(contextFor(store.memory));
    expect(vulnFindings(unmeasured.findings)).toEqual([]);
    expect(JSON.stringify(unmeasured)).not.toMatch(INVENTED);
    expect(store.read('security:lastScan')).toEqual(LEGACY_INVENTED_SCAN);

    await recordDependencyScan(store, 'dep-3', recent(2), []);
    const measured = await new SecurityScanWorker().execute(contextFor(store.memory));
    expect(JSON.stringify(measured)).not.toMatch(INVENTED);
    const stored = store.read('security:lastScan') as Record<string, unknown>;
    expect(stored).toMatchObject({ measured: true, dependency: { scanId: 'dep-3' } });
    expect(JSON.stringify(stored)).not.toMatch(INVENTED);
  });
});
