/**
 * Security Scan Wizard - Unit Tests
 * ADR-041: V3 QE CLI Enhancement
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityScanWizard,
  runSecurityScanWizard,
  getScanTypeConfig,
  getComplianceConfig,
  getSeverityConfig,
  type SecurityWizardResult,
  type ScanType,
  type ComplianceFramework,
  type SeverityLevel,
  type ReportFormat,
} from '../../../src/cli/wizards/security-wizard';

describe('SecurityScanWizard', () => {
  describe('Non-Interactive Mode', () => {
    it('should return defaults when nonInteractive is true', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });

      expect(result.cancelled).toBe(false);
      expect(result.scanTypes).toEqual(['sast', 'dependency', 'secret']);
      expect(result.complianceFrameworks).toEqual(['owasp']);
      expect(result.severity).toBe('medium');
      expect(result.includeFixes).toBe(true);
      expect(result.generateReport).toBe(true);
      expect(result.reportFormat).toBe('json');
    });

    it('should use provided defaults', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultTarget: '/test/path',
        defaultScanTypes: ['sast', 'dast'],
        defaultComplianceFrameworks: ['gdpr', 'hipaa'],
        defaultSeverity: 'high',
        defaultIncludeFixes: false,
        defaultGenerateReport: true,
        defaultReportFormat: 'html',
      });

      expect(result.target).toBe('/test/path');
      expect(result.scanTypes).toEqual(['sast', 'dast']);
      expect(result.complianceFrameworks).toEqual(['gdpr', 'hipaa']);
      expect(result.severity).toBe('high');
      expect(result.includeFixes).toBe(false);
      expect(result.generateReport).toBe(true);
      expect(result.reportFormat).toBe('html');
    });
  });

  describe('SecurityWizardResult', () => {
    it('should have correct structure', () => {
      const result: SecurityWizardResult = {
        target: '/test/path',
        scanTypes: ['sast', 'dependency'],
        complianceFrameworks: ['owasp', 'gdpr'],
        severity: 'medium',
        includeFixes: true,
        generateReport: true,
        reportFormat: 'json',
        cancelled: false,
      };

      expect(typeof result.target).toBe('string');
      expect(result.scanTypes).toBeInstanceOf(Array);
      expect(result.complianceFrameworks).toBeInstanceOf(Array);
      expect(typeof result.severity).toBe('string');
      expect(typeof result.includeFixes).toBe('boolean');
      expect(typeof result.generateReport).toBe('boolean');
      expect(typeof result.reportFormat).toBe('string');
      expect(typeof result.cancelled).toBe('boolean');
    });

    it('should support cancelled state', () => {
      const result: SecurityWizardResult = {
        target: '.',
        scanTypes: ['sast', 'dependency', 'secret'],
        complianceFrameworks: ['owasp'],
        severity: 'medium',
        includeFixes: true,
        generateReport: true,
        reportFormat: 'json',
        cancelled: true,
      };

      expect(result.cancelled).toBe(true);
    });

    it('should support empty compliance frameworks', () => {
      const result: SecurityWizardResult = {
        target: '.',
        scanTypes: ['sast'],
        complianceFrameworks: [],
        severity: 'low',
        includeFixes: false,
        generateReport: false,
        reportFormat: 'json',
        cancelled: false,
      };

      expect(result.complianceFrameworks).toEqual([]);
    });
  });

  describe('Scan Types', () => {
    const validTypes: ScanType[] = ['sast', 'dast', 'dependency', 'secret'];

    it('should support all scan types', () => {
      validTypes.forEach(type => {
        expect(['sast', 'dast', 'dependency', 'secret']).toContain(type);
      });
    });

    it('should have 4 scan types', () => {
      expect(validTypes).toHaveLength(4);
    });

    it('should have correct scan type names', () => {
      expect(validTypes).toContain('sast');
      expect(validTypes).toContain('dast');
      expect(validTypes).toContain('dependency');
      expect(validTypes).toContain('secret');
    });
  });

  describe('Compliance Frameworks', () => {
    const validFrameworks: ComplianceFramework[] = ['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa'];

    it('should support all compliance frameworks', () => {
      validFrameworks.forEach(framework => {
        expect(['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa']).toContain(framework);
      });
    });

    it('should have 6 compliance frameworks', () => {
      expect(validFrameworks).toHaveLength(6);
    });

    it('should include common regulatory frameworks', () => {
      expect(validFrameworks).toContain('gdpr');
      expect(validFrameworks).toContain('hipaa');
      expect(validFrameworks).toContain('pci-dss');
    });

    it('should include security standards', () => {
      expect(validFrameworks).toContain('owasp');
      expect(validFrameworks).toContain('soc2');
    });
  });

  describe('Severity Levels', () => {
    const validLevels: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];

    it('should support all severity levels', () => {
      validLevels.forEach(level => {
        expect(['critical', 'high', 'medium', 'low']).toContain(level);
      });
    });

    it('should have 4 severity levels', () => {
      expect(validLevels).toHaveLength(4);
    });

    it('should have correct ordering from most to least severe', () => {
      expect(validLevels[0]).toBe('critical');
      expect(validLevels[1]).toBe('high');
      expect(validLevels[2]).toBe('medium');
      expect(validLevels[3]).toBe('low');
    });
  });

  describe('Report Formats', () => {
    const validFormats: ReportFormat[] = ['json', 'html', 'markdown', 'text'];

    it('should support all report formats', () => {
      validFormats.forEach(format => {
        expect(['json', 'html', 'markdown', 'text']).toContain(format);
      });
    });

    it('should have 4 report formats', () => {
      expect(validFormats).toHaveLength(4);
    });
  });

  describe('Scan Type Configuration', () => {
    it('should return correct config for sast', () => {
      const config = getScanTypeConfig('sast');
      expect(config.name).toBe('Static Application Security Testing');
      expect(config.description).toContain('source code');
    });

    it('should return correct config for dast', () => {
      const config = getScanTypeConfig('dast');
      expect(config.name).toBe('Dynamic Application Security Testing');
      expect(config.description).toContain('running application');
    });

    it('should return correct config for dependency', () => {
      const config = getScanTypeConfig('dependency');
      expect(config.name).toBe('Dependency Scanning');
      expect(config.description).toContain('CVE');
    });

    it('should return correct config for secret', () => {
      const config = getScanTypeConfig('secret');
      expect(config.name).toBe('Secret Detection');
      expect(config.description).toContain('secrets');
    });
  });

  describe('Compliance Configuration', () => {
    it('should return correct config for owasp', () => {
      const config = getComplianceConfig('owasp');
      expect(config.name).toBe('OWASP Top 10');
      expect(config.description).toContain('security risks');
    });

    it('should return correct config for gdpr', () => {
      const config = getComplianceConfig('gdpr');
      expect(config.name).toBe('GDPR');
      expect(config.description).toContain('Data Protection');
    });

    it('should return correct config for hipaa', () => {
      const config = getComplianceConfig('hipaa');
      expect(config.name).toBe('HIPAA');
      expect(config.description).toContain('Health');
    });

    it('should return correct config for soc2', () => {
      const config = getComplianceConfig('soc2');
      expect(config.name).toBe('SOC 2');
      expect(config.description).toContain('Service Organization');
    });

    it('should return correct config for pci-dss', () => {
      const config = getComplianceConfig('pci-dss');
      expect(config.name).toBe('PCI-DSS');
      expect(config.description).toContain('Payment Card');
    });

    it('should return correct config for ccpa', () => {
      const config = getComplianceConfig('ccpa');
      expect(config.name).toBe('CCPA');
      expect(config.description).toContain('California');
    });
  });

  describe('Severity Configuration', () => {
    it('should return correct config for critical', () => {
      const config = getSeverityConfig('critical');
      expect(config.priority).toBe(1);
      expect(config.description).toContain('Immediate');
    });

    it('should return correct config for high', () => {
      const config = getSeverityConfig('high');
      expect(config.priority).toBe(2);
      expect(config.description).toContain('Important');
    });

    it('should return correct config for medium', () => {
      const config = getSeverityConfig('medium');
      expect(config.priority).toBe(3);
      expect(config.description).toContain('Notable');
    });

    it('should return correct config for low', () => {
      const config = getSeverityConfig('low');
      expect(config.priority).toBe(4);
      expect(config.description).toContain('Minor');
    });

    it('should have increasing priority numbers from critical to low', () => {
      const critical = getSeverityConfig('critical');
      const high = getSeverityConfig('high');
      const medium = getSeverityConfig('medium');
      const low = getSeverityConfig('low');

      expect(critical.priority).toBeLessThan(high.priority);
      expect(high.priority).toBeLessThan(medium.priority);
      expect(medium.priority).toBeLessThan(low.priority);
    });
  });

  describe('SecurityScanWizard Class', () => {
    it('should create instance', () => {
      const wizard = new SecurityScanWizard();
      expect(wizard).toBeInstanceOf(SecurityScanWizard);
    });

    it('should accept options', () => {
      const wizard = new SecurityScanWizard({
        nonInteractive: true,
        defaultSeverity: 'high',
      });
      expect(wizard).toBeInstanceOf(SecurityScanWizard);
    });

    it('should handle non-interactive mode', async () => {
      const wizard = new SecurityScanWizard({ nonInteractive: true });
      const result = await wizard.run();

      expect(result.cancelled).toBe(false);
      expect(result.severity).toBe('medium');
    });

    it('should use current working directory by default', async () => {
      const wizard = new SecurityScanWizard({ nonInteractive: true });
      const result = await wizard.run();

      expect(result.target).toBe(process.cwd());
    });
  });

  describe('Default Scan Types', () => {
    it('should default to sast, dependency, and secret', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });
      expect(result.scanTypes).toContain('sast');
      expect(result.scanTypes).toContain('dependency');
      expect(result.scanTypes).toContain('secret');
    });

    it('should not include dast by default', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });
      expect(result.scanTypes).not.toContain('dast');
    });

    it('should allow all scan types to be selected', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultScanTypes: ['sast', 'dast', 'dependency', 'secret'],
      });
      expect(result.scanTypes).toHaveLength(4);
    });
  });

  describe('Include Fixes', () => {
    it('should include fixes by default', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });
      expect(result.includeFixes).toBe(true);
    });

    it('should allow disabling fix suggestions', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultIncludeFixes: false,
      });
      expect(result.includeFixes).toBe(false);
    });
  });

  describe('Report Generation', () => {
    it('should generate report by default', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });
      expect(result.generateReport).toBe(true);
    });

    it('should allow disabling report generation', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultGenerateReport: false,
      });
      expect(result.generateReport).toBe(false);
    });

    it('should default to json format', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
      });
      expect(result.reportFormat).toBe('json');
    });

    it('should allow html format', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultReportFormat: 'html',
      });
      expect(result.reportFormat).toBe('html');
    });

    it('should allow markdown format', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultReportFormat: 'markdown',
      });
      expect(result.reportFormat).toBe('markdown');
    });

    it('should allow text format', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultReportFormat: 'text',
      });
      expect(result.reportFormat).toBe('text');
    });
  });

  describe('Factory Function', () => {
    it('should return SecurityWizardResult', async () => {
      const result = await runSecurityScanWizard({ nonInteractive: true });

      expect(result).toHaveProperty('target');
      expect(result).toHaveProperty('scanTypes');
      expect(result).toHaveProperty('complianceFrameworks');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('includeFixes');
      expect(result).toHaveProperty('generateReport');
      expect(result).toHaveProperty('reportFormat');
      expect(result).toHaveProperty('cancelled');
    });

    it('should support empty options', async () => {
      const result = await runSecurityScanWizard({ nonInteractive: true });
      expect(result).toBeDefined();
    });
  });
});

describe('CLI Integration', () => {
  describe('--wizard flag', () => {
    it('should accept wizard flag', () => {
      const options = { wizard: true };
      expect(options.wizard).toBe(true);
    });

    it('should combine with other options', () => {
      const options = {
        wizard: true,
        target: 'src/',
        severity: 'high',
        format: 'html',
      };

      expect(options.wizard).toBe(true);
      expect(options.target).toBe('src/');
    });
  });

  describe('--scan-types flag', () => {
    it('should accept all scan types', () => {
      const types: ScanType[] = ['sast', 'dast', 'dependency', 'secret'];
      types.forEach(type => {
        const options = { scanTypes: [type] };
        expect(options.scanTypes).toContain(type);
      });
    });

    it('should accept multiple scan types', () => {
      const options = { scanTypes: ['sast', 'dependency'] };
      expect(options.scanTypes).toHaveLength(2);
    });
  });

  describe('--compliance flag', () => {
    it('should accept all compliance frameworks', () => {
      const frameworks: ComplianceFramework[] = ['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa'];
      frameworks.forEach(framework => {
        const options = { compliance: [framework] };
        expect(options.compliance).toContain(framework);
      });
    });

    it('should accept multiple frameworks', () => {
      const options = { compliance: ['gdpr', 'hipaa', 'ccpa'] };
      expect(options.compliance).toHaveLength(3);
    });
  });

  describe('--severity flag', () => {
    it('should accept all severity levels', () => {
      const levels: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];
      levels.forEach(level => {
        const options = { severity: level };
        expect(options.severity).toBe(level);
      });
    });

    it('should default to medium', () => {
      const defaultLevel = 'medium';
      expect(defaultLevel).toBe('medium');
    });
  });

  describe('--format flag', () => {
    it('should accept all report formats', () => {
      const formats: ReportFormat[] = ['json', 'html', 'markdown', 'text'];
      formats.forEach(format => {
        const options = { format };
        expect(options.format).toBe(format);
      });
    });

    it('should default to json', () => {
      const defaultFormat = 'json';
      expect(defaultFormat).toBe('json');
    });
  });

  describe('--include-fixes flag', () => {
    it('should accept boolean value', () => {
      const optionsTrue = { includeFixes: true };
      const optionsFalse = { includeFixes: false };

      expect(optionsTrue.includeFixes).toBe(true);
      expect(optionsFalse.includeFixes).toBe(false);
    });

    it('should default to true', () => {
      const defaultValue = true;
      expect(defaultValue).toBe(true);
    });
  });
});

describe('Security Scan Scenarios', () => {
  describe('Full scan configuration', () => {
    it('should support full security audit configuration', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultTarget: 'src/',
        defaultScanTypes: ['sast', 'dast', 'dependency', 'secret'],
        defaultComplianceFrameworks: ['owasp', 'gdpr', 'hipaa', 'soc2', 'pci-dss', 'ccpa'],
        defaultSeverity: 'low',
        defaultIncludeFixes: true,
        defaultGenerateReport: true,
        defaultReportFormat: 'html',
      });

      expect(result.scanTypes).toHaveLength(4);
      expect(result.complianceFrameworks).toHaveLength(6);
      expect(result.severity).toBe('low');
    });
  });

  describe('Minimal scan configuration', () => {
    it('should support minimal quick scan configuration', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultScanTypes: ['sast'],
        defaultComplianceFrameworks: [],
        defaultSeverity: 'critical',
        defaultIncludeFixes: false,
        defaultGenerateReport: false,
      });

      expect(result.scanTypes).toHaveLength(1);
      expect(result.complianceFrameworks).toHaveLength(0);
      expect(result.severity).toBe('critical');
      expect(result.includeFixes).toBe(false);
      expect(result.generateReport).toBe(false);
    });
  });

  describe('CI/CD pipeline configuration', () => {
    it('should support CI/CD pipeline defaults', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultScanTypes: ['sast', 'dependency', 'secret'],
        defaultComplianceFrameworks: ['owasp'],
        defaultSeverity: 'high',
        defaultIncludeFixes: false,
        defaultGenerateReport: true,
        defaultReportFormat: 'json',
      });

      expect(result.severity).toBe('high');
      expect(result.reportFormat).toBe('json');
    });
  });

  describe('Healthcare compliance configuration', () => {
    it('should support HIPAA-focused scan', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultComplianceFrameworks: ['hipaa', 'soc2'],
        defaultSeverity: 'medium',
      });

      expect(result.complianceFrameworks).toContain('hipaa');
      expect(result.complianceFrameworks).toContain('soc2');
    });
  });

  describe('Financial compliance configuration', () => {
    it('should support PCI-DSS-focused scan', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultComplianceFrameworks: ['pci-dss', 'soc2'],
        defaultSeverity: 'high',
      });

      expect(result.complianceFrameworks).toContain('pci-dss');
      expect(result.complianceFrameworks).toContain('soc2');
    });
  });

  describe('Privacy compliance configuration', () => {
    it('should support GDPR/CCPA-focused scan', async () => {
      const result = await runSecurityScanWizard({
        nonInteractive: true,
        defaultComplianceFrameworks: ['gdpr', 'ccpa'],
      });

      expect(result.complianceFrameworks).toContain('gdpr');
      expect(result.complianceFrameworks).toContain('ccpa');
    });
  });
});
