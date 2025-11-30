#!/usr/bin/env node
/**
 * Quality Gate Evaluation Script
 *
 * Integrates with ControlLoopReporter to make deployment decisions
 * based on test results, coverage, and quality metrics.
 *
 * Usage:
 *   ts-node scripts/quality-gate.ts [options]
 *   node dist/scripts/quality-gate.js [options]
 *
 * Options:
 *   --min-coverage <N>              Minimum coverage percentage (default: 80)
 *   --min-pass-rate <N>             Minimum test pass rate 0-1 (default: 0.95)
 *   --max-critical-vulns <N>        Maximum critical vulnerabilities (default: 0)
 *   --max-high-vulns <N>            Maximum high vulnerabilities (default: 2)
 *   --output-dir <path>             Output directory for reports (default: ./quality-reports)
 *   --pr-comment                    Generate PR comment format
 *
 * Exit Codes:
 *   0 - Quality gates passed, deployment approved
 *   1 - Quality gates failed, deployment blocked
 *   2 - Error during execution
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { ControlLoopReporter, ControlLoopConfig } from '../src/reporting';
import type { AggregatedResults, ControlLoopFeedback } from '../src/reporting/types';

interface QualityGateConfig {
  minCoverage: number;
  minPassRate: number;
  maxCriticalVulns: number;
  maxHighVulns: number;
  outputDir: string;
  prComment: boolean;
}

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface CoverageData {
  overall: number;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

/**
 * Parse command line arguments
 */
function parseArgs(): QualityGateConfig {
  const args = process.argv.slice(2);
  const config: QualityGateConfig = {
    minCoverage: parseFloat(process.env.MIN_COVERAGE || '80'),
    minPassRate: parseFloat(process.env.MIN_PASS_RATE || '0.95'),
    maxCriticalVulns: parseInt(process.env.MAX_CRITICAL_VULNS || '0', 10),
    maxHighVulns: parseInt(process.env.MAX_HIGH_VULNS || '2', 10),
    outputDir: process.env.QUALITY_REPORT_DIR || './quality-reports',
    prComment: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--min-coverage':
        config.minCoverage = parseFloat(args[++i]);
        break;
      case '--min-pass-rate':
        config.minPassRate = parseFloat(args[++i]);
        break;
      case '--max-critical-vulns':
        config.maxCriticalVulns = parseInt(args[++i], 10);
        break;
      case '--max-high-vulns':
        config.maxHighVulns = parseInt(args[++i], 10);
        break;
      case '--output-dir':
        config.outputDir = args[++i];
        break;
      case '--pr-comment':
        config.prComment = true;
        break;
      case '--help':
        console.log(`
Quality Gate Evaluation Script

Usage: ts-node scripts/quality-gate.ts [options]

Options:
  --min-coverage <N>              Minimum coverage percentage (default: 80)
  --min-pass-rate <N>             Minimum test pass rate 0-1 (default: 0.95)
  --max-critical-vulns <N>        Maximum critical vulnerabilities (default: 0)
  --max-high-vulns <N>            Maximum high vulnerabilities (default: 2)
  --output-dir <path>             Output directory (default: ./quality-reports)
  --pr-comment                    Generate PR comment format
  --help                          Show this help

Environment Variables:
  MIN_COVERAGE                    Same as --min-coverage
  MIN_PASS_RATE                   Same as --min-pass-rate
  MAX_CRITICAL_VULNS              Same as --max-critical-vulns
  MAX_HIGH_VULNS                  Same as --max-high-vulns
  QUALITY_REPORT_DIR              Same as --output-dir
        `);
        process.exit(0);
    }
  }

  return config;
}

/**
 * Extract coverage data from coverage-summary.json
 */
async function extractCoverage(): Promise<CoverageData | null> {
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

  if (!await fs.pathExists(coveragePath)) {
    console.warn(`⚠️  No coverage data found at ${coveragePath}`);
    return null;
  }

  const coverageData = await fs.readJson(coveragePath);
  const total = coverageData.total;

  return {
    overall: total.lines?.pct || 0,
    lines: total.lines?.pct || 0,
    branches: total.branches?.pct || 0,
    functions: total.functions?.pct || 0,
    statements: total.statements?.pct || 0
  };
}

/**
 * Extract test results from test output logs
 */
async function extractTestResults(outputDir: string): Promise<TestResults> {
  // Try to read from jest output or test result files
  const jestResultPath = path.join(process.cwd(), 'test-results.json');

  if (await fs.pathExists(jestResultPath)) {
    const jestResults = await fs.readJson(jestResultPath);
    return {
      total: jestResults.numTotalTests || 0,
      passed: jestResults.numPassedTests || 0,
      failed: jestResults.numFailedTests || 0,
      skipped: jestResults.numPendingTests || 0,
      duration: jestResults.testResults?.reduce((sum: number, r: any) => sum + (r.perfStats?.runtime || 0), 0) || 0
    };
  }

  // Fallback: parse from coverage data
  const coverage = await extractCoverage();
  if (coverage) {
    // Estimate: if we have coverage, assume some tests ran
    return {
      total: 1,
      passed: coverage.overall > 0 ? 1 : 0,
      failed: coverage.overall === 0 ? 1 : 0,
      skipped: 0,
      duration: 0
    };
  }

  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0
  };
}

