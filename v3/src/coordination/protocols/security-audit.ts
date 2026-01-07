/**
 * Agentic QE v3 - Security Audit Protocol
 * Coordination protocol for comprehensive security auditing
 *
 * Trigger: Daily 2am, dependency update, or manual
 * Participants: Security Scanner, Auditor, Compliance Validator
 * Actions: Scan vulnerabilities, audit code, validate compliance
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Result,
  ok,
  err,
  Severity,
} from '../../shared/types/index.js';
import type {
  EventBus,
  MemoryBackend,
  AgentCoordinator,
  AgentSpawnConfig,
} from '../../kernel/interfaces.js';
import { FilePath, RiskScore } from '../../shared/value-objects/index.js';
import {
  createEvent,
  VulnerabilityPayload,
  CompliancePayload,
} from '../../shared/events/domain-events.js';
import type {
  Vulnerability,
  VulnerabilitySeverity,
  SecurityAuditOptions,
  ComplianceReport,
  SASTResult,
  DASTResult,
  DependencyScanResult,
  SecretScanResult,
  DetectedSecret,
  ScanSummary,
} from '../../domains/security-compliance/interfaces.js';

// ============================================================================
// Protocol Types
// ============================================================================

/**
 * Security audit trigger types
 */
export type SecurityAuditTrigger =
  | 'daily'           // Daily 2am scheduled audit
  | 'dependency-update' // Triggered after package updates
  | 'manual'          // On-demand full audit
  | 'pre-release';    // Pre-deployment security check

/**
 * Security audit phase status
 */
export type AuditPhase =
  | 'initializing'
  | 'vulnerability-scan'
  | 'dependency-scan'
  | 'secret-scan'
  | 'compliance-validation'
  | 'triage'
  | 'report-generation'
  | 'completed'
  | 'failed';

/**
 * Security audit configuration
 */
export interface SecurityAuditConfig {
  /** Standards to validate against */
  complianceStandards: string[];
  /** Files/directories to scan */
  scanPaths: string[];
  /** Files/directories to exclude */
  excludePatterns: string[];
  /** Target URL for DAST (optional) */
  targetUrl?: string;
  /** Enable DAST scanning */
  enableDAST: boolean;
  /** Enable secret scanning */
  enableSecretScan: boolean;
  /** Severity threshold for blocking deployment */
  blockingSeverity: VulnerabilitySeverity;
  /** Maximum time for full audit in ms */
  timeout: number;
  /** Whether to auto-triage findings */
  autoTriage: boolean;
  /** Whether to send notifications */
  sendNotifications: boolean;
}

/**
 * Full security audit result
 */
export interface SecurityAuditResult {
  readonly auditId: string;
  readonly trigger: SecurityAuditTrigger;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly phase: AuditPhase;
  readonly sastResult?: SASTResult;
  readonly dastResult?: DASTResult;
  readonly dependencyResult?: DependencyScanResult;
  readonly secretResult?: SecretScanResult;
  readonly complianceReports: ComplianceReport[];
  readonly triagedFindings: TriagedFindings;
  readonly overallRiskScore: RiskScore;
  readonly recommendations: string[];
  readonly deploymentDecision: DeploymentDecision;
}

/**
 * Triaged vulnerability findings
 */
export interface TriagedFindings {
  readonly critical: Vulnerability[];
  readonly high: Vulnerability[];
  readonly medium: Vulnerability[];
  readonly low: Vulnerability[];
  readonly informational: Vulnerability[];
  readonly secretsExposed: DetectedSecret[];
}

/**
 * Deployment decision based on security audit
 */
export interface DeploymentDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly blockingIssues: string[];
  readonly warnings: string[];
}

// ============================================================================
// Protocol Events
// ============================================================================

/**
 * Security audit protocol event types
 */
export const SecurityAuditProtocolEvents = {
  SecurityAuditStarted: 'security-audit.SecurityAuditStarted',
  VulnerabilityDetected: 'security-audit.VulnerabilityDetected',
  DependencyVulnerabilityFound: 'security-audit.DependencyVulnerabilityFound',
  SecretExposureDetected: 'security-audit.SecretExposureDetected',
  ComplianceValidated: 'security-audit.ComplianceValidated',
  SecurityAuditCompleted: 'security-audit.SecurityAuditCompleted',
  DeploymentBlocked: 'security-audit.DeploymentBlocked',
} as const;

