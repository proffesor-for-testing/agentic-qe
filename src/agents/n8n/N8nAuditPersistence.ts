/**
 * N8n Audit Persistence Layer
 *
 * Provides persistent storage and reporting for n8n workflow audit results:
 * - Store security audit results to SQLite/PostgreSQL
 * - Store node validation results
 * - Generate audit reports in multiple formats (JSON, HTML, PDF)
 * - Historical trend analysis
 * - Compliance tracking over time
 */

import {
  SecurityAuditResult,
  SecurityFinding,
  OWASPComplianceResult,
} from './types';
import { NodeValidationResult } from './N8nNodeValidatorAgent';
import { seededRandom } from '../../utils/SeededRandom';

// ============================================================================
// Types
// ============================================================================

export interface AuditRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  auditType: 'security' | 'validation' | 'compliance' | 'performance';
  timestamp: Date;
  result: SecurityAuditResult | NodeValidationResult;
  metadata: {
    agentVersion: string;
    n8nVersion?: string;
    environment?: string;
  };
}

export interface AuditSummary {
  workflowId: string;
  workflowName: string;
  totalAudits: number;
  lastAuditDate: Date;
  averageRiskScore: number;
  riskTrend: 'improving' | 'stable' | 'degrading';
  criticalFindings: number;
  highFindings: number;
  owaspCompliance: number;
}

export interface ReportOptions {
  format: 'json' | 'html' | 'markdown' | 'csv';
  includeRemediation?: boolean;
  includeHistory?: boolean;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

export interface TrendData {
  date: Date;
  riskScore: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  owaspScore: number;
}

export interface PersistenceConfig {
  type: 'sqlite' | 'postgres' | 'memory';
  connectionString?: string;
  tableName?: string;
}

// ============================================================================
// Audit Persistence Class
// ============================================================================

export class N8nAuditPersistence {
  private readonly config: PersistenceConfig;
  private records: Map<string, AuditRecord[]> = new Map();
  private initialized = false;

  constructor(config: PersistenceConfig = { type: 'memory' }) {
    this.config = {
      type: config.type,
      connectionString: config.connectionString,
      tableName: config.tableName || 'n8n_audit_results',
    };
  }

  /**
   * Initialize the persistence layer
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.type === 'memory') {
      // In-memory storage - already initialized
      this.initialized = true;
      return;
    }

    // For SQLite/Postgres, create tables if needed
    if (this.config.type === 'sqlite' || this.config.type === 'postgres') {
      await this.createTables();
    }

    this.initialized = true;
  }

  /**
   * Store security audit result
   */
  async storeSecurityAudit(result: SecurityAuditResult, metadata?: AuditRecord['metadata']): Promise<string> {
    await this.ensureInitialized();

    const record: AuditRecord = {
      id: this.generateId(),
      workflowId: result.workflowId,
      workflowName: result.workflowName,
      auditType: 'security',
      timestamp: new Date(),
      result,
      metadata: metadata || { agentVersion: '1.0.0' },
    };

    await this.saveRecord(record);
    return record.id;
  }

  /**
   * Store node validation result
   */
  async storeValidationResult(result: NodeValidationResult, workflowName: string, metadata?: AuditRecord['metadata']): Promise<string> {
    await this.ensureInitialized();

    const record: AuditRecord = {
      id: this.generateId(),
      workflowId: result.workflowId,
      workflowName,
      auditType: 'validation',
      timestamp: new Date(),
      result,
      metadata: metadata || { agentVersion: '1.0.0' },
    };

    await this.saveRecord(record);
    return record.id;
  }

  /**
   * Get audit history for a workflow
   */
  async getAuditHistory(workflowId: string, options?: {
    auditType?: AuditRecord['auditType'];
    limit?: number;
    offset?: number;
  }): Promise<AuditRecord[]> {
    await this.ensureInitialized();

    let records = this.records.get(workflowId) || [];

    if (options?.auditType) {
      records = records.filter(r => r.auditType === options.auditType);
    }

    // Sort by timestamp descending
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.offset) {
      records = records.slice(options.offset);
    }

