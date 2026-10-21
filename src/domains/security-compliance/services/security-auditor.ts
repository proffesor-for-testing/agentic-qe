/**
 * Agentic QE v3 - Security Auditor Service
 * Orchestrator that delegates to focused modules for scanning and reporting.
 *
 * Extracted modules:
 *   - security-auditor-types.ts: Types, interfaces, config, HTTP client
 *   - security-auditor-sast.ts: Static Application Security Testing
 *   - security-auditor-dast.ts: Dynamic Application Security Testing
 *   - security-auditor-secrets.ts: Secret/credential detection
 *   - security-auditor-reports.ts: Risk calculation, posture, recommendations
 */

import { LoggerFactory } from '../../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import { readConfinedText } from '../../../shared/io/confined-read.js';
import * as path from 'path';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import { OSVClient, type ParsedVulnerability } from '../../../shared/security/osv-client.js';
import { lookupKey } from '../../../shared/security/osv-lookup.js';
import { resolveDependencies } from './scanners/dependency-resolver.js';

import type {
  DependencyScanResult,
  PackageSecurityInfo,
  UpgradeRecommendation,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  DependencyInfo,
  OutdatedPackage,
  RemediationAdvice,
  ScanSummary,
  UncheckedDependency,
  DetectedSecret,
  SecretScanResult,
  SecurityAuditOptions,
  SecurityAuditReport,
  SASTResult,
  DASTResult,
} from '../interfaces.js';

// Re-export types and interfaces from the types module
export type {
  ISecurityAuditorService,
  SecurityPostureSummary,
  TriagedVulnerabilities,
  SecurityAuditorConfig,
  PackageJson,
  OSVQueryRequest,
  OSVVulnerability,
  OSVQueryResponse,
  HttpResponse,
} from './security-auditor-types.js';

export { DEFAULT_CONFIG, httpPost, httpGet } from './security-auditor-types.js';

// Import types module for internal use
import type {
  ISecurityAuditorService,
  SecurityPostureSummary,
  TriagedVulnerabilities,
  SecurityAuditorConfig,
  PackageJson,
  OSVVulnerability,
} from './security-auditor-types.js';
import { DEFAULT_CONFIG, httpGet } from './security-auditor-types.js';

// Import extracted modules
import { performSASTScan } from './security-auditor-sast.js';
import { performDASTScan } from './security-auditor-dast.js';
import { scanFileForSecrets } from './security-auditor-secrets.js';
import {
  calculateOverallRisk,
  generateRecommendations,
  countBySeverity,
  countOpenVulnerabilities,
  calculateTrend,
  calculatePostureScore,
  generatePostureRecommendations,
  determinePriorityBucket,
} from './security-auditor-reports.js';

// ============================================================================
// Security Auditor Service Implementation
// ============================================================================

const logger = LoggerFactory.create('security-compliance/security-auditor');

/** Name of an unchecked entry that stands for a planning error (malformed lockfile, workspace root #1057). */
const PLANNING_ENTRY = '(dependency plan)';

/** Outcome of checking dependencies against OSV advisories (#1049). */
interface DependencyAdvisoryOutcome {
  vulnerabilities: Vulnerability[];
  status: 'complete' | 'incomplete' | 'failed';
  packagesChecked: number;
  uncheckedPackages: UncheckedDependency[];
  error?: string;
}

