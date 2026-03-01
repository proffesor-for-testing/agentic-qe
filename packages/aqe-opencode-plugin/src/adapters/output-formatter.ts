/**
 * Output Format Adapters
 *
 * Formats AQE tool outputs for clean rendering in OpenCode's UI.
 * Handles coverage reports, test results, security findings, and
 * generic tool outputs. Keeps outputs under compaction-safe sizes
 * to avoid OpenCode's token pruning.
 *
 * @module adapters/output-formatter
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Coverage report data from AQE's coverage_analyze_sublinear tool.
 */
export interface CoverageReport {
  overall: number;
  files: Array<{
    path: string;
    coverage: number;
    lines: { covered: number; total: number };
    branches?: { covered: number; total: number };
    uncoveredRanges?: Array<{ start: number; end: number }>;
  }>;
  gaps?: Array<{
    file: string;
    reason: string;
    suggestedTest?: string;
  }>;
}

/**
 * Test execution results from AQE's test_execute_parallel tool.
 */
export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites: Array<{
    name: string;
    tests: Array<{
      name: string;
      status: 'pass' | 'fail' | 'skip';
      duration: number;
      error?: string;
    }>;
  }>;
}

/**
 * Security findings from AQE's security_scan_comprehensive tool.
 */
export interface SecurityFindings {
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    file?: string;
    line?: number;
    description: string;
    recommendation?: string;
    cwe?: string;
  }>;
}

/**
 * Quality assessment data from AQE's quality_assess tool.
 */
export interface QualityAssessment {
  score: number;
  grade: string;
  dimensions: Array<{
    name: string;
    score: number;
    findings: string[];
  }>;
  gateResult?: 'pass' | 'fail';
  gateReason?: string;
}

/**
 * Output format options.
 */
export interface FormatOptions {
  /** Maximum output length in characters (default: 8000 ~ 2000 tokens) */
  maxChars?: number;
  /** Whether to include detailed per-file breakdowns (default: false) */
  verbose?: boolean;
  /** Whether to use markdown formatting (default: true) */
  markdown?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default max chars keeps output well under OpenCode's compaction threshold */
const DEFAULT_MAX_CHARS = 8_000;

const STATUS_ICONS: Record<string, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  skip: 'SKIP',
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
  info: 'INFO',
};

// ---------------------------------------------------------------------------
// Coverage formatter
// ---------------------------------------------------------------------------

/**
 * Format a coverage report as a compact table.
 */
export function formatCoverageReport(report: CoverageReport, options?: FormatOptions): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const verbose = options?.verbose ?? false;
  const lines: string[] = [];

  lines.push(`## Coverage Report`);
  lines.push('');
  lines.push(`**Overall: ${report.overall.toFixed(1)}%**`);
  lines.push('');

  if (verbose && report.files.length > 0) {
    lines.push('| File | Coverage | Lines | Branches |');
    lines.push('|------|----------|-------|----------|');

    // Sort by coverage ascending (worst first)
    const sorted = [...report.files].sort((a, b) => a.coverage - b.coverage);

    for (const file of sorted) {
      const shortPath = shortenPath(file.path);
      const linesStr = `${file.lines.covered}/${file.lines.total}`;
      const branchStr = file.branches
        ? `${file.branches.covered}/${file.branches.total}`
        : '-';
      lines.push(`| ${shortPath} | ${file.coverage.toFixed(1)}% | ${linesStr} | ${branchStr} |`);

      if (lines.join('\n').length > maxChars - 500) {
        lines.push(`| ... | ${report.files.length - sorted.indexOf(file)} more files | | |`);
        break;
      }
    }
  } else if (report.files.length > 0) {
    // Compact: only show low-coverage files
    const lowCoverage = report.files
      .filter((f) => f.coverage < 80)
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 10);

    if (lowCoverage.length > 0) {
      lines.push('**Low coverage files:**');
      for (const file of lowCoverage) {
        lines.push(`- ${shortenPath(file.path)}: ${file.coverage.toFixed(1)}%`);
      }
    }
  }

  if (report.gaps && report.gaps.length > 0) {
    lines.push('');
    lines.push('**Coverage gaps:**');
    for (const gap of report.gaps.slice(0, 5)) {
      lines.push(`- ${shortenPath(gap.file)}: ${gap.reason}`);
    }
    if (report.gaps.length > 5) {
      lines.push(`- ...and ${report.gaps.length - 5} more gaps`);
    }
  }

  return truncateOutput(lines.join('\n'), maxChars);
}

// ---------------------------------------------------------------------------
// Test results formatter
// ---------------------------------------------------------------------------

/**
 * Format test results as a pass/fail summary.
 */
export function formatTestResults(results: TestResults, options?: FormatOptions): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const verbose = options?.verbose ?? false;
  const lines: string[] = [];

  const passRate = results.total > 0
    ? ((results.passed / results.total) * 100).toFixed(1)
    : '0.0';

  lines.push(`## Test Results`);
  lines.push('');
  lines.push(
    `**${results.passed}/${results.total} passed** (${passRate}%) | ` +
    `${results.failed} failed | ${results.skipped} skipped | ` +
    `${formatDuration(results.duration)}`
  );

  // Always show failed tests
  const failedTests: Array<{ suite: string; test: string; error?: string }> = [];
  for (const suite of results.suites) {
    for (const test of suite.tests) {
      if (test.status === 'fail') {
        failedTests.push({ suite: suite.name, test: test.name, error: test.error });
      }
    }
  }

  if (failedTests.length > 0) {
    lines.push('');
    lines.push('**Failed tests:**');
    for (const ft of failedTests.slice(0, 15)) {
      lines.push(`- [${STATUS_ICONS.fail}] ${ft.suite} > ${ft.test}`);
      if (ft.error) {
        const shortError = ft.error.split('\n')[0].slice(0, 120);
        lines.push(`  ${shortError}`);
      }
    }
    if (failedTests.length > 15) {
      lines.push(`- ...and ${failedTests.length - 15} more failures`);
    }
  }

  if (verbose) {
    lines.push('');
    lines.push('**Suite breakdown:**');
    for (const suite of results.suites) {
      const suitePass = suite.tests.filter((t) => t.status === 'pass').length;
      const suiteFail = suite.tests.filter((t) => t.status === 'fail').length;
      lines.push(`- ${suite.name}: ${suitePass} pass, ${suiteFail} fail`);

      if (lines.join('\n').length > maxChars - 200) {
        lines.push('- ...(truncated)');
        break;
      }
    }
  }

  return truncateOutput(lines.join('\n'), maxChars);
}

