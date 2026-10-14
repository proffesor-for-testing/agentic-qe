/**
 * Agentic QE v3 - Dependency Scanner
 * Scans npm dependencies for known vulnerabilities using OSV API
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '@shared/types/index.js';
import { OSVClient, ParsedVulnerability } from '@shared/security/index.js';
import { lookupKey } from '@shared/security/osv-lookup.js';
import { toError } from '@shared/error-utils.js';
import type {
  SecurityScannerConfig,
  DependencyScanResult,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityLocation,
  RemediationAdvice,
  ScanSummary,
  MemoryBackend,
  MutableScanSummary,
  ScanStatus,
  UncheckedDependency,
  LocalDependency,
} from './scanner-types.js';
import { resolveDependencies, resolveFromRecord, type ResolvedDependency } from './dependency-resolver.js';

/** What a scan will do with each declared dependency, plus provenance. */
interface ScanPlan {
  dependencies: ResolvedDependency[];
  lockfile: string | null;
  workspaceMembers: string[];
  /** Planning problems (unreadable lockfile / member manifests). */
  errors: string[];
}

// ============================================================================
// Dependency Scanner Service
// ============================================================================

/**
 * Dependency Scanner - OSV-based Vulnerability Detection
 * Scans npm dependencies for known vulnerabilities using the OSV API
 */
export class DependencyScanner {
  private readonly config: SecurityScannerConfig;
  private readonly memory: MemoryBackend;
  private readonly osvClient: OSVClient;
  private readonly activeScans: Map<string, ScanStatus>;

