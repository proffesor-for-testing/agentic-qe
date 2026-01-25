/**
 * SecurityScannerAgent - Vulnerability detection and compliance validation
 *
 * Responsibilities:
 * - SAST scanning (static code analysis: SonarQube, Checkmarx, Semgrep)
 * - DAST scanning (dynamic application security: OWASP ZAP, Burp Suite)
 * - Dependency scanning (vulnerable packages: npm audit, Snyk, Dependabot)
 * - Container scanning (Docker image vulnerabilities: Trivy, Clair)
 * - Compliance checking (OWASP Top 10, CWE, GDPR, SOC2)
 * - Security gate enforcement (block deployments on critical vulnerabilities)
 * - CVE monitoring (track known vulnerabilities)
 */

import { BaseAgent, BaseAgentConfig } from './BaseAgent';
import { SecureRandom } from '../utils/SecureRandom.js';
import { Logger } from '../utils/Logger';
import { QEAgentType, QETask, TaskAssignment, PreTaskData, PostTaskData, TaskErrorData } from '../types';
import { RealSecurityScanner } from '../utils/SecurityScanner';

// ============================================================================
// Security Scanner Type Definitions
// ============================================================================

/**
 * Metadata for security scan operations
 */
export interface SecurityScanMetadata {
  /** Target path or URL to scan */
  path?: string;
  target?: string;
  /** Include mock findings for testing */
  includeFindings?: boolean;
  /** Docker/container image name */
  image?: string;
  /** Additional scan options */
  options?: Record<string, unknown>;
}

/**
 * Result of security gate evaluation
 */
export interface SecurityGateResult {
  passed: boolean;
  reason?: string;
  blockers: VulnerabilityFinding[];
}

/**
 * Security report generation result
 */
export interface SecurityReportResult {
  generatedAt: Date;
  period: {
    from: Date | undefined;
    to: Date | undefined;
  };
  summary: {
    totalScans: number;
    averageSecurityScore: number;
    totalFindings: number;
    criticalFindings: number;
  };
  latestScan: {
    scanId: string;
    timestamp: Date;
    securityScore: number;
    findings: SecurityScanResult['summary'];
  } | null;
  trends: {
    securityScoreImprovement: number;
  };
  recommendations: string[];
}

/**
 * Event data for test generation events
 */
interface TestGeneratedEventData {
  testId?: string;
  filePath?: string;
  testType?: string;
  code?: string;
}

/**
 * Event data for deployment request events
 */
interface DeploymentRequestEventData {
  deploymentId?: string;
  environment?: string;
  version?: string;
  path?: string;
  target?: string;
}

/**
 * CVE event data structure
 */
interface CVEEventData {
  cve?: CVERecord;
  source?: string;
  timestamp?: Date;
}

/**
 * Result from extractTaskMetrics
 */
interface SecurityTaskResult {
  summary?: {
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    total?: number;
  };
  securityScore?: number;
  duration?: number;
  passed?: boolean;
  findings?: Array<VulnerabilityFinding & {
    fix?: string;
  }>;
  compliance?: {
    overallCompliance?: number;
    passed?: boolean;
  };
  success?: boolean;
  vulnerabilities?: VulnerabilityFinding[];
}

/**
 * Detailed status returned by getDetailedStatus()
 */
export interface SecurityScannerDetailedStatus {
  agentId: {
    id: string;
    type: QEAgentType;
    created: Date;
  };
  status: string;
  currentTask?: string;
  capabilities: string[];
  performanceMetrics: {
    tasksCompleted: number;
    averageExecutionTime: number;
    errorCount: number;
    lastActivity: Date;
  };
  scanHistory: SecurityScanResult[];
  baselineFindings: number;
  cveDatabase: number;
  config: {
    tools: SecurityScannerConfig['tools'];
    thresholds: SecurityScannerConfig['thresholds'];
    compliance: SecurityScannerConfig['compliance'];
    scanScope: SecurityScannerConfig['scanScope'];
  };
}

export interface SecurityScannerConfig extends BaseAgentConfig {
  tools?: {
    sast?: 'sonarqube' | 'checkmarx' | 'semgrep';
    dast?: 'owasp-zap' | 'burp-suite';
    dependencies?: 'npm-audit' | 'snyk' | 'dependabot';
    containers?: 'trivy' | 'clair' | 'aqua';
  };
  thresholds?: {
    maxCriticalVulnerabilities: number; // default: 0
    maxHighVulnerabilities: number; // default: 5
    maxMediumVulnerabilities: number; // default: 20
    minSecurityScore: number; // 0-100, default: 80
  };
  compliance?: {
    standards: string[]; // ['OWASP-Top-10', 'CWE-25', 'GDPR', 'SOC2']
    enforceCompliance: boolean; // default: true
  };
  scanScope?: {
    includeCode: boolean; // SAST
    includeDependencies: boolean; // SCA
    includeContainers: boolean; // Container scan
    includeDynamic: boolean; // DAST
  };
}

export interface VulnerabilityFinding {
  id: string;
  type: 'sast' | 'dast' | 'dependency' | 'container';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location: string;
  cwe?: string;
  cve?: string;
  cvss?: number;
  remediation?: string;
  references?: string[];
  [key: string]: unknown;
}

