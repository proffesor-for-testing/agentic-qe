#!/usr/bin/env npx tsx
/**
 * SFDIPOT Assessment Validator
 *
 * Validates that Product Factors assessment HTML output passes quality gates.
 *
 * PHILOSOPHY: Priority percentages are INFORMATIONAL, not gates.
 * Domain experts should determine priorities, not arbitrary percentages.
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
  isHard: boolean; // Hard gates fail validation; soft gates are informational
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

  // ============================================
  // HARD GATES - These actually fail validation
  // ============================================

  // Gate 7: NO "Verify X" patterns (HARD REQUIREMENT)
  const gate7 = metrics.verifyCount === 0;
  results.push({
    gate: 'Gate 7: NO "Verify X" patterns',
    passed: gate7,
    expected: '0',
    actual: String(metrics.verifyCount),
    details: gate7 ? undefined : `Found ${metrics.verifyCount} test ideas starting with "Verify"`,
    isHard: true,
  });

  // Gate 5: Human >= 10% (HARD REQUIREMENT)
  const total = metrics.totalTests || 1;
  const humanPct = (metrics.humanCount / total) * 100;
  const gate5 = humanPct >= 10;
  results.push({
    gate: 'Gate 5: Human >= 10%',
    passed: gate5,
    expected: '≥10%',
    actual: `${humanPct.toFixed(1)}% (${metrics.humanCount}/${total})`,
    details: gate5 ? undefined : `Human tests are ${(10 - humanPct).toFixed(1)}% under minimum`,
    isHard: true,
  });

  // Gate 10a: Human tests have reasoning (HARD)
  const gate10a = metrics.humanCount === 0 || metrics.humanWithReason >= metrics.humanCount * 0.9;
  results.push({
    gate: 'Gate 10a: Human tests have "Why Human Essential" reasoning',
    passed: gate10a,
    expected: `${metrics.humanCount} (all human tests)`,
    actual: `${metrics.humanWithReason}`,
    details: gate10a ? undefined : `${metrics.humanCount - metrics.humanWithReason} human tests missing reasoning`,
    isHard: true,
  });

  // Gate 10b: Human tests use "Explore X; assess Y" format (HARD)
  const gate10b = metrics.humanCount === 0 || metrics.humanWithExplore >= metrics.humanCount * 0.8;
  results.push({
    gate: 'Gate 10b: Human test ideas use "Explore X; assess Y" format',
    passed: gate10b,
    expected: `≥${Math.floor(metrics.humanCount * 0.8)} (80% of human tests)`,
    actual: `${metrics.humanWithExplore}`,
    details: gate10b ? undefined : `Only ${metrics.humanWithExplore} of ${metrics.humanCount} human tests use proper format`,
    isHard: true,
  });

  // Gate 6: Minimum test count (HARD)
  const gate6 = metrics.totalTests >= 50;
  results.push({
    gate: 'Gate 6: Minimum 50 test ideas',
    passed: gate6,
    expected: '≥50',
    actual: `${metrics.totalTests}`,
    details: gate6 ? undefined : `Only ${metrics.totalTests} tests generated`,
    isHard: true,
  });

  // ============================================
  // SOFT GATES - Informational only, for SME review
  // Priority distribution is domain-specific, not a universal rule
  // ============================================

  const p0Pct = (metrics.p0Count / total) * 100;
  const p1Pct = (metrics.p1Count / total) * 100;
  const p2Pct = (metrics.p2Count / total) * 100;
  const p3Pct = (metrics.p3Count / total) * 100;

  // Info: P0 distribution (NOT a hard gate)
  results.push({
    gate: 'Info: P0 (Critical) distribution',
    passed: true, // Always passes - informational only
    expected: 'SME to review',
    actual: `${p0Pct.toFixed(1)}% (${metrics.p0Count}/${total})`,
    details: 'Domain expert should validate P0 assignments based on business context',
    isHard: false,
  });

  // Info: P1 distribution (NOT a hard gate)
  results.push({
    gate: 'Info: P1 (High) distribution',
    passed: true,
    expected: 'SME to review',
    actual: `${p1Pct.toFixed(1)}% (${metrics.p1Count}/${total})`,
    details: 'Domain expert should validate P1 assignments based on business context',
    isHard: false,
  });

  // Info: P2 distribution (NOT a hard gate)
  results.push({
    gate: 'Info: P2 (Medium) distribution',
    passed: true,
    expected: 'SME to review',
    actual: `${p2Pct.toFixed(1)}% (${metrics.p2Count}/${total})`,
    details: 'Domain expert should validate P2 assignments based on business context',
    isHard: false,
  });

  // Info: P3 distribution (NOT a hard gate)
  results.push({
    gate: 'Info: P3 (Low) distribution',
    passed: true,
    expected: 'SME to review',
    actual: `${p3Pct.toFixed(1)}% (${metrics.p3Count}/${total})`,
    details: 'Domain expert should validate P3 assignments based on business context',
    isHard: false,
  });

  // Only hard gates determine pass/fail
  const allPassed = results.filter(r => r.isHard).every(r => r.passed);
  return { passed: allPassed, results };
}

function printResults(filePath: string, validation: { passed: boolean; results: ValidationResult[] }): void {
  const fileName = path.basename(filePath);

  console.log('\n' + '='.repeat(70));
  console.log(`SFDIPOT Assessment Validation: ${fileName}`);
  console.log('='.repeat(70));

  // Print hard gates first
  console.log('\n--- HARD GATES (Must Pass) ---');
  for (const result of validation.results.filter(r => r.isHard)) {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} | ${result.gate}`);
    console.log(`       Expected: ${result.expected}`);
    console.log(`       Actual:   ${result.actual}`);
    if (result.details && !result.passed) {
      console.log(`       Details:  ${result.details}`);
    }
  }

  // Print soft gates (informational)
  console.log('\n--- PRIORITY DISTRIBUTION (For SME Review) ---');
  for (const result of validation.results.filter(r => !r.isHard)) {
    console.log(`\n📊 INFO | ${result.gate}`);
    console.log(`       Value:    ${result.actual}`);
    console.log(`       Note:     ${result.details}`);
  }

  console.log('\n' + '-'.repeat(70));
  const hardGates = validation.results.filter(r => r.isHard);
  const passCount = hardGates.filter(r => r.passed).length;
  const totalGates = hardGates.length;

  if (validation.passed) {
    console.log(`✅ ALL HARD GATES PASSED (${passCount}/${totalGates})`);
    console.log(`⚠️  Priority distribution requires Domain Expert/SME review`);
  } else {
    console.log(`❌ VALIDATION FAILED (${passCount}/${totalGates} hard gates passed)`);
    const failedGates = hardGates.filter(r => !r.passed).map(r => r.gate);
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
