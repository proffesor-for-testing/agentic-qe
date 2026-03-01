/**
 * Security Findings Surface Template
 *
 * Generates A2UI surface for displaying security scan results
 * including vulnerability cards, severity breakdown, and remediation guidance.
 *
 * @module adapters/a2ui/renderer/templates/security-surface
 */

import type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
} from '../message-types.js';
import { literal, path, children, templateChildren } from '../message-types.js';
import { createComponentBuilder } from '../component-builder.js';

// ============================================================================
// Security Data Types
// ============================================================================

/**
 * Vulnerability severity level
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * OWASP category
 */
export type OwaspCategory =
  | 'A01:2021-Broken Access Control'
  | 'A02:2021-Cryptographic Failures'
  | 'A03:2021-Injection'
  | 'A04:2021-Insecure Design'
  | 'A05:2021-Security Misconfiguration'
  | 'A06:2021-Vulnerable and Outdated Components'
  | 'A07:2021-Identification and Authentication Failures'
  | 'A08:2021-Software and Data Integrity Failures'
  | 'A09:2021-Security Logging and Monitoring Failures'
  | 'A10:2021-Server-Side Request Forgery';

/**
 * Individual vulnerability finding
 */
export interface SecurityFinding {
  /** Finding identifier */
  id: string;
  /** Vulnerability title */
  title: string;
  /** Severity level */
  severity: Severity;
  /** CVE identifier if applicable */
  cve?: string;
  /** CWE identifier */
  cwe?: string;
  /** OWASP category */
  owasp?: OwaspCategory;
  /** Detailed description */
  description: string;
  /** Affected file */
  file?: string;
  /** Affected line number */
  line?: number;
  /** Code snippet */
  codeSnippet?: string;
  /** Remediation guidance */
  remediation: string;
  /** External reference URLs */
  references?: string[];
  /** CVSS score (0-10) */
  cvssScore?: number;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
  /** Detection timestamp */
  detectedAt: string;
  /** Status */
  status: 'open' | 'in_progress' | 'resolved' | 'false_positive';
}

/**
 * Severity count for breakdown
 */
export interface SeverityCount {
  /** Severity level */
  severity: Severity;
  /** Finding count */
  count: number;
  /** Color for display */
  color: string;
}

/**
 * Dependency vulnerability
 */
export interface DependencyVulnerability {
  /** Package name */
  package: string;
  /** Current version */
  currentVersion: string;
  /** Fixed version */
  fixedVersion?: string;
  /** CVE identifier */
  cve: string;
  /** Severity */
  severity: Severity;
  /** Description */
  description: string;
}

/**
 * Complete security scan results
 */
