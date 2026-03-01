/**
 * Unit tests for CI/CD output formatters.
 *
 * Tests JSON, SARIF, JUnit, and Markdown output generators.
 * SARIF tests include structural validation against v2.1.0 spec.
 */

import { describe, it, expect } from 'vitest';
import {
  toJSON,
  toSARIF,
  toJUnit,
  coverageToMarkdown,
  qualityGateToMarkdown,
  securityToMarkdown,
  testRunToMarkdown,
  writeOutput,
  type SecurityScanResult,
  type TestRunSummary,
  type CoverageResult,
  type QualityGateResult,
} from '../../../src/cli/utils/ci-output.js';

describe('toJSON', () => {
  it('should produce valid JSON with indentation', () => {
    const data = { foo: 'bar', count: 42 };
    const result = toJSON(data);
    expect(JSON.parse(result)).toEqual(data);
    expect(result).toContain('\n'); // indented
  });
});

describe('toSARIF', () => {
  const scanResult: SecurityScanResult = {
    vulnerabilities: [
      {
        severity: 'high',
        type: 'SQL Injection',
        file: 'src/db.ts',
        line: 42,
        message: 'Unsanitized input in query',
        ruleId: 'AQE/sql-injection',
        cweId: 'CWE-89',
      },
      {
        severity: 'medium',
        type: 'XSS',
        file: 'src/render.ts',
        line: 17,
        message: 'Unescaped output',
      },
      {
        severity: 'low',
        type: 'Info Disclosure',
        file: 'src/api.ts',
        line: 5,
        message: 'Stack trace exposed',
      },
    ],
    target: 'src/',
    scanType: 'SAST',
  };

  it('should produce valid JSON', () => {
    const sarif = toSARIF(scanResult);
    expect(() => JSON.parse(sarif)).not.toThrow();
  });

  it('should conform to SARIF v2.1.0 structure', () => {
    const sarif = JSON.parse(toSARIF(scanResult));

    // Required top-level fields
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0');
    expect(sarif.runs).toBeInstanceOf(Array);
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0];

    // Tool driver
    expect(run.tool.driver.name).toBe('agentic-qe');
    expect(run.tool.driver.version).toBeDefined();
    expect(typeof run.tool.driver.version).toBe('string');
    expect(run.tool.driver.rules).toBeInstanceOf(Array);

    // Results
    expect(run.results).toBeInstanceOf(Array);
    expect(run.results).toHaveLength(3);

    // Invocations
    expect(run.invocations).toBeInstanceOf(Array);
    expect(run.invocations[0].executionSuccessful).toBe(true);
  });

  it('should map severity levels correctly', () => {
    const sarif = JSON.parse(toSARIF(scanResult));
    const results = sarif.runs[0].results;

    // high → error
    expect(results[0].level).toBe('error');
    // medium → warning
    expect(results[1].level).toBe('warning');
    // low → note
    expect(results[2].level).toBe('note');
  });

  it('should include physical locations', () => {
    const sarif = JSON.parse(toSARIF(scanResult));
    const result = sarif.runs[0].results[0];
    const location = result.locations[0].physicalLocation;

    expect(location.artifactLocation.uri).toBe('src/db.ts');
    expect(location.artifactLocation.uriBaseId).toBe('%SRCROOT%');
    expect(location.region.startLine).toBe(42);
  });

  it('should include CWE references when provided', () => {
    const sarif = JSON.parse(toSARIF(scanResult));
    // First vuln has CWE-89
    expect(sarif.runs[0].results[0].taxa[0].id).toBe('CWE-89');

    // Rule should have helpUri to CWE page
    const rules = sarif.runs[0].tool.driver.rules;
    const sqlRule = rules.find((r: { id: string }) => r.id === 'AQE/sql-injection');
    expect(sqlRule.helpUri).toContain('cwe.mitre.org');
    expect(sqlRule.helpUri).toContain('89');
  });

  it('should deduplicate rules', () => {
    const dupeResult: SecurityScanResult = {
      vulnerabilities: [
        { severity: 'high', type: 'XSS', file: 'a.ts', line: 1, message: 'xss 1', ruleId: 'AQE/xss' },
        { severity: 'high', type: 'XSS', file: 'b.ts', line: 2, message: 'xss 2', ruleId: 'AQE/xss' },
      ],
      target: '.', scanType: 'SAST',
    };
    const sarif = JSON.parse(toSARIF(dupeResult));
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(1);
    expect(sarif.runs[0].results).toHaveLength(2);
  });

  it('should handle empty vulnerability list', () => {
    const emptyResult: SecurityScanResult = {
      vulnerabilities: [], target: '.', scanType: 'SAST',
    };
    const sarif = JSON.parse(toSARIF(emptyResult));
    expect(sarif.runs[0].results).toHaveLength(0);
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(0);
  });

  it('should not have hardcoded version', () => {
    const sarif = JSON.parse(toSARIF(scanResult));
    const version = sarif.runs[0].tool.driver.version;
    // Should not be a placeholder — must be a semver-like string
    expect(version).not.toBe('unknown');
    expect(version).toMatch(/^\d+\.\d+/);
  });
});

