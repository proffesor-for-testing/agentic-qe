/**
 * GitHub Actions Integration
 *
 * Generates GitHub Actions-specific output including:
 * - Job summaries with test results (GITHUB_STEP_SUMMARY)
 * - Inline annotations for failed tests (workflow commands)
 * - Output variables for downstream jobs (GITHUB_OUTPUT)
 *
 * NOTE: PR comments require GitHub API integration (e.g., @octokit/rest).
 * This module focuses on native GitHub Actions features that don't need
 * additional authentication beyond GITHUB_TOKEN for workflow commands.
 */

import type {
  PhaseResult,
  TestResult,
  CIEnvironment,
  GitHubActionsOutput,
  GitHubAnnotation,
} from '../interfaces';

// ============================================================================
// Types
// ============================================================================

export interface GitHubActionsConfig {
  /** Add inline annotations for failures */
  enableAnnotations: boolean;

  /** Generate job summary */
  enableSummary: boolean;

  /** Set output variables */
  enableOutputs: boolean;

  /** Maximum annotations (GitHub limits to 10 per step) */
  maxAnnotations: number;

  /** Include flaky test warnings */
  includeFlakyWarnings: boolean;

  /** Include coverage info */
  includeCoverage: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: GitHubActionsConfig = {
  enableAnnotations: true,
  enableSummary: true,
  enableOutputs: true,
  maxAnnotations: 10,
  includeFlakyWarnings: true,
  includeCoverage: true,
};

// ============================================================================
// CI Environment Detection
// ============================================================================

/**
 * Detect CI environment from environment variables
 */
export function detectCIEnvironment(): CIEnvironment {
  const env = process.env;

  // GitHub Actions
  if (env.GITHUB_ACTIONS === 'true') {
    return {
      isCI: true,
      provider: 'github-actions',
      branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME,
      commitSha: env.GITHUB_SHA,
      prNumber: env.GITHUB_EVENT_NAME === 'pull_request'
        ? parseInt(env.GITHUB_REF?.split('/')[2] || '', 10) || undefined
        : undefined,
      baseBranch: env.GITHUB_BASE_REF,
      buildUrl: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    };
  }

  // GitLab CI
  if (env.GITLAB_CI === 'true') {
    return {
      isCI: true,
      provider: 'gitlab-ci',
      branch: env.CI_COMMIT_REF_NAME,
      commitSha: env.CI_COMMIT_SHA,
      prNumber: env.CI_MERGE_REQUEST_IID
        ? parseInt(env.CI_MERGE_REQUEST_IID, 10)
        : undefined,
      baseBranch: env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME,
      buildUrl: env.CI_JOB_URL,
    };
  }

  // Jenkins
  if (env.JENKINS_URL) {
    return {
      isCI: true,
      provider: 'jenkins',
      branch: env.GIT_BRANCH || env.BRANCH_NAME,
      commitSha: env.GIT_COMMIT,
      prNumber: env.CHANGE_ID ? parseInt(env.CHANGE_ID, 10) : undefined,
      baseBranch: env.CHANGE_TARGET,
      buildUrl: env.BUILD_URL,
    };
  }

  // CircleCI
  if (env.CIRCLECI === 'true') {
    return {
      isCI: true,
      provider: 'circleci',
      branch: env.CIRCLE_BRANCH,
      commitSha: env.CIRCLE_SHA1,
      prNumber: env.CIRCLE_PULL_REQUEST
        ? parseInt(env.CIRCLE_PULL_REQUEST.split('/').pop() || '', 10)
        : undefined,
      buildUrl: env.CIRCLE_BUILD_URL,
    };
  }

  // Generic CI detection
  if (env.CI === 'true' || env.CI === '1') {
    return {
      isCI: true,
      provider: 'unknown',
    };
  }

  return { isCI: false };
}

// ============================================================================
// GitHub Actions Output Generator
// ============================================================================

export class GitHubActionsReporter {
  private config: GitHubActionsConfig;

  constructor(config?: Partial<GitHubActionsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Generate complete GitHub Actions output
   */
  generateOutput(results: PhaseResult[]): GitHubActionsOutput {
    const annotations = this.config.enableAnnotations
      ? this.generateAnnotations(results)
      : [];

    const summary = this.config.enableSummary
      ? this.generateSummary(results)
      : '';

    const outputs = this.config.enableOutputs
      ? this.generateOutputs(results)
      : {};

    return { summary, annotations, outputs };
  }

  /**
   * Write output to GitHub Actions
   */
  async writeOutput(results: PhaseResult[]): Promise<void> {
    const output = this.generateOutput(results);
    const fs = await import('fs/promises');

    // Write annotations (workflow commands)
    for (const annotation of output.annotations) {
      this.writeAnnotation(annotation);
    }

    // Write summary (GITHUB_STEP_SUMMARY)
    if (output.summary && process.env.GITHUB_STEP_SUMMARY) {
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, output.summary);
    }

    // Write outputs (GITHUB_OUTPUT)
    if (process.env.GITHUB_OUTPUT) {
      const outputLines = Object.entries(output.outputs)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      await fs.appendFile(process.env.GITHUB_OUTPUT, outputLines + '\n');
    }
  }

  // --------------------------------------------------------------------------
  // Annotation Generation
  // --------------------------------------------------------------------------