// ---------------------------------------------------------------------------
// Security findings formatter
// ---------------------------------------------------------------------------

/**
 * Format security findings as a severity-sorted list.
 */
export function formatSecurityFindings(findings: SecurityFindings, options?: FormatOptions): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const verbose = options?.verbose ?? false;
  const lines: string[] = [];
  const s = findings.summary;

  lines.push(`## Security Scan Results`);
  lines.push('');
  lines.push(
    `**${s.critical} critical | ${s.high} high | ${s.medium} medium | ` +
    `${s.low} low | ${s.info} info**`
  );

  if (findings.findings.length === 0) {
    lines.push('');
    lines.push('No security findings detected.');
    return lines.join('\n');
  }

  // Sort by severity (critical first)
  const severityOrder: Record<string, number> = {
    critical: 0, high: 1, medium: 2, low: 3, info: 4,
  };
  const sorted = [...findings.findings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  lines.push('');

  // Always show critical and high
  const criticalAndHigh = sorted.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const rest = sorted.filter((f) => f.severity !== 'critical' && f.severity !== 'high');

  for (const finding of criticalAndHigh) {
    lines.push(formatSingleFinding(finding, verbose));
    lines.push('');
  }

  if (verbose) {
    for (const finding of rest) {
      lines.push(formatSingleFinding(finding, verbose));
      lines.push('');

      if (lines.join('\n').length > maxChars - 200) {
        lines.push(`...and ${rest.length - rest.indexOf(finding)} more findings`);
        break;
      }
    }
  } else if (rest.length > 0) {
    lines.push(`_${rest.length} additional findings (medium/low/info) omitted. Use verbose mode to see all._`);
  }

  return truncateOutput(lines.join('\n'), maxChars);
}

// ---------------------------------------------------------------------------
// Quality assessment formatter
// ---------------------------------------------------------------------------

/**
 * Format a quality assessment result.
 */
export function formatQualityAssessment(assessment: QualityAssessment, options?: FormatOptions): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const lines: string[] = [];

  lines.push(`## Quality Assessment`);
  lines.push('');
  lines.push(`**Score: ${assessment.score}/100 (${assessment.grade})**`);

  if (assessment.gateResult) {
    lines.push(`**Quality Gate: ${assessment.gateResult.toUpperCase()}**`);
    if (assessment.gateReason) {
      lines.push(`Reason: ${assessment.gateReason}`);
    }
  }

  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|-----------|-------|');
  for (const dim of assessment.dimensions) {
    lines.push(`| ${dim.name} | ${dim.score}/100 |`);
  }

  for (const dim of assessment.dimensions) {
    if (dim.findings.length > 0) {
      lines.push('');
      lines.push(`**${dim.name}:**`);
      for (const finding of dim.findings.slice(0, 3)) {
        lines.push(`- ${finding}`);
      }
      if (dim.findings.length > 3) {
        lines.push(`- ...and ${dim.findings.length - 3} more`);
      }
    }
  }

  return truncateOutput(lines.join('\n'), maxChars);
}

// ---------------------------------------------------------------------------
// Generic formatter
// ---------------------------------------------------------------------------

/**
 * Format any tool output as a compact string.
 * Falls back to JSON stringification with truncation.
 */
export function formatGenericOutput(toolName: string, output: unknown, options?: FormatOptions): string {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

  if (typeof output === 'string') {
    return truncateOutput(output, maxChars);
  }

  const json = JSON.stringify(output, null, 2);
  if (json.length <= maxChars) {
    return `## ${toolName}\n\n\`\`\`json\n${json}\n\`\`\``;
  }

  // Truncate JSON output
  const truncated = json.slice(0, maxChars - 100);
  return `## ${toolName}\n\n\`\`\`json\n${truncated}\n...[truncated]\n\`\`\``;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortenPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-3).join('/')}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatSingleFinding(
  finding: SecurityFindings['findings'][0],
  verbose: boolean,
): string {
  const parts: string[] = [];
  const tag = STATUS_ICONS[finding.severity] ?? finding.severity.toUpperCase();
  parts.push(`**[${tag}] ${finding.title}**`);

  if (finding.file) {
    const loc = finding.line ? `${shortenPath(finding.file)}:${finding.line}` : shortenPath(finding.file);
    parts.push(`  Location: ${loc}`);
  }

  if (finding.cwe) {
    parts.push(`  CWE: ${finding.cwe}`);
  }

  if (verbose && finding.description) {
    parts.push(`  ${finding.description.slice(0, 200)}`);
  }

  if (verbose && finding.recommendation) {
    parts.push(`  Fix: ${finding.recommendation.slice(0, 150)}`);
  }

  return parts.join('\n');
}

function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 30) + '\n\n...[output truncated]';
}