describe('toJUnit', () => {
  const summary: TestRunSummary = {
    runId: 'run-123',
    passed: 10,
    failed: 2,
    skipped: 1,
    duration: 5432,
    tests: [
      { name: 'should add', passed: true, duration: 100, suite: 'MathTests' },
      { name: 'should subtract', passed: true, duration: 50, suite: 'MathTests' },
      { name: 'should fail', passed: false, duration: 200, error: 'Expected 1 got 2', suite: 'MathTests' },
    ],
  };

  it('should produce valid XML', () => {
    const xml = toJUnit(summary);
    expect(xml.startsWith('<?xml version="1.0"')).toBe(true);
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('</testsuites>');
  });

  it('should include test counts in testsuites element', () => {
    const xml = toJUnit(summary);
    expect(xml).toContain('tests="13"');
    expect(xml).toContain('failures="2"');
  });

  it('should include failure details', () => {
    const xml = toJUnit(summary);
    expect(xml).toContain('<failure');
    expect(xml).toContain('Expected 1 got 2');
  });

  it('should escape XML special characters', () => {
    const withSpecial: TestRunSummary = {
      runId: 'run-1',
      passed: 1, failed: 1, skipped: 0, duration: 100,
      tests: [
        { name: 'test <html> & "quotes"', passed: false, duration: 10, error: 'Expected <div> & "x"' },
      ],
    };
    const xml = toJUnit(withSpecial);
    expect(xml).toContain('&lt;html&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).not.toContain('test <html>');
  });

  it('should generate placeholder test cases when no individual tests provided', () => {
    const noTests: TestRunSummary = {
      runId: 'run-2', passed: 5, failed: 0, skipped: 2, duration: 1000,
    };
    const xml = toJUnit(noTests);
    expect(xml).toContain('test-1');
    expect(xml).toContain('<skipped />');
  });
});

describe('Markdown Formatters', () => {
  it('coverageToMarkdown should include threshold status', () => {
    const result: CoverageResult = {
      summary: { line: 85, branch: 70, function: 90, statement: 85 },
      meetsThreshold: true,
      threshold: 80,
      recommendations: ['Add tests for error paths'],
    };
    const md = coverageToMarkdown(result);
    expect(md).toContain('# Coverage Report');
    expect(md).toContain('85%');
    expect(md).toContain('80%');
    expect(md).toContain('Met');
    expect(md).toContain('Add tests for error paths');
  });

  it('qualityGateToMarkdown should show pass/fail per check', () => {
    const result: QualityGateResult = {
      passed: false,
      score: 'C',
      checks: [
        { name: 'Coverage', passed: true, value: 85, threshold: 80 },
        { name: 'Security', passed: false, value: 'high', threshold: 'medium' },
      ],
    };
    const md = qualityGateToMarkdown(result);
    expect(md).toContain('FAILED');
    expect(md).toContain('Coverage');
    expect(md).toContain('Security');
  });

  it('securityToMarkdown should list vulnerabilities', () => {
    const result: SecurityScanResult = {
      vulnerabilities: [
        { severity: 'high', type: 'XSS', file: 'app.ts', line: 10, message: 'Unsafe' },
      ],
      target: 'src/',
      scanType: 'SAST',
      compliance: { compliant: false, issues: [{ framework: 'OWASP', issue: 'XSS found' }] },
    };
    const md = securityToMarkdown(result);
    expect(md).toContain('# Security Scan Report');
    expect(md).toContain('XSS');
    expect(md).toContain('OWASP');
    expect(md).toContain('Non-compliant');
  });

  it('testRunToMarkdown should show summary', () => {
    const summary: TestRunSummary = {
      runId: 'run-1', passed: 10, failed: 0, skipped: 2, duration: 3000,
    };
    const md = testRunToMarkdown(summary);
    expect(md).toContain('# Test Run Report');
    expect(md).toContain('12'); // total
    expect(md).toContain('All tests passed');
  });
});
