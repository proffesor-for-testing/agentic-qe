/**
 * Agentic QE v3 - Security Auditor Service
 * Provides comprehensive security audit functionality
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath, RiskScore } from '../../../shared/value-objects/index.js';
import type {
  IDependencySecurityService,
  DependencyScanResult,
  PackageSecurityInfo,
  UpgradeRecommendation,
  Vulnerability,
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

      // Stub: In production, this would parse manifest and check vulnerability databases
      const vulnerabilities: Vulnerability[] = [];
      const outdatedPackages: OutdatedPackage[] = [];

      // Simulate dependency analysis
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
      // Stub: In production, would query vulnerability databases
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
        // Stub: Would call security scanner service
        sastResults = await this.stubSASTScan();
      }

      if (options.includeDAST && options.targetUrl) {
        // Stub: Would call security scanner service
        dastResults = await this.stubDASTScan(options.targetUrl);
      }

      if (options.includeDependencies) {
        // Would scan package manifests
        dependencyResults = await this.stubDependencyScan();
      }

      if (options.includeSecrets) {
        // Would scan for secrets
        secretScanResults = await this.stubSecretScan();
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

        // Stub: In production, would read and analyze file content
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
    _manifest: string,
    _ecosystem: DependencyInfo['ecosystem']
  ): Promise<DependencyInfo[]> {
    // Stub: In production, would parse actual manifest file
    return [
      { name: 'express', version: '4.17.1', ecosystem: 'npm' },
      { name: 'lodash', version: '4.17.20', ecosystem: 'npm' },
      { name: 'axios', version: '0.21.1', ecosystem: 'npm' },
    ];
  }

  private async checkDependencyVulnerabilities(
    dep: DependencyInfo,
    _ecosystem: DependencyInfo['ecosystem']
  ): Promise<Vulnerability[]> {
    // Stub: In production, would query NVD, OSV, or similar
    const vulnerabilities: Vulnerability[] = [];

    // Simulate known vulnerabilities for common packages
    if (dep.name === 'lodash' && dep.version < '4.17.21') {
      const location: VulnerabilityLocation = {
        file: 'package.json',
        dependency: dep,
      };

      const remediation: RemediationAdvice = {
        description: 'Upgrade lodash to version 4.17.21 or higher',
        fixExample: '"lodash": "^4.17.21"',
        estimatedEffort: 'trivial',
        automatable: true,
      };

      vulnerabilities.push({
        id: uuidv4(),
        cveId: 'CVE-2021-23337',
        title: 'Prototype Pollution in lodash',
        description: 'Lodash versions prior to 4.17.21 are vulnerable to prototype pollution',
        severity: 'high',
        category: 'injection',
        location,
        remediation,
        references: ['https://nvd.nist.gov/vuln/detail/CVE-2021-23337'],
      });
    }

    if (dep.name === 'axios' && dep.version < '0.21.2') {
      const location: VulnerabilityLocation = {
        file: 'package.json',
        dependency: dep,
      };

      const remediation: RemediationAdvice = {
        description: 'Upgrade axios to version 0.21.2 or higher',
        fixExample: '"axios": "^0.21.2"',
        estimatedEffort: 'trivial',
        automatable: true,
      };

      vulnerabilities.push({
        id: uuidv4(),
        cveId: 'CVE-2021-3749',
        title: 'Server-Side Request Forgery in axios',
        description: 'Axios versions prior to 0.21.2 are vulnerable to SSRF',
        severity: 'high',
        category: 'injection',
        location,
        remediation,
        references: ['https://nvd.nist.gov/vuln/detail/CVE-2021-3749'],
      });
    }

    return vulnerabilities;
  }

  private async checkOutdated(dep: DependencyInfo): Promise<OutdatedPackage | null> {
    // Stub: Check if package is outdated
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
    _name: string,
    _version: string,
    _ecosystem: DependencyInfo['ecosystem']
  ): Promise<Vulnerability[]> {
    // Stub: Would query OSV, NVD, etc.
    return [];
  }

  private async getLatestVersion(
    _name: string,
    _ecosystem: DependencyInfo['ecosystem']
  ): Promise<string> {
    // Stub: Would query package registry
    return '1.0.0';
  }

  private async checkDeprecation(
    _name: string,
    _ecosystem: DependencyInfo['ecosystem']
  ): Promise<boolean> {
    // Stub: Would check package registry for deprecation notice
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
    // Stub: In production, would read file and scan with regex patterns
    const secrets: DetectedSecret[] = [];

    // Simulate finding a secret occasionally
    if (Math.random() < 0.05) {
      const location: VulnerabilityLocation = {
        file: file.value,
        line: Math.floor(Math.random() * 100) + 1,
        snippet: 'const API_KEY = "sk-..."',
      };

      secrets.push({
        type: 'api-key',
        location,
        entropy: 4.5,
        isValid: true,
      });
    }

    return secrets;
  }

  private async stubSASTScan(): Promise<SASTResult> {
    return {
      scanId: uuidv4(),
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
        totalFiles: 10,
        scanDurationMs: 1000,
      },
      coverage: {
        filesScanned: 10,
        linesScanned: 1000,
        rulesApplied: 50,
      },
    };
  }

  private async stubDASTScan(targetUrl: string): Promise<DASTResult> {
    return {
      scanId: uuidv4(),
      targetUrl,
      vulnerabilities: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
        totalFiles: 1,
        scanDurationMs: 5000,
      },
      crawledUrls: 50,
    };
  }

  private async stubDependencyScan(): Promise<DependencyScanResult> {
    return {
      vulnerabilities: [],
      outdatedPackages: [],
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
        totalFiles: 5,
        scanDurationMs: 500,
      },
    };
  }

  private async stubSecretScan(): Promise<SecretScanResult> {
    return {
      secretsFound: [],
      filesScanned: 100,
    };
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
    // Stub: Would query from memory
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

  private async countResolvedLastWeek(): Promise<number> {
    // Stub: Would track resolution history
    return Math.floor(Math.random() * 10);
  }

  private async calculateAverageResolutionTime(): Promise<number> {
    // Stub: Would calculate from historical data
    return 72; // Hours
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