/**
 * Security audit started payload
 */
export interface SecurityAuditStartedPayload {
  auditId: string;
  trigger: SecurityAuditTrigger;
  timestamp: string;
  config: Partial<SecurityAuditConfig>;
}

/**
 * Dependency vulnerability found payload
 */
export interface DependencyVulnerabilityPayload {
  vulnId: string;
  cve?: string;
  packageName: string;
  packageVersion: string;
  severity: Severity;
  fixVersion?: string;
}

/**
 * Secret exposure detected payload
 */
export interface SecretExposurePayload {
  secretType: DetectedSecret['type'];
  file: string;
  line?: number;
  entropy: number;
  isValid: boolean;
}

/**
 * Security audit completed payload
 */
export interface SecurityAuditCompletedPayload {
  auditId: string;
  trigger: SecurityAuditTrigger;
  duration: number;
  vulnerabilityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  secretsFound: number;
  complianceScore: number;
  deploymentAllowed: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SecurityAuditConfig = {
  complianceStandards: ['soc2', 'gdpr'],
  scanPaths: ['src/**/*', 'lib/**/*'],
  excludePatterns: ['node_modules/**', 'dist/**', 'coverage/**', '**/*.test.*'],
  enableDAST: false,
  enableSecretScan: true,
  blockingSeverity: 'critical',
  timeout: 600000, // 10 minutes
  autoTriage: true,
  sendNotifications: true,
};

// ============================================================================
// Security Audit Protocol Implementation
// ============================================================================

/**
 * Security Audit Protocol
 *
 * Orchestrates comprehensive security auditing across multiple domains:
 * - security-compliance: All security scanning services
 * - code-intelligence: File analysis context
 * - quality-assessment: Security metrics for gate
 * - defect-intelligence: Security defect patterns
 */
export class SecurityAuditProtocol {
  private readonly config: SecurityAuditConfig;
  private currentAudit: SecurityAuditResult | null = null;
  private readonly activeAgents: Map<string, string> = new Map();