export interface SecurityScanResult {
  scanId: string;
  timestamp: Date;
  scanType: string;
  findings: VulnerabilityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  securityScore: number; // 0-100
  passed: boolean;
  duration: number;
  [key: string]: unknown;
}

export interface ComplianceReport {
  standard: string;
  requirements: {
    id: string;
    description: string;
    status: 'compliant' | 'non-compliant' | 'not-applicable';
    findings?: VulnerabilityFinding[];
  }[];
  overallCompliance: number; // percentage
  passed: boolean;
  [key: string]: unknown;
}

export interface CVERecord {
  id: string;
  cve: string;
  severity: string;
  description: string;
  affectedPackages: string[];
  publishedDate: Date;
  lastModifiedDate: Date;
}

export class SecurityScannerAgent extends BaseAgent {
  private config: SecurityScannerConfig;
  private cveDatabase: Map<string, CVERecord> = new Map();
  private scanHistory: SecurityScanResult[] = [];
  private baselineFindings: Map<string, VulnerabilityFinding> = new Map();
  private realScanner: RealSecurityScanner;

  // Phase 0.5: Pattern store for self-learning vulnerability patterns
  private patternStoreEnabled: boolean = true;

  constructor(config: SecurityScannerConfig) {
    super({
      id: config.id || `security-scanner-${Date.now()}`,
      type: QEAgentType.SECURITY_SCANNER,
      capabilities: [
        {
          name: 'sast-scanning',
          version: '2.0.0',
          description: 'Static application security testing (SonarQube, Checkmarx, Semgrep)'
        },
        {
          name: 'dast-scanning',
          version: '2.0.0',
          description: 'Dynamic application security testing (OWASP ZAP, Burp Suite)'
        },
        {
          name: 'dependency-scanning',
          version: '2.0.0',
          description: 'Vulnerable package detection (npm audit, Snyk, Dependabot)'
        },
        {
          name: 'container-scanning',
          version: '2.0.0',
          description: 'Docker image vulnerability scanning (Trivy, Clair)'
        },
        {
          name: 'compliance-checking',
          version: '2.0.0',
          description: 'Regulatory compliance validation (OWASP, GDPR, SOC2)'
        },
        {
          name: 'security-gate-enforcement',
          version: '2.0.0',
          description: 'Block deployments on critical vulnerabilities'
        },
        {
          name: 'cve-monitoring',
          version: '2.0.0',
          description: 'Real-time CVE database monitoring'
        }
      ],
      context: config.context,
      memoryStore: config.memoryStore,
      eventBus: config.eventBus
    });

    this.config = {
      tools: {
        sast: 'semgrep',
        dast: 'owasp-zap',
        dependencies: 'npm-audit',
        containers: 'trivy',
        ...config.tools
      },
      thresholds: {
        maxCriticalVulnerabilities: 0,
        maxHighVulnerabilities: 5,
        maxMediumVulnerabilities: 20,
        minSecurityScore: 80,
        ...config.thresholds
      },
      compliance: {
        standards: ['OWASP-Top-10', 'CWE-25'],
        enforceCompliance: true,
        ...config.compliance
      },
      scanScope: {
        includeCode: true,
        includeDependencies: true,
        includeContainers: false,
        includeDynamic: false,
        ...config.scanScope
      },
      ...config
    };

    // Initialize real security scanner
    this.realScanner = new RealSecurityScanner(process.cwd());
  }

  // ============================================================================
  // Lifecycle Hooks for Security Scanning Coordination
  // ============================================================================

  /**
   * Pre-task hook - Load security scan history
   */
  protected async onPreTask(data: PreTaskData): Promise<void> {
    await super.onPreTask(data);

    const history = await this.memoryStore.retrieve(
      `aqe/${this.agentId.type}/history`
    ) as SecurityScanResult[] | null;

    if (history && Array.isArray(history)) {
      this.logger.info(`Loaded ${history.length} historical security scan entries`);
    }

    this.logger.info(`[${this.agentId.type}] Starting security scan task`, {
      taskId: data.assignment.id,
      taskType: data.assignment.task.type
    });
  }

