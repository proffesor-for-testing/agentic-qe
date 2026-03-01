/**
 * Agentic QE v3 - Coverage Parser Tests
 *
 * Tests for LCOV and JSON coverage parsing, auto-detection, gap extraction,
 * and helper functions (ranges, severity calculation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseLCOVContent,
  extractGaps,
  type CoverageReport,
} from '../../../../src/domains/coverage-analysis/services/coverage-parser';

// ---------------------------------------------------------------------------
// LCOV test fixtures
// ---------------------------------------------------------------------------

const MINIMAL_LCOV = `SF:/project/src/hello.ts
FN:1,hello
FNDA:1,hello
FNF:1
FNH:1
DA:1,1
DA:2,1
DA:3,0
LF:3
LH:2
BRF:0
BRH:0
end_of_record
`;

const MULTI_FILE_LCOV = `SF:/project/src/a.ts
DA:1,1
DA:2,0
LF:2
LH:1
FN:1,fnA
FNDA:1,fnA
FNF:1
FNH:1
BRF:0
BRH:0
end_of_record
SF:/project/src/b.ts
DA:1,1
DA:2,1
DA:3,1
LF:3
LH:3
FN:1,fnB
FNDA:0,fnB
FNF:1
FNH:0
BRF:0
BRH:0
end_of_record
`;

const BRANCH_LCOV = `SF:/project/src/branch.ts
DA:1,1
DA:2,1
DA:3,0
DA:4,1
LF:4
LH:3
BRDA:2,0,0,1
BRDA:2,0,1,0
BRDA:4,1,0,1
BRDA:4,1,1,-
BRF:4
BRH:2
FN:1,main
FNDA:1,main
FNF:1
FNH:1
end_of_record
`;

const EMPTY_LCOV = '';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Coverage Parser', () => {

  // =========================================================================
  // parseLCOVContent
  // =========================================================================

  describe('parseLCOVContent', () => {
    it('should parse a minimal LCOV file with one source file', () => {
      // Arrange & Act
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');

      // Assert
      expect(report.format).toBe('lcov');
      expect(report.files.size).toBe(1);
      const file = report.files.get('/project/src/hello.ts');
      expect(file).toBeDefined();
      expect(file!.lines.total).toBe(3);
      expect(file!.lines.covered).toBe(2);
      expect(file!.lines.percentage).toBeCloseTo(66.67, 0);
      expect(file!.lines.uncoveredLines).toEqual([3]);
    });

    it('should parse multiple source files', () => {
      // Arrange & Act
      const report = parseLCOVContent(MULTI_FILE_LCOV, '/project');

      // Assert
      expect(report.files.size).toBe(2);
      expect(report.files.has('/project/src/a.ts')).toBe(true);
      expect(report.files.has('/project/src/b.ts')).toBe(true);
    });

    it('should compute relative paths from project root', () => {
      // Arrange & Act
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');
      const file = report.files.get('/project/src/hello.ts');

      // Assert
      expect(file!.relativePath).toBe('src/hello.ts');
    });

    it('should parse branch coverage data correctly', () => {
      // Arrange & Act
      const report = parseLCOVContent(BRANCH_LCOV, '/project');
      const file = report.files.get('/project/src/branch.ts');

      // Assert
      expect(file).toBeDefined();
      expect(file!.branches.total).toBe(4);
      expect(file!.branches.covered).toBe(2);
      expect(file!.branches.percentage).toBeCloseTo(50, 1);
      expect(file!.branches.uncoveredBranches).toHaveLength(2);
    });

    it('should handle BRDA with dash (not taken)', () => {
      // Arrange & Act
      const report = parseLCOVContent(BRANCH_LCOV, '/project');
      const file = report.files.get('/project/src/branch.ts');
      const untaken = file!.branches.uncoveredBranches.filter((b) => !b.taken);

      // Assert
      expect(untaken.length).toBe(2);
      expect(untaken.some((b) => b.hits === 0)).toBe(true);
    });

    it('should parse function coverage', () => {
      // Arrange & Act
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');
      const file = report.files.get('/project/src/hello.ts');

      // Assert
      expect(file!.functions.total).toBe(1);
      expect(file!.functions.covered).toBe(1);
      expect(file!.functions.percentage).toBe(100);
      expect(file!.functions.details[0].name).toBe('hello');
    });

    it('should identify uncovered functions', () => {
      // Arrange & Act
      const report = parseLCOVContent(MULTI_FILE_LCOV, '/project');
      const fileB = report.files.get('/project/src/b.ts');

      // Assert
      expect(fileB!.functions.uncoveredFunctions).toContain('fnB');
    });

    it('should return empty report for empty LCOV content', () => {
      // Arrange & Act
      const report = parseLCOVContent(EMPTY_LCOV, '/project');

      // Assert
      expect(report.files.size).toBe(0);
      expect(report.summary.totalFiles).toBe(0);
      expect(report.summary.lines.total).toBe(0);
    });

    it('should generate a valid timestamp', () => {
      // Arrange & Act
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');

      // Assert
      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it('should compute overall coverage percentage with line and branch weighting', () => {
      // Arrange & Act
      const report = parseLCOVContent(BRANCH_LCOV, '/project');
      const file = report.files.get('/project/src/branch.ts');

      // Assert - coveragePercentage is 70% lines * 0.7 + 50% branches * 0.3 = 52.5 + 15 = 67.5
      // lines: 3/4 = 75%, branches: 2/4 = 50% => 75*0.7 + 50*0.3 = 52.5 + 15 = 67.5
      expect(file!.coveragePercentage).toBeCloseTo(67.5, 0);
    });
  });

  // =========================================================================
  // Summary calculation
  // =========================================================================

  describe('summary calculation', () => {
    it('should aggregate totals across all files', () => {
      // Arrange & Act
      const report = parseLCOVContent(MULTI_FILE_LCOV, '/project');

      // Assert
      expect(report.summary.totalFiles).toBe(2);
      expect(report.summary.lines.total).toBe(5);   // 2 + 3
      expect(report.summary.lines.covered).toBe(4);  // 1 + 3
    });

    it('should calculate percentage correctly in summary', () => {
      // Arrange & Act
      const report = parseLCOVContent(MULTI_FILE_LCOV, '/project');

      // Assert
      expect(report.summary.lines.percentage).toBeCloseTo(80, 0); // 4/5
    });
  });

  // =========================================================================
  // extractGaps
  // =========================================================================

  describe('extractGaps', () => {
    it('should extract line gaps from uncovered lines', () => {
      // Arrange
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      const lineGaps = gaps.filter((g) => g.type === 'line');
      expect(lineGaps.length).toBeGreaterThan(0);
      expect(lineGaps[0].location.lines).toContain(3);
    });

    it('should extract branch gaps from uncovered branches', () => {
      // Arrange
      const report = parseLCOVContent(BRANCH_LCOV, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      const branchGaps = gaps.filter((g) => g.type === 'branch');
      expect(branchGaps.length).toBe(2);
      expect(branchGaps[0].severity).toBe('medium');
    });

    it('should extract function gaps from uncovered functions', () => {
      // Arrange
      const report = parseLCOVContent(MULTI_FILE_LCOV, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      const fnGaps = gaps.filter((g) => g.type === 'function');
      expect(fnGaps.length).toBe(1);
      expect(fnGaps[0].location.function).toBe('fnB');
      expect(fnGaps[0].severity).toBe('high');
    });

    it('should sort gaps by severity (critical first)', () => {
      // Arrange
      const report = parseLCOVContent(BRANCH_LCOV, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < gaps.length; i++) {
        const prevSev = severityOrder[gaps[i - 1].severity as keyof typeof severityOrder] ?? 4;
        const currSev = severityOrder[gaps[i].severity as keyof typeof severityOrder] ?? 4;
        expect(prevSev).toBeLessThanOrEqual(currSev);
      }
    });

    it('should return empty array for fully covered report', () => {
      // Arrange
      const lcov = `SF:/project/src/full.ts
DA:1,1
DA:2,1
LF:2
LH:2
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;
      const report = parseLCOVContent(lcov, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      expect(gaps).toHaveLength(0);
    });

    it('should group consecutive uncovered lines into ranges', () => {
      // Arrange
      const lcov = `SF:/project/src/range.ts
DA:1,1
DA:2,0
DA:3,0
DA:4,0
DA:5,1
DA:6,0
LF:6
LH:2
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;
      const report = parseLCOVContent(lcov, '/project');

      // Act
      const gaps = extractGaps(report);
      const lineGaps = gaps.filter((g) => g.type === 'line');

      // Assert - should group [2,3,4] and [6] as two separate ranges
      expect(lineGaps.length).toBe(2);
      expect(lineGaps[0].location.lines).toEqual([2, 3, 4]);
      expect(lineGaps[1].location.lines).toEqual([6]);
    });

    it('should generate correct suggestion text', () => {
      // Arrange
      const report = parseLCOVContent(MINIMAL_LCOV, '/project');

      // Act
      const gaps = extractGaps(report);
      const lineGap = gaps.find((g) => g.type === 'line');

      // Assert
      expect(lineGap).toBeDefined();
      expect(lineGap!.suggestion).toContain('Add tests covering lines');
    });

    it('should assign critical severity for large uncovered ranges', () => {
      // Arrange - generate a file with 60 uncovered lines out of 100
      const daLines = Array.from({ length: 100 }, (_, i) => {
        const hit = i < 40 ? 1 : 0;
        return `DA:${i + 1},${hit}`;
      }).join('\n');
      const lcov = `SF:/project/src/large.ts
${daLines}
LF:100
LH:40
FNF:0
FNH:0
BRF:0
BRH:0
end_of_record
`;
      const report = parseLCOVContent(lcov, '/project');

      // Act
      const gaps = extractGaps(report);

      // Assert
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');
      expect(criticalGaps.length).toBeGreaterThan(0);
    });
  });
});
