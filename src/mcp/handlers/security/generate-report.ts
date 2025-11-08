/**
 * Security Report Generation Tool
 *
 * Generates comprehensive security reports in multiple formats (HTML, SARIF, JSON)
 * with remediation steps, risk scoring, and compliance mapping.
 *
 * @module security/generate-report
 * @version 1.0.0
 * @author Agentic QE Team
 *
 * @example
 * ```typescript
 * import { generateSecurityReport } from './generate-report';
 *
 * const result = await generateSecurityReport({
 *   scanResults: [sarifData, dependencyData, authData],
 *   format: 'html',
 *   includeFixes: true
 * });
 * ```
 */

import { BaseHandler, HandlerResponse } from '../base-handler.js';
import { SecureRandom } from '../../../utils/SecureRandom.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SecurityScanData {
  /** Scan type */
  scanType: 'sast' | 'dast' | 'dependencies' | 'authentication' | 'authorization' | 'comprehensive';

  /** Scan timestamp */
  timestamp: string;

  /** Vulnerabilities found */
  vulnerabilities: Array<{
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    cwe?: string;
    cve?: string;
    cvssScore?: number;
    location?: {
      file?: string;
      line?: number;
    };
    recommendation: string;
    fixSuggestion?: string;
  }>;

  /** Scan summary */
  summary: {
    totalVulnerabilities: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface GenerateSecurityReportParams {
  /** Security scan results to include in report */
  scanResults: SecurityScanData[];

  /** Output format */
  format: 'html' | 'sarif' | 'json' | 'pdf' | 'markdown';

  /** Include fix suggestions */
  includeFixes?: boolean;

  /** Include compliance mapping */
  includeCompliance?: boolean;

  /** Compliance standards to map */
  complianceStandards?: Array<'OWASP' | 'CWE' | 'NIST' | 'PCI-DSS' | 'HIPAA' | 'SOC2'>;

  /** Include risk scoring */
  includeRiskScoring?: boolean;

  /** Include executive summary */
  includeExecutiveSummary?: boolean;

  /** Output file path */
  outputPath?: string;

  /** Report title */
  title?: string;

  /** Project name */
  projectName?: string;
}

export interface SecurityReport {
  /** Report metadata */
  metadata: {
    title: string;
    projectName: string;
    generatedAt: string;
    reportVersion: string;
    format: string;
  };

  /** Executive summary */
  executiveSummary?: {
    overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
    totalVulnerabilities: number;
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    recommendations: string[];
    complianceStatus?: Record<string, 'compliant' | 'non-compliant' | 'partial'>;
  };

  /** Detailed findings */
  findings: {
    bySeverity: Record<'critical' | 'high' | 'medium' | 'low', SecurityScanData['vulnerabilities']>;
    byScanType: Record<string, SecurityScanData['vulnerabilities']>;
    byCompliance?: Record<string, SecurityScanData['vulnerabilities']>;
  };

  /** Risk scoring */
  riskScoring?: {
    overallScore: number;
    categoryScores: Record<string, number>;
    trendAnalysis?: {
      previousScore?: number;
      trend: 'improving' | 'declining' | 'stable';
      change: number;
    };
  };

  /** Remediation plan */
  remediationPlan: {
    immediate: Array<{
      vulnerability: string;
      action: string;
      priority: number;
      estimatedEffort: string;
    }>;
    shortTerm: Array<{
      vulnerability: string;
      action: string;
      priority: number;
      estimatedEffort: string;
    }>;
    longTerm: Array<{
      vulnerability: string;
      action: string;
      priority: number;
      estimatedEffort: string;
    }>;
  };

  /** Compliance mapping */
  complianceMapping?: Record<string, {
    standard: string;
    requirements: Array<{
      requirement: string;
      status: 'met' | 'not-met' | 'partial';
      relatedVulnerabilities: string[];
    }>;
  }>;

  /** Report content */
  content: string;

  /** Output file path */
  outputPath?: string;
}

export class GenerateSecurityReportHandler extends BaseHandler {
  async handle(args: GenerateSecurityReportParams): Promise<HandlerResponse> {
    return this.safeHandle(async () => {
      const requestId = this.generateRequestId();
      this.log('info', 'Generating security report', { requestId, format: args.format });

      // Validate required parameters
      this.validateRequired(args, ['scanResults', 'format']);

      const { result, executionTime } = await this.measureExecutionTime(async () => {
        return await generateSecurityReport(args);
      });

      this.log('info', `Security report generated in ${executionTime.toFixed(2)}ms`, {
        format: result.metadata.format,
        totalVulnerabilities: result.executiveSummary?.totalVulnerabilities || 0
      });

      return this.createSuccessResponse(result, requestId);
    });
  }
}

/**
 * Generate comprehensive security report
 *
 * @param params - Report generation parameters
 * @returns Generated security report with remediation plan
 */
export async function generateSecurityReport(
  params: GenerateSecurityReportParams
): Promise<SecurityReport> {
  const {
    scanResults,
    format,
    includeFixes = true,
    includeCompliance = true,
    complianceStandards = ['OWASP', 'CWE', 'NIST'],
    includeRiskScoring = true,
    includeExecutiveSummary = true,
    outputPath,
    title = 'Security Assessment Report',
    projectName = 'Project Security Scan'
  } = params;

  // Aggregate all vulnerabilities
  const allVulnerabilities = scanResults.flatMap(scan => scan.vulnerabilities);

  // Build findings
  const findings = buildFindings(scanResults, allVulnerabilities, includeCompliance, complianceStandards);

  // Generate executive summary if enabled
  let executiveSummary;
  if (includeExecutiveSummary) {
    executiveSummary = generateExecutiveSummary(allVulnerabilities, includeCompliance, complianceStandards);
  }

  // Generate risk scoring if enabled
  let riskScoring;
  if (includeRiskScoring) {
    riskScoring = calculateRiskScoring(scanResults);
  }

  // Generate remediation plan
  const remediationPlan = generateRemediationPlan(allVulnerabilities, includeFixes);

  // Generate compliance mapping if enabled
  let complianceMapping;
  if (includeCompliance) {
    complianceMapping = generateComplianceMapping(allVulnerabilities, complianceStandards);
  }

  // Generate report content based on format
  const content = await generateReportContent(
    format,
    {
      title,
      projectName,
      executiveSummary,
      findings,
      riskScoring,
      remediationPlan,
      complianceMapping
    }
  );

  // Save report if output path provided
  let savedPath;
  if (outputPath) {
    savedPath = await saveReport(content, outputPath, format);
  }

  return {
    metadata: {
      title,
      projectName,
      generatedAt: new Date().toISOString(),
      reportVersion: '1.0.0',
      format
    },
    executiveSummary,
    findings,
    riskScoring,
    remediationPlan,
    complianceMapping,
    content,
    outputPath: savedPath
  };
}

function buildFindings(
  scanResults: SecurityScanData[],
  allVulnerabilities: SecurityScanData['vulnerabilities'],
  includeCompliance: boolean,
  complianceStandards: string[]
): SecurityReport['findings'] {
  const bySeverity: SecurityReport['findings']['bySeverity'] = {
    critical: allVulnerabilities.filter(v => v.severity === 'critical'),
    high: allVulnerabilities.filter(v => v.severity === 'high'),
    medium: allVulnerabilities.filter(v => v.severity === 'medium'),
    low: allVulnerabilities.filter(v => v.severity === 'low')
  };

  const byScanType: Record<string, SecurityScanData['vulnerabilities']> = {};
  for (const scan of scanResults) {
    byScanType[scan.scanType] = scan.vulnerabilities;
  }

  let byCompliance: Record<string, SecurityScanData['vulnerabilities']> | undefined;
  if (includeCompliance) {
    byCompliance = {};
    for (const standard of complianceStandards) {
      byCompliance[standard] = allVulnerabilities.filter(v =>
        (standard === 'OWASP' && v.cwe) ||
        (standard === 'CWE' && v.cwe) ||
        (standard === 'NIST' && v.cvssScore && v.cvssScore >= 7.0)
      );
    }
  }

  return {
    bySeverity,
    byScanType,
    byCompliance
  };
}

function generateExecutiveSummary(
  vulnerabilities: SecurityScanData['vulnerabilities'],
  includeCompliance: boolean,
  complianceStandards: string[]
): SecurityReport['executiveSummary'] {
  const critical = vulnerabilities.filter(v => v.severity === 'critical').length;
  const high = vulnerabilities.filter(v => v.severity === 'high').length;
  const medium = vulnerabilities.filter(v => v.severity === 'medium').length;

  const overallRiskLevel = critical > 0 ? 'critical' :
                          high > 0 ? 'high' :
                          medium > 0 ? 'medium' : 'low';

  const recommendations = generateTopRecommendations(vulnerabilities);

  let complianceStatus: Record<string, 'compliant' | 'partial' | 'non-compliant'> | undefined;
  if (includeCompliance) {
    complianceStatus = {};
    for (const standard of complianceStandards) {
      const violations = vulnerabilities.filter(v =>
        (standard === 'OWASP' && v.cwe) ||
        (standard === 'CWE' && v.cwe)
      ).length;

      complianceStatus[standard] = violations === 0 ? 'compliant' :
                                   violations <= 3 ? 'partial' : 'non-compliant';
    }
  }

  return {
    overallRiskLevel,
    totalVulnerabilities: vulnerabilities.length,
    criticalVulnerabilities: critical,
    highVulnerabilities: high,
    recommendations,
    complianceStatus
  };
}

function generateTopRecommendations(vulnerabilities: SecurityScanData['vulnerabilities']): string[] {
  const recommendations: string[] = [];

  const critical = vulnerabilities.filter(v => v.severity === 'critical');
  if (critical.length > 0) {
    recommendations.push(`Address ${critical.length} critical vulnerabilities immediately to prevent security incidents`);
  }

  const sqlInjection = vulnerabilities.filter(v => v.cwe === 'CWE-89');
  if (sqlInjection.length > 0) {
    recommendations.push('Implement parameterized queries to prevent SQL injection attacks');
  }

  const xss = vulnerabilities.filter(v => v.cwe === 'CWE-79');
  if (xss.length > 0) {
    recommendations.push('Sanitize all user inputs to prevent Cross-Site Scripting (XSS) attacks');
  }

  const auth = vulnerabilities.filter(v => v.cwe === 'CWE-287' || v.cwe === 'CWE-307');
  if (auth.length > 0) {
    recommendations.push('Strengthen authentication mechanisms and implement rate limiting');
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue regular security scanning and maintain security best practices');
  }

  return recommendations.slice(0, 5); // Top 5 recommendations
}

function calculateRiskScoring(scanResults: SecurityScanData[]): SecurityReport['riskScoring'] {
  const weights = {
    critical: 10,
    high: 7,
    medium: 4,
    low: 1
  };

  let totalScore = 0;
  const categoryScores: Record<string, number> = {};

  for (const scan of scanResults) {
    let scanScore = 0;
    scan.vulnerabilities.forEach(vuln => {
      scanScore += weights[vuln.severity];
    });

    categoryScores[scan.scanType] = scanScore;
    totalScore += scanScore;
  }

  // Normalize to 0-100 scale
  const overallScore = Math.min(totalScore, 100);

  return {
    overallScore,
    categoryScores,
    trendAnalysis: {
      trend: 'stable',
      change: 0
    }
  };
}

function generateRemediationPlan(
  vulnerabilities: SecurityScanData['vulnerabilities'],
  includeFixes: boolean
): SecurityReport['remediationPlan'] {
  const immediate: SecurityReport['remediationPlan']['immediate'] = [];
  const shortTerm: SecurityReport['remediationPlan']['shortTerm'] = [];
  const longTerm: SecurityReport['remediationPlan']['longTerm'] = [];

  vulnerabilities.forEach((vuln, index) => {
    const action = includeFixes && vuln.fixSuggestion
      ? vuln.fixSuggestion
      : vuln.recommendation;

    const item = {
      vulnerability: vuln.title,
      action,
      priority: index + 1,
      estimatedEffort: vuln.severity === 'critical' ? '1-2 days' :
                       vuln.severity === 'high' ? '3-5 days' :
                       vuln.severity === 'medium' ? '1-2 weeks' : '2-4 weeks'
    };

    if (vuln.severity === 'critical') {
      immediate.push(item);
    } else if (vuln.severity === 'high') {
      shortTerm.push(item);
    } else {
      longTerm.push(item);
    }
  });

  return {
    immediate: immediate.slice(0, 10),
    shortTerm: shortTerm.slice(0, 10),
    longTerm: longTerm.slice(0, 10)
  };
}

function generateComplianceMapping(
  vulnerabilities: SecurityScanData['vulnerabilities'],
  complianceStandards: string[]
): SecurityReport['complianceMapping'] {
  const mapping: SecurityReport['complianceMapping'] = {};

  for (const standard of complianceStandards) {
    if (standard === 'OWASP') {
      mapping['OWASP'] = {
        standard: 'OWASP Top 10 2021',
        requirements: [
          {
            requirement: 'A03:2021 – Injection',
            status: vulnerabilities.some(v => v.cwe === 'CWE-89') ? 'not-met' : 'met',
            relatedVulnerabilities: vulnerabilities.filter(v => v.cwe === 'CWE-89').map(v => v.id)
          },
          {
            requirement: 'A07:2021 – Identification and Authentication Failures',
            status: vulnerabilities.some(v => v.cwe === 'CWE-287') ? 'not-met' : 'met',
            relatedVulnerabilities: vulnerabilities.filter(v => v.cwe === 'CWE-287').map(v => v.id)
          }
        ]
      };
    }
  }

  return mapping;
}

async function generateReportContent(
  format: string,
  data: {
    title: string;
    projectName: string;
    executiveSummary?: SecurityReport['executiveSummary'];
    findings: SecurityReport['findings'];
    riskScoring?: SecurityReport['riskScoring'];
    remediationPlan: SecurityReport['remediationPlan'];
    complianceMapping?: SecurityReport['complianceMapping'];
  }
): Promise<string> {
  switch (format) {
    case 'html':
      return generateHTMLReport(data);
    case 'sarif':
      return generateSARIFReport(data);
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'markdown':
      return generateMarkdownReport(data);
    default:
      return JSON.stringify(data, null, 2);
  }
}

function generateHTMLReport(data: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; border-bottom: 2px solid #ccc; padding-bottom: 8px; }
        .critical { color: #dc3545; font-weight: bold; }
        .high { color: #fd7e14; font-weight: bold; }
        .medium { color: #ffc107; font-weight: bold; }
        .low { color: #28a745; }
        .summary-box { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff; }
        .vulnerability { background: #fff; border: 1px solid #dee2e6; border-radius: 5px; padding: 15px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        th { background: #007bff; color: white; }
        .recommendation { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${data.title}</h1>
        <p><strong>Project:</strong> ${data.projectName}</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>

        ${data.executiveSummary ? `
        <div class="summary-box">
            <h2>Executive Summary</h2>
            <p><strong>Overall Risk Level:</strong> <span class="${data.executiveSummary.overallRiskLevel}">${data.executiveSummary.overallRiskLevel.toUpperCase()}</span></p>
            <p><strong>Total Vulnerabilities:</strong> ${data.executiveSummary.totalVulnerabilities}</p>
            <p><strong>Critical:</strong> <span class="critical">${data.executiveSummary.criticalVulnerabilities}</span></p>
            <p><strong>High:</strong> <span class="high">${data.executiveSummary.highVulnerabilities}</span></p>
        </div>
        ` : ''}

        <h2>Vulnerability Summary</h2>
        <table>
            <tr>
                <th>Severity</th>
                <th>Count</th>
            </tr>
            <tr>
                <td class="critical">Critical</td>
                <td>${data.findings.bySeverity.critical.length}</td>
            </tr>
            <tr>
                <td class="high">High</td>
                <td>${data.findings.bySeverity.high.length}</td>
            </tr>
            <tr>
                <td class="medium">Medium</td>
                <td>${data.findings.bySeverity.medium.length}</td>
            </tr>
            <tr>
                <td class="low">Low</td>
                <td>${data.findings.bySeverity.low.length}</td>
            </tr>
        </table>

        <h2>Recommendations</h2>
        ${data.executiveSummary?.recommendations.map((rec: string) =>
          `<div class="recommendation">${rec}</div>`
        ).join('')}
    </div>
</body>
</html>`;
}

function generateSARIFReport(data: any): string {
  const results = [];

  for (const [severity, vulns] of Object.entries(data.findings.bySeverity)) {
    for (const vuln of vulns as any[]) {
      results.push({
        ruleId: vuln.cwe || vuln.id,
        level: severity === 'critical' || severity === 'high' ? 'error' : 'warning',
        message: {
          text: vuln.description
        },
        locations: vuln.location ? [{
          physicalLocation: {
            artifactLocation: {
              uri: vuln.location.file
            },
            region: {
              startLine: vuln.location.line || 1
            }
          }
        }] : []
      });
    }
  }

  return JSON.stringify({
    version: '2.1.0',
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    runs: [{
      tool: {
        driver: {
          name: 'Agentic QE Security Scanner',
          version: '1.0.0'
        }
      },
      results
    }]
  }, null, 2);
}

function generateMarkdownReport(data: any): string {
  return `# ${data.title}

**Project:** ${data.projectName}
**Generated:** ${new Date().toISOString()}

## Executive Summary

${data.executiveSummary ? `
- **Overall Risk Level:** ${data.executiveSummary.overallRiskLevel.toUpperCase()}
- **Total Vulnerabilities:** ${data.executiveSummary.totalVulnerabilities}
- **Critical:** ${data.executiveSummary.criticalVulnerabilities}
- **High:** ${data.executiveSummary.highVulnerabilities}
` : ''}

## Vulnerability Summary

| Severity | Count |
|----------|-------|
| Critical | ${data.findings.bySeverity.critical.length} |
| High | ${data.findings.bySeverity.high.length} |
| Medium | ${data.findings.bySeverity.medium.length} |
| Low | ${data.findings.bySeverity.low.length} |

## Recommendations

${data.executiveSummary?.recommendations.map((rec: string) => `- ${rec}`).join('\n')}

## Remediation Plan

### Immediate Actions (Critical)
${data.remediationPlan.immediate.map((item: any) => `
- **${item.vulnerability}**
  - Action: ${item.action}
  - Effort: ${item.estimatedEffort}
`).join('\n')}
`;
}

async function saveReport(content: string, outputPath: string, format: string): Promise<string> {
  try {
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  } catch (error) {
    // Return content if file can't be saved
    return 'report-not-saved';
  }
}
