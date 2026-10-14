/**
 * #1049 review round 2: for a partial (incomplete) OSV dependency scan the
 * security-scan worker relays every advisory OSV returned for the packages that
 * were checked (any severity) AND reports the dependency side as unmeasured,
 * naming the unchecked packages. A partial scan never looks complete or clean.
 */
import { describe, it, expect } from 'vitest';
import { SecurityScanWorker } from '../../../../src/workers/workers/security-scan';
import { namespacedStore, contextFor } from './measured-worker-store';

const NS = 'security-compliance';
const recent = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

/** A record in the exact shape DependencyScanner.storeScanResults writes. */
function partialRecord(scanId: string, vulns: Array<{ pkg: string; severity: string; cveId: string }>) {
  const summary: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0, totalFiles: 2, scanDurationMs: 10 };
  for (const v of vulns) summary[v.severity]++;
  return {
    scanId, scanType: 'dependency', advisorySource: 'osv', status: 'incomplete', measured: false,
    packagesRequested: 2, packagesChecked: 1,
    uncheckedPackages: [{ name: 'left-pad', version: '^1.3.0', reason: 'HTTP 503' }],
    error: 'Dependency advisories could not be checked for 1 package(s): HTTP 503',
    vulnerabilities: vulns.map((v, i) => ({
      id: `uuid-${i}`, cveId: v.cveId, title: `${v.pkg}: advisory ${i}`, description: 'real advisory details',
      severity: v.severity, category: 'vulnerable-components',
      location: { file: 'package.json', line: 1, column: 1, snippet: `"${v.pkg}": "4.17.15"`, dependency: { name: v.pkg, version: '4.17.15', ecosystem: 'npm' } },
      remediation: { description: 'Update', fixExample: `npm install ${v.pkg}@4.17.21`, estimatedEffort: 'minor', automatable: true },
      references: [],
    })),
    summary,
    timestamp: recent(1),
  };
}

describe('#1049 — security-scan worker keeps a partial scan partial', () => {
  it('relays a medium advisory from a checked package and marks the dependency side unmeasured', async () => {
    const store = namespacedStore();
    await store.memory.set('security:scan:dep-partial', partialRecord('dep-partial', [
      { pkg: 'lodash', severity: 'medium', cveId: 'CVE-2020-28500' },
    ]), { namespace: NS });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    // The checked package's real advisory is relayed, whatever its severity.
    expect(result.findings).toContainEqual(expect.objectContaining({
      type: 'medium-vulnerability', severity: 'medium', resource: 'lodash',
      context: expect.objectContaining({ cve: 'CVE-2020-28500', partialScan: true }),
    }));
    // ...and the scan is not read as complete or clean.
    expect(result.metrics.domainMetrics).toMatchObject({
      dependencyScan: 'unmeasured',
      dependencyVulnerabilities: 'unmeasured',
      dependencyVulnerabilitiesInCheckedPackages: 1,
      dependencyPackagesUnchecked: 1,
    });
    const incomplete = result.findings.find((f) => f.type === 'dependency-scan-incomplete');
    expect(incomplete!.description).toMatch(/left-pad@\^1\.3\.0 \(HTTP 503\)/);
    expect(incomplete!.description).toMatch(/1 advisory finding\(s\) in the 1 checked package\(s\)/);
    expect(store.memory.set).not.toHaveBeenCalledWith('security:lastScan', expect.anything());
  });

  it('a partial scan with only critical/high findings still reports them all and stays unmeasured', async () => {
    const store = namespacedStore();
    await store.memory.set('security:scan:dep-partial', partialRecord('dep-partial', [
      { pkg: 'lodash', severity: 'critical', cveId: 'CVE-2019-10744' },
      { pkg: 'lodash', severity: 'low', cveId: 'CVE-2099-00001' },
    ]), { namespace: NS });

    const result = await new SecurityScanWorker().execute(contextFor(store.memory));

    const severities = result.findings.filter((f) => /-vulnerability$/.test(f.type)).map((f) => f.severity).sort();
    expect(severities).toEqual(['critical', 'low']);
    expect(result.metrics.domainMetrics).toMatchObject({ dependencyVulnerabilities: 'unmeasured', dependencyVulnerabilitiesInCheckedPackages: 2 });
    expect(result.metrics.healthScore).not.toBe(100);
  });
});
