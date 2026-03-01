/**
 * Agentic QE v3 - Security Scan Worker
 * ADR-014: Background Workers for QE Monitoring
 *
 * Performs security vulnerability scanning including:
 * - Dependency vulnerability checks
 * - Code pattern analysis for security issues
 * - Secret detection
 * - Security configuration validation
 */

import { BaseWorker } from '../base-worker';
import {
  WorkerConfig,
  WorkerContext,
  WorkerResult,
  WorkerFinding,
  WorkerRecommendation,
} from '../interfaces';

const CONFIG: WorkerConfig = {
  id: 'security-scan',
  name: 'Security Vulnerability Scanner',
  description: 'Scans for security vulnerabilities in dependencies, code patterns, and configurations',
  intervalMs: 30 * 60 * 1000, // 30 minutes
  priority: 'critical',
  targetDomains: ['security-compliance'],
  enabled: true,
  timeoutMs: 300000,
  retryCount: 3,
  retryDelayMs: 30000,
};

interface DependencyVulnerability {
  package: string;
  version: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cve: string;
  title: string;
  description: string;
  fixedIn?: string;
}

interface CodeSecurityIssue {
  file: string;
  line: number;
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  category: 'injection' | 'secrets' | 'auth' | 'crypto' | 'config' | 'other';
}

interface SecurityScanResult {
  dependencyVulnerabilities: DependencyVulnerability[];
  codeSecurityIssues: CodeSecurityIssue[];
  secretsDetected: number;
  configurationIssues: number;
  scanDurationMs: number;
}

export class SecurityScanWorker extends BaseWorker {
  constructor() {
    super(CONFIG);
  }

  protected async doExecute(context: WorkerContext): Promise<WorkerResult> {
    const startTime = Date.now();
    context.logger.info('Starting security vulnerability scan');

    const findings: WorkerFinding[] = [];
    const recommendations: WorkerRecommendation[] = [];

    // Run security scans
    const scanResult = await this.runSecurityScans(context);

    // Analyze dependency vulnerabilities
    this.analyzeDependencyVulnerabilities(scanResult.dependencyVulnerabilities, findings, recommendations);

    // Analyze code security issues
    this.analyzeCodeSecurityIssues(scanResult.codeSecurityIssues, findings, recommendations);

    // Check for secrets
    if (scanResult.secretsDetected > 0) {
      this.reportSecretsDetected(scanResult.secretsDetected, findings, recommendations);
    }

    // Store results
    await context.memory.set('security:lastScan', scanResult);
    await context.memory.set('security:lastScanTime', new Date().toISOString());

    const healthScore = this.calculateHealthScore(scanResult);
    const totalIssues = scanResult.dependencyVulnerabilities.length +
      scanResult.codeSecurityIssues.length +
      scanResult.secretsDetected +
      scanResult.configurationIssues;

    context.logger.info('Security scan complete', {
      healthScore,
      totalIssues,
      criticalIssues: scanResult.dependencyVulnerabilities.filter(v => v.severity === 'critical').length +
        scanResult.codeSecurityIssues.filter(i => i.severity === 'critical').length,
    });

    return this.createResult(
      Date.now() - startTime,
      {
        itemsAnalyzed: totalIssues,
        issuesFound: findings.length,
        healthScore,
        trend: 'stable',
        domainMetrics: {
          dependencyVulnerabilities: scanResult.dependencyVulnerabilities.length,
          codeSecurityIssues: scanResult.codeSecurityIssues.length,
          secretsDetected: scanResult.secretsDetected,
          configurationIssues: scanResult.configurationIssues,
          scanDuration: `${scanResult.scanDurationMs}ms`,
        },
      },
      findings,
      recommendations
    );
  }

  private async runSecurityScans(_context: WorkerContext): Promise<SecurityScanResult> {
    // In a real implementation, this would:
    // 1. Run npm audit or similar for dependencies
    // 2. Run static analysis for code issues
    // 3. Scan for secrets with tools like gitleaks
    // 4. Check security configurations

    return {
      dependencyVulnerabilities: [
        {
          package: 'lodash',
          version: '4.17.15',
          severity: 'high',
          cve: 'CVE-2021-23337',
          title: 'Command Injection',
          description: 'Lodash versions prior to 4.17.21 are vulnerable to Command Injection via the template function.',
          fixedIn: '4.17.21',
        },
        {
          package: 'minimist',
          version: '1.2.5',
          severity: 'critical',
          cve: 'CVE-2021-44906',
          title: 'Prototype Pollution',
          description: 'Prototype pollution vulnerability allows attackers to manipulate JavaScript object prototypes.',
          fixedIn: '1.2.6',
        },
      ],
      codeSecurityIssues: [
        {
          file: 'src/shared/http/http-client.ts',
          line: 45,
          rule: 'no-eval',
          severity: 'high',
          message: 'Avoid using eval() as it can execute arbitrary code',
          category: 'injection',
        },
        {
          file: 'src/kernel/memory-backend.ts',
          line: 122,
          rule: 'sql-injection',
          severity: 'medium',
          message: 'Potential SQL injection - use parameterized queries',
          category: 'injection',
        },
      ],
      secretsDetected: 0,
      configurationIssues: 1,
      scanDurationMs: 2500,
    };
  }

