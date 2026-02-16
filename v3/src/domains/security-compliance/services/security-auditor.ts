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

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

import type {
  IDependencySecurityService,
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
  OSVQueryRequest,
  OSVQueryResponse,
  OSVVulnerability,
} from './security-auditor-types.js';
import { DEFAULT_CONFIG, httpPost, httpGet } from './security-auditor-types.js';

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

export class SecurityAuditorService implements ISecurityAuditorService {
  private readonly config: SecurityAuditorConfig;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SecurityAuditorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
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

      const vulnerabilities: Vulnerability[] = [];
      const outdatedPackages: OutdatedPackage[] = [];
      const dependencies = await this.parseDependencies(manifest, ecosystem);

      for (const dep of dependencies) {
        const vulns = await this.checkDependencyVulnerabilities(dep, ecosystem);
        vulnerabilities.push(...vulns);

        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const summary = this.createDependencySummary(vulnerabilities, dependencies.length);

      await this.memory.set(
        `security:deps:${manifestPath.filename}`,
        { vulnerabilities, outdatedPackages, summary },
        { namespace: 'security-compliance', ttl: 86400 }
      );

      return ok({ vulnerabilities, outdatedPackages, summary });
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
        const content = await fs.readFile(manifest, 'utf-8');
        const packageJson: PackageJson = safeJsonParse(content);

        const allDeps: Record<string, string> = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
          ...packageJson.optionalDependencies,
        };

        for (const [name, versionSpec] of Object.entries(allDeps)) {
          const version = this.cleanVersionSpec(versionSpec);
          dependencies.push({ name, version, ecosystem: 'npm' });
        }
      } else if (ecosystem === 'pip') {
        const content = await fs.readFile(manifest, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>~!]+(.+))?$/);
          if (match) {
            dependencies.push({
              name: match[1],
              version: match[2] || 'latest',
              ecosystem: 'pip',
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to parse dependencies from ${manifest}:`, error);
    }

    return dependencies;
  }

  private cleanVersionSpec(versionSpec: string): string {
    return versionSpec.replace(/^[\^~>=<]+/, '').trim();
  }

  private async checkDependencyVulnerabilities(
    dep: DependencyInfo,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      const osvEcosystem = this.mapToOSVEcosystem(ecosystem);

      const osvQuery: OSVQueryRequest = {
        package: { name: dep.name, ecosystem: osvEcosystem },
        version: dep.version,
      };

      const response = await httpPost<OSVQueryRequest, OSVQueryResponse>(
        'https://api.osv.dev/v1/query',
        osvQuery
      );

      if (response.ok && response.data.vulns && response.data.vulns.length > 0) {
        for (const osvVuln of response.data.vulns) {
          const vulnerability = this.mapOSVVulnerability(osvVuln, dep);
          vulnerabilities.push(vulnerability);
        }
      }
    } catch (error) {
      console.error(`Failed to check vulnerabilities for ${dep.name}@${dep.version}:`, error);
    }

    return vulnerabilities;
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

  private mapOSVVulnerability(osvVuln: OSVVulnerability, dep: DependencyInfo): Vulnerability {
    const cveId = osvVuln.aliases?.find((alias) => alias.startsWith('CVE-'));
    const severity = this.mapOSVSeverity(osvVuln.severity);
    const fixedVersion = this.extractFixedVersion(osvVuln);
    const references = osvVuln.references?.map((ref) => ref.url) || [];

    const location: VulnerabilityLocation = {
      file: 'package.json',
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
      cveId,
      title: osvVuln.summary || `Vulnerability in ${dep.name}`,
      description: osvVuln.details || osvVuln.summary || 'No description available',
      severity,
      category: this.categorizeVulnerability(osvVuln),
      location,
      remediation,
      references,
    };
  }

  private mapOSVSeverity(
    severityScores?: OSVVulnerability['severity']
  ): VulnerabilitySeverity {
    if (!severityScores || severityScores.length === 0) {
      return 'medium';
    }

    const cvssScore = severityScores.find(
      (s) => s.type === 'CVSS_V3' || s.type === 'CVSS_V2'
    );

    if (cvssScore) {
      const score = parseFloat(cvssScore.score);
      if (score >= 9.0) return 'critical';
      if (score >= 7.0) return 'high';
      if (score >= 4.0) return 'medium';
      if (score > 0) return 'low';
    }

    return 'medium';
  }

  private extractFixedVersion(osvVuln: OSVVulnerability): string | undefined {
    if (!osvVuln.affected) return undefined;

    for (const affected of osvVuln.affected) {
      if (affected.ranges) {
        for (const range of affected.ranges) {
          if (range.events) {
            const fixedEvent = range.events.find((event) => event.fixed);
            if (fixedEvent?.fixed) {
              return fixedEvent.fixed;
            }
          }
        }
      }
    }

    return undefined;
  }

  private categorizeVulnerability(osvVuln: OSVVulnerability): VulnerabilityCategory {
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

    if (latestVersion !== dep.version) {
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
    const dep: DependencyInfo = { name, version, ecosystem };
    return this.checkDependencyVulnerabilities(dep, ecosystem);
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
      console.error(`Failed to get latest version for ${name}:`, error);
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
      console.error(`Failed to check deprecation for ${name}:`, error);
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
    const vulnerabilities: Vulnerability[] = [];
    const outdatedPackages: OutdatedPackage[] = [];

    try {
      const manifestPath = path.join(process.cwd(), 'package.json');
      const dependencies = await this.parseDependencies(manifestPath, 'npm');

      for (const dep of dependencies) {
        const vulns = await this.checkDependencyVulnerabilities(dep, dep.ecosystem);
        vulnerabilities.push(...vulns);

        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const scanDurationMs = Date.now() - startTime;
      const baseSummary = this.createDependencySummary(vulnerabilities, dependencies.length);

      return { vulnerabilities, outdatedPackages, summary: { ...baseSummary, scanDurationMs } };
    } catch (error) {
      console.error('Dependency scan failed:', error);
      return {
        vulnerabilities: [],
        outdatedPackages: [],
        summary: {
          critical: 0, high: 0, medium: 0, low: 0, informational: 0,
          totalFiles: 0, scanDurationMs: Date.now() - startTime,
        },
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
      console.error('Secret scan failed:', error);
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
    } catch (error) {
      console.debug('[SecurityAuditor] Directory read error:', error instanceof Error ? error.message : error);
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
      console.error('Failed to count resolved vulnerabilities:', error);
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
      console.error('Failed to calculate average resolution time:', error);
      return 72;
    }
  }
}