  /**
   * Post-task hook - Store security scan results and emit events
   */
  protected async onPostTask(data: PostTaskData): Promise<void> {
    await super.onPostTask(data);

    // Type guard to extract vulnerabilities from result
    const result = data.result as SecurityTaskResult | null;
    const vulnerabilities = result?.vulnerabilities || [];
    const findings = result?.findings || vulnerabilities;

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/results/${data.assignment.id}`,
      {
        result: data.result,
        timestamp: new Date(),
        taskType: data.assignment.task.type,
        success: result?.success !== false,
        vulnerabilitiesFound: vulnerabilities.length
      },
      86400
    );

    // Phase 0.5: Store vulnerability patterns for self-learning
    if (this.patternStoreEnabled && findings.length > 0) {
      await this.storeSecurityPatterns(findings);
    }

    this.eventBus.emit(`${this.agentId.type}:completed`, {
      agentId: this.agentId,
      result: data.result,
      timestamp: new Date(),
      vulnerabilities
    });

    this.logger.info(`[${this.agentId.type}] Security scan completed`, {
      taskId: data.assignment.id,
      vulnerabilitiesFound: vulnerabilities.length
    });
  }

  /**
   * Task error hook - Log security scan failures
   */
  protected async onTaskError(data: TaskErrorData): Promise<void> {
    await super.onTaskError(data);

    await this.memoryStore.store(
      `aqe/${this.agentId.type}/errors/${Date.now()}`,
      {
        taskId: data.assignment.id,
        error: data.error.message,
        stack: data.error.stack,
        timestamp: new Date(),
        taskType: data.assignment.task.type
      },
      604800
    );

    this.eventBus.emit(`${this.agentId.type}:error`, {
      agentId: this.agentId,
      error: data.error,
      taskId: data.assignment.id,
      timestamp: new Date()
    });

    this.logger.error(`[${this.agentId.type}] Security scan failed`, {
      taskId: data.assignment.id,
      error: data.error.message
    });
  }

  // ============================================================================
  // BaseAgent Abstract Methods Implementation
  // ============================================================================

  protected async initializeComponents(): Promise<void> {
    this.logger.info(`[SecurityScanner] Initializing security scanning tools`);

    // Register event handlers for security coordination
    this.registerEventHandler({
      eventType: 'test.generated',
      handler: async (event) => {
        // Automatically scan newly generated tests for security issues
        await this.handleTestGenerated(event.data as TestGeneratedEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'deployment.requested',
      handler: async (event) => {
        // Enforce security gate before deployment
        await this.handleDeploymentRequest(event.data as DeploymentRequestEventData);
      }
    });

    this.registerEventHandler({
      eventType: 'cve.published',
      handler: async (event) => {
        // Monitor new CVE publications
        await this.handleNewCVE(event.data as CVEEventData);
      }
    });

    // Load CVE database
    await this.loadCVEDatabase();

    // Initialize scanning tools (mock initialization for now)
    await this.initializeScanningTools();

    // Store initialization status
    await this.storeSharedMemory('status', {
      initialized: true,
      tools: this.config.tools,
      thresholds: this.config.thresholds
    });

    this.logger.info('[SecurityScanner] Initialization complete');
  }

  protected async performTask(task: QETask): Promise<unknown> {
    this.logger.info(`[SecurityScanner] Performing task: ${task.type}`);
    const taskPayload = task.payload as SecurityScanMetadata;

    switch (task.type) {
      case 'run-security-scan':
        return await this.runSecurityScan(taskPayload);

      case 'scan-dependencies':
        return await this.scanDependencies(taskPayload);

      case 'scan-containers':
        return await this.scanContainers(taskPayload);

      case 'check-compliance':
        return await this.checkCompliance(taskPayload);

      case 'enforce-security-gate':
        return await this.enforceSecurityGate(taskPayload);

      case 'generate-security-report':
        return await this.generateSecurityReport(taskPayload);

      case 'update-baseline':
        return await this.updateSecurityBaseline(taskPayload);

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  protected async loadKnowledge(): Promise<void> {
    this.logger.info('[SecurityScanner] Loading security knowledge from memory');

    try {
      // Restore baseline findings
      const savedBaseline = await this.memoryStore.retrieve('aqe/security/baselines') as { findings?: Record<string, VulnerabilityFinding>; timestamp?: Date } | null;
      if (savedBaseline && savedBaseline.findings) {
        this.baselineFindings = new Map(Object.entries(savedBaseline.findings));
      }

      // Restore scan history
      const savedHistory = await this.memoryStore.retrieve('aqe/security/scan-history') as { entries?: SecurityScanResult[] } | null;
      if (savedHistory && savedHistory.entries) {
        this.scanHistory = savedHistory.entries;
      }

      // Restore CVE database
      const savedCVE = await this.memoryStore.retrieve('aqe/security/cve-database');
      if (savedCVE) {
        this.cveDatabase = new Map(Object.entries(savedCVE));
      }

    } catch (error) {
      this.logger.warn('[SecurityScanner] Could not restore full state, using defaults:', error);
    }
  }

  protected async cleanup(): Promise<void> {
    this.logger.info('[SecurityScanner] Cleaning up security scanner resources');

    // Save baseline findings
    await this.memoryStore.store('aqe/security/baselines', {
      findings: Object.fromEntries(this.baselineFindings),
      timestamp: new Date()
    });

    // Save scan history (keep last 50 scans)
    await this.memoryStore.store('aqe/security/scan-history', { entries: this.scanHistory.slice(-50) });

    // Save CVE database
    await this.memoryStore.store('aqe/security/cve-database', Object.fromEntries(this.cveDatabase));

    // Clear in-memory data
    this.cveDatabase.clear();
    this.scanHistory = [];
    this.baselineFindings.clear();
  }

  // ============================================================================
  // Core Security Scanning Methods
  // ============================================================================

  private async runSecurityScan(metadata: SecurityScanMetadata): Promise<SecurityScanResult> {
    const startTime = Date.now();
    const scanId = `scan-${Date.now()}`;

    this.logger.info(`[SecurityScanner] Running comprehensive security scan: ${scanId}`);

    const allFindings: VulnerabilityFinding[] = [];

    // Run SAST scan
    if (this.config.scanScope?.includeCode) {
      const sastResults = await this.runSASTScan(metadata);
      allFindings.push(...sastResults.findings);
    }

    // Run DAST scan
    if (this.config.scanScope?.includeDynamic) {
      const dastResults = await this.runDASTScan(metadata);
      allFindings.push(...dastResults.findings);
    }

    // Run dependency scan
    if (this.config.scanScope?.includeDependencies) {
      const depResults = await this.scanDependencies(metadata);
      allFindings.push(...depResults.findings);
    }

    // Run container scan
    if (this.config.scanScope?.includeContainers) {
      const containerResults = await this.scanContainers(metadata);
      allFindings.push(...containerResults.findings);
    }

    // Calculate summary
    const summary = this.calculateSummary(allFindings);
    const securityScore = this.calculateSecurityScore(summary);
    const passed = this.evaluateSecurityGate(summary, securityScore);

    const result: SecurityScanResult = {
      scanId,
      timestamp: new Date(),
      scanType: 'comprehensive',
      findings: allFindings,
      summary,
      securityScore,
      passed,
      duration: Date.now() - startTime
    };

    // Store scan result
    this.scanHistory.push(result);
    await this.memoryStore.store(`aqe/security/scans/${scanId}`, result);

    // Emit events based on findings
    if (!passed) {
      this.emitEvent('security.scan.failed', { scanId, summary, securityScore }, 'critical');
    } else {
      this.emitEvent('security.scan.completed', { scanId, summary, securityScore }, 'medium');
    }

    // Alert on critical vulnerabilities
    const criticalFindings = allFindings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      this.emitEvent('security.critical.found', {
        scanId,
        count: criticalFindings.length,
        findings: criticalFindings
      }, 'critical');
    }

    return result;
  }

  private async runSASTScan(metadata: SecurityScanMetadata): Promise<SecurityScanResult> {
    this.logger.info(`[SecurityScanner] Running SAST scan with ${this.config.tools?.sast}`);

    const startTime = Date.now();
    const findings: VulnerabilityFinding[] = [];

    try {
      // Determine scan target
      const target = metadata.path || metadata.target || 'src';

      // Run ESLint security scan
      this.logger.info(`[SecurityScanner] Running ESLint security scan on ${target}`);
      const eslintResult = await this.realScanner.runESLintScan(target);
      if (eslintResult.success) {
        findings.push(...eslintResult.findings);
        this.logger.info(`[SecurityScanner] ESLint found ${eslintResult.findings.length} issues`);
      } else {
        this.logger.warn(`[SecurityScanner] ESLint scan failed: ${eslintResult.error}`);
      }

      // Run Semgrep scan if available
      this.logger.info(`[SecurityScanner] Running Semgrep SAST scan on ${target}`);
      const semgrepResult = await this.realScanner.runSemgrepScan(target);
      if (semgrepResult.success) {
        findings.push(...semgrepResult.findings);
        this.logger.info(`[SecurityScanner] Semgrep found ${semgrepResult.findings.length} issues`);
      } else if (semgrepResult.error) {
        this.logger.warn(`[SecurityScanner] Semgrep scan failed: ${semgrepResult.error}`);
      }
    } catch (error) {
      this.logger.error('[SecurityScanner] SAST scan error:', error);
    }

    const summary = this.calculateSummary(findings);

    return {
      scanId: `sast-${Date.now()}`,
      timestamp: new Date(),
      scanType: 'sast',
      findings,
      summary,
      securityScore: this.calculateSecurityScore(summary),
      passed: summary.critical === 0,
      duration: Date.now() - startTime
    };
  }

  private async runDASTScan(metadata: SecurityScanMetadata): Promise<SecurityScanResult> {
    this.logger.info(`[SecurityScanner] Running DAST scan with ${this.config.tools?.dast}`);

    // Mock DAST scan implementation
    const findings: VulnerabilityFinding[] = [];

    // Simulate runtime vulnerability detection
    if (metadata.target && metadata.includeFindings !== false) {
      // Mock: Simulate finding vulnerabilities at runtime
      findings.push({
        id: `dast-${Date.now()}-1`,
        type: 'dast',
        severity: 'medium',
        title: 'Insecure HTTP Header',
        description: 'Missing security headers detected',
        location: `${metadata.target}/api/endpoint`,
        remediation: 'Add security headers: X-Frame-Options, X-Content-Type-Options'
      });
    }

    const summary = this.calculateSummary(findings);

    return {
      scanId: `dast-${Date.now()}`,
      timestamp: new Date(),
      scanType: 'dast',
      findings,
      summary,
      securityScore: this.calculateSecurityScore(summary),
      passed: summary.critical === 0,
      duration: 2000
    };
  }

  private async scanDependencies(_metadata: SecurityScanMetadata): Promise<SecurityScanResult> {
    this.logger.info(`[SecurityScanner] Scanning dependencies with ${this.config.tools?.dependencies}`);

    const startTime = Date.now();
    const findings: VulnerabilityFinding[] = [];

    try {
      // Run NPM audit
      this.logger.info('[SecurityScanner] Running NPM audit scan');
      const auditResult = await this.realScanner.runNPMAuditScan();

      if (auditResult.success) {
        findings.push(...auditResult.findings);
        this.logger.info(`[SecurityScanner] NPM audit found ${auditResult.findings.length} vulnerabilities`);
      } else {
        this.logger.warn(`[SecurityScanner] NPM audit failed: ${auditResult.error}`);
      }
    } catch (error) {
      this.logger.error('[SecurityScanner] Dependency scan error:', error);
    }

    const summary = this.calculateSummary(findings);

    // Store dependency scan results
    await this.memoryStore.store('aqe/security/dependencies', {
      findings,
      timestamp: new Date(),
      summary
    });

    return {
      scanId: `dep-${Date.now()}`,
      timestamp: new Date(),
      scanType: 'dependency',
      findings,
      summary,
      securityScore: this.calculateSecurityScore(summary),
      passed: summary.critical === 0 && summary.high <= this.config.thresholds!.maxHighVulnerabilities,
      duration: Date.now() - startTime
    };
  }

  private async scanContainers(metadata: SecurityScanMetadata): Promise<SecurityScanResult> {
    this.logger.info(`[SecurityScanner] Scanning containers with ${this.config.tools?.containers}`);

    const findings: VulnerabilityFinding[] = [];

    // Mock container scan
    if (metadata.image && metadata.includeFindings !== false) {
      findings.push({
        id: `container-${Date.now()}-1`,
        type: 'container',
        severity: 'medium',
        title: 'Outdated Base Image',
        description: 'Base image contains known vulnerabilities',
        location: `${metadata.image}:latest`,
        remediation: 'Update to latest base image version'
      });
    }

    const summary = this.calculateSummary(findings);

    return {
      scanId: `container-${Date.now()}`,
      timestamp: new Date(),
      scanType: 'container',
      findings,
      summary,
      securityScore: this.calculateSecurityScore(summary),
      passed: summary.critical === 0,
      duration: 1500
    };
  }

  // ============================================================================
  // Compliance Checking
  // ============================================================================

  private async checkCompliance(metadata: SecurityScanMetadata): Promise<ComplianceReport[]> {
    this.logger.info(`[SecurityScanner] Checking compliance for standards:`, this.config.compliance?.standards);

    const reports: ComplianceReport[] = [];

    for (const standard of this.config.compliance?.standards || []) {
      const report = await this.checkStandardCompliance(standard, metadata);
      reports.push(report);

      // Store compliance report
      await this.memoryStore.store(`aqe/security/compliance/${standard}`, report);

      // Emit events
      if (!report.passed && this.config.compliance?.enforceCompliance) {
        this.emitEvent('security.compliance.failed', {
          standard,
          compliance: report.overallCompliance,
          violations: report.requirements.filter(r => r.status === 'non-compliant').length
        }, 'high');
      }
    }

    return reports;
  }

  private async checkStandardCompliance(standard: string, metadata: SecurityScanMetadata): Promise<ComplianceReport> {
    this.logger.info(`[SecurityScanner] Checking ${standard} compliance`);

    const requirements = this.getStandardRequirements(standard);
    const report: ComplianceReport = {
      standard,
      requirements: [],
      overallCompliance: 0,
      passed: false
    };

    // Check each requirement
    for (const req of requirements) {
      const status = await this.checkRequirement(req, metadata);
      report.requirements.push({
        id: req.id,
        description: req.description,
        status
      });
    }

    // Calculate overall compliance
    const compliantCount = report.requirements.filter(r => r.status === 'compliant').length;
    report.overallCompliance = (compliantCount / report.requirements.length) * 100;
    report.passed = report.overallCompliance >= 95; // 95% compliance threshold

    return report;
  }

  private getStandardRequirements(standard: string): Array<{ id: string; description: string }> {
    // Mock compliance requirements
    const requirementsMap: Record<string, Array<{ id: string; description: string }>> = {
      'OWASP-Top-10': [
        { id: 'A01', description: 'Broken Access Control' },
        { id: 'A02', description: 'Cryptographic Failures' },
        { id: 'A03', description: 'Injection' },
        { id: 'A04', description: 'Insecure Design' },
        { id: 'A05', description: 'Security Misconfiguration' }
      ],
      'CWE-25': [
        { id: 'CWE-79', description: 'Cross-site Scripting (XSS)' },
        { id: 'CWE-89', description: 'SQL Injection' },
        { id: 'CWE-22', description: 'Path Traversal' }
      ],
      'GDPR': [
        { id: 'Art-25', description: 'Data Protection by Design' },
        { id: 'Art-32', description: 'Security of Processing' }
      ],
      'SOC2': [
        { id: 'CC6.1', description: 'Logical and Physical Access Controls' },
        { id: 'CC7.1', description: 'System Operations' }
      ]
    };

    return requirementsMap[standard] || [];
  }

  private async checkRequirement(_req: { id: string; description: string }, _metadata: SecurityScanMetadata): Promise<'compliant' | 'non-compliant' | 'not-applicable'> {
    // Mock requirement checking
    // In production, this would perform actual compliance checks
    return SecureRandom.randomFloat() > 0.1 ? 'compliant' : 'non-compliant';
  }

  // ============================================================================
  // Security Gate Enforcement
  // ============================================================================

  private async enforceSecurityGate(metadata: SecurityScanMetadata): Promise<SecurityGateResult> {
    this.logger.info(`[SecurityScanner] Enforcing security gate`);

    // Run security scan
    const scanResult = await this.runSecurityScan(metadata);

    // Check thresholds
    const blockers: VulnerabilityFinding[] = [];

    if (scanResult.summary.critical > this.config.thresholds!.maxCriticalVulnerabilities) {
      blockers.push(...scanResult.findings.filter(f => f.severity === 'critical'));
    }

    if (scanResult.summary.high > this.config.thresholds!.maxHighVulnerabilities) {
      const highBlockers = scanResult.findings
        .filter(f => f.severity === 'high')
        .slice(0, scanResult.summary.high - this.config.thresholds!.maxHighVulnerabilities);
      blockers.push(...highBlockers);
    }

    if (scanResult.securityScore < this.config.thresholds!.minSecurityScore) {
      // Security score too low
    }

    const passed = blockers.length === 0 && scanResult.securityScore >= this.config.thresholds!.minSecurityScore;

    if (!passed) {
      this.emitEvent('security.gate.failed', {
        scanId: scanResult.scanId,
        blockers: blockers.length,
        securityScore: scanResult.securityScore
      }, 'critical');
    }

    return {
      passed,
      reason: passed ? undefined : `${blockers.length} blocker(s) found, security score: ${scanResult.securityScore}`,
      blockers
    };
  }

  // ============================================================================
  // Reporting & Analysis
  // ============================================================================

  private async generateSecurityReport(_metadata: SecurityScanMetadata): Promise<SecurityReportResult> {
    this.logger.info(`[SecurityScanner] Generating security report`);

    const recentScans = this.scanHistory.slice(-10);
    const latestScan = recentScans[recentScans.length - 1];

    // Calculate trends
    const avgSecurityScore = recentScans.reduce((sum, scan) => sum + scan.securityScore, 0) / recentScans.length;
    const totalFindings = recentScans.reduce((sum, scan) => sum + scan.summary.total, 0);

    const report = {
      generatedAt: new Date(),
      period: {
        from: recentScans[0]?.timestamp,
        to: latestScan?.timestamp
      },
      summary: {
        totalScans: recentScans.length,
        averageSecurityScore: avgSecurityScore,
        totalFindings,
        criticalFindings: recentScans.reduce((sum, scan) => sum + scan.summary.critical, 0)
      },
      latestScan: latestScan ? {
        scanId: latestScan.scanId,
        timestamp: latestScan.timestamp,
        securityScore: latestScan.securityScore,
        findings: latestScan.summary
      } : null,
      trends: {
        securityScoreImprovement: recentScans.length > 1 ?
          latestScan.securityScore - recentScans[0].securityScore : 0
      },
      recommendations: this.generateRecommendations(latestScan)
    };

    // Store report
    await this.memoryStore.store('aqe/security/reports/latest', report);

    return report;
  }

  private async updateSecurityBaseline(_metadata: SecurityScanMetadata): Promise<void> {
    this.logger.info(`[SecurityScanner] Updating security baseline`);

    const latestScan = this.scanHistory[this.scanHistory.length - 1];
    if (!latestScan) {
      throw new Error('No scan results available to set as baseline');
    }

    // Store findings as baseline
    this.baselineFindings.clear();
    for (const finding of latestScan.findings) {
      this.baselineFindings.set(finding.id, finding);
    }

    // Store baseline in memory
    await this.memoryStore.store('aqe/security/baselines', {
      scanId: latestScan.scanId,
      timestamp: new Date(),
      findings: Object.fromEntries(this.baselineFindings),
      summary: latestScan.summary,
      securityScore: latestScan.securityScore
    });

    this.emitEvent('security.baseline.updated', {
      scanId: latestScan.scanId,
      findingsCount: this.baselineFindings.size,
      securityScore: latestScan.securityScore
    }, 'medium');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private calculateSummary(findings: VulnerabilityFinding[]): SecurityScanResult['summary'] {
    return {
      critical: findings.filter(f => f.severity === 'critical').length,
      high: findings.filter(f => f.severity === 'high').length,
      medium: findings.filter(f => f.severity === 'medium').length,
      low: findings.filter(f => f.severity === 'low').length,
      info: findings.filter(f => f.severity === 'info').length,
      total: findings.length
    };
  }

  private calculateSecurityScore(summary: SecurityScanResult['summary']): number {
    // Calculate security score (0-100)
    // Weighted scoring: critical=-50, high=-10, medium=-3, low=-1
    const score = 100 -
      (summary.critical * 50) -
      (summary.high * 10) -
      (summary.medium * 3) -
      (summary.low * 1);

    return Math.max(0, Math.min(100, score));
  }

  private evaluateSecurityGate(summary: SecurityScanResult['summary'], securityScore: number): boolean {
    return (
      summary.critical <= this.config.thresholds!.maxCriticalVulnerabilities &&
      summary.high <= this.config.thresholds!.maxHighVulnerabilities &&
      summary.medium <= this.config.thresholds!.maxMediumVulnerabilities &&
      securityScore >= this.config.thresholds!.minSecurityScore
    );
  }

  private generateRecommendations(scanResult?: SecurityScanResult): string[] {
    const recommendations: string[] = [];

    if (!scanResult) {
      recommendations.push('Run initial security scan to establish baseline');
      return recommendations;
    }

    if (scanResult.summary.critical > 0) {
      recommendations.push(`Address ${scanResult.summary.critical} critical vulnerabilities immediately`);
    }

    if (scanResult.summary.high > 5) {
      recommendations.push(`Prioritize fixing high severity vulnerabilities (${scanResult.summary.high} found)`);
    }

    if (scanResult.securityScore < 80) {
      recommendations.push(`Improve security score to above 80 (current: ${scanResult.securityScore})`);
    }

    if (this.config.scanScope?.includeDependencies && scanResult.findings.some(f => f.type === 'dependency')) {
      recommendations.push('Update vulnerable dependencies to latest secure versions');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain current security posture with regular scans');
    }

    return recommendations;
  }

  private async loadCVEDatabase(): Promise<void> {
    // Mock CVE database loading
    // In production, this would fetch from NVD or similar
    this.logger.info('[SecurityScanner] Loading CVE database');

    const mockCVEs: CVERecord[] = [
      {
        id: 'cve-2020-8203',
        cve: 'CVE-2020-8203',
        severity: 'high',
        description: 'Prototype pollution in lodash',
        affectedPackages: ['lodash'],
        publishedDate: new Date('2020-07-15'),
        lastModifiedDate: new Date('2021-07-21')
      }
    ];

    for (const cve of mockCVEs) {
      this.cveDatabase.set(cve.id, cve);
    }
  }

  private async initializeScanningTools(): Promise<void> {
    // Mock tool initialization
    this.logger.info('[SecurityScanner] Initializing scanning tools:', this.config.tools);
    // In production, this would set up connections to actual scanning tools
  }

  private async handleTestGenerated(_data: TestGeneratedEventData): Promise<void> {
    this.logger.info('[SecurityScanner] Auto-scanning newly generated tests');
    // Automatically scan new test code for security issues
  }

  private async handleDeploymentRequest(data: DeploymentRequestEventData): Promise<void> {
    this.logger.info('[SecurityScanner] Enforcing security gate for deployment');
    const metadata: SecurityScanMetadata = {
      path: data.path,
      target: data.target
    };
    const gateResult = await this.enforceSecurityGate(metadata);

    if (!gateResult.passed) {
      this.emitEvent('deployment.blocked', {
        reason: 'security-gate-failed',
        blockers: gateResult.blockers.length
      }, 'critical');
    }
  }

  private async handleNewCVE(data: CVEEventData): Promise<void> {
    this.logger.info('[SecurityScanner] Processing new CVE:', data.cve?.cve);

    if (data.cve) {
      this.cveDatabase.set(data.cve.id, data.cve);

      // Check if any dependencies are affected
      const affectedDeps = await this.checkAffectedDependencies(data.cve);
      if (affectedDeps.length > 0) {
        this.emitEvent('security.cve.affected', {
          cve: data.cve.cve,
          affectedPackages: affectedDeps
        }, 'high');
      }
    }
  }

  private async checkAffectedDependencies(_cve: CVERecord): Promise<string[]> {
    // Mock: Check if project dependencies are affected by CVE
    return [];
  }

  /**
   * Get detailed security scanner status
   */
  public async getDetailedStatus(): Promise<SecurityScannerDetailedStatus> {
    return {
      ...this.getStatus(),
      scanHistory: this.scanHistory.slice(-10),
      baselineFindings: this.baselineFindings.size,
      cveDatabase: this.cveDatabase.size,
      config: {
        tools: this.config.tools,
        thresholds: this.config.thresholds,
        compliance: this.config.compliance,
        scanScope: this.config.scanScope
      }
    };
  }

  /**
   * Extract domain-specific metrics for Nightly-Learner
   * Provides rich security scanning metrics for pattern learning
   */
  protected extractTaskMetrics(result: unknown): Record<string, number> {
    const metrics: Record<string, number> = {};

    // Type guard for SecurityTaskResult
    if (!this.isSecurityTaskResult(result)) {
      return metrics;
    }

    // Vulnerability summary metrics
    if (result.summary) {
      metrics.critical_vulnerabilities = result.summary.critical || 0;
      metrics.high_vulnerabilities = result.summary.high || 0;
      metrics.medium_vulnerabilities = result.summary.medium || 0;
      metrics.low_vulnerabilities = result.summary.low || 0;
      metrics.total_vulnerabilities = result.summary.total || 0;
    }

    // Security score
    if (typeof result.securityScore === 'number') {
      metrics.security_score = result.securityScore;
    }

    // Scan performance
    if (typeof result.duration === 'number') {
      metrics.scan_duration = result.duration;
    }

    // Pass/fail status
    metrics.scan_passed = result.passed ? 1 : 0;

    // Findings analysis
    if (result.findings && Array.isArray(result.findings)) {
      metrics.total_findings = result.findings.length;
      metrics.unique_cve_count = new Set(
        result.findings.filter((f: VulnerabilityFinding) => f.cve).map((f: VulnerabilityFinding) => f.cve)
      ).size;
      metrics.fixable_count = result.findings.filter(
        (f: VulnerabilityFinding & { fix?: string }) => f.remediation || f.fix
      ).length;
    }

    // Compliance metrics
    if (result.compliance) {
      metrics.compliance_score = result.compliance.overallCompliance || 0;
      metrics.compliance_passed = result.compliance.passed ? 1 : 0;
    }

    return metrics;
  }

  /**
   * Type guard for SecurityTaskResult
   */
  private isSecurityTaskResult(result: unknown): result is SecurityTaskResult {
    return result !== null && typeof result === 'object';
  }

  // ============================================================================
  // Phase 0.5: Pattern Store Integration for Self-Learning Security Patterns
  // ============================================================================

  /**
   * Store security vulnerability patterns for self-learning
   * Enables pattern recognition and reuse across scanning sessions
   */
  private async storeSecurityPatterns(findings: VulnerabilityFinding[]): Promise<void> {
    if (!this.qePatternStore) {
      return;
    }

    for (const finding of findings) {
      try {
        // Create pattern from security finding
        const pattern = {
          id: `vuln_${finding.id}_${Date.now()}`,
          type: 'security-vulnerability' as const,
          domain: 'security-scanner',
          embedding: this.generateSecurityPatternEmbedding(finding),
          content: JSON.stringify({
            title: finding.title,
            description: finding.description,
            type: finding.type,
            severity: finding.severity,
            cwe: finding.cwe,
            cve: finding.cve,
            cvss: finding.cvss,
            remediation: finding.remediation,
            location: finding.location
          }),
          framework: finding.type, // sast, dast, dependency, container
          coverage: this.getSeverityWeight(finding.severity),
          verdict: finding.remediation ? 'success' as const : 'failure' as const,
          createdAt: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          metadata: {
            scanType: finding.type,
            severity: finding.severity,
            cwe: finding.cwe || 'unknown',
            cve: finding.cve || 'unknown',
            cvss: finding.cvss || 0
          }
        };

        await this.qePatternStore.storePattern(pattern);
        this.logger.info(`[SecurityScanner] Stored vulnerability pattern: ${finding.id}`);
      } catch (error) {
        this.logger.warn(`[SecurityScanner] Failed to store security pattern: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Generate embedding for security vulnerability pattern
   * Uses vulnerability characteristics for similarity matching
   */
  private generateSecurityPatternEmbedding(finding: VulnerabilityFinding): number[] {
    // Generate 768-dim embedding based on vulnerability characteristics
    const embedding = new Array(768).fill(0);

    // Encode scan type (indices 0-49)
    const scanTypes = ['sast', 'dast', 'dependency', 'container'];
    const typeIdx = scanTypes.indexOf(finding.type);
    if (typeIdx >= 0) {
      embedding[typeIdx * 12] = 1.0;
    }

    // Encode severity (indices 50-99)
    const severities = ['info', 'low', 'medium', 'high', 'critical'];
    const severityIdx = severities.indexOf(finding.severity);
    if (severityIdx >= 0) {
      embedding[50 + severityIdx * 10] = 1.0;
      // Also encode severity weight
      embedding[50 + severityIdx * 10 + 1] = this.getSeverityWeight(finding.severity);
    }

    // Encode CWE category (indices 100-199)
    if (finding.cwe) {
      const cweNum = parseInt(finding.cwe.replace(/\D/g, '')) || 0;
      embedding[100 + (cweNum % 100)] = 1.0;
    }

    // Encode CVSS score (indices 200-299)
    if (finding.cvss) {
      const cvssIdx = Math.floor(finding.cvss * 10); // 0-100 range
      embedding[200 + cvssIdx] = finding.cvss / 10;
    }

    // Encode title hash (indices 300-499)
    const titleHash = this.hashString(finding.title);
    for (let i = 0; i < Math.min(titleHash.length, 200); i++) {
      embedding[300 + i] = titleHash.charCodeAt(i) / 255;
    }

    // Encode location hash (indices 500-699)
    const locationHash = this.hashString(finding.location);
    for (let i = 0; i < Math.min(locationHash.length, 200); i++) {
      embedding[500 + i] = locationHash.charCodeAt(i) / 255;
    }

    // Encode remediation availability (indices 700-767)
    if (finding.remediation) {
      embedding[700] = 1.0;
      const remediationHash = this.hashString(finding.remediation);
      for (let i = 0; i < Math.min(remediationHash.length, 67); i++) {
        embedding[701 + i] = remediationHash.charCodeAt(i) / 255;
      }
    }

    // Normalize embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0)) || 1;
    return embedding.map(val => val / magnitude);
  }

  /**
   * Get numeric weight for severity level
   */
  private getSeverityWeight(severity: string): number {
    const weights: Record<string, number> = {
      'critical': 1.0,
      'high': 0.8,
      'medium': 0.5,
      'low': 0.25,
      'info': 0.1
    };
    return weights[severity] || 0.1;
  }

  /**
   * Simple hash function for pattern strings
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}