/**
 * Agentic QE v3 - Security Auditor Service
 * Provides comprehensive security audit functionality
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath, RiskScore } from '../../../shared/value-objects/index.js';

// ============================================================================
// Package.json Types
// ============================================================================

interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

// ============================================================================
// OSV (Open Source Vulnerabilities) API Types
// ============================================================================

interface OSVQueryRequest {
  package: {
    name: string;
    ecosystem: string;
  };
  version: string;
}

interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package?: {
      name: string;
      ecosystem: string;
    };
    ranges?: Array<{
      type: string;
      events?: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
}

interface OSVQueryResponse {
  vulns?: OSVVulnerability[];
}

// ============================================================================
// HTTP Client for API calls
// ============================================================================

interface HttpResponse<T> {
  ok: boolean;
  status: number;
  data: T;
}

async function httpPost<T, R>(url: string, body: T): Promise<HttpResponse<R>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as R;
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function httpGet<R>(url: string): Promise<HttpResponse<R>> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  const data = await response.json() as R;
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
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

// ============================================================================
// Service Interface
// ============================================================================

export interface ISecurityAuditorService extends IDependencySecurityService {
  /**
   * Run comprehensive security audit
   */
  runAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>>;

  /**
   * Scan for secrets/credentials in code
   */
  scanSecrets(files: FilePath[]): Promise<Result<SecretScanResult>>;

  /**
   * Get security posture summary
   */
  getSecurityPosture(): Promise<Result<SecurityPostureSummary>>;

  /**
   * Triage vulnerabilities by priority
   */
  triageVulnerabilities(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<TriagedVulnerabilities>>;
}

export interface SecurityPostureSummary {
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  criticalIssues: number;
  highIssues: number;
  openVulnerabilities: number;
  resolvedLastWeek: number;
  averageResolutionTime: number;
  lastAuditDate: Date;
  recommendations: string[];
}

export interface TriagedVulnerabilities {
  immediate: Vulnerability[];
  shortTerm: Vulnerability[];
  mediumTerm: Vulnerability[];
  longTerm: Vulnerability[];
  accepted: Vulnerability[];
}

// ============================================================================
// Configuration
// ============================================================================

export interface SecurityAuditorConfig {
  secretPatterns: RegExp[];
  excludePatterns: string[];
  maxFileSizeKb: number;
  enableHistoricalAnalysis: boolean;
  riskThreshold: number;
}

