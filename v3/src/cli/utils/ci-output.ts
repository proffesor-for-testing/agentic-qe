/**
 * Agentic QE v3 - CI/CD Output Formatter
 *
 * Provides structured output formatting for CI/CD pipeline integration.
 * Supports: text (default), json, sarif, junit, markdown
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Read version from package.json at build time — no hardcoded strings. */
function getPackageVersion(): string {
  try {
    // Walk up from this file to find package.json
    let dir = typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const pkgPath = join(dir, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      } catch { /* not found at this level */ }
      dir = dirname(dir);
    }
  } catch { /* fallback */ }
  return 'unknown';
}

// ============================================================================
// Types
// ============================================================================

export type OutputFormat = 'text' | 'json' | 'sarif' | 'junit' | 'markdown';

export interface CIOutputOptions {
  format: OutputFormat;
  output?: string;
}

export interface SecurityVulnerability {
  severity: string;
  type: string;
  file: string;
  line: number;
  message: string;
  ruleId?: string;
  cweId?: string;
}

export interface SecurityScanResult {
  vulnerabilities: SecurityVulnerability[];
  compliance?: { compliant: boolean; issues?: Array<{ framework: string; issue: string }> };
  target: string;
  scanType: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  suite?: string;
  file?: string;
}

export interface TestRunSummary {
  runId: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests?: TestResult[];
}

export interface CoverageResult {
  summary: {
    line: number;
    branch: number;
    function: number;
    statement: number;
  };
  meetsThreshold: boolean;
  threshold: number;
  files?: Array<{
    path: string;
    lineCoverage: number;
    branchCoverage: number;
    uncoveredLines: number[];
  }>;
  gaps?: Array<{
    file: string;
    lines: number[];
    riskScore: number;
    severity: string;
  }>;
  recommendations?: string[];
}

export interface QualityGateResult {
  passed: boolean;
  score: string;
  checks: Array<{
    name: string;
    passed: boolean;
    value: number | string;
    threshold: number | string;
  }>;
  recommendations?: string[];
}

// ============================================================================
// Commander Option Helpers
// ============================================================================

/**
 * Standard --format and --output options to add to any Command.
 * Usage: command.option(...FORMAT_OPTION).option(...OUTPUT_OPTION)
 */
export const FORMAT_OPTION = ['-F, --format <format>', 'Output format (text|json|sarif|junit|markdown)', 'text'] as const;
export const OUTPUT_OPTION = ['-o, --output <path>', 'Write output to file instead of stdout'] as const;

// ============================================================================
// Output Writers
// ============================================================================

/**
 * Write output to file or stdout.
 * When writing to file, prints a short summary to stdout.
 */
export function writeOutput(content: string, outputPath?: string, summary?: string): void {
  if (outputPath) {
    const fullPath = resolve(outputPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
    if (summary) {
      console.log(summary);
    }
    console.log(`Output written to: ${fullPath}`);
  } else {
    console.log(content);
  }
}

// ============================================================================
// JSON Formatter
// ============================================================================

export function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ============================================================================
// SARIF v2.1.0 Builder (for security scan results)
// ============================================================================

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

export function toSARIF(result: SecurityScanResult): string {
  const severityToLevel = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low':
      case 'info': return 'note';
      default: return 'warning';
    }
  };

  const rules = new Map<string, { id: string; name: string; shortDescription: string; helpUri?: string }>();
  const results: unknown[] = [];

  for (const vuln of result.vulnerabilities) {
    const ruleId = vuln.ruleId || `AQE/${vuln.type.replace(/\s+/g, '-').toLowerCase()}`;

    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: vuln.type,
        shortDescription: vuln.type,
        ...(vuln.cweId ? { helpUri: `https://cwe.mitre.org/data/definitions/${vuln.cweId.replace('CWE-', '')}.html` } : {}),
      });
    }

    results.push({
      ruleId,
      level: severityToLevel(vuln.severity),
      message: { text: vuln.message },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri: vuln.file, uriBaseId: '%SRCROOT%' },
          region: { startLine: vuln.line, startColumn: 1 },
        },
      }],
      ...(vuln.cweId ? { taxa: [{ id: vuln.cweId, toolComponent: { name: 'CWE' } }] } : {}),
    });
  }

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'agentic-qe',
          version: getPackageVersion(),
          informationUri: 'https://github.com/proffesor-for-testing/agentic-qe',
          rules: Array.from(rules.values()).map(r => ({
            id: r.id,
            name: r.name,
            shortDescription: { text: r.shortDescription },
            ...(r.helpUri ? { helpUri: r.helpUri } : {}),
            defaultConfiguration: { level: 'warning' },
          })),
        },
      },
      results,
      invocations: [{
        executionSuccessful: true,
        commandLine: `aqe security --sast --format sarif -t ${result.target}`,
      }],
    }],
  };

  return JSON.stringify(sarif, null, 2);
}

