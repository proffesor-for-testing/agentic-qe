/**
 * SFDIPOT Assessment Validator Unit Tests
 *
 * Tests the validation script that enforces quality gates on
 * Product Factors assessment HTML output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_DIR = join(__dirname, '../../../.test-tmp/sfdipot-validation');
const SCRIPT_PATH = 'scripts/validate-sfdipot-assessment.ts';

/**
 * Generate a test assessment HTML file
 *
 * The validation script checks:
 * - Gate 5: automation-human class count vs total
 * - Gate 6: TC-XXXX-XXXXXXXX pattern count
 * - Gate 7: <td>Verify pattern count
 * - Gate 10a: "Why Human Essential:" text count
 * - Gate 10b: <td>Explore X; assess Y pattern
 */
function generateTestAssessment(options: {
  testCount: number;
  p0Percent?: number;
  p1Percent?: number;
  p2Percent?: number;
  p3Percent?: number;
  humanPercent?: number;
  verifyPatterns?: number;
  humanWithReason?: number;
  humanWithExplore?: number;
}): string {
  const {
    testCount,
    p0Percent = 10,
    p1Percent = 30,
    p2Percent = 40,
    p3Percent = 20,
    humanPercent = 15,
    verifyPatterns = 0,
  } = options;

  const p0Count = Math.floor(testCount * (p0Percent / 100));
  const p1Count = Math.floor(testCount * (p1Percent / 100));
  const p2Count = Math.floor(testCount * (p2Percent / 100));
  const p3Count = Math.max(0, testCount - p0Count - p1Count - p2Count - verifyPatterns);

  // Human tests distributed across priorities
  const humanCount = Math.floor(testCount * (humanPercent / 100));

  // Default: all human tests have proper formatting
  const reasonCount = options.humanWithReason ?? humanCount;
  const exploreCount = options.humanWithExplore ?? humanCount;

  const rows: string[] = [];
  let humanIndex = 0;

  // Helper to generate a test row
  const addTest = (testId: string, priority: string, isHuman: boolean, idx: number) => {
    const automationType = isHuman ? 'automation-human' : 'automation-automated';

    let description: string;
    let reason = '';

    if (isHuman) {
      // Human test - use "Explore X; assess Y" format if within exploreCount
      if (humanIndex < exploreCount) {
        description = `Explore authentication flow; assess user experience under various scenarios`;
      } else {
        description = `Manually test edge case scenario ${idx}`;
      }

      // Add "Why Human Essential:" if within reasonCount
      if (humanIndex < reasonCount) {
        reason = `<br><strong>Why Human Essential:</strong> Requires human intuition for subjective evaluation`;
      }

      humanIndex++;
    } else {
      description = `Send API request ${idx}; confirm response matches expected schema`;
    }

    rows.push(`<tr class="priority-${priority} ${automationType}"><td>${testId}</td><td>${description}${reason}</td></tr>`);
  };

  // Distribute human tests across priority levels that have tests
  // Calculate how many human tests can fit in each priority
  let remainingHuman = humanCount;
  const humanP0 = Math.min(p0Count, remainingHuman);
  remainingHuman -= humanP0;
  const humanP1 = Math.min(p1Count, remainingHuman);
  remainingHuman -= humanP1;
  const humanP2 = Math.min(p2Count, remainingHuman);

  let testIndex = 0;

  // Generate P0 tests
  for (let i = 0; i < p0Count; i++) {
    const isHuman = i < humanP0;
    const testId = `TC-AUTH-${String(testIndex++).padStart(8, '0')}`;
    addTest(testId, 'p0', isHuman, i);
  }

  // Generate P1 tests
  for (let i = 0; i < p1Count; i++) {
    const isHuman = i < humanP1;
    const testId = `TC-AUTH-${String(testIndex++).padStart(8, '0')}`;
    addTest(testId, 'p1', isHuman, i);
  }

  // Generate P2 tests
  for (let i = 0; i < p2Count; i++) {
    const isHuman = i < humanP2;
    const testId = `TC-AUTH-${String(testIndex++).padStart(8, '0')}`;
    addTest(testId, 'p2', isHuman, i);
  }

  // Generate P3 tests (never human)
  for (let i = 0; i < p3Count; i++) {
    const testId = `TC-AUTH-${String(testIndex++).padStart(8, '0')}`;
    rows.push(`<tr class="priority-p3 automation-automated"><td>${testId}</td><td>Check minor UI element ${i}</td></tr>`);
  }

  // Add "Verify" patterns if specified (these fail Gate 7)
  for (let i = 0; i < verifyPatterns; i++) {
    const testId = `TC-VRFY-${String(i).padStart(8, '0')}`;
    rows.push(`<tr class="priority-p2 automation-automated"><td>${testId}</td><td>Verify login works correctly</td></tr>`);
  }

  return `<!DOCTYPE html>
<html>
<head><title>SFDIPOT Assessment</title></head>
<body>
<h1>Product Factors Assessment</h1>
<table>
<thead><tr><th>Test ID</th><th>Test Idea</th></tr></thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</body>
</html>`;
}

/**
 * Run the validation script and capture output
 */