const DEFAULT_CONFIG: SecurityAuditorConfig = {
  secretPatterns: [
    /(?:api[_-]?key|apikey)['":\s]*['"=]?\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    /(?:password|passwd|pwd)['":\s]*['"=]?\s*['"]?([^\s'"]{8,})['"]?/gi,
    /(?:secret|token)['":\s]*['"=]?\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    /(?:aws[_-]?access[_-]?key|aws[_-]?secret)['":\s]*['"=]?\s*['"]?([A-Z0-9]{20,})['"]?/gi,
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal access token
    /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth access token
    /sk-[a-zA-Z0-9]{48}/g, // OpenAI API key
  ],
  excludePatterns: ['node_modules', 'dist', 'build', '.git', '*.test.*', '*.spec.*'],
  maxFileSizeKb: 1024,
  enableHistoricalAnalysis: true,
  riskThreshold: 0.7,
};

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

  /**
   * Scan dependencies for vulnerabilities
   */
  async scanDependencies(manifestPath: FilePath): Promise<Result<DependencyScanResult>> {
    try {
      const manifest = manifestPath.value;
      const ecosystem = this.detectEcosystem(manifest);

      if (!ecosystem) {
        return err(new Error(`Unknown manifest format: ${manifest}`));
      }

      const vulnerabilities: Vulnerability[] = [];
      const outdatedPackages: OutdatedPackage[] = [];

      // Parse dependencies from manifest file
      const dependencies = await this.parseDependencies(manifest, ecosystem);

      for (const dep of dependencies) {
        // Check for known vulnerabilities
        const vulns = await this.checkDependencyVulnerabilities(dep, ecosystem);
        vulnerabilities.push(...vulns);

        // Check for outdated packages
        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const summary = this.createDependencySummary(vulnerabilities, dependencies.length);

      // Store results
      await this.memory.set(
        `security:deps:${manifestPath.filename}`,
        { vulnerabilities, outdatedPackages, summary },
        { namespace: 'security-compliance', ttl: 86400 } // 24 hours
      );

      return ok({
        vulnerabilities,
        outdatedPackages,
        summary,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check specific package for security issues
   */
  async checkPackage(
    name: string,
    version: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<Result<PackageSecurityInfo>> {
    try {
      // Query OSV vulnerability database
      const vulnerabilities = await this.queryVulnerabilityDatabase(
        name,
        version,
        ecosystem
      );

      const latestVersion = await this.getLatestVersion(name, ecosystem);
      const isDeprecated = await this.checkDeprecation(name, ecosystem);

      return ok({
        name,
        version,
        vulnerabilities,
        latestVersion,
        isDeprecated,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get upgrade recommendations for vulnerabilities
   */
  async getUpgradeRecommendations(
    vulnerabilities: Vulnerability[]
  ): Promise<Result<UpgradeRecommendation[]>> {
    try {
      const recommendations: UpgradeRecommendation[] = [];

      // Group vulnerabilities by package
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

      // Generate recommendations for each package
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

      // Sort by number of vulnerabilities fixed
      recommendations.sort(
        (a, b) => b.fixesVulnerabilities.length - a.fixesVulnerabilities.length
      );

      return ok(recommendations);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Audit Functionality
  // ==========================================================================

  /**
   * Run comprehensive security audit
   */
  async runAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>> {
    const auditId = uuidv4();
    const timestamp = new Date();

    try {
      let sastResults: SASTResult | undefined;
      let dastResults: DASTResult | undefined;
      let dependencyResults: DependencyScanResult | undefined;
      let secretScanResults: SecretScanResult | undefined;

      // Note: Actual SAST/DAST scanning would be delegated to SecurityScannerService
      // This is orchestration-level code that combines results

      if (options.includeSAST) {
        // SAST scanning delegated to SecurityScannerService
        sastResults = await this.performSASTScan();
      }

      if (options.includeDAST && options.targetUrl) {
        // DAST scanning delegated to SecurityScannerService
        dastResults = await this.performDASTScan(options.targetUrl);
      }

      if (options.includeDependencies) {
        // Scan package manifests for vulnerabilities
        dependencyResults = await this.performDependencyScan();
      }

      if (options.includeSecrets) {
        // Scan source files for secrets
        secretScanResults = await this.performSecretScan();
      }

      // Calculate overall risk score
      const overallRiskScore = this.calculateOverallRisk(
        sastResults,
        dastResults,
        dependencyResults,
        secretScanResults
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        sastResults,
        dastResults,
        dependencyResults,
        secretScanResults
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

      // Store audit report
      await this.memory.set(
        `security:audit:${auditId}`,
        report,
        { namespace: 'security-compliance', persist: true }
      );

      return ok(report);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan for secrets in code
   */
  async scanSecrets(files: FilePath[]): Promise<Result<SecretScanResult>> {
    try {
      const secretsFound: DetectedSecret[] = [];
      let filesScanned = 0;

      for (const file of files) {
        // Skip excluded patterns
        if (this.shouldExclude(file.value)) {
          continue;
        }

        filesScanned++;

        // Read and scan file for secrets using regex patterns
        const secrets = await this.scanFileForSecrets(file);
        secretsFound.push(...secrets);
      }

      return ok({
        secretsFound,
        filesScanned,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get security posture summary
   */
  async getSecurityPosture(): Promise<Result<SecurityPostureSummary>> {
    try {
      // Get historical audit data
      const audits = await this.getRecentAudits();

      // Calculate metrics
      const latestAudit = audits[0];
      const previousAudit = audits[1];

      const criticalIssues = this.countBySeverity(latestAudit, 'critical');
      const highIssues = this.countBySeverity(latestAudit, 'high');
      const openVulnerabilities = this.countOpenVulnerabilities(latestAudit);

      // Calculate trend
      const trend = this.calculateTrend(latestAudit, previousAudit);

      // Calculate overall score (0-100)
      const overallScore = this.calculatePostureScore(
        criticalIssues,
        highIssues,
        openVulnerabilities
      );

      // Generate recommendations
      const recommendations = this.generatePostureRecommendations(
        criticalIssues,
        highIssues,
        overallScore
      );

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
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Triage vulnerabilities by priority
   */
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
        const bucket = this.determinePriorityBucket(vuln);
        triaged[bucket].push(vuln);
      }

      // Sort each bucket by severity
      const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
      for (const bucket of Object.values(triaged)) {
        bucket.sort(
          (a: Vulnerability, b: Vulnerability) =>
            severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity)
        );
      }

      return ok(triaged);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Private Helper Methods
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
        // Read and parse package.json
        const content = await fs.readFile(manifest, 'utf-8');
        const packageJson: PackageJson = JSON.parse(content);

        // Collect all dependency types
        const allDeps: Record<string, string> = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
          ...packageJson.peerDependencies,
          ...packageJson.optionalDependencies,
        };

        // Convert to DependencyInfo array
        for (const [name, versionSpec] of Object.entries(allDeps)) {
          // Clean version specifiers (^, ~, >=, etc.)
          const version = this.cleanVersionSpec(versionSpec);
          dependencies.push({ name, version, ecosystem: 'npm' });
        }
      } else if (ecosystem === 'pip') {
        // Parse requirements.txt or Pipfile
        const content = await fs.readFile(manifest, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          // Skip comments and empty lines
          if (!trimmed || trimmed.startsWith('#')) continue;

          // Parse package==version or package>=version patterns
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
      // Additional ecosystems (maven, cargo, nuget) would be implemented similarly
    } catch (error) {
      // If file reading fails, return empty array rather than throwing
      console.error(`Failed to parse dependencies from ${manifest}:`, error);
    }

    return dependencies;
  }

  /**
   * Clean version specifier to extract actual version
   */
  private cleanVersionSpec(versionSpec: string): string {
    // Remove leading specifiers like ^, ~, >=, <=, >, <, =
    return versionSpec.replace(/^[\^~>=<]+/, '').trim();
  }

  private async checkDependencyVulnerabilities(
    dep: DependencyInfo,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    try {
      // Map ecosystem to OSV ecosystem name
      const osvEcosystem = this.mapToOSVEcosystem(ecosystem);

      // Query OSV API for vulnerabilities
      const osvQuery: OSVQueryRequest = {
        package: {
          name: dep.name,
          ecosystem: osvEcosystem,
        },
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
      // Log error but don't fail the entire scan
      console.error(`Failed to check vulnerabilities for ${dep.name}@${dep.version}:`, error);
    }

    return vulnerabilities;
  }

  /**
   * Map internal ecosystem to OSV ecosystem name
   */
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

  /**
   * Map OSV vulnerability to our Vulnerability type
   */
  private mapOSVVulnerability(osvVuln: OSVVulnerability, dep: DependencyInfo): Vulnerability {
    // Extract CVE ID from aliases
    const cveId = osvVuln.aliases?.find((alias) => alias.startsWith('CVE-'));

    // Determine severity from OSV severity scores
    const severity = this.mapOSVSeverity(osvVuln.severity);

    // Extract fixed version from affected ranges
    const fixedVersion = this.extractFixedVersion(osvVuln);

    // Build references list
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

  /**
   * Map OSV severity to our severity levels
   */
  private mapOSVSeverity(
    severityScores?: OSVVulnerability['severity']
  ): VulnerabilitySeverity {
    if (!severityScores || severityScores.length === 0) {
      return 'medium'; // Default to medium if no severity info
    }

    // Find CVSS score
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

  /**
   * Extract fixed version from OSV vulnerability data
   */
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

  /**
   * Categorize vulnerability based on OSV data
   */
  private categorizeVulnerability(osvVuln: OSVVulnerability): VulnerabilityCategory {
    const summary = (osvVuln.summary || '').toLowerCase();
    const details = (osvVuln.details || '').toLowerCase();
    const combined = `${summary} ${details}`;

    // Check for common vulnerability patterns
    if (combined.includes('injection') || combined.includes('sql')) {
      return 'injection';
    }
    if (combined.includes('xss') || combined.includes('cross-site scripting')) {
      return 'xss';
    }
    if (combined.includes('authentication') || combined.includes('auth bypass')) {
      return 'broken-auth';
    }
    if (combined.includes('sensitive data') || combined.includes('exposure')) {
      return 'sensitive-data';
    }
    if (combined.includes('xxe') || combined.includes('xml external')) {
      return 'xxe';
    }
    if (combined.includes('access control') || combined.includes('authorization')) {
      return 'access-control';
    }
    if (combined.includes('deseriali')) {
      return 'insecure-deserialization';
    }
    if (combined.includes('prototype pollution') || combined.includes('dependency')) {
      return 'vulnerable-components';
    }

    // Default to vulnerable-components for dependency vulnerabilities
    return 'vulnerable-components';
  }

  private async checkOutdated(dep: DependencyInfo): Promise<OutdatedPackage | null> {
    // Check if package is outdated by comparing with latest version from registry
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
    // Query OSV API for vulnerabilities
    const dep: DependencyInfo = { name, version, ecosystem };
    return this.checkDependencyVulnerabilities(dep, ecosystem);
  }

  private async getLatestVersion(
    name: string,
    ecosystem: DependencyInfo['ecosystem']
  ): Promise<string> {
    try {
      if (ecosystem === 'npm') {
        // Query npm registry for latest version
        const response = await httpGet<{ 'dist-tags'?: { latest?: string }; version?: string }>(
          `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
        );

        if (response.ok && response.data.version) {
          return response.data.version;
        }
      } else if (ecosystem === 'pip') {
        // Query PyPI for latest version
        const response = await httpGet<{ info?: { version?: string } }>(
          `https://pypi.org/pypi/${encodeURIComponent(name)}/json`
        );

        if (response.ok && response.data.info?.version) {
          return response.data.info.version;
        }
      }
      // Additional registries (Maven, NuGet, Cargo) would be implemented similarly
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
        // Query npm registry for deprecation notice
        const response = await httpGet<{ deprecated?: string }>(
          `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
        );

        if (response.ok && response.data.deprecated) {
          return true;
        }
      }
      // Additional registries would be implemented similarly
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
    // Count vulnerabilities by severity
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let informational = 0;

    for (const vuln of vulnerabilities) {
      switch (vuln.severity) {
        case 'critical':
          critical++;
          break;
        case 'high':
          high++;
          break;
        case 'medium':
          medium++;
          break;
        case 'low':
          low++;
          break;
        case 'informational':
          informational++;
          break;
      }
    }

    return {
      critical,
      high,
      medium,
      low,
      informational,
      totalFiles: totalDeps,
      scanDurationMs: 0,
    };
  }

  private shouldExclude(filePath: string): boolean {
    return this.config.excludePatterns.some((pattern) => {
      if (pattern.startsWith('*')) {
        return filePath.endsWith(pattern.slice(1));
      }
      return filePath.includes(pattern);
    });
  }

  private async scanFileForSecrets(file: FilePath): Promise<DetectedSecret[]> {
    const secrets: DetectedSecret[] = [];

    try {
      // Read the file content
      const content = await fs.readFile(file.value, 'utf-8');
      const lines = content.split('\n');

      // Comprehensive secret detection patterns
      const secretPatterns: Array<{
        name: string;
        type: DetectedSecret['type'];
        regex: RegExp;
        entropyThreshold?: number;
      }> = [
        // AWS Keys
        {
          name: 'AWS Access Key ID',
          type: 'api-key',
          regex: /AKIA[0-9A-Z]{16}/g,
        },
        {
          name: 'AWS Secret Access Key',
          type: 'api-key',
          regex: /(?:aws[_-]?secret[_-]?access[_-]?key|AWS_SECRET_ACCESS_KEY)['"]?\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
          entropyThreshold: 4.0,
        },
        // GitHub Tokens
        {
          name: 'GitHub Personal Access Token',
          type: 'token',
          regex: /ghp_[A-Za-z0-9]{36}/g,
        },
        {
          name: 'GitHub OAuth Access Token',
          type: 'token',
          regex: /gho_[A-Za-z0-9]{36}/g,
        },
        {
          name: 'GitHub App Token',
          type: 'token',
          regex: /(?:ghu|ghs)_[A-Za-z0-9]{36}/g,
        },
        // Generic API Keys
        {
          name: 'Generic API Key',
          type: 'api-key',
          regex: /(?:api[_-]?key|apikey|api_secret)['"]?\s*[:=]\s*['"]([A-Za-z0-9_\-]{20,})['"]?/gi,
          entropyThreshold: 3.5,
        },
        // OpenAI API Key
        {
          name: 'OpenAI API Key',
          type: 'api-key',
          regex: /sk-[A-Za-z0-9]{48}/g,
        },
        // Stripe Keys
        {
          name: 'Stripe Secret Key',
          type: 'api-key',
          regex: /sk_live_[A-Za-z0-9]{24,}/g,
        },
        {
          name: 'Stripe Publishable Key',
          type: 'api-key',
          regex: /pk_live_[A-Za-z0-9]{24,}/g,
        },
        // Private Keys
        {
          name: 'RSA Private Key',
          type: 'private-key',
          regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
        },
        {
          name: 'PGP Private Key',
          type: 'private-key',
          regex: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/gi,
        },
        {
          name: 'SSH Private Key',
          type: 'private-key',
          regex: /-----BEGIN\s+(?:OPENSSH|DSA|EC)?\s*PRIVATE\s+KEY-----/gi,
        },
        // Passwords
        {
          name: 'Password Assignment',
          type: 'password',
          regex: /(?:password|passwd|pwd|secret)['"]?\s*[:=]\s*['"]([^'"\s]{8,})['"]?/gi,
          entropyThreshold: 3.0,
        },
        // Database Connection Strings
        {
          name: 'Database Connection String',
          type: 'password',
          regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/gi,
        },
        // JWT Tokens
        {
          name: 'JWT Token',
          type: 'token',
          regex: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
          entropyThreshold: 4.0,
        },
        // Slack Tokens
        {
          name: 'Slack Token',
          type: 'token',
          regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g,
        },
        // Google API Key
        {
          name: 'Google API Key',
          type: 'api-key',
          regex: /AIza[A-Za-z0-9_-]{35}/g,
        },
        // Twilio
        {
          name: 'Twilio API Key',
          type: 'api-key',
          regex: /SK[A-Za-z0-9]{32}/g,
        },
        // SendGrid
        {
          name: 'SendGrid API Key',
          type: 'api-key',
          regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
        },
        // Certificates
        {
          name: 'X.509 Certificate',
          type: 'certificate',
          regex: /-----BEGIN\s+CERTIFICATE-----/gi,
        },
      ];

      // Scan each line for secrets
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;

        for (const pattern of secretPatterns) {
          // Reset regex lastIndex for global patterns
          pattern.regex.lastIndex = 0;

          let match: RegExpExecArray | null;
          while ((match = pattern.regex.exec(line)) !== null) {
            const matchedValue = match[1] || match[0];

            // Calculate entropy if threshold is specified
            const entropy = this.calculateEntropy(matchedValue);

            // Skip low-entropy matches if threshold is specified
            if (pattern.entropyThreshold && entropy < pattern.entropyThreshold) {
              continue;
            }

            // Create masked snippet (show context but mask the actual secret)
            const snippet = this.createMaskedSnippet(line, match.index, matchedValue.length);

            const location: VulnerabilityLocation = {
              file: file.value,
              line: lineNumber,
              column: match.index + 1,
              snippet,
            };

            secrets.push({
              type: pattern.type,
              location,
              entropy,
              isValid: this.validateSecret(pattern.type, matchedValue),
            });
          }
        }
      }
    } catch (error) {
      // File reading error - skip this file
      console.error(`Failed to scan file for secrets: ${file.value}`, error);
    }

    return secrets;
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    if (!str || str.length === 0) return 0;

    const charFrequency: Record<string, number> = {};

    for (const char of str) {
      charFrequency[char] = (charFrequency[char] || 0) + 1;
    }

    let entropy = 0;
    const len = str.length;

    for (const char in charFrequency) {
      const probability = charFrequency[char] / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy;
  }

  /**
   * Create a masked snippet for display
   */
  private createMaskedSnippet(line: string, matchIndex: number, matchLength: number): string {
    const contextBefore = 20;
    const contextAfter = 10;

    const start = Math.max(0, matchIndex - contextBefore);
    const end = Math.min(line.length, matchIndex + matchLength + contextAfter);

    let snippet = line.substring(start, end);

    // Mask the secret value (show first 4 and last 4 characters)
    const secretStart = matchIndex - start;
    const secretInSnippet = snippet.substring(secretStart, secretStart + matchLength);

    if (secretInSnippet.length > 8) {
      const masked = secretInSnippet.substring(0, 4) + '...' + secretInSnippet.substring(secretInSnippet.length - 4);
      snippet = snippet.substring(0, secretStart) + masked + snippet.substring(secretStart + matchLength);
    }

    if (start > 0) snippet = '...' + snippet;
    if (end < line.length) snippet = snippet + '...';

    return snippet;
  }

  /**
   * Validate if a detected secret is likely valid (basic validation)
   */
  private validateSecret(type: DetectedSecret['type'], value: string): boolean {
    // Basic validation - in production, could do more sophisticated checks
    switch (type) {
      case 'api-key':
        // Check minimum length and character variety
        return value.length >= 20 && /[a-z]/.test(value) && /[A-Z0-9]/.test(value);
      case 'token':
        return value.length >= 20;
      case 'password':
        // Likely not a placeholder password
        return !['password', 'secret', 'changeme', '12345678', 'qwerty'].includes(value.toLowerCase());
      case 'private-key':
        return true; // Private key headers are already specific
      case 'certificate':
        return true;
      default:
        return true;
    }
  }

  /**
   * Perform SAST scan using AST-based analysis for JavaScript/TypeScript
   * Scans for common vulnerability patterns: XSS, SQL injection, command injection, path traversal
   */
  private async performSASTScan(): Promise<SASTResult> {
    const scanId = uuidv4();
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    let filesScanned = 0;
    let linesScanned = 0;

    try {
      // Find source files to scan
      const sourceFiles = await this.findSourceFiles(process.cwd());

      // Define vulnerability patterns for AST-like analysis
      const vulnerabilityPatterns: Array<{
        id: string;
        pattern: RegExp;
        title: string;
        description: string;
        severity: VulnerabilitySeverity;
        category: VulnerabilityCategory;
        remediation: string;
        fixExample?: string;
        cweId: string;
      }> = [
        // SQL Injection patterns
        {
          id: 'sqli-concat',
          pattern: /(?:query|execute|exec|run)\s*\(\s*(?:['"`].*?\s*\+|`[^`]*\$\{)/gi,
          title: 'SQL Injection via String Concatenation',
          description: 'SQL query constructed using string concatenation with potentially untrusted input',
          severity: 'critical',
          category: 'injection',
          remediation: 'Use parameterized queries or prepared statements',
          fixExample: 'db.query("SELECT * FROM users WHERE id = $1", [userId])',
          cweId: 'CWE-89',
        },
        // XSS patterns
        {
          id: 'xss-innerhtml',
          pattern: /\.innerHTML\s*=\s*(?!['"`])/g,
          title: 'XSS via innerHTML Assignment',
          description: 'Direct innerHTML assignment with potentially unsanitized content',
          severity: 'high',
          category: 'xss',
          remediation: 'Use textContent for text, or sanitize HTML with DOMPurify',
          fixExample: 'element.textContent = userInput;',
          cweId: 'CWE-79',
        },
        {
          id: 'xss-document-write',
          pattern: /document\.write\s*\([^)]+\)/g,
          title: 'XSS via document.write',
          description: 'document.write() can execute scripts from untrusted data',
          severity: 'high',
          category: 'xss',
          remediation: 'Avoid document.write(); use DOM manipulation methods',
          cweId: 'CWE-79',
        },
        {
          id: 'xss-eval',
          pattern: /(?<!\.)\beval\s*\([^)]+\)/g,
          title: 'Code Injection via eval()',
          description: 'eval() executes arbitrary code and is a major security risk',
          severity: 'critical',
          category: 'xss',
          remediation: 'Never use eval(); use JSON.parse() for JSON data',
          fixExample: 'JSON.parse(jsonString)',
          cweId: 'CWE-95',
        },
        {
          id: 'xss-dangerous-react',
          pattern: /dangerouslySetInnerHTML\s*=\s*\{/g,
          title: 'React dangerouslySetInnerHTML Usage',
          description: 'dangerouslySetInnerHTML bypasses React XSS protections',
          severity: 'medium',
          category: 'xss',
          remediation: 'Sanitize HTML content with DOMPurify before use',
          fixExample: 'dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}',
          cweId: 'CWE-79',
        },
        // Command Injection patterns
        {
          id: 'cmd-injection-exec',
          pattern: /(?:child_process\.)?exec\s*\(\s*(?:[^,)]*\s*\+|`[^`]*\$\{)/g,
          title: 'Command Injection via exec()',
          description: 'Shell command execution with unsanitized input',
          severity: 'critical',
          category: 'injection',
          remediation: 'Use execFile() with argument array instead of exec()',
          fixExample: 'execFile("command", [arg1, arg2], callback)',
          cweId: 'CWE-78',
        },
        {
          id: 'cmd-injection-spawn-shell',
          pattern: /spawn\s*\([^)]+,\s*\{[^}]*shell\s*:\s*true/g,
          title: 'Dangerous Shell Option in spawn()',
          description: 'spawn() with shell: true can enable command injection',
          severity: 'high',
          category: 'injection',
          remediation: 'Avoid shell: true option; use direct command execution',
          cweId: 'CWE-78',
        },
        // Path Traversal patterns
        {
          id: 'path-traversal-readfile',
          pattern: /(?:readFile|readFileSync)\s*\([^)]*\+/g,
          title: 'Path Traversal via File Read',
          description: 'File read operation with concatenated path may allow directory traversal',
          severity: 'high',
          category: 'access-control',
          remediation: 'Validate and sanitize file paths; use path.resolve() and check against base directory',
          fixExample: 'const safePath = path.resolve(baseDir, path.basename(userInput))',
          cweId: 'CWE-22',
        },
        {
          id: 'path-traversal-writefile',
          pattern: /(?:writeFile|writeFileSync)\s*\([^)]*\+/g,
          title: 'Path Traversal via File Write',
          description: 'File write operation with concatenated path may allow directory traversal',
          severity: 'high',
          category: 'access-control',
          remediation: 'Validate file paths before writing; ensure path is within allowed directory',
          cweId: 'CWE-22',
        },
        // Hardcoded secrets
        {
          id: 'secret-private-key',
          pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
          title: 'Private Key Detected in Source',
          description: 'Private key found in source code',
          severity: 'critical',
          category: 'sensitive-data',
          remediation: 'Store private keys in secure key management systems, not in code',
          cweId: 'CWE-798',
        },
        // Insecure configurations
        {
          id: 'config-tls-disabled',
          pattern: /rejectUnauthorized\s*:\s*false/g,
          title: 'TLS Certificate Validation Disabled',
          description: 'Disabling TLS certificate validation exposes to MITM attacks',
          severity: 'high',
          category: 'security-misconfiguration',
          remediation: 'Always enable TLS certificate validation in production',
          cweId: 'CWE-295',
        },
        {
          id: 'config-cors-wildcard',
          pattern: /cors\s*\(\s*\{[^}]*origin\s*:\s*['"]\*['"]/gi,
          title: 'Permissive CORS Configuration',
          description: 'CORS allows all origins (*) which may expose sensitive data',
          severity: 'medium',
          category: 'security-misconfiguration',
          remediation: 'Restrict CORS to specific trusted origins',
          fixExample: 'cors({ origin: ["https://trusted-domain.com"] })',
          cweId: 'CWE-942',
        },
      ];

      for (const filePath of sourceFiles) {
        if (this.shouldExclude(filePath)) {
          continue;
        }

        // Only scan JS/TS files
        const ext = path.extname(filePath).toLowerCase();
        if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
          continue;
        }

        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          filesScanned++;
          linesScanned += lines.length;

          // Check each vulnerability pattern
          for (const vulnPattern of vulnerabilityPatterns) {
            // Reset regex state
            vulnPattern.pattern.lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = vulnPattern.pattern.exec(content)) !== null) {
              // Calculate line and column
              const beforeMatch = content.substring(0, match.index);
              const linesBefore = beforeMatch.split('\n');
              const lineNumber = linesBefore.length;
              const column = linesBefore[linesBefore.length - 1].length + 1;

              // Check if in comment
              const currentLine = lines[lineNumber - 1] || '';
              if (currentLine.trimStart().startsWith('//') || currentLine.trimStart().startsWith('*')) {
                continue;
              }

              // Check for nosec annotation
              if (currentLine.includes('// nosec') || currentLine.includes('// security-ignore')) {
                continue;
              }

              // Extract snippet with context
              const startLine = Math.max(0, lineNumber - 2);
              const endLine = Math.min(lines.length, lineNumber + 1);
              const snippet = lines.slice(startLine, endLine).join('\n');

              const location: VulnerabilityLocation = {
                file: filePath,
                line: lineNumber,
                column,
                snippet,
              };

              const remediation: RemediationAdvice = {
                description: vulnPattern.remediation,
                fixExample: vulnPattern.fixExample,
                estimatedEffort: vulnPattern.severity === 'critical' ? 'moderate' : 'minor',
                automatable: vulnPattern.severity === 'low' || vulnPattern.severity === 'medium',
              };

              vulnerabilities.push({
                id: uuidv4(),
                cveId: undefined,
                title: vulnPattern.title,
                description: `${vulnPattern.description} [${vulnPattern.cweId}]`,
                severity: vulnPattern.severity,
                category: vulnPattern.category,
                location,
                remediation,
                references: [
                  `https://cwe.mitre.org/data/definitions/${vulnPattern.cweId.replace('CWE-', '')}.html`,
                ],
              });
            }
          }
        } catch {
          // Skip files that can't be read
        }
      }
    } catch (error) {
      console.error('SAST scan failed:', error);
    }

    const scanDurationMs = Date.now() - startTime;

    // Calculate summary
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

    return {
      scanId,
      vulnerabilities,
      summary: {
        critical,
        high,
        medium,
        low,
        informational,
        totalFiles: filesScanned,
        scanDurationMs,
      },
      coverage: {
        filesScanned,
        linesScanned,
        rulesApplied: 12, // Number of vulnerability patterns
      },
    };
  }

  /**
   * Perform DAST scan using HTTP requests to test for vulnerabilities
   * Tests for common web vulnerabilities: XSS, SQL injection, security headers, etc.
   */
  private async performDASTScan(targetUrl: string): Promise<DASTResult> {
    const scanId = uuidv4();
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    let crawledUrls = 0;

    try {
      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        return {
          scanId,
          targetUrl,
          vulnerabilities: [{
            id: uuidv4(),
            title: 'Invalid Target URL',
            description: 'The provided target URL is not valid',
            severity: 'informational',
            category: 'security-misconfiguration',
            location: { file: targetUrl },
            remediation: { description: 'Provide a valid URL', estimatedEffort: 'trivial', automatable: false },
            references: [],
          }],
          summary: { critical: 0, high: 0, medium: 0, low: 0, informational: 1, totalFiles: 0, scanDurationMs: Date.now() - startTime },
          crawledUrls: 0,
        };
      }

      // Perform HTTP request to check security headers and response characteristics
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'AgenticQE-SecurityScanner/3.0',
            'Accept': 'text/html,application/json,*/*',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        crawledUrls = 1;

        // Check security headers
        const headers = response.headers;

        // Check for missing security headers
        const securityHeaderChecks: Array<{
          header: string;
          title: string;
          description: string;
          severity: VulnerabilitySeverity;
          remediation: string;
        }> = [
          {
            header: 'strict-transport-security',
            title: 'Missing HTTP Strict Transport Security (HSTS)',
            description: 'HSTS header is missing, allowing downgrade attacks',
            severity: 'medium',
            remediation: 'Add Strict-Transport-Security header with appropriate max-age',
          },
          {
            header: 'x-content-type-options',
            title: 'Missing X-Content-Type-Options Header',
            description: 'X-Content-Type-Options header is missing, allowing MIME sniffing attacks',
            severity: 'low',
            remediation: 'Add X-Content-Type-Options: nosniff header',
          },
          {
            header: 'x-frame-options',
            title: 'Missing X-Frame-Options Header',
            description: 'X-Frame-Options header is missing, allowing clickjacking attacks',
            severity: 'medium',
            remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN header',
          },
          {
            header: 'content-security-policy',
            title: 'Missing Content Security Policy',
            description: 'CSP header is missing, increasing XSS attack surface',
            severity: 'medium',
            remediation: 'Implement a Content-Security-Policy header',
          },
          {
            header: 'x-xss-protection',
            title: 'Missing X-XSS-Protection Header',
            description: 'X-XSS-Protection header is missing (legacy XSS filter)',
            severity: 'low',
            remediation: 'Add X-XSS-Protection: 1; mode=block header',
          },
        ];

        for (const check of securityHeaderChecks) {
          if (!headers.get(check.header)) {
            vulnerabilities.push({
              id: uuidv4(),
              title: check.title,
              description: check.description,
              severity: check.severity,
              category: 'security-misconfiguration',
              location: {
                file: targetUrl,
                snippet: `Response Headers: ${check.header} not present`,
              },
              remediation: {
                description: check.remediation,
                estimatedEffort: 'minor',
                automatable: true,
              },
              references: [
                'https://owasp.org/www-project-secure-headers/',
              ],
            });
          }
        }

        // Check for insecure cookies
        const cookies = headers.get('set-cookie');
        if (cookies) {
          if (!cookies.toLowerCase().includes('secure')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Cookie Without Secure Flag',
              description: 'Session cookie is set without the Secure flag',
              severity: 'medium',
              category: 'sensitive-data',
              location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
              remediation: { description: 'Add Secure flag to cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
            });
          }
          if (!cookies.toLowerCase().includes('httponly')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Cookie Without HttpOnly Flag',
              description: 'Session cookie is set without the HttpOnly flag, making it accessible to JavaScript',
              severity: 'medium',
              category: 'sensitive-data',
              location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
              remediation: { description: 'Add HttpOnly flag to session cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/HttpOnly'],
            });
          }
          if (!cookies.toLowerCase().includes('samesite')) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Cookie Without SameSite Attribute',
              description: 'Cookie is set without the SameSite attribute, potentially vulnerable to CSRF',
              severity: 'low',
              category: 'broken-auth',
              location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
              remediation: { description: 'Add SameSite=Strict or SameSite=Lax to cookies', estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-community/SameSite'],
            });
          }
        }

        // Check for server information disclosure
        const server = headers.get('server');
        if (server && /[0-9]+\.[0-9]+/.test(server)) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Server Version Disclosure',
            description: `Server header reveals version information: ${server}`,
            severity: 'low',
            category: 'security-misconfiguration',
            location: { file: targetUrl, snippet: `Server: ${server}` },
            remediation: { description: 'Remove or obfuscate server version information', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }

        // Check for HTTPS
        if (parsedUrl.protocol === 'http:') {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Insecure HTTP Protocol',
            description: 'Target is using HTTP instead of HTTPS, exposing data in transit',
            severity: 'high',
            category: 'sensitive-data',
            location: { file: targetUrl },
            remediation: { description: 'Use HTTPS with valid TLS certificate', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }

        // Try common test endpoints for additional checks
        const testEndpoints = [
          { path: '/.git/config', vuln: 'Git Repository Exposed', severity: 'high' as VulnerabilitySeverity },
          { path: '/.env', vuln: 'Environment File Exposed', severity: 'critical' as VulnerabilitySeverity },
          { path: '/phpinfo.php', vuln: 'PHP Info Exposed', severity: 'medium' as VulnerabilitySeverity },
          { path: '/wp-config.php.bak', vuln: 'WordPress Config Backup Exposed', severity: 'critical' as VulnerabilitySeverity },
        ];

        for (const endpoint of testEndpoints) {
          try {
            const testUrl = new URL(endpoint.path, parsedUrl.origin).toString();
            const testResponse = await fetch(testUrl, {
              method: 'GET',
              signal: AbortSignal.timeout(5000),
            });

            if (testResponse.ok && testResponse.status === 200) {
              const text = await testResponse.text();
              // Verify it's actually the sensitive content, not a custom 404
              if (text.length > 10 && !text.toLowerCase().includes('not found')) {
                crawledUrls++;
                vulnerabilities.push({
                  id: uuidv4(),
                  title: endpoint.vuln,
                  description: `Sensitive file found at ${endpoint.path}`,
                  severity: endpoint.severity,
                  category: 'sensitive-data',
                  location: { file: testUrl },
                  remediation: { description: 'Remove or restrict access to sensitive files', estimatedEffort: 'trivial', automatable: true },
                  references: ['https://owasp.org/www-project-web-security-testing-guide/'],
                });
              }
            }
          } catch {
            // Endpoint not accessible, which is expected/good
          }
        }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);

        // Network errors might indicate issues
        if (errorMessage.includes('certificate') || errorMessage.includes('SSL') || errorMessage.includes('TLS')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'TLS/SSL Certificate Issue',
            description: `Certificate error: ${errorMessage}`,
            severity: 'high',
            category: 'security-misconfiguration',
            location: { file: targetUrl },
            remediation: { description: 'Fix TLS certificate configuration', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }
      }

    } catch (error) {
      console.error('DAST scan failed:', error);
    }

    const scanDurationMs = Date.now() - startTime;

    // Calculate summary
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

    return {
      scanId,
      targetUrl,
      vulnerabilities,
      summary: {
        critical,
        high,
        medium,
        low,
        informational,
        totalFiles: 1,
        scanDurationMs,
      },
      crawledUrls,
    };
  }

  /**
   * Perform dependency scan using OSV API
   */
  private async performDependencyScan(): Promise<DependencyScanResult> {
    const startTime = Date.now();
    const vulnerabilities: Vulnerability[] = [];
    const outdatedPackages: OutdatedPackage[] = [];

    try {
      // Look for package.json in current working directory
      const manifestPath = path.join(process.cwd(), 'package.json');
      const dependencies = await this.parseDependencies(manifestPath, 'npm');

      for (const dep of dependencies) {
        // Check for vulnerabilities via OSV API
        const vulns = await this.checkDependencyVulnerabilities(dep, dep.ecosystem);
        vulnerabilities.push(...vulns);

        // Check for outdated packages
        const outdated = await this.checkOutdated(dep);
        if (outdated) {
          outdatedPackages.push(outdated);
        }
      }

      const scanDurationMs = Date.now() - startTime;
      const baseSummary = this.createDependencySummary(vulnerabilities, dependencies.length);

      return {
        vulnerabilities,
        outdatedPackages,
        summary: {
          ...baseSummary,
          scanDurationMs,
        },
      };
    } catch (error) {
      console.error('Dependency scan failed:', error);
      return {
        vulnerabilities: [],
        outdatedPackages: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          informational: 0,
          totalFiles: 0,
          scanDurationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Perform secret scan on source files
   */
  private async performSecretScan(): Promise<SecretScanResult> {
    const secretsFound: DetectedSecret[] = [];
    let filesScanned = 0;

    try {
      // Get list of source files to scan
      const sourceFiles = await this.findSourceFiles(process.cwd());

      for (const filePath of sourceFiles) {
        if (this.shouldExclude(filePath)) {
          continue;
        }

        filesScanned++;
        const filePathObj = { value: filePath } as FilePath;
        const secrets = await this.scanFileForSecrets(filePathObj);
        secretsFound.push(...secrets);
      }
    } catch (error) {
      console.error('Secret scan failed:', error);
    }

    return {
      secretsFound,
      filesScanned,
    };
  }

  /**
   * Find source files in a directory (recursively)
   */
  private async findSourceFiles(dir: string, files: string[] = []): Promise<string[]> {
    const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.json', '.env', '.yaml', '.yml', '.config'];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip excluded directories
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
      // Non-critical: permission errors when reading directories are expected
      console.debug('[SecurityAuditor] Directory read error:', error instanceof Error ? error.message : error);
    }

    return files;
  }

  private calculateOverallRisk(
    sast?: SASTResult,
    dast?: DASTResult,
    deps?: DependencyScanResult,
    secrets?: SecretScanResult
  ): RiskScore {
    let riskValue = 0;
    let weights = 0;

    if (sast) {
      riskValue +=
        this.calculateScanRisk(sast.summary) * 0.35;
      weights += 0.35;
    }

    if (dast) {
      riskValue +=
        this.calculateScanRisk(dast.summary) * 0.25;
      weights += 0.25;
    }

    if (deps) {
      riskValue +=
        this.calculateScanRisk(deps.summary) * 0.25;
      weights += 0.25;
    }

    if (secrets) {
      const secretRisk = secrets.secretsFound.length > 0 ? 0.9 : 0.1;
      riskValue += secretRisk * 0.15;
      weights += 0.15;
    }

    const normalizedRisk = weights > 0 ? riskValue / weights : 0;

    // Return RiskScore-compatible object
    return {
      value: Math.min(1, normalizedRisk),
      percentage: normalizedRisk * 100,
      level: normalizedRisk >= 0.8 ? 'critical' :
             normalizedRisk >= 0.6 ? 'high' :
             normalizedRisk >= 0.3 ? 'medium' : 'low',
    } as unknown as RiskScore;
  }

  private calculateScanRisk(summary: ScanSummary): number {
    const weights = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.1,
      informational: 0.02,
    };

    const totalIssues =
      summary.critical +
      summary.high +
      summary.medium +
      summary.low +
      summary.informational;

    if (totalIssues === 0) return 0;

    const weightedSum =
      summary.critical * weights.critical +
      summary.high * weights.high +
      summary.medium * weights.medium +
      summary.low * weights.low +
      summary.informational * weights.informational;

    return Math.min(1, weightedSum / 10);
  }

  private generateRecommendations(
    sast?: SASTResult,
    dast?: DASTResult,
    deps?: DependencyScanResult,
    secrets?: SecretScanResult
  ): string[] {
    const recommendations: string[] = [];

    if (sast && sast.summary.critical > 0) {
      recommendations.push(
        `Address ${sast.summary.critical} critical vulnerabilities found in static analysis`
      );
    }

    if (dast && dast.summary.high > 0) {
      recommendations.push(
        `Fix ${dast.summary.high} high-severity issues found in dynamic testing`
      );
    }

    if (deps && deps.outdatedPackages.length > 5) {
      recommendations.push(
        `Update ${deps.outdatedPackages.length} outdated dependencies`
      );
    }

    if (secrets && secrets.secretsFound.length > 0) {
      recommendations.push(
        `Remove ${secrets.secretsFound.length} exposed secrets and rotate credentials`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is good. Continue regular scanning.');
    }

    return recommendations;
  }

  private async getRecentAudits(): Promise<SecurityAuditReport[]> {
    // Query recent audits from memory storage
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

  private countBySeverity(
    audit: SecurityAuditReport | undefined,
    severity: 'critical' | 'high'
  ): number {
    if (!audit) return 0;

    let count = 0;
    if (audit.sastResults) count += audit.sastResults.summary[severity];
    if (audit.dastResults) count += audit.dastResults.summary[severity];
    if (audit.dependencyResults) count += audit.dependencyResults.summary[severity];

    return count;
  }

  private countOpenVulnerabilities(audit: SecurityAuditReport | undefined): number {
    if (!audit) return 0;

    let count = 0;
    if (audit.sastResults) count += audit.sastResults.vulnerabilities.length;
    if (audit.dastResults) count += audit.dastResults.vulnerabilities.length;
    if (audit.dependencyResults) count += audit.dependencyResults.vulnerabilities.length;

    return count;
  }

  private calculateTrend(
    latest: SecurityAuditReport | undefined,
    previous: SecurityAuditReport | undefined
  ): 'improving' | 'stable' | 'declining' {
    if (!latest || !previous) return 'stable';

    const latestScore = this.countOpenVulnerabilities(latest);
    const previousScore = this.countOpenVulnerabilities(previous);

    if (latestScore < previousScore * 0.9) return 'improving';
    if (latestScore > previousScore * 1.1) return 'declining';
    return 'stable';
  }

  private calculatePostureScore(
    critical: number,
    high: number,
    open: number
  ): number {
    // Start at 100, deduct points for issues
    let score = 100;
    score -= critical * 20;
    score -= high * 10;
    score -= open * 2;
    return Math.max(0, Math.min(100, score));
  }

  private generatePostureRecommendations(
    critical: number,
    high: number,
    score: number
  ): string[] {
    const recommendations: string[] = [];

    if (critical > 0) {
      recommendations.push('Immediately address all critical vulnerabilities');
    }

    if (high > 3) {
      recommendations.push('Prioritize fixing high-severity issues');
    }

    if (score < 50) {
      recommendations.push('Consider a comprehensive security review');
      recommendations.push('Implement automated security scanning in CI/CD');
    }

    if (score >= 80) {
      recommendations.push('Maintain current security practices');
      recommendations.push('Consider penetration testing for deeper analysis');
    }

    return recommendations;
  }

  /**
   * Count vulnerabilities resolved in the last week
   * Calculates by comparing consecutive audit reports
   */
  private async countResolvedLastWeek(): Promise<number> {
    try {
      const audits = await this.getRecentAudits();
      if (audits.length < 2) return 0;

      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Find audits from this week
      const recentAudits = audits.filter(
        (audit) => new Date(audit.timestamp) >= oneWeekAgo
      );

      if (recentAudits.length < 2) return 0;

      // Compare vulnerability counts between first and last audit of the week
      const oldest = recentAudits[recentAudits.length - 1];
      const newest = recentAudits[0];

      const oldCount = this.countOpenVulnerabilities(oldest);
      const newCount = this.countOpenVulnerabilities(newest);

      // Resolved = old count - new count (if positive)
      return Math.max(0, oldCount - newCount);
    } catch (error) {
      console.error('Failed to count resolved vulnerabilities:', error);
      return 0;
    }
  }

  /**
   * Calculate average resolution time from historical audit data
   */
  private async calculateAverageResolutionTime(): Promise<number> {
    try {
      const audits = await this.getRecentAudits();
      if (audits.length < 2) return 72; // Default to 72 hours

      // Track vulnerabilities across audits to calculate resolution time
      const vulnFirstSeen = new Map<string, Date>();
      const resolutionTimes: number[] = [];

      // Process audits from oldest to newest
      const sortedAudits = [...audits].reverse();

      for (const audit of sortedAudits) {
        const currentVulnIds = new Set<string>();

        // Collect all vulnerability IDs in this audit
        if (audit.sastResults) {
          audit.sastResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }
        if (audit.dastResults) {
          audit.dastResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }
        if (audit.dependencyResults) {
          audit.dependencyResults.vulnerabilities.forEach((v) => currentVulnIds.add(v.id));
        }

        // Track new vulnerabilities
        for (const vulnId of currentVulnIds) {
          if (!vulnFirstSeen.has(vulnId)) {
            vulnFirstSeen.set(vulnId, audit.timestamp);
          }
        }

        // Check for resolved vulnerabilities
        for (const [vulnId, firstSeen] of vulnFirstSeen) {
          if (!currentVulnIds.has(vulnId)) {
            const resolutionTime = (audit.timestamp.getTime() - firstSeen.getTime()) / (1000 * 60 * 60);
            resolutionTimes.push(resolutionTime);
            vulnFirstSeen.delete(vulnId);
          }
        }
      }

      if (resolutionTimes.length === 0) return 72; // Default

      // Calculate average
      const sum = resolutionTimes.reduce((acc, time) => acc + time, 0);
      return Math.round(sum / resolutionTimes.length);
    } catch (error) {
      console.error('Failed to calculate average resolution time:', error);
      return 72; // Default to 72 hours
    }
  }

  private determinePriorityBucket(
    vuln: Vulnerability
  ): keyof TriagedVulnerabilities {
    const effort = vuln.remediation.estimatedEffort;

    if (vuln.severity === 'critical') {
      return 'immediate';
    }

    if (vuln.severity === 'high') {
      return effort === 'trivial' || effort === 'minor' ? 'immediate' : 'shortTerm';
    }

    if (vuln.severity === 'medium') {
      return effort === 'major' ? 'longTerm' : 'mediumTerm';
    }

    if (vuln.severity === 'low' || vuln.severity === 'informational') {
      return 'longTerm';
    }

    return 'accepted';
  }
}