// ============================================================================
// JUnit XML Builder (for test results)
// ============================================================================

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function toJUnit(summary: TestRunSummary): string {
  const tests = summary.tests || [];
  const totalTests = summary.passed + summary.failed + summary.skipped;
  const durationSec = (summary.duration / 1000).toFixed(3);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites tests="${totalTests}" failures="${summary.failed}" errors="0" time="${durationSec}">\n`;
  xml += `  <testsuite name="aqe-test-run" tests="${totalTests}" failures="${summary.failed}" errors="0" skipped="${summary.skipped}" time="${durationSec}" id="${escapeXml(summary.runId)}">\n`;

  if (tests.length > 0) {
    for (const test of tests) {
      const testDuration = (test.duration / 1000).toFixed(3);
      const classname = escapeXml(test.suite || test.file || 'aqe');
      const name = escapeXml(test.name);

      xml += `    <testcase classname="${classname}" name="${name}" time="${testDuration}"`;

      if (!test.passed && test.error) {
        xml += `>\n`;
        xml += `      <failure message="${escapeXml(test.error)}">${escapeXml(test.error)}</failure>\n`;
        xml += `    </testcase>\n`;
      } else {
        xml += ` />\n`;
      }
    }
  } else {
    // Generate summary-level test cases when individual tests aren't available
    for (let i = 0; i < summary.passed; i++) {
      xml += `    <testcase classname="aqe" name="test-${i + 1}" time="0" />\n`;
    }
    for (let i = 0; i < summary.failed; i++) {
      xml += `    <testcase classname="aqe" name="failed-test-${i + 1}" time="0">\n`;
      xml += `      <failure message="Test failed">Test failed</failure>\n`;
      xml += `    </testcase>\n`;
    }
    for (let i = 0; i < summary.skipped; i++) {
      xml += `    <testcase classname="aqe" name="skipped-test-${i + 1}" time="0">\n`;
      xml += `      <skipped />\n`;
      xml += `    </testcase>\n`;
    }
  }

  xml += `  </testsuite>\n`;
  xml += `</testsuites>\n`;

  return xml;
}

// ============================================================================
// Markdown Formatters
// ============================================================================

export function coverageToMarkdown(result: CoverageResult): string {
  let md = `# Coverage Report\n\n`;
  md += `| Metric | Value | Status |\n`;
  md += `|--------|-------|--------|\n`;
  md += `| Lines | ${result.summary.line}% | ${result.summary.line >= result.threshold ? '\u2705' : '\u274C'} |\n`;
  md += `| Branches | ${result.summary.branch}% | ${result.summary.branch >= result.threshold ? '\u2705' : '\u274C'} |\n`;
  md += `| Functions | ${result.summary.function}% | ${result.summary.function >= result.threshold ? '\u2705' : '\u274C'} |\n`;
  md += `| Statements | ${result.summary.statement}% | ${result.summary.statement >= result.threshold ? '\u2705' : '\u274C'} |\n`;
  md += `\n**Threshold:** ${result.threshold}% \u2014 ${result.meetsThreshold ? '\u2705 Met' : '\u274C Not met'}\n`;

  if (result.gaps && result.gaps.length > 0) {
    md += `\n## Coverage Gaps\n\n`;
    md += `| File | Uncovered Lines | Risk | Severity |\n`;
    md += `|------|----------------|------|----------|\n`;
    for (const gap of result.gaps.slice(0, 20)) {
      md += `| ${gap.file} | ${gap.lines.length} | ${(gap.riskScore * 100).toFixed(0)}% | ${gap.severity} |\n`;
    }
  }

  if (result.recommendations && result.recommendations.length > 0) {
    md += `\n## Recommendations\n\n`;
    for (const rec of result.recommendations) {
      md += `- ${rec}\n`;
    }
  }

  return md;
}

export function qualityGateToMarkdown(result: QualityGateResult): string {
  let md = `# Quality Gate Report\n\n`;
  md += `**Result:** ${result.passed ? '\u2705 PASSED' : '\u274C FAILED'}\n`;
  md += `**Score:** ${result.score}\n\n`;
  md += `## Checks\n\n`;
  md += `| Check | Value | Threshold | Status |\n`;
  md += `|-------|-------|-----------|--------|\n`;
  for (const check of result.checks) {
    md += `| ${check.name} | ${check.value} | ${check.threshold} | ${check.passed ? '\u2705' : '\u274C'} |\n`;
  }

  if (result.recommendations && result.recommendations.length > 0) {
    md += `\n## Recommendations\n\n`;
    for (const rec of result.recommendations) {
      md += `- ${rec}\n`;
    }
  }

  return md;
}

export function securityToMarkdown(result: SecurityScanResult): string {
  let md = `# Security Scan Report\n\n`;
  md += `**Target:** ${result.target}\n`;
  md += `**Scan Type:** ${result.scanType}\n`;
  md += `**Vulnerabilities Found:** ${result.vulnerabilities.length}\n\n`;

  if (result.vulnerabilities.length > 0) {
    md += `## Vulnerabilities\n\n`;
    md += `| Severity | Type | File | Line | Message |\n`;
    md += `|----------|------|------|------|---------|\n`;
    for (const v of result.vulnerabilities) {
      md += `| ${v.severity} | ${v.type} | ${v.file} | ${v.line} | ${v.message} |\n`;
    }
  }

  if (result.compliance) {
    md += `\n## Compliance\n\n`;
    md += `**Status:** ${result.compliance.compliant ? '\u2705 Compliant' : '\u274C Non-compliant'}\n`;
    if (result.compliance.issues) {
      for (const issue of result.compliance.issues) {
        md += `- **${issue.framework}:** ${issue.issue}\n`;
      }
    }
  }

  return md;
}

export function testRunToMarkdown(summary: TestRunSummary): string {
  const total = summary.passed + summary.failed + summary.skipped;
  let md = `# Test Run Report\n\n`;
  md += `**Run ID:** ${summary.runId}\n`;
  md += `**Duration:** ${summary.duration}ms\n\n`;
  md += `| Metric | Count |\n`;
  md += `|--------|-------|\n`;
  md += `| Total | ${total} |\n`;
  md += `| Passed | ${summary.passed} |\n`;
  md += `| Failed | ${summary.failed} |\n`;
  md += `| Skipped | ${summary.skipped} |\n`;
  md += `\n**Result:** ${summary.failed === 0 ? '\u2705 All tests passed' : '\u274C Some tests failed'}\n`;

  return md;
}
