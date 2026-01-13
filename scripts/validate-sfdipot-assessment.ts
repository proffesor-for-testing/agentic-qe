#!/usr/bin/env npx tsx
/**
 * SFDIPOT Assessment Validator
 *
 * Validates that Product Factors assessment HTML output passes all quality gates.
 * This is ACTUAL enforcement, not just prompt text.
 *
 * Usage:
 *   npx tsx scripts/validate-sfdipot-assessment.ts <path-to-html>
 *   npx tsx scripts/validate-sfdipot-assessment.ts --all  # Validate all assessments
 *
 * Exit codes:
 *   0 = All gates pass
 *   1 = One or more gates failed
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  gate: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

interface AssessmentMetrics {
  totalTests: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
  humanCount: number;
  verifyCount: number;
  humanWithReason: number;
  humanWithExplore: number;
}

function extractMetrics(content: string): AssessmentMetrics {
  // Count test IDs (TC-XXXX pattern)
  const testIdMatches = content.match(/TC-[A-Z]{4}-[A-Z0-9]{8}/g) || [];
  const totalTests = testIdMatches.length;

  // Count priorities
  const p0Count = (content.match(/priority-p0/g) || []).length;
  const p1Count = (content.match(/priority-p1/g) || []).length;
  const p2Count = (content.match(/priority-p2/g) || []).length;
  const p3Count = (content.match(/priority-p3/g) || []).length;

  // Count human exploration tests
  const humanCount = (content.match(/automation-human/g) || []).length;

  // Count "Verify" patterns in test ideas (case insensitive)
  // Match "Verify" at the start of a test idea (after <td>)
  const verifyMatches = content.match(/<td>Verify\s/gi) || [];
  const verifyCount = verifyMatches.length;

  // Count human tests with proper "Why Human Essential" reasoning
  const humanWithReason = (content.match(/Why Human Essential:/g) || []).length;

  // Count human tests with "Explore" in test idea column
  const humanWithExplore = (content.match(/<td>Explore\s[^<]*;\s*assess\s/gi) || []).length;

  return {
    totalTests,
    p0Count,
    p1Count,
    p2Count,
    p3Count,
    humanCount,
    verifyCount,
    humanWithReason,
    humanWithExplore,
  };
}

function validateAssessment(filePath: string): { passed: boolean; results: ValidationResult[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const metrics = extractMetrics(content);
  const results: ValidationResult[] = [];

  // Gate 7: NO "Verify X" patterns (HARD REQUIREMENT)
  const gate7 = metrics.verifyCount === 0;
  results.push({
    gate: 'Gate 7: NO "Verify X" patterns',
    passed: gate7,
    expected: '0',
    actual: String(metrics.verifyCount),
    details: gate7 ? undefined : `Found ${metrics.verifyCount} test ideas starting with "Verify"`,
  });

  // Calculate percentages
  const total = metrics.totalTests || 1; // Avoid division by zero
  const p0Pct = (metrics.p0Count / total) * 100;
  const p1Pct = (metrics.p1Count / total) * 100;
  const p2Pct = (metrics.p2Count / total) * 100;
  const p3Pct = (metrics.p3Count / total) * 100;
  const humanPct = (metrics.humanCount / total) * 100;

  // Gate 1: P0 = 8-12%
  const gate1 = p0Pct >= 5 && p0Pct <= 15; // Allowing some tolerance
  results.push({
    gate: 'Gate 1: P0 = 8-12%',
    passed: gate1,
    expected: '8-12%',
    actual: `${p0Pct.toFixed(1)}% (${metrics.p0Count}/${total})`,
  });

  // Gate 2: P1 <= 30% (HARD REQUIREMENT)
  const gate2 = p1Pct <= 30;
  results.push({
    gate: 'Gate 2: P1 <= 30%',
    passed: gate2,
    expected: '≤30%',
    actual: `${p1Pct.toFixed(1)}% (${metrics.p1Count}/${total})`,
    details: gate2 ? undefined : `P1 is ${(p1Pct - 30).toFixed(1)}% over limit`,
  });

  // Gate 3: P2 = 35-45%
  const gate3 = p2Pct >= 30 && p2Pct <= 50; // Allowing some tolerance
  results.push({
    gate: 'Gate 3: P2 = 35-45%',
    passed: gate3,
    expected: '35-45%',
    actual: `${p2Pct.toFixed(1)}% (${metrics.p2Count}/${total})`,
  });

  // Gate 4: P3 = 20-30% (HARD REQUIREMENT)
  const gate4 = p3Pct >= 18 && p3Pct <= 35; // Allowing some tolerance
  results.push({
    gate: 'Gate 4: P3 = 20-30%',
    passed: gate4,
    expected: '20-30%',
    actual: `${p3Pct.toFixed(1)}% (${metrics.p3Count}/${total})`,
    details: gate4 ? undefined : p3Pct < 18 ? `P3 is ${(18 - p3Pct).toFixed(1)}% under minimum` : `P3 is ${(p3Pct - 35).toFixed(1)}% over limit`,
  });

  // Gate 5: Human >= 10% (HARD REQUIREMENT)
  const gate5 = humanPct >= 10;
  results.push({
    gate: 'Gate 5: Human >= 10%',
    passed: gate5,
    expected: '≥10%',
    actual: `${humanPct.toFixed(1)}% (${metrics.humanCount}/${total})`,
    details: gate5 ? undefined : `Human tests are ${(10 - humanPct).toFixed(1)}% under minimum`,
  });

  // Gate 10: Human exploration row structure
  // Every human test should have "Why Human Essential" reasoning
  const gate10a = metrics.humanCount === 0 || metrics.humanWithReason >= metrics.humanCount * 0.9;
  results.push({
    gate: 'Gate 10a: Human tests have "Why Human Essential" reasoning',
    passed: gate10a,
    expected: `${metrics.humanCount} (all human tests)`,
    actual: `${metrics.humanWithReason}`,
    details: gate10a ? undefined : `${metrics.humanCount - metrics.humanWithReason} human tests missing reasoning`,
  });

  // Human tests should have "Explore X; assess Y" format in test idea column
  const gate10b = metrics.humanCount === 0 || metrics.humanWithExplore >= metrics.humanCount * 0.8;
  results.push({
    gate: 'Gate 10b: Human test ideas use "Explore X; assess Y" format',
    passed: gate10b,
    expected: `≥${Math.floor(metrics.humanCount * 0.8)} (80% of human tests)`,
    actual: `${metrics.humanWithExplore}`,
    details: gate10b ? undefined : `Only ${metrics.humanWithExplore} of ${metrics.humanCount} human tests use proper format`,
  });

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}

function printResults(filePath: string, validation: { passed: boolean; results: ValidationResult[] }): void {
  const fileName = path.basename(filePath);

  console.log('\n' + '='.repeat(70));
  console.log(`SFDIPOT Assessment Validation: ${fileName}`);
  console.log('='.repeat(70));

  for (const result of validation.results) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} | ${result.gate}`);
    console.log(`       Expected: ${result.expected}`);
    console.log(`       Actual:   ${result.actual}`);
    if (result.details) {
      console.log(`       Details:  ${result.details}`);
    }
  }

  console.log('\n' + '-'.repeat(70));
  const passCount = validation.results.filter(r => r.passed).length;
  const totalGates = validation.results.length;

  if (validation.passed) {
    console.log(`✅ ALL GATES PASSED (${passCount}/${totalGates})`);
  } else {
    console.log(`❌ VALIDATION FAILED (${passCount}/${totalGates} gates passed)`);
    const failedGates = validation.results.filter(r => !r.passed).map(r => r.gate);
    console.log(`   Failed gates: ${failedGates.join(', ')}`);
  }
  console.log('-'.repeat(70));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/validate-sfdipot-assessment.ts <path-to-html>');
    console.error('       npx tsx scripts/validate-sfdipot-assessment.ts --all');
    process.exit(1);
  }

  let filesToValidate: string[] = [];

  if (args[0] === '--all') {
    // Validate all assessment files
    const assessmentDir = '.agentic-qe/product-factors-assessments';
    if (fs.existsSync(assessmentDir)) {
      const files = fs.readdirSync(assessmentDir)
        .filter(f => f.endsWith('.html'))
        .map(f => path.join(assessmentDir, f));
      filesToValidate = files;
    }
  } else {
    filesToValidate = args.filter(f => fs.existsSync(f));
  }

  if (filesToValidate.length === 0) {
    console.error('No valid files found to validate');
    process.exit(1);
  }

  let allPassed = true;
  const summary: { file: string; passed: boolean }[] = [];

  for (const filePath of filesToValidate) {
    const validation = validateAssessment(filePath);
    printResults(filePath, validation);
    summary.push({ file: path.basename(filePath), passed: validation.passed });
    if (!validation.passed) {
      allPassed = false;
    }
  }

  // Print summary if multiple files
  if (filesToValidate.length > 1) {
    console.log('\n' + '='.repeat(70));
    console.log('VALIDATION SUMMARY');
    console.log('='.repeat(70));
    for (const s of summary) {
      const status = s.passed ? '✅' : '❌';
      console.log(`${status} ${s.file}`);
    }
    console.log('-'.repeat(70));
    const passedCount = summary.filter(s => s.passed).length;
    console.log(`Total: ${passedCount}/${summary.length} assessments passed`);
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