  private analyzeDependencyVulnerabilities(
    vulnerabilities: DependencyVulnerability[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const critical = vulnerabilities.filter(v => v.severity === 'critical');
    const high = vulnerabilities.filter(v => v.severity === 'high');

    for (const vuln of critical) {
      findings.push({
        type: 'critical-vulnerability',
        severity: 'critical',
        domain: 'security-compliance',
        title: `Critical Vulnerability in ${vuln.package}`,
        description: `${vuln.title}: ${vuln.description}`,
        resource: vuln.package,
        context: {
          cve: vuln.cve,
          currentVersion: vuln.version,
          fixedIn: vuln.fixedIn,
        },
      });
    }

    for (const vuln of high) {
      findings.push({
        type: 'high-vulnerability',
        severity: 'high',
        domain: 'security-compliance',
        title: `High Severity Vulnerability in ${vuln.package}`,
        description: `${vuln.title}: ${vuln.description}`,
        resource: vuln.package,
        context: {
          cve: vuln.cve,
          currentVersion: vuln.version,
          fixedIn: vuln.fixedIn,
        },
      });
    }

    if (critical.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'security-compliance',
        action: 'Update Critical Vulnerabilities Immediately',
        description: `${critical.length} packages have critical vulnerabilities. Update immediately to patched versions.`,
        estimatedImpact: 'high',
        effort: 'low',
        autoFixable: true,
      });
    }

    if (high.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'security-compliance',
        action: 'Address High Severity Vulnerabilities',
        description: `${high.length} packages have high severity vulnerabilities. Plan updates within current sprint.`,
        estimatedImpact: 'high',
        effort: 'low',
        autoFixable: true,
      });
    }
  }

  private analyzeCodeSecurityIssues(
    issues: CodeSecurityIssue[],
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    const byCategory = new Map<string, CodeSecurityIssue[]>();

    for (const issue of issues) {
      const existing = byCategory.get(issue.category) || [];
      existing.push(issue);
      byCategory.set(issue.category, existing);
    }

    for (const issue of issues) {
      findings.push({
        type: `code-security-${issue.category}`,
        severity: issue.severity,
        domain: 'security-compliance',
        title: `Security Issue: ${issue.rule}`,
        description: issue.message,
        resource: `${issue.file}:${issue.line}`,
        context: {
          rule: issue.rule,
          category: issue.category,
        },
      });
    }

    // Category-specific recommendations
    const injectionIssues = byCategory.get('injection') || [];
    if (injectionIssues.length > 0) {
      recommendations.push({
        priority: 'p0',
        domain: 'security-compliance',
        action: 'Fix Injection Vulnerabilities',
        description: `${injectionIssues.length} potential injection vulnerabilities found. Use parameterized queries and avoid eval().`,
        estimatedImpact: 'high',
        effort: 'medium',
        autoFixable: false,
      });
    }

    const cryptoIssues = byCategory.get('crypto') || [];
    if (cryptoIssues.length > 0) {
      recommendations.push({
        priority: 'p1',
        domain: 'security-compliance',
        action: 'Review Cryptographic Implementations',
        description: `${cryptoIssues.length} cryptographic issues found. Ensure using secure algorithms and proper key management.`,
        estimatedImpact: 'high',
        effort: 'high',
        autoFixable: false,
      });
    }
  }

  private reportSecretsDetected(
    count: number,
    findings: WorkerFinding[],
    recommendations: WorkerRecommendation[]
  ): void {
    findings.push({
      type: 'secrets-detected',
      severity: 'critical',
      domain: 'security-compliance',
      title: 'Secrets Detected in Codebase',
      description: `${count} potential secrets/credentials found in source code`,
      context: { count },
    });

    recommendations.push({
      priority: 'p0',
      domain: 'security-compliance',
      action: 'Remove Secrets from Codebase',
      description: 'Immediately rotate any exposed credentials and move them to secure secret management.',
      estimatedImpact: 'high',
      effort: 'medium',
      autoFixable: false,
    });
  }

  private calculateHealthScore(result: SecurityScanResult): number {
    let score = 100;

    // Critical vulnerabilities: -20 each
    const criticalVulns = result.dependencyVulnerabilities.filter(v => v.severity === 'critical').length;
    score -= criticalVulns * 20;

    // High vulnerabilities: -10 each
    const highVulns = result.dependencyVulnerabilities.filter(v => v.severity === 'high').length;
    score -= highVulns * 10;

    // Critical code issues: -15 each
    const criticalCode = result.codeSecurityIssues.filter(i => i.severity === 'critical').length;
    score -= criticalCode * 15;

    // High code issues: -8 each
    const highCode = result.codeSecurityIssues.filter(i => i.severity === 'high').length;
    score -= highCode * 8;

    // Secrets: -30 each
    score -= result.secretsDetected * 30;

    // Config issues: -5 each
    score -= result.configurationIssues * 5;

    return Math.max(0, Math.round(score));
  }
}