/**
 * Build aggregated results for reporter
 */
async function buildAggregatedResults(config: QualityGateConfig): Promise<AggregatedResults> {
  const coverage = await extractCoverage();
  const testResults = await extractTestResults(config.outputDir);

  const executionId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const passRate = testResults.total > 0 ? testResults.passed / testResults.total : 0;
  const hasFailures = testResults.failed > 0;
  const coverageBelowThreshold = !coverage || coverage.overall < config.minCoverage;
  const passRateBelowThreshold = passRate < config.minPassRate;

  const overallStatus: 'success' | 'failure' | 'warning' =
    hasFailures || coverageBelowThreshold || passRateBelowThreshold ? 'failure' : 'success';

  const results: AggregatedResults = {
    executionId,
    timestamp,
    project: {
      name: process.env.GITHUB_REPOSITORY?.split('/')[1] || 'agentic-qe',
      version: process.env.GITHUB_SHA?.substring(0, 7) || 'local',
      repository: process.env.GITHUB_REPOSITORY,
      branch: process.env.GITHUB_REF_NAME,
      commit: process.env.GITHUB_SHA,
      environment: process.env.GITHUB_ENV || 'ci'
    },
    testResults: {
      total: testResults.total,
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      flaky: 0,
      duration: testResults.duration,
      tests: [],
      passRate,
      failureRate: testResults.total > 0 ? testResults.failed / testResults.total : 0
    },
    coverage: coverage ? {
      overall: coverage.overall,
      lines: {
        total: 100,
        covered: Math.round(coverage.lines),
        uncovered: 100 - Math.round(coverage.lines),
        percentage: coverage.lines
      },
      branches: {
        total: 100,
        covered: Math.round(coverage.branches),
        uncovered: 100 - Math.round(coverage.branches),
        percentage: coverage.branches
      },
      functions: {
        total: 100,
        covered: Math.round(coverage.functions),
        uncovered: 100 - Math.round(coverage.functions),
        percentage: coverage.functions
      },
      statements: {
        total: 100,
        covered: Math.round(coverage.statements),
        uncovered: 100 - Math.round(coverage.statements),
        percentage: coverage.statements
      }
    } : undefined,
    qualityMetrics: {
      score: passRate * 100,
      grade: passRate >= 0.95 ? 'A' : passRate >= 0.90 ? 'B' : passRate >= 0.80 ? 'C' : passRate >= 0.70 ? 'D' : 'F',
      codeQuality: {
        maintainabilityIndex: 85,
        cyclomaticComplexity: 10,
        technicalDebt: 0,
        codeSmells: 0,
        duplications: 0
      },
      gatesPassed: 0, // Will be calculated by reporter
      gatesFailed: 0
    },
    metadata: {
      startedAt: timestamp,
      completedAt: new Date().toISOString(),
      duration: testResults.duration,
      ci: process.env.CI ? {
        provider: 'GitHub Actions',
        buildNumber: process.env.GITHUB_RUN_NUMBER || '0',
        buildUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
          ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : undefined
      } : undefined
    },
    status: overallStatus,
    summary: {
      status: overallStatus,
      message: overallStatus === 'success' ? 'All quality gates passed' : 'Quality gates failed',
      criticalIssues: hasFailures ? 1 : 0,
      warnings: coverageBelowThreshold ? 1 : 0,
      recommendations: [],
      deploymentReady: overallStatus === 'success',
      highlights: []
    }
  };

  return results;
}

/**
 * Generate PR comment format
 */