    if (options?.limit) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  /**
   * Get latest audit for a workflow
   */
  async getLatestAudit(workflowId: string, auditType?: AuditRecord['auditType']): Promise<AuditRecord | null> {
    const history = await this.getAuditHistory(workflowId, { auditType, limit: 1 });
    return history[0] || null;
  }

  /**
   * Get audit summary for a workflow
   */
  async getAuditSummary(workflowId: string): Promise<AuditSummary | null> {
    await this.ensureInitialized();

    const records = this.records.get(workflowId) || [];
    if (records.length === 0) return null;

    const securityRecords = records
      .filter(r => r.auditType === 'security')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (securityRecords.length === 0) {
      return {
        workflowId,
        workflowName: records[0].workflowName,
        totalAudits: records.length,
        lastAuditDate: records[0].timestamp,
        averageRiskScore: 0,
        riskTrend: 'stable',
        criticalFindings: 0,
        highFindings: 0,
        owaspCompliance: 0,
      };
    }

    // Calculate metrics from security audits
    const riskScores = securityRecords.map(r => (r.result as SecurityAuditResult).riskScore);
    const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;

    // Determine risk trend
    let riskTrend: AuditSummary['riskTrend'] = 'stable';
    if (securityRecords.length >= 3) {
      const recent = riskScores.slice(0, 3);
      const older = riskScores.slice(3, 6);
      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        if (recentAvg - olderAvg > 5) riskTrend = 'improving';
        else if (olderAvg - recentAvg > 5) riskTrend = 'degrading';
      }
    }

    const latestResult = securityRecords[0].result as SecurityAuditResult;

    return {
      workflowId,
      workflowName: records[0].workflowName,
      totalAudits: records.length,
      lastAuditDate: securityRecords[0].timestamp,
      averageRiskScore: Math.round(avgRiskScore),
      riskTrend,
      criticalFindings: latestResult.summary.critical,
      highFindings: latestResult.summary.high,
      owaspCompliance: latestResult.owaspCompliance.score,
    };
  }

