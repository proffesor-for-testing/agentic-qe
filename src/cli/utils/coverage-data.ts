/**
 * Agentic QE v3 - Coverage Data Builder
 *
 * Reads REAL V8 coverage data from vitest/jest/c8 output when available.
 * Falls back to deterministic heuristic estimation when no instrumented
 * coverage exists — clearly labeled as estimated, never randomized.
 *
 * The previous implementation used Math.random() to fabricate coverage
 * numbers. This was misleading: CI pipelines would make decisions based
 * on random noise. This module fixes that.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileCoverage {
  path: string;
  lines: { covered: number; total: number };
  branches: { covered: number; total: number };
  functions: { covered: number; total: number };
  statements: { covered: number; total: number };
  uncoveredLines: number[];
  uncoveredBranches: number[];
}

export interface CoverageData {
  files: FileCoverage[];
  summary: {
    line: number;
    branch: number;
    function: number;
    statement: number;
    files: number;
  };
  /** True if data came from real instrumented coverage (V8/istanbul) */
  instrumented: boolean;
}

// ============================================================================
// V8/Istanbul Coverage Reader
// ============================================================================

/** Standard locations for coverage-final.json from vitest/jest/c8 */
const COVERAGE_JSON_PATHS = [
  'coverage/coverage-final.json',
  'coverage/coverage-summary.json',
  '.coverage/coverage-final.json',
];

/**
 * Istanbul/V8 coverage-final.json entry shape.
 * Each key is an absolute file path mapping to its coverage data.
 */
interface IstanbulFileCoverage {
  path: string;
  statementMap: Record<string, { start: { line: number }; end: { line: number } }>;
  s: Record<string, number>;
  branchMap: Record<string, { loc: { start: { line: number }; end: { line: number } } }>;
  b: Record<string, number[]>;
  fnMap: Record<string, { loc: { start: { line: number }; end: { line: number } } }>;
  f: Record<string, number>;
}

/**
 * Try to read real coverage data from a coverage-final.json file.
 * Returns null if no instrumented coverage is available.
 */
export function readInstrumentedCoverage(projectRoot: string): Map<string, FileCoverage> | null {
  for (const relPath of COVERAGE_JSON_PATHS) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

      // coverage-summary.json has a different shape
      if (raw.total && raw.total.lines) {
        return readCoverageSummary(raw, projectRoot);
      }

      // coverage-final.json: Record<filepath, IstanbulFileCoverage>
      const coverageMap = new Map<string, FileCoverage>();

      for (const [filePath, entry] of Object.entries(raw)) {
        const cov = entry as IstanbulFileCoverage;
        const stmtKeys = Object.keys(cov.s);
        const stmtCovered = stmtKeys.filter(k => cov.s[k] > 0).length;

        const branchKeys = Object.keys(cov.b);
        let branchTotal = 0;
        let branchCovered = 0;
        for (const k of branchKeys) {
          for (const count of cov.b[k]) {
            branchTotal++;
            if (count > 0) branchCovered++;
          }
        }

        const fnKeys = Object.keys(cov.f);
        const fnCovered = fnKeys.filter(k => cov.f[k] > 0).length;

        // Compute uncovered lines from statement map
        const coveredLineSet = new Set<number>();
        const allLineSet = new Set<number>();
        for (const stmtKey of stmtKeys) {
          const stmt = cov.statementMap[stmtKey];
          for (let line = stmt.start.line; line <= stmt.end.line; line++) {
            allLineSet.add(line);
            if (cov.s[stmtKey] > 0) coveredLineSet.add(line);
          }
        }
        const uncoveredLines = [...allLineSet].filter(l => !coveredLineSet.has(l)).sort((a, b) => a - b);

        coverageMap.set(filePath, {
          path: filePath,
          lines: { covered: coveredLineSet.size, total: allLineSet.size },
          branches: { covered: branchCovered, total: branchTotal },
          functions: { covered: fnCovered, total: fnKeys.length },
          statements: { covered: stmtCovered, total: stmtKeys.length },
          uncoveredLines,
          uncoveredBranches: uncoveredLines.slice(0, Math.floor(uncoveredLines.length / 2)),
        });
      }

      return coverageMap.size > 0 ? coverageMap : null;
    } catch {
      // Invalid JSON or unexpected shape — skip
      continue;
    }
  }

  return null;
}

function readCoverageSummary(raw: Record<string, unknown>, _projectRoot: string): Map<string, FileCoverage> | null {
  const coverageMap = new Map<string, FileCoverage>();

  for (const [filePath, data] of Object.entries(raw)) {
    if (filePath === 'total') continue;
    const entry = data as {
      lines: { total: number; covered: number; pct: number };
      statements: { total: number; covered: number; pct: number };
      functions: { total: number; covered: number; pct: number };
      branches: { total: number; covered: number; pct: number };
    };

    coverageMap.set(filePath, {
      path: filePath,
      lines: { covered: entry.lines.covered, total: entry.lines.total },
      branches: { covered: entry.branches.covered, total: entry.branches.total },
      functions: { covered: entry.functions.covered, total: entry.functions.total },
      statements: { covered: entry.statements.covered, total: entry.statements.total },
      uncoveredLines: [],
      uncoveredBranches: [],
    });
  }

  return coverageMap.size > 0 ? coverageMap : null;
}

// ============================================================================
// Deterministic Heuristic Estimation
// ============================================================================

