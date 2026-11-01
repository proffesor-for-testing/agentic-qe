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
import { parseCoverageJson } from '../../coordination/handlers/handler-utils.js';
import { readConfinedTextSync } from '../../shared/io/confined-read.js';

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
  /**
   * Source files the instrumented report has no entry for (#995). These are
   * UNMEASURED — excluded from the figures rather than counted as 0%.
   */
  unmeasuredFiles?: string[];
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
 * Try to read real coverage data from a coverage-final.json file.
 * Returns null if no instrumented coverage is available.
 *
 * #1012: per-file figures come from the shared istanbul parser, so the CLI
 * and MCP compute "line" coverage the same way (source lines, not statements).
 */
export function readInstrumentedCoverage(projectRoot: string): Map<string, FileCoverage> | null {
  for (const relPath of COVERAGE_JSON_PATHS) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      // #1186: a confined read, as the report resolver does. A plain
      // readFileSync blocks forever on a FIFO and follows a report linked out
      // of the project; both are refused here and skipped.
      const content = readConfinedTextSync(fullPath, { projectRoot, outsideRoot: 'allow' });
      const raw = JSON.parse(content);

      // coverage-summary.json has a different shape
      if (raw.total && raw.total.lines) {
        return readCoverageSummary(raw, projectRoot);
      }

      // coverage-final.json: Record<filepath, IstanbulFileCoverage>
      const coverageMap = new Map<string, FileCoverage>();
      for (const file of parseCoverageJson(content).files) {
        coverageMap.set(file.path, file);
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

/** Aggregate per-file coverage into whole-number percentages. */
export function summarizeCoverage(files: FileCoverage[]): CoverageData['summary'] {
  const sum = (pick: (f: FileCoverage) => number) => files.reduce((acc, f) => acc + pick(f), 0);
  const safeDiv = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;
  const totalLines = sum(f => f.lines.total);
  const coveredLines = sum(f => f.lines.covered);
  // #1012: statements are statements. A report without statement detail
  // (lcov) carries its line figures in `statements`, so this falls back alike.
  const totalStatements = sum(f => f.statements.total);

  return {
    line: safeDiv(coveredLines, totalLines),
    branch: safeDiv(sum(f => f.branches.covered), sum(f => f.branches.total)),
    function: safeDiv(sum(f => f.functions.covered), sum(f => f.functions.total)),
    statement: totalStatements > 0
      ? safeDiv(sum(f => f.statements.covered), totalStatements)
      : safeDiv(coveredLines, totalLines),
    files: files.length,
  };
}

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
  const unmeasuredFiles: string[] = [];
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
        // #995: the report has no entry for this file — the coverage run did
        // not measure it. That is "unmeasured", not 0%: counting it as fully
        // uncovered invented a figure nobody measured.
        unmeasuredFiles.push(filePath);
      }
    }
  } else {
    // Heuristic estimation fallback
    for (const filePath of sourceFiles) {
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
      files.push(estimateFileCoverage(filePath, content));
    }
  }

  return {
    files,
    summary: summarizeCoverage(files),
    instrumented: isInstrumented,
    ...(unmeasuredFiles.length > 0 ? { unmeasuredFiles } : {}),
  };
}
