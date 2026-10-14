/**
 * Agentic QE v3 - Dependency Scanner
 * Scans npm dependencies for known vulnerabilities using OSV API
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '@shared/types/index.js';
import { OSVClient, ParsedVulnerability } from '@shared/security/index.js';
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
} from './scanner-types.js';
import { safeJsonParse } from '@shared/safe-json.js';

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
   * Scan npm dependencies for known vulnerabilities using the OSV API.
   *
   * #1049: a failed or partial advisory lookup is recorded and returned as
   * `status: 'failed' | 'incomplete'`, `measured: false`, with the unchecked
   * dependencies and the error, never as a clean scan. Findings for the
   * dependencies that were checked are kept.
   */
  async scanDependencies(
    dependencies: Record<string, string>
  ): Promise<Result<DependencyScanResult>> {
    const scanId = uuidv4();
    const startTime = Date.now();

    try {
      if (Object.keys(dependencies).length === 0) {
        return err(new Error('No dependencies provided for scanning'));
      }

      this.activeScans.set(scanId, 'running');

      const lookup = await this.osvClient.lookupNpmDependencies(dependencies);
      const osvVulns = [...lookup.results.values()].flat();
      const vulnerabilities = this.convertOSVVulnerabilities(osvVulns, dependencies);
      const scanDurationMs = Date.now() - startTime;
      const vulnerablePackageNames = new Set(osvVulns.map((v) => v.affectedPackage));
      const summary = this.calculateSummary(vulnerabilities, Object.keys(dependencies).length, scanDurationMs);
      const uncheckedPackages: UncheckedDependency[] = lookup.unchecked.map((pkg) => ({
        name: pkg.name,
        version: dependencies[pkg.name] ?? pkg.version ?? 'unknown',
        reason: pkg.reason,
      }));
      const error = lookup.status === 'complete' ? undefined : describeLookupFailure(lookup.errors, uncheckedPackages);

      const result: DependencyScanResult = {
        scanId,
        vulnerabilities,
        packagesScanned: Object.keys(dependencies).length,
        vulnerablePackages: vulnerablePackageNames.size,
        summary,
        scanDurationMs,
        status: lookup.status,
        measured: lookup.status === 'complete',
        packagesChecked: lookup.packagesChecked,
        uncheckedPackages,
        ...(error ? { error } : {}),
      };

      await this.storeScanResults(result);
      this.activeScans.set(scanId, lookup.status === 'complete' ? 'completed' : 'failed');
      return ok(result);
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(toError(error));
    }
  }

  /**
   * Scan a package.json file for dependency vulnerabilities
   */
  async scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>> {
    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = safeJsonParse(content);

      // Combine all dependency types
      const allDependencies: Record<string, string> = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
        ...(packageJson.peerDependencies || {}),
        ...(packageJson.optionalDependencies || {}),
      };

      if (Object.keys(allDependencies).length === 0) {
        return err(new Error('No dependencies found in package.json'));
      }

      return this.scanDependencies(allDependencies);
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

  /**
   * Convert OSV vulnerabilities to our internal format
   */
  private convertOSVVulnerabilities(
    osvVulns: ParsedVulnerability[],
    dependencies: Record<string, string>
  ): Vulnerability[] {
    return osvVulns.map((osv) => {
      const declared = dependencies[osv.affectedPackage];
      const location: VulnerabilityLocation = {
        file: 'package.json',
        line: 1,
        column: 1,
        snippet: `"${osv.affectedPackage}": "${declared ?? '...'}"`,
        ...(declared !== undefined
          ? { dependency: { name: osv.affectedPackage, version: declared, ecosystem: 'npm' as const } }
          : {}),
      };

      const remediation: RemediationAdvice = {
        description: osv.fixedVersions.length > 0
          ? `Update to version ${osv.fixedVersions[0]} or later`
          : 'No fixed version available; consider alternative packages',
        fixExample: osv.fixedVersions.length > 0
          ? `npm install ${osv.affectedPackage}@${osv.fixedVersions[0]}`
          : undefined,
        estimatedEffort: 'minor',
        automatable: true,
      };

      return {
        id: uuidv4(),
        cveId: osv.cveIds[0],
        title: `${osv.affectedPackage}: ${osv.summary.substring(0, 80)}`,
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
        packagesRequested: result.packagesScanned,
        packagesChecked: result.packagesChecked,
        uncheckedPackages: result.uncheckedPackages,
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