export interface SecurityFindings {
  /** Total findings count */
  total: number;
  /** Findings by severity */
  bySeverity: SeverityCount[];
  /** Individual findings */
  findings: SecurityFinding[];
  /** Dependency vulnerabilities */
  dependencies: DependencyVulnerability[];
  /** Scan timestamp */
  timestamp: string;
  /** Scan duration in milliseconds */
  duration: number;
  /** Scanner version */
  scannerVersion: string;
  /** Summary text */
  summary: string;
  /** Overall risk score (0-100) */
  riskScore: number;
  /** Risk level */
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================================
// Security Surface Generator
// ============================================================================

/**
 * Generate security findings dashboard surface
 */
export function createSecuritySurface(
  data: SecurityFindings,
  surfaceId: string = 'security-report'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Security Scan Results')
    .setCatalog('qe-v1');

  // Root container
  builder.addComponent('root', {
    type: 'Column',
    spacing: 16,
  });
  builder.setChildren('root', [
    'header',
    'risk-section',
    'severity-section',
    'findings-tabs',
  ]);

  // Header
  builder.addComponent('header', {
    type: 'Row',
    alignment: 'spaceBetween',
  });
  builder.setChildren('header', ['title-section', 'scan-info']);

  builder.addComponent('title-section', {
    type: 'Column',
  });
  builder.setChildren('title-section', ['title', 'subtitle']);

  builder.addComponent('title', {
    type: 'Text',
    text: literal('Security Scan Results'),
    usageHint: 'h1',
  });

  builder.addComponent('subtitle', {
    type: 'Text',
    text: path('/security/summary'),
    style: { color: '#666' },
  });

  builder.addComponent('scan-info', {
    type: 'Column',
    alignment: 'end',
  });
  builder.setChildren('scan-info', ['scan-time', 'scanner-version']);

  builder.addComponent('scan-time', {
    type: 'Text',
    text: path('/security/timestampFormatted'),
    style: { fontSize: 12 },
  });

  builder.addComponent('scanner-version', {
    type: 'Text',
    text: path('/security/scannerVersionText'),
    style: { fontSize: 12, color: '#999' },
  });

  // Risk section
  builder.addComponent('risk-section', {
    type: 'Card',
    title: literal('Overall Risk Assessment'),
  });
  builder.setChildren('risk-section', ['risk-row']);

  builder.addComponent('risk-row', {
    type: 'Row',
    spacing: 24,
    alignment: 'center',
  });
  builder.setChildren('risk-row', ['risk-gauge', 'risk-details']);

  builder.addComponent('risk-gauge', {
    type: 'qe:riskGauge',
    value: path('/security/riskScore'),
    level: path('/security/riskLevel'),
    accessibility: {
      role: 'meter',
      label: 'Security risk score',
      live: 'polite',
    },
  });

  builder.addComponent('risk-details', {
    type: 'Column',
    spacing: 8,
  });
  builder.setChildren('risk-details', ['total-findings', 'critical-alert']);

  builder.addComponent('total-findings', {
    type: 'Text',
    text: path('/security/totalFindingsText'),
    usageHint: 'h3',
  });

  builder.addComponent('critical-alert', {
    type: 'qe:alertBanner',
    variant: path('/security/alertVariant'),
    message: path('/security/alertMessage'),
    visible: path('/security/hasCritical'),
    accessibility: {
      role: 'alert',
      live: 'assertive',
    },
  });

  // Severity breakdown section
  builder.addComponent('severity-section', {
    type: 'Card',
    title: literal('Findings by Severity'),
  });
  builder.setChildren('severity-section', ['severity-row', 'severity-chart']);

  builder.addComponent('severity-row', {
    type: 'Row',
    spacing: 16,
    alignment: 'center',
  });
  builder.setChildren('severity-row', [
    'critical-count',
    'high-count',
    'medium-count',
    'low-count',
    'info-count',
  ]);

  // Severity count badges
  builder.addComponent('critical-count', {
    type: 'qe:severityBadge',
    severity: literal('critical'),
    count: path('/security/counts/critical'),
    label: literal('Critical'),
    color: '#9C27B0',
  });

  builder.addComponent('high-count', {
    type: 'qe:severityBadge',
    severity: literal('high'),
    count: path('/security/counts/high'),
    label: literal('High'),
    color: '#F44336',
  });

  builder.addComponent('medium-count', {
    type: 'qe:severityBadge',
    severity: literal('medium'),
    count: path('/security/counts/medium'),
    label: literal('Medium'),
    color: '#FF9800',
  });

  builder.addComponent('low-count', {
    type: 'qe:severityBadge',
    severity: literal('low'),
    count: path('/security/counts/low'),
    label: literal('Low'),
    color: '#FFC107',
  });

  builder.addComponent('info-count', {
    type: 'qe:severityBadge',
    severity: literal('info'),
    count: path('/security/counts/info'),
    label: literal('Info'),
    color: '#2196F3',
  });

  builder.addComponent('severity-chart', {
    type: 'PieChart',
    title: literal('Distribution'),
    data: path('/security/bySeverity'),
    labelKey: 'severity',
    valueKey: 'count',
    colorKey: 'color',
  });

  // Findings tabs
  builder.addComponent('findings-tabs', {
    type: 'Tabs',
  });
  builder.setChildren('findings-tabs', [
    'all-findings-tab',
    'dependencies-tab',
    'owasp-tab',
  ]);

  // All findings tab
  builder.addComponent('all-findings-tab', {
    type: 'Tab',
    label: literal('All Findings'),
    badge: path('/security/total'),
  });
  builder.setChildren('all-findings-tab', ['findings-list']);

  builder.addComponent('findings-list', {
    type: 'List',
    children: templateChildren('/security/findings', 'vuln-card-template'),
    sortBy: 'severity',
    sortOrder: 'desc',
  });

  // Vulnerability card template
  builder.addComponent('vuln-card-template', {
    type: 'qe:vulnerabilityCard',
    severity: path('/severity'),
    title: path('/title'),
    cve: path('/cve'),
    cwe: path('/cwe'),
    description: path('/description'),
    remediation: path('/remediation'),
    file: path('/file'),
    line: path('/line'),
    cvssScore: path('/cvssScore'),
    confidence: path('/confidence'),
    status: path('/status'),
    actions: [
      { name: 'view_details', label: 'View Details' },
      { name: 'mark_resolved', label: 'Mark Resolved' },
      { name: 'mark_false_positive', label: 'False Positive' },
    ],
  });

  // Dependencies tab
  builder.addComponent('dependencies-tab', {
    type: 'Tab',
    label: literal('Dependencies'),
    badge: path('/security/dependencyCount'),
  });
  builder.setChildren('dependencies-tab', ['deps-table']);

  builder.addComponent('deps-table', {
    type: 'Table',
    columns: [
      { key: 'severity', label: 'Severity', width: '10%' },
      { key: 'package', label: 'Package', width: '25%' },
      { key: 'currentVersion', label: 'Current', width: '15%' },
      { key: 'fixedVersion', label: 'Fixed In', width: '15%' },
      { key: 'cve', label: 'CVE', width: '15%' },
      { key: 'actions', label: 'Actions', width: '20%' },
    ],
    data: path('/security/dependencies'),
    sortable: true,
    rowAction: { name: 'upgrade_dependency' },
  });

  // OWASP tab
  builder.addComponent('owasp-tab', {
    type: 'Tab',
    label: literal('OWASP Top 10'),
  });
  builder.setChildren('owasp-tab', ['owasp-chart', 'owasp-table']);

  builder.addComponent('owasp-chart', {
    type: 'BarChart',
    title: literal('Findings by OWASP Category'),
    data: path('/security/byOwasp'),
    xAxis: 'category',
    yAxis: 'count',
    horizontal: true,
  });

  builder.addComponent('owasp-table', {
    type: 'Table',
    columns: [
      { key: 'category', label: 'OWASP Category', width: '50%' },
      { key: 'count', label: 'Findings', width: '20%' },
      { key: 'maxSeverity', label: 'Max Severity', width: '30%' },
    ],
    data: path('/security/byOwasp'),
  });

  return builder.build();
}

/**
 * Generate security data model update
 */
export function createSecurityDataUpdate(
  data: SecurityFindings,
  surfaceId: string = 'security-report'
): DataModelUpdateMessage {
  // Compute counts by severity
  const counts = {
    critical: data.findings.filter((f) => f.severity === 'critical').length,
    high: data.findings.filter((f) => f.severity === 'high').length,
    medium: data.findings.filter((f) => f.severity === 'medium').length,
    low: data.findings.filter((f) => f.severity === 'low').length,
    info: data.findings.filter((f) => f.severity === 'info').length,
  };

  // Group by OWASP category
  const owaspMap = new Map<string, { count: number; maxSeverity: Severity }>();
  for (const finding of data.findings) {
    if (finding.owasp) {
      const existing = owaspMap.get(finding.owasp);
      if (existing) {
        existing.count++;
        if (getSeverityWeight(finding.severity) > getSeverityWeight(existing.maxSeverity)) {
          existing.maxSeverity = finding.severity;
        }
      } else {
        owaspMap.set(finding.owasp, {
          count: 1,
          maxSeverity: finding.severity,
        });
      }
    }
  }

  const byOwasp = Array.from(owaspMap.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    maxSeverity: data.maxSeverity,
  }));

  return {
    type: 'dataModelUpdate',
    surfaceId,
    data: {
      security: {
        total: data.total,
        findings: data.findings,
        dependencies: data.dependencies,
        dependencyCount: data.dependencies.length,
        bySeverity: data.bySeverity,
        byOwasp,
        counts,
        riskScore: data.riskScore,
        riskLevel: data.riskLevel,
        timestamp: data.timestamp,
        timestampFormatted: new Date(data.timestamp).toLocaleString(),
        scannerVersion: data.scannerVersion,
        scannerVersionText: `Scanner v${data.scannerVersion}`,
        summary: data.summary,
        totalFindingsText: `${data.total} findings detected`,
        hasCritical: counts.critical > 0,
        alertVariant: counts.critical > 0 ? 'error' : counts.high > 0 ? 'warning' : 'info',
        alertMessage:
          counts.critical > 0
            ? `${counts.critical} critical vulnerabilities require immediate attention`
            : counts.high > 0
              ? `${counts.high} high severity findings should be addressed soon`
              : 'No critical or high severity findings',
      },
    },
  };
}

/**
 * Get severity weight for comparison
 */
function getSeverityWeight(severity: Severity): number {
  const weights: Record<Severity, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };
  return weights[severity];
}

/**
 * Create a simple security summary surface
 */
export function createSecuritySummarySurface(
  data: Pick<SecurityFindings, 'total' | 'riskScore' | 'riskLevel' | 'bySeverity'>,
  surfaceId: string = 'security-summary'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Security Summary')
    .setCatalog('qe-v1');

  builder.addComponent('root', {
    type: 'Card',
    title: literal('Security Overview'),
  });
  builder.setChildren('root', ['risk-indicator', 'findings-count']);

  builder.addComponent('risk-indicator', {
    type: 'qe:riskGauge',
    value: path('/security/riskScore'),
    level: path('/security/riskLevel'),
  });

  builder.addComponent('findings-count', {
    type: 'Text',
    text: path('/security/totalText'),
    alignment: 'center',
  });

  return builder.build();
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
};
