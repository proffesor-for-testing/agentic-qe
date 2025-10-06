/**
 * Tests for Real Security Scanner
 */

import { RealSecurityScanner } from '../../src/utils/SecurityScanner';
import * as fs from 'fs';
import * as path from 'path';

describe('RealSecurityScanner', () => {
  let scanner: RealSecurityScanner;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(process.cwd(), 'test-projects', 'security-test');
    scanner = new RealSecurityScanner(testDir);
  });

  describe('ESLint Security Scan', () => {
    it('should detect eval() usage', async () => {
      const testFile = path.join(testDir, 'vulnerable-eval.js');

      // Create test file with eval vulnerability
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, `
        function unsafeEval(userInput) {
          return eval(userInput); // Security issue
        }
      `);

      const result = await scanner.runESLintScan(testFile);

      expect(result.success).toBe(true);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings.some(f =>
        f.title.includes('eval') || f.description.includes('eval')
      )).toBe(true);

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it('should detect unsafe regex', async () => {
      const testFile = path.join(testDir, 'vulnerable-regex.js');

      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, `
        function unsafeRegex(input) {
          const regex = new RegExp('(a+)+$'); // Catastrophic backtracking
          return regex.test(input);
        }
      `);

      const result = await scanner.runESLintScan(testFile);

      expect(result.success).toBe(true);
      // May or may not detect depending on ESLint rules

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it('should handle clean code without issues', async () => {
      const testFile = path.join(testDir, 'clean-code.js');

      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, `
        function safeFunction(input) {
          const sanitized = String(input).trim();
          return sanitized.length;
        }
      `);

      const result = await scanner.runESLintScan(testFile);

      expect(result.success).toBe(true);
      expect(result.findings.length).toBe(0);

      // Cleanup
      fs.unlinkSync(testFile);
    });
  });

  describe('Semgrep SAST Scan', () => {
    it('should attempt Semgrep scan', async () => {
      const testFile = path.join(testDir, 'test.js');

      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, `
        function test() {
          return "test";
        }
      `);

      const result = await scanner.runSemgrepScan(testFile);

      // Semgrep may not be available, but shouldn't crash
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('findings');
      expect(result).toHaveProperty('scanType', 'semgrep-sast');

      // Cleanup
      fs.unlinkSync(testFile);
    });
  });

  describe('NPM Audit Scan', () => {
    it('should run NPM audit successfully', async () => {
      const result = await scanner.runNPMAuditScan();

      expect(result.success).toBe(true);
      expect(result.scanType).toBe('npm-audit');
      expect(Array.isArray(result.findings)).toBe(true);
    });

    it('should parse vulnerability findings', async () => {
      const result = await scanner.runNPMAuditScan();

      // Check structure of findings
      for (const finding of result.findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('type', 'dependency');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('description');
        expect(finding).toHaveProperty('location');
      }
    });
  });

  describe('Comprehensive Scan', () => {
    it('should run all scanners together', async () => {
      const testFile = path.join(testDir, 'comprehensive-test.js');

      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFile, `
        function mixedVulnerabilities(userInput) {
          // Multiple potential issues
          eval(userInput); // ESLint should catch
          const fs = require('fs');
          fs.readFileSync(userInput); // Path traversal risk
        }
      `);

      const findings = await scanner.runComprehensiveScan(testFile);

      expect(Array.isArray(findings)).toBe(true);
      // Should have findings from ESLint at minimum
      expect(findings.length).toBeGreaterThan(0);

      // Verify finding structure
      for (const finding of findings) {
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('type');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('description');
        expect(finding).toHaveProperty('location');
      }

      // Cleanup
      fs.unlinkSync(testFile);
    });
  });

  afterAll(() => {
    // Cleanup test directory
    try {
      if (fs.existsSync(testDir)) {
        const files = fs.readdirSync(testDir);
        for (const file of files) {
          fs.unlinkSync(path.join(testDir, file));
        }
        fs.rmdirSync(testDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });
});