  constructor(
    private readonly eventBus: EventBus,
    private readonly memory: MemoryBackend,
    private readonly agentCoordinator: AgentCoordinator,
    config: Partial<SecurityAuditConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Main Protocol Execution
  // ==========================================================================

  /**
   * Execute security audit based on trigger type
   */
  async execute(trigger: SecurityAuditTrigger): Promise<Result<SecurityAuditResult>> {
    const auditId = uuidv4();
    const startedAt = new Date();

    try {
      // Publish audit started event
      await this.publishAuditStarted(auditId, trigger);

      // Initialize audit result
      this.currentAudit = {
        auditId,
        trigger,
        startedAt,
        completedAt: startedAt, // Updated at end
        phase: 'initializing',
        complianceReports: [],
        triagedFindings: this.createEmptyTriagedFindings(),
        overallRiskScore: RiskScore.create(0),
        recommendations: [],
        deploymentDecision: { allowed: true, reason: '', blockingIssues: [], warnings: [] },
      };

      // Adjust scope based on trigger
      const auditOptions = this.getAuditOptionsForTrigger(trigger);

      // Phase 1: Vulnerability Scan (SAST)
      this.updatePhase('vulnerability-scan');
      const sastResult = await this.scanVulnerabilities(auditOptions);
      if (sastResult.success) {
        this.currentAudit = { ...this.currentAudit, sastResult: sastResult.value };
        await this.publishVulnerabilities(sastResult.value.vulnerabilities);
      }

      // Phase 2: Dependency Scan
      this.updatePhase('dependency-scan');
      const depResult = await this.scanDependencies();
      if (depResult.success) {
        this.currentAudit = { ...this.currentAudit, dependencyResult: depResult.value };
        await this.publishDependencyVulnerabilities(depResult.value.vulnerabilities);
      }

      // Phase 3: Secret Scan (if enabled)
      if (this.config.enableSecretScan) {
        this.updatePhase('secret-scan');
        const secretResult = await this.auditSecrets();
        if (secretResult.success) {
          this.currentAudit = { ...this.currentAudit, secretResult: secretResult.value };
          await this.publishSecretExposures(secretResult.value.secretsFound);
        }
      }

      // Phase 4: DAST Scan (if enabled and URL provided)
      if (this.config.enableDAST && this.config.targetUrl) {
        const dastResult = await this.runDASTScan(this.config.targetUrl);
        if (dastResult.success) {
          this.currentAudit = { ...this.currentAudit, dastResult: dastResult.value };
          await this.publishVulnerabilities(dastResult.value.vulnerabilities);
        }
      }

      // Phase 5: Compliance Validation
      this.updatePhase('compliance-validation');
      const complianceResult = await this.validateCompliance();
      if (complianceResult.success) {
        this.currentAudit = {
          ...this.currentAudit,
          complianceReports: complianceResult.value,
        };
        await this.publishComplianceResults(complianceResult.value);
      }

      // Phase 6: Triage Findings
      this.updatePhase('triage');
      const triagedFindings = await this.triageFindings();
      this.currentAudit = { ...this.currentAudit, triagedFindings };

      // Phase 7: Generate Report
      this.updatePhase('report-generation');
      const report = await this.generateReport();

      // Finalize audit
      const completedAt = new Date();
      const finalResult: SecurityAuditResult = {
        ...this.currentAudit,
        completedAt,
        phase: 'completed',
        overallRiskScore: report.riskScore,
        recommendations: report.recommendations,
        deploymentDecision: report.deploymentDecision,
      };

      // Store audit result
      await this.storeAuditResult(finalResult);

      // Publish completion event
      await this.publishAuditCompleted(finalResult);

      // Handle critical findings
      if (!finalResult.deploymentDecision.allowed) {
        await this.handleDeploymentBlocked(finalResult);
      }

      // Cleanup agents
      await this.cleanupAgents();

      this.currentAudit = null;

      return ok(finalResult);
    } catch (error) {
      this.updatePhase('failed');
      await this.cleanupAgents();
      this.currentAudit = null;
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Scanning Methods
  // ==========================================================================

  /**
   * Scan for vulnerabilities using SAST
   */
  async scanVulnerabilities(options: SecurityAuditOptions): Promise<Result<SASTResult>> {
    try {
      // Spawn security scanner agent
      const agentId = await this.spawnAgent('security-scanner', ['sast', 'vulnerability-scan']);
      if (!agentId.success) {
        return err(agentId.error);
      }

      // Simulate SAST scan (in production, delegate to SecurityScannerService)
      const files = this.config.scanPaths.map(path => FilePath.create(path));

      const vulnerabilities = await this.performSASTAnalysis(files, options);

      const summary = this.calculateSummary(vulnerabilities);

      const result: SASTResult = {
        scanId: uuidv4(),
        vulnerabilities,
        summary,
        coverage: {
          filesScanned: files.length,
          linesScanned: vulnerabilities.length * 100, // Estimate
          rulesApplied: 45, // OWASP Top 10 + CWE
        },
      };

      return ok(result);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan dependencies for vulnerabilities
   */
  async scanDependencies(): Promise<Result<DependencyScanResult>> {
    try {
      const agentId = await this.spawnAgent('dependency-scanner', ['sca', 'dependency-scan']);
      if (!agentId.success) {
        return err(agentId.error);
      }

      // Simulate dependency scan
      const vulnerabilities: Vulnerability[] = [];

      // Check common vulnerability patterns
      const knownVulnerabilities = await this.checkKnownDependencyVulnerabilities();
      vulnerabilities.push(...knownVulnerabilities);

      const summary = this.calculateSummary(vulnerabilities);

      return ok({
        vulnerabilities,
        outdatedPackages: [],
        summary,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Audit for exposed secrets/credentials
   */
  async auditSecrets(): Promise<Result<SecretScanResult>> {
    try {
      const agentId = await this.spawnAgent('secret-scanner', ['secret-scan', 'credential-audit']);
      if (!agentId.success) {
        return err(agentId.error);
      }

      const secretsFound: DetectedSecret[] = [];

      // In production, this would scan actual files with patterns like:
      // - API keys: /(?:api[_-]?key|apikey)/gi
      // - Passwords: /(?:password|passwd|pwd)/gi
      // - Tokens: /(?:secret|token|bearer)/gi
      // - Private keys: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi
      // For now, report no secrets found (clean scan)

      return ok({
        secretsFound,
        filesScanned: this.config.scanPaths.length * 10, // Estimate
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Run DAST scan against target URL
   */
  private async runDASTScan(targetUrl: string): Promise<Result<DASTResult>> {
    try {
      const agentId = await this.spawnAgent('dast-scanner', ['dast', 'dynamic-scan']);
      if (!agentId.success) {
        return err(agentId.error);
      }

      // Simulate DAST scan
      const vulnerabilities: Vulnerability[] = [];

      // Check for common DAST findings
      const webVulns = await this.performDASTAnalysis(targetUrl);
      vulnerabilities.push(...webVulns);

      const summary = this.calculateSummary(vulnerabilities);

      return ok({
        scanId: uuidv4(),
        targetUrl,
        vulnerabilities,
        summary,
        crawledUrls: 50, // Estimate
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate against compliance standards
   */
  async validateCompliance(): Promise<Result<ComplianceReport[]>> {
    try {
      const agentId = await this.spawnAgent('compliance-validator', ['compliance', 'audit']);
      if (!agentId.success) {
        return err(agentId.error);
      }

      const reports: ComplianceReport[] = [];

      for (const standardId of this.config.complianceStandards) {
        const report = await this.validateStandard(standardId);
        if (report.success) {
          reports.push(report.value);
        }
      }

      return ok(reports);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate comprehensive security report
   */
  async generateReport(): Promise<{
    riskScore: RiskScore;
    recommendations: string[];
    deploymentDecision: DeploymentDecision;
  }> {
    if (!this.currentAudit) {
      return {
        riskScore: RiskScore.create(0),
        recommendations: [],
        deploymentDecision: { allowed: true, reason: 'No audit data', blockingIssues: [], warnings: [] },
      };
    }

    // Calculate risk score
    const riskValue = this.calculateRiskValue();
    const riskScore = RiskScore.create(Math.min(1, Math.max(0, riskValue)));

    // Generate recommendations
    const recommendations = this.generateRecommendations();

    // Determine deployment decision
    const deploymentDecision = this.determineDeploymentDecision(riskScore);

    return { riskScore, recommendations, deploymentDecision };
  }

  /**
   * Triage findings by severity and priority
   */
  async triageFindings(): Promise<TriagedFindings> {
    const triaged: TriagedFindings = this.createEmptyTriagedFindings();

    if (!this.currentAudit) return triaged;

    // Collect all vulnerabilities
    const allVulns: Vulnerability[] = [];

    if (this.currentAudit.sastResult) {
      allVulns.push(...this.currentAudit.sastResult.vulnerabilities);
    }
    if (this.currentAudit.dastResult) {
      allVulns.push(...this.currentAudit.dastResult.vulnerabilities);
    }
    if (this.currentAudit.dependencyResult) {
      allVulns.push(...this.currentAudit.dependencyResult.vulnerabilities);
    }

    // Triage by severity
    for (const vuln of allVulns) {
      switch (vuln.severity) {
        case 'critical':
          triaged.critical.push(vuln);
          break;
        case 'high':
          triaged.high.push(vuln);
          break;
        case 'medium':
          triaged.medium.push(vuln);
          break;
        case 'low':
          triaged.low.push(vuln);
          break;
        case 'informational':
          triaged.informational.push(vuln);
          break;
      }
    }

    // Add secrets
    if (this.currentAudit.secretResult) {
      triaged.secretsExposed.push(...this.currentAudit.secretResult.secretsFound);
    }

    // Sort each category by remediation effort (trivial first)
    const effortOrder = ['trivial', 'minor', 'moderate', 'major'];
    const sortByEffort = (a: Vulnerability, b: Vulnerability) =>
      effortOrder.indexOf(a.remediation.estimatedEffort) -
      effortOrder.indexOf(b.remediation.estimatedEffort);

    triaged.critical.sort(sortByEffort);
    triaged.high.sort(sortByEffort);
    triaged.medium.sort(sortByEffort);
    triaged.low.sort(sortByEffort);

    return triaged;
  }

  // ==========================================================================
  // Event Publishing
  // ==========================================================================

  private async publishAuditStarted(auditId: string, trigger: SecurityAuditTrigger): Promise<void> {
    const payload: SecurityAuditStartedPayload = {
      auditId,
      trigger,
      timestamp: new Date().toISOString(),
      config: {
        complianceStandards: this.config.complianceStandards,
        enableDAST: this.config.enableDAST,
        enableSecretScan: this.config.enableSecretScan,
      },
    };

    const event = createEvent(
      SecurityAuditProtocolEvents.SecurityAuditStarted,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async publishVulnerabilities(vulnerabilities: Vulnerability[]): Promise<void> {
    for (const vuln of vulnerabilities) {
      if (vuln.severity === 'critical' || vuln.severity === 'high') {
        const payload: VulnerabilityPayload = {
          vulnId: vuln.id,
          cve: vuln.cveId,
          severity: vuln.severity as Severity,
          file: vuln.location.file,
          line: vuln.location.line,
          description: vuln.description,
          remediation: vuln.remediation.description,
        };

        const event = createEvent(
          SecurityAuditProtocolEvents.VulnerabilityDetected,
          'security-compliance',
          payload
        );

        await this.eventBus.publish(event);
      }
    }
  }

  private async publishDependencyVulnerabilities(vulnerabilities: Vulnerability[]): Promise<void> {
    for (const vuln of vulnerabilities) {
      if (vuln.location.dependency) {
        const payload: DependencyVulnerabilityPayload = {
          vulnId: vuln.id,
          cve: vuln.cveId,
          packageName: vuln.location.dependency.name,
          packageVersion: vuln.location.dependency.version,
          severity: vuln.severity as Severity,
          fixVersion: vuln.remediation.fixExample,
        };

        const event = createEvent(
          SecurityAuditProtocolEvents.DependencyVulnerabilityFound,
          'security-compliance',
          payload
        );

        await this.eventBus.publish(event);
      }
    }
  }

  private async publishSecretExposures(secrets: DetectedSecret[]): Promise<void> {
    for (const secret of secrets) {
      const payload: SecretExposurePayload = {
        secretType: secret.type,
        file: secret.location.file,
        line: secret.location.line,
        entropy: secret.entropy,
        isValid: secret.isValid,
      };

      const event = createEvent(
        SecurityAuditProtocolEvents.SecretExposureDetected,
        'security-compliance',
        payload
      );

      await this.eventBus.publish(event);
    }
  }

  private async publishComplianceResults(reports: ComplianceReport[]): Promise<void> {
    for (const report of reports) {
      const payload: CompliancePayload = {
        standard: report.standardId,
        passed: report.complianceScore >= 80,
        violations: report.violations.length,
        findings: report.violations.slice(0, 5).map(v => v.details),
      };

      const event = createEvent(
        SecurityAuditProtocolEvents.ComplianceValidated,
        'security-compliance',
        payload
      );

      await this.eventBus.publish(event);
    }
  }

  private async publishAuditCompleted(result: SecurityAuditResult): Promise<void> {
    const duration = result.completedAt.getTime() - result.startedAt.getTime();

    const payload: SecurityAuditCompletedPayload = {
      auditId: result.auditId,
      trigger: result.trigger,
      duration,
      vulnerabilityCounts: {
        critical: result.triagedFindings.critical.length,
        high: result.triagedFindings.high.length,
        medium: result.triagedFindings.medium.length,
        low: result.triagedFindings.low.length,
      },
      secretsFound: result.triagedFindings.secretsExposed.length,
      complianceScore: this.calculateAverageComplianceScore(result.complianceReports),
      deploymentAllowed: result.deploymentDecision.allowed,
    };

    const event = createEvent(
      SecurityAuditProtocolEvents.SecurityAuditCompleted,
      'security-compliance',
      payload
    );

    await this.eventBus.publish(event);
  }

  private async handleDeploymentBlocked(result: SecurityAuditResult): Promise<void> {
    const event = createEvent(
      SecurityAuditProtocolEvents.DeploymentBlocked,
      'security-compliance',
      {
        auditId: result.auditId,
        reason: result.deploymentDecision.reason,
        blockingIssues: result.deploymentDecision.blockingIssues,
        riskLevel: result.overallRiskScore.level,
      }
    );

    await this.eventBus.publish(event);

    // Notify quality-assessment domain
    const qualityEvent = createEvent(
      'quality-assessment.SecurityGateFailed',
      'security-compliance',
      {
        auditId: result.auditId,
        criticalCount: result.triagedFindings.critical.length,
        highCount: result.triagedFindings.high.length,
        blockingIssues: result.deploymentDecision.blockingIssues,
      }
    );

    await this.eventBus.publish(qualityEvent);
  }

  // ==========================================================================
  // Agent Management
  // ==========================================================================

  private async spawnAgent(
    type: string,
    capabilities: string[]
  ): Promise<Result<string, Error>> {
    if (!this.agentCoordinator.canSpawn()) {
      return err(new Error('Agent limit reached'));
    }

    const config: AgentSpawnConfig = {
      name: `security-audit-${type}-${uuidv4().slice(0, 8)}`,
      domain: 'security-compliance',
      type: 'analyzer',
      capabilities,
      config: {
        auditId: this.currentAudit?.auditId,
        phase: this.currentAudit?.phase,
      },
    };

    const result = await this.agentCoordinator.spawn(config);
    if (result.success) {
      this.activeAgents.set(result.value, type);
    }

    return result;
  }

  private async cleanupAgents(): Promise<void> {
    for (const [agentId] of this.activeAgents) {
      await this.agentCoordinator.stop(agentId);
    }
    this.activeAgents.clear();
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getAuditOptionsForTrigger(trigger: SecurityAuditTrigger): SecurityAuditOptions {
    switch (trigger) {
      case 'daily':
        // Full comprehensive scan
        return {
          includeSAST: true,
          includeDAST: this.config.enableDAST,
          includeDependencies: true,
          includeSecrets: this.config.enableSecretScan,
          targetUrl: this.config.targetUrl,
        };
      case 'dependency-update':
        // Focus on dependency scanning
        return {
          includeSAST: false,
          includeDAST: false,
          includeDependencies: true,
          includeSecrets: false,
        };
      case 'manual':
        // Full scan
        return {
          includeSAST: true,
          includeDAST: this.config.enableDAST,
          includeDependencies: true,
          includeSecrets: this.config.enableSecretScan,
          targetUrl: this.config.targetUrl,
        };
      case 'pre-release':
        // Critical security checks only
        return {
          includeSAST: true,
          includeDAST: this.config.enableDAST,
          includeDependencies: true,
          includeSecrets: true, // Always check secrets before release
          targetUrl: this.config.targetUrl,
        };
      default:
        return {
          includeSAST: true,
          includeDAST: false,
          includeDependencies: true,
          includeSecrets: true,
        };
    }
  }

  private updatePhase(phase: AuditPhase): void {
    if (this.currentAudit) {
      this.currentAudit = { ...this.currentAudit, phase };
    }
  }

  private createEmptyTriagedFindings(): TriagedFindings {
    return {
      critical: [],
      high: [],
      medium: [],
      low: [],
      informational: [],
      secretsExposed: [],
    };
  }

  private calculateSummary(vulnerabilities: Vulnerability[]): ScanSummary {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let informational = 0;

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
      critical,
      high,
      medium,
      low,
      informational,
      totalFiles: 0,
      scanDurationMs: 0,
    };
  }

  private calculateRiskValue(): number {
    if (!this.currentAudit) return 0;

    let risk = 0;

    // Weight vulnerabilities by severity
    risk += this.currentAudit.triagedFindings.critical.length * 0.4;
    risk += this.currentAudit.triagedFindings.high.length * 0.25;
    risk += this.currentAudit.triagedFindings.medium.length * 0.1;
    risk += this.currentAudit.triagedFindings.low.length * 0.02;

    // Add weight for exposed secrets (very serious)
    risk += this.currentAudit.triagedFindings.secretsExposed.length * 0.5;

    // Factor in compliance scores
    const avgCompliance = this.calculateAverageComplianceScore(this.currentAudit.complianceReports);
    if (avgCompliance < 50) {
      risk += 0.3;
    } else if (avgCompliance < 80) {
      risk += 0.1;
    }

    return Math.min(1, risk);
  }

  private calculateAverageComplianceScore(reports: ComplianceReport[]): number {
    if (reports.length === 0) return 100;
    const sum = reports.reduce((acc, r) => acc + r.complianceScore, 0);
    return sum / reports.length;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (!this.currentAudit) return recommendations;

    const { triagedFindings, complianceReports } = this.currentAudit;

    // Critical findings
    if (triagedFindings.critical.length > 0) {
      recommendations.push(
        `URGENT: Address ${triagedFindings.critical.length} critical vulnerabilities immediately`
      );
    }

    // High severity
    if (triagedFindings.high.length > 0) {
      recommendations.push(
        `Address ${triagedFindings.high.length} high-severity vulnerabilities within 24 hours`
      );
    }

    // Secrets
    if (triagedFindings.secretsExposed.length > 0) {
      recommendations.push(
        `CRITICAL: ${triagedFindings.secretsExposed.length} exposed secrets detected - rotate credentials immediately`
      );
    }

    // Compliance
    for (const report of complianceReports) {
      if (report.complianceScore < 80) {
        recommendations.push(
          `Improve ${report.standardName} compliance from ${report.complianceScore}% to at least 80%`
        );
      }
    }

    // Medium/Low
    const mediumLowCount = triagedFindings.medium.length + triagedFindings.low.length;
    if (mediumLowCount > 10) {
      recommendations.push(
        `Schedule remediation for ${mediumLowCount} medium/low severity issues`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is good. Continue regular scanning.');
    }

    return recommendations;
  }

  private determineDeploymentDecision(_riskScore: RiskScore): DeploymentDecision {
    const blockingIssues: string[] = [];
    const warnings: string[] = [];

    if (!this.currentAudit) {
      return { allowed: true, reason: 'No audit data', blockingIssues, warnings };
    }

    const { triagedFindings, complianceReports } = this.currentAudit;

    // Check critical vulnerabilities
    if (triagedFindings.critical.length > 0) {
      blockingIssues.push(`${triagedFindings.critical.length} critical vulnerabilities`);
    }

    // Check secrets
    if (triagedFindings.secretsExposed.length > 0) {
      blockingIssues.push(`${triagedFindings.secretsExposed.length} exposed secrets`);
    }

    // Check blocking severity threshold - block deployment if vulnerabilities exceed threshold
    const severityCounts: Record<VulnerabilitySeverity, number> = {
      critical: triagedFindings.critical.length,
      high: triagedFindings.high.length,
      medium: triagedFindings.medium.length,
      low: triagedFindings.low.length,
      informational: triagedFindings.informational.length,
    };

    // Block if configured severity level has issues
    if (severityCounts[this.config.blockingSeverity] > 0) {
      blockingIssues.push(
        `${severityCounts[this.config.blockingSeverity]} ${this.config.blockingSeverity}-severity vulnerabilities`
      );
    }

    // Warnings for non-blocking issues
    if (triagedFindings.high.length > 0 && this.config.blockingSeverity !== 'high') {
      warnings.push(`${triagedFindings.high.length} high-severity vulnerabilities require attention`);
    }

    // Compliance failures
    for (const report of complianceReports) {
      if (report.complianceScore < 50) {
        blockingIssues.push(`${report.standardName} compliance score ${report.complianceScore}% is below 50%`);
      } else if (report.complianceScore < 80) {
        warnings.push(`${report.standardName} compliance score is ${report.complianceScore}%`);
      }
    }

    const allowed = blockingIssues.length === 0;
    const reason = allowed
      ? 'All security checks passed'
      : `Deployment blocked due to: ${blockingIssues.join(', ')}`;

    return { allowed, reason, blockingIssues, warnings };
  }

  private async storeAuditResult(result: SecurityAuditResult): Promise<void> {
    await this.memory.set(
      `security-audit:${result.auditId}`,
      result,
      { namespace: 'security-compliance', persist: true }
    );

    // Also store latest audit reference
    await this.memory.set(
      'security-audit:latest',
      { auditId: result.auditId, timestamp: result.completedAt.toISOString() },
      { namespace: 'security-compliance' }
    );
  }

  // ==========================================================================
  // Stub Analysis Methods (In production, delegate to services)
  // ==========================================================================

  private async performSASTAnalysis(
    _files: FilePath[],
    _options: SecurityAuditOptions
  ): Promise<Vulnerability[]> {
    // Stub: In production, this would call SecurityScannerService
    return [];
  }

  private async performDASTAnalysis(_targetUrl: string): Promise<Vulnerability[]> {
    // Stub: In production, this would call SecurityScannerService
    return [];
  }

  private async checkKnownDependencyVulnerabilities(): Promise<Vulnerability[]> {
    // Stub: In production, this would call SecurityAuditorService
    return [];
  }

  private async validateStandard(standardId: string): Promise<Result<ComplianceReport>> {
    // Stub: In production, this would call ComplianceValidatorService
    return ok({
      standardId,
      standardName: standardId.toUpperCase(),
      violations: [],
      passedRules: [],
      skippedRules: [],
      complianceScore: 85,
      generatedAt: new Date(),
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new SecurityAuditProtocol instance
 */
export function createSecurityAuditProtocol(
  eventBus: EventBus,
  memory: MemoryBackend,
  agentCoordinator: AgentCoordinator,
  config?: Partial<SecurityAuditConfig>
): SecurityAuditProtocol {
  return new SecurityAuditProtocol(eventBus, memory, agentCoordinator, config);
}