  constructor(
    config: SecurityScannerConfig,
    memory: MemoryBackend,
    activeScans?: Map<string, ScanStatus>,
    osvClient?: OSVClient
  ) {
    this.config = config;
    this.memory = memory;
    this.osvClient = osvClient ?? new OSVClient({ enableCache: true });
    this.activeScans = activeScans || new Map();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Scan npm dependencies (`name -> spec`) for known vulnerabilities using OSV.
   *
   * #1049: a failed or partial advisory lookup is recorded and returned as
   * `status: 'failed' | 'incomplete'`, `measured: false`, with the unchecked
   * dependencies and the error, never as a clean scan. Findings for the
   * dependencies that were checked are kept.
   *
   * Each dependency is checked at `lockedVersions[name]` when given and
   * consistent with the spec, else only when its spec is an exact version; a
   * range with no resolution is reported unchecked, never guessed.
   */
  async scanDependencies(
    dependencies: Record<string, string>,
    lockedVersions: Record<string, string> = {}
  ): Promise<Result<DependencyScanResult>> {
    if (Object.keys(dependencies).length === 0) {
      return err(new Error('No dependencies provided for scanning'));
    }
    return this.runScan({ dependencies: resolveFromRecord(dependencies, lockedVersions), lockfile: null, workspaceMembers: [], errors: [] });
  }

  /**
   * Scan a package.json: its direct dependencies (and, at a workspace root,
   * each workspace member's), at the versions the lockfile resolves.
   * A manifest with no dependencies is a complete scan of nothing.
   */
  async scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>> {
    try {
      const resolution = await resolveDependencies(packageJsonPath);
      return this.runScan({
        dependencies: resolution.dependencies,
        lockfile: resolution.lockfile,
        workspaceMembers: resolution.workspaceMembers,
        errors: [...(resolution.error ? [resolution.error] : []), ...resolution.memberErrors],
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return err(new Error(`Invalid JSON in package.json: ${error.message}`));
      }
      return err(toError(error));
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return this.activeScans.get(scanId) ?? 'pending';
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private async runScan(plan: ScanPlan): Promise<Result<DependencyScanResult>> {
    const scanId = uuidv4();
    const startTime = Date.now();

    try {
      this.activeScans.set(scanId, 'running');

      const toCheck = plan.dependencies.filter((d) => d.kind === 'check');
      const queries = [...new Map(toCheck.map((d) => {
        const q = { name: d.packageName!, ecosystem: 'npm', version: d.version! };
        return [lookupKey(q), q] as const;
      })).values()];
      const lookup = await this.osvClient.lookupBatch(queries);
      const failedQueries = new Map(lookup.unchecked.map((u) => [lookupKey(u), u.reason]));

      const vulnerabilities: Vulnerability[] = [];
      const uncheckedPackages: UncheckedDependency[] = [];
      const localPackages: LocalDependency[] = [];
      const vulnerablePackages = new Set<string>();
      let packagesChecked = 0;
      const memberField = (d: ResolvedDependency) => (d.member ? { member: d.member } : {});

      for (const dep of plan.dependencies) {
        if (dep.kind === 'local') {
          localPackages.push({ name: dep.name, spec: dep.spec, reason: dep.reason ?? 'local package', ...memberField(dep) });
          continue;
        }
        if (dep.kind === 'unchecked') {
          uncheckedPackages.push({ name: dep.name, version: dep.spec, reason: dep.reason ?? 'not checked', ...memberField(dep),
            ...(dep.lockedVersion ? { lockedVersion: dep.lockedVersion } : {}) });
          continue;
        }
        const key = lookupKey({ name: dep.packageName!, ecosystem: 'npm', version: dep.version! });
        const found = lookup.results.get(key);
        if (!found) {
          uncheckedPackages.push({ name: dep.name, version: dep.spec, reason: failedQueries.get(key) ?? 'advisory lookup did not return a result',
            ...memberField(dep), ...(dep.lockedVersion ? { lockedVersion: dep.lockedVersion } : {}) });
          continue;
        }
        packagesChecked++;
        if (found.length > 0) vulnerablePackages.add(dep.packageName!);
        vulnerabilities.push(...this.convertOSVVulnerabilities(found, dep));
      }

      const requested = packagesChecked + uncheckedPackages.length;
      const status: DependencyScanResult['status'] = packagesChecked === requested ? 'complete' : packagesChecked === 0 ? 'failed' : 'incomplete';
      const scanDurationMs = Date.now() - startTime;
      const summary = this.calculateSummary(vulnerabilities, requested, scanDurationMs);
      const error = status === 'complete' ? undefined
        : describeLookupFailure([...lookup.errors, ...plan.errors], uncheckedPackages);

      const result: DependencyScanResult = {
        scanId,
        vulnerabilities,
        packagesScanned: requested,
        vulnerablePackages: vulnerablePackages.size,
        summary,
        scanDurationMs,
        status,
        measured: status === 'complete',
        packagesChecked,
        uncheckedPackages,
        lockfile: plan.lockfile,
        localPackages,
        workspaceMembers: plan.workspaceMembers,
        scope: 'direct',
        ...(error ? { error } : {}),
      };

      await this.storeScanResults(result);
      this.activeScans.set(scanId, status === 'complete' ? 'completed' : 'failed');
      return ok(result);
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(toError(error));
    }
  }

  /**
   * Convert OSV vulnerabilities of one checked dependency to our internal format
   */
  private convertOSVVulnerabilities(osvVulns: ParsedVulnerability[], dep: ResolvedDependency): Vulnerability[] {
    const pkg = dep.packageName!;
    const label = pkg === dep.name ? pkg : `${dep.name} (${pkg})`;
    return osvVulns.map((osv) => {
      const location: VulnerabilityLocation = {
        file: dep.member ? `${dep.member}/package.json` : 'package.json',
        line: 1,
        column: 1,
        snippet: `"${dep.name}": "${dep.spec}"`,
        dependency: { name: pkg, version: dep.version!, ecosystem: 'npm' },
      };

      const remediation: RemediationAdvice = {
        description: osv.fixedVersions.length > 0
          ? `Update to version ${osv.fixedVersions[0]} or later`
          : 'No fixed version available; consider alternative packages',
        fixExample: osv.fixedVersions.length > 0
          ? `npm install ${pkg}@${osv.fixedVersions[0]}`
          : undefined,
        estimatedEffort: 'minor',
        automatable: true,
      };

      return {
        id: uuidv4(),
        cveId: osv.cveIds[0],
        title: `${label}: ${osv.summary.substring(0, 80)}`,
        description: osv.details || osv.summary,
        severity: this.mapOSVSeverity(osv.severity),
        category: 'vulnerable-components',
        location,
        remediation,
        references: osv.references.slice(0, 5),
      };
    });
  }

  /**
   * Map OSV severity to our severity type
   */
  private mapOSVSeverity(
    osvSeverity: ParsedVulnerability['severity']
  ): VulnerabilitySeverity {
    const mapping: Record<ParsedVulnerability['severity'], VulnerabilitySeverity> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
      unknown: 'medium',
    };
    return mapping[osvSeverity];
  }

  /**
   * Calculate scan summary
   */
  private calculateSummary(
    vulnerabilities: Vulnerability[],
    totalFiles: number,
    scanDurationMs: number
  ): ScanSummary {
    const summary: MutableScanSummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
      totalFiles,
      scanDurationMs,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary as ScanSummary;
  }

  /**
   * Store the scan record read by the security-scan worker (#1043/#1049).
   * Consumers must treat it as a measurement only when
   * `measured === true && status === 'complete'`.
   */
  private async storeScanResults(result: DependencyScanResult): Promise<void> {
    await this.memory.set(
      `security:scan:${result.scanId}`,
      {
        scanId: result.scanId,
        scanType: 'dependency',
        advisorySource: 'osv',
        status: result.status,
        measured: result.measured,
        scope: result.scope ?? 'direct',
        packagesRequested: result.packagesScanned,
        packagesChecked: result.packagesChecked,
        uncheckedPackages: result.uncheckedPackages,
        localPackages: result.localPackages ?? [],
        workspaceMembers: result.workspaceMembers ?? [],
        lockfile: result.lockfile ?? null,
        ...(result.error ? { error: result.error } : {}),
        vulnerabilities: result.vulnerabilities,
        summary: result.summary,
        timestamp: new Date().toISOString(),
      },
      { namespace: 'security-compliance', ttl: 86400 * 7 }
    );
  }
}

/** One bounded sentence naming why the advisory lookup is incomplete. */
function describeLookupFailure(errors: string[], unchecked: UncheckedDependency[]): string {
  const reasons = errors.length > 0 ? errors : [...new Set(unchecked.map((p) => p.reason))];
  return `Dependency advisories could not be checked for ${unchecked.length} package(s): ${reasons.slice(0, 3).join('; ')}`;
}