  private generateAnnotations(results: PhaseResult[]): GitHubAnnotation[] {
    const annotations: GitHubAnnotation[] = [];

    for (const phase of results) {
      // Failed test annotations
      for (const test of phase.testResults) {
        if (!test.passed && annotations.length < this.config.maxAnnotations) {
          annotations.push({
            file: test.file,
            line: this.extractLineNumber(test.stack) || 1,
            level: 'error',
            title: `Test Failed: ${test.name}`,
            message: test.error || 'Test failed without error message',
          });
        }
      }

      // Flaky test warnings
      if (this.config.includeFlakyWarnings) {
        for (const flakyTest of phase.flakyTests) {
          if (annotations.length < this.config.maxAnnotations) {
            annotations.push({
              file: flakyTest,
              line: 1,
              level: 'warning',
              title: 'Flaky Test Detected',
              message: `This test is flaky and may cause intermittent failures`,
            });
          }
        }
      }
    }

    return annotations;
  }

  // --------------------------------------------------------------------------
  // Summary Generation
  // --------------------------------------------------------------------------

  private generateSummary(results: PhaseResult[]): string {
    const lines: string[] = ['## 🧪 Test Results\n'];

    // Overall status
    const allPassed = results.every((r) => r.success);
    lines.push(allPassed ? '✅ **All phases passed**\n' : '❌ **Some phases failed**\n');

    // Phase table
    lines.push('| Phase | Status | Pass Rate | Duration | Tests |');
    lines.push('|-------|--------|-----------|----------|-------|');

    for (const phase of results) {
      const status = phase.success ? '✅' : '❌';
      const passRate = `${(phase.passRate * 100).toFixed(1)}%`;
      const duration = this.formatDuration(phase.durationMs);
      const tests = `${phase.passed}/${phase.totalTests}`;

      lines.push(`| ${phase.phaseName} | ${status} | ${passRate} | ${duration} | ${tests} |`);
    }

    lines.push('');

    // Coverage section
    if (this.config.includeCoverage) {
      lines.push('### 📊 Coverage\n');
      for (const phase of results) {
        const coverage = `${(phase.coverage * 100).toFixed(1)}%`;
        const bar = this.generateCoverageBar(phase.coverage);
        lines.push(`- **${phase.phaseName}**: ${bar} ${coverage}`);
      }
      lines.push('');
    }

    // Failed tests section
    const failedTests = results.flatMap((r) =>
      r.testResults.filter((t) => !t.passed)
    );

    if (failedTests.length > 0) {
      lines.push('### ❌ Failed Tests\n');
      lines.push('<details>');
      lines.push('<summary>Click to expand</summary>\n');

      for (const test of failedTests.slice(0, 20)) {
        lines.push(`#### ${test.suite} > ${test.name}`);
        lines.push(`- **File**: \`${test.file}\``);
        if (test.error) {
          lines.push('```');
          lines.push(test.error.slice(0, 500));
          lines.push('```');
        }
        lines.push('');
      }

      if (failedTests.length > 20) {
        lines.push(`_... and ${failedTests.length - 20} more failures_`);
      }

      lines.push('</details>\n');
    }

    // Flaky tests section
    const flakyTests = results.flatMap((r) => r.flakyTests);
    if (flakyTests.length > 0 && this.config.includeFlakyWarnings) {
      lines.push('### ⚠️ Flaky Tests\n');
      for (const test of flakyTests.slice(0, 10)) {
        lines.push(`- \`${test}\``);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // Output Variables
  // --------------------------------------------------------------------------

  private generateOutputs(results: PhaseResult[]): Record<string, string> {
    const totalTests = results.reduce((sum, r) => sum + r.totalTests, 0);
    const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const allPassed = results.every((r) => r.success);

    const avgCoverage =
      results.length > 0
        ? results.reduce((sum, r) => sum + r.coverage, 0) / results.length
        : 0;

    return {
      test_result: allPassed ? 'success' : 'failure',
      total_tests: String(totalTests),
      passed_tests: String(totalPassed),
      failed_tests: String(totalFailed),
      coverage_percent: String((avgCoverage * 100).toFixed(1)),
      phases_completed: String(results.length),
      phases_passed: String(results.filter((r) => r.success).length),
      has_flaky_tests: String(results.some((r) => r.flakyTests.length > 0)),
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private writeAnnotation(annotation: GitHubAnnotation): void {
    const params = [
      `file=${annotation.file}`,
      `line=${annotation.line}`,
      `title=${annotation.title}`,
    ].join(',');

    // GitHub Actions workflow command format
    console.log(`::${annotation.level} ${params}::${annotation.message}`);
  }

  private extractLineNumber(stack?: string): number | undefined {
    if (!stack) return undefined;

    // Try to extract line number from stack trace
    const match = stack.match(/:(\d+):\d+/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  private generateCoverageBar(coverage: number): string {
    const filled = Math.round(coverage * 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a GitHub Actions reporter
 */
export function createGitHubActionsReporter(
  config?: Partial<GitHubActionsConfig>
): GitHubActionsReporter {
  return new GitHubActionsReporter(config);
}

/**
 * Quick function to report results to GitHub Actions
 */
export async function reportToGitHubActions(
  results: PhaseResult[],
  config?: Partial<GitHubActionsConfig>
): Promise<void> {
  const reporter = createGitHubActionsReporter(config);
  await reporter.writeOutput(results);
}