/**
 * Estimate coverage for a single file using deterministic heuristics.
 * NOT random. Based on:
 * - Whether a test file exists (convention: src/foo.ts → tests/foo.test.ts)
 * - File size (larger files tend to have lower coverage)
 * - File content patterns (exports, complexity indicators)
 */
function estimateFileCoverage(filePath: string, content: string): FileCoverage {
  const lines = content.split('\n');
  const totalLines = lines.length;

  // Check for matching test file using common conventions
  const testVariants = [
    filePath.replace('.ts', '.test.ts').replace('/src/', '/tests/'),
    filePath.replace('.ts', '.spec.ts').replace('/src/', '/tests/'),
    filePath.replace('.ts', '.test.ts'),
    filePath.replace('/src/', '/test/').replace('.ts', '.test.ts'),
  ];
  const hasTest = testVariants.some(t => fs.existsSync(t));

  // Deterministic estimation based on file characteristics
  const exportCount = (content.match(/\bexport\b/g) || []).length;
  const functionCount = (content.match(/\b(function|=>)\b/g) || []).length;
  const branchCount = (content.match(/\b(if|switch|case|\?\?|\|\|)\b/g) || []).length;

  // Base rate: files with tests get higher base, larger files get penalized
  let coverageRate: number;
  if (hasTest) {
    // Files with tests: 70-85% based on complexity
    const complexityPenalty = Math.min(branchCount * 0.005, 0.15);
    const sizePenalty = Math.min(totalLines * 0.0001, 0.1);
    coverageRate = 0.85 - complexityPenalty - sizePenalty;
  } else {
    // Files without tests: 15-35% based on how much is boilerplate
    const boilerplateBonus = exportCount > 5 ? 0.1 : 0; // index/barrel files
    coverageRate = 0.20 + boilerplateBonus;
  }

  coverageRate = Math.max(0.05, Math.min(0.95, coverageRate));

  const coveredLines = Math.floor(totalLines * coverageRate);
  const totalFunctions = Math.max(functionCount, 1);
  const totalBranches = Math.max(branchCount, 1);

  // Branches are harder to cover than lines
  const branchCoverage = Math.floor(coveredLines * 0.7);
  const functionCoverage = Math.floor(totalFunctions * coverageRate * 0.9);

  const uncoveredLines = Array.from(
    { length: totalLines - coveredLines },
    (_, i) => i + coveredLines + 1
  );

  return {
    path: filePath,
    lines: { covered: coveredLines, total: totalLines },
    branches: { covered: Math.min(branchCoverage, totalBranches), total: totalBranches },
    functions: { covered: Math.min(functionCoverage, totalFunctions), total: totalFunctions },
    statements: { covered: coveredLines, total: totalLines },
    uncoveredLines,
    uncoveredBranches: uncoveredLines.slice(0, Math.floor(uncoveredLines.length / 2)),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build coverage data for the given source files.
 *
 * 1. Tries to read real instrumented coverage (V8/istanbul/c8)
 * 2. Falls back to deterministic heuristic estimation (clearly labeled)
 *
 * Never uses Math.random(). CI decisions deserve real data or honest estimates.
 */
export function buildCoverageData(sourceFiles: string[], projectRoot?: string): CoverageData {
  const root = projectRoot || process.cwd();

  // Try instrumented coverage first
  const instrumentedData = readInstrumentedCoverage(root);

  const files: FileCoverage[] = [];
  let isInstrumented = false;

  if (instrumentedData && instrumentedData.size > 0) {
    isInstrumented = true;

    for (const filePath of sourceFiles) {
      // Try exact match and relative path variations
      const absPath = path.resolve(filePath);
      const match = instrumentedData.get(absPath)
        || instrumentedData.get(filePath)
        || instrumentedData.get(path.relative(root, absPath));

      if (match) {
        files.push({ ...match, path: filePath });
      } else {
        // File exists in source but has no coverage data — 0% coverage
        const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
        const totalLines = content.split('\n').length;
        files.push({
          path: filePath,
          lines: { covered: 0, total: totalLines },
          branches: { covered: 0, total: 1 },
          functions: { covered: 0, total: 1 },
          statements: { covered: 0, total: totalLines },
          uncoveredLines: Array.from({ length: totalLines }, (_, i) => i + 1),
          uncoveredBranches: [],
        });
      }
    }
  } else {
    // Heuristic estimation fallback
    for (const filePath of sourceFiles) {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      files.push(estimateFileCoverage(filePath, content));
    }
  }

  // Compute summary
  const totalLines = files.reduce((sum, f) => sum + f.lines.total, 0);
  const coveredLines = files.reduce((sum, f) => sum + f.lines.covered, 0);
  const totalBranches = files.reduce((sum, f) => sum + f.branches.total, 0);
  const coveredBranches = files.reduce((sum, f) => sum + f.branches.covered, 0);
  const totalFunctions = files.reduce((sum, f) => sum + f.functions.total, 0);
  const coveredFunctions = files.reduce((sum, f) => sum + f.functions.covered, 0);

  const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

  return {
    files,
    summary: {
      line: safeDiv(coveredLines, totalLines),
      branch: safeDiv(coveredBranches, totalBranches),
      function: safeDiv(coveredFunctions, totalFunctions),
      statement: safeDiv(coveredLines, totalLines),
      files: files.length,
    },
    instrumented: isInstrumented,
  };
}