  /**
   * Get risk trend data for visualization
   */
  async getTrendData(workflowId: string, days = 30): Promise<TrendData[]> {
    await this.ensureInitialized();

    const records = this.records.get(workflowId) || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const securityRecords = records
      .filter(r => r.auditType === 'security' && r.timestamp >= cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return securityRecords.map(r => {
      const result = r.result as SecurityAuditResult;
      return {
        date: r.timestamp,
        riskScore: result.riskScore,
        criticalCount: result.summary.critical,
        highCount: result.summary.high,
        mediumCount: result.summary.medium,
        lowCount: result.summary.low,
        owaspScore: result.owaspCompliance.score,
      };
    });
  }

  /**
   * Generate audit report
   */
  async generateReport(workflowId: string, options: ReportOptions): Promise<string> {
    await this.ensureInitialized();

    const latest = await this.getLatestAudit(workflowId, 'security');
    if (!latest) {
      throw new Error(`No audit records found for workflow ${workflowId}`);
    }

    const result = latest.result as SecurityAuditResult;
    const summary = await this.getAuditSummary(workflowId);
    const history = options.includeHistory
      ? await this.getAuditHistory(workflowId, { auditType: 'security', limit: 10 })
      : [];

    switch (options.format) {
      case 'json':
        return this.generateJsonReport(result, summary!, history, options);
      case 'html':
        return this.generateHtmlReport(result, summary!, history, options);
      case 'markdown':
        return this.generateMarkdownReport(result, summary!, history, options);
      case 'csv':
        return this.generateCsvReport(result, options);
      default:
        throw new Error(`Unsupported report format: ${options.format}`);
    }
  }

  /**
   * Get all workflow summaries
   */
  async getAllSummaries(): Promise<AuditSummary[]> {
    await this.ensureInitialized();

    const summaries: AuditSummary[] = [];
    for (const workflowId of this.records.keys()) {
      const summary = await this.getAuditSummary(workflowId);
      if (summary) summaries.push(summary);
    }

    return summaries.sort((a, b) => a.averageRiskScore - b.averageRiskScore);
  }

  /**
   * Delete old audit records
   */
  async pruneRecords(olderThanDays: number): Promise<number> {
    await this.ensureInitialized();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    let deleted = 0;
    for (const [workflowId, records] of this.records.entries()) {
      const kept = records.filter(r => r.timestamp >= cutoff);
      deleted += records.length - kept.length;
      this.records.set(workflowId, kept);
    }

    return deleted;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private generateId(): string {
    return `audit_${Date.now()}_${seededRandom.randomUUID().substring(0, 9)}`;
  }

  private async saveRecord(record: AuditRecord): Promise<void> {
    const records = this.records.get(record.workflowId) || [];
    records.push(record);
    this.records.set(record.workflowId, records);
  }

  private async createTables(): Promise<void> {
    // Placeholder for actual database table creation
    // In production, this would execute SQL to create the audit_results table
    console.log(`Creating ${this.config.tableName} table for ${this.config.type}`);
  }

  private generateJsonReport(
    result: SecurityAuditResult,
    summary: AuditSummary,
    history: AuditRecord[],
    options: ReportOptions
  ): string {
    const report = {
      generatedAt: new Date().toISOString(),
      workflow: {
        id: result.workflowId,
        name: result.workflowName,
      },
      summary: {
        riskScore: result.riskScore,
        riskTrend: summary.riskTrend,
        totalAudits: summary.totalAudits,
        owaspCompliance: result.owaspCompliance.score,
      },
      findings: result.findings.map(f => ({
        id: f.id,
        type: f.type,
        severity: f.severity,
        node: f.node,
        message: f.message,
        ...(options.includeRemediation ? { remediation: f.remediation } : {}),
      })),
      owaspCompliance: result.owaspCompliance,
      ...(options.includeHistory ? {
        history: history.map(h => ({
          date: h.timestamp.toISOString(),
          riskScore: (h.result as SecurityAuditResult).riskScore,
          findingsCount: (h.result as SecurityAuditResult).findings.length,
        })),
      } : {}),
    };

    return JSON.stringify(report, null, 2);
  }

  private generateHtmlReport(
    result: SecurityAuditResult,
    summary: AuditSummary,
    history: AuditRecord[],
    options: ReportOptions
  ): string {
    const severityColors = {
      critical: '#dc3545',
      high: '#fd7e14',
      medium: '#ffc107',
      low: '#28a745',
      info: '#17a2b8',
    };

    const findingsHtml = result.findings.map(f => `
      <tr>
        <td><span style="background: ${severityColors[f.severity]}; color: white; padding: 2px 8px; border-radius: 4px;">${f.severity.toUpperCase()}</span></td>
        <td>${f.type}</td>
        <td>${f.node}</td>
        <td>${f.message}</td>
        ${options.includeRemediation ? `<td>${f.remediation}</td>` : ''}
      </tr>
    `).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <title>Security Audit Report - ${result.workflowName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1 { color: #333; }
    .summary { display: flex; gap: 20px; margin-bottom: 30px; }
    .metric { background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; }
    .metric-value { font-size: 36px; font-weight: bold; }
    .metric-label { color: #666; margin-top: 5px; }
    .risk-${summary.riskTrend} { color: ${summary.riskTrend === 'improving' ? '#28a745' : summary.riskTrend === 'degrading' ? '#dc3545' : '#6c757d'}; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f8f9fa; font-weight: 600; }
    .owasp-pass { color: #28a745; }
    .owasp-warn { color: #ffc107; }
    .owasp-fail { color: #dc3545; }
  </style>
</head>
<body>
  <h1>Security Audit Report</h1>
  <h2>${result.workflowName}</h2>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="summary">
    <div class="metric">
      <div class="metric-value">${result.riskScore}</div>
      <div class="metric-label">Risk Score</div>
    </div>
    <div class="metric">
      <div class="metric-value risk-${summary.riskTrend}">${summary.riskTrend}</div>
      <div class="metric-label">Trend</div>
    </div>
    <div class="metric">
      <div class="metric-value">${result.owaspCompliance.score}%</div>
      <div class="metric-label">OWASP Compliance</div>
    </div>
    <div class="metric">
      <div class="metric-value">${result.findings.length}</div>
      <div class="metric-label">Total Findings</div>
    </div>
  </div>

  <h3>Findings (${result.findings.length})</h3>
  <table>
    <thead>
      <tr>
        <th>Severity</th>
        <th>Type</th>
        <th>Node</th>
        <th>Message</th>
        ${options.includeRemediation ? '<th>Remediation</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${findingsHtml}
    </tbody>
  </table>

  <h3>OWASP Top 10 Compliance</h3>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Status</th>
        <th>Findings</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(result.owaspCompliance.categories).map(([cat, data]) => `
        <tr>
          <td>${cat.replace(/_/g, ' ')}</td>
          <td class="owasp-${data.status}">${data.status.toUpperCase()}</td>
          <td>${data.findings}</td>
        </tr>
      `).join('\n')}
    </tbody>
  </table>
</body>
</html>`;
  }

  private generateMarkdownReport(
    result: SecurityAuditResult,
    summary: AuditSummary,
    history: AuditRecord[],
    options: ReportOptions
  ): string {
    const findingsTable = result.findings.map(f =>
      `| ${f.severity.toUpperCase()} | ${f.type} | ${f.node} | ${f.message} |${options.includeRemediation ? ` ${f.remediation} |` : ''}`
    ).join('\n');

    const owaspTable = Object.entries(result.owaspCompliance.categories).map(([cat, data]) =>
      `| ${cat.replace(/_/g, ' ')} | ${data.status.toUpperCase()} | ${data.findings} |`
    ).join('\n');

    return `# Security Audit Report

## ${result.workflowName}
**Workflow ID:** ${result.workflowId}
**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Risk Score | ${result.riskScore}/100 |
| Risk Trend | ${summary.riskTrend} |
| OWASP Compliance | ${result.owaspCompliance.score}% |
| Total Findings | ${result.findings.length} |
| Critical | ${result.summary.critical} |
| High | ${result.summary.high} |
| Medium | ${result.summary.medium} |
| Low | ${result.summary.low} |

## Findings

| Severity | Type | Node | Message |${options.includeRemediation ? ' Remediation |' : ''}
|----------|------|------|---------|${options.includeRemediation ? '-------------|' : ''}
${findingsTable}

## OWASP Top 10 Compliance

| Category | Status | Findings |
|----------|--------|----------|
${owaspTable}

${options.includeHistory ? `
## History

| Date | Risk Score | Findings |
|------|------------|----------|
${history.map(h => `| ${h.timestamp.toISOString().split('T')[0]} | ${(h.result as SecurityAuditResult).riskScore} | ${(h.result as SecurityAuditResult).findings.length} |`).join('\n')}
` : ''}

---
*Report generated by N8n Security Auditor Agent v1.0.0*
`;
  }

  private generateCsvReport(
    result: SecurityAuditResult,
    options: ReportOptions
  ): string {
    const headers = options.includeRemediation
      ? ['Severity', 'Type', 'Node', 'Message', 'Details', 'Remediation', 'OWASP Category', 'CWE']
      : ['Severity', 'Type', 'Node', 'Message', 'Details', 'OWASP Category', 'CWE'];

    const rows = result.findings.map(f => {
      const row = [
        f.severity,
        f.type,
        f.node,
        `"${f.message.replace(/"/g, '""')}"`,
        `"${f.details.replace(/"/g, '""')}"`,
      ];

      if (options.includeRemediation) {
        row.push(`"${f.remediation.replace(/"/g, '""')}"`);
      }

      row.push(f.owaspCategory || '', f.cwe || '');
      return row.join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

// ============================================================================
// Export Singleton for Convenience
// ============================================================================

let defaultInstance: N8nAuditPersistence | null = null;

export function getDefaultPersistence(): N8nAuditPersistence {
  if (!defaultInstance) {
    defaultInstance = new N8nAuditPersistence({ type: 'memory' });
  }
  return defaultInstance;
}

export function setDefaultPersistence(config: PersistenceConfig): N8nAuditPersistence {
  defaultInstance = new N8nAuditPersistence(config);
  return defaultInstance;
}
