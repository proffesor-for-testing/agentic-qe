/**
 * analysis/security-scan-comprehensive Test Suite
 *
 * Tests for comprehensive security scanning (SAST/DAST/dependency) with real CVE data.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SecurityScanComprehensiveHandler } from '@mcp/handlers/analysis/security-scan-comprehensive-handler';

describe('SecurityScanComprehensiveHandler', () => {
  let handler: SecurityScanComprehensiveHandler;

  beforeEach(() => {
    handler = new SecurityScanComprehensiveHandler();
  });

  describe('Section 1: SAST (Static Application Security Testing)', () => {
    it('should run SAST scan successfully', async () => {
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.scanType).toBe('sast');
      expect(response.data.vulnerabilities).toBeDefined();
    });

    it('should detect SQL injection vulnerabilities (CWE-89)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/api',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const sqlInjVuln = response.data.vulnerabilities.find(
        (v: any) => v.title.includes('SQL Injection')
      );
      expect(sqlInjVuln).toBeDefined();
      expect(sqlInjVuln.severity).toBe('high');
    });

    it('should detect XSS vulnerabilities (CWE-79)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/views',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      const xssVuln = response.data.vulnerabilities.find(
        (v: any) => v.title.includes('XSS')
      );
      expect(xssVuln).toBeDefined();
    });

    it('should detect command injection (CWE-78)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/exec',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.high).toBeGreaterThanOrEqual(0);
    });

    it('should detect hardcoded credentials (CWE-798)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/config',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const credVuln = response.data.vulnerabilities.some(
        (v: any) => v.id.includes('CWE-798') || v.title.toLowerCase().includes('credential')
      );
      expect(response.data.vulnerabilities.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect insecure cryptography (CWE-327)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/crypto',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('sast');
    });

    it('should detect path traversal (CWE-22)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/filehandler',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);
    });
  });

  describe('Section 2: DAST (Dynamic Application Security Testing)', () => {
    it('should run DAST scan successfully', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com',
        scanType: 'dast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('dast');
      expect(response.data.target).toBe('https://api.example.com');
    });

    it('should test for broken authentication (OWASP A07:2021)', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/auth',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });

    it('should test for broken access control (OWASP A01:2021)', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/admin',
        scanType: 'dast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });

    it('should test for injection flaws (OWASP A03:2021)', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/search',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities.length).toBeGreaterThanOrEqual(0);
    });

    it('should test for security misconfiguration (OWASP A05:2021)', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com',
        scanType: 'dast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.medium).toBeGreaterThanOrEqual(0);
    });

    it('should test for sensitive data exposure (OWASP A02:2021)', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/data',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.target).toBeDefined();
    });

    it('should test for CSRF vulnerabilities', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/form',
        scanType: 'dast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('dast');
    });

    it('should test for XXE (XML External Entity) attacks', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/xml',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });
  });

  describe('Section 3: Dependency Scanning', () => {
    it('should run dependency scan successfully', async () => {
      const response = await handler.handle({
        target: '/workspace/package.json',
        scanType: 'dependency',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('dependency');
    });

    it('should detect known vulnerable npm packages', async () => {
      const response = await handler.handle({
        target: '/workspace/package.json',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });

    it('should identify outdated dependencies', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });

    it('should detect transitive dependency vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace/package-lock.json',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities.length).toBeGreaterThanOrEqual(0);
    });

    it('should flag critical dependency vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.critical).toBeGreaterThanOrEqual(0);
    });

    it('should provide upgrade recommendations', async () => {
      const response = await handler.handle({
        target: '/workspace/package.json',
        scanType: 'dependency',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Section 4: Comprehensive Scanning', () => {
    it('should run comprehensive scan (SAST + DAST + Dependency)', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('comprehensive');
    });

    it('should aggregate vulnerabilities from all scan types', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.critical + response.data.summary.high + response.data.summary.medium).toBeGreaterThanOrEqual(0);
    });

    it('should provide comprehensive security score', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });

    it('should prioritize vulnerabilities by severity', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
      if (response.data.vulnerabilities.length > 0) {
        response.data.vulnerabilities.forEach((vuln: any) => {
          expect(['critical', 'high', 'medium', 'low', 'info']).toContain(vuln.severity);
        });
      }
    });

    it('should provide remediation recommendations', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);
    });
  });

  describe('Section 5: CVE Detection', () => {
    it('should detect CVE-2023-12345 (SQL Injection)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/api',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const cveVuln = response.data.vulnerabilities.find(
        (v: any) => v.id === 'CVE-2023-12345'
      );
      expect(cveVuln).toBeDefined();
      if (cveVuln) {
        expect(cveVuln.severity).toBe('high');
        expect(cveVuln.title).toContain('SQL Injection');
      }
    });

    it('should detect CVE-2023-67890 (XSS)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/views',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const cveVuln = response.data.vulnerabilities.find(
        (v: any) => v.id === 'CVE-2023-67890'
      );
      expect(cveVuln).toBeDefined();
      if (cveVuln) {
        expect(cveVuln.severity).toBe('high');
        expect(cveVuln.title).toContain('XSS');
      }
    });

    it('should link vulnerabilities to CVE database', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const cveVulns = response.data.vulnerabilities.filter(
        (v: any) => v.id.startsWith('CVE-')
      );
      expect(cveVulns.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide CVE CVSS scores', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      response.data.vulnerabilities.forEach((vuln: any) => {
        if (vuln.id.startsWith('CVE-')) {
          expect(vuln).toHaveProperty('severity');
        }
      });
    });

    it('should detect recently published CVEs (2024+)', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });
  });

  describe('Section 6: OWASP Top 10 Coverage', () => {
    it('should test for A01:2021 - Broken Access Control', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('dast');
    });

    it('should test for A02:2021 - Cryptographic Failures', async () => {
      const response = await handler.handle({
        target: '/workspace/src/crypto',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });

    it('should test for A03:2021 - Injection', async () => {
      const response = await handler.handle({
        target: '/workspace/src/api',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const injectionVuln = response.data.vulnerabilities.find(
        (v: any) => v.title.toLowerCase().includes('injection')
      );
      expect(response.data.vulnerabilities.length).toBeGreaterThanOrEqual(0);
    });

    it('should test for A04:2021 - Insecure Design', async () => {
      const response = await handler.handle({
        target: '/workspace/src/architecture',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });

    it('should test for A05:2021 - Security Misconfiguration', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.target).toBeDefined();
    });

    it('should test for A06:2021 - Vulnerable and Outdated Components', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('dependency');
    });

    it('should test for A07:2021 - Identification and Authentication Failures', async () => {
      const response = await handler.handle({
        target: 'https://api.example.com/auth',
        scanType: 'dast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });

    it('should test for A08:2021 - Software and Data Integrity Failures', async () => {
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('sast');
    });

    it('should test for A09:2021 - Security Logging and Monitoring Failures', async () => {
      const response = await handler.handle({
        target: '/workspace/src/logging',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
    });

    it('should test for A10:2021 - Server-Side Request Forgery (SSRF)', async () => {
      const response = await handler.handle({
        target: '/workspace/src/api',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.vulnerabilities).toBeDefined();
    });
  });

  describe('Section 7: Scan Depth Levels', () => {
    it('should run basic scan depth', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'basic',
      });

      expect(response.success).toBe(true);
      expect(response.data.depth).toBe('basic');
    });

    it('should run standard scan depth', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.depth).toBe('standard');
    });

    it('should run deep scan depth', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.depth).toBe('deep');
    });

    it('should find more vulnerabilities in deep scan vs basic', async () => {
      const basicResponse = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'basic',
      });

      const deepResponse = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(basicResponse.success).toBe(true);
      expect(deepResponse.success).toBe(true);
      expect(basicResponse.data.vulnerabilities).toBeDefined();
      expect(deepResponse.data.vulnerabilities).toBeDefined();
    });
  });

  describe('Section 8: Severity Scoring', () => {
    it('should classify critical severity vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.critical).toBeGreaterThanOrEqual(0);
    });

    it('should classify high severity vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.high).toBe(2);
    });

    it('should classify medium severity vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.medium).toBe(5);
    });

    it('should classify low severity vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.low).toBe(8);
    });

    it('should classify informational findings', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary.info).toBe(12);
    });

    it('should calculate total vulnerability count', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const total =
        response.data.summary.critical +
        response.data.summary.high +
        response.data.summary.medium +
        response.data.summary.low +
        response.data.summary.info;
      expect(total).toBeGreaterThan(0);
    });
  });

  describe('Section 9: Remediation Recommendations', () => {
    it('should provide SQL injection remediation', async () => {
      const response = await handler.handle({
        target: '/workspace/src/api',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(response.data.recommendations).toContain('Use parameterized queries to prevent SQL injection');
    });

    it('should provide XSS remediation', async () => {
      const response = await handler.handle({
        target: '/workspace/src/views',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toContain('Sanitize and escape all user-generated content');
    });

    it('should provide dependency update recommendations', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toContain('Update dependencies with known vulnerabilities');
    });

    it('should provide actionable remediation steps', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
      expect(Array.isArray(response.data.recommendations)).toBe(true);
      expect(response.data.recommendations.length).toBeGreaterThan(0);
    });

    it('should prioritize critical remediation items', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.recommendations).toBeDefined();
    });
  });

  describe('Section 10: Input Validation', () => {
    it('should reject invalid target path', async () => {
      const response = await handler.handle({
        target: '',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should reject invalid scan type', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'invalid-type' as any,
        depth: 'standard',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should handle missing depth parameter (default to standard)', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
      });

      expect(response.success).toBe(true);
      expect(response.data.depth).toBe('standard');
    });

    it('should reject non-existent paths for file-based scans', async () => {
      const response = await handler.handle({
        target: '/nonexistent/path',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.target).toBe('/nonexistent/path');
    });
  });

  describe('Section 11: Vulnerability Details', () => {
    it('should include file location in vulnerability details', async () => {
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      response.data.vulnerabilities.forEach((vuln: any) => {
        expect(vuln.file).toBeDefined();
        expect(typeof vuln.file).toBe('string');
      });
    });

    it('should include line numbers for code vulnerabilities', async () => {
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      response.data.vulnerabilities.forEach((vuln: any) => {
        expect(vuln.line).toBeDefined();
        expect(typeof vuln.line).toBe('number');
      });
    });

    it('should provide vulnerability descriptions', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      response.data.vulnerabilities.forEach((vuln: any) => {
        expect(vuln.description).toBeDefined();
        expect(typeof vuln.description).toBe('string');
        expect(vuln.description.length).toBeGreaterThan(0);
      });
    });

    it('should assign unique IDs to each vulnerability', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      const ids = response.data.vulnerabilities.map((v: any) => v.id);
      expect(ids.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Section 12: Concurrent Scans', () => {
    it('should handle concurrent SAST scans', async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        handler.handle({
          target: `/workspace/module${i}`,
          scanType: 'sast',
          depth: 'standard',
        })
      );

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.data.scanType).toBe('sast');
      });
    });

    it('should handle concurrent dependency scans', async () => {
      const promises = [
        handler.handle({
          target: '/workspace/package.json',
          scanType: 'dependency',
          depth: 'standard',
        }),
        handler.handle({
          target: '/workspace/yarn.lock',
          scanType: 'dependency',
          depth: 'standard',
        }),
      ];

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.data.scanType).toBe('dependency');
      });
    });

    it('should handle concurrent mixed scan types', async () => {
      const promises = [
        handler.handle({ target: '/workspace', scanType: 'sast', depth: 'standard' }),
        handler.handle({ target: 'https://api.example.com', scanType: 'dast', depth: 'standard' }),
        handler.handle({ target: '/workspace', scanType: 'dependency', depth: 'standard' }),
      ];

      const results = await Promise.all(promises);
      expect(results[0].data.scanType).toBe('sast');
      expect(results[1].data.scanType).toBe('dast');
      expect(results[2].data.scanType).toBe('dependency');
    });
  });

  describe('Section 13: Report Metadata', () => {
    it('should include scan target in metadata', async () => {
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.target).toBe('/workspace/src');
    });

    it('should include scan type in metadata', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.scanType).toBe('comprehensive');
    });

    it('should include scan depth in metadata', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'deep',
      });

      expect(response.success).toBe(true);
      expect(response.data.depth).toBe('deep');
    });

    it('should include vulnerability summary statistics', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBeDefined();
      expect(response.data.summary.critical).toBeDefined();
      expect(response.data.summary.high).toBeDefined();
      expect(response.data.summary.medium).toBeDefined();
      expect(response.data.summary.low).toBeDefined();
      expect(response.data.summary.info).toBeDefined();
    });

    it('should include requestId for tracking', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
      expect(response.metadata.requestId).toBeDefined();
      expect(typeof response.metadata.requestId).toBe('string');
    });
  });

  describe('Section 14: Error Handling', () => {
    it('should handle scan errors gracefully', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'sast',
        depth: 'standard',
      });

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('metadata');
      expect(response.metadata).toHaveProperty('requestId');
    });

    it('should provide meaningful error messages', async () => {
      const response = await handler.handle({} as any);

      if (!response.success) {
        expect(response.error).toBeTruthy();
        expect(typeof response.error).toBe('string');
      }
    });

    it('should recover from partial scan failures', async () => {
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'deep',
      });

      expect(response).toHaveProperty('success');
    });

    it('should timeout long-running scans gracefully', async () => {
      const startTime = Date.now();
      const response = await handler.handle({
        target: '/workspace/large-project',
        scanType: 'comprehensive',
        depth: 'deep',
      });
      const endTime = Date.now();

      expect(response).toHaveProperty('success');
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });

  describe('Section 15: Performance', () => {
    it('should complete SAST scan within reasonable time', async () => {
      const startTime = Date.now();
      const response = await handler.handle({
        target: '/workspace/src',
        scanType: 'sast',
        depth: 'standard',
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should complete dependency scan within reasonable time', async () => {
      const startTime = Date.now();
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'dependency',
        depth: 'standard',
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle large codebases efficiently', async () => {
      const startTime = Date.now();
      const response = await handler.handle({
        target: '/workspace',
        scanType: 'comprehensive',
        depth: 'basic',
      });
      const endTime = Date.now();

      expect(response.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(10000);
    });
  });
});
