import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  generateSecurityReport,
  GenerateSecurityReportHandler,
  type GenerateSecurityReportParams,
  type SecurityScanData
} from '../../../../src/mcp/handlers/security/generate-report';

describe('Security Report Generation', () => {
  const mockScanResults: SecurityScanData[] = [
    {
      scanType: 'sast',
      timestamp: new Date().toISOString(),
      vulnerabilities: [
        {
          id: 'VULN-001',
          severity: 'critical',
          title: 'SQL Injection',
          description: 'Unsanitized user input in SQL query',
          cwe: 'CWE-89',
          cvssScore: 9.1,
          location: { file: 'app.js', line: 42 },
          recommendation: 'Use parameterized queries',
          fixSuggestion: 'db.query("SELECT * FROM users WHERE id = ?", [userId])'
        }
      ],
      summary: {
        totalVulnerabilities: 1,
        critical: 1,
        high: 0,
        medium: 0,
        low: 0
      }
    }
  ];

  describe('generateSecurityReport', () => {
    it('should generate HTML report', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'html',
        includeFixes: true
      };

      const result = await generateSecurityReport(params);

      expect(result).toBeDefined();
      expect(result.metadata.format).toBe('html');
      expect(result.content).toContain('<!DOCTYPE html>');
      expect(result.content).toContain('Security Assessment Report');
    });

    it('should generate SARIF report', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'sarif',
        includeFixes: false
      };

      const result = await generateSecurityReport(params);

      expect(result.metadata.format).toBe('sarif');
      const sarifData = JSON.parse(result.content);
      expect(sarifData.version).toBe('2.1.0');
      expect(sarifData.runs).toBeDefined();
      expect(sarifData.runs[0].results).toBeDefined();
    });

    it('should generate JSON report', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json'
      };

      const result = await generateSecurityReport(params);

      expect(result.metadata.format).toBe('json');
      const jsonData = JSON.parse(result.content);
      expect(jsonData.title).toBeDefined();
    });

    it('should generate Markdown report', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'markdown',
        includeFixes: true
      };

      const result = await generateSecurityReport(params);

      expect(result.metadata.format).toBe('markdown');
      expect(result.content).toContain('#');
      expect(result.content).toContain('##');
    });

    it('should include executive summary when enabled', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json',
        includeExecutiveSummary: true
      };

      const result = await generateSecurityReport(params);

      expect(result.executiveSummary).toBeDefined();
      expect(result.executiveSummary!.overallRiskLevel).toBeDefined();
      expect(result.executiveSummary!.totalVulnerabilities).toBeGreaterThanOrEqual(0);
      expect(result.executiveSummary!.recommendations).toBeDefined();
    });

    it('should include risk scoring when enabled', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json',
        includeRiskScoring: true
      };

      const result = await generateSecurityReport(params);

      expect(result.riskScoring).toBeDefined();
      expect(result.riskScoring!.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScoring!.overallScore).toBeLessThanOrEqual(100);
      expect(result.riskScoring!.categoryScores).toBeDefined();
    });

    it('should include compliance mapping when enabled', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json',
        includeCompliance: true,
        complianceStandards: ['OWASP', 'CWE']
      };

      const result = await generateSecurityReport(params);

      expect(result.complianceMapping).toBeDefined();
      expect(result.complianceMapping!['OWASP']).toBeDefined();
    });

    it('should generate remediation plan', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json',
        includeFixes: true
      };

      const result = await generateSecurityReport(params);

      expect(result.remediationPlan).toBeDefined();
      expect(result.remediationPlan.immediate).toBeDefined();
      expect(result.remediationPlan.shortTerm).toBeDefined();
      expect(result.remediationPlan.longTerm).toBeDefined();
    });

    it('should organize findings by severity', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json'
      };

      const result = await generateSecurityReport(params);

      expect(result.findings).toBeDefined();
      expect(result.findings.bySeverity).toBeDefined();
      expect(result.findings.bySeverity.critical).toBeDefined();
      expect(result.findings.bySeverity.high).toBeDefined();
      expect(result.findings.bySeverity.medium).toBeDefined();
      expect(result.findings.bySeverity.low).toBeDefined();
    });

    it('should organize findings by scan type', async () => {
      const params: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json'
      };

      const result = await generateSecurityReport(params);

      expect(result.findings.byScanType).toBeDefined();
      expect(result.findings.byScanType['sast']).toBeDefined();
    });
  });

  describe('GenerateSecurityReportHandler', () => {
    let handler: GenerateSecurityReportHandler;

    beforeEach(() => {
      handler = new GenerateSecurityReportHandler();
    });

    it('should handle report generation request', async () => {
      const args: GenerateSecurityReportParams = {
        scanResults: mockScanResults,
        format: 'json'
      };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should validate required parameters', async () => {
      const args = {
        scanResults: []
      } as any;

      await expect(handler.handle(args)).rejects.toThrow();
    });
  });
});