function runValidation(filePath: string): { exitCode: number; output: string } {
  try {
    const output = execSync(`npx tsx ${SCRIPT_PATH} "${filePath}"`, {
      cwd: join(__dirname, '../../..'),
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { exitCode: 0, output };
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: execError.status ?? 1,
      output: (execError.stdout || '') + (execError.stderr || ''),
    };
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('SFDIPOT Assessment Validator', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('Gate 6: Minimum Test Count', () => {
    it('should pass with exactly 50 tests', () => {
      const html = generateTestAssessment({ testCount: 50 });
      const filePath = join(TEST_DIR, 'gate6-50-tests.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('ALL HARD GATES PASSED');
    });

    it('should pass with more than 50 tests', () => {
      const html = generateTestAssessment({ testCount: 100 });
      const filePath = join(TEST_DIR, 'gate6-100-tests.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should fail with fewer than 50 tests', () => {
      const html = generateTestAssessment({ testCount: 30 });
      const filePath = join(TEST_DIR, 'gate6-30-tests.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Gate 6');
      expect(result.output).toContain('FAIL');
    });
  });

  describe('Gate 5: Human Tests >= 10%', () => {
    it('should pass with exactly 10% human tests', () => {
      const html = generateTestAssessment({ testCount: 100, humanPercent: 10 });
      const filePath = join(TEST_DIR, 'gate5-10-percent.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should pass with more than 10% human tests', () => {
      const html = generateTestAssessment({ testCount: 100, humanPercent: 20 });
      const filePath = join(TEST_DIR, 'gate5-20-percent.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should fail with fewer than 10% human tests', () => {
      const html = generateTestAssessment({ testCount: 100, humanPercent: 5 });
      const filePath = join(TEST_DIR, 'gate5-5-percent.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Gate 5');
      expect(result.output).toContain('FAIL');
    });
  });

  describe('Gate 7: No "Verify X" Patterns', () => {
    it('should pass with zero "Verify" patterns', () => {
      const html = generateTestAssessment({ testCount: 50, verifyPatterns: 0 });
      const filePath = join(TEST_DIR, 'gate7-no-verify.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should fail with "Verify" patterns present', () => {
      const html = generateTestAssessment({ testCount: 50, verifyPatterns: 5 });
      const filePath = join(TEST_DIR, 'gate7-with-verify.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Gate 7');
      expect(result.output).toContain('FAIL');
      expect(result.output).toContain('Verify');
    });
  });

  describe('Gate 10a: Human Tests Have Reasoning', () => {
    it('should pass when 90%+ human tests have "Why Human Essential"', () => {
      const humanCount = 15; // 15% of 100
      const html = generateTestAssessment({
        testCount: 100,
        humanPercent: 15,
        humanWithReason: Math.ceil(humanCount * 0.9), // 90%+
      });
      const filePath = join(TEST_DIR, 'gate10a-pass.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should fail when <90% human tests have reasoning', () => {
      const humanCount = 20; // 20% of 100
      const html = generateTestAssessment({
        testCount: 100,
        humanPercent: 20,
        humanWithReason: Math.floor(humanCount * 0.5), // Only 50%
      });
      const filePath = join(TEST_DIR, 'gate10a-fail.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Gate 10a');
    });
  });

  describe('Gate 10b: Human Tests Use "Explore/Assess" Format', () => {
    it('should pass when 80%+ human tests use "Explore X; assess Y"', () => {
      const humanCount = 15;
      const html = generateTestAssessment({
        testCount: 100,
        humanPercent: 15,
        humanWithExplore: Math.ceil(humanCount * 0.8), // 80%+
      });
      const filePath = join(TEST_DIR, 'gate10b-pass.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
    });

    it('should fail when <80% human tests use explore format', () => {
      const humanCount = 20;
      const html = generateTestAssessment({
        testCount: 100,
        humanPercent: 20,
        humanWithExplore: Math.floor(humanCount * 0.3), // Only 30%
      });
      const filePath = join(TEST_DIR, 'gate10b-fail.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Gate 10b');
    });
  });

  describe('Soft Gates (Informational)', () => {
    it('should always pass soft gates regardless of priority distribution', () => {
      // Extreme priority distribution (all P0)
      const html = generateTestAssessment({
        testCount: 50,
        p0Percent: 100,
        p1Percent: 0,
        p2Percent: 0,
        p3Percent: 0,
      });
      const filePath = join(TEST_DIR, 'soft-gates-extreme.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      // Should pass (soft gates don't fail)
      expect(result.exitCode).toBe(0);
      // Should show informational messages
      expect(result.output).toContain('INFO');
      expect(result.output).toContain('Domain expert should validate');
    });
  });

  describe('Full Validation Pass', () => {
    it('should pass all gates with well-formed assessment', () => {
      const html = generateTestAssessment({
        testCount: 100,
        p0Percent: 10,
        p1Percent: 30,
        p2Percent: 40,
        p3Percent: 20,
        humanPercent: 15,
        verifyPatterns: 0,
      });
      const filePath = join(TEST_DIR, 'full-pass.html');
      writeFileSync(filePath, html);

      const result = runValidation(filePath);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('ALL HARD GATES PASSED');
    });
  });

  describe('Error Handling', () => {
    it('should fail gracefully for non-existent file', () => {
      const result = runValidation('/nonexistent/path.html');
      expect(result.exitCode).toBe(1);
    });
  });
});
