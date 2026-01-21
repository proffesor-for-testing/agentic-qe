#!/usr/bin/env ts-node
/**
 * Parse Test Results from Jest Output
 * Extracts metrics for validation checkpoints
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestResults {
  passRate: number;
  passing: number;
  failing: number;
  total: number;
  skipped: number;
  pending: number;
}

export function parseJestOutput(output: string): TestResults {
  const lines = output.split('\n');

  let passing = 0;
  let failing = 0;
  let skipped = 0;
  let pending = 0;
  let total = 0;

  // Parse test counts from Jest summary
  const testSummaryRegex = /Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/;

  for (const line of lines) {
    const match = line.match(testSummaryRegex);
    if (match) {
      failing = match[1] ? parseInt(match[1], 10) : 0;
      skipped = match[2] ? parseInt(match[2], 10) : 0;
      passing = match[3] ? parseInt(match[3], 10) : 0;
      total = parseInt(match[4], 10);
      break;
    }
  }

  // If not found in summary, count from test suite results
  if (total === 0) {
    const passRegex = /PASS\s+tests\//g;
    const failRegex = /FAIL\s+tests\//g;

    passing = (output.match(passRegex) || []).length;
    failing = (output.match(failRegex) || []).length;
    total = passing + failing;
  }

  const passRate = total > 0 ? (passing / total) * 100 : 0;

  return {
    passRate,
    passing,
    failing,
    total,
    skipped,
    pending
  };
}

export function parseCoverageJson(coveragePath: string): number {
  try {
    if (!fs.existsSync(coveragePath)) {
      console.warn(`Coverage file not found: ${coveragePath}`);
      return 0;
    }

    const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
    const totalCoverage = coverageData.total;

    if (!totalCoverage) {
      return 0;
    }

    // Calculate average coverage across all metrics
    const avgCoverage = (
      (totalCoverage.lines?.pct || 0) +
      (totalCoverage.statements?.pct || 0) +
      (totalCoverage.functions?.pct || 0) +
      (totalCoverage.branches?.pct || 0)
    ) / 4;

    return avgCoverage;
  } catch (error) {
    console.error('Error parsing coverage:', error);
    return 0;
  }
}

// Main execution for CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: ts-node parse-test-results.ts <log-file>');
    process.exit(1);
  }

  const logFile = args[0];

  if (!fs.existsSync(logFile)) {
    console.error(`Log file not found: ${logFile}`);
    process.exit(1);
  }

  const output = fs.readFileSync(logFile, 'utf-8');
  const results = parseJestOutput(output);

  console.log('Test Results:');
  console.log(`  Pass Rate: ${results.passRate.toFixed(2)}%`);
  console.log(`  Passing: ${results.passing}`);
  console.log(`  Failing: ${results.failing}`);
  console.log(`  Total: ${results.total}`);
  console.log(`  Skipped: ${results.skipped}`);

  // Parse coverage if available
  const coveragePath = path.join(process.cwd(), 'coverage/coverage-summary.json');
  const coverage = parseCoverageJson(coveragePath);

  if (coverage > 0) {
    console.log(`\nCoverage: ${coverage.toFixed(2)}%`);
  }
}