export class SecurityAuditorService implements ISecurityAuditorService {
  private readonly config: SecurityAuditorConfig;
  private readonly osvClient: OSVClient;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SecurityAuditorConfig> = {},
    osvClient?: OSVClient
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.osvClient = osvClient ?? new OSVClient();
  }

  // ==========================================================================
  // IDependencySecurityService Implementation
  // ==========================================================================

  async scanDependencies(manifestPath: FilePath): Promise<Result<DependencyScanResult>> {
    try {
      const manifest = manifestPath.value;
      const ecosystem = this.detectEcosystem(manifest);

      if (!ecosystem) {
        return err(new Error(`Unknown manifest format: ${manifest}`));
      }

      const outdatedPackages: OutdatedPackage[] = [];
      const { dependencies, preUnchecked } = await this.parseDependenciesForScan(manifest, ecosystem);
      const advisories = await this.checkDependencyAdvisories(dependencies, preUnchecked);

      for (const dep of dependencies) {
        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const summary = this.createDependencySummary(advisories.vulnerabilities, dependencies.length);
      const result = this.toDependencyScanResult(advisories, outdatedPackages, summary);

      await this.memory.set(
        `security:deps:${manifestPath.filename}`,
        result,
        { namespace: 'security-compliance', ttl: 86400 }
      );

      return ok(result);
    } catch (error) {
      return err(toError(error));
    }
  }

  async checkPackage(
    name: string,
    version: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<Result<PackageSecurityInfo>> {
    try {
      const vulnerabilities = await this.queryVulnerabilityDatabase(name, version, ecosystem);
      const latestVersion = await this.getLatestVersion(name, ecosystem);
      const isDeprecated = await this.checkDeprecation(name, ecosystem);

      return ok({ name, version, vulnerabilities, latestVersion, isDeprecated });
    } catch (error) {
      return err(toError(error));
    }
  }

  async getUpgradeRecommendations(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<UpgradeRecommendation[]>> {
    try {
      const recommendations: UpgradeRecommendation[] = [];

      const byPackage = new Map<string, Vulnerability[]>();
      for (const vuln of vulnerabilities) {
        const dep = vuln.location.dependency;
        if (dep) {
          const key = `${dep.ecosystem}:${dep.name}`;
          const existing = byPackage.get(key) || [];
          existing.push(vuln);
          byPackage.set(key, existing);
        }
      }

      for (const [key, vulns] of byPackage) {
        const [ecosystem, name] = key.split(':');
        const currentVersion = vulns[0].location.dependency?.version || 'unknown';
        const latestVersion = await this.getLatestVersion(
          name,
          ecosystem as DependencyInfo['ecosystem']
        );

        const fixedVersions = vulns
          .filter((v) => v.id)
          .map((v) => v.id);

        recommendations.push({
          package: name,
          fromVersion: currentVersion,
          toVersion: latestVersion,
          fixesVulnerabilities: fixedVersions,
          breakingChanges: this.hasBreakingChanges(currentVersion, latestVersion),
        });
      }

      recommendations.sort(
        (a, b) => b.fixesVulnerabilities.length - a.fixesVulnerabilities.length
      );

      return ok(recommendations);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ==========================================================================
  // Audit Functionality (delegates to extracted modules)
  // ==========================================================================

  async runAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>> {
    const auditId = uuidv4();
    const timestamp = new Date();

    try {
      let sastResults: SASTResult | undefined;
      let dastResults: DASTResult | undefined;
      let dependencyResults: DependencyScanResult | undefined;
      let secretScanResults: SecretScanResult | undefined;

      if (options.includeSAST) {
        sastResults = await performSASTScan(
          (dir) => this.findSourceFiles(dir),
          (fp) => this.shouldExclude(fp),
        );
      }

      if (options.includeDAST && options.targetUrl) {
        dastResults = await performDASTScan(options.targetUrl);
      }

      if (options.includeDependencies) {
        dependencyResults = await this.performDependencyScan();
      }

      if (options.includeSecrets) {
        secretScanResults = await this.performSecretScan();
      }

      const overallRiskScore = calculateOverallRisk(
        sastResults, dastResults, dependencyResults, secretScanResults
      );

      const recommendations = generateRecommendations(
        sastResults, dastResults, dependencyResults, secretScanResults
      );
      // #1049: an incomplete advisory lookup leaves dependency risk unmeasured.
      if (dependencyResults && dependencyResults.status !== 'complete') {
        recommendations.unshift(
          `${dependencyResults.error ?? 'Dependency advisories could not be checked'}. Dependency risk is unmeasured; re-run the scan when the OSV API is reachable.`
        );
      }

      const report: SecurityAuditReport = {
        auditId,
        timestamp,
        sastResults,
        dastResults,
        dependencyResults,
        secretScanResults,
        overallRiskScore,
        recommendations,
      };

      await this.memory.set(
        `security:audit:${auditId}`,
        report,
        { namespace: 'security-compliance', persist: true }
      );

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  async scanSecrets(files: FilePath[]): Promise<Result<SecretScanResult>> {
    try {
      const secretsFound: DetectedSecret[] = [];
      let filesScanned = 0;

      for (const file of files) {
        if (this.shouldExclude(file.value)) {
          continue;
        }
        filesScanned++;
        const secrets = await scanFileForSecrets(file);
        secretsFound.push(...secrets);
      }

      return ok({ secretsFound, filesScanned });
    } catch (error) {
      return err(toError(error));
    }
  }

  async getSecurityPosture(): Promise<Result<SecurityPostureSummary>> {
    try {
      const audits = await this.getRecentAudits();
      const latestAudit = audits[0];
      const previousAudit = audits[1];

      const criticalIssues = countBySeverity(latestAudit, 'critical');
      const highIssues = countBySeverity(latestAudit, 'high');
      const openVulnerabilities = countOpenVulnerabilities(latestAudit);
      const trend = calculateTrend(latestAudit, previousAudit);
      const overallScore = calculatePostureScore(criticalIssues, highIssues, openVulnerabilities);
      const recommendations = generatePostureRecommendations(criticalIssues, highIssues, overallScore);

      return ok({
        overallScore,
        trend,
        criticalIssues,
        highIssues,
        openVulnerabilities,
        resolvedLastWeek: await this.countResolvedLastWeek(),
        averageResolutionTime: await this.calculateAverageResolutionTime(),
        lastAuditDate: latestAudit?.timestamp ?? new Date(),
        recommendations,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  async triageVulnerabilities(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<TriagedVulnerabilities>> {
    try {
      const triaged: TriagedVulnerabilities = {
        immediate: [],
        shortTerm: [],
        mediumTerm: [],
        longTerm: [],
        accepted: [],
      };

      for (const vuln of vulnerabilities) {
        const bucket = determinePriorityBucket(vuln);
        triaged[bucket].push(vuln);
      }

      const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
      for (const bucket of Object.values(triaged)) {
        bucket.sort(
          (a: Vulnerability, b: Vulnerability) =>
            severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
        );
      }

      return ok(triaged);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ==========================================================================
  // Dependency Analysis Helpers
  // ==========================================================================

  private detectEcosystem(manifest: string): DependencyInfo['ecosystem'] | null {
    if (manifest.includes('package.json')) return 'npm';
    if (manifest.includes('requirements.txt') || manifest.includes('Pipfile')) return 'pip';
    if (manifest.includes('pom.xml') || manifest.includes('build.gradle')) return 'maven';
    if (manifest.includes('Cargo.toml')) return 'cargo';
    if (manifest.includes('.csproj') || manifest.includes('packages.config')) return 'nuget';
    return null;
  }

  private async parseDependencies(
    manifest: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    try {
      if (ecosystem === 'npm') {
        const content = await readConfinedText(manifest, { outsideRoot: 'allow' }); // #1161
        const packageJson: PackageJson = safeJsonParse(content);
        const allDeps: Record<string, string> = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
          ...packageJson.optionalDependencies,
        };
        // Declared specs only; scans resolve versions via parseDependenciesForScan (#1049).
        for (const [name, versionSpec] of Object.entries(allDeps)) {
          dependencies.push({ name, version: versionSpec, ecosystem: 'npm' });
        }
      } else if (ecosystem === 'pip') {
        const content = await readConfinedText(manifest, { outsideRoot: 'allow' }); // #1161
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          // Only an `==` pin is a concrete version; any other specifier is kept
          // verbatim so the lookup reports it unchecked (#1049).
          const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(===?|>=|<=|~=|!=|>|<)?\s*([^\s;#]+)?/);
          if (match) {
            const [, name, op, value] = match;
            dependencies.push({
              name,
              version: value && (op === '==' || op === '===') ? value : op && value ? `${op}${value}` : '*',
              ecosystem: 'pip',
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to parse dependencies from ${manifest}:`, error instanceof Error ? error : undefined);
      // #1049: an unreadable manifest is a failed scan, not a project with no dependencies.
      throw error;
    }

    return dependencies;
  }

  /**
   * Dependencies to check for a scan. npm uses the shared resolver (#1049):
   * lockfile-resolved versions when in sync with package.json, exact specs
   * otherwise, local packages excluded; anything that cannot be matched without
   * guessing is returned as pre-unchecked. Planning errors (a malformed lockfile,
   * a workspace root whose members are not scanned, #1057) are pre-unchecked too,
   * so the audit is never complete when they occur.
   */
  private async parseDependenciesForScan(
    manifest: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<{ dependencies: DependencyInfo[]; preUnchecked: UncheckedDependency[] }> {
    if (ecosystem !== 'npm') return { dependencies: await this.parseDependencies(manifest, ecosystem), preUnchecked: [] };
    let resolution: Awaited<ReturnType<typeof resolveDependencies>>;
    try {
      resolution = await resolveDependencies(manifest);
    } catch (error) {
      logger.error(`Failed to parse dependencies from ${manifest}:`, error instanceof Error ? error : undefined);
      // #1049: an unreadable manifest is a failed scan, not a project with no dependencies.
      throw error;
    }
    const dependencies: DependencyInfo[] = [];
    const preUnchecked: UncheckedDependency[] = [];
    for (const dep of resolution.dependencies) {
      if (dep.kind === 'check') dependencies.push({ name: dep.packageName!, version: dep.version!, ecosystem: 'npm' });
      else if (dep.kind === 'unchecked') {
        preUnchecked.push({ name: dep.name, version: dep.spec, reason: dep.reason ?? 'not checked',
          ...(dep.member ? { member: dep.member } : {}), ...(dep.lockedVersion ? { lockedVersion: dep.lockedVersion } : {}) });
      }
    }
    for (const reason of [...(resolution.error ? [resolution.error] : []), ...resolution.memberErrors]) {
      preUnchecked.push({ name: PLANNING_ENTRY, version: '*', reason });
    }
    return { dependencies, preUnchecked };
  }

  /**
   * Check dependencies against OSV advisories. A failed or partial lookup is
   * reported with the unchecked dependencies, never as "no vulnerabilities" (#1049).
   */
  private async checkDependencyAdvisories(
    dependencies: DependencyInfo[],
    preUnchecked: UncheckedDependency[] = []
  ): Promise<DependencyAdvisoryOutcome> {
    const lookup = await this.osvClient.lookupBatch(dependencies.map((dep) => ({
      name: dep.name, ecosystem: this.mapToOSVEcosystem(dep.ecosystem), version: dep.version,
    })));
    const vulnerabilities: Vulnerability[] = [];
    for (const dep of dependencies) {
      const found = lookup.results.get(lookupKey({ ecosystem: this.mapToOSVEcosystem(dep.ecosystem), name: dep.name, version: dep.version })) ?? [];
      vulnerabilities.push(...found.map((parsed) => this.mapParsedVulnerability(parsed, dep)));
    }
    const uncheckedPackages: UncheckedDependency[] = [...preUnchecked, ...lookup.unchecked.map((pkg) => ({
      name: pkg.name, version: pkg.version ?? 'unknown', reason: pkg.reason,
    }))];
    const reasons = lookup.errors.length > 0 ? lookup.errors : [...new Set(uncheckedPackages.map((p) => p.reason))];
    const requested = lookup.packagesChecked + uncheckedPackages.length;
    // `failed` only when a real package was to be checked and none was; a planning
    // error alone (e.g. an empty workspace root) is incomplete, as in the scanner.
    const realRequested = requested - uncheckedPackages.filter((p) => p.name === PLANNING_ENTRY).length;
    const status = lookup.packagesChecked === requested ? 'complete'
      : lookup.packagesChecked === 0 && realRequested > 0 ? 'failed' : 'incomplete';
    return {
      vulnerabilities,
      status,
      packagesChecked: lookup.packagesChecked,
      uncheckedPackages,
      ...(status === 'complete' ? {} : {
        error: `Dependency advisories could not be checked for ${uncheckedPackages.length} package(s): ${reasons.slice(0, 3).join('; ')}`,
      }),
    };
  }

  private toDependencyScanResult(
    advisories: DependencyAdvisoryOutcome,
    outdatedPackages: OutdatedPackage[],
    summary: ScanSummary
  ): DependencyScanResult {
    return {
      vulnerabilities: advisories.vulnerabilities,
      outdatedPackages,
      summary,
      status: advisories.status,
      measured: advisories.status === 'complete',
      packagesChecked: advisories.packagesChecked,
      uncheckedPackages: advisories.uncheckedPackages,
      ...(advisories.error ? { error: advisories.error } : {}),
    };
  }

  private mapToOSVEcosystem(ecosystem: DependencyInfo['ecosystem']): string {
    const ecosystemMap: Record<DependencyInfo['ecosystem'], string> = {
      npm: 'npm',
      pip: 'PyPI',
      maven: 'Maven',
      nuget: 'NuGet',
      cargo: 'crates.io',
    };
    return ecosystemMap[ecosystem];
  }

  private mapParsedVulnerability(parsed: ParsedVulnerability, dep: DependencyInfo): Vulnerability {
    const fixedVersion = parsed.fixedVersions[0];
    const location: VulnerabilityLocation = {
      file: dep.ecosystem === 'pip' ? 'requirements.txt' : 'package.json',
      dependency: dep,
    };

    const remediation: RemediationAdvice = {
      description: fixedVersion
        ? `Upgrade ${dep.name} to version ${fixedVersion} or higher`
        : `Review and address vulnerability in ${dep.name}`,
      fixExample: fixedVersion ? `"${dep.name}": "^${fixedVersion}"` : undefined,
      estimatedEffort: fixedVersion ? 'trivial' : 'moderate',
      automatable: !!fixedVersion,
    };

    return {
      id: uuidv4(),
      cveId: parsed.cveIds[0],
      title: parsed.summary || `Vulnerability in ${dep.name}`,
      description: parsed.details || parsed.summary || 'No description available',
      // An advisory without a severity rating stays reported, at medium (as before).
      severity: parsed.severity === 'unknown' ? 'medium' : parsed.severity as VulnerabilitySeverity,
      category: this.categorizeVulnerability({ summary: parsed.summary, details: parsed.details }),
      location,
      remediation,
      references: parsed.references,
    };
  }

  private categorizeVulnerability(osvVuln: Pick<OSVVulnerability, 'summary' | 'details'>): VulnerabilityCategory {
    const summary = (osvVuln.summary || '').toLowerCase();
    const details = (osvVuln.details || '').toLowerCase();
    const combined = `${summary} ${details}`;

    if (combined.includes('injection') || combined.includes('sql')) return 'injection';
    if (combined.includes('xss') || combined.includes('cross-site scripting')) return 'xss';
    if (combined.includes('authentication') || combined.includes('auth bypass')) return 'broken-auth';
    if (combined.includes('sensitive data') || combined.includes('exposure')) return 'sensitive-data';
    if (combined.includes('xxe') || combined.includes('xml external')) return 'xxe';
    if (combined.includes('access control') || combined.includes('authorization')) return 'access-control';
    if (combined.includes('deseriali')) return 'insecure-deserialization';
    if (combined.includes('prototype pollution') || combined.includes('dependency')) return 'vulnerable-components';

    return 'vulnerable-components';
  }

  private async checkOutdated(dep: DependencyInfo): Promise<OutdatedPackage | null> {
    const latestVersion = await this.getLatestVersion(dep.name, dep.ecosystem);

    // A failed registry lookup ('unknown') is not evidence the package is outdated.
    if (latestVersion !== 'unknown' && latestVersion !== dep.version) {
      return {
        name: dep.name,
        currentVersion: dep.version,
        latestVersion,
        updateType: this.determineUpdateType(dep.version, latestVersion),
      };
    }

    return null;
  }

  private async queryVulnerabilityDatabase(
    name: string,
    version: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<Vulnerability[]> {
    const outcome = await this.checkDependencyAdvisories([{ name, version, ecosystem }]);
    if (outcome.status !== 'complete') {
      throw new Error(outcome.error ?? `Dependency advisories could not be checked for ${name}@${version}`);
    }
    return outcome.vulnerabilities;
  }

  private async getLatestVersion(
    name: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<string> {
    try {
      if (ecosystem === 'npm') {
        const response = await httpGet<{ 'dist-tags'?: { latest?: string }; version?: string }>(
          `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
        );
        if (response.ok && response.data.version) {
          return response.data.version;
        }
      } else if (ecosystem === 'pip') {
        const response = await httpGet<{ info?: { version?: string } }>(
          `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
        );
        if (response.ok && response.data.info?.version) {
          return response.data.info.version;
        }
      }
    } catch (error) {
      logger.error(`Failed to get latest version for ${name}:`, error instanceof Error ? error : undefined);
    }

    return 'unknown';
  }

  private async checkDeprecation(
    name: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<boolean> {
    try {
      if (ecosystem === 'npm') {
        const response = await httpGet<{ deprecated?: string }>(
          `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
        );
        if (response.ok && response.data.deprecated) {
          return true;
        }
      }
    } catch (error) {
      logger.error(`Failed to check deprecation for ${name}:`, error instanceof Error ? error : undefined);
    }

    return false;
  }

  private determineUpdateType(
    current: string,
    latest: string
  ): 'major' | 'minor' | 'patch' {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    if (latestParts[0] > currentParts[0]) return 'major';
    if (latestParts[1] > currentParts[1]) return 'minor';
    return 'patch';
  }

  private hasBreakingChanges(current: string, latest: string): boolean {
    const currentMajor = parseInt(current.split('.')[0]);
    const latestMajor = parseInt(latest.split('.')[0]);
    return latestMajor > currentMajor;
  }

  private createDependencySummary(
    vulnerabilities: Vulnerability[],
    totalDeps: number
  ): ScanSummary {
    let critical = 0, high = 0, medium = 0, low = 0, informational = 0;

    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
        case 'critical': critical++; break;
        case 'high': high++; break;
        case 'medium': medium++; break;
        case 'low': low++; break;
        case 'informational': informational++; break;
      }
    }

    return { critical, high, medium, low, informational, totalFiles: totalDeps, scanDurationMs: 0 };
  }

  // ==========================================================================
  // File & Scan Helpers
  // ==========================================================================

  private shouldExclude(filePath: string): boolean {
    return this.config.excludePatterns.some((pattern) => {
      if (pattern.startsWith('*')) {
        return filePath.endsWith(pattern.slice(1));
      }
      return filePath.includes(pattern);
    });
  }

  private async performDependencyScan(): Promise<DependencyScanResult> {
    const startTime = Date.now();
    const outdatedPackages: OutdatedPackage[] = [];
    const manifestPath = path.join(process.cwd(), 'package.json');

    try {
      const { dependencies, preUnchecked } = await this.parseDependenciesForScan(manifestPath, 'npm');
      const advisories = await this.checkDependencyAdvisories(dependencies, preUnchecked);

      for (const dep of dependencies) {
        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const baseSummary = this.createDependencySummary(advisories.vulnerabilities, dependencies.length);
      return this.toDependencyScanResult(advisories, outdatedPackages, { ...baseSummary, scanDurationMs: Date.now() - startTime });
    } catch (error) {
      logger.error('Dependency scan failed:', error instanceof Error ? error : undefined);
      // #1049: a scan that could not run is failed, never an empty clean result.
      return {
        vulnerabilities: [],
        outdatedPackages: [],
        summary: {
          critical: 0, high: 0, medium: 0, low: 0, informational: 0,
          totalFiles: 0, scanDurationMs: Date.now() - startTime,
        },
        status: 'failed',
        measured: false,
        packagesChecked: 0,
        uncheckedPackages: [],
        error: `Dependency scan of ${manifestPath} failed: ${toError(error).message}`,
      };
    }
  }

  private async performSecretScan(): Promise<SecretScanResult> {
    const secretsFound: DetectedSecret[] = [];
    let filesScanned = 0;

    try {
      const sourceFiles = await this.findSourceFiles(process.cwd());

      for (const filePath of sourceFiles) {
        if (this.shouldExclude(filePath)) {
          continue;
        }
        filesScanned++;
        const filePathObj = { value: filePath } as FilePath;
        const secrets = await scanFileForSecrets(filePathObj);
        secretsFound.push(...secrets);
      }
    } catch (error) {
      logger.error('Secret scan failed:', error instanceof Error ? error : undefined);
    }

    return { secretsFound, filesScanned };
  }

  private async findSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
    const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.json', '.env', '.yaml', '.yml', '.config'];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (this.shouldExclude(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.findSourceFiles(fullPath, files);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (sourceExtensions.includes(ext) || entry.name.startsWith('.env')) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      logger.debug('Directory read error:');
    }

    return files;
  }

  // ==========================================================================
  // Historical Analysis Helpers
  // ==========================================================================

  private async getRecentAudits(): Promise<SecurityAuditReport[]> {
    const keys = await this.memory.search('security:audit:*', 10);
    const audits: SecurityAuditReport[] = [];

    for (const key of keys) {
      const audit = await this.memory.get<SecurityAuditReport>(key);
      if (audit) {
        audits.push(audit);
      }
    }

    return audits.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  private async countResolvedLastWeek(): Promise<number> {
    try {
      const audits = await this.getRecentAudits();
      if (audits.length < 2) return 0;

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentAudits = audits.filter(
        (audit) => new Date(audit.timestamp) >= oneWeekAgo
      );

      if (recentAudits.length < 2) return 0;

      const oldest = recentAudits[recentAudits.length - 1];
      const newest = recentAudits[0];

      const oldCount = countOpenVulnerabilities(oldest);
      const newCount = countOpenVulnerabilities(newest);

      return Math.max(0, oldCount - newCount);
    } catch (error) {
      logger.error('Failed to count resolved vulnerabilities:', error instanceof Error ? error : undefined);
      return 0;
    }
  }

  private async calculateAverageResolutionTime(): Promise<number> {
    try {
      const audits = await this.getRecentAudits();
      if (audits.length < 2) return 72;

      const vulnFirstSeen = new Map<string, Date>();
      const resolutionTimes: number[] = [];
      const sortedAudits = [...audits].reverse();

      for (const audit of sortedAudits) {
        const currentVulnIds = new Set<string>();

        if (audit.sastResults) {
          audit.sastResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }
        if (audit.dastResults) {
          audit.dastResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }
        if (audit.dependencyResults) {
          audit.dependencyResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }

        for (const vulnId of currentVulnIds) {
          if (!vulnFirstSeen.has(vulnId)) {
            vulnFirstSeen.set(vulnId, audit.timestamp);
          }
        }

        for (const [vulnId, firstSeen] of vulnFirstSeen) {
          if (!currentVulnIds.has(vulnId)) {
            const resolutionTime = (audit.timestamp.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);
            resolutionTimes.push(resolutionTime);
            vulnFirstSeen.delete(vulnId);
          }
        }
      }

      if (resolutionTimes.length === 0) return 72;

      const sum = resolutionTimes.reduce((acc, time) => acc + time, 0);
      return Math.round(sum / resolutionTimes.length);
    } catch (error) {
      logger.error('Failed to calculate average resolution time:', error instanceof Error ? error : undefined);
      return 72;
    }
  }
}