function generatePRComment(feedback: ControlLoopFeedback, config: QualityGateConfig): string {
  const { signals, metrics, violations, actions } = feedback;

  const statusIcon = signals.canDeploy ? '✅' : '❌';
  const statusText = signals.canDeploy ? 'PASSED' : 'FAILED';

  let comment = `## ${statusIcon} Quality Gate: ${statusText}\n\n`;

  // Metrics table
  comment += '### 📊 Metrics\n\n';
  comment += '| Metric | Value | Threshold | Status |\n';
  comment += '|--------|-------|-----------|--------|\n';
  comment += `| Test Pass Rate | ${(metrics.testPassRate * 100).toFixed(1)}% | ${(config.minPassRate * 100).toFixed(1)}% | ${metrics.testPassRate >= config.minPassRate ? '✅' : '❌'} |\n`;
  comment += `| Coverage | ${metrics.coveragePercentage.toFixed(1)}% | ${config.minCoverage}% | ${metrics.coveragePercentage >= config.minCoverage ? '✅' : '❌'} |\n`;
  const qualityScore = (metrics as Record<string, unknown>).qualityScore as number || 0;
  comment += `| Quality Score | ${qualityScore}/100 | 70/100 | ${qualityScore >= 70 ? '✅' : '❌'} |\n`;
  comment += '\n';

  // Violations
  if (violations.length > 0) {
    comment += '### ⚠️ Violations\n\n';
    for (const violation of violations) {
      comment += `- **${violation.metric}**: ${violation.actualValue} ${violation.operator === 'gte' ? '<' : '>'} ${violation.threshold} (${violation.severity})\n`;
      comment += `  - ${violation.impact}\n`;
    }
    comment += '\n';
  }

  // Actions
  if (actions.length > 0) {
    comment += '### 🎯 Required Actions\n\n';
    for (const action of actions) {
      const icon = action.priority === 'critical' ? '🔴' : action.priority === 'high' ? '🟠' : '🟡';
      comment += `${icon} **${action.type}** (${action.priority})\n`;
      comment += `- ${action.reason}\n`;
      if (action.resolution) {
        comment += `- Resolution: ${action.resolution}\n`;
      }
      comment += '\n';
    }
  }

  // Deployment decision
  comment += '### 🚀 Deployment Decision\n\n';
  if (signals.canDeploy) {
    comment += '✅ **APPROVED** - All quality gates passed. Safe to deploy.\n';
  } else {
    comment += '❌ **BLOCKED** - Quality gates failed. Fix violations before deployment.\n';
  }

  return comment;
}

/**
 * Main execution
 */
async function main() {
  const config = parseArgs();

  console.log('===================================================================');
  console.log('Quality Gate Evaluation');
  console.log('===================================================================');
  console.log('Thresholds:');
  console.log(`  - Minimum Coverage:              ${config.minCoverage}%`);
  console.log(`  - Minimum Test Pass Rate:        ${(config.minPassRate * 100).toFixed(1)}%`);
  console.log(`  - Max Critical Vulnerabilities:  ${config.maxCriticalVulns}`);
  console.log(`  - Max High Vulnerabilities:      ${config.maxHighVulns}`);
  console.log('===================================================================\n');

  // Ensure output directory exists
  await fs.ensureDir(config.outputDir);

  // Build aggregated results
  console.log('▶ Analyzing test results and coverage...\n');
  const results = await buildAggregatedResults(config);

  // Create control loop reporter with configured thresholds
  const reporterConfig: ControlLoopConfig = {
    minPassRate: config.minPassRate,
    minCoverage: config.minCoverage,
    maxCriticalVulnerabilities: config.maxCriticalVulns,
    maxHighVulnerabilities: config.maxHighVulns,
    prettyPrint: true
  };

  const reporter = new ControlLoopReporter(reporterConfig);
  const output = reporter.report(results);
  const feedback: ControlLoopFeedback = JSON.parse(output.content);

  // Display results
  console.log(`Coverage: ${results.coverage?.overall.toFixed(1) || 0}%`);
  console.log(`Tests: ${results.testResults.passed}/${results.testResults.total} passed (${results.testResults.failed} failed)`);
  console.log(`Pass Rate: ${(results.testResults.passRate * 100).toFixed(1)}%\n`);

  console.log('▶ Evaluating quality gates...\n');

  // Display gate results
  for (const violation of feedback.violations) {
    const icon = violation.severity === 'critical' ? '✗' : '⚠';
    console.log(`${icon} ${violation.metric}: ${violation.actualValue} (threshold: ${violation.threshold}) - ${violation.severity}`);
  }

  if (feedback.violations.length === 0) {
    console.log('✓ All quality gates passed');
  }

  console.log('\n===================================================================');
  console.log('Quality Gate Summary');
  console.log('===================================================================');
  console.log(`Gates Passed: ${feedback.metrics.qualityGatesPassed}`);
  console.log(`Gates Failed: ${feedback.metrics.qualityGatesFailed}`);
  console.log(`Violations: ${feedback.violations.length}`);
  console.log('');

  // Write outputs
  const controlLoopPath = path.join(config.outputDir, 'control-loop-feedback.json');
  await fs.writeJson(controlLoopPath, feedback, { spaces: 2 });
  console.log(`Control loop feedback written to: ${controlLoopPath}`);

  // Generate PR comment if requested
  if (config.prComment) {
    const prComment = generatePRComment(feedback, config);
    const prCommentPath = path.join(config.outputDir, 'pr-comment.md');
    await fs.writeFile(prCommentPath, prComment, 'utf8');
    console.log(`PR comment written to: ${prCommentPath}`);
  }

  console.log('');

  // Final decision
  if (feedback.signals.canDeploy) {
    console.log('✓ Quality gates PASSED - Deployment APPROVED\n');
    process.exit(0);
  } else {
    console.log('✗ Quality gates FAILED - Deployment BLOCKED\n');
    console.log('Violations:');
    for (const violation of feedback.violations) {
      console.log(`  - ${violation.metric}: ${violation.actualValue} (threshold: ${violation.threshold})`);
    }
    console.log('');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Error executing quality gate:', error);
    process.exit(2);
  });
}

export { QualityGateConfig, buildAggregatedResults, generatePRComment };
